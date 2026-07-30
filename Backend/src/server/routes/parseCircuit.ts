import { FastifyRequest, FastifyReply } from 'fastify';
import { ProjectLoader } from '../../core/project/loadProject.js';
import { IncludeResolver } from '../../core/resolver/includeResolver.js';
import { DependencyGraph } from '../../core/resolver/dependencyGraph.js';
import { collectDirectComponents } from '../../core/parser/componentCollector.js';
import { ErrorCollector } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { parse_circuit_request, parse_circuit_response, FileSummary, ParseMessage } from '../../types/circuitParser.js';
import { startParseCompilation } from '../compilations/parseCompilation.js';

import { writeFile, appendFile, mkdir, readdir } from 'fs/promises';
import { spawn } from 'child_process';
import { join, sep, dirname, resolve } from 'path';

export async function parseCircuitHandler(
  request: FastifyRequest<{ Body: parse_circuit_request }>,
  reply: FastifyReply
) {
  try {
    const { repo, entry, rootComponent = 'main', rootArguments = [] } = request.body;
    const startedAt = Date.now();

    logger.info(`Parsing circuit: repo=${repo}, entry=${entry}, rootComponent=${rootComponent}`);

    const errorCollector = new ErrorCollector();
    const projectLoader = new ProjectLoader();
    const includeResolver = new IncludeResolver(errorCollector);
    const dependencyGraph = new DependencyGraph(errorCollector);

    // Entrance
    // Load the entry file
    const loadResult = await projectLoader.loadProject({
      repoName: repo,
      entryPath: entry,
      rootComponent,
      basePath: ''
    });

    if (loadResult.error) {
      return reply.code(400).send({
        error: loadResult.error,
        errors: [{ level: 'error', message: loadResult.error }]
      });
    }

    const entryFile = loadResult.entryFile;
    const repoPath = loadResult.repoPath;

    if (repoPath) {
      includeResolver.setCurrentRepoPath(repoPath);
    }
    includeResolver.setCurrentFile(entryFile.path);

    const parsedFiles = new Map<string, any>();
    const filesToProcess = [entryFile];
    const processedPaths = new Set<string>();

    // Recursively parse all files
    while (filesToProcess.length > 0) {
      const currentFile = filesToProcess.shift()!;
      const normalizedPath = currentFile.path.replace(/\\/g, '/');

      if (processedPaths.has(normalizedPath)) {
        continue;
      }

      processedPaths.add(normalizedPath);

      // read file content and parse
      try {
        const parsedFile = await projectLoader.parseFile(currentFile.path);
        parsedFiles.set(normalizedPath, parsedFile);

        dependencyGraph.addFile(normalizedPath);

        // Recursive parsing include files
        for (const include of parsedFile.includes) {
          includeResolver.setCurrentFile(normalizedPath);
          const resolvedPath = await includeResolver.resolveInclude(include);

          if (resolvedPath) {
            const normalizedIncludePath = resolvedPath.replace(/\\/g, '/');
            dependencyGraph.addDependency(normalizedPath, normalizedIncludePath);
            if (!processedPaths.has(normalizedIncludePath)) {
              const content = await (await import('fs/promises')).readFile(resolvedPath, 'utf-8');
              filesToProcess.push({
                path: resolvedPath,
                content,
                relativePath: include.path
              });
            }
          } else {
            logger.warn(`Failed to resolve include: ${include.path}`);
          }
        }
      } catch (error: any) {
        logger.warn(`Skipped unreadable circuit file: path=${normalizedPath}, error=${error.message}`);
        errorCollector.error(`Failed to parse file: ${error.message}`, currentFile.path);
      }
    }

    const sortedFiles = dependencyGraph.topologicalSort();

    const fileSummaries: FileSummary[] = [];
    for (const filePath of sortedFiles) {
      const parsedFile = parsedFiles.get(filePath);
      if (parsedFile) {
        const includes: string[] = parsedFile.includes.map((inc: any) => inc.path);
        const displayId = generateDisplayId(filePath, repo);
        fileSummaries.push({
          id: filePath,
          path: filePath,
          displayId,
          includes
        });
      }
    }

    const rootTemplate = findTemplate(parsedFiles, rootComponent);
    if (!rootTemplate) {
      const allTemplates: string[] = [];
      for (const [path, file] of parsedFiles.entries()) {
        for (const template of file.templates) {
          allTemplates.push(`${path}: ${template.name}`);
        }
        for (const component of file.components) {
          allTemplates.push(`${path}: component ${component.name} = ${component.templateName}`);
        }
      }
      const rootError = `Requested root component '${rootComponent}' was not found. Available templates/components: ${allTemplates.join('; ') || '(none)'}`;
      return reply.code(400).send({
        error: rootError,
        errors: [{ level: 'error', message: rootError }],
        repo,
        entry,
        files: fileSummaries,
        tree: null,
      });
    }
    const tree = buildTemplateTree(rootTemplate, parsedFiles, dependencyGraph);
    
    const errors: ParseMessage[] = errorCollector.getAll()
      .filter(err => err.level === 'error' || err.level === 'warning')
      .map(err => ({
        level: err.level as 'error' | 'warning',
        file: err.file,
        message: err.message
      }));

    const totalTemplates = Array.from(parsedFiles.values()).reduce(
      (sum: number, file: any) => sum + file.templates.length,
      0
    );

    const totalInstances = Array.from(parsedFiles.values()).reduce(
      (sum: number, file: any) => sum + file.components.length,
      0
    );

    const maxDepth = dependencyGraph.getMaxDepth();

    const response: parse_circuit_response = {
      repo,
      entry,
      files: fileSummaries,
      tree,
      errors,
      statistics: {
        totalFiles: fileSummaries.length,
        totalTemplates,
        totalInstances,
        maxDepth
      },
      compilation: await startParseCompilation({
        repo,
        entry,
        rootComponent,
        rootArguments,
        entryFilePath: entryFile.path,
        repoPath: repoPath!,
        hasMainComponent: parsedFiles.get(entryFile.path.replace(/\\/g, '/'))?.components
          .some((component: any) => component.name === 'main') ?? false,
        tree,
        templates: Array.from(parsedFiles.values()).flatMap((file: any) =>
          file.templates.map((template: any) => ({
            name: template.name,
            sourceFile: template.sourceFile,
            line: template.line,
          }))
        ),
      })
    };

    logger.info(`Circuit parsed: root=${rootComponent}, files=${fileSummaries.length}, templates=${totalTemplates}, durationMs=${Date.now() - startedAt}`);
    reply.send(response); // Return parsing results to Frontend

  } catch (error: any) {
    logger.error(`Error parsing circuit: ${error.message}`);
    reply.code(500).send({
      error: 'Internal server error',
      errors: [{ level: 'error', message: error.message }]
    });
  }
}

function findTemplate(parsedFiles: Map<string, any>, name: string): any | null {
  if (!name || name === undefined || name === null) {
    return null;
  }
  
  for (const [filePath, file] of parsedFiles.entries()) {
    // logger.info(`Checking file: ${filePath}, templates: ${file.templates.length}, components: ${file.components.length}`);
    
    // First try to find a template with this name
    const template = file.templates.find((t: any) => t.name === name);
    if (template) {
      return template;
    }

    // If not found as template, try to find a component instantiation
    const component = file.components.find((c: any) => c.name === name);
    if (component) {
      return component;
    }
  }

  return null;
}

function generateDisplayId(filePath: string, repo: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // Handle node_modules packages (e.g., @zk-email)
  const nodeModulesMatch = normalizedPath.match(/\/node_modules\/([^\/]+)/);
  if (nodeModulesMatch) {
    const packageName = nodeModulesMatch[1];
    const packagePathIndex = normalizedPath.indexOf('/node_modules/' + packageName);
    const relativePath = normalizedPath.substring(packagePathIndex + nodeModulesMatch[0].length);
    return `${packageName}:${relativePath.replace(/^\//, '')}`;
  }
  
  // Handle circomlib
  if (normalizedPath.includes('/circomlib/')) {
    const circomlibIndex = normalizedPath.indexOf('/circomlib/');
    const relativePath = normalizedPath.substring(circomlibIndex + '/circomlib/'.length);
    return `circomlib:${relativePath}`;
  }
  
  // Handle repo-based files
  if (normalizedPath.includes(repo)) {
    const repoIndex = normalizedPath.indexOf(repo);
    const relativePath = normalizedPath.substring(repoIndex + repo.length + 1);
    return `${repo}:${relativePath}`;
  }
  
  // Fallback: try to find a reasonable directory name
  const parts = normalizedPath.split('/');
  const submodulesIndex = parts.findIndex(p => p === 'submodules');
  if (submodulesIndex >= 0 && submodulesIndex + 1 < parts.length) {
    const moduleName = parts[submodulesIndex + 1];
    const relativePath = parts.slice(submodulesIndex + 2).join('/');
    return `${moduleName}:${relativePath}`;
  }
  
  // Final fallback: use filename
  return normalizedPath.split('/').pop() || normalizedPath;
}

function templateIdentity(template: any): string {
  return `${template.sourceFile || 'unknown'}::${template.name || template.templateName}`;
}

export function buildTemplateTree(
  templateOrComponent: any,
  parsedFiles: Map<string, any>,
  dependencyGraph: DependencyGraph,
  ancestorTemplateKeys: ReadonlySet<string> = new Set()
): any {
  const isComponent = templateOrComponent.type === 'ComponentInstantiationNode';

  const template = isComponent
    ? findTemplate(parsedFiles, templateOrComponent.templateName)
    : templateOrComponent;

  if (!template) {
    return null;
  }

  const activeTemplateKeys = new Set(ancestorTemplateKeys);
  activeTemplateKeys.add(templateIdentity(template));

  const tree: any = {
    name: templateOrComponent.name,
    templateName: isComponent ? templateOrComponent.templateName : template.name,
    parameters: template.parameters,
    signals: template.signals,
    variables: template.variables,
    statements: template.statements,
    sourceFile: template.sourceFile,
    components: []
  };

  for (const component of collectDirectComponents(template)) {
    const childTemplate = findTemplate(parsedFiles, component.templateName);
    const isRecursiveReference = childTemplate
      ? activeTemplateKeys.has(templateIdentity(childTemplate))
      : false;
    const componentTree: any = {
      name: component.name,
      templateName: component.templateName,
      arguments: component.arguments,
      templateArgs: component.templateArgs,
      callArgs: component.callArgs,
      isAnonymous: component.isAnonymous,
      isArray: component.isArray,
      isRecursiveReference,
      line: component.line,
      sourceFile: childTemplate?.sourceFile,
      template: childTemplate && !isRecursiveReference
        ? buildTemplateTree(childTemplate, parsedFiles, dependencyGraph, activeTemplateKeys)
        : null
    };
    tree.components.push(componentTree);
  }

  return tree;
}


type CommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

async function compileToyDemoOnParse(entry: string, rootComponent: string): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeEntry = entry.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_circom$/, '');
  const safeRoot = rootComponent.replace(/[^a-zA-Z0-9_-]/g, '_');
  const folderName = `toy-demos_${safeRoot || safeEntry}_${timestamp}`;
  const compilationsRoot = join(process.cwd(), 'compilations');
  const folderPath = join(compilationsRoot, folderName);
  const wrapperPath = join(folderPath, 'main.circom');
  const demoPath = resolve(process.cwd(), '..', 'toy-demos', entry);

  await mkdir(folderPath, { recursive: true });

  const wrapperCode = `pragma circom 2.1.6;\n\ninclude "${demoPath.replace(/\\/g, '/')}";\n\ncomponent main = ${rootComponent}();\n`;
  await writeFile(wrapperPath, wrapperCode, 'utf-8');

  const args = [wrapperPath, '--sym', '--json', '--simplification_substitution', '--O2', '-o', folderPath];
  const commandResult = await runCompileCommand('circom', args, folderPath);
  const generatedArtifacts = await listCompilationArtifacts(folderPath);

  const output = {
    timestamp: new Date().toISOString(),
    repo: 'toy-demos',
    entry,
    rootComponent,
    folderPath,
    wrapperPath,
    command: 'circom',
    args,
    cwd: folderPath,
    status: commandResult.exitCode === 0 ? 'success' : 'error',
    exitCode: commandResult.exitCode,
    stdout: commandResult.stdout,
    stderr: commandResult.stderr,
    error: commandResult.error,
    generatedArtifacts,
  };

  await writeFile(join(folderPath, 'compile-output.json'), JSON.stringify(output, null, 2), 'utf-8');
}

function runCompileCommand(command: string, args: string[], cwd: string): Promise<CommandResult> {
  return new Promise((resolveCommand) => {
    const child = spawn(command, args, { cwd });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      resolveCommand({
        exitCode: null,
        stdout,
        stderr,
        error: error.message,
      });
    });

    child.on('close', (code) => {
      resolveCommand({
        exitCode: code,
        stdout,
        stderr,
        error: code === 0 ? undefined : `circom exited with code ${code}`,
      });
    });
  });
}

async function listCompilationArtifacts(folderPath: string): Promise<string[]> {
  try {
    const files = await readdir(folderPath);
    return files.map(file => join(folderPath, file));
  } catch (error: any) {
    logger.warn(`Failed to list compilation artifacts: ${error.message}`);
    return [];
  }
}

async function logResponseToDisk(
  response: parse_circuit_response,
  repo: string,
  entry: string
): Promise<void> {
  try {
    const logDir = join(process.cwd(), 'logs', 'circuit-parsing');
    await mkdir(logDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeRepo = repo.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeEntry = entry.replace(/[^a-zA-Z0-9_-]/g, '_');
    
    // One file per request 
    const filename = `response_${safeRepo}_${safeEntry}_${timestamp}.json`;
    const filepath = join(logDir, filename);
    
    await writeFile(filepath, JSON.stringify(response, null, 2), 'utf-8');
    
  } catch (err) {
    logger.error(`Failed to write response log: ${err instanceof Error ? err.message : err}`);
  }
}

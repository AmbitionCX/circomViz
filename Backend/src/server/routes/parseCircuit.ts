import { FastifyRequest, FastifyReply } from 'fastify';
import { ProjectLoader } from '../../core/project/loadProject.js';
import { IncludeResolver } from '../../core/resolver/includeResolver.js';
import { DependencyGraph } from '../../core/resolver/dependencyGraph.js';
import { ErrorCollector } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { parse_circuit_request, parse_circuit_response, FileSummary, ParseMessage } from '../../types/circuitParser.js';

import { writeFile, appendFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function parseCircuitHandler(
  request: FastifyRequest<{ Body: parse_circuit_request }>,
  reply: FastifyReply
) {
  try {
    const { repo, entry, rootComponent = 'main' } = request.body;

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
        logger.info(`Parsing file: ${normalizedPath}`);
        const parsedFile = await projectLoader.parseFile(currentFile.path);
        parsedFiles.set(normalizedPath, parsedFile);
        logger.info(`Parsed file ${normalizedPath}: ${parsedFile.templates.length} templates, ${parsedFile.components.length} components, ${parsedFile.includes.length} includes`);

        dependencyGraph.addFile(normalizedPath);

        // Recursive parsing include files
        for (const include of parsedFile.includes) {
          logger.info(`Resolving include: ${include.path} from ${normalizedPath}`);
          includeResolver.setCurrentFile(normalizedPath);
          const resolvedPath = await includeResolver.resolveInclude(include);

          if (resolvedPath) {
            const normalizedIncludePath = resolvedPath.replace(/\\/g, '/');
            dependencyGraph.addDependency(normalizedPath, normalizedIncludePath);
            logger.info(`Resolved include: ${include.path} -> ${normalizedIncludePath}`);

            if (!processedPaths.has(normalizedIncludePath)) {
              const content = await (await import('fs/promises')).readFile(resolvedPath, 'utf-8');
              filesToProcess.push({
                path: resolvedPath,
                content,
                relativePath: include.path
              });
              logger.info(`Added to processing queue: ${normalizedIncludePath}`);
            }
          } else {
            logger.warn(`Failed to resolve include: ${include.path}`);
          }
        }
      } catch (error: any) {
        logger.error(`Failed to parse file ${normalizedPath}: ${error.message}`);
        errorCollector.error(`Failed to parse file: ${error.message}`, currentFile.path);
      }
    }

    const sortedFiles = dependencyGraph.topologicalSort();

    const fileSummaries: FileSummary[] = [];
    for (const filePath of sortedFiles) {
      const parsedFile = parsedFiles.get(filePath);
      if (parsedFile) {
        const includes: string[] = parsedFile.includes.map((inc: any) => inc.path);
        fileSummaries.push({
          id: filePath,
          path: filePath,
          includes
        });
      }
    }

    const rootTemplate = findTemplate(parsedFiles, rootComponent);
    logger.info(`Root template search: ${rootComponent}, found: ${rootTemplate ? 'yes' : 'no'}`);

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
      logger.info(`All templates and components found: ${JSON.stringify(allTemplates, null, 2)}`);
    }
    const tree = rootTemplate ? buildTemplateTree(rootTemplate, parsedFiles, dependencyGraph) : null;
    
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
      }
    };

    // save the response
    logResponseToDisk(response, repo, entry).catch(err => {
      logger.error(`Background logging failed: ${err.message}`);
    });

    logger.info(`Successfully parsed circuit: ${fileSummaries.length} files, ${totalTemplates} templates`);
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
  logger.info(`findTemplate searching for: ${name}`);
  logger.info(`Parsed files count: ${parsedFiles.size}`);
  
  for (const [filePath, file] of parsedFiles.entries()) {
    logger.info(`Checking file: ${filePath}, templates: ${file.templates.length}, components: ${file.components.length}`);
    
    // First try to find a template with this name
    const template = file.templates.find((t: any) => t.name === name);
    if (template) {
      logger.info(`Found template: ${name} in ${filePath}`);
      return template;
    }

    // If not found as template, try to find a component instantiation
    const component = file.components.find((c: any) => c.name === name);
    if (component) {
      logger.info(`Found component: ${name} (templateName: ${component.templateName}) in ${filePath}`);
      return component;
    }
  }
  
  logger.info(`Template/component not found: ${name}`);
  return null;
}

function buildTemplateTree(
  templateOrComponent: any,
  parsedFiles: Map<string, any>,
  dependencyGraph: DependencyGraph
): any {
  const isComponent = templateOrComponent.type === 'ComponentInstantiationNode';

  const template = isComponent
    ? findTemplate(parsedFiles, templateOrComponent.templateName)
    : templateOrComponent;

  if (!template) {
    return null;
  }

  const tree: any = {
    name: templateOrComponent.name,
    templateName: isComponent ? templateOrComponent.templateName : template.name,
    parameters: template.parameters,
    signals: template.signals,
    variables: template.variables,
    statements: template.statements,
    components: []
  };

  for (const component of template.components) {
    const childTemplate = findTemplate(parsedFiles, component.templateName);
    const componentTree: any = {
      name: component.name,
      templateName: component.templateName,
      arguments: component.arguments,
      template: childTemplate ? buildTemplateTree(childTemplate, parsedFiles, dependencyGraph) : null
    };
    tree.components.push(componentTree);
  }

  return tree;
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
    console.error(`Failed to write response log: ${err instanceof Error ? err.message : err}`);
  }
}
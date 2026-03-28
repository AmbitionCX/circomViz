import { FastifyRequest, FastifyReply } from 'fastify';
import { ProjectLoader } from '../../core/project/loadProject.js';
import { IncludeResolver } from '../../core/resolver/includeResolver.js';
import { DependencyGraph } from '../../core/resolver/dependencyGraph.js';
import { ErrorCollector } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { generate_wrapper_request, generate_wrapper_response } from '../../types/circuitParser.js';
import { compileDebug } from '../compilations/compileDebug.js';
import { compileOptimized } from '../compilations/compileOptimized.js';
import { compileWitness } from '../compilations/compileWitness.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';

export async function generateWrapperHandler(
  request: FastifyRequest<{ Body: generate_wrapper_request }>,
  reply: FastifyReply
) {
  try {
    const { templateName, params, publicParams, publicSignals, repo, entry, templatePath } = request.body;

    logger.info(`Generating wrapper for template: ${templateName}`);
    logger.info(`Parameters: ${JSON.stringify(params)}`);
    logger.info(`Public params: ${publicParams.join(', ')}`);
    logger.info(`Public signals: ${publicSignals.join(', ')}`);

    const errorCollector = new ErrorCollector();
    const projectLoader = new ProjectLoader();
    const includeResolver = new IncludeResolver(errorCollector);
    const dependencyGraph = new DependencyGraph(errorCollector);

    const loadResult = await projectLoader.loadProject({
      repoName: repo,
      entryPath: entry,
      rootComponent: 'main',
      basePath: ''
    });

    if (loadResult.error) {
      return reply.code(400).send({
        success: false,
        error: loadResult.error
      });
    }

    const entryFile = loadResult.entryFile;
    const repoPath = loadResult.repoPath || '';

    if (repoPath) {
      includeResolver.setCurrentRepoPath(repoPath);
    }
    includeResolver.setCurrentFile(entryFile.path);

    const parsedFiles = new Map<string, any>();
    const filesToProcess = [entryFile];
    const processedPaths = new Set<string>();

    while (filesToProcess.length > 0) {
      const currentFile = filesToProcess.shift()!;
      const normalizedPath = currentFile.path.replace(/\\/g, '/');

      if (processedPaths.has(normalizedPath)) {
        continue;
      }

      processedPaths.add(normalizedPath);

      try {
        logger.info(`Parsing file: ${normalizedPath}`);
        const parsedFile = await projectLoader.parseFile(currentFile.path);
        parsedFiles.set(normalizedPath, parsedFile);

        dependencyGraph.addFile(normalizedPath);

        for (const include of parsedFile.includes) {
          includeResolver.setCurrentFile(normalizedPath);
          const resolvedPath = await includeResolver.resolveInclude(include);

          if (resolvedPath) {
            const normalizedIncludePath = resolvedPath.replace(/\\/g, '/');
            dependencyGraph.addDependency(normalizedPath, normalizedIncludePath);

            if (!processedPaths.has(normalizedIncludePath)) {
              const content = await fs.readFile(resolvedPath, 'utf-8');
              filesToProcess.push({
                path: resolvedPath,
                content,
                relativePath: include.path
              });
            }
          }
        }
      } catch (error: any) {
        logger.error(`Failed to parse file ${normalizedPath}: ${error.message}`);
      }
    }

    const templateDef = findTemplateDefinition(parsedFiles, templateName);
    if (!templateDef) {
      return reply.code(400).send({
        success: false,
        error: `Template ${templateName} not found`
      });
    }

    logger.info(`Found template definition in: ${templateDef.filePath || 'unknown'}`);

    const templateDir = templateDef.filePath ? dirname(templateDef.filePath) : '';
    const includePaths: string[] = [];
    if (repoPath && !includePaths.includes(`${repoPath}/node_modules`)) {
      includePaths.push(`${repoPath}/node_modules`);
    }
    if (templateDir && !includePaths.includes(templateDir)) {
      includePaths.push(templateDir);
    }

    const includeFlags = includePaths.map(path => `-l "${path}"`).join(' ');
    logger.info(`Include paths: ${includePaths.join(', ')}`);

    const wrapperCode = generateWrapperCode(templateDef, params, publicParams, publicSignals, repoPath);

    const timestamp = Date.now();
    const wrapperDir = join(process.cwd(), 'wrappers', `wrapper_${templateName}_${timestamp}`);
    await fs.mkdir(wrapperDir, { recursive: true });

    const wrapperFilePath = join(wrapperDir, 'wrapper.circom');
    await fs.writeFile(wrapperFilePath, wrapperCode, 'utf-8');

    logger.info(`Wrapper written to: ${wrapperFilePath}`);

    const results: generate_wrapper_response = {
      success: true,
      wrapperCode
    };

    const debugDir = join(wrapperDir, 'debug');
    const debugResult = await compileDebug(wrapperFilePath, includeFlags, debugDir);
    
    results.debugOutput = debugResult.stdout + debugResult.stderr;
    results.debugSuccess = debugResult.success;
    
    const symFilePath = join(debugDir, 'wrapper.sym');
    const constraintsJsonPath = join(debugDir, 'wrapper_constraints.json');
    
    if (!debugResult.success) {
      logger.error(`Debug compilation failed`);
    }

    const optDir = join(wrapperDir, 'opt');
    const optResult = await compileOptimized(wrapperFilePath, includeFlags, optDir);

    results.optimizedOutput = optResult.stdout + optResult.stderr;
    results.optimizedSuccess = optResult.success;

    if (!optResult.success) {
      logger.error(`Optimized compilation failed`);
    }

    const witnessDir = join(wrapperDir, 'witness');
    const witnessResult = await compileWitness(wrapperFilePath, includeFlags, witnessDir);

    results.witnessOutput = witnessResult.stdout + witnessResult.stderr;
    results.witnessSuccess = witnessResult.success;

    if (!witnessResult.success) {
      logger.error(`Witness compilation failed`);
    }
    
    (results as any).symPath = symFilePath;
    (results as any).constraintsJsonPath = constraintsJsonPath;
    
    reply.send(results);

  } catch (error: any) {
    logger.error(`Error generating wrapper: ${error.message}`);
    reply.code(500).send({
      success: false,
      error: error.message
    });
  }
}

function findTemplateDefinition(parsedFiles: Map<string, any>, templateName: string): { filePath: string; template: any } | null {
  for (const [filePath, file] of parsedFiles.entries()) {
    const template = file.templates.find((t: any) => t.name === templateName);
    if (template) {
      return {
        filePath,
        template
      };
    }
  }
  return null;
}

function generateWrapperCode(
  templateDef: any,
  params: { name: string; value: number }[],
  publicParams: string[],
  publicSignals: string[],
  repoPath: string
): string {
  const paramsList = params.map(p => p.value.toString()).join(', ');
  
  let includePath = templateDef.filePath || '';
  
  let publicSignalsBlock = '';
  if (publicSignals && publicSignals.length > 0) {
    publicSignalsBlock = ` { public [${publicSignals.join(', ')}] }`;
  }
  
  const wrapperCode = `pragma circom 2.2.3;
include "${includePath}";

component main${publicSignalsBlock} = ${templateDef.template.name}(${paramsList});
`;

  return wrapperCode;
}

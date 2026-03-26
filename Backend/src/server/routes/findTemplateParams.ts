import { FastifyRequest, FastifyReply } from 'fastify';
import { ProjectLoader } from '../../core/project/loadProject.js';
import { IncludeResolver } from '../../core/resolver/includeResolver.js';
import { DependencyGraph } from '../../core/resolver/dependencyGraph.js';
import { ErrorCollector } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type {
  find_template_params_request,
  find_template_params_response,
  TemplateParamCandidate
} from '../../types/circuitParser.js';

export async function findTemplateParamsHandler(
  request: FastifyRequest<{ Body: find_template_params_request }>,
  reply: FastifyReply
) {
  try {
    const { templateName, repo, entry } = request.body;

    logger.info(`Searching for template parameters: templateName=${templateName}, repo=${repo}, entry=${entry}`);

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
        error: loadResult.error
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
        logger.info(`Parsed file ${normalizedPath}: ${parsedFile.templates.length} templates, ${parsedFile.components.length} components`);

        dependencyGraph.addFile(normalizedPath);

        for (const include of parsedFile.includes) {
          logger.info(`Resolving include: ${include.path} from ${normalizedPath}`);
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
          }
        }
      } catch (error: any) {
        logger.error(`Failed to parse file ${normalizedPath}: ${error.message}`);
      }
    }

    const candidates: TemplateParamCandidate[] = [];
    let templateParams: string[] = [];
    let templateSignals: Array<{ name: string; kind: string }> = [];

    logger.info(`Searching for template ${templateName} in ${parsedFiles.size} parsed files`);

    for (const [filePath, file] of parsedFiles.entries()) {
      logger.info(`File ${filePath}: ${file.components.length} components, ${file.templates.length} templates`);
      
      for (const template of file.templates) {
        if (template.name === templateName) {
          logger.info(`Found template definition: ${templateName} in ${filePath}`);
          templateParams = template.parameters.map((p: any) => p.name);
          templateSignals = template.signals.map((s: any) => ({
            name: s.name,
            kind: s.kind
          }));
          logger.info(`Template params: ${templateParams}, signals count: ${templateSignals.length}`);
        }
      }
    }

    for (const [filePath, file] of parsedFiles.entries()) {
      logger.info(`Searching for component instantiations in ${filePath}`);
      
      for (const component of file.components) {
        logger.debug(`Checking component: ${component.name}, templateName: ${component.templateName}, hasArgs: ${!!component.arguments}`);
        
        if (component.templateName === templateName) {
          logger.info(`Found component matching ${templateName}: ${component.name} in ${filePath} at line ${component.line}`);
          
          if (!component.arguments || component.arguments.length === 0) {
            logger.warn(`Component ${component.name} has no arguments`);
            continue;
          }
          
          logger.info(`Component arguments: ${JSON.stringify(component.arguments, null, 2)}`);
          
          const paramValues: { name: string; value: number }[] = [];
          
          for (let i = 0; i < component.arguments.length; i++) {
            const arg = component.arguments[i];
            logger.debug(`Extracting value from arg ${i}: ${JSON.stringify(arg)}`);
            const value = extractLiteralValue(arg);
            logger.debug(`Extracted value: ${value}`);
            
            if (value !== null) {
              const paramName = templateParams[i] || `param${i}`;
              paramValues.push({
                name: paramName,
                value
              });
            }
          }

          const publicSignals = (component as any).publicSignals || [];

          logger.info(`Extracted ${paramValues.length} parameters from component ${component.name}, public signals: ${JSON.stringify(publicSignals)}`);
          
          if (paramValues.length > 0) {
            candidates.push({
              params: paramValues,
              publicSignals,
              location: {
                file: filePath,
                line: component.line || 0,
                component: component.name
              }
            });
            logger.info(`Added candidate: ${JSON.stringify(candidates[candidates.length - 1])}`);
          }
        }
      }
    }

    const response: find_template_params_response = {
      templateName,
      hasCandidates: candidates.length > 0,
      candidates,
      templateParams,
      signals: templateSignals
    };

    logger.info(`Found ${candidates.length} parameter candidates for template ${templateName}`);
    reply.send(response);

  } catch (error: any) {
    logger.error(`Error finding template parameters: ${error.message}`);
    reply.code(500).send({
      error: 'Internal server error'
    });
  }
}

function extractLiteralValue(expr: any): number | null {
  if (!expr) {
    logger.debug(`extractLiteralValue: expr is null/undefined`);
    return null;
  }
  
  logger.debug(`extractLiteralValue: type=${expr.type}, value=${expr.value}, operator=${expr.operator}`);
  
  if (expr.type === 'Literal' && typeof expr.value === 'number') {
    logger.debug(`extractLiteralValue: returning literal value ${expr.value}`);
    return expr.value;
  }
  
  if (expr.type === 'Identifier') {
    logger.debug(`extractLiteralValue: identifier ${expr.name} - cannot extract value`);
    return null;
  }
  
  if (expr.type === 'BinaryOp') {
    logger.debug(`extractLiteralValue: BinaryOp ${expr.operator}, left=${JSON.stringify(expr.left)}, right=${JSON.stringify(expr.right)}`);
    const left = extractLiteralValue(expr.left);
    const right = extractLiteralValue(expr.right);
    
    logger.debug(`extractLiteralValue: BinaryOp left=${left}, right=${right}`);
    
    if (left !== null && right !== null) {
      let result: number | null = null;
      switch (expr.operator) {
        case '+': result = left + right; break;
        case '-': result = left - right; break;
        case '*': result = left * right; break;
        case '/': result = Math.floor(left / right); break;
        case '%': result = left % right; break;
        default: 
          logger.debug(`extractLiteralValue: unknown operator ${expr.operator}`);
          result = null;
      }
      logger.debug(`extractLiteralValue: BinaryOp result ${result}`);
      return result;
    }
  }
  
  logger.debug(`extractLiteralValue: unknown expression type ${expr.type}`);
  return null;
}
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
    const startedAt = Date.now();

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
        logger.warn(`Skipped unreadable circuit file: path=${normalizedPath}, error=${error.message}`);
      }
    }

    const candidates: TemplateParamCandidate[] = [];
    let templateParams: string[] = [];
    let templateSignals: Array<{ name: string; kind: string }> = [];

    for (const [filePath, file] of parsedFiles.entries()) {
      for (const template of file.templates) {
        if (template.name === templateName) {
          templateParams = template.parameters.map((p: any) => p.name);
          templateSignals = template.signals.map((s: any) => ({
            name: s.name,
            kind: s.kind
          }));
        }
      }
    }

    for (const [filePath, file] of parsedFiles.entries()) {
      for (const component of file.components) {
        if (component.templateName === templateName) {
          if (!component.arguments || component.arguments.length === 0) {
            continue;
          }
          
          const paramValues: { name: string; value: number }[] = [];
          
          for (let i = 0; i < component.arguments.length; i++) {
            const arg = component.arguments[i];
            const value = extractLiteralValue(arg);
            
            if (value !== null) {
              const paramName = templateParams[i] || `param${i}`;
              paramValues.push({
                name: paramName,
                value
              });
            }
          }

          const publicSignals = (component as any).publicSignals || [];

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

    logger.info(`Template parameter search completed: template=${templateName}, files=${parsedFiles.size}, candidates=${candidates.length}, durationMs=${Date.now() - startedAt}`);
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
    return null;
  }
  
  if (expr.type === 'Literal' && typeof expr.value === 'number') {
    return expr.value;
  }
  
  if (expr.type === 'Identifier') {
    return null;
  }
  
  if (expr.type === 'BinaryOp') {
    const left = extractLiteralValue(expr.left);
    const right = extractLiteralValue(expr.right);
    
    if (left !== null && right !== null) {
      let result: number | null = null;
      switch (expr.operator) {
        case '+': result = left + right; break;
        case '-': result = left - right; break;
        case '*': result = left * right; break;
        case '/': result = Math.floor(left / right); break;
        case '%': result = left % right; break;
        default: 
          result = null;
      }
      return result;
    }
  }
  
  return null;
}

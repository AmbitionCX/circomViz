import { FastifyRequest, FastifyReply } from 'fastify';
import { ProjectLoader } from '../../core/project/loadProject.js';
import { IncludeResolver } from '../../core/resolver/includeResolver.js';
import { DependencyGraph } from '../../core/resolver/dependencyGraph.js';
import { ErrorCollector } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { parse_circuit_request, parse_circuit_response, FileSummary, ParseMessage } from '../../types/circuitParser.js';

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
          }
        }
      } catch (error: any) {
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
      }
      logger.info(`All templates found: ${JSON.stringify(allTemplates, null, 2)}`);
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
  for (const file of parsedFiles.values()) {
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

function buildTemplateTree(
  templateOrComponent: any,
  parsedFiles: Map<string, any>,
  dependencyGraph: DependencyGraph
): any {
  const isComponent = templateOrComponent.type === 'ComponentInstantiation';

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

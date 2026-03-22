import { FastifyRequest, FastifyReply } from 'fastify';
import { ProjectLoader } from '../../core/project/loadProject.js';
import { IncludeResolver } from '../../core/resolver/includeResolver.js';
import { DependencyGraph } from '../../core/resolver/dependencyGraph.js';
import { ErrorCollector } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { parse_circuit_request, parse_circuit_response, FileSummary, ParseMessage } from '../../types/circuitParser.js';

import { writeFile, appendFile, mkdir } from 'fs/promises';
import { join, sep, dirname } from 'path';

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
  // CRITICAL: Log the actual name being searched for (including undefined)
  logger.info(`findTemplate searching for: ${name} (type: ${typeof name})`);
  logger.info(`Parsed files count: ${parsedFiles.size}`);
  
  if (!name || name === undefined || name === null) {
    logger.error(`[findTemplate ERROR] Attempting to find template with undefined/null name`);
    return null;
  }
  
  for (const [filePath, file] of parsedFiles.entries()) {
    // logger.info(`Checking file: ${filePath}, templates: ${file.templates.length}, components: ${file.components.length}`);
    
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

  logger.warn(`Template ${name} not found in any parsed file`);
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

function extractComponentCallsFromStatements(statements: any[]): any[] {
  const componentCalls: any[] = [];
  let anonymousComponentIndex = 0;

  // logger.info(`[extractComponentCallsFromStatements] Called with ${statements.length} statements: ${statements.map((s: any) => s.type).join(', ')}`);

  function visitNode(node: any): void {
    if (!node) return;

    if (node.type === 'ComponentCall') {
      if (!node.template) {
        logger.error(`ComponentCall node has undefined template at line ${node.line}`);
        logger.error(`Node structure: ${JSON.stringify(node, null, 2)}`);
      }
      
      const templateName = node.template;
      componentCalls.push({
        type: 'ComponentInstantiationNode',
        name: `Anonymous_${anonymousComponentIndex++}`,
        templateName: templateName,
        templateArgs: node.templateArgs || [],
        callArgs: node.callArgs || [],
        arguments: node.callArgs || [],
        isAnonymous: true
      });
      logger.debug(`Found anonymous component call: ${templateName} (line ${node.line})`);
    }

    if (node.left) visitNode(node.left);
    if (node.right) visitNode(node.right);
    if (node.condition) visitNode(node.condition);
    if (node.thenExpr) visitNode(node.thenExpr);
    if (node.elseExpr) visitNode(node.elseExpr);
    if (node.operand) visitNode(node.operand);

    // Handle ComponentArrayInit - visit its init statements
    if (node.type === 'ComponentArrayInit' && node.initStatements) {
      node.initStatements.forEach((stmt: any) => visitNode(stmt));
    }
    if (node.elements) {
      node.elements.forEach((el: any) => visitNode(el));
    }
    if (node.array) visitNode(node.array);
    if (node.index) visitNode(node.index);
    if (node.object) visitNode(node.object);
    if (node.value) visitNode(node.value);
    if (node.message) visitNode(node.message);

    if (node.type === 'Assignment') {
      visitNode(node.left);
      visitNode(node.right);
    }

    if (node.type === 'IfStatement') {
      node.thenBranch?.forEach((stmt: any) => visitNode(stmt));
      node.elseBranch?.forEach((stmt: any) => visitNode(stmt));
    }

    if (node.type === 'ForLoop' || node.type === 'WhileLoop') {
      node.body?.forEach((stmt: any, idx: number) => {
        visitNode(stmt);
      });
      if (node.type === 'ForLoop') {
        visitNode(node.start);
        visitNode(node.end);
        visitNode(node.step);
      } else {
        visitNode(node.condition);
      }
    }

    if (node.type === 'Return') {
      visitNode(node.value);
    }

    if (node.type === 'Assert') {
      visitNode(node.condition);
      visitNode(node.message);
    }

    if (node.type === 'ExpressionStatement') {
      visitNode(node.expression);
    }

    if (node.type === 'BlockStatement') {
      node.body?.forEach((stmt: any) => visitNode(stmt));
    }
  }

  statements.forEach(stmt => visitNode(stmt));
  return componentCalls;
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
    // CRITICAL: Validate component type
    if (component.type === 'ComponentDeclaration') {
      // Component declarations don't have templateName - skip them
      logger.debug(`Skipping ComponentDeclaration: ${component.name} (no template)`);
      continue;
    }
    
    if (component.type === 'ComponentArrayInit') {
      // Component array initialization also doesn't have templateName
      // It's just a declaration with initialization statements
      logger.debug(`Skipping ComponentArrayInit: ${component.name} (no template)`);
      continue;
    }
    
    if (component.type === 'ComponentInstantiationWithInitNode') {
      // Component with init block also doesn't have templateName
      logger.debug(`Skipping ComponentInstantiationWithInitNode: ${component.name} (has init block)`);
      continue;
    }
    
    if (!component.templateName) {
      // logger.error(`[Component ERROR] Component has undefined templateName: ${component.name} at line ${component.line}`);
      // logger.error(`[Component ERROR] Component type: ${component.type}`);
      // logger.error(`[Component ERROR] Full component structure: ${JSON.stringify(component, null, 2)}`);
      continue;
    }
    
    logger.info(`[Component Processing] name=${component.name}, templateName=${component.templateName}, line=${component.line}`);
    
    const childTemplate = findTemplate(parsedFiles, component.templateName);
    const componentTree: any = {
      name: component.name,
      templateName: component.templateName || 'unknown',
      arguments: component.arguments,
      template: childTemplate ? buildTemplateTree(childTemplate, parsedFiles, dependencyGraph) : null
    };
    tree.components.push(componentTree);
    logger.debug(`Added component to tree: ${component.name} -> ${component.templateName}, templateFound: ${!!childTemplate}`);
  }

  // Also extract anonymous component calls from ComponentArrayInit and ComponentInstantiationWithInit nodes
  for (const component of template.components) {
    if (component.type === 'ComponentArrayInit' && component.initStatements) {
      // logger.info(`[ComponentArrayInit] Processing component ${component.name}`);
      const arrayInitCalls = extractComponentCallsFromStatements(component.initStatements);
      // logger.info(`[ComponentArrayInit] Found ${arrayInitCalls.length} anonymous component calls in ${component.name}`);
      
      for (const anonComponent of arrayInitCalls) {
        if (!anonComponent.templateName && anonComponent.templateName === undefined) {
          logger.error(`[ArrayInit Anonymous ERROR] Component has undefined templateName: ${anonComponent.name}`);
          logger.error(`[ArrayInit Anonymous ERROR] Full node structure: ${JSON.stringify(anonComponent, null, 2)}`);
          continue;
        }

        logger.info(`[ArrayInit Anonymous Processing] name=${anonComponent.name}, templateName=${anonComponent.templateName}`);

        const childTemplate = findTemplate(parsedFiles, anonComponent.templateName);
        const componentTree: any = {
          name: anonComponent.name,
          templateName: anonComponent.templateName || 'unknown',
          arguments: anonComponent.callArgs || anonComponent.arguments || [],
          templateArgs: anonComponent.templateArgs || [],
          isAnonymous: true,
          template: childTemplate ? buildTemplateTree(childTemplate, parsedFiles, dependencyGraph) : null
        };
        tree.components.push(componentTree);
        logger.debug(`Added array init anonymous component to tree: ${anonComponent.name} -> ${anonComponent.templateName}, templateFound: ${!!childTemplate}`);
      }
    }
    
    if (component.type === 'ComponentInstantiationWithInitNode' && component.initBlock) {
      logger.info(`[ComponentInstantiationWithInit] Extracting anonymous calls from ${component.name}`);
      const initBlockCalls = extractComponentCallsFromStatements(component.initBlock);
      logger.info(`[ComponentInstantiationWithInit] Found ${initBlockCalls.length} anonymous component calls in ${component.name}`);
      
      for (const anonComponent of initBlockCalls) {
        if (!anonComponent.templateName && anonComponent.templateName === undefined) {
          logger.error(`[InitBlock Anonymous ERROR] Component has undefined templateName: ${anonComponent.name}`);
          logger.error(`[InitBlock Anonymous ERROR] Full node structure: ${JSON.stringify(anonComponent, null, 2)}`);
          continue;
        }

        logger.info(`[InitBlock Anonymous Processing] name=${anonComponent.name}, templateName=${anonComponent.templateName}`);

        const childTemplate = findTemplate(parsedFiles, anonComponent.templateName);
        const componentTree: any = {
          name: anonComponent.name,
          templateName: anonComponent.templateName || 'unknown',
          arguments: anonComponent.callArgs || anonComponent.arguments || [],
          templateArgs: anonComponent.templateArgs || [],
          isAnonymous: true,
          template: childTemplate ? buildTemplateTree(childTemplate, parsedFiles, dependencyGraph) : null
        };
        tree.components.push(componentTree);
        logger.debug(`Added init block anonymous component to tree: ${anonComponent.name} -> ${anonComponent.templateName}, templateFound: ${!!childTemplate}`);
      }
    }
  }

  const anonymousComponentCalls = extractComponentCallsFromStatements(template.statements);
  // logger.info(`Found ${anonymousComponentCalls.length} anonymous component calls in template ${template.name}`);

  for (const anonComponent of anonymousComponentCalls) {
    // CRITICAL: Validate anonymous component has templateName
    if (!anonComponent.templateName || anonComponent.templateName === undefined) {
      logger.error(`[Anonymous Component ERROR] Component has undefined templateName: ${anonComponent.name}`);
      logger.error(`[Anonymous Component ERROR] Full node structure: ${JSON.stringify(anonComponent, null, 2)}`);
      continue;
    }

    // logger.info(`[Anonymous Component Processing] name=${anonComponent.name}, templateName=${anonComponent.templateName}`);

    const childTemplate = findTemplate(parsedFiles, anonComponent.templateName);
    const componentTree: any = {
      name: anonComponent.name,
      templateName: anonComponent.templateName || 'unknown',
      arguments: anonComponent.callArgs,
      templateArgs: anonComponent.templateArgs,
      isAnonymous: true,
      template: childTemplate ? buildTemplateTree(childTemplate, parsedFiles, dependencyGraph) : null
    };
    tree.components.push(componentTree);
    // logger.debug(`Added anonymous component to tree: ${anonComponent.name} -> ${anonComponent.templateName}, templateFound: ${!!childTemplate}`);
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
import { FastifyRequest, FastifyReply } from 'fastify';
import { ProjectLoader } from '../../core/project/loadProject.js';
import { IncludeResolver } from '../../core/resolver/includeResolver.js';
import { DependencyGraph } from '../../core/resolver/dependencyGraph.js';
import { ErrorCollector } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { compileTemplate } from '../../scripts/templateCompiler.js';
import { compilationLogger } from '../../utils/compilationLogger.js';

interface CompileTemplateRequest {
  repo: string;
  entry: string;
  templatePath: string[];
  templateName: string;
}

interface CompileTemplateResponse {
  success: boolean;
  constraints: string[];
  signals: Record<string, string>;
  substitutions: Record<string, Record<string, string>>;
  stats: {
    constraintCount: number;
    signalCount: number;
    substitutionCount: number;
    executionTimeMs: number;
  };
  error?: string;
}

function generateCodeFromTemplate(template: any): string {
  let code = `pragma circom 2.0.0;\n\n`;
  
  code += `template ${template.templateName}(\n`;
  
  if (template.parameters && template.parameters.length > 0) {
    const params = template.parameters.map((p: any) => {
      const isArray = p.isArray ? '[]' : '';
      return `    ${p.name}${isArray}`;
    }).join(',\n');
    code += params + '\n';
  }
  
  code += `) {\n`;
  
  if (template.signals && template.signals.length > 0) {
    template.signals.forEach((signal: any) => {
      const arraySizes = signal.arraySizes && signal.arraySizes.length > 0
        ? `[${signal.arraySizes.map((s: any) => typeof s === 'number' ? s : s.name).join('][')}]`
        : '';
      const kind = signal.kind === 'input' ? 'input ' : signal.kind === 'output' ? 'output ' : '';
      const initial = signal.initialValue ? ` <== ${formatExpression(signal.initialValue)}` : '';
      code += `    signal ${kind}${signal.name}${arraySizes};\n`;
    });
    code += '\n';
  }
  
  if (template.statements) {
    template.statements.forEach((stmt: any) => {
      code += formatStatement(stmt);
    });
  }
  
  code += `}\n`;
  
  return code;
}

function formatExpression(expr: any, indent: number = 0): string {
  if (!expr) return '';
  
  const prefix = '    '.repeat(indent);
  
  switch (expr.type) {
    case 'Identifier':
      return expr.name;
    case 'Literal':
      return String(expr.value);
    case 'BinaryOp':
      return `${formatExpression(expr.left)} ${expr.operator} ${formatExpression(expr.right)}`;
    case 'MemberAccess':
      return `${formatExpression(expr.object)}.${expr.property}`;
    case 'FunctionCall':
      const args = expr.arguments ? expr.arguments.map((a: any) => formatExpression(a)).join(', ') : '';
      return `${expr.function}(${args})`;
    case 'ComponentCall':
      const templateArgs = expr.templateArgs ? `[${expr.templateArgs.map((a: any) => formatExpression(a)).join(', ')}]` : '';
      const callArgs = expr.callArgs ? `(${expr.callArgs.map((a: any) => formatExpression(a)).join(', ')})` : '';
      return `${expr.template}${templateArgs}${callArgs}`;
    case 'Array':
      const elements = expr.elements ? expr.elements.map((e: any) => formatExpression(e)).join(', ') : '';
      return `[${elements}]`;
    default:
      return '';
  }
}

function formatStatement(stmt: any, indent: number = 0): string {
  if (!stmt) return '';
  
  const prefix = '    '.repeat(indent);
  
  switch (stmt.type) {
    case 'Assignment':
      const left = formatExpression(stmt.left);
      const right = formatExpression(stmt.right);
      const operator = stmt.assignmentOp || ' <== ';
      return `${prefix}${left} ${operator} ${right};\n`;
      
    case 'IfStatement':
      let ifCode = `${prefix}if (${formatExpression(stmt.condition)}) {\n`;
      if (stmt.thenBranch) {
        ifCode += stmt.thenBranch.map((s: any) => formatStatement(s, indent + 1)).join('');
      }
      if (stmt.elseBranch && stmt.elseBranch.length > 0) {
        ifCode += `${prefix}} else {\n`;
        ifCode += stmt.elseBranch.map((s: any) => formatStatement(s, indent + 1)).join('');
      }
      ifCode += `${prefix}}\n`;
      return ifCode;
      
    case 'ForLoop':
      const start = formatExpression(stmt.start);
      const cond = formatExpression(stmt.end);
      const step = stmt.step ? formatExpression(stmt.step) : `${stmt.variable}++`;
      let forCode = `${prefix}for (var ${stmt.variable} = ${start}; ${cond}; ${step}) {\n`;
      if (stmt.body) {
        forCode += stmt.body.map((s: any) => formatStatement(s, indent + 1)).join('');
      }
      forCode += `${prefix}}\n`;
      return forCode;
      
    case 'WhileLoop':
      let whileCode = `${prefix}while (${formatExpression(stmt.condition)}) {\n`;
      if (stmt.body) {
        whileCode += stmt.body.map((s: any) => formatStatement(s, indent + 1)).join('');
      }
      whileCode += `${prefix}}\n`;
      return whileCode;
      
    case 'Return':
      return `${prefix}return ${formatExpression(stmt.value)};\n`;
      
    case 'Assert':
      const message = stmt.message ? `, ${formatExpression(stmt.message)}` : '';
      return `${prefix}assert(${formatExpression(stmt.condition)}${message});\n`;
      
    case 'ExpressionStatement':
      return `${prefix}${formatExpression(stmt.expression)};\n`;
      
    case 'BlockStatement':
      let blockCode = `${prefix}{\n`;
      if (stmt.body) {
        blockCode += stmt.body.map((s: any) => formatStatement(s, indent + 1)).join('');
      }
      blockCode += `${prefix}}\n`;
      return blockCode;
      
    default:
      return '';
  }
}

function findTemplateInTree(tree: any, templateName: string): any | null {
  if (!tree) return null;
  
  if (tree.templateName === templateName) {
    return tree;
  }
  
  if (tree.components) {
    for (const component of tree.components) {
      const found = findTemplateInTree(component.template, templateName);
      if (found) return found;
    }
  }
  
  return null;
}

export async function compileTemplateHandler(
  request: FastifyRequest<{ Body: CompileTemplateRequest }>,
  reply: FastifyReply
) {
  const startTime = Date.now();
  
  try {
    const { repo, entry, templatePath, templateName } = request.body;

    logger.info(`Compiling template: repo=${repo}, entry=${entry}, template=${templateName}`);

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
      const executionTime = Date.now() - startTime;
      await compilationLogger.logCompilation({
        timestamp: new Date().toISOString(),
        templateName,
        templatePath,
        status: 'error',
        constraintCount: 0,
        signalCount: 0,
        substitutionCount: 0,
        executionTimeMs: executionTime,
        error: loadResult.error
      });
      
      return reply.code(400).send({
        success: false,
        constraints: [],
        signals: {},
        substitutions: {},
        stats: { constraintCount: 0, signalCount: 0, substitutionCount: 0, executionTimeMs: executionTime },
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
        errorCollector.error(`Failed to parse file: ${error.message}`, currentFile.path);
      }
    }

    const sortedFiles = dependencyGraph.topologicalSort();

    let selectedTemplate: any = null;
    for (const filePath of sortedFiles) {
      const parsedFile = parsedFiles.get(filePath);
      if (parsedFile) {
        const template = parsedFile.templates.find((t: any) => t.name === templateName);
        if (template) {
          selectedTemplate = template;
          break;
        }
      }
    }

    if (!selectedTemplate) {
      const executionTime = Date.now() - startTime;
      const errorMsg = `Template "${templateName}" not found`;
      
      await compilationLogger.logCompilation({
        timestamp: new Date().toISOString(),
        templateName,
        templatePath,
        status: 'error',
        constraintCount: 0,
        signalCount: 0,
        substitutionCount: 0,
        executionTimeMs: executionTime,
        error: errorMsg
      });
      
      return reply.code(404).send({
        success: false,
        constraints: [],
        signals: {},
        substitutions: {},
        stats: { constraintCount: 0, signalCount: 0, substitutionCount: 0, executionTimeMs: executionTime },
        error: errorMsg
      });
    }

    const dependencyCodes: { [path: string]: string } = {};
    for (const filePath of sortedFiles) {
      const parsedFile = parsedFiles.get(filePath);
      if (parsedFile && filePath !== entryFile.path) {
        const templatesCode = parsedFile.templates.map((t: any) => generateCodeFromTemplate(t)).join('\n');
        if (templatesCode) {
          dependencyCodes[filePath] = `// File: ${filePath}\n${templatesCode}`;
        }
      }
    }

    const templateCode = generateCodeFromTemplate(selectedTemplate);

    const compileRequest = {
      repo,
      entry,
      repoPath: repoPath!,
      sourceFilePath: selectedTemplate.sourceFile || entryFile.path,
      templatePath,
      templateName,
      templateCode,
      dependencyCodes
    };

    const result = await compileTemplate(compileRequest);

    const executionTime = Date.now() - startTime;
    
    await compilationLogger.logCompilation({
      timestamp: new Date().toISOString(),
      templateName,
      templatePath,
      status: result.success ? 'success' : 'error',
      constraintCount: result.stats.constraintCount,
      signalCount: result.stats.signalCount,
      substitutionCount: result.stats.substitutionCount,
      executionTimeMs: executionTime,
      error: result.error
    });

    const response: CompileTemplateResponse = {
      success: result.success,
      constraints: result.constraints,
      signals: result.signals,
      substitutions: result.substitutions,
      stats: {
        ...result.stats,
        executionTimeMs: executionTime
      },
      error: result.error
    };

    if (result.success) {
      reply.send(response);
    } else {
      reply.code(400).send(response);
    }

  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    const errorMsg = `Internal server error: ${error.message}`;
    
    await compilationLogger.logCompilation({
      timestamp: new Date().toISOString(),
      templateName: request.body.templateName,
      templatePath: request.body.templatePath,
      status: 'error',
      constraintCount: 0,
      signalCount: 0,
      substitutionCount: 0,
      executionTimeMs: executionTime,
      error: errorMsg
    });
    
    logger.error(`Error compiling template: ${error.message}`);
    reply.code(500).send({
      success: false,
      constraints: [],
      signals: {},
      substitutions: {},
      stats: { constraintCount: 0, signalCount: 0, substitutionCount: 0, executionTimeMs: executionTime },
      error: errorMsg
    });
  }
}
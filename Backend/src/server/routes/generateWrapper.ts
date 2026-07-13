import { FastifyRequest, FastifyReply } from 'fastify';
import { ProjectLoader } from '../../core/project/loadProject.js';
import { IncludeResolver } from '../../core/resolver/includeResolver.js';
import { DependencyGraph } from '../../core/resolver/dependencyGraph.js';
import { ErrorCollector } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { generate_wrapper_request, generate_wrapper_response } from '../../types/circuitParser.js';
import { compileDebug } from '../compilations/compileDebug.js';
import { AbstractWrapperGenerator } from '../../core/abstractCompile/index.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';

export async function generateWrapperHandler(
  request: FastifyRequest<{ Body: generate_wrapper_request }>,
  reply: FastifyReply
) {
  try {
    const { templateName, params, publicParams, publicSignals, repo, entry, templatePath } = request.body;
    const confirmedTemplateNames = request.body.confirmedTemplateNames ?? [];
    const mode = request.body.mode ?? 'interface-mock';

    logger.info(`Generating wrapper for template: ${templateName}`);
    logger.info(`Parameters: ${JSON.stringify(params)}`);
    logger.info(`Public params: ${publicParams.join(', ')}`);
    logger.info(`Public signals: ${publicSignals.join(', ')}`);
    if (confirmedTemplateNames.length > 0) {
      logger.info(`Abstract partial compile: mode=${mode}, confirmed=${confirmedTemplateNames.join(', ')}`);
    }

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

    // --- Generate wrapper code ---

    // Always generate the origin (simple, non-mocked) wrapper
    const originWrapperCode = generateWrapperCode(templateDef, params, publicParams, publicSignals, repoPath);

    // If confirmed templates exist, also generate the mocked wrapper
    const hasConfirmed = confirmedTemplateNames.length > 0;
    let mockedWrapperCode: string | null = null;
    let abstractMeta: Partial<generate_wrapper_response> = {};

    if (hasConfirmed) {
      const generator = new AbstractWrapperGenerator(parsedFiles);
      const abstractResult = generator.build(
        templateDef.template,
        confirmedTemplateNames,
        params,
        publicSignals,
        { originalFilePath: templateDef.filePath || '' },
      );
      mockedWrapperCode = abstractResult.wrapperCode;
      abstractMeta = {
        abstractCompile: true,
        mockedChildren: abstractResult.mockedChildren,
        unmockedChildren: abstractResult.unmockedChildren,
        validatorWarnings: abstractResult.validatorWarnings,
        boundaryInputs: abstractResult.boundaryInputs,
      };
      logger.info(
        `Mocked wrapper: mocked=${abstractResult.mockedChildren.join(', ') || '(none)'}, ` +
        `validators=${abstractResult.validatorWarnings.length}, ` +
        `boundaryInputs=${abstractResult.boundaryInputs.length}`,
      );
      if (abstractResult.unmockedChildren.length > 0) {
        logger.warn(`Unmocked (kept expanded): ${abstractResult.unmockedChildren.join(', ')}`);
      }
    }

    // --- Write files ---

    const timestamp = Date.now();
    const wrapperDir = join(process.cwd(), 'wrappers', `wrapper_${templateName}_${timestamp}`);
    await fs.mkdir(wrapperDir, { recursive: true });

    const originWrapperPath = join(wrapperDir, 'wrapper_origin.circom');
    await fs.writeFile(originWrapperPath, originWrapperCode, 'utf-8');
    logger.info(`Origin wrapper written to: ${originWrapperPath}`);

    let mockedWrapperPath: string | null = null;
    if (mockedWrapperCode) {
      mockedWrapperPath = join(wrapperDir, 'wrapper.circom');
      await fs.writeFile(mockedWrapperPath, mockedWrapperCode, 'utf-8');
      logger.info(`Mocked wrapper written to: ${mockedWrapperPath}`);
    }

    if (templateDef.filePath) {
      const originContent = await fs.readFile(templateDef.filePath, 'utf-8');
      const originFilePath = join(wrapperDir, 'origin.circom');
      await fs.writeFile(originFilePath, originContent, 'utf-8');
      logger.info(`Original source saved to: ${originFilePath}`);
    }

    // --- Compile origin wrapper → R1CS ---

    const originDir = join(wrapperDir, 'origin');
    const originResult = await compileDebug(originWrapperPath, includeFlags, originDir);
    const originSymPath = join(originDir, 'wrapper.sym');
    const originConstraintsJsonPath = join(originDir, 'wrapper_constraints.json');
    logger.info(`Origin compilation ${originResult.success ? 'succeeded' : 'failed'}`);

    // --- Compile mocked wrapper → R1CS (if exists) ---

    let mockedResult: Awaited<ReturnType<typeof compileDebug>> | null = null;
    let mockedSymPath: string | null = null;
    let mockedConstraintsJsonPath: string | null = null;

    if (mockedWrapperPath) {
      const mockedDir = join(wrapperDir, 'mocked');
      mockedResult = await compileDebug(mockedWrapperPath, includeFlags, mockedDir);
      mockedSymPath = join(mockedDir, 'wrapper.sym');
      mockedConstraintsJsonPath = join(mockedDir, 'wrapper_constraints.json');
      logger.info(`Mocked compilation ${mockedResult.success ? 'succeeded' : 'failed'}`);
    }

    // --- Build response ---

    const results: generate_wrapper_response = {
      success: true,
      wrapperCode: mockedWrapperCode || originWrapperCode,
      ...abstractMeta,
      // Primary compilation = mocked (when available), else origin
      debugOutput: (mockedResult ?? originResult).stdout + (mockedResult ?? originResult).stderr,
      debugSuccess: (mockedResult ?? originResult).success,
      symPath: mockedSymPath ?? originSymPath,
      constraintsJsonPath: mockedConstraintsJsonPath ?? originConstraintsJsonPath,
      // Origin compilation (always available)
      originSymPath,
      originConstraintsJsonPath,
    };

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

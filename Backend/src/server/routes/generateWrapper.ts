import { FastifyRequest, FastifyReply } from 'fastify';
import { ProjectLoader } from '../../core/project/loadProject.js';
import { IncludeResolver } from '../../core/resolver/includeResolver.js';
import { DependencyGraph } from '../../core/resolver/dependencyGraph.js';
import { ErrorCollector } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { generate_wrapper_request, generate_wrapper_response } from '../../types/circuitParser.js';
import { compileDebug, getCircomArtifactPaths } from '../compilations/compileDebug.js';
import { compileOptimized } from '../compilations/compileOptimized.js';
import { compileBasic } from '../compilations/compileBasic.js';
import { buildPartialDebuggingBundle } from '../../core/partialDebugging/build.js';
import { savePartialDebuggingBuild } from '../../core/partialDebugging/store.js';
import { assembleMockedSource, assembleOriginSource, buildStandaloneTemplateSource } from '../../core/mocking/templateSourceExtractor.js';
import { AbstractWrapperGenerator } from '../../core/abstractCompile/index.js';
import { PathGuard } from '../../core/project/pathGuard.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import {
  parseSymFile,
  parseConstraintsFile,
  humanizeConstraintSystem,
  formatConstraintSystemWithNames,
  type HumanReadableConstraint,
} from '../../core/utils/symbolParser.js';

export async function resolveR1csDiagramPayload(
  symPath: string,
  constraintsJsonPath: string
): Promise<Pick<generate_wrapper_response, 'r1csConstraints' | 'r1csEquationText'>> {
  const symEntries = await parseSymFile(symPath);
  const constraints = await parseConstraintsFile(constraintsJsonPath);

  return {
    r1csConstraints: humanizeConstraintSystem(constraints, symEntries),
    r1csEquationText: formatConstraintSystemWithNames(constraints, symEntries),
  };
}

export async function generateWrapperHandler(
  request: FastifyRequest<{ Body: generate_wrapper_request }>,
  reply: FastifyReply
) {
  try {
    const { templateName, params, publicParams, publicSignals, repo, entry, templatePath } = request.body;
    const confirmedTemplateNames = request.body.confirmedTemplateNames ?? [];
    const mode = request.body.mode ?? 'interface-mock';

    const pathGuard = new PathGuard();
    const safeTemplateName = templateName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/[_]+/g, '_')
      || 'template';

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
    logger.info(`Include paths: ${includePaths.join(', ')}`);

    // --- Generate standalone origin and effective mocked source ---

    const standaloneSource = buildStandaloneTemplateSource(parsedFiles, templateDef.template);
    let effectiveTemplateSource = standaloneSource.selectedSource;
    let effectiveTemplateName = templateDef.template.name;
    let mockedChildren: string[] = [];
    let unmockedChildren: string[] = [];
    let validatorWarnings: generate_wrapper_response['validatorWarnings'] = [];
    let boundaryInputs: Array<{ instance: string; signal: string; isArray: boolean }> = [];

    if (confirmedTemplateNames.length > 0) {
      const generator = new AbstractWrapperGenerator(parsedFiles);
      const abstractResult = generator.build(
        templateDef.template,
        confirmedTemplateNames,
        params,
        publicSignals,
        { originalFilePath: templateDef.filePath || '' },
      );
      mockedChildren = abstractResult.mockedChildren;
      unmockedChildren = abstractResult.unmockedChildren;
      validatorWarnings = abstractResult.validatorWarnings;
      boundaryInputs = abstractResult.boundaryInputs;
      if (mockedChildren.length > 0) {
        effectiveTemplateSource = abstractResult.templateSource;
        effectiveTemplateName = abstractResult.entryTemplateName;
      }
    }

    const abstractMeta: Partial<generate_wrapper_response> = {
      abstractCompile: mockedChildren.length > 0,
      mockedChildren,
      unmockedChildren,
      validatorWarnings,
      boundaryInputs,
    };
    const originCode = assembleOriginSource(standaloneSource);
    const mockedCode = assembleMockedSource({
      bundle: standaloneSource,
      selectedSource: effectiveTemplateSource,
      entryTemplateName: effectiveTemplateName,
      params,
      publicSignals,
      eliminatedTemplateNames: mockedChildren,
    });

    const timestamp = Date.now();
    const mockedFilesDir = join(pathGuard.getMockedFilesRoot(), `mocked_${safeTemplateName}_${timestamp}`);
    await fs.mkdir(mockedFilesDir, { recursive: true });
    const originFilePath = join(mockedFilesDir, 'origin.circom');
    const mockedFilePath = join(mockedFilesDir, 'mocked.circom');
    await Promise.all([
      fs.writeFile(originFilePath, originCode, 'utf-8'),
      fs.writeFile(mockedFilePath, mockedCode, 'utf-8'),
    ]);
    logger.info(`Selected template source written to: ${originFilePath}`);
    logger.info(`Effective mocked source written to: ${mockedFilePath}`);

    const mockedParsedFile = await projectLoader.parseFile(mockedFilePath);
    parsedFiles.set(mockedFilePath.replace(/\\/g, '/'), mockedParsedFile);
    const effectiveRootTemplate = mockedParsedFile.templates.find((template: any) => template.name === effectiveTemplateName) ?? templateDef.template;

    const primaryWrapperPath = mockedFilePath;
    const primaryDir = join(mockedFilesDir, 'O0');
    const primaryDebugResult = await compileDebug(primaryWrapperPath, includePaths, primaryDir);
    const primaryArtifacts = getCircomArtifactPaths(primaryWrapperPath, primaryDir);
    const primarySymPath = primaryArtifacts.symPath;
    const primaryConstraintsJsonPath = primaryArtifacts.constraintsJsonPath;
    logger.info(`Mocked O0 compilation ${primaryDebugResult.success ? 'succeeded' : 'failed'}`);
    const optimizedDir = join(mockedFilesDir, 'O2');
    const optimizedResult = await compileOptimized(primaryWrapperPath, includePaths, optimizedDir);
    logger.info(`Primary optimized compilation ${optimizedResult.success ? 'succeeded' : 'failed'}`);

    const basicDir = join(mockedFilesDir, 'O1');
    const basicResult = await compileBasic(primaryWrapperPath, includePaths, basicDir);
    logger.info(`Primary basic O1 compilation ${basicResult.success ? 'succeeded' : 'failed'}`);

    // --- Resolve primary R1CS for diagram ---

    let r1csConstraints: HumanReadableConstraint[] = [];
    let r1csEquationText = '';
    let partialDebugging: generate_wrapper_response['partialDebugging'];

    if (primaryDebugResult.success) {
      try {
        const payload = await resolveR1csDiagramPayload(primarySymPath, primaryConstraintsJsonPath);
        r1csConstraints = payload.r1csConstraints ?? [];
        r1csEquationText = payload.r1csEquationText ?? '';
        logger.info(`Resolved primary R1CS for diagram: ${r1csConstraints.length} constraints`);
      } catch (error: any) {
        logger.warn(`Failed to resolve primary R1CS for diagram: ${error.message}`);
      }
    }

    // --- Build response ---
    if (primaryDebugResult.success && basicResult.success && optimizedResult.success) {
      try {
        const bundle = await buildPartialDebuggingBundle({
          parsedFiles,
          rootTemplate: effectiveRootTemplate,
          params,
          selectedComponentPath: templatePath.join('.') || 'main',
          mockedTemplateNames: confirmedTemplateNames,
          boundaryInputs,
          artifacts: {
            O0: getCircomArtifactPaths(primaryWrapperPath, primaryDir),
            O1: getCircomArtifactPaths(primaryWrapperPath, basicDir),
            O2: getCircomArtifactPaths(primaryWrapperPath, optimizedDir),
          },
        });
        savePartialDebuggingBuild(bundle);
        partialDebugging = bundle.summary;
      } catch (error: any) {
        logger.warn(`Failed to build Partial Debugging graphs: ${error.message}`);
      }
    }

    const results: generate_wrapper_response = {
      success: true,
      wrapperCode: mockedCode,
      ...abstractMeta,
      // Primary compilation = mocked (when available), else origin
      debugOutput: primaryDebugResult.stdout + primaryDebugResult.stderr,
      debugSuccess: primaryDebugResult.success,
      optimizedOutput: optimizedResult.stdout + optimizedResult.stderr,
      optimizedSuccess: optimizedResult.success,
      symPath: primarySymPath,
      constraintsJsonPath: primaryConstraintsJsonPath,
      r1csConstraints,
      r1csEquationText,
      partialDebugging,
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


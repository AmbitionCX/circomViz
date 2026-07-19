import { FastifyRequest, FastifyReply } from 'fastify';
import { ProjectLoader } from '../../core/project/loadProject.js';
import { IncludeResolver } from '../../core/resolver/includeResolver.js';
import { ErrorCollector } from '../../utils/errors.js';
import { runStaticAnalysisOnFiles } from '../../core/staticAnalyzer/analyzer.js';
import { logger } from '../../utils/logger.js';
import { PathGuard } from '../../core/project/pathGuard.js';
import type { static_analysis_request, static_analysis_response } from '../../types/circuitParser.js';
import * as fs from 'fs/promises';

export async function staticAnalysisHandler(
  request: FastifyRequest<{ Body: static_analysis_request }>,
  reply: FastifyReply
) {
  try {
    const { repo, entry, symPath, constraintsJsonPath } = request.body;

    logger.info(`Running static analysis on project: ${repo}, entry: ${entry}`);

    if (!symPath || !constraintsJsonPath) {
      return reply.code(400).send({
        success: false,
        findings: [],
        error: 'symPath and constraintsJsonPath are required',
      });
    }

    const pathGuard = new PathGuard();
    const artifactValidation = pathGuard.validateGeneratedArtifactPaths(symPath, constraintsJsonPath);
    if (!artifactValidation.valid) {
      return reply.code(400).send({
        success: false,
        findings: [],
        error: artifactValidation.error,
      });
    }

    const errorCollector = new ErrorCollector();
    const projectLoader = new ProjectLoader();
    const includeResolver = new IncludeResolver(errorCollector);

    const loadResult = await projectLoader.loadProject({
      repoName: repo,
      entryPath: entry,
      rootComponent: 'main',
      basePath: ''
    });

    if (loadResult.error) {
      return reply.code(400).send({
        success: false,
        findings: [],
        error: `Failed to load project: ${loadResult.error}`
      });
    }

    const entryFile = loadResult.entryFile;
    const repoPath = loadResult.repoPath || '';

    if (repoPath) {
      includeResolver.setCurrentRepoPath(repoPath);
    }
    includeResolver.setCurrentFile(entryFile.path);

    const filesToAnalyze: Array<{ ast: any[]; path: string }> = [];
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
        logger.info(`Parsing file for static analysis: ${normalizedPath}`);
        const parsedFile = await projectLoader.parseFile(currentFile.path);
        filesToAnalyze.push({ ast: parsedFile.ast, path: normalizedPath });

        for (const include of parsedFile.includes) {
          includeResolver.setCurrentFile(normalizedPath);
          const resolvedPath = await includeResolver.resolveInclude(include);

          if (resolvedPath) {
            const normalizedIncludePath = resolvedPath.replace(/\\/g, '/');

            if (!processedPaths.has(normalizedIncludePath)) {
              try {
                const content = await fs.readFile(resolvedPath, 'utf-8');
                filesToProcess.push({
                  path: resolvedPath,
                  content,
                  relativePath: include.path
                });
              } catch {
                logger.warn(`Cannot read included file: ${normalizedIncludePath}`);
              }
            }
          }
        }
      } catch (error: any) {
        logger.warn(`Failed to parse file ${normalizedPath} for static analysis: ${error.message}`);
      }
    }

    logger.info(`Parsed ${filesToAnalyze.length} files for static analysis`);

    const findings = runStaticAnalysisOnFiles(
      filesToAnalyze,
      artifactValidation.symPath!,
      artifactValidation.constraintsJsonPath!
    );

    const response: static_analysis_response = {
      success: true,
      findings
    };

    logger.info(`Static analysis completed: ${findings.length} findings`);

    reply.send(response);

  } catch (error: any) {
    logger.error(`Error running static analysis: ${error.message}`);
    reply.code(500).send({
      success: false,
      findings: [],
      error: error.message
    });
  }
}

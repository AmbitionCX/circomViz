import { FastifyRequest, FastifyReply } from 'fastify';
import { ProjectLoader } from '../../core/project/loadProject.js';
import { VerificationEngine } from '../../core/solver/verificationEngine.js';
import { OutputSignalIdentifier } from '../../core/soundness/outputIdentifier.js';
import { parseSymFile, parseConstraintsFile } from '../../core/utils/symbolParser.js';
import { PathGuard } from '../../core/project/pathGuard.js';
import { logger } from '../../utils/logger.js';
import type {
  soundness_check_request,
  soundness_check_response,
} from '../../types/soundnessTypes.js';

export async function soundnessCheckHandler(
  request: FastifyRequest<{ Body: soundness_check_request }>,
  reply: FastifyReply
) {
  try {
    const { repo, entry, symPath, constraintsJsonPath, constraintIndices, queries } = request.body;

    logger.info(`Running soundness check on project: ${repo}, entry: ${entry}`);

    const projectLoader = new ProjectLoader();
    const loadResult = await projectLoader.loadProject({
      repoName: repo,
      entryPath: entry,
      rootComponent: 'main',
      basePath: ''
    });

    if (loadResult.error) {
      return reply.code(400).send({
        success: false,
        results: {},
        error: `Failed to load project: ${loadResult.error}`
      });
    }

    const pathGuard = new PathGuard();
    const artifactValidation = pathGuard.validateGeneratedArtifactPaths(symPath, constraintsJsonPath);
    if (!artifactValidation.valid) {
      return reply.code(400).send({
        success: false,
        results: {},
        error: artifactValidation.error,
      });
    }

    const validatedSymPath = artifactValidation.symPath!;
    const validatedConstraintsPath = artifactValidation.constraintsJsonPath!;

    const absoluteEntryPath = loadResult.entryFile.path;

    const symbols = await parseSymFile(validatedSymPath);
    let constraints = await parseConstraintsFile(validatedConstraintsPath);

    if (constraintIndices && constraintIndices.length > 0) {
      const indexSet = new Set(constraintIndices);
      const originalLen = constraints.length;
      constraints = constraints.filter((_, i) => indexSet.has(i));
      logger.info(`Filtered constraints: ${constraints.length}/${originalLen} (slice scope)`);
    }

    logger.info(`Loaded ${symbols.length} symbols, ${constraints.length} constraints`);

    const primeField = process.env.P;
    if (!primeField) {
      throw new Error('Prime field P not configured in .env');
    }

    const engine = new VerificationEngine(primeField);
    const identifier = new OutputSignalIdentifier();
    const results: soundness_check_response['results'] = {};

    if (queries.satisfiability) {
      logger.info('Running satisfiability check...');
      results.satisfiability = await engine.checkSatisfiability(constraints, symbols);
      logger.info(
        `Satisfiability: ${results.satisfiability.satisfiable ? 'SAT' : 'UNSAT'} ` +
        `(${results.satisfiability.executionTimeMs.toFixed(0)}ms)`
      );
    }

    if (queries.determinism) {
      logger.info('Running output determinism check...');
      const classification = await identifier.classifySignals(repo, absoluteEntryPath, symbols);

      logger.info(
        `Inputs: [${classification.inputIndices.join(', ')}], ` +
        `Outputs: [${classification.outputIndices.join(', ')}]`
      );

      results.determinism = await engine.checkDeterminism(
        constraints,
        classification.inputIndices,
        classification.outputIndices,
        symbols
      );
      logger.info(
        `Determinism: ${results.determinism.deterministic ? 'DETERMINISTIC' : 'NON-DETERMINISTIC'} ` +
        `(${results.determinism.executionTimeMs.toFixed(0)}ms)`
      );
    }

    if (queries.coverage) {
      logger.info('Running key constraint coverage check...');

      const targetIndices = identifier.mapSignalNamesToIndices(
        queries.coverage.signalNames,
        symbols
      );

      logger.info(`Target signals: [${targetIndices.join(', ')}]`);

      results.coverage = await engine.checkCoverage(
        constraints,
        targetIndices,
        queries.coverage.fixedInputs ?? {},
        symbols
      );
      logger.info(
        `Coverage: ${results.coverage.covered ? 'COVERED' : 'NOT COVERED'} ` +
        `(${results.coverage.executionTimeMs.toFixed(0)}ms)`
      );
    }

    const response: soundness_check_response = {
      success: true,
      results,
    };

    reply.send(response);

  } catch (error: any) {
    logger.error(`Soundness check failed: ${error.message}`);
    reply.code(500).send({
      success: false,
      results: {},
      error: error.message,
    });
  }
}

import { FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs/promises';
import { ProjectLoader } from '../../core/project/loadProject.js';
import { VerificationEngine } from '../../core/solver/verificationEngine.js';
import { OutputSignalIdentifier } from '../../core/soundness/outputIdentifier.js';
import { logger } from '../../utils/logger.js';
import type {
  soundness_check_request,
  soundness_check_response,
} from '../../types/soundnessTypes.js';
import type { SymbolObject, ConstraintObject } from '../../types/constraint.js';

async function parseSymFile(symPath: string): Promise<SymbolObject[]> {
  const content = await fs.readFile(symPath, 'utf-8');
  const lines = content.trim().split('\n');
  return lines
    .filter(line => line.trim().length > 0)
    .map(line => {
      const fields = line.split(',');
      return {
        index: parseInt(fields[0]),
        witness: parseInt(fields[1]),
        component: parseInt(fields[2]),
        name: fields[3].trim(),
      };
    });
}

async function parseConstraintsFile(constraintsJsonPath: string): Promise<ConstraintObject[]> {
  const content = await fs.readFile(constraintsJsonPath, 'utf-8');
  const json = JSON.parse(content);
  return json.constraints.map(
    (triple: Array<Record<string, string | number>>) => triple as ConstraintObject
  );
}

export async function soundnessCheckHandler(
  request: FastifyRequest<{ Body: soundness_check_request }>,
  reply: FastifyReply
) {
  try {
    const { repo, entry, symPath, constraintsJsonPath, queries } = request.body;

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

    const absoluteEntryPath = loadResult.entryFile.path;

    const symbols = await parseSymFile(symPath);
    const constraints = await parseConstraintsFile(constraintsJsonPath);

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

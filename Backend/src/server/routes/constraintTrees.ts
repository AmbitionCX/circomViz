import { FastifyRequest, FastifyReply } from 'fastify';
import { ConstraintIndexer } from '../../core/indexer/constraintIndex.js';
import { parseConstraintsFile, parseSymFile, resolveConstraintTrees } from '../../core/utils/symbolParser.js';
import { normalizeConstraints } from '../../core/utils/constraintNormalizer.js';
import { PathGuard } from '../../core/project/pathGuard.js';
import { logger } from '../../utils/logger.js';
import type { ConstraintTreesRequest, ConstraintTreesResponse, ConstraintTree } from '../../types/slicerTypes.js';

const MAX_CONSTRAINT_INDICES = 500;

export async function constraintTreesHandler(
  request: FastifyRequest<{ Body: ConstraintTreesRequest }>,
  reply: FastifyReply
) {
  try {
    const { symPath, constraintsJsonPath, constraintIndices } = request.body;

    if (!symPath || !constraintsJsonPath || !constraintIndices) {
      return reply.code(400).send({
        success: false,
        trees: [],
        error: 'symPath, constraintsJsonPath, and constraintIndices are required',
      } as ConstraintTreesResponse);
    }

    const pathGuard = new PathGuard();
    const artifactValidation = pathGuard.validateGeneratedArtifactPaths(symPath, constraintsJsonPath);
    if (!artifactValidation.valid) {
      return reply.code(400).send({
        success: false,
        trees: [],
        error: artifactValidation.error,
      } as ConstraintTreesResponse);
    }

    const validatedSymPath = artifactValidation.symPath!;
    const validatedConstraintsPath = artifactValidation.constraintsJsonPath!;

    if (constraintIndices.length > MAX_CONSTRAINT_INDICES) {
      return reply.code(400).send({
        success: false,
        trees: [],
        error: `constraintIndices exceeds maximum of ${MAX_CONSTRAINT_INDICES}`,
      } as ConstraintTreesResponse);
    }

    logger.info(`Resolving constraint trees: sym=${validatedSymPath}, indices=${constraintIndices.length}`);

    const [symEntries, allConstraints] = await Promise.all([
      parseSymFile(validatedSymPath),
      parseConstraintsFile(validatedConstraintsPath),
    ]);

    const indexSet = new Set(constraintIndices);
    const filtered = allConstraints.filter((_, idx) => indexSet.has(idx));

    const trees = resolveConstraintTrees(filtered, symEntries);
    const { invariants } = normalizeConstraints(filtered, symEntries);

    const merged: ConstraintTree[] = trees.map((tree, i) => ({
      index: tree.index,
      kind: i < invariants.length ? invariants[i].kind : tree.kind,
      description: i < invariants.length ? invariants[i].description : tree.description,
      a: tree.a,
      b: tree.b,
      c: tree.c,
    }));

    logger.info(`Constraint trees: ${merged.length} trees resolved`);

    reply.send({
      success: true,
      trees: merged,
    } as ConstraintTreesResponse);
  } catch (error: any) {
    logger.error(`Error resolving constraint trees: ${error.message}`);
    reply.code(500).send({
      success: false,
      trees: [],
      error: error.message,
    } as ConstraintTreesResponse);
  }
}

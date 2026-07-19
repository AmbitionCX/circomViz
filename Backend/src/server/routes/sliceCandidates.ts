import { FastifyRequest, FastifyReply } from 'fastify';
import { ConstraintIndexer } from '../../core/indexer/constraintIndex.js';
import { generateSliceCandidates } from '../../core/slicer/coneOfInfluence.js';
import { PathGuard } from '../../core/project/pathGuard.js';
import { logger } from '../../utils/logger.js';
import type { SliceCandidatesRequest, SliceCandidatesResponse } from '../../types/slicerTypes.js';

export async function sliceCandidatesHandler(
  request: FastifyRequest<{ Body: SliceCandidatesRequest }>,
  reply: FastifyReply
) {
  try {
    const { symPath, constraintsJsonPath } = request.body;

    if (!symPath || !constraintsJsonPath) {
      return reply.code(400).send({
        success: false,
        candidates: [],
        error: 'symPath and constraintsJsonPath are required',
      } as SliceCandidatesResponse);
    }

    const pathGuard = new PathGuard();
    const artifactValidation = pathGuard.validateGeneratedArtifactPaths(symPath, constraintsJsonPath);
    if (!artifactValidation.valid) {
      return reply.code(400).send({
        success: false,
        candidates: [],
        error: artifactValidation.error,
      } as SliceCandidatesResponse);
    }

    logger.info(`Generating slice candidates: sym=${artifactValidation.symPath}, constraints=${artifactValidation.constraintsJsonPath}`);

    const indexer = new ConstraintIndexer();
    const { index } = await indexer.loadOrBuild(
      artifactValidation.symPath!,
      artifactValidation.constraintsJsonPath!
    );

    const candidates = generateSliceCandidates(index);

    logger.info(`Slice candidates: ${candidates.length} candidates generated`);

    reply.send({
      success: true,
      candidates,
    } as SliceCandidatesResponse);
  } catch (error: any) {
    logger.error(`Error generating slice candidates: ${error.message}`);
    reply.code(500).send({
      success: false,
      candidates: [],
      error: error.message,
    } as SliceCandidatesResponse);
  }
}

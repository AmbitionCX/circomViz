import { FastifyRequest, FastifyReply } from 'fastify';
import { ConstraintIndexer } from '../../core/indexer/constraintIndex.js';
import { PathGuard } from '../../core/project/pathGuard.js';
import { logger } from '../../utils/logger.js';
import type {
  BuildConstraintIndexRequest,
  BuildConstraintIndexResponse,
} from '../../types/slicerTypes.js';

export async function buildConstraintIndexHandler(
  request: FastifyRequest<{ Body: BuildConstraintIndexRequest }>,
  reply: FastifyReply
) {
  try {
    const { symPath, constraintsJsonPath } = request.body;

    if (!symPath || !constraintsJsonPath) {
      return reply.code(400).send({
        success: false,
        error: 'symPath and constraintsJsonPath are required',
      } as BuildConstraintIndexResponse);
    }

    const pathGuard = new PathGuard();
    const artifactValidation = pathGuard.validateGeneratedArtifactPaths(symPath, constraintsJsonPath);
    if (!artifactValidation.valid) {
      return reply.code(400).send({
        success: false,
        error: artifactValidation.error,
      } as BuildConstraintIndexResponse);
    }

    logger.info(`Building constraint index: sym=${artifactValidation.symPath}, constraints=${artifactValidation.constraintsJsonPath}`);

    const indexer = new ConstraintIndexer();
    const { index, cachePath } = await indexer.loadOrBuild(
      artifactValidation.symPath!,
      artifactValidation.constraintsJsonPath!
    );

    const response: BuildConstraintIndexResponse = {
      success: true,
      metadata: index.metadata,
      cachePath,
    };

    logger.info(`Index built: ${index.metadata.signalCount} signals, ${index.metadata.constraintCount} constraints, ${index.metadata.componentCount} components in ${index.metadata.buildTimeMs.toFixed(0)}ms`);

    reply.send(response);
  } catch (error: any) {
    logger.error(`Error building constraint index: ${error.message}`);
    reply.code(500).send({
      success: false,
      error: error.message,
    } as BuildConstraintIndexResponse);
  }
}

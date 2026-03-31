import { FastifyRequest, FastifyReply } from 'fastify';
import { ConstraintIndexer } from '../../core/indexer/constraintIndex.js';
import { ConeOfInfluenceSlicer, sliceWithConstraints } from '../../core/slicer/coneOfInfluence.js';
import { logger } from '../../utils/logger.js';
import type { SliceRequest, SliceResponse } from '../../types/slicerTypes.js';

export async function coneSliceHandler(
  request: FastifyRequest<{ Body: SliceRequest }>,
  reply: FastifyReply
) {
  try {
    const { symPath, constraintsJsonPath, direction, targetSignals, sourceSignals, maxDepth } = request.body;

    if (!symPath || !constraintsJsonPath) {
      return reply.code(400).send({
        success: false,
        error: 'symPath and constraintsJsonPath are required',
      } as SliceResponse);
    }

    if (!targetSignals || targetSignals.length === 0) {
      return reply.code(400).send({
        success: false,
        error: 'targetSignals must be non-empty',
      } as SliceResponse);
    }

    logger.info(`Cone slice: direction=${direction}, targets=${targetSignals.join(',')}, maxDepth=${maxDepth || 'unlimited'}`);

    const indexer = new ConstraintIndexer();
    const { index, symEntries, constraints } = await indexer.loadOrBuild(symPath, constraintsJsonPath);

    const sliceResult = await sliceWithConstraints(
      index,
      symEntries,
      constraints,
      direction,
      targetSignals,
      sourceSignals,
      maxDepth
    );

    if (sliceResult.signalCount === 0) {
      return reply.code(400).send({
        success: false,
        error: `No matching signals found for: ${targetSignals.join(', ')}`,
      } as SliceResponse);
    }

    const totalConstraints = index.metadata.constraintCount;
    const totalSignals = index.metadata.signalCount;
    const reductionPercent = totalConstraints > 0
      ? Math.round((1 - sliceResult.constraintCount / totalConstraints) * 100)
      : 0;

    logger.info(`Slice result: ${sliceResult.constraintCount}/${totalConstraints} constraints (${reductionPercent}% reduction), ${sliceResult.signalCount}/${totalSignals} signals`);

    reply.send({
      success: true,
      slice: sliceResult,
      totalConstraintCount: totalConstraints,
      totalSignalCount: totalSignals,
      reductionPercent,
    } as SliceResponse);
  } catch (error: any) {
    logger.error(`Error in cone slice: ${error.message}`);
    reply.code(500).send({
      success: false,
      error: error.message,
    } as SliceResponse);
  }
}

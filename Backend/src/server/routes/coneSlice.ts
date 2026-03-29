import { FastifyRequest, FastifyReply } from 'fastify';
import { ConstraintIndexer } from '../../core/indexer/constraintIndex.js';
import { ConeOfInfluenceSlicer } from '../../core/slicer/coneOfInfluence.js';
import { logger } from '../../utils/logger.js';
import type { SliceRequest, ConeSliceResponse } from '../../types/slicerTypes.js';

export async function coneSliceHandler(
  request: FastifyRequest<{ Body: SliceRequest }>,
  reply: FastifyReply
) {
  try {
    const { symPath, constraintsJsonPath, direction, targetSignals, sourceSignals, maxDepth } = request.body;

    if (!symPath || !constraintsJsonPath) {
      return reply.code(400).send({
        success: false,
        slice: null,
        error: 'symPath and constraintsJsonPath are required',
      } as ConeSliceResponse);
    }

    if (!targetSignals || targetSignals.length === 0) {
      return reply.code(400).send({
        success: false,
        slice: null,
        error: 'targetSignals must be non-empty',
      } as ConeSliceResponse);
    }

    logger.info(`Cone slice: direction=${direction}, targets=${targetSignals.join(',')}, maxDepth=${maxDepth || 'unlimited'}`);

    const indexer = new ConstraintIndexer();
    const { data } = await indexer.loadOrBuild(symPath, constraintsJsonPath);

    const slicer = new ConeOfInfluenceSlicer(data);

    const targetIndices = slicer.resolveSignalNames(targetSignals);
    if (targetIndices.length === 0) {
      return reply.code(400).send({
        success: false,
        slice: null,
        error: `No matching signals found for: ${targetSignals.join(', ')}`,
      } as ConeSliceResponse);
    }

    let sourceIndices: number[] | undefined;
    if (sourceSignals && sourceSignals.length > 0) {
      sourceIndices = slicer.resolveSignalNames(sourceSignals);
    }

    const sliceData = slicer.slice(direction, targetIndices, sourceIndices, maxDepth);
    const sliceResult = await slicer.buildSliceResult(sliceData, symPath, constraintsJsonPath);

    logger.info(`Slice result: ${sliceResult.constraintCount} constraints (${sliceResult.reductionPercent}% reduction), ${sliceResult.signalCount} signals`);

    reply.send({ success: true, slice: sliceResult } as ConeSliceResponse);
  } catch (error: any) {
    logger.error(`Error in cone slice: ${error.message}`);
    reply.code(500).send({
      success: false,
      slice: null,
      error: error.message,
    } as ConeSliceResponse);
  }
}

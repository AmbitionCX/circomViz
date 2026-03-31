import { FastifyRequest, FastifyReply } from 'fastify';
import { ConstraintIndexer } from '../../core/indexer/constraintIndex.js';
import { RefinementExpander } from '../../core/contract/refinementExpander.js';
import { logger } from '../../utils/logger.js';
import type { RefinementExpandRequest, RefinementExpandResponse, TemplateContract } from '../../types/contractTypes.js';

export async function refinementExpandHandler(
  request: FastifyRequest<{ Body: RefinementExpandRequest }>,
  reply: FastifyReply
) {
  try {
    const { symPath, constraintsJsonPath, templateName, childContracts, expandedChildren, constraintIndices, queries } = request.body;

    if (!symPath || !constraintsJsonPath) {
      return reply.code(400).send({
        success: false,
        suspectChildren: [],
        refinementNeeded: false,
        error: 'symPath and constraintsJsonPath are required',
      } as RefinementExpandResponse);
    }

    if (!expandedChildren || expandedChildren.length === 0) {
      return reply.code(400).send({
        success: false,
        suspectChildren: [],
        refinementNeeded: false,
        error: 'expandedChildren must be non-empty',
      } as RefinementExpandResponse);
    }

    logger.info(`Refinement expansion: template=${templateName}, expanding=${expandedChildren.join(',')}`);

    const indexer = new ConstraintIndexer();
    const { index } = await indexer.loadOrBuild(symPath, constraintsJsonPath);

    const expander = new RefinementExpander(index);
    const { results, suspectChildren, refinementNeeded } = await expander.refine(
      symPath,
      constraintsJsonPath,
      templateName,
      childContracts,
      expandedChildren,
      queries || { checkSatisfiability: true, checkDeterminism: true },
      constraintIndices
    );

    logger.info(`Refinement done: suspects=${suspectChildren.join(',')}, refinementNeeded=${refinementNeeded}`);

    reply.send({
      success: true,
      results,
      suspectChildren,
      refinementNeeded,
    } as RefinementExpandResponse);
  } catch (error: any) {
    logger.error(`Error in refinement expansion: ${error.message}`);
    reply.code(500).send({
      success: false,
      suspectChildren: [],
      refinementNeeded: false,
      error: error.message,
    } as RefinementExpandResponse);
  }
}

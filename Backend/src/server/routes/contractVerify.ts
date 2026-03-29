import { FastifyRequest, FastifyReply } from 'fastify';
import { ConstraintIndexer } from '../../core/indexer/constraintIndex.js';
import { ContractBasedVerifier } from '../../core/contract/contractBasedVerifier.js';
import { logger } from '../../utils/logger.js';
import type { ContractVerifyRequest, ContractVerifyResponse, TemplateContract } from '../../types/contractTypes.js';

export async function contractVerifyHandler(
  request: FastifyRequest<{ Body: ContractVerifyRequest }>,
  reply: FastifyReply
) {
  try {
    const { symPath, constraintsJsonPath, templateName, childContracts, queries } = request.body;

    if (!symPath || !constraintsJsonPath) {
      return reply.code(400).send({
        success: false,
        suspectChildren: [],
        refinementNeeded: false,
        error: 'symPath and constraintsJsonPath are required',
      } as ContractVerifyResponse);
    }

    if (!childContracts || childContracts.length === 0) {
      return reply.code(400).send({
        success: false,
        suspectChildren: [],
        refinementNeeded: false,
        error: 'At least one child contract is required',
      } as ContractVerifyResponse);
    }

    logger.info(`Contract-based verification: template=${templateName}, children=${childContracts.map((c: TemplateContract) => c.instancePath).join(',')}`);

    const indexer = new ConstraintIndexer();
    const { data } = await indexer.loadOrBuild(symPath, constraintsJsonPath);

    const verifier = new ContractBasedVerifier(data);
    const { results, suspectChildren, refinementNeeded } = await verifier.verify(
      symPath,
      constraintsJsonPath,
      templateName,
      childContracts,
      queries || { checkSatisfiability: true, checkDeterminism: true }
    );

    logger.info(`Contract verification done: suspects=${suspectChildren.join(',')}, refinementNeeded=${refinementNeeded}`);

    reply.send({
      success: true,
      results,
      suspectChildren,
      refinementNeeded,
    } as ContractVerifyResponse);
  } catch (error: any) {
    logger.error(`Error in contract verification: ${error.message}`);
    reply.code(500).send({
      success: false,
      suspectChildren: [],
      refinementNeeded: false,
      error: error.message,
    } as ContractVerifyResponse);
  }
}

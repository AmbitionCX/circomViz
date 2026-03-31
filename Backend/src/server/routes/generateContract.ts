import { FastifyRequest, FastifyReply } from 'fastify';
import { ContractGenerator } from '../../core/contract/contractGenerator.js';
import { logger } from '../../utils/logger.js';
import type { GenerateContractRequest, GenerateContractResponse } from '../../types/contractTypes.js';

export async function generateContractHandler(
  request: FastifyRequest<{ Body: GenerateContractRequest }>,
  reply: FastifyReply
) {
  try {
    const { symPath, constraintsJsonPath, templateName, instancePath, constraintIndices, soundnessResult, intentResult, formalResult } = request.body;

    if (!symPath || !constraintsJsonPath || !templateName || !instancePath) {
      return reply.code(400).send({
        success: false,
        contract: null,
        error: 'symPath, constraintsJsonPath, templateName, and instancePath are required',
      } as GenerateContractResponse);
    }

    logger.info(`Generating contract: template=${templateName}, instance=${instancePath}`);

    const generator = new ContractGenerator();
    const contract = await generator.generate(
      symPath,
      constraintsJsonPath,
      templateName,
      instancePath,
      constraintIndices,
      soundnessResult,
      intentResult,
      formalResult
    );

    logger.info(`Contract generated: ${contract.assumptions.length} assumptions, ${contract.guarantees.length} guarantees, ${contract.invariants.length} invariants`);

    reply.send({ success: true, contract } as GenerateContractResponse);
  } catch (error: any) {
    logger.error(`Error generating contract: ${error.message}`);
    reply.code(500).send({
      success: false,
      contract: null,
      error: error.message,
    } as GenerateContractResponse);
  }
}

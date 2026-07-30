import { FastifyRequest, FastifyReply } from 'fastify';
import { ContractGenerator } from '../../core/contract/contractGenerator.js';
import { PathGuard } from '../../core/project/pathGuard.js';
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

    const pathGuard = new PathGuard();
    const artifactValidation = pathGuard.validateGeneratedArtifactPaths(symPath, constraintsJsonPath);
    if (!artifactValidation.valid) {
      return reply.code(400).send({
        success: false,
        contract: null,
        error: artifactValidation.error,
      } as GenerateContractResponse);
    }

    const startedAt = Date.now();
    logger.info(`Contract generation started: template=${templateName}, instance=${instancePath}`);

    const generator = new ContractGenerator();
    const contract = await generator.generate(
      artifactValidation.symPath!,
      artifactValidation.constraintsJsonPath!,
      templateName,
      instancePath,
      constraintIndices,
      soundnessResult,
      intentResult,
      formalResult
    );

    logger.info(`Contract generation completed: template=${templateName}, assumptions=${contract.assumptions.length}, guarantees=${contract.guarantees.length}, invariants=${contract.invariants.length}, durationMs=${Date.now() - startedAt}`);

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

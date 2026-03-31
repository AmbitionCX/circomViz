import { FastifyRequest, FastifyReply } from 'fastify';
import { callLLM } from '../../core/llm/llmClient.js';
import { logger } from '../../utils/logger.js';

interface AiAdviceRequest {
  repo: string;
  entry: string;
  templateName: string;
  violation: {
    violatedSpec: string;
    inputValues: Record<string, string>;
    outputValues: Record<string, string>;
    solverOutput: string;
  };
  specDSL: string;
}

const SYSTEM_PROMPT = `You are a ZK circuit verification expert specializing in circom circuits.
The user is running a formal conformance check on a template and has encountered a violation.
Your job is to explain what the violation means in plain language and suggest how to fix it.

Guidelines:
- Explain what the violated constraint means
- Explain why the solver found a counterexample (if one exists)
- Suggest whether the spec DSL needs to be updated or whether the circuit has a bug
- If the spec DSL is wrong, suggest the correct fix
- If the circuit has a bug, describe what constraint is missing
- Keep your response concise (3-5 sentences max)
- Use English`;

export async function aiAdviceHandler(
  request: FastifyRequest<{ Body: AiAdviceRequest }>,
  reply: FastifyReply
) {
  try {
    const { templateName, violation, specDSL } = request.body;

    if (!templateName || !violation) {
      return reply.code(400).send({
        success: false,
        advice: 'Missing templateName or violation data',
      });
    }

    logger.info(`AI advice request for template: ${templateName}`);

    const userMessage = [
      `Template: ${templateName}`,
      ``,
      `Spec DSL:`,
      specDSL || '(no spec DSL provided)',
      ``,
      `Violation:`,
      violation.violatedSpec || '(no violated spec)',
      ``,
      `Counterexample witness:`,
      violation.inputValues && Object.keys(violation.inputValues).length > 0
        ? `Input signals: ${JSON.stringify(violation.inputValues)}`
        : '(no input signal values)',
      violation.outputValues && Object.keys(violation.outputValues).length > 0
        ? `Output signals: ${JSON.stringify(violation.outputValues)}`
        : '(no output signal values)',
    ].join('\n');

    const llmStart = Date.now();
    const result = await callLLM(SYSTEM_PROMPT, userMessage);
    logger.info(`AI advice LLM done in ${Date.now() - llmStart}ms, success=${result.success}`);

    if (result.success) {
      reply.send({
        success: true,
        advice: result.content,
      });
    } else {
      reply.send({
        success: false,
        advice: `Failed to get AI advice: ${result.error}`,
      });
    }
  } catch (error: any) {
    logger.error(`Error in AI advice: ${error.message}`);
    reply.code(500).send({
      success: false,
      advice: `Error: ${error.message}`,
    });
  }
}

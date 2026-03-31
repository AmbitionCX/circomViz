import { FastifyRequest, FastifyReply } from 'fastify';
import { callLLM } from '../../core/llm/llmClient.js';
import { logger } from '../../utils/logger.js';

interface AiAdviceRequest {
  repo: string;
  entry: string;
  templateName: string;
  sourceCode: string;
  sourceFile: string;
  lineRange: [number, number];
  violation: {
    violatedSpec: string;
    inputValues: Record<string, string>;
    outputValues: Record<string, string>;
    solverOutput: string;
  };
  specDSL: string;
}

const SYSTEM_PROMPT = `You are a ZK circuit verification expert specializing in circom circuits.
The user ran a formal conformance check and found a violation. You are given the raw circom source code.

Your response MUST be a JSON object with exactly 2 fields:

1. "explanation" (string, 1-2 short sentences): What the violation means and why it occurred.

2. "fix" (object with these fields):
   - "description" (string, 2-3 sentences): What specific lines in the source code need to change and why.
   - "modifiedCode" (string): The full corrected source code for this template, with the fix applied. Include line numbers matching the original format.
   - "changedLines" (number[]): The line numbers that were changed (1-indexed, relative to the provided source code).

Be precise about which line numbers need modification. Output valid JSON only. Use English.`;

export async function aiAdviceHandler(
  request: FastifyRequest<{ Body: AiAdviceRequest }>,
  reply: FastifyReply
) {
  try {
    const { templateName, sourceCode, sourceFile, lineRange, violation, specDSL } = request.body;

    if (!templateName || !violation) {
      return reply.code(400).send({
        success: false,
        advice: 'Missing templateName or violation data',
      });
    }

    logger.info(`AI advice request for template: ${templateName}`);

    const userMessage = [
      `Source file: ${sourceFile || 'unknown'}`,
      `Lines ${lineRange?.[0] || '?'}–${lineRange?.[1] || '?'}`,
      ``,
      `Source code:`,
      sourceCode || '(no source code provided)',
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
      let parsed: { explanation: string; fix: { description: string; modifiedCode: string; changedLines: number[] } };
      try {
        const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[1]);
        else parsed = JSON.parse(result.content);
      } catch {
        parsed = { explanation: result.content, fix: { description: '', modifiedCode: '', changedLines: [] } };
      }
      reply.send({ success: true, ...parsed });
    } else {
      reply.send({
        success: false,
        explanation: `Failed to get AI advice: ${result.error}`,
        fix: { description: '', modifiedCode: '', changedLines: [] },
      });
    }
  } catch (error: any) {
    logger.error(`Error in AI advice: ${error.message}`);
    reply.code(500).send({
      success: false,
      explanation: `Error: ${error.message}`,
      fix: { description: '', modifiedCode: '', changedLines: [] },
    });
  }
}

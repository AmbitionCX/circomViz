import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStructuredLLMOptions, callLLMStructured, getLLMConfiguration } from '../core/llm/llmClient.js';

const runLiveTest = process.env.RUN_LLM_CONNECTION_TEST === '1';

test('structured DeepSeek calls enable thinking by default', () => {
  assert.deepEqual(buildStructuredLLMOptions(), {
    json: true,
    thinking: 'enabled',
  });
});

test('connects to DeepSeek and receives structured JSON', {
  skip: runLiveTest ? false : 'set RUN_LLM_CONNECTION_TEST=1 to call the live DeepSeek API',
}, async (context) => {
  const configuration = getLLMConfiguration();
  context.diagnostic('provider=' + configuration.provider + ', model=' + configuration.model);

  const result = await callLLMStructured<{ ok: boolean }>(
    'You are a connection health check. Return JSON only.',
    'Return exactly this JSON object: {"ok":true}',
    { temperature: 0 },
  );

  assert.equal(
    result.success,
    true,
    result.success ? undefined : 'DeepSeek connection check failed: ' + result.error,
  );
  if (!result.success) return;

  assert.deepEqual(result.data, { ok: true });
});

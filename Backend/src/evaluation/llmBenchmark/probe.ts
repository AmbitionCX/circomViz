import { promises as fs } from 'fs';
import path from 'path';
import type {
  BenchmarkCase,
  BenchmarkConfigFile,
  BenchmarkModelConfig,
  ReadyBenchmarkCase,
} from './types.js';
import { callConfiguredModel, effectiveRequestConfig } from './modelClient.js';
import { readJsonFile, readJsonl, writeJsonFile } from './io.js';
import {
  buildTrackPayload,
  loadBenchmarkPrompt,
  modelConfigHash,
  normalizePrediction,
} from './runner.js';

interface ProbeCallResult {
  success: boolean;
  durationMs: number;
  validJson: boolean;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  normalizedIssueCount?: number;
  reasoningObserved?: boolean;
  reasoningChars?: number;
  apiAttempts?: number;
  error?: string;
}

export interface ModelProbeResult {
  modelId: string;
  provider: string;
  model: string;
  apiUrl: string;
  requiresApiKey: boolean;
  modelConfigHash: string;
  requestConfig: ReturnType<typeof effectiveRequestConfig>;
  connection: ProbeCallResult;
  realCase?: ProbeCallResult & { caseId: string };
}

function resultFromResponse(response: Awaited<ReturnType<typeof callConfiguredModel>>): ProbeCallResult {
  return {
    success: response.success,
    durationMs: response.durationMs,
    validJson: response.parsed !== undefined,
    finishReason: response.finishReason,
    promptTokens: response.usage?.promptTokens,
    completionTokens: response.usage?.completionTokens,
    reasoningObserved: response.reasoningObserved,
    reasoningChars: response.reasoningChars,
    apiAttempts: response.attempts.length,
    error: response.error,
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function smallestCase(cases: ReadyBenchmarkCase[]): ReadyBenchmarkCase | undefined {
  return [...cases].sort((left, right) =>
    JSON.stringify(buildTrackPayload(left, 'system-intent')).length
      - JSON.stringify(buildTrackPayload(right, 'system-intent')).length)[0];
}

async function probeOne(options: {
  model: BenchmarkModelConfig;
  realCase?: ReadyBenchmarkCase;
  promptDir: string;
}): Promise<ModelProbeResult> {
  const connectionResponse = await callConfiguredModel({
    config: options.model,
    systemPrompt: 'You are a connection health check. Return JSON only.',
    userMessage: 'Return exactly this JSON object: {"ok":true}',
  });
  const connection = resultFromResponse(connectionResponse);
  if (connectionResponse.success && objectValue(connectionResponse.parsed).ok !== true) {
    connection.success = false;
    connection.error = 'Connection probe did not return exactly {"ok":true}';
  }
  if (connectionResponse.success
    && options.model.thinking === 'disabled'
    && connectionResponse.reasoningObserved) {
    connection.success = false;
    connection.error = 'Thinking was configured as disabled, but the model returned reasoning content';
  }
  const result: ModelProbeResult = {
    modelId: options.model.id,
    provider: options.model.provider,
    model: options.model.model,
    apiUrl: options.model.apiUrl,
    requiresApiKey: Boolean(options.model.apiKeyEnv),
    modelConfigHash: modelConfigHash(options.model),
    requestConfig: effectiveRequestConfig(options.model),
    connection,
  };
  if (!options.realCase || !connection.success) return result;

  const track = 'system-intent' as const;
  const response = await callConfiguredModel({
    config: options.model,
    systemPrompt: await loadBenchmarkPrompt(options.promptDir, track),
    userMessage: JSON.stringify(buildTrackPayload(options.realCase, track)),
  });
  const callResult = resultFromResponse(response);
  if (response.success && !Array.isArray(objectValue(response.parsed).issues)) {
    callResult.success = false;
    callResult.error = 'Real-case probe did not return the required issues array';
  }
  result.realCase = {
    caseId: options.realCase.caseId,
    ...callResult,
    normalizedIssueCount: callResult.success
      ? normalizePrediction(response.parsed, options.realCase, track).normalized.length
      : undefined,
  };
  return result;
}

export async function probeModels(options: {
  configPath: string;
  modelIds?: string[];
  casesPath?: string;
  promptDir: string;
  outputPath: string;
}): Promise<ModelProbeResult[]> {
  const config = await readJsonFile<BenchmarkConfigFile>(options.configPath);
  const selected = options.modelIds?.length
    ? new Set(options.modelIds)
    : undefined;
  const models = config.models.filter((model) => !selected || selected.has(model.id));
  if (selected) {
    const missing = [...selected].filter((id) => !models.some((model) => model.id === id));
    if (missing.length) throw new Error(`Unknown model id(s): ${missing.join(', ')}`);
  }
  if (!models.length) throw new Error('No models selected for probing');

  let realCase: ReadyBenchmarkCase | undefined;
  if (options.casesPath) {
    try {
      await fs.access(options.casesPath);
      const rows = await readJsonl<BenchmarkCase>(options.casesPath);
      realCase = smallestCase(rows.filter((row): row is ReadyBenchmarkCase => row.status === 'ready'));
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  const results: ModelProbeResult[] = [];
  for (const model of models) {
    results.push(await probeOne({ model, realCase, promptDir: options.promptDir }));
  }
  await writeJsonFile(path.resolve(options.outputPath), {
    generatedAt: new Date().toISOString(),
    realCaseId: realCase?.caseId,
    results,
  });
  return results;
}

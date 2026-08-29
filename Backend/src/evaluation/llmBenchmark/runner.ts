import { promises as fs } from 'fs';
import path from 'path';
import {
  mergeIssues,
  normalizeLlmIssues,
  TEMPLATE_ATTENTION_SYSTEM_PROMPT,
  templateAttentionResponseSchema,
} from '../../core/llm/templateAttentionAnalyzer.js';
import type { AnchorCatalog } from '../../core/llm/templateAttentionAnalyzer.js';
import type { IssueCard } from '../../types/partialDebugging.js';
import {
  BENCHMARK_SCHEMA_VERSION,
  BENCHMARK_TRACKS,
  NEUTRAL_INTENT,
} from './types.js';
import type {
  BenchmarkCase,
  BenchmarkConfigFile,
  BenchmarkModelConfig,
  BenchmarkPrediction,
  BenchmarkTrack,
  ReadyBenchmarkCase,
  SerializedAnchorCatalog,
} from './types.js';
import { appendJsonl, readJsonFile, readJsonl, sha256 } from './io.js';
import { callConfiguredModel, effectiveRequestConfig } from './modelClient.js';

const PROMPT_FILES: Record<BenchmarkTrack, string> = {
  'direct-neutral': 'direct-v2.txt',
  'direct-intent': 'direct-v2.txt',
  'system-neutral': 'suggestion-neutral-v1.txt',
  'system-intent': 'suggestion-v1.txt',
};

function catalogIds(items: Array<Record<string, unknown>>): Set<string> {
  return new Set(items.map((item) => String(item.id ?? '')).filter(Boolean));
}

export function deserializeCatalog(catalog: SerializedAnchorCatalog): AnchorCatalog {
  return {
    sourceNodeIds: catalogIds(catalog.sourceNodes),
    sourceEdgeIds: catalogIds(catalog.sourceEdges),
    r1csNodeIds: catalogIds(catalog.r1csNodes),
    sourceNodes: catalog.sourceNodes,
    sourceEdges: catalog.sourceEdges,
    r1csNodes: catalog.r1csNodes,
  };
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function buildTrackPayload(
  benchmarkCase: ReadyBenchmarkCase,
  track: BenchmarkTrack,
): Record<string, unknown> {
  const intent = track.endsWith('intent') ? benchmarkCase.canonicalIntent : NEUTRAL_INTENT;
  if (track.startsWith('system')) {
    return {
      ...cloneRecord(benchmarkCase.systemContext.promptPayload),
      intent,
    };
  }
  return {
    intent,
    template: benchmarkCase.directContext.templateName,
    originTemplate: benchmarkCase.directContext.originCode,
    ...(benchmarkCase.directContext.parentInterface
      ? { parentInterface: benchmarkCase.directContext.parentInterface }
      : {}),
    allowedAnchors: {
      sourceNodes: benchmarkCase.directContext.candidates.sourceNodes,
      sourceEdges: benchmarkCase.directContext.candidates.sourceEdges,
    },
    responseSchema: templateAttentionResponseSchema(),
  };
}

function predictionKey(caseId: string, track: BenchmarkTrack, attempt: number): string {
  return `${caseId}\u0000${track}\u0000${attempt}`;
}

export async function loadBenchmarkPrompt(promptDir: string, track: BenchmarkTrack): Promise<string> {
  const prompt = (await fs.readFile(path.join(promptDir, PROMPT_FILES[track]), 'utf8')).trim();
  if (track.startsWith('system') && prompt !== TEMPLATE_ATTENTION_SYSTEM_PROMPT.trim()) {
    throw new Error(`${PROMPT_FILES[track]} does not match the production Template Attention system prompt`);
  }
  return prompt;
}

export function modelConfigHash(model: BenchmarkModelConfig): string {
  return sha256({
    id: model.id,
    provider: model.provider,
    model: model.model,
    apiStyle: model.apiStyle,
    apiUrl: model.apiUrl,
    apiKeyEnv: model.apiKeyEnv,
    request: effectiveRequestConfig(model),
    timeoutMs: model.timeoutMs ?? 120_000,
    maxRetries: model.maxRetries ?? 2,
    contextWindowTokens: model.contextWindowTokens,
    contextSafetyTokens: model.contextSafetyTokens,
  });
}

function allowedIds(catalog: AnchorCatalog): Set<string> {
  return new Set([
    ...catalog.sourceNodeIds,
    ...catalog.sourceEdgeIds,
    ...catalog.r1csNodeIds,
  ]);
}

export function normalizePrediction(
  parsed: unknown,
  benchmarkCase: ReadyBenchmarkCase,
  track: BenchmarkTrack,
): { normalized: IssueCard[]; merged: IssueCard[] } {
  const serialized = track.startsWith('system')
    ? benchmarkCase.systemContext.candidates
    : benchmarkCase.directContext.candidates;
  const catalog = deserializeCatalog(serialized);
  const normalized = normalizeLlmIssues(parsed, catalog, allowedIds(catalog));
  const detectorIssues = track.startsWith('system') ? benchmarkCase.systemContext.detectorIssues : [];
  return { normalized, merged: mergeIssues(detectorIssues, normalized) };
}

async function runOne(options: {
  benchmarkCase: ReadyBenchmarkCase;
  track: BenchmarkTrack;
  attempt: number;
  model: BenchmarkModelConfig;
  prompt: string;
  experimentId: string;
}): Promise<BenchmarkPrediction> {
  const payload = buildTrackPayload(options.benchmarkCase, options.track);
  const userMessage = JSON.stringify(payload);
  const promptHash = sha256(options.prompt);
  const payloadHash = sha256(payload);
  const configHash = modelConfigHash(options.model);
  const predictionId = sha256([
    options.model.id,
    options.track,
    options.benchmarkCase.caseId,
    options.attempt,
    promptHash,
    payloadHash,
    options.benchmarkCase.projectionHash ?? 'no-projection',
    configHash,
    options.experimentId,
  ].join('|'));
  const startedAt = new Date().toISOString();
  const response = await callConfiguredModel({
    config: options.model,
    systemPrompt: options.prompt,
    userMessage,
  });
  const normalized = response.success
    ? normalizePrediction(response.parsed, options.benchmarkCase, options.track)
    : { normalized: [], merged: [] };
  const detectorIssues = options.track.startsWith('system')
    ? options.benchmarkCase.systemContext.detectorIssues
    : [];

  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    predictionId,
    caseId: options.benchmarkCase.caseId,
    project: options.benchmarkCase.project,
    bugFamily: options.benchmarkCase.bugFamily,
    modelId: options.model.id,
    provider: options.model.provider,
    model: options.model.model,
    experimentId: options.experimentId,
    modelConfigHash: configHash,
    projectionHash: options.benchmarkCase.projectionHash,
    requestConfig: effectiveRequestConfig(options.model),
    track: options.track,
    attempt: options.attempt,
    promptHash,
    payloadHash,
    startedAt,
    durationMs: response.durationMs,
    success: response.success,
    rawOutput: response.raw,
    parsedOutput: response.parsed,
    normalizedIssues: normalized.normalized,
    detectorIssues,
    mergedIssues: normalized.merged,
    usage: response.usage,
    error: response.error,
    finishReason: response.finishReason,
    reasoningObserved: response.reasoningObserved,
    reasoningChars: response.reasoningChars,
    apiAttempts: response.attempts,
  };
}

async function runPool<T>(jobs: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results = new Array<T>(jobs.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, jobs.length || 1)) }, async () => {
    while (cursor < jobs.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await jobs[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

export async function runBenchmark(options: {
  casesPath: string;
  configPath: string;
  modelId: string;
  promptDir: string;
  outputRoot: string;
  repeats: number;
  tracks?: BenchmarkTrack[];
  experimentId?: string;
  split?: 'development' | 'test' | 'all';
}): Promise<{ completed: number; skipped: number }> {
  const allCases = await readJsonl<BenchmarkCase>(options.casesPath);
  const requestedSplit = options.split ?? 'all';
  const cases = allCases
    .filter((candidate): candidate is ReadyBenchmarkCase => candidate.status === 'ready')
    .filter((candidate) => requestedSplit === 'all' || candidate.split === requestedSplit);
  if (!cases.length) throw new Error('No ready benchmark cases found; generate Partial Debugging bundle snapshots first');
  const configFile = await readJsonFile<BenchmarkConfigFile>(options.configPath);
  const model = configFile.models.find((candidate) => candidate.id === options.modelId);
  if (!model) throw new Error(`Unknown model id: ${options.modelId}`);
  const tracks = options.tracks?.length ? options.tracks : BENCHMARK_TRACKS;
  const prompts = new Map<BenchmarkTrack, string>();
  for (const track of tracks) prompts.set(track, await loadBenchmarkPrompt(options.promptDir, track));

  const experimentId = options.experimentId?.trim() || 'default';
  const configHash = modelConfigHash(model);

  let skipped = 0;
  const jobs: Array<() => Promise<{ prediction: BenchmarkPrediction; outputPath: string }>> = [];
  for (const track of tracks) {
    const outputPath = path.join(options.outputRoot, experimentId, model.id, track, 'predictions.jsonl');
    const existing = await readJsonl<BenchmarkPrediction>(outputPath);
    const experimentRows = existing.filter((prediction) => prediction.experimentId === experimentId);
    if (experimentRows.some((prediction) => prediction.modelConfigHash !== configHash)) {
      throw new Error(
        `Experiment ${experimentId} already contains a different configuration for ${model.id}; use a new --experiment ID`,
      );
    }
    const completed = new Set(existing
      .filter((prediction) => prediction.experimentId === experimentId && prediction.modelConfigHash === configHash)
      .map((prediction) => [
        predictionKey(prediction.caseId, prediction.track, prediction.attempt),
        prediction.promptHash,
        prediction.payloadHash,
      ].join('\u0000')));
    for (const benchmarkCase of cases) {
      for (let attempt = 1; attempt <= Math.max(1, options.repeats); attempt += 1) {
        const prompt = prompts.get(track)!;
        const payload = buildTrackPayload(benchmarkCase, track);
        const identity = predictionKey(benchmarkCase.caseId, track, attempt);
        const key = [
          identity,
          sha256(prompt),
          sha256(payload),
        ].join('\u0000');
        if (completed.has(key)) {
          skipped += 1;
          continue;
        }
        if (experimentRows.some((prediction) =>
          predictionKey(prediction.caseId, prediction.track, prediction.attempt) === identity)) {
          throw new Error(
            `Experiment ${experimentId} already contains a different prompt or payload for ${model.id}/${identity}; use a new --experiment ID`,
          );
        }
        jobs.push(async () => {
          const prediction = await runOne({
            benchmarkCase,
            track,
            attempt,
            model,
            prompt,
            experimentId,
          });
          await appendJsonl(outputPath, prediction);
          return { prediction, outputPath };
        });
      }
    }
  }

  const results = await runPool(jobs, model.concurrency ?? 1);
  return { completed: results.length, skipped };
}

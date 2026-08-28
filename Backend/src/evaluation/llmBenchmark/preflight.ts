import path from 'path';
import { promises as fs } from 'fs';
import type {
  AnnotationInput,
  BenchmarkConfigFile,
  BenchmarkModelConfig,
  BenchmarkProjection,
  BenchmarkTrack,
  BuiltBundleCase,
  ReadyBenchmarkCase,
} from './types.js';
import { BENCHMARK_TRACKS, NEUTRAL_INTENT } from './types.js';
import { buildReadyBenchmarkCase } from './caseBuilder.js';
import { effectiveRequestConfig } from './modelClient.js';
import { readJsonFile, readJsonl, sha256, writeCsv, writeJsonFile, writeJsonl } from './io.js';
import { buildTrackPayload, loadBenchmarkPrompt } from './runner.js';
import { createAnchorCatalog } from '../../core/llm/templateAttentionAnalyzer.js';
import {
  createProjection,
  filterAnnotationInputByProjection,
  prioritizeR1csCandidateIds,
} from './projection.js';

export interface PreflightRow {
  caseId: string;
  project: string;
  split: string;
  modelId: string;
  track: BenchmarkTrack | 'annotation';
  promptTokens: number;
  tokenCountMethod: 'tokenizer-api' | 'conservative-estimate';
  maxInputTokens?: number;
  eligible: boolean;
  error?: string;
}

export function conservativelyEstimateTokens(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

async function tokenizerCount(
  model: BenchmarkModelConfig,
  systemPrompt: string,
  userMessage: string,
): Promise<number> {
  if (!model.tokenizerApiUrl) throw new Error('tokenizer-api-not-configured');
  const apiKey = model.apiKeyEnv ? process.env[model.apiKeyEnv] : undefined;
  if (model.apiKeyEnv && !apiKey) throw new Error(`missing-api-key:${model.apiKeyEnv}`);
  const response = await fetch(model.tokenizerApiUrl, {
    method: 'POST',
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      add_special_tokens: true,
    }),
    signal: AbortSignal.timeout(Math.min(model.timeoutMs ?? 120_000, 120_000)),
  });
  if (!response.ok) throw new Error(`tokenizer-api-${response.status}:${(await response.text()).slice(0, 300)}`);
  const body = await response.json() as any;
  const count = body?.count
    ?? (Array.isArray(body?.tokens) ? body.tokens.length : undefined)
    ?? (Array.isArray(body?.token_ids) ? body.token_ids.length : undefined);
  if (!Number.isFinite(count)) throw new Error('tokenizer-api-returned-no-count');
  return Number(count);
}

export async function preflightBenchmark(options: {
  casesPath: string;
  configPath: string;
  modelIds?: string[];
  promptDir: string;
  outputPath: string;
  csvPath: string;
  excludedPath: string;
  limit?: number;
  annotationInputsPath?: string;
  annotationModelId?: string;
  projectionPath: string;
  projectedAnnotationOutputPath?: string;
}): Promise<{
  rows: PreflightRow[];
  projections: BenchmarkProjection[];
  excludedCaseIds: string[];
  newlyExcludedCaseIds: string[];
}> {
  const bundleRows = await readJsonl<BuiltBundleCase>(options.casesPath);
  const allCases = bundleRows.filter((row) => 'bundle' in row);
  const cases = options.limit === undefined ? allCases : allCases.slice(0, options.limit);
  if (!cases.length) throw new Error('No built bundles found for projection preflight');
  const config = await readJsonFile<BenchmarkConfigFile>(options.configPath);
  const selected = options.modelIds?.length ? new Set(options.modelIds) : undefined;
  const models = config.models.filter((model) => model.benchmark !== false && (!selected || selected.has(model.id)));
  if (selected) {
    const missing = [...selected].filter((id) => !models.some((model) => model.id === id));
    if (missing.length) throw new Error(`Unknown benchmark model id(s): ${missing.join(', ')}`);
  }
  if (!models.length) throw new Error('No benchmark models selected for preflight');

  const prompts = new Map<BenchmarkTrack, string>();
  for (const track of BENCHMARK_TRACKS) {
    prompts.set(track, await loadBenchmarkPrompt(options.promptDir, track));
  }
  const annotationModel = options.annotationModelId
    ? config.models.find((model) => model.id === options.annotationModelId)
    : undefined;
  if (options.annotationModelId && !annotationModel) {
    throw new Error(`Unknown annotation model id: ${options.annotationModelId}`);
  }
  const annotationInputs = new Map((options.annotationInputsPath
    ? await readJsonl<AnnotationInput>(options.annotationInputsPath)
    : []).map((input) => [input.caseId, input]));
  const annotationPrompt = annotationModel && options.annotationInputsPath
    ? (await fs.readFile(path.join(options.promptDir, 'annotation-v1.txt'), 'utf8')).trim()
    : undefined;

  const measure = async (
    benchmarkCase: ReadyBenchmarkCase,
    track: PreflightRow['track'],
    model: BenchmarkModelConfig,
    systemPrompt: string,
    userMessage: string,
  ): Promise<PreflightRow> => {
    let tokenCountMethod: PreflightRow['tokenCountMethod'] = 'conservative-estimate';
    let promptTokens = conservativelyEstimateTokens(`${systemPrompt}\n${userMessage}`);
    if (model.tokenizerApiUrl) {
      try {
        promptTokens = await tokenizerCount(model, systemPrompt, userMessage);
        tokenCountMethod = 'tokenizer-api';
      } catch (tokenizerError: any) {
        const error = tokenizerError?.message ?? String(tokenizerError);
        throw new Error(`Tokenizer preflight failed for ${model.id}/${benchmarkCase.caseId}/${track}: ${error}`);
      }
    }
    const request = effectiveRequestConfig(model);
    const maxInputTokens = model.contextWindowTokens === undefined
      ? undefined
      : model.contextWindowTokens - request.maxTokens - (model.contextSafetyTokens ?? 1_024);
    return {
      caseId: benchmarkCase.caseId,
      project: benchmarkCase.project,
      split: benchmarkCase.split ?? 'unspecified',
      modelId: model.id,
      track,
      promptTokens,
      tokenCountMethod,
      maxInputTokens,
      eligible: maxInputTokens === undefined || promptTokens <= maxInputTokens,
    };
  };

  const constrainedModels = models.filter((model) => model.contextWindowTokens !== undefined);
  if (annotationModel?.contextWindowTokens !== undefined
    && !constrainedModels.some((model) => model.id === annotationModel.id)) {
    constrainedModels.push(annotationModel);
  }
  if (!constrainedModels.length) {
    throw new Error('Projection preflight requires at least one model with contextWindowTokens configured');
  }
  const maxInputTokens = Math.min(...constrainedModels.map((model) =>
    model.contextWindowTokens!
      - effectiveRequestConfig(model).maxTokens
      - (model.contextSafetyTokens ?? 1_024)));

  const rows: PreflightRow[] = [];
  const projections: BenchmarkProjection[] = [];
  const projectedAnnotations: AnnotationInput[] = [];
  for (const bundleCase of cases) {
    const bundleHash = sha256(bundleCase.bundle);
    const fullCatalog = createAnchorCatalog(bundleCase.bundle);
    const prioritizedIds = prioritizeR1csCandidateIds(bundleCase.bundle, fullCatalog);
    const rawAnnotationInput = annotationInputs.get(bundleCase.caseId);
    const annotationWithCatalog = rawAnnotationInput ? {
      ...rawAnnotationInput,
      candidates: {
        sourceNodes: fullCatalog.sourceNodes,
        sourceEdges: fullCatalog.sourceEdges,
        r1csNodes: fullCatalog.r1csNodes,
      },
    } : undefined;

    const provisionalProjection = (count: number, hardExcluded = false) => createProjection({
      caseId: bundleCase.caseId,
      bundleHash,
      maxInputTokens,
      originalR1csCount: prioritizedIds.length,
      retainedR1csIds: prioritizedIds.slice(0, count),
      hardExcluded,
      tokenCounts: {},
    });
    const readyWithCount = (count: number, hardExcluded = false) => buildReadyBenchmarkCase({
      ...bundleCase,
      canonicalIntent: NEUTRAL_INTENT,
      projection: provisionalProjection(count, hardExcluded),
    });
    const fullReady = readyWithCount(prioritizedIds.length);

    const directRows: PreflightRow[] = [];
    for (const track of ['direct-neutral', 'direct-intent'] as const) {
      const prompt = prompts.get(track)!;
      const message = JSON.stringify(buildTrackPayload(fullReady, track));
      for (const model of models) directRows.push(await measure(fullReady, track, model, prompt, message));
    }
    rows.push(...directRows);
    let hardExclusionReason: BenchmarkProjection['hardExclusionReason'] | undefined = directRows.some((row) => !row.eligible)
      ? 'direct-context-overflow'
      : undefined;

    const countFits = async (count: number): Promise<boolean> => {
      const candidateReady = readyWithCount(count);
      const systemPrompt = prompts.get('system-intent')!;
      const systemMessage = JSON.stringify(buildTrackPayload(candidateReady, 'system-intent'));
      for (const model of constrainedModels) {
        const row = await measure(candidateReady, 'system-intent', model, systemPrompt, systemMessage);
        if (!row.eligible) return false;
      }
      if (annotationModel && annotationPrompt && annotationWithCatalog) {
        const projectedInput = filterAnnotationInputByProjection(
          annotationWithCatalog,
          provisionalProjection(count),
        );
        const row = await measure(
          candidateReady,
          'annotation',
          annotationModel,
          annotationPrompt,
          JSON.stringify(projectedInput),
        );
        if (!row.eligible) return false;
      }
      return true;
    };

    let retainedCount = prioritizedIds.length;
    if (!hardExclusionReason && !(await countFits(retainedCount))) {
      if (!(await countFits(0))) {
        hardExclusionReason = 'fixed-system-context-overflow';
        retainedCount = 0;
      } else {
        let low = 0;
        let high = retainedCount;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (await countFits(middle)) low = middle;
          else high = middle - 1;
        }
        retainedCount = low;
      }
    }

    const draftProjection = createProjection({
      caseId: bundleCase.caseId,
      bundleHash,
      maxInputTokens,
      originalR1csCount: prioritizedIds.length,
      retainedR1csIds: prioritizedIds.slice(0, retainedCount),
      hardExcluded: Boolean(hardExclusionReason),
      hardExclusionReason,
      tokenCounts: {},
    });
    const finalReady = hardExclusionReason
      ? fullReady
      : buildReadyBenchmarkCase({
        ...bundleCase,
        canonicalIntent: NEUTRAL_INTENT,
        projection: draftProjection,
      });
    const finalRows: PreflightRow[] = [];
    for (const track of ['system-neutral', 'system-intent'] as const) {
      const prompt = prompts.get(track)!;
      const message = JSON.stringify(buildTrackPayload(finalReady, track));
      for (const model of models) finalRows.push(await measure(finalReady, track, model, prompt, message));
    }
    let projectedAnnotation: AnnotationInput | undefined;
    if (annotationModel && annotationPrompt && annotationWithCatalog) {
      projectedAnnotation = hardExclusionReason
        ? annotationWithCatalog
        : filterAnnotationInputByProjection(annotationWithCatalog, draftProjection);
      finalRows.push(await measure(
        finalReady,
        'annotation',
        annotationModel,
        annotationPrompt,
        JSON.stringify(projectedAnnotation),
      ));
    }
    rows.push(...finalRows);
    const tokenCounts: BenchmarkProjection['tokenCounts'] = {};
    for (const track of [...BENCHMARK_TRACKS, 'annotation'] as const) {
      const values = [...directRows, ...finalRows]
        .filter((row) => row.track === track && row.maxInputTokens !== undefined)
        .map((row) => row.promptTokens);
      if (values.length) tokenCounts[track] = Math.max(...values);
    }
    const projection = createProjection({
      caseId: bundleCase.caseId,
      bundleHash,
      maxInputTokens,
      originalR1csCount: prioritizedIds.length,
      retainedR1csIds: prioritizedIds.slice(0, retainedCount),
      hardExcluded: Boolean(hardExclusionReason),
      hardExclusionReason,
      tokenCounts,
    });
    projections.push(projection);
    if (projectedAnnotation && !hardExclusionReason) {
      projectedAnnotations.push({ ...projectedAnnotation, projectionHash: projection.projectionHash });
    }
  }

  const newlyExcludedCaseIds = projections
    .filter((projection) => projection.hardExcluded)
    .map((projection) => projection.caseId)
    .sort();
  let previousExcludedCaseIds: string[] = [];
  try {
    previousExcludedCaseIds = await readJsonFile<string[]>(options.excludedPath);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const excludedCaseIds = [...new Set([...previousExcludedCaseIds, ...newlyExcludedCaseIds])].sort();
  await writeJsonFile(path.resolve(options.outputPath), {
    generatedAt: new Date().toISOString(),
    cases: cases.length,
    models: models.map((model) => model.id),
    annotationModel: annotationModel?.id,
    projectionPath: path.resolve(options.projectionPath),
    excludedCaseIds,
    newlyExcludedCaseIds,
    eligibleCases: cases.length - newlyExcludedCaseIds.length,
    projectionSummary: {
      fullR1cs: projections.filter((projection) =>
        !projection.hardExcluded
          && projection.retainedR1csIds.length === projection.originalR1csCount).length,
      compactedR1cs: projections.filter((projection) =>
        !projection.hardExcluded && projection.retainedR1csIds.length < projection.originalR1csCount).length,
      hardExcluded: newlyExcludedCaseIds.length,
    },
    rows,
  });
  await writeJsonl(path.resolve(options.projectionPath), projections);
  if (options.projectedAnnotationOutputPath) {
    await writeJsonl(path.resolve(options.projectedAnnotationOutputPath), projectedAnnotations);
  }
  await writeJsonFile(path.resolve(options.excludedPath), excludedCaseIds);
  await writeCsv(path.resolve(options.csvPath), [
    'caseId', 'project', 'split', 'modelId', 'track', 'promptTokens', 'tokenCountMethod',
    'maxInputTokens', 'eligible', 'error',
  ], rows as unknown as Array<Record<string, unknown>>);
  return { rows, projections, excludedCaseIds, newlyExcludedCaseIds };
}

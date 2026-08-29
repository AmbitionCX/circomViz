import { promises as fs } from 'fs';
import path from 'path';
import type {
  BenchmarkCase,
  BenchmarkGold,
  BenchmarkPrediction,
  PerPredictionScore,
  ReadyBenchmarkCase,
} from './types.js';
import { readJsonl, sha256, writeCsv, writeJsonFile } from './io.js';
import type { IssueCard } from '../../types/partialDebugging.js';

function candidateIds(benchmarkCase: ReadyBenchmarkCase, prediction: BenchmarkPrediction): Set<string> {
  const catalog = prediction.track.startsWith('system')
    ? benchmarkCase.systemContext.candidates
    : benchmarkCase.directContext.candidates;
  return new Set([
    ...catalog.sourceNodes,
    ...catalog.sourceEdges,
    ...catalog.r1csNodes,
  ].map((candidate) => String(candidate.id ?? '')).filter(Boolean));
}

function rawAnchorIds(parsed: unknown): string[] {
  if (parsed === null || typeof parsed !== 'object') return [];
  const issues = (parsed as Record<string, unknown>).issues;
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((issue) => {
    if (issue === null || typeof issue !== 'object') return [];
    const anchors = (issue as Record<string, unknown>).anchors;
    if (!Array.isArray(anchors)) return [];
    return anchors.map((anchor) =>
      anchor !== null && typeof anchor === 'object'
        ? String((anchor as Record<string, unknown>).id ?? '')
        : '').filter(Boolean);
  });
}

function primarySourceAnchors(issues: IssueCard[]): string[] {
  return issues.flatMap((issue) => {
    const anchor = issue.anchors.find((candidate) => candidate.view === 'source');
    return anchor ? [anchor.id] : [];
  });
}

function hitAt(predicted: string[], expected: Set<string>, k: number): number {
  return predicted.slice(0, k).some((id) => expected.has(id)) ? 1 : 0;
}

function ratio(numerator: number, denominator: number): number {
  return denominator ? numerator / denominator : 0;
}

function scorePrediction(
  prediction: BenchmarkPrediction,
  benchmarkCase: ReadyBenchmarkCase,
  gold: BenchmarkGold,
  evaluationLayer: 'llm-only' | 'end-to-end',
): PerPredictionScore {
  const issues = evaluationLayer === 'llm-only' ? prediction.normalizedIssues : prediction.mergedIssues;
  const predicted = primarySourceAnchors(issues);
  const root = new Set(gold.rootCauseAnchors);
  const diagnostic = new Set(gold.diagnosticAnchors);
  const top3 = [...new Set(predicted.slice(0, 3))];
  const truePositive = top3.filter((id) => diagnostic.has(id)).length;
  const precision = ratio(truePositive, top3.length);
  const recall = ratio(truePositive, diagnostic.size);
  const rawIds = rawAnchorIds(prediction.parsedOutput);
  const allowed = candidateIds(benchmarkCase, prediction);
  const validIds = rawIds.filter((id) => allowed.has(id));

  return {
    predictionId: prediction.predictionId,
    experimentId: prediction.experimentId ?? 'legacy',
    caseId: prediction.caseId,
    project: prediction.project,
    bugFamily: prediction.bugFamily,
    modelId: prediction.modelId,
    track: prediction.track,
    evaluationLayer,
    split: benchmarkCase.split ?? 'unspecified',
    attempt: prediction.attempt,
    success: prediction.success,
    validCandidateRate: rawIds.length ? validIds.length / rawIds.length : prediction.success ? 1 : 0,
    hallucinatedCandidateRate: rawIds.length ? 1 - validIds.length / rawIds.length : 0,
    emptyResponse: Number(predicted.length === 0),
    rootHitAt1: hitAt(predicted, root, 1),
    rootHitAt3: hitAt(predicted, root, 3),
    rootHitAt8: hitAt(predicted, root, 8),
    diagnosticCoverageAt1: hitAt(predicted, diagnostic, 1),
    diagnosticCoverageAt3: hitAt(predicted, diagnostic, 3),
    diagnosticCoverageAt8: hitAt(predicted, diagnostic, 8),
    diagnosticPrecisionAt3: precision,
    diagnosticRecallAt3: recall,
    diagnosticF1At3: precision + recall ? 2 * precision * recall / (precision + recall) : 0,
    durationMs: prediction.durationMs,
    totalTokens: prediction.usage?.totalTokens ?? 0,
  };
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function groupBy<T>(values: T[], key: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    const group = groups.get(groupKey) ?? [];
    group.push(value);
    groups.set(groupKey, group);
  }
  return groups;
}

function bootstrapProjectInterval(rows: PerPredictionScore[]): [number, number] {
  const projectMeans = [...groupBy(rows, (row) => row.project).values()]
    .map((projectRows) => mean(projectRows.map((row) => row.diagnosticCoverageAt3)));
  if (!projectMeans.length) return [0, 0];
  let state = 0x5eed1234;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const samples: number[] = [];
  for (let round = 0; round < 1_000; round += 1) {
    const sample = Array.from({ length: projectMeans.length }, () =>
      projectMeans[Math.floor(random() * projectMeans.length)]);
    samples.push(mean(sample));
  }
  samples.sort((left, right) => left - right);
  return [samples[Math.floor(samples.length * 0.025)], samples[Math.floor(samples.length * 0.975)]];
}

function pairedProjectDelta(
  rows: PerPredictionScore[],
  leftTrack: string,
  rightTrack: string,
): { pairs: number; projects: number; mean: number | null; projectBootstrap95: [number, number] | null } {
  const values = new Map<string, Partial<Record<'left' | 'right', number>>>();
  for (const row of rows) {
    if (row.track !== leftTrack && row.track !== rightTrack) continue;
    const key = `${row.project}\u0000${row.caseId}\u0000${row.attempt}`;
    const value = values.get(key) ?? {};
    value[row.track === leftTrack ? 'left' : 'right'] = row.diagnosticCoverageAt3;
    values.set(key, value);
  }
  const paired = [...values.entries()].flatMap(([key, value]) => {
    if (value.left === undefined || value.right === undefined) return [];
    return [{ project: key.split('\u0000')[0], delta: value.left - value.right }];
  });
  if (!paired.length) return { pairs: 0, projects: 0, mean: null, projectBootstrap95: null };
  const projectMeans = [...groupBy(paired, (entry) => entry.project).values()]
    .map((entries) => mean(entries.map((entry) => entry.delta)));
  let state = 0x51a7c0de;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const samples: number[] = [];
  for (let round = 0; round < 1_000; round += 1) {
    samples.push(mean(Array.from({ length: projectMeans.length }, () =>
      projectMeans[Math.floor(random() * projectMeans.length)])));
  }
  samples.sort((left, right) => left - right);
  return {
    pairs: paired.length,
    projects: projectMeans.length,
    mean: mean(projectMeans),
    projectBootstrap95: [samples[Math.floor(samples.length * 0.025)], samples[Math.floor(samples.length * 0.975)]],
  };
}

function aggregate(rows: PerPredictionScore[]) {
  const caseGroups = [...groupBy(rows, (row) => row.caseId).values()];
  const projectGroups = [...groupBy(rows, (row) => row.project).values()];
  const metric = (key: keyof PerPredictionScore) => rows.map((row) => Number(row[key]));
  const caseMetric = (key: keyof PerPredictionScore) => mean(caseGroups.map((group) => mean(group.map((row) => Number(row[key])))));
  const projectMetric = (key: keyof PerPredictionScore) => mean(projectGroups.map((group) => mean(group.map((row) => Number(row[key])))));
  const [ciLow, ciHigh] = bootstrapProjectInterval(rows);
  return {
    predictions: rows.length,
    cases: caseGroups.length,
    projects: projectGroups.length,
    apiSuccessRate: mean(rows.map((row) => Number(row.success))),
    diagnosticCoverageAt3: {
      micro: mean(metric('diagnosticCoverageAt3')),
      caseMacro: caseMetric('diagnosticCoverageAt3'),
      projectMacro: projectMetric('diagnosticCoverageAt3'),
      projectBootstrap95: [ciLow, ciHigh],
    },
    rootHitAt1: {
      micro: mean(metric('rootHitAt1')),
      caseMacro: caseMetric('rootHitAt1'),
      projectMacro: projectMetric('rootHitAt1'),
    },
    diagnosticCoverageAt1: mean(metric('diagnosticCoverageAt1')),
    diagnosticCoverageAt8: mean(metric('diagnosticCoverageAt8')),
    rootHitAt3: mean(metric('rootHitAt3')),
    rootHitAt8: mean(metric('rootHitAt8')),
    diagnosticPrecisionAt3: mean(metric('diagnosticPrecisionAt3')),
    diagnosticRecallAt3: mean(metric('diagnosticRecallAt3')),
    diagnosticF1At3: mean(metric('diagnosticF1At3')),
    validCandidateRate: mean(metric('validCandidateRate')),
    hallucinatedCandidateRate: mean(metric('hallucinatedCandidateRate')),
    emptyResponseRate: mean(metric('emptyResponse')),
    averageDurationMs: mean(metric('durationMs')),
    averageTotalTokens: mean(metric('totalTokens')),
  };
}

async function findPredictionFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop()!;
    let entries: import('fs').Dirent[] = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const resolved = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(resolved);
      else if (entry.isFile() && entry.name === 'predictions.jsonl') files.push(resolved);
    }
  }
  return files.sort();
}

export async function scoreBenchmark(options: {
  casesPath: string;
  goldPath: string;
  predictionsRoot: string;
  outputDir: string;
  modelIds?: string[];
  experimentId?: string;
  split?: 'development' | 'test' | 'all';
}): Promise<{ rows: PerPredictionScore[]; summary: Record<string, unknown> }> {
  const allCases = await readJsonl<BenchmarkCase>(options.casesPath);
  const requestedSplit = options.split ?? 'all';
  const cases = new Map(allCases
    .filter((candidate): candidate is ReadyBenchmarkCase => candidate.status === 'ready')
    .filter((candidate) => requestedSplit === 'all' || candidate.split === requestedSplit)
    .map((candidate) => [candidate.caseId, candidate]));
  const gold = new Map((await readJsonl<BenchmarkGold>(options.goldPath))
    .filter((entry) => entry.annotationStatus === 'frozen')
    .map((entry) => [entry.caseId, entry]));
  const discoveredPredictionFiles = await findPredictionFiles(options.predictionsRoot);
  const selectedModels = options.modelIds ? new Set(options.modelIds) : undefined;
  const loadedPredictionFiles = await Promise.all(discoveredPredictionFiles.map(async (file) => ({
    file,
    predictions: await readJsonl<BenchmarkPrediction>(file),
  })));
  const predictionFiles = loadedPredictionFiles
    .filter((loaded) => loaded.predictions.some((prediction) =>
      (!selectedModels || selectedModels.has(prediction.modelId))
      && (!options.experimentId || prediction.experimentId === options.experimentId)))
    .map((loaded) => loaded.file);
  const predictions = loadedPredictionFiles
    .flatMap((loaded) => loaded.predictions)
    .filter((prediction) => !selectedModels || selectedModels.has(prediction.modelId))
    .filter((prediction) => !options.experimentId || prediction.experimentId === options.experimentId);
  for (const [modelId, modelPredictions] of groupBy(predictions, (prediction) => prediction.modelId)) {
    const configHashes = new Set(modelPredictions.map((prediction) => prediction.modelConfigHash ?? 'legacy'));
    if (configHashes.size > 1) {
      throw new Error(`Experiment mixes multiple configurations for ${modelId}; use a new --experiment ID`);
    }
    const identities = new Set<string>();
    for (const prediction of modelPredictions) {
      const identity = `${prediction.caseId}\u0000${prediction.track}\u0000${prediction.attempt}`;
      if (identities.has(identity)) {
        throw new Error(`Experiment contains duplicate prediction identity for ${modelId}/${identity}; use a new --experiment ID`);
      }
      identities.add(identity);
    }
  }
  const rows: PerPredictionScore[] = [];
  for (const prediction of predictions) {
    const benchmarkCase = cases.get(prediction.caseId);
    const benchmarkGold = gold.get(prediction.caseId);
    if (!benchmarkCase || !benchmarkGold) continue;
    if ((prediction.projectionHash ?? '') !== (benchmarkCase.projectionHash ?? '')) {
      throw new Error(`Prediction projection mismatch for ${prediction.modelId}/${prediction.caseId}`);
    }
    rows.push(scorePrediction(prediction, benchmarkCase, benchmarkGold, 'llm-only'));
    rows.push(scorePrediction(prediction, benchmarkCase, benchmarkGold, 'end-to-end'));
  }
  if (!rows.length) throw new Error('No predictions matched a ready case and frozen gold row');

  const summarize = (inputRows: PerPredictionScore[]) => {
    const groups = groupBy(inputRows, (row) => `${row.modelId}\u0000${row.track}\u0000${row.evaluationLayer}`);
    const result: Record<string, ReturnType<typeof aggregate>> = {};
    for (const [key, group] of groups) {
      const [modelId, track, evaluationLayer] = key.split('\u0000');
      result[`${modelId}/${track}/${evaluationLayer}`] = aggregate(group);
    }
    return result;
  };
  const summary = summarize(rows);
  const testSummary = summarize(rows.filter((row) => row.split === 'test'));
  const developmentSummary = summarize(rows.filter((row) => row.split === 'development'));
  const modelIds = [...new Set(rows.map((row) => row.modelId))];
  const difference = (left: number | null, right: number | null) =>
    left === null || right === null ? null : left - right;
  const compareScope = (
    scope: 'development' | 'test',
    scopedRows: PerPredictionScore[],
    scopedSummary: ReturnType<typeof summarize>,
  ): Record<string, unknown> => {
    const comparisons: Record<string, unknown> = {};
    const primaryValue = (modelId: string, track: string, layer: string) =>
      scopedSummary[`${modelId}/${track}/${layer}`]?.diagnosticCoverageAt3.caseMacro ?? null;
    for (const modelId of modelIds) {
      for (const layer of ['llm-only', 'end-to-end']) {
        const directNeutral = primaryValue(modelId, 'direct-neutral', layer);
        const directIntent = primaryValue(modelId, 'direct-intent', layer);
        const systemNeutral = primaryValue(modelId, 'system-neutral', layer);
        const systemIntent = primaryValue(modelId, 'system-intent', layer);
        const pairedRows = scopedRows.filter((row) =>
          row.modelId === modelId && row.evaluationLayer === layer);
        comparisons[`${modelId}/${layer}`] = {
          scope,
          metric: `${scope} case-macro Diagnostic Coverage@3`,
          directNeutral,
          directIntent,
          systemNeutral,
          systemIntent,
          intentGainWithoutSystem: difference(directIntent, directNeutral),
          intentGainWithSystem: difference(systemIntent, systemNeutral),
          systemGainWithoutIntent: difference(systemNeutral, directNeutral),
          systemGainWithIntent: difference(systemIntent, directIntent),
          fullSystemGain: difference(systemIntent, directNeutral),
          pairedProjectDeltas: {
            intentGainWithoutSystem: pairedProjectDelta(pairedRows, 'direct-intent', 'direct-neutral'),
            intentGainWithSystem: pairedProjectDelta(pairedRows, 'system-intent', 'system-neutral'),
            systemGainWithoutIntent: pairedProjectDelta(pairedRows, 'system-neutral', 'direct-neutral'),
            systemGainWithIntent: pairedProjectDelta(pairedRows, 'system-intent', 'direct-intent'),
            fullSystemGain: pairedProjectDelta(pairedRows, 'system-intent', 'direct-neutral'),
          },
        };
      }
    }
    return comparisons;
  };
  const comparisonsByScope = {
    development: compareScope(
      'development',
      rows.filter((row) => row.split === 'development'),
      developmentSummary,
    ),
    test: compareScope(
      'test',
      rows.filter((row) => row.split === 'test'),
      testSummary,
    ),
  };
  const comparisons = comparisonsByScope.test;
  const completion: Record<string, unknown> = {};
  for (const modelId of modelIds) {
    const modelPredictions = predictions.filter((prediction) =>
      prediction.modelId === modelId && cases.has(prediction.caseId) && gold.has(prediction.caseId));
    const attempts = Math.max(0, ...modelPredictions.map((prediction) => prediction.attempt));
    const actual = new Set(modelPredictions.map((prediction) =>
      `${prediction.caseId}\u0000${prediction.track}\u0000${prediction.attempt}`)).size;
    const expected = cases.size * 4 * attempts;
    completion[modelId] = {
      cases: cases.size,
      tracks: 4,
      attempts,
      expectedPredictions: expected,
      actualPredictions: actual,
      complete: expected > 0 && actual === expected,
    };
  }
  const aggregateRows: Array<Record<string, unknown>> = [];
  for (const [scope, scopedSummary] of [
    ['all', summary],
    ['development', developmentSummary],
    ['test', testSummary],
  ] as const) {
    for (const [key, value] of Object.entries(scopedSummary)) {
      const [modelId, track, evaluationLayer] = key.split('/');
      aggregateRows.push({
        scope,
        modelId,
        track,
        evaluationLayer,
        predictions: value.predictions,
        cases: value.cases,
        projects: value.projects,
        apiSuccessRate: value.apiSuccessRate,
        diagnosticCoverageAt3CaseMacro: value.diagnosticCoverageAt3.caseMacro,
        diagnosticCoverageAt3ProjectMacro: value.diagnosticCoverageAt3.projectMacro,
        diagnosticCoverageAt3ProjectBootstrapLow: value.diagnosticCoverageAt3.projectBootstrap95[0],
        diagnosticCoverageAt3ProjectBootstrapHigh: value.diagnosticCoverageAt3.projectBootstrap95[1],
        rootHitAt1CaseMacro: value.rootHitAt1.caseMacro,
        diagnosticPrecisionAt3: value.diagnosticPrecisionAt3,
        diagnosticRecallAt3: value.diagnosticRecallAt3,
        diagnosticF1At3: value.diagnosticF1At3,
        validCandidateRate: value.validCandidateRate,
        hallucinatedCandidateRate: value.hallucinatedCandidateRate,
        emptyResponseRate: value.emptyResponseRate,
        averageDurationMs: value.averageDurationMs,
        averageTotalTokens: value.averageTotalTokens,
      });
    }
  }
  const comparisonRows = Object.entries(comparisonsByScope).flatMap(([scope, scoped]) =>
    Object.entries(scoped).map(([key, rawValue]) => {
      const [modelId, evaluationLayer] = key.split('/');
      const value = rawValue as any;
      const paired = value.pairedProjectDeltas.fullSystemGain;
      return {
        scope,
        modelId,
        evaluationLayer,
        directNeutral: value.directNeutral,
        directIntent: value.directIntent,
        systemNeutral: value.systemNeutral,
        systemIntent: value.systemIntent,
        intentGainWithoutSystem: value.intentGainWithoutSystem,
        intentGainWithSystem: value.intentGainWithSystem,
        systemGainWithoutIntent: value.systemGainWithoutIntent,
        systemGainWithIntent: value.systemGainWithIntent,
        fullSystemGain: value.fullSystemGain,
        fullSystemGainPairedProjectMean: paired.mean,
        fullSystemGainPairedCiLow: paired.projectBootstrap95?.[0],
        fullSystemGainPairedCiHigh: paired.projectBootstrap95?.[1],
        fullSystemGainPairs: paired.pairs,
        fullSystemGainProjects: paired.projects,
      };
    }));
  await writeCsv(options.outputDir + '/summary.csv', [
    'scope', 'modelId', 'track', 'evaluationLayer', 'predictions', 'cases', 'projects',
    'apiSuccessRate', 'diagnosticCoverageAt3CaseMacro', 'diagnosticCoverageAt3ProjectMacro',
    'diagnosticCoverageAt3ProjectBootstrapLow', 'diagnosticCoverageAt3ProjectBootstrapHigh',
    'rootHitAt1CaseMacro', 'diagnosticPrecisionAt3', 'diagnosticRecallAt3', 'diagnosticF1At3',
    'validCandidateRate', 'hallucinatedCandidateRate', 'emptyResponseRate',
    'averageDurationMs', 'averageTotalTokens',
  ], aggregateRows);
  await writeCsv(options.outputDir + '/comparisons.csv', [
    'scope', 'modelId', 'evaluationLayer', 'directNeutral', 'directIntent', 'systemNeutral', 'systemIntent',
    'intentGainWithoutSystem', 'intentGainWithSystem', 'systemGainWithoutIntent',
    'systemGainWithIntent', 'fullSystemGain', 'fullSystemGainPairedProjectMean',
    'fullSystemGainPairedCiLow', 'fullSystemGainPairedCiHigh', 'fullSystemGainPairs',
    'fullSystemGainProjects',
  ], comparisonRows);
  await writeCsv(options.outputDir + '/per-case.csv', [
    'predictionId', 'experimentId', 'caseId', 'project', 'bugFamily', 'modelId', 'track', 'evaluationLayer',
    'split', 'attempt', 'success', 'validCandidateRate', 'hallucinatedCandidateRate', 'emptyResponse',
    'rootHitAt1', 'rootHitAt3', 'rootHitAt8',
    'diagnosticCoverageAt1', 'diagnosticCoverageAt3', 'diagnosticCoverageAt8',
    'diagnosticPrecisionAt3', 'diagnosticRecallAt3', 'diagnosticF1At3', 'durationMs', 'totalTokens',
  ], rows as unknown as Array<Record<string, unknown>>);
  await writeJsonFile(options.outputDir + '/summary.json', {
    generatedAt: new Date().toISOString(),
    primaryMetric: 'Diagnostic Coverage@3',
    primaryScope: requestedSplit === 'all' ? 'test' : requestedSplit,
    experimentId: options.experimentId ?? 'all',
    requestedSplit,
    casesHash: sha256(allCases),
    projectionHash: sha256([...cases.values()].map((benchmarkCase) => ({
      caseId: benchmarkCase.caseId,
      projectionHash: benchmarkCase.projectionHash,
    }))),
    frozenGoldHash: sha256([...gold.values()]),
    predictionFiles,
    results: summary,
    testResults: testSummary,
    developmentResults: developmentSummary,
    comparisons,
    comparisonsByScope,
    completion,
  });
  return { rows, summary };
}

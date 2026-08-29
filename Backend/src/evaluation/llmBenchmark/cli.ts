import path from 'path';
import * as dotenv from 'dotenv';
import { generateInventory } from './inventory.js';
import { prepareCasesFromBundles } from './caseBuilder.js';
import { runBenchmark } from './runner.js';
import { scoreBenchmark } from './scorer.js';
import { createReviewSample, freezeGold, generateDraftGold } from './annotator.js';
import { buildBenchmarkBundles } from './bundleBuilder.js';
import { BENCHMARK_TRACKS } from './types.js';
import type { BenchmarkConfigFile, BenchmarkTrack } from './types.js';
import { readJsonFile } from './io.js';
import { probeModels } from './probe.js';
import { preflightBenchmark } from './preflight.js';
import { refineAnnotations } from './refiner.js';
import { sanitizeBenchmarkIntents } from './intentSanitizer.js';

function parseArgs(argv: string[]): { command: string; values: Map<string, string> } {
  const normalized = argv[0] === '--' ? argv.slice(1) : argv;
  const [command = 'help', ...rest] = normalized;
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    values.set(key, value);
    index += 1;
  }
  return { command, values };
}

function value(values: Map<string, string>, key: string, fallback?: string): string {
  const resolved = values.get(key) ?? fallback;
  if (resolved === undefined) throw new Error(`Missing required option --${key}`);
  return resolved;
}

function workspaceRoot(): string {
  return path.resolve(process.cwd(), '..');
}

function benchmarkRoot(): string {
  return path.join(workspaceRoot(), 'llm-evaluation');
}

function splitValue(values: Map<string, string>): 'development' | 'test' | 'all' {
  const split = value(values, 'split', 'all');
  if (!['development', 'test', 'all'].includes(split)) throw new Error(`Unknown split: ${split}`);
  return split as 'development' | 'test' | 'all';
}

function modelIds(valueText: string): string[] | undefined {
  return valueText === 'all'
    ? undefined
    : valueText.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function experimentValue(values: Map<string, string>, fallback = 'default'): string {
  const experiment = value(values, 'experiment', fallback).trim();
  if (!/^[A-Za-z0-9._-]+$/.test(experiment)) {
    throw new Error('Experiment ID may contain only letters, numbers, dot, underscore, and hyphen');
  }
  return experiment;
}

function printHelp() {
  console.log([
    'CircomVis LLM benchmark',
    '',
    'Commands:',
    '  inventory [--zkbugs PATH] [--output PATH] [--target 50]',
    '  build [--cases cases.jsonl] [--zkbugs PATH] [--work work/]',
    '      [--bundles bundle-inputs.jsonl] [--annotations annotation-inputs.jsonl]',
    '      [--status build-status.csv] [--splits splits.json] [--target 50] [--limit N] [--exclude FILE]',
    '  preflight [--models all|ID,ID] [--cases bundle-inputs.jsonl] [--config models.json] [--limit N]',
    '      [--annotation-inputs annotation-inputs.jsonl] [--annotation-model MODEL_ID]',
    '      [--projection projection.jsonl] [--projected-annotations annotation-inputs.projected.jsonl]',
    '  probe [--models all|ID,ID] [--config models.json] [--cases cases.jsonl]',
    '  prepare --input bundle-inputs.jsonl --gold gold.jsonl [--projection projection.jsonl] [--output cases.jsonl]',
    '  run --model MODEL_ID [--config models.json] [--cases cases.jsonl]',
    '      [--prompts prompts/] [--output runs/] [--repeats 1] [--tracks all]',
    '      [--split development|test|all] [--experiment ID]',
    '  evaluate [--models all|ID,ID] [--config models.json] [--repeats 1]',
    '      [--cases cases.jsonl] [--gold gold.jsonl] [--runs runs/] [--results results/combined]',
    '      [--split development|test|all] [--experiment ID]',
    '  score --predictions runs/MODEL_ID [--cases cases.jsonl] [--gold gold.jsonl]',
    '      [--output results/MODEL_ID] [--split development|test|all] [--experiment ID]',
    '  annotate --input annotation-inputs.projected.jsonl --annotator MODEL_ID --critic MODEL_ID',
    '      [--projection projection.jsonl] [--gold gold.draft.jsonl] [--review review.jsonl]',
    '  refine --input annotation-inputs.projected.jsonl --draft gold.draft.jsonl --review review.jsonl',
    '      --annotator MODEL_ID --critic MODEL_ID [--rounds 2] [--projection projection.jsonl]',
    '      [--gold-output gold.draft-refined.jsonl] [--review-output review-refined.jsonl]',
    '      [--history annotation-revision-history.jsonl]',
    '  review-sample [--draft gold.draft.jsonl] [--review review.jsonl] [--rate 0.1]',
    '  freeze --draft gold.draft.jsonl [--decisions human-decisions.jsonl]',
    '      [--cases bundle-inputs.jsonl] [--output gold.jsonl]',
    '  sanitize-intents --annotator MODEL_ID --critic MODEL_ID [--apply true|false]',
    '      [--input annotation-inputs.projected.jsonl] [--gold gold.jsonl] [--cases cases.jsonl]',
    '      [--output intent-rewrites.jsonl] [--config models.json] [--prompts prompts/]',
  ].join('\n'));
}

async function main() {
  dotenv.config({
    path: path.join(benchmarkRoot(), '.env'),
    override: true,
  });
  const { command, values } = parseArgs(process.argv.slice(2));
  if (command === 'help' || command === '--help') {
    printHelp();
    return;
  }
  if (command === 'inventory') {
    const result = await generateInventory({
      zkbugsRoot: path.resolve(value(values, 'zkbugs', path.join(workspaceRoot(), 'Dataset', 'zkbugs'))),
      outputDir: path.resolve(value(values, 'output', path.join(benchmarkRoot(), 'benchmark'))),
      target: Number(value(values, 'target', '50')),
    });
    console.log(`Inventory completed: candidates=${result.candidates.length}, selected=${result.selected.length}`);
    return;
  }
  if (command === 'prepare') {
    const cases = await prepareCasesFromBundles({
      inputPath: path.resolve(value(values, 'input')),
      outputPath: path.resolve(value(values, 'output', path.join(benchmarkRoot(), 'benchmark', 'cases.jsonl'))),
      goldPath: path.resolve(value(values, 'gold', path.join(benchmarkRoot(), 'benchmark', 'gold.jsonl'))),
      projectionPath: path.resolve(value(
        values,
        'projection',
        path.join(benchmarkRoot(), 'benchmark', 'projection.jsonl'),
      )),
    });
    console.log(`Prepared ${cases.length} ready benchmark cases`);
    return;
  }
  if (command === 'build') {
    const limit = values.get('limit');
    const target = Number(value(values, 'target', '50'));
    const excludePath = values.get('exclude');
    const excludeCaseIds = excludePath
      ? new Set(await readJsonFile<string[]>(path.resolve(excludePath)))
      : undefined;
    const result = await buildBenchmarkBundles({
      casesPath: path.resolve(value(values, 'cases', path.join(benchmarkRoot(), 'benchmark', 'cases.jsonl'))),
      zkbugsRoot: path.resolve(value(values, 'zkbugs', path.join(workspaceRoot(), 'Dataset', 'zkbugs'))),
      workDir: path.resolve(value(values, 'work', path.join(benchmarkRoot(), 'work'))),
      bundleOutputPath: path.resolve(value(values, 'bundles', path.join(benchmarkRoot(), 'benchmark', 'bundle-inputs.jsonl'))),
      annotationOutputPath: path.resolve(value(values, 'annotations', path.join(benchmarkRoot(), 'benchmark', 'annotation-inputs.jsonl'))),
      statusOutputPath: path.resolve(value(values, 'status', path.join(benchmarkRoot(), 'benchmark', 'build-status.csv'))),
      splitsOutputPath: path.resolve(value(values, 'splits', path.join(benchmarkRoot(), 'benchmark', 'splits.json'))),
      target,
      limit: limit ? Number(limit) : undefined,
      excludeCaseIds,
    });
    console.log(`Bundle build completed: built=${result.bundles.length}, skipped_or_failed=${result.statuses.length - result.bundles.length}`);
    if (result.bundles.length < target) {
      throw new Error(`Bundle target not reached: built=${result.bundles.length}, target=${target}. See build-status.csv.`);
    }
    return;
  }
  if (command === 'preflight') {
    const result = await preflightBenchmark({
      casesPath: path.resolve(value(values, 'cases', path.join(benchmarkRoot(), 'benchmark', 'bundle-inputs.jsonl'))),
      configPath: path.resolve(value(values, 'config', path.join(benchmarkRoot(), 'config', 'models.json'))),
      modelIds: modelIds(value(values, 'models', 'all')),
      promptDir: path.resolve(value(values, 'prompts', path.join(benchmarkRoot(), 'prompts'))),
      outputPath: path.resolve(value(values, 'output', path.join(benchmarkRoot(), 'benchmark', 'preflight.json'))),
      csvPath: path.resolve(value(values, 'csv', path.join(benchmarkRoot(), 'benchmark', 'preflight.csv'))),
      excludedPath: path.resolve(value(values, 'excluded', path.join(benchmarkRoot(), 'benchmark', 'preflight-excluded.json'))),
      limit: values.has('limit') ? Number(value(values, 'limit')) : undefined,
      annotationInputsPath: path.resolve(value(
        values,
        'annotation-inputs',
        path.join(benchmarkRoot(), 'benchmark', 'annotation-inputs.jsonl'),
      )),
      annotationModelId: value(values, 'annotation-model', 'qwen3.8-27b-fp8-local'),
      projectionPath: path.resolve(value(
        values,
        'projection',
        path.join(benchmarkRoot(), 'benchmark', 'projection.jsonl'),
      )),
      projectedAnnotationOutputPath: path.resolve(value(
        values,
        'projected-annotations',
        path.join(benchmarkRoot(), 'benchmark', 'annotation-inputs.projected.jsonl'),
      )),
    });
    console.log(
      `Preflight completed: rows=${result.rows.length}, newly_excluded=${result.newlyExcludedCaseIds.length}, excluded_total=${result.excludedCaseIds.length}`,
    );
    return;
  }
  if (command === 'probe') {
    const results = await probeModels({
      configPath: path.resolve(value(values, 'config', path.join(benchmarkRoot(), 'config', 'models.json'))),
      modelIds: modelIds(value(values, 'models', 'all')),
      casesPath: path.resolve(value(values, 'cases', path.join(benchmarkRoot(), 'benchmark', 'cases.jsonl'))),
      promptDir: path.resolve(value(values, 'prompts', path.join(benchmarkRoot(), 'prompts'))),
      outputPath: path.resolve(value(values, 'output', path.join(benchmarkRoot(), 'results', 'connection-probe.json'))),
    });
    results.forEach((result) => console.log(
      `${result.modelId}: connection=${result.connection.success ? 'ok' : 'failed'}`
      + (result.realCase ? `, realCase=${result.realCase.success ? 'ok' : 'failed'}` : ', realCase=not-ready'),
    ));
    if (results.some((result) => !result.connection.success || (result.realCase && !result.realCase.success))) {
      throw new Error('One or more model probes failed; see connection-probe.json');
    }
    return;
  }
  if (command === 'run') {
    const tracksValue = value(values, 'tracks', 'all');
    const tracks = tracksValue === 'all'
      ? BENCHMARK_TRACKS
      : tracksValue.split(',').map((track) => {
        if (!BENCHMARK_TRACKS.includes(track as BenchmarkTrack)) throw new Error(`Unknown track: ${track}`);
        return track as BenchmarkTrack;
      });
    const result = await runBenchmark({
      casesPath: path.resolve(value(values, 'cases', path.join(benchmarkRoot(), 'benchmark', 'cases.jsonl'))),
      configPath: path.resolve(value(values, 'config', path.join(benchmarkRoot(), 'config', 'models.json'))),
      modelId: value(values, 'model'),
      promptDir: path.resolve(value(values, 'prompts', path.join(benchmarkRoot(), 'prompts'))),
      outputRoot: path.resolve(value(values, 'output', path.join(benchmarkRoot(), 'runs'))),
      repeats: Number(value(values, 'repeats', '1')),
      tracks,
      experimentId: experimentValue(values),
      split: splitValue(values),
    });
    console.log(`Run completed: new=${result.completed}, resumed=${result.skipped}`);
    return;
  }
  if (command === 'evaluate') {
    const configPath = path.resolve(value(values, 'config', path.join(benchmarkRoot(), 'config', 'models.json')));
    const config = await readJsonFile<BenchmarkConfigFile>(configPath);
    const requested = value(values, 'models', 'all');
    const modelIds = requested === 'all'
      ? config.models.filter((model) => model.benchmark !== false).map((model) => model.id)
      : requested.split(',').map((modelId) => modelId.trim()).filter(Boolean);
    if (!modelIds.length) throw new Error('No benchmark models selected');
    const casesPath = path.resolve(value(values, 'cases', path.join(benchmarkRoot(), 'benchmark', 'cases.jsonl')));
    const goldPath = path.resolve(value(values, 'gold', path.join(benchmarkRoot(), 'benchmark', 'gold.jsonl')));
    const promptDir = path.resolve(value(values, 'prompts', path.join(benchmarkRoot(), 'prompts')));
    const runsRoot = path.resolve(value(values, 'runs', path.join(benchmarkRoot(), 'runs')));
    const repeats = Number(value(values, 'repeats', '1'));
    const experimentId = experimentValue(values);
    const split = splitValue(values);
    for (const modelId of modelIds) {
      const result = await runBenchmark({
        casesPath,
        configPath,
        modelId,
        promptDir,
        outputRoot: runsRoot,
        repeats,
        tracks: BENCHMARK_TRACKS,
        experimentId,
        split,
      });
      console.log(`Model completed: id=${modelId}, new=${result.completed}, resumed=${result.skipped}`);
    }
    const result = await scoreBenchmark({
      casesPath,
      goldPath,
      predictionsRoot: runsRoot,
      outputDir: path.resolve(value(values, 'results', path.join(benchmarkRoot(), 'results', experimentId))),
      modelIds,
      experimentId,
      split,
    });
    console.log(`Evaluation completed: models=${modelIds.length}, scoreRows=${result.rows.length}`);
    return;
  }
  if (command === 'sanitize-intents') {
    const result = await sanitizeBenchmarkIntents({
      inputsPath: path.resolve(value(values, 'input', path.join(benchmarkRoot(), 'benchmark', 'annotation-inputs.projected.jsonl'))),
      goldPath: path.resolve(value(values, 'gold', path.join(benchmarkRoot(), 'benchmark', 'gold.jsonl'))),
      casesPath: path.resolve(value(values, 'cases', path.join(benchmarkRoot(), 'benchmark', 'cases.jsonl'))),
      configPath: path.resolve(value(values, 'config', path.join(benchmarkRoot(), 'config', 'models.json'))),
      promptDir: path.resolve(value(values, 'prompts', path.join(benchmarkRoot(), 'prompts'))),
      annotatorId: value(values, 'annotator'),
      criticId: value(values, 'critic'),
      outputPath: path.resolve(value(values, 'output', path.join(benchmarkRoot(), 'benchmark', 'intent-rewrites.jsonl'))),
      apply: value(values, 'apply', 'false') === 'true',
    });
    console.log(`Intent sanitization completed: accepted=${result.accepted}, rejected=${result.rejected}, applied=${result.applied}`);
    return;
  }
  if (command === 'annotate') {
    const result = await generateDraftGold({
      inputsPath: path.resolve(value(values, 'input')),
      configPath: path.resolve(value(values, 'config', path.join(benchmarkRoot(), 'config', 'models.json'))),
      annotatorId: value(values, 'annotator'),
      criticId: value(values, 'critic'),
      promptDir: path.resolve(value(values, 'prompts', path.join(benchmarkRoot(), 'prompts'))),
      goldOutputPath: path.resolve(value(values, 'gold', path.join(benchmarkRoot(), 'benchmark', 'gold.draft.jsonl'))),
      reviewOutputPath: path.resolve(value(values, 'review', path.join(benchmarkRoot(), 'benchmark', 'review.jsonl'))),
      projectionPath: path.resolve(value(
        values,
        'projection',
        path.join(benchmarkRoot(), 'benchmark', 'projection.jsonl'),
      )),
    });
    console.log(`Annotation completed: draft=${result.gold.length}, reviewRequired=${result.gold.filter((entry) => entry.needsHumanReview).length}`);
    return;
  }
  if (command === 'refine') {
    const rounds = Number(value(values, 'rounds', '2'));
    if (!Number.isInteger(rounds) || rounds < 1) throw new Error('--rounds must be a positive integer');
    const result = await refineAnnotations({
      inputsPath: path.resolve(value(values, 'input')),
      projectionPath: path.resolve(value(
        values,
        'projection',
        path.join(benchmarkRoot(), 'benchmark', 'projection.jsonl'),
      )),
      draftPath: path.resolve(value(values, 'draft')),
      reviewPath: path.resolve(value(values, 'review')),
      configPath: path.resolve(value(values, 'config', path.join(benchmarkRoot(), 'config', 'models.json'))),
      promptDir: path.resolve(value(values, 'prompts', path.join(benchmarkRoot(), 'prompts'))),
      annotatorId: value(values, 'annotator'),
      criticId: value(values, 'critic'),
      rounds,
      goldOutputPath: path.resolve(value(
        values,
        'gold-output',
        path.join(benchmarkRoot(), 'benchmark', 'gold.draft-refined.jsonl'),
      )),
      reviewOutputPath: path.resolve(value(
        values,
        'review-output',
        path.join(benchmarkRoot(), 'benchmark', 'review-refined.jsonl'),
      )),
      historyPath: path.resolve(value(
        values,
        'history',
        path.join(benchmarkRoot(), 'benchmark', 'annotation-revision-history.jsonl'),
      )),
    });
    console.log(
      `Refinement completed: revised=${result.revisedCases}, accepted_after_revision=${result.acceptedAfterRevision}, reviewRequired=${result.reviewRequired}`,
    );
    return;
  }
  if (command === 'freeze') {
    const decisions = values.get('decisions');
    const result = await freezeGold({
      casesPath: path.resolve(value(values, 'cases', path.join(benchmarkRoot(), 'benchmark', 'bundle-inputs.jsonl'))),
      draftPath: path.resolve(value(values, 'draft')),
      decisionsPath: decisions ? path.resolve(decisions) : undefined,
      outputPath: path.resolve(value(values, 'output', path.join(benchmarkRoot(), 'benchmark', 'gold.jsonl'))),
    });
    console.log(`Gold frozen: accepted=${result.frozen.length}, unresolved=${result.unresolved.length}`);
    result.unresolved.forEach((entry) => console.log(`  ${entry}`));
    if (result.unresolved.length) throw new Error('Gold freeze is incomplete; resolve every listed case before evaluation');
    return;
  }
  if (command === 'review-sample') {
    const result = await createReviewSample({
      draftPath: path.resolve(value(values, 'draft', path.join(benchmarkRoot(), 'benchmark', 'gold.draft.jsonl'))),
      reviewPath: path.resolve(value(values, 'review', path.join(benchmarkRoot(), 'benchmark', 'review.jsonl'))),
      outputPath: path.resolve(value(values, 'output', path.join(benchmarkRoot(), 'benchmark', 'human-review-sample.jsonl'))),
      acceptedSampleRate: Number(value(values, 'rate', '0.1')),
    });
    console.log(`Review sample created: mandatory=${result.mandatory}, spotChecks=${result.spotChecks}, total=${result.total}`);
    return;
  }
  if (command === 'score') {
    const predictionsRoot = path.resolve(value(values, 'predictions'));
    const outputDir = path.resolve(value(values, 'output', path.join(benchmarkRoot(), 'results', path.basename(predictionsRoot))));
    const result = await scoreBenchmark({
      casesPath: path.resolve(value(values, 'cases', path.join(benchmarkRoot(), 'benchmark', 'cases.jsonl'))),
      goldPath: path.resolve(value(values, 'gold', path.join(benchmarkRoot(), 'benchmark', 'gold.jsonl'))),
      predictionsRoot,
      outputDir,
      experimentId: values.has('experiment') ? experimentValue(values) : undefined,
      split: splitValue(values),
    });
    console.log(`Scoring completed: rows=${result.rows.length}`);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error: any) => {
  console.error(error?.message ?? error);
  process.exitCode = 1;
});

import path from 'path';
import type { PartialDebuggingGraphBundle } from '../../types/partialDebugging.js';
import { prepareTemplateAttentionRequest } from '../../core/llm/templateAttentionAnalyzer.js';
import { BENCHMARK_SCHEMA_VERSION } from './types.js';
import type {
  BenchmarkCaseMetadata,
  BenchmarkProjection,
  BenchmarkGold,
  BuiltBundleCase,
  ReadyBenchmarkCase,
  SerializedAnchorCatalog,
} from './types.js';
import { readJsonl, sha256, writeJsonl } from './io.js';
import { validateProjection } from './projection.js';

export interface BundleCaseInput extends BenchmarkCaseMetadata {
  canonicalIntent: string;
  parentInterface?: string;
  bundle: PartialDebuggingGraphBundle;
  projection?: BenchmarkProjection;
}

function serializeCatalog(catalog: {
  sourceNodes: Array<Record<string, unknown>>;
  sourceEdges: Array<Record<string, unknown>>;
  r1csNodes: Array<Record<string, unknown>>;
}): SerializedAnchorCatalog {
  return {
    sourceNodes: catalog.sourceNodes,
    sourceEdges: catalog.sourceEdges,
    r1csNodes: catalog.r1csNodes,
  };
}

export function buildReadyBenchmarkCase(input: BundleCaseInput): ReadyBenchmarkCase {
  if (!input.canonicalIntent.trim()) throw new Error(`Missing canonical intent for ${input.caseId}`);
  const bundleHash = sha256(input.bundle);
  if (input.projection) {
    validateProjection(input.projection, input.caseId, bundleHash);
    if (input.projection.hardExcluded) throw new Error(`Hard-excluded projection cannot be prepared: ${input.caseId}`);
  }
  const prepared = prepareTemplateAttentionRequest(
    input.canonicalIntent.trim(),
    input.bundle,
    input.projection ? { retainedR1csIds: input.projection.retainedR1csIds } : undefined,
  );
  const promptPayload = JSON.parse(prepared.userMessage) as Record<string, unknown>;
  const catalog = serializeCatalog(prepared.catalog);
  const directCatalog: SerializedAnchorCatalog = {
    sourceNodes: catalog.sourceNodes,
    sourceEdges: catalog.sourceEdges,
    r1csNodes: [],
  };

  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    status: 'ready',
    caseId: input.caseId,
    project: input.project,
    projectCommit: input.projectCommit,
    bugFamily: input.bugFamily,
    vulnerableFile: input.vulnerableFile,
    vulnerableLines: input.vulnerableLines,
    selectedTemplate: input.selectedTemplate,
    split: input.split,
    dedupGroupId: input.dedupGroupId,
    canonicalIntent: input.canonicalIntent.trim(),
    directContext: {
      templateName: input.bundle.analysisContext.templateName,
      originCode: input.bundle.analysisContext.originCode,
      ...(input.parentInterface ? { parentInterface: input.parentInterface } : {}),
      candidates: directCatalog,
    },
    systemContext: {
      templateName: input.bundle.analysisContext.templateName,
      promptPayload,
      candidates: catalog,
      detectorIssues: prepared.detectedIssues,
    },
    bundleHash,
    projectionHash: input.projection?.projectionHash,
  };
}

export async function prepareCasesFromBundles(options: {
  inputPath: string;
  outputPath: string;
  goldPath?: string;
  projectionPath?: string;
}): Promise<ReadyBenchmarkCase[]> {
  const inputs = await readJsonl<BuiltBundleCase | BundleCaseInput>(path.resolve(options.inputPath));
  const gold = options.goldPath
    ? await readJsonl<BenchmarkGold>(path.resolve(options.goldPath))
    : [];
  const goldByCase = new Map(gold.map((entry) => [entry.caseId, entry]));
  const projections = options.projectionPath
    ? new Map((await readJsonl<BenchmarkProjection>(path.resolve(options.projectionPath)))
      .map((projection) => [projection.caseId, projection]))
    : undefined;
  const selectedInputs = options.goldPath
    ? inputs.filter((input) => goldByCase.has(input.caseId))
    : inputs;
  if (projections) {
    for (const input of selectedInputs) {
      if (!projections.has(input.caseId)) throw new Error(`Missing projection for ${input.caseId}`);
    }
  }
  if (options.goldPath) {
    const inputIds = new Set(inputs.map((input) => input.caseId));
    for (const entry of gold) {
      if (!inputIds.has(entry.caseId)) throw new Error(`Frozen gold has no matching bundle: ${entry.caseId}`);
    }
  }
  const cases = selectedInputs.map((input) => {
    const embeddedIntent = 'canonicalIntent' in input ? input.canonicalIntent : '';
    const goldEntry = goldByCase.get(input.caseId);
    if (options.goldPath && goldEntry?.annotationStatus !== 'frozen') {
      throw new Error(`Gold is not frozen for ${input.caseId}`);
    }
    const canonicalIntent = goldEntry?.canonicalIntent ?? embeddedIntent;
    return buildReadyBenchmarkCase({
      ...input,
      canonicalIntent,
      parentInterface: input.parentInterface,
      bundle: input.bundle,
      projection: projections?.get(input.caseId),
    });
  });
  const ids = new Set<string>();
  for (const benchmarkCase of cases) {
    if (ids.has(benchmarkCase.caseId)) throw new Error(`Duplicate case_id: ${benchmarkCase.caseId}`);
    ids.add(benchmarkCase.caseId);
  }
  await writeJsonl(path.resolve(options.outputPath), cases);
  return cases;
}

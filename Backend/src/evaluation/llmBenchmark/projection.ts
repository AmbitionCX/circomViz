import type { PartialDebuggingGraphBundle } from '../../types/partialDebugging.js';
import type { AnchorCatalog } from '../../core/llm/templateAttentionAnalyzer.js';
import type { AnnotationInput, BenchmarkProjection } from './types.js';
import { BENCHMARK_SCHEMA_VERSION } from './types.js';
import { sha256 } from './io.js';

type Candidate = Record<string, unknown>;

function candidateId(candidate: Candidate): string {
  return String(candidate.id ?? '');
}

function balancedIndexes(length: number): number[] {
  if (length <= 0) return [];
  const result: number[] = [];
  const seen = new Set<number>();
  const add = (index: number) => {
    if (index >= 0 && index < length && !seen.has(index)) {
      seen.add(index);
      result.push(index);
    }
  };
  add(0);
  add(length - 1);
  const ranges: Array<[number, number]> = [[0, length - 1]];
  while (ranges.length) {
    const [left, right] = ranges.shift()!;
    if (right - left <= 1) continue;
    const middle = Math.floor((left + right) / 2);
    add(middle);
    ranges.push([left, middle], [middle, right]);
  }
  return result;
}

export function prioritizeR1csCandidateIds(
  bundle: PartialDebuggingGraphBundle,
  catalog: AnchorCatalog,
): string[] {
  const byId = new Map(catalog.r1csNodes.map((node) => [candidateId(node), node]));
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    if (id && byId.has(id) && !seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  };
  const addCandidates = (candidates: Candidate[]) => candidates.forEach((candidate) => add(candidateId(candidate)));

  bundle.summary.diagnostics.forEach((diagnostic) => diagnostic.nodeIds.forEach(add));

  const families = catalog.r1csNodes
    .filter((node) => node.kind === 'signal-family' || node.kind === 'constraint-family')
    .sort((left, right) => candidateId(left).localeCompare(candidateId(right)));
  addCandidates(families);

  bundle.mappings.sourceToO0
    .filter((mapping) => mapping.confidence === 'exact' || mapping.confidence === 'high')
    .flatMap((mapping) => mapping.constraintNodeIds)
    .forEach(add);

  const sourceFacingSignals = catalog.r1csNodes
    .filter((node) => node.kind === 'signal' && node.mockSupplied !== true)
    .sort((left, right) => {
      const roleRank = (value: unknown) => value === 'input' || value === 'output' ? 0 : 1;
      return roleRank(left.role) - roleRank(right.role) || candidateId(left).localeCompare(candidateId(right));
    });
  addCandidates(sourceFacingSignals);

  const constraints = catalog.r1csNodes
    .filter((node) => node.kind === 'constraint')
    .sort((left, right) => Number(left.index ?? 0) - Number(right.index ?? 0));
  balancedIndexes(constraints.length).forEach((index) => add(candidateId(constraints[index])));

  catalog.r1csNodes
    .filter((node) => node.kind === 'signal' && node.mockSupplied === true)
    .sort((left, right) => candidateId(left).localeCompare(candidateId(right)))
    .forEach((candidate) => add(candidateId(candidate)));
  catalog.r1csNodes.forEach((candidate) => add(candidateId(candidate)));
  return ordered;
}

export function filterAnnotationInputByProjection(
  input: AnnotationInput,
  projection?: BenchmarkProjection,
): AnnotationInput {
  if (!projection) return input;
  const retained = new Set(projection.retainedR1csIds);
  const available = new Set(input.candidates.r1csNodes.map(candidateId));
  const missing = projection.retainedR1csIds.filter((id) => !available.has(id));
  if (missing.length) {
    throw new Error(`Annotation input is not projection-aligned for ${input.caseId}; missing ${missing.length} R1CS candidates`);
  }
  return {
    ...input,
    candidates: {
      sourceNodes: input.candidates.sourceNodes,
      sourceEdges: input.candidates.sourceEdges,
      r1csNodes: input.candidates.r1csNodes.filter((node) => retained.has(candidateId(node))),
    },
    projectionHash: projection.projectionHash,
  };
}

export function createProjection(options: {
  caseId: string;
  bundleHash: string;
  maxInputTokens: number;
  originalR1csCount: number;
  retainedR1csIds: string[];
  hardExcluded: boolean;
  hardExclusionReason?: BenchmarkProjection['hardExclusionReason'];
  tokenCounts: BenchmarkProjection['tokenCounts'];
}): BenchmarkProjection {
  const base = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    projectionVersion: 'r1cs-token-budget-v2' as const,
    caseId: options.caseId,
    bundleHash: options.bundleHash,
    maxInputTokens: options.maxInputTokens,
    originalR1csCount: options.originalR1csCount,
    retainedR1csIds: options.retainedR1csIds,
    hardExcluded: options.hardExcluded,
    ...(options.hardExcluded
      ? { hardExclusionReason: options.hardExclusionReason ?? 'direct-context-overflow' as const }
      : {}),
    tokenCounts: options.tokenCounts,
  };
  return { ...base, projectionHash: sha256(base) };
}

export function validateProjection(
  projection: BenchmarkProjection,
  caseId: string,
  bundleHash: string,
): void {
  if (projection.projectionVersion !== 'r1cs-token-budget-v2') {
    throw new Error(`Unsupported projection version for ${caseId}: ${projection.projectionVersion}`);
  }
  if (projection.caseId !== caseId) throw new Error(`Projection case mismatch: ${projection.caseId} != ${caseId}`);
  if (projection.bundleHash !== bundleHash) throw new Error(`Projection bundle hash mismatch for ${caseId}`);
  const { projectionHash: _ignored, ...base } = projection;
  if (sha256(base) !== projection.projectionHash) throw new Error(`Projection hash mismatch for ${caseId}`);
}

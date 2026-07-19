import { FastifyRequest, FastifyReply } from 'fastify';
import { ConstraintIndexer } from '../../core/indexer/constraintIndex.js';
import { normalizeConstraints } from '../../core/utils/constraintNormalizer.js';
import { PathGuard } from '../../core/project/pathGuard.js';
import { logger } from '../../utils/logger.js';
import type { ConstraintIndexData } from '../../types/slicerTypes.js';
import type { ConstraintObject } from '../../types/constraint.js';
import type {
  BipartiteGraphRequest,
  BipartiteGraphResponse,
  BipartiteComponentNode,
  BipartiteSignalNode,
  BipartiteConstraintCluster,
  BipartiteGraphEdge,
} from '../../types/slicerTypes.js';

const MAX_TOP_LEVEL_SIGNALS = 200;
const MAX_SAMPLE_FORMULAS = 5;

const EMPTY_METADATA = {
  signalCount: 0, constraintCount: 0, componentCount: 0, arrayFamilyCount: 0,
  inputCount: 0, outputCount: 0, intermediateCount: 0, maxComponentDepth: 0,
  componentGroups: [], buildTimeMs: 0,
};

export async function bipartiteGraphHandler(
  request: FastifyRequest<{ Body: BipartiteGraphRequest }>,
  reply: FastifyReply
) {
  try {
    const { symPath, constraintsJsonPath } = request.body;

    if (!symPath || !constraintsJsonPath) {
      return reply.code(400).send({
        success: false,
        components: [],
        topLevelSignals: [],
        edges: [],
        metadata: EMPTY_METADATA,
        error: 'symPath and constraintsJsonPath are required',
      } as BipartiteGraphResponse);
    }

    const pathGuard = new PathGuard();
    const artifactValidation = pathGuard.validateGeneratedArtifactPaths(symPath, constraintsJsonPath);
    if (!artifactValidation.valid) {
      return reply.code(400).send({
        success: false,
        components: [],
        topLevelSignals: [],
        edges: [],
        metadata: EMPTY_METADATA,
        error: artifactValidation.error,
      } as BipartiteGraphResponse);
    }

    logger.info(`Building bipartite graph: sym=${artifactValidation.symPath}, constraints=${artifactValidation.constraintsJsonPath}`);

    const indexer = new ConstraintIndexer();
    const { index, symEntries, constraints } = await indexer.loadOrBuild(
      artifactValidation.symPath!,
      artifactValidation.constraintsJsonPath!
    );

    const { invariants } = normalizeConstraints(constraints, symEntries);

    const components = buildComponentNodes(index, constraints, invariants);
    const topLevelSignals = buildTopLevelSignals(index, constraints, MAX_TOP_LEVEL_SIGNALS);
    const edges = buildComponentEdges(index, constraints);

    logger.info(`Bipartite graph: ${components.length} components, ${topLevelSignals.length} top-level signals, ${edges.length} edges`);

    reply.send({
      success: true,
      components,
      topLevelSignals,
      edges,
      metadata: index.metadata,
    } as BipartiteGraphResponse);
  } catch (error: any) {
    logger.error(`Error building bipartite graph: ${error.message}`);
    reply.code(500).send({
      success: false,
      components: [],
      topLevelSignals: [],
      edges: [],
      metadata: EMPTY_METADATA,
      error: error.message,
    } as BipartiteGraphResponse);
  }
}

function buildComponentNodes(
  index: ConstraintIndexData,
  constraints: ConstraintObject[],
  invariants: Array<{ kind: string; description: string; signals: string[] }>
): BipartiteComponentNode[] {
  const components: BipartiteComponentNode[] = [];

  for (const group of index.metadata.componentGroups) {
    const prefix = group.prefix;
    const sigIndices = index.componentToSignals[prefix] || [];
    const signalIndexSet = new Set<number>(sigIndices);

    const componentConstraintIndices = new Set<number>();
    for (const sigIdx of sigIndices) {
      const cIndices = index.signalToConstraints[sigIdx] || [];
      for (const ci of cIndices) {
        const depSignals = index.constraintToSignals[ci] || [];
        const allInComponent = depSignals.every((s: number) => signalIndexSet.has(s));
        if (allInComponent) {
          componentConstraintIndices.add(ci);
        }
      }
    }

    const signals = buildComponentSignals(index, sigIndices, componentConstraintIndices);

    const constraintClusters = buildConstraintClusters(
      componentConstraintIndices,
      constraints,
      invariants,
      index
    );

    const label = prefix.split('.').pop() || prefix;

    components.push({
      id: `comp-${prefix}`,
      prefix,
      label,
      signalCount: group.signalCount,
      constraintCount: group.constraintCount,
      inputCount: group.inputCount,
      outputCount: group.outputCount,
      intermediateCount: group.intermediateCount,
      kindCounts: group.kindCounts,
      childComponents: group.childComponents,
      signals,
      constraints: constraintClusters,
    });
  }

  return components;
}

function buildComponentSignals(
  index: ConstraintIndexData,
  sigIndices: number[],
  constraintIndices: Set<number>
): BipartiteSignalNode[] {
  const signals: BipartiteSignalNode[] = [];
  const sortedIndices = [...sigIndices].sort((a: number, b: number) => a - b);

  for (const idx of sortedIndices) {
    const name = index.signalToName[idx] || `s_${idx}`;
    const shortName = name.split('.').pop() || name;
    const constraintCount = (index.signalToConstraints[idx] || []).filter((ci: number) => constraintIndices.has(ci)).length;

    signals.push({
      id: `sig-${idx}`,
      index: idx,
      name,
      shortName,
      component: index.signalToComponent[idx] || 'unknown',
      classification: index.signalClassification[idx] || 'intermediate',
      witness: -1,
      constraintCount,
    });
  }

  return signals;
}

function buildConstraintClusters(
  constraintIndices: Set<number>,
  constraints: ConstraintObject[],
  invariants: Array<{ kind: string; description: string; signals: string[] }>,
  index: ConstraintIndexData
): BipartiteConstraintCluster[] {
  const kindGroups = new Map<string, { indices: number[]; signals: Set<string>; samples: string[] }>();

  const sortedIndices = Array.from(constraintIndices).sort((a: number, b: number) => a - b);

  for (const ci of sortedIndices) {
    const kind = ci < invariants.length ? invariants[ci].kind : 'unknown';
    if (!kindGroups.has(kind)) {
      kindGroups.set(kind, { indices: [], signals: new Set(), samples: [] });
    }
    const group = kindGroups.get(kind)!;
    group.indices.push(ci);

    const depSignals = index.constraintToSignals[ci] || [];
    for (const sigIdx of depSignals) {
      const name = index.signalToName[sigIdx];
      if (name) group.signals.add(name.split('.').pop() || name);
    }

    if (ci < constraints.length && group.samples.length < MAX_SAMPLE_FORMULAS) {
      const [a, b, c] = constraints[ci];
      const exprToParts = (expr: Record<string, string | number>) => {
        const parts: string[] = [];
        for (const [key, _val] of Object.entries(expr)) {
          if (key === '0' || key === '1') continue;
          const sigName = index.signalToName[parseInt(key)];
          if (sigName) parts.push(sigName.split('.').pop() || `s_${key}`);
        }
        return parts.join(', ');
      };
      group.samples.push(`${exprToParts(a)} * ${exprToParts(b)} = ${exprToParts(c)}`);
    }
  }

  const clusters: BipartiteConstraintCluster[] = [];
  for (const [kind, group] of kindGroups) {
    if (group.indices.length === 0) continue;

    const minIdx = group.indices[0];
    const maxIdx = group.indices[group.indices.length - 1];
    const indexRange = group.indices.length === 1
      ? String(minIdx)
      : `${minIdx}-${maxIdx}`;

    clusters.push({
      id: `cluster-${kind}-${minIdx}`,
      kind,
      indexRange,
      count: group.indices.length,
      sampleFormula: group.samples[0] || '',
      signals: Array.from(group.signals).slice(0, 20),
    });
  }

  return clusters.sort((a, b) => b.count - a.count);
}

function buildTopLevelSignals(
  index: ConstraintIndexData,
  _constraints: ConstraintObject[],
  maxSignals: number
): BipartiteSignalNode[] {
  const mainSignals = index.componentToSignals['main'] || [];
  const signals: BipartiteSignalNode[] = [];
  const sortedIndices = [...mainSignals].sort((a: number, b: number) => a - b);
  const limit = Math.min(sortedIndices.length, maxSignals);

  for (let i = 0; i < limit; i++) {
    const idx = sortedIndices[i];
    const name = index.signalToName[idx] || `s_${idx}`;
    const shortName = name.split('.').pop() || name;
    const constraintCount = (index.signalToConstraints[idx] || []).length;

    signals.push({
      id: `sig-${idx}`,
      index: idx,
      name,
      shortName,
      component: 'main',
      classification: index.signalClassification[idx] || 'intermediate',
      witness: -1,
      constraintCount,
    });
  }

  return signals;
}

function buildComponentEdges(
  index: ConstraintIndexData,
  constraints: ConstraintObject[]
): BipartiteGraphEdge[] {
  const edges: BipartiteGraphEdge[] = [];
  const edgeMap = new Map<string, { signalCount: number }>();

  for (let ci = 0; ci < constraints.length; ci++) {
    const depSignals = index.constraintToSignals[ci] || [];
    if (depSignals.length < 2) continue;

    const components = new Set<string>();
    for (const sigIdx of depSignals) {
      const comp = index.signalToComponent[sigIdx];
      if (comp) components.add(comp);
    }

    const compArray = Array.from(components).sort();
    if (compArray.length < 2) continue;

    for (let i = 0; i < compArray.length; i++) {
      for (let j = i + 1; j < compArray.length; j++) {
        const key = `${compArray[i]}|||${compArray[j]}`;
        if (!edgeMap.has(key)) {
          edgeMap.set(key, { signalCount: 0 });
        }
        edgeMap.get(key)!.signalCount++;
      }
    }
  }

  for (const [key, data] of edgeMap) {
    const [source, target] = key.split('|||');
    edges.push({
      source: `comp-${source}`,
      target: `comp-${target}`,
      weight: data.signalCount,
      type: 'component-flow',
    });
  }

  return edges.sort((a, b) => b.weight - a.weight);
}

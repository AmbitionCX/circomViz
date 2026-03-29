import { FastifyRequest, FastifyReply } from 'fastify';
import { ConstraintIndexer } from '../../core/indexer/constraintIndex.js';
import { parseSymFile, parseConstraintsFile } from '../../core/utils/symbolParser.js';
import { normalizeConstraints, clusterSignalsByComponentPath, type InvariantKind } from '../../core/utils/constraintNormalizer.js';
import { logger } from '../../utils/logger.js';
import type { BipartiteGraphData, ComponentEdge, ConstraintKindSummary } from '../../types/slicerTypes.js';

interface BipartiteGraphRequest {
  symPath: string;
  constraintsJsonPath: string;
}

export async function bipartiteGraphHandler(
  request: FastifyRequest<{ Body: BipartiteGraphRequest }>,
  reply: FastifyReply
) {
  try {
    const { symPath, constraintsJsonPath } = request.body;

    if (!symPath || !constraintsJsonPath) {
      return reply.code(400).send({
        success: false,
        componentGroups: [],
        boundarySignals: [],
        constraintSummaries: [],
        componentEdges: [],
        error: 'symPath and constraintsJsonPath are required',
      });
    }

    logger.info(`Building bipartite graph data: sym=${symPath}`);

    const indexer = new ConstraintIndexer();
    const { data } = await indexer.loadOrBuild(symPath, constraintsJsonPath);

    const symEntries = await parseSymFile(symPath);
    const constraints = await parseConstraintsFile(constraintsJsonPath);
    const { invariants } = normalizeConstraints(constraints, symEntries);

    const componentGroups = data.componentGroups.filter(g => !g.prefix.includes('.') || g.prefix.split('.').length <= 3);

    const boundarySignals = symEntries
      .filter(e => e.index !== 0 && (e.name.split('.').length <= 2))
      .map(e => ({
        name: e.name,
        index: e.index,
        kind: (data.signalClassification[String(e.index)] || 'intermediate') as 'input' | 'output' | 'intermediate',
      }));

    const kindByComponent = new Map<string, Record<string, number>>();
    const componentIndex = new Map<number, string>();
    for (const entry of symEntries) {
      if (entry.index === 0) continue;
      const parts = entry.name.split('.');
      if (parts.length > 1) {
        componentIndex.set(entry.index, parts.slice(0, -1).join('.'));
      }
    }

    for (let ci = 0; ci < constraints.length; ci++) {
      const sigs = data.constraintToSignals[String(ci)];
      if (!sigs) continue;
      for (const sig of sigs) {
        const comp = componentIndex.get(sig) || 'main';
        if (!kindByComponent.has(comp)) kindByComponent.set(comp, {});
      }
      if (ci < invariants.length) {
        const inv = invariants[ci];
        const comps = new Set<string>();
        for (const sig of sigs) {
          comps.add(componentIndex.get(sig) || 'main');
        }
        for (const comp of comps) {
          const counts = kindByComponent.get(comp)!;
          counts[inv.kind] = (counts[inv.kind] || 0) + 1;
        }
      }
    }

    const constraintSummaries: ConstraintKindSummary[] = [];
    for (const [comp, kindCounts] of kindByComponent) {
      constraintSummaries.push({
        component: comp,
        kindCounts,
        total: Object.values(kindCounts).reduce((a, b) => a + b, 0),
      });
    }

    const componentEdges: ComponentEdge[] = [];
    const edgeMap = new Map<string, { signalCount: number; sharedConstraints: number }>();

    for (let ci = 0; ci < constraints.length; ci++) {
      const sigs = data.constraintToSignals[String(ci)];
      if (!sigs) continue;
      const comps = new Set<string>();
      for (const sig of sigs) {
        const comp = componentIndex.get(sig) || 'main';
        comps.add(comp);
      }
      const compArr = Array.from(comps).sort();
      for (let i = 0; i < compArr.length; i++) {
        for (let j = i + 1; j < compArr.length; j++) {
          const key = `${compArr[i]}->${compArr[j]}`;
          if (!edgeMap.has(key)) edgeMap.set(key, { signalCount: 0, sharedConstraints: 0 });
          const edge = edgeMap.get(key)!;
          edge.sharedConstraints++;
          edge.signalCount += sigs.filter(s => {
            const c = componentIndex.get(s) || 'main';
            return c === compArr[i] || c === compArr[j];
          }).length;
        }
      }
    }

    for (const [key, val] of edgeMap) {
      const [from, to] = key.split('->');
      componentEdges.push({
        fromComponent: from,
        toComponent: to,
        signalCount: val.signalCount,
        sharedConstraints: val.sharedConstraints,
      });
    }

    const graphData: BipartiteGraphData & { success: boolean } = {
      success: true,
      componentGroups,
      boundarySignals,
      constraintSummaries: constraintSummaries.sort((a, b) => b.total - a.total).slice(0, 50),
      componentEdges: componentEdges.sort((a, b) => b.sharedConstraints - a.sharedConstraints).slice(0, 100),
    };

    reply.send(graphData);
  } catch (error: any) {
    logger.error(`Error building bipartite graph: ${error.message}`);
    reply.code(500).send({
      success: false,
      componentGroups: [],
      boundarySignals: [],
      constraintSummaries: [],
      componentEdges: [],
      error: error.message,
    });
  }
}

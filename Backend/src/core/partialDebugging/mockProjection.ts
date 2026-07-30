import type {
  ConstraintExpressionDto,
  ConstraintGraphDto,
  GraphDiagnostic,
  MockManifest,
} from '../../types/partialDebugging.js';

const expressionSignals = (expression: ConstraintExpressionDto): number[] => {
  if (expression.kind === 'signal') return [expression.signalId];
  if (expression.kind === 'constant') return [];
  return expression.operands.flatMap(expressionSignals);
};

type SignalExpression = Extract<ConstraintExpressionDto, { kind: 'signal' }>;
type ConstraintSignal = ConstraintGraphDto['signals'][number];

const strictAlias = (
  left: ConstraintExpressionDto,
  right: ConstraintExpressionDto,
): left is SignalExpression => left.kind === 'signal' && right.kind === 'signal';

const rebuildAdjacency = (graph: ConstraintGraphDto): Record<string, string[]> => {
  const adjacency: Record<string, string[]> = {};
  for (const edge of graph.edges) {
    (adjacency[edge.signalNodeId] ??= []).push(edge.constraintNodeId);
    (adjacency[edge.constraintNodeId] ??= []).push(edge.signalNodeId);
  }
  return adjacency;
};

const indexedSuffix = (basePath: string, qualifiedName: string): string | undefined => {
  if (qualifiedName === basePath) return '';
  if (!qualifiedName.startsWith(basePath)) return undefined;
  const suffix = qualifiedName.slice(basePath.length);
  return /^(?:\[\d+\])+$/.test(suffix) ? suffix : undefined;
};

const signalFamily = (
  signals: ConstraintSignal[],
  basePath: string,
): Map<string, ConstraintSignal> => new Map(
  signals.flatMap((signal) => {
    const suffix = indexedSuffix(basePath, signal.qualifiedName);
    return suffix === undefined ? [] : [[suffix, signal] as const];
  }),
);

const sameIndexSet = (left: Map<string, unknown>, right: Map<string, unknown>): boolean =>
  left.size === right.size && [...left.keys()].every((suffix) => right.has(suffix));

const constraintsTouching = (
  graph: ConstraintGraphDto,
  signalIds: Set<number>,
): ConstraintGraphDto['constraints'] => graph.constraints.filter((constraint) => {
  const ids = [...expressionSignals(constraint.equation.left), ...expressionSignals(constraint.equation.right)];
  return ids.some((id) => signalIds.has(id));
});

const aliasChainConnects = (
  outputSignalId: number,
  syntheticIds: Set<number>,
  constraints: ConstraintGraphDto['constraints'],
): boolean => {
  const connected = new Map<number, Set<number>>();
  for (const constraint of constraints) {
    if (!strictAlias(constraint.equation.left, constraint.equation.right)) continue;
    const left = constraint.equation.left.signalId;
    const right = (constraint.equation.right as SignalExpression).signalId;
    (connected.get(left) ?? connected.set(left, new Set()).get(left)!).add(right);
    (connected.get(right) ?? connected.set(right, new Set()).get(right)!).add(left);
  }
  const reached = new Set<number>();
  const queue = [outputSignalId];
  while (queue.length) {
    const signalId = queue.shift()!;
    if (reached.has(signalId)) continue;
    reached.add(signalId);
    for (const neighbor of connected.get(signalId) ?? []) queue.push(neighbor);
  }
  return [...syntheticIds].every((signalId) => reached.has(signalId));
};

export function projectMockConstraints(
  rawGraph: ConstraintGraphDto,
  manifest: MockManifest,
): { graph: ConstraintGraphDto; diagnostics: GraphDiagnostic[] } {
  let graph: ConstraintGraphDto = {
    ...rawGraph,
    signals: rawGraph.signals.map((signal) => ({ ...signal })),
    constraints: [...rawGraph.constraints],
    edges: [...rawGraph.edges],
    signalGroups: [...rawGraph.signalGroups],
    loopClusters: [...rawGraph.loopClusters],
    mockBoundaries: [],
  };
  const diagnostics: GraphDiagnostic[] = [];

  for (const mock of manifest.mocks) {
    for (const outputPath of mock.boundaryOutputs) {
      const declaredSynthetic = mock.syntheticSignals.filter((signal) => signal.forOutput === outputPath);
      const outputFamily = signalFamily(graph.signals, outputPath);
      const syntheticFamilies = declaredSynthetic.map((declared) => ({
        declared,
        members: signalFamily(graph.signals, declared.path),
      }));
      const familiesHaveSameShape = outputFamily.size > 0 && declaredSynthetic.length > 0 &&
        syntheticFamilies.every(({ members }) => sameIndexSet(outputFamily, members));
      const outputNodes = [...outputFamily.values()];
      const syntheticNodes = syntheticFamilies.flatMap(({ members }) => [...members.values()]);
      const plumbingById = new Map<string, ConstraintGraphDto['constraints'][number]>();
      const allSyntheticIds = new Set(syntheticNodes.map((signal) => signal.signalId));
      constraintsTouching(graph, allSyntheticIds)
        .forEach((constraint) => plumbingById.set(constraint.id, constraint));
      let everyElementIsSafe = familiesHaveSameShape;

      if (familiesHaveSameShape) {
        for (const [suffix, output] of outputFamily) {
          const elementSyntheticNodes = syntheticFamilies.map(({ members }) => members.get(suffix)!);
          const syntheticIds = new Set(elementSyntheticNodes.map((signal) => signal.signalId));
          const allowedSignalIds = new Set([output.signalId, ...syntheticIds]);
          const plumbingConstraints = constraintsTouching(graph, syntheticIds);
          plumbingConstraints.forEach((constraint) => plumbingById.set(constraint.id, constraint));
          const aliasesAreExpected = plumbingConstraints.length > 0 && plumbingConstraints.every((constraint) => {
            if (!strictAlias(constraint.equation.left, constraint.equation.right)) return false;
            const ids = [...expressionSignals(constraint.equation.left), ...expressionSignals(constraint.equation.right)];
            return ids.length === 2 && ids.every((id) => allowedSignalIds.has(id));
          });
          if (!aliasesAreExpected || !aliasChainConnects(output.signalId, syntheticIds, plumbingConstraints)) {
            everyElementIsSafe = false;
          }
        }
      }

      if (!everyElementIsSafe) {
        diagnostics.push({
          id: `diagnostic:mock-leakage:${mock.instancePath}:${outputPath}`,
          type: 'MOCK_LEAKAGE',
          severity: 'high',
          message: `Mock leakage: synthetic wiring for ${outputPath} is not an isolated index-preserving alias family.`,
          nodeIds: [
            ...outputNodes.map((signal) => signal.id),
            ...syntheticNodes.map((signal) => signal.id),
            ...plumbingById.keys(),
          ],
        });
        continue;
      }

      const hiddenConstraintIds = new Set(plumbingById.keys());
      const hiddenSignalNodeIds = new Set(syntheticNodes.map((signal) => signal.id));
      const mockSuppliedOutputIds = new Set(outputNodes.map((signal) => signal.id));
      graph.constraints = graph.constraints.filter((constraint) => !hiddenConstraintIds.has(constraint.id));
      graph.signals = graph.signals
        .filter((signal) => !hiddenSignalNodeIds.has(signal.id))
        .map((signal) => mockSuppliedOutputIds.has(signal.id) ? { ...signal, mockSupplied: true } : signal);
      graph.edges = graph.edges.filter((edge) =>
        !hiddenConstraintIds.has(edge.constraintNodeId) && !hiddenSignalNodeIds.has(edge.signalNodeId));
    }
  }

  graph.adjacency = rebuildAdjacency(graph);
  return { graph, diagnostics };
}

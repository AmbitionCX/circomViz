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

export function projectMockConstraints(
  rawGraph: ConstraintGraphDto,
  manifest: MockManifest,
): { graph: ConstraintGraphDto; diagnostics: GraphDiagnostic[] } {
  let graph: ConstraintGraphDto = {
    ...rawGraph,
    signals: rawGraph.signals.map((signal) => ({ ...signal })),
    constraints: [...rawGraph.constraints],
    edges: [...rawGraph.edges],
    mockBoundaries: [],
  };
  const diagnostics: GraphDiagnostic[] = [];

  for (const mock of manifest.mocks) {
    for (const outputPath of mock.boundaryOutputs) {
      const output = graph.signals.find((signal) => signal.qualifiedName === outputPath);
      const declaredSynthetic = mock.syntheticSignals.filter((signal) => signal.forOutput === outputPath);
      const syntheticNodes = declaredSynthetic
        .map((declared) => graph.signals.find((signal) => signal.qualifiedName === declared.path))
        .filter((signal): signal is ConstraintGraphDto['signals'][number] => Boolean(signal));
      const missingPaths = declaredSynthetic.filter((declared) => !syntheticNodes.some((signal) => signal.qualifiedName === declared.path));
      const syntheticIds = new Set(syntheticNodes.map((signal) => signal.signalId));
      const allowedSignalIds = new Set([...syntheticIds, ...(output ? [output.signalId] : [])]);
      const plumbingConstraints = graph.constraints.filter((constraint) => {
        const ids = [...expressionSignals(constraint.equation.left), ...expressionSignals(constraint.equation.right)];
        return ids.some((id) => syntheticIds.has(id));
      });

      const aliasesAreExpected = plumbingConstraints.length > 0 && plumbingConstraints.every((constraint) => {
        if (!strictAlias(constraint.equation.left, constraint.equation.right)) return false;
        const ids = [...expressionSignals(constraint.equation.left), ...expressionSignals(constraint.equation.right)];
        return ids.length === 2 && ids.every((id) => allowedSignalIds.has(id));
      });
      const connected = new Map<number, Set<number>>();
      for (const constraint of plumbingConstraints) {
        if (!strictAlias(constraint.equation.left, constraint.equation.right)) continue;
        const left = constraint.equation.left.signalId;
        const right = (constraint.equation.right as SignalExpression).signalId;
        (connected.get(left) ?? connected.set(left, new Set()).get(left)!).add(right);
        (connected.get(right) ?? connected.set(right, new Set()).get(right)!).add(left);
      }
      const reached = new Set<number>();
      const queue = output ? [output.signalId] : [];
      while (queue.length) {
        const signalId = queue.shift()!;
        if (reached.has(signalId)) continue;
        reached.add(signalId);
        for (const neighbor of connected.get(signalId) ?? []) queue.push(neighbor);
      }
      const safeToCollapse = Boolean(output) && declaredSynthetic.length > 0 && missingPaths.length === 0 &&
        syntheticNodes.length === declaredSynthetic.length && aliasesAreExpected &&
        [...syntheticIds].every((signalId) => reached.has(signalId));

      if (!safeToCollapse) {
        diagnostics.push({
          id: `diagnostic:mock-leakage:${mock.instancePath}:${outputPath}`,
          type: 'MOCK_LEAKAGE',
          severity: 'high',
          message: `Mock leakage: synthetic wiring for ${outputPath} is not an isolated linear alias chain.`,
          nodeIds: [
            ...(output ? [output.id] : []),
            ...syntheticNodes.map((signal) => signal.id),
            ...plumbingConstraints.map((constraint) => constraint.id),
          ],
        });
        continue;
      }

      const hiddenConstraintIds = new Set(plumbingConstraints.map((constraint) => constraint.id));
      const hiddenSignalNodeIds = new Set(syntheticNodes.map((signal) => signal.id));
      graph.constraints = graph.constraints.filter((constraint) => !hiddenConstraintIds.has(constraint.id));
      graph.signals = graph.signals
        .filter((signal) => !hiddenSignalNodeIds.has(signal.id))
        .map((signal) => signal.id === output!.id ? { ...signal, mockSupplied: true } : signal);
      graph.edges = graph.edges.filter((edge) =>
        !hiddenConstraintIds.has(edge.constraintNodeId) && !hiddenSignalNodeIds.has(edge.signalNodeId));
      graph.mockBoundaries.push({
        id: `mock-boundary:${output!.id}`,
        outputSignalId: output!.id,
        label: 'Mock-supplied',
      });
    }
  }

  graph.adjacency = rebuildAdjacency(graph);
  return { graph, diagnostics };
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { projectMockConstraints } from '../core/partialDebugging/mockProjection.js';
import type {
  ConstraintExpressionDto,
  ConstraintGraphDto,
  ConstraintNodeDto,
  MockManifest,
} from '../types/partialDebugging.js';

const signal = (signalId: number): ConstraintExpressionDto => ({ kind: 'signal', signalId });
const emptyCombination = { terms: [] };

const constraint = (
  index: number,
  left: ConstraintExpressionDto,
  right: ConstraintExpressionDto,
): ConstraintNodeDto => ({
  id: `constraint:${index}`,
  kind: 'constraint',
  optimization: 'O0',
  index,
  A: emptyCombination,
  B: emptyCombination,
  C: emptyCombination,
  equation: { left, right },
  canonicalFingerprint: `constraint-${index}`,
  complexity: 'linear',
});

const manifest: MockManifest = {
  selectedRoot: 'main',
  mocks: [{
    instancePath: 'main.c',
    originalTemplate: 'ToyCommit2',
    mockedTemplate: 'ToyCommit2_mocked',
    boundaryInputs: ['main.c.x', 'main.c.secret'],
    boundaryOutputs: ['main.c.commitment'],
    syntheticSignals: [
      { path: 'main.__mock_c_commitment', role: 'root-mock-input', forOutput: 'main.c.commitment' },
      { path: 'main.c.__mock_commitment', role: 'mock-bridge', forOutput: 'main.c.commitment' },
    ],
  }],
};

const graph = (constraints: ConstraintNodeDto[]): ConstraintGraphDto => ({
  level: 'O0',
  signals: [
    { id: 'signal:1', kind: 'signal', signalId: 1, witnessIndex: 1, componentId: 0, qualifiedName: 'main.c.commitment', status: 'surviving', role: 'output' },
    { id: 'signal:2', kind: 'signal', signalId: 2, witnessIndex: 2, componentId: 0, qualifiedName: 'main.__mock_c_commitment', status: 'surviving', role: 'synthetic' },
    { id: 'signal:3', kind: 'signal', signalId: 3, witnessIndex: 3, componentId: 0, qualifiedName: 'main.c.__mock_commitment', status: 'surviving', role: 'synthetic' },
  ],
  constraints,
  edges: [],
  adjacency: {},
  mockBoundaries: [],
});

test('collapses a validated mock alias chain onto its visible output', () => {
  const result = projectMockConstraints(graph([
    constraint(0, signal(2), signal(3)),
    constraint(1, signal(3), signal(1)),
  ]), manifest);

  assert.deepEqual(result.graph.signals.map((node) => node.qualifiedName), ['main.c.commitment']);
  assert.equal(result.graph.signals[0]?.mockSupplied, true);
  assert.equal(result.graph.constraints.length, 0);
  assert.deepEqual(result.graph.mockBoundaries, [{
    id: 'mock-boundary:signal:1',
    outputSignalId: 'signal:1',
    label: 'Mock-supplied',
  }]);
  assert.deepEqual(result.diagnostics, []);
});

test('keeps unexpected synthetic operations visible and reports mock leakage', () => {
  const multiply: ConstraintExpressionDto = { kind: 'mul', operands: [signal(3), signal(1)] };
  const result = projectMockConstraints(graph([
    constraint(0, signal(2), multiply),
  ]), manifest);

  assert.equal(result.graph.signals.length, 3);
  assert.equal(result.graph.constraints.length, 1);
  assert.equal(result.graph.mockBoundaries.length, 0);
  assert.equal(result.diagnostics[0]?.type, 'MOCK_LEAKAGE');
  assert.equal(result.diagnostics[0]?.severity, 'high');
});

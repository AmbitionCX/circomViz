import assert from 'node:assert/strict';
import test from 'node:test';
import { projectMockConstraints } from '../core/partialDebugging/mockProjection.js';
import type {
  ConstraintExpressionDto,
  ConstraintGraphDto,
  ConstraintNodeDto,
  ConstraintSignalNodeDto,
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

const signalNode = (
  signalId: number,
  qualifiedName: string,
  role: ConstraintSignalNodeDto['role'],
): ConstraintSignalNodeDto => ({
  id: `signal:${signalId}`,
  kind: 'signal',
  signalId,
  witnessIndex: signalId,
  componentId: qualifiedName.includes('.bits.') ? 1 : 0,
  qualifiedName,
  status: 'surviving',
  role,
});

const graph = (
  signals: ConstraintSignalNodeDto[],
  constraints: ConstraintNodeDto[],
): ConstraintGraphDto => ({
  level: 'O0',
  signals,
  constraints,
  edges: [],
  adjacency: {},
  signalGroups: [],
  loopClusters: [],
  mockBoundaries: [],
});

const scalarManifest: MockManifest = {
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

const arrayManifest: MockManifest = {
  selectedRoot: 'main',
  mocks: [{
    instancePath: 'main.bits',
    originalTemplate: 'Num2Bits',
    mockedTemplate: 'Num2Bits_mocked',
    boundaryInputs: ['main.bits.in'],
    boundaryOutputs: ['main.bits.out'],
    syntheticSignals: [
      { path: 'main.__mock_bits_out', role: 'root-mock-input', forOutput: 'main.bits.out' },
      { path: 'main.bits.__mock_out', role: 'mock-bridge', forOutput: 'main.bits.out' },
    ],
  }],
};

const scalarSignals = () => [
  signalNode(1, 'main.c.commitment', 'output'),
  signalNode(2, 'main.__mock_c_commitment', 'synthetic'),
  signalNode(3, 'main.c.__mock_commitment', 'synthetic'),
];

const arraySignals = (suffixes: string[]): ConstraintSignalNodeDto[] => [
  ...suffixes.map((suffix, index) => signalNode(index + 1, `main.bits.out${suffix}`, 'output')),
  ...suffixes.map((suffix, index) => signalNode(index + 11, `main.__mock_bits_out${suffix}`, 'synthetic')),
  ...suffixes.map((suffix, index) => signalNode(index + 21, `main.bits.__mock_out${suffix}`, 'synthetic')),
];

const arrayPlumbing = (elementCount: number): ConstraintNodeDto[] => Array.from(
  { length: elementCount },
  (_, index) => [
    constraint(index * 2, signal(index + 11), signal(index + 21)),
    constraint(index * 2 + 1, signal(index + 21), signal(index + 1)),
  ],
).flat();

test('collapses a validated scalar mock alias chain onto its visible output', () => {
  const result = projectMockConstraints(graph(scalarSignals(), [
    constraint(0, signal(2), signal(3)),
    constraint(1, signal(3), signal(1)),
  ]), scalarManifest);

  assert.deepEqual(result.graph.signals.map((node) => node.qualifiedName), ['main.c.commitment']);
  assert.equal(result.graph.signals[0]?.mockSupplied, true);
  assert.equal(result.graph.constraints.length, 0);
  assert.deepEqual(result.graph.mockBoundaries, []);
  assert.deepEqual(result.diagnostics, []);
});

test('collapses every element of a Range4-style mock array family', () => {
  const suffixes = ['[0]', '[1]', '[2]', '[3]'];
  const result = projectMockConstraints(
    graph(arraySignals(suffixes), arrayPlumbing(suffixes.length)),
    arrayManifest,
  );

  assert.deepEqual(
    result.graph.signals.map((node) => node.qualifiedName),
    suffixes.map((suffix) => `main.bits.out${suffix}`),
  );
  assert.ok(result.graph.signals.every((node) => node.mockSupplied));
  assert.equal(result.graph.constraints.length, 0);
  assert.deepEqual(result.graph.mockBoundaries, []);
  assert.deepEqual(result.diagnostics, []);
});

test('preserves complete index tuples when collapsing a multidimensional array', () => {
  const suffixes = ['[0][0]', '[0][1]', '[1][0]', '[1][1]'];
  const result = projectMockConstraints(
    graph(arraySignals(suffixes), arrayPlumbing(suffixes.length)),
    arrayManifest,
  );

  assert.deepEqual(
    result.graph.signals.map((node) => node.qualifiedName),
    suffixes.map((suffix) => `main.bits.out${suffix}`),
  );
  assert.equal(result.graph.constraints.length, 0);
  assert.deepEqual(result.diagnostics, []);
});

test('keeps a genuine parent constraint that consumes a mock-supplied output', () => {
  const parentSignal = signalNode(4, 'main.expectedCommitment', 'input');
  const parentConstraint = constraint(2, signal(1), signal(4));
  const result = projectMockConstraints(graph([
    ...scalarSignals(),
    parentSignal,
  ], [
    constraint(0, signal(2), signal(3)),
    constraint(1, signal(3), signal(1)),
    parentConstraint,
  ]), scalarManifest);

  assert.deepEqual(result.graph.signals.map((node) => node.qualifiedName), [
    'main.c.commitment',
    'main.expectedCommitment',
  ]);
  assert.equal(result.graph.signals[0]?.mockSupplied, true);
  assert.deepEqual(result.graph.constraints.map((node) => node.id), [parentConstraint.id]);
  assert.deepEqual(result.diagnostics, []);
});

test('keeps the whole family visible when array wiring crosses indices', () => {
  const suffixes = ['[0]', '[1]'];
  const constraints = [
    constraint(0, signal(11), signal(22)),
    constraint(1, signal(21), signal(1)),
    constraint(2, signal(12), signal(21)),
    constraint(3, signal(22), signal(2)),
  ];
  const inputGraph = graph(arraySignals(suffixes), constraints);
  const result = projectMockConstraints(inputGraph, arrayManifest);

  assert.equal(result.graph.signals.length, inputGraph.signals.length);
  assert.equal(result.graph.constraints.length, constraints.length);
  assert.ok(result.graph.signals.every((node) => !node.mockSupplied));
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]?.type, 'MOCK_LEAKAGE');
  assert.equal(result.diagnostics[0]?.severity, 'high');
});

test('keeps the whole family visible when an indexed synthetic member is missing', () => {
  const suffixes = ['[0]', '[1]'];
  const signals = arraySignals(suffixes).filter((node) => node.qualifiedName !== 'main.bits.__mock_out[1]');
  const constraints = arrayPlumbing(1);
  const result = projectMockConstraints(graph(signals, constraints), arrayManifest);

  assert.equal(result.graph.signals.length, signals.length);
  assert.equal(result.graph.constraints.length, constraints.length);
  assert.ok(result.graph.signals.every((node) => !node.mockSupplied));
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]?.type, 'MOCK_LEAKAGE');
  assert.ok(result.diagnostics[0]?.nodeIds.includes('constraint:0'));
});

test('keeps unexpected synthetic operations visible and reports mock leakage', () => {
  const multiply: ConstraintExpressionDto = { kind: 'mul', operands: [signal(3), signal(1)] };
  const result = projectMockConstraints(graph(scalarSignals(), [
    constraint(0, signal(2), multiply),
  ]), scalarManifest);

  assert.equal(result.graph.signals.length, 3);
  assert.equal(result.graph.constraints.length, 1);
  assert.equal(result.graph.mockBoundaries.length, 0);
  assert.equal(result.diagnostics[0]?.type, 'MOCK_LEAKAGE');
  assert.equal(result.diagnostics[0]?.severity, 'high');
});

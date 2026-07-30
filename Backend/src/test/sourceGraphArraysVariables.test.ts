import assert from 'node:assert/strict';
import test from 'node:test';
import { CircomLexer } from '../core/parser/lexer.js';
import { CircomParser } from '../core/parser/parser.js';
import { addConstraintLoopClusters, addConstraintSignalGroups } from '../core/partialDebugging/build.js';
import { buildSourceGraph } from '../core/partialDebugging/sourceGraph.js';
import type { ParsedFile, TemplateDefinitionNode } from '../core/parser/ast.js';
import type { ConstraintGraphDto } from '../types/partialDebugging.js';

const source = `
pragma circom 2.2.3;

template Bit() {
  signal input in;
  in * (in - 1) === 0;
}

template Num2Bits(n) {
  signal input in;
  signal output out[n];
  component b[n];
  var acc = 0;
  var pow = 1;
  for (var i = 0; i < n; i++) {
    b[i] = Bit();
    out[i] <-- (in >> i) & 1;
    b[i].in <== out[i];
    acc = acc + out[i] * pow;
    pow = pow * 2;
  }
  acc === in;
}
`;

function parse(): { file: ParsedFile; template: TemplateDefinitionNode } {
  const path = 'arrays.circom';
  const ast = new CircomParser(new CircomLexer(source), path).parse(source, path);
  const templates = ast.filter((node): node is TemplateDefinitionNode => node.type === 'TemplateDefinition');
  const template = templates.find((candidate) => candidate.name === 'Num2Bits');
  assert.ok(template);
  return {
    file: { path, content: source, ast, includes: [], templates, functions: [], components: [] },
    template,
  };
}

test('keeps source arrays and component arrays aggregated and models used variables', () => {
  const { file, template } = parse();
  const graph = buildSourceGraph(new Map([[file.path, file]]), template, [{ name: 'n', value: 4 }], []);

  const signalLabels = graph.nodes.filter((node) => node.kind === 'signal').map((node) => node.localName);
  assert.ok(signalLabels.includes('out[n]'));
  assert.ok(signalLabels.includes('b[n].in'));
  assert.ok(!signalLabels.some((label) => /out\[\d+\]/.test(label ?? '')));
  assert.ok(!signalLabels.some((label) => label === 'b[i]'));

  const component = graph.nodes.find((node) => node.kind === 'component-group' && node.localName === 'b[n]');
  assert.equal(component?.templateName, 'Bit');

  const variables = graph.nodes.filter((node) => node.kind === 'variable' && !node.statePhase);
  assert.deepEqual(variables.map((node) => node.localName).sort(), ['acc', 'i', 'pow']);
  assert.equal(variables.find((node) => node.localName === 'acc')?.initialValue, 0);
  assert.equal(variables.find((node) => node.localName === 'pow')?.initialValue, 1);
  assert.equal(variables.find((node) => node.localName === 'i')?.loopVariable, true);
  assert.ok(!graph.nodes.some((node) => node.kind === 'signal' && ['acc', 'pow', 'i'].includes(node.localName ?? '')));

  assert.equal(graph.loops.length, 1);
  const loop = graph.loops[0]!;
  assert.equal(loop.header, 'for (i = 0; i < n; i++)');
  assert.equal(loop.iterator, 'i');
  assert.equal(loop.iterationCount, 4);
  assert.equal(loop.iterationLabel, '× 4');
  const statements = graph.statements.filter((statement) => statement.loopId === loop.id);
  assert.deepEqual(statements.map((statement) => statement.order), [0, 1, 2, 3, 4]);
  assert.deepEqual(statements.map((statement) => statement.kind), ['component', 'witness', 'constraint', 'state-update', 'state-update']);
  assert.deepEqual(statements.map((statement) => statement.label), [
    'b[i] = Bit()',
    'out[i] <-- in >> i & 1',
    'b[i].in <== out[i]',
    'acc = acc + out[i] * pow',
    'pow = pow * 2',
  ]);
  assert.deepEqual(loop.stateVariables.map((state) => state.variableName).sort(), ['acc', 'pow']);
  for (const state of loop.stateVariables) {
    assert.equal(graph.nodes.find((node) => node.id === state.currentNodeId)?.statePhase, 'current');
    assert.equal(graph.nodes.find((node) => node.id === state.nextNodeId)?.statePhase, 'next');
    assert.equal(graph.nodes.find((node) => node.id === state.finalNodeId)?.statePhase, 'final');
    const update = statements.find((statement) => statement.kind === 'state-update' && statement.label.startsWith(`${state.variableName} `));
    assert.ok(update?.nodeIds.includes(state.currentNodeId));
    assert.ok(update?.nodeIds.includes(state.nextNodeId));
  }
  assert.ok(graph.edges.some((edge) => edge.kind === 'loop-carried'));
});

test('groups compiled array members without removing element-level constraint data', () => {
  const { file, template } = parse();
  const sourceGraph = buildSourceGraph(new Map([[file.path, file]]), template, [{ name: 'n', value: 2 }], []);
  const constraintGraph: ConstraintGraphDto = {
    level: 'O0',
    signals: [
      { id: 'signal:main.out[0]', kind: 'signal', signalId: 1, witnessIndex: 1, componentId: 0, qualifiedName: 'main.out[0]', status: 'surviving', role: 'output' },
      { id: 'signal:main.out[1]', kind: 'signal', signalId: 2, witnessIndex: 2, componentId: 0, qualifiedName: 'main.out[1]', status: 'substituted', role: 'output' },
      { id: 'signal:main.in', kind: 'signal', signalId: 3, witnessIndex: 3, componentId: 0, qualifiedName: 'main.in', status: 'surviving', role: 'input' },
    ],
    constraints: [],
    edges: [],
    adjacency: {},
    signalGroups: [],
    loopClusters: [],
    mockBoundaries: [],
  };

  const grouped = addConstraintSignalGroups(sourceGraph, constraintGraph);
  const outGroup = grouped.signalGroups.find((group) => group.displayQualifiedName === 'main.out[n]');
  assert.deepEqual(outGroup?.memberSignalIds, [1, 2]);
  assert.equal(outGroup?.status, 'surviving');
  assert.equal(outGroup?.role, 'output');
  assert.equal(grouped.signals.length, 3);

  const loop = sourceGraph.loops[0]!;
  const constraintStatement = sourceGraph.statements.find((statement) => statement.loopId === loop.id && statement.kind === 'constraint');
  assert.ok(constraintStatement);
  const sourceNodeId = constraintStatement.nodeIds.find((nodeId) => sourceGraph.nodes.find((node) => node.id === nodeId)?.generatesConstraint);
  assert.ok(sourceNodeId);
  const clustered = addConstraintLoopClusters(sourceGraph, grouped, [{
    sourceNodeId,
    constraintNodeIds: ['constraint:7'],
    confidence: 'high',
    evidence: ['test-provenance'],
  }]);
  assert.deepEqual(clustered.loopClusters, [{
    id: `constraint-loop:${loop.id}`,
    sourceLoopId: loop.id,
    label: `${loop.header} · unordered constraints`,
    constraintNodeIds: ['constraint:7'],
    confidence: 'medium',
  }]);
});

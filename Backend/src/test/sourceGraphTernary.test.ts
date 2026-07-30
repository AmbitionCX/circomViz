import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSourceGraph } from '../core/partialDebugging/sourceGraph.js';
import type { TemplateDefinitionNode } from '../core/parser/ast.js';

const template = {
  type: 'TemplateDefinition',
  name: 'IsZero',
  parameters: [],
  signals: [
    { type: 'Signal', name: 'in', kind: 'input', line: 2 },
    { type: 'Signal', name: 'out', kind: 'output', line: 3 },
    { type: 'Signal', name: 'inv', kind: 'intermediate', line: 5 },
  ],
  variables: [],
  components: [],
  statements: [{
    type: 'Assignment',
    operator: '<--',
    left: { type: 'Identifier', name: 'inv', line: 7 },
    right: {
      type: 'Ternary',
      line: 7,
      condition: {
        type: 'BinaryOp',
        operator: '!=',
        left: { type: 'Identifier', name: 'in', line: 7 },
        right: { type: 'Literal', value: 0, line: 7 },
        line: 7,
      },
      thenExpr: {
        type: 'BinaryOp',
        operator: '/',
        left: { type: 'Literal', value: 1, line: 7 },
        right: { type: 'Identifier', name: 'in', line: 7 },
        line: 7,
      },
      elseExpr: { type: 'Literal', value: 0, line: 7 },
    },
    line: 7,
  }],
  sourceFile: 'IsZero.circom',
  line: 1,
} as unknown as TemplateDefinitionNode;

test('lowers a top-level ternary assignment into a condition and atomic branch results', () => {
  const graph = buildSourceGraph(new Map(), template, [], []);
  const condition = graph.nodes.find((node) => node.kind === 'ternary-condition');
  const results = graph.nodes.filter((node) => node.kind === 'ternary-result');
  const assignment = graph.nodes.find((node) => node.kind === 'assignment');

  assert.equal(condition?.label, 'in != 0');
  assert.deepEqual(results.map((node) => node.label).sort(), ['0', '1 / in']);
  assert.equal(graph.nodes.some((node) => node.operation === 'compare'), false);
  assert.equal(graph.nodes.some((node) => node.operation === 'div'), false);
  assert.equal(graph.nodes.some((node) => node.operation === 'ternary'), false);
  assert.deepEqual(
    graph.edges.filter((edge) => edge.source === condition?.id).map((edge) => edge.label).sort(),
    ['No', 'Yes'],
  );
  assert.equal(graph.edges.filter((edge) => edge.target === assignment?.id).length, 2);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { CircomLexer } from '../core/parser/lexer.js';
import { CircomParser } from '../core/parser/parser.js';
import { buildSourceGraph } from '../core/partialDebugging/sourceGraph.js';
import type { ParsedFile, TemplateDefinitionNode } from '../core/parser/ast.js';

test('preserves distinct indexed references on source graph edges', () => {
  const source = `
pragma circom 2.2.3;

template ForceEqualIfEnabled() {
  signal input in[2];
  signal input enabled;
  signal output out;
  signal bit <-- (enabled >> 1) & 1;

  (in[0] - in[1]) * enabled === 0;
  out <== 1;
}
`;
  const filePath = 'force-equal-if-enabled.circom';
  const ast = new CircomParser(new CircomLexer(source), filePath).parse(source, filePath);
  const template = ast.find((node): node is TemplateDefinitionNode =>
    node.type === 'TemplateDefinition' && node.name === 'ForceEqualIfEnabled');
  assert.ok(template);
  const file: ParsedFile = {
    path: filePath,
    content: source,
    ast,
    includes: [],
    templates: [template],
    functions: [],
    components: [],
  };

  const graph = buildSourceGraph(new Map([[filePath, file]]), template, [], []);
  const subtraction = graph.nodes.find((node) => node.kind === 'operation' && node.operation === 'sub');
  assert.ok(subtraction);
  const operands = graph.edges
    .filter((edge) => edge.target === subtraction.id)
    .sort((left, right) => (left.operandIndex ?? 0) - (right.operandIndex ?? 0));

  assert.equal(operands[0]?.source, operands[1]?.source);
  assert.deepEqual(operands.map((edge) => edge.label), ['[0]', '[1]']);
  assert.deepEqual(operands.map((edge) => edge.accessExpression), ['in[0]', 'in[1]']);

  const sourceConstraint = graph.nodes.find((node) => node.kind === 'source-constraint');
  assert.equal(sourceConstraint?.leftExpression, '(in[0] - in[1]) * enabled');
  assert.equal(sourceConstraint?.rightExpression, '0');
  const bitAssignment = graph.nodes.find((node) => node.kind === 'assignment' && node.leftExpression === 'bit');
  assert.equal(bitAssignment?.rightExpression, '(enabled >> 1) & 1');
});

test('preserves parentheses required by operator precedence in loop statements', () => {
  const source = `
pragma circom 2.2.3;

template LinearDigest(N) {
  signal input in[N];
  signal output out;
  signal squared[N];
  var acc[N + 1];
  acc[0] = 0;
  for (var i = 0; i < N; i++) {
    squared[i] <== in[i] * in[i];
    acc[i + 1] = acc[i] + squared[i] + in[i] * (i + 7);
  }
  out <== acc[N];
}
`;
  const filePath = 'linear-digest.circom';
  const ast = new CircomParser(new CircomLexer(source), filePath).parse(source, filePath);
  const template = ast.find((node): node is TemplateDefinitionNode =>
    node.type === 'TemplateDefinition' && node.name === 'LinearDigest');
  assert.ok(template);
  const file: ParsedFile = {
    path: filePath,
    content: source,
    ast,
    includes: [],
    templates: [template],
    functions: [],
    components: [],
  };

  const graph = buildSourceGraph(new Map([[filePath, file]]), template, [{ name: 'N', value: 4 }], []);
  const statement = graph.statements.find((candidate) => candidate.label.startsWith('acc[i + 1] ='));
  assert.equal(statement?.label, 'acc[i + 1] = acc[i] + squared[i] + in[i] * (i + 7)');
});

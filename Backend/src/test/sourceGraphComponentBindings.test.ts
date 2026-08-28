import assert from 'node:assert/strict';
import test from 'node:test';
import { CircomLexer } from '../core/parser/lexer.js';
import { CircomParser } from '../core/parser/parser.js';
import { buildSourceGraph } from '../core/partialDebugging/sourceGraph.js';
import type { ParsedFile, TemplateDefinitionNode } from '../core/parser/ast.js';

const source = `
pragma circom 2.1.9;

template Digest(N) {
  signal input in[N];
  signal output out;
}

template OwnershipLike() {
  signal input ownerKey[2];
  signal input noteSecret;
  signal input context[8];
  signal output result;

  component digest = Digest(8);
  for (var i = 0; i < 8; i++) {
    digest.in[i] <== context[i];
  }
  signal message <== noteSecret * 19 + digest.out;
  result <== ownerKey[0] * 23 + ownerKey[1] * 29 + message;
}
`;

function parse(): { file: ParsedFile; template: TemplateDefinitionNode } {
  const path = 'ownership-like.circom';
  const ast = new CircomParser(new CircomLexer(source), path).parse(source, path);
  const templates = ast.filter((node): node is TemplateDefinitionNode => node.type === 'TemplateDefinition');
  const template = templates.find((candidate) => candidate.name === 'OwnershipLike');
  assert.ok(template);
  return {
    file: { path, content: source, ast, includes: [], templates, functions: [], components: [] },
    template,
  };
}

test('lowers inline signal assignments and resolves child port dimensions', () => {
  const { file, template } = parse();
  const graph = buildSourceGraph(new Map([[file.path, file]]), template, [], ['Digest']);

  const digestInput = graph.nodes.find((node) => node.localName === 'digest.in[8]');
  assert.ok(digestInput);
  assert.deepEqual(digestInput.arrayDimensions, ['8']);
  assert.deepEqual(digestInput.declaredArrayDimensions, ['N']);

  const message = graph.nodes.find((node) => node.localName === 'message');
  assert.ok(message);
  const messageAssignment = graph.nodes.find((node) =>
    node.kind === 'assignment' && node.leftExpression === 'message');
  assert.ok(messageAssignment);
  assert.equal(messageAssignment.rightExpression, 'noteSecret * 19 + digest.out');
  assert.equal(messageAssignment.generatesConstraint, true);
  assert.ok(graph.edges.some((edge) => edge.source === messageAssignment.id && edge.target === message.id));
  assert.ok(graph.nodes.some((node) => node.kind === 'operation' && node.operation === 'mul' && node.sourceSpan?.startLine === 19));

  const ownerBindings = graph.nodes.filter((node) =>
    node.kind === 'assignment' && node.leftExpression?.startsWith('result'));
  assert.equal(ownerBindings.length, 1);
  assert.equal(ownerBindings[0]?.rightExpression, 'ownerKey[0] * 23 + ownerKey[1] * 29 + message');
  assert.ok(graph.edges.some((edge) => edge.label === '[0]'));
  assert.ok(graph.edges.some((edge) => edge.label === '[1]'));
});

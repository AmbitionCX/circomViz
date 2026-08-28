import assert from 'node:assert/strict';
import test from 'node:test';
import { CircomLexer } from '../core/parser/lexer.js';
import { CircomParser } from '../core/parser/parser.js';
import { buildSourceGraph } from '../core/partialDebugging/sourceGraph.js';
import type { ParsedFile, TemplateDefinitionNode } from '../core/parser/ast.js';

function graphFor(source: string, templateName: string, params: Array<{ name: string; value: number }> = []) {
  const filePath = 'conditionals.circom';
  const ast = new CircomParser(new CircomLexer(source), filePath).parse(source, filePath);
  const templates = ast.filter((node): node is TemplateDefinitionNode => node.type === 'TemplateDefinition');
  const template = templates.find((candidate) => candidate.name === templateName);
  assert.ok(template);
  const file: ParsedFile = { path: filePath, content: source, ast, includes: [], templates, functions: [], components: [] };
  return buildSourceGraph(new Map([[filePath, file]]), template, params, []);
}

test('partitions an iterator-dependent if across every loop iteration', () => {
  const graph = graphFor(`
pragma circom 2.2.3;
template DataEscrowBranch() {
  signal input drv_mGrY[6];
  signal input drv_mGrY_final[6];
  signal output encryptedMessage[6];
  signal output digestX[6];
  for (var j = 0; j < 6; j++) {
    if (j == 3) {
      encryptedMessage[j] <== drv_mGrY[j];
    } else {
      encryptedMessage[j] <== drv_mGrY_final[j];
    }
    digestX[j] <== encryptedMessage[j];
  }
}`,
  'DataEscrowBranch');

  assert.equal(graph.conditionals?.length, 1);
  const conditional = graph.conditionals![0]!;
  assert.equal(conditional.condition, 'j == 3');
  assert.equal(conditional.parentLoopId, graph.loops[0]?.id);
  assert.deepEqual(conditional.thenCoverage, {
    status: 'active', iterationCount: 1, totalIterations: 6,
    iterator: 'j', iteratorValues: [3], valuesTruncated: false,
  });
  assert.deepEqual(conditional.elseCoverage, {
    status: 'active', iterationCount: 5, totalIterations: 6,
    iterator: 'j', iteratorValues: [0, 1, 2, 4, 5], valuesTruncated: false,
  });

  const thenStatements = graph.statements.filter((statement) => conditional.thenStatementIds.includes(statement.id));
  const elseStatements = graph.statements.filter((statement) => conditional.elseStatementIds.includes(statement.id));
  assert.deepEqual(thenStatements.map((statement) => statement.label), ['encryptedMessage[j] <== drv_mGrY[j]']);
  assert.deepEqual(elseStatements.map((statement) => statement.label), ['encryptedMessage[j] <== drv_mGrY_final[j]']);
  assert.equal(thenStatements[0]?.compileActivity, 'active');
  assert.equal(elseStatements[0]?.compileActivity, 'active');

  const common = graph.statements.find((statement) => statement.label === 'digestX[j] <== encryptedMessage[j]');
  assert.equal(common?.conditionalId, undefined);
  assert.ok(graph.loops[0]?.bodyStatementIds.includes(common!.id));
})

test('retains inactive and unknown branches without presenting them as active', () => {
  const inactive = graphFor(`
pragma circom 2.2.3;
template StaticIf() {
  signal input a;
  signal input b;
  signal output out;
  if (0) { out <== a; } else { out <== b; }
}`,
  'StaticIf');
  const staticConditional = inactive.conditionals![0]!;
  assert.equal(staticConditional.thenCoverage.status, 'inactive');
  assert.equal(staticConditional.elseCoverage.status, 'active');
  assert.equal(inactive.statements.find((statement) => statement.conditionalBranch === 'then')?.compileActivity, 'inactive');
  assert.equal(inactive.nodes.find((node) => node.kind === 'assignment' && node.rightExpression === 'a')?.compileActivity, 'inactive');

  const unknown = graphFor(`
pragma circom 2.2.3;
template UnknownIf(flag) {
  signal input a;
  signal input b;
  signal output out;
  if (flag == 1) { out <== a; } else if (flag == 2) { out <== b; } else { out <== 0; }
}`,
  'UnknownIf');
  assert.equal(unknown.conditionals?.length, 2);
  assert.equal(unknown.conditionals?.[0]?.thenCoverage.status, 'unknown');
  assert.equal(unknown.conditionals?.[0]?.elseCoverage.status, 'unknown');
  assert.equal(unknown.conditionals?.[1]?.parentConditionalId, unknown.conditionals?.[0]?.id);
  assert.equal(unknown.conditionals?.[1]?.parentBranch, 'else');
})

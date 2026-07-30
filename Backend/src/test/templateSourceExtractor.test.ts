import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assembleMockedSource, assembleOriginSource, buildStandaloneTemplateSource } from '../core/mocking/templateSourceExtractor.js';
import type { ParsedFile, TemplateDefinitionNode } from '../core/parser/ast.js';
import { CircomLexer } from '../core/parser/lexer.js';
import { CircomParser } from '../core/parser/parser.js';

const source = `pragma circom 2.2.3;

template ToyCommit2() {
    signal input x;
    signal input secret;
    signal output commitment;
    commitment <== x * 13 + secret * 17;
}

template Unrelated() {
    signal output out;
    out <== 1;
}`;

const selected = { type: 'TemplateDefinition', name: 'ToyCommit2', parameters: [], signals: [], variables: [], components: [], statements: [], sourceFile: '/tmp/donation.circom', line: 3 } as TemplateDefinitionNode;
const unrelated = { ...selected, name: 'Unrelated', line: 10 } as TemplateDefinitionNode;
const parsed = {
  path: '/tmp/donation.circom', content: source,
  ast: [{ type: 'Pragma', version: '2.2.3', line: 1 }, selected, unrelated],
  includes: [], templates: [selected, unrelated], functions: [], components: [],
} as ParsedFile;

describe('standalone mocked source generation', () => {
  it('extracts a selected leaf template without unrelated definitions', () => {
    const bundle = buildStandaloneTemplateSource(new Map([[parsed.path, parsed]]), selected);
    const origin = assembleOriginSource(bundle);
    const mocked = assembleMockedSource({ bundle, selectedSource: bundle.selectedSource, entryTemplateName: selected.name, params: [], publicSignals: [] });
    assert.match(origin, /template ToyCommit2\(\)/);
    assert.doesNotMatch(origin, /template Unrelated/);
    assert.match(mocked, /template ToyCommit2\(\)/);
    assert.match(mocked, /component main = ToyCommit2\(\);/);
    assert.doesNotMatch(mocked, /_Partial/);
  });

  it('includes a template instantiated through an array assignment inside a loop', () => {
    const nestedSource = `pragma circom 2.2.3;

      template Bit() {
        signal input in;
        in * (in - 1) === 0;
      }

      template Num2Bits(n) {
        signal input in;
        signal output out[n];
        component b[n];
        for (var i = 0; i < n; i++) {
          b[i] = Bit();
          b[i].in <== out[i];
        }
      }

      template Range4() {
        signal input in;
        component bits = Num2Bits(4);
        bits.in <== in;
      }

      template WithdrawalLimit_Bug() {
        signal input limit;
        component limitRange = Range4();
        limitRange.in <== limit;
      }`;
    const filePath = '/tmp/withdrawal-limit.circom';
    const ast = new CircomParser(new CircomLexer(nestedSource), filePath).parse(nestedSource, filePath);
    const parsedFile = {
      path: filePath,
      content: nestedSource,
      ast,
      includes: ast.filter((node) => node.type === 'Include'),
      templates: ast.filter((node) => node.type === 'TemplateDefinition'),
      functions: ast.filter((node) => node.type === 'FunctionDefinition'),
      components: ast.filter((node) => node.type === 'ComponentInstantiationNode'),
    } as ParsedFile;
    const root = parsedFile.templates.find((template) => template.name === 'WithdrawalLimit_Bug')!;
    const bundle = buildStandaloneTemplateSource(new Map([[filePath, parsedFile]]), root);
    const origin = assembleOriginSource(bundle);
    const mocked = assembleMockedSource({
      bundle,
      selectedSource: `template WithdrawalLimit_Bug_Partial() { signal input limit; }`,
      entryTemplateName: 'WithdrawalLimit_Bug_Partial',
      params: [],
      publicSignals: [],
      eliminatedTemplateNames: ['Range4'],
    });

    assert.deepEqual(bundle.dependencies.map((definition) => definition.name), ['Bit', 'Num2Bits', 'Range4']);
    assert.match(origin, /template Bit\(\)/);
    assert.ok(origin.indexOf('template Bit()') < origin.indexOf('template Num2Bits(n)'));
    assert.match(mocked, /template Bit\(\)/);
    assert.match(mocked, /template Num2Bits\(n\)/);
    assert.doesNotMatch(mocked, /template Range4\(\)/);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assembleMockedSource, assembleOriginSource, buildStandaloneTemplateSource } from '../core/mocking/templateSourceExtractor.js';
import type { ParsedFile, TemplateDefinitionNode } from '../core/parser/ast.js';

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
});

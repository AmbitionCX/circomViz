import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CircomLexer } from '../core/parser/lexer.js';
import { CircomParser } from '../core/parser/parser.js';
import { collectDirectComponents } from '../core/parser/componentCollector.js';

describe('Semaphore parser compatibility', () => {
  it('parses Semaphore syntax without dropping the root template', () => {
    const source = `
      pragma circom 2.1.5;

      include "babyjub.circom";
      include "poseidon.circom";
      include "binary-merkle-root.circom";
      include "comparators.circom";

      template Semaphore(MAX_DEPTH) {
        signal input secret;
        signal input merkleProofLength, merkleProofIndex, merkleProofSiblings[MAX_DEPTH];
        signal input message;
        signal input scope;
        signal output merkleRoot, nullifier;

        var l = 2736030358979909402780800718157159386076813972158567259200215660948447373041;

        component isLessThan = LessThan(251);
        isLessThan.in <== [secret, l];
        isLessThan.out === 1;

        var Ax, Ay;
        (Ax, Ay) = BabyPbk()(secret);

        var identityCommitment = Poseidon(2)([Ax, Ay]);
        merkleRoot <== BinaryMerkleRoot(MAX_DEPTH)(identityCommitment, merkleProofLength, merkleProofIndex, merkleProofSiblings);
        nullifier <== Poseidon(2)([scope, secret]);
        signal dummySquare <== message * message;
      }
    `;

    const parser = new CircomParser(new CircomLexer(source), '/repo/packages/circuits/src/semaphore.circom');
    const ast = parser.parse(source, '/repo/packages/circuits/src/semaphore.circom');
    const template = ast.find((node: any) => node.type === 'TemplateDefinition' && node.name === 'Semaphore') as any;

    assert.ok(template);
    assert.deepEqual(template.signals.map((signal: any) => signal.name), [
      'secret',
      'merkleProofLength',
      'merkleProofIndex',
      'merkleProofSiblings',
      'message',
      'scope',
      'merkleRoot',
      'nullifier',
      'dummySquare',
    ]);
    assert.deepEqual(template.variables.map((variable: any) => variable.name), ['l', 'Ax', 'Ay', 'identityCommitment']);

    const components = collectDirectComponents(template).map((component) => component.templateName).sort();
    assert.deepEqual(components, ['BabyPbk', 'BinaryMerkleRoot', 'LessThan', 'Poseidon', 'Poseidon'].sort());
  });
});

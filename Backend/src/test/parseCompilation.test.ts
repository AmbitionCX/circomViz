import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCompilationFailure } from '../server/compilations/parseCompilation.js';

test('maps a Circom call trace to the deepest template path', () => {
  const tree = {
    templateName: 'MerkleRoot2_Bug',
    components: [{
      templateName: 'MerkleStep',
      template: {
        templateName: 'MerkleStep',
        components: [{
          templateName: 'SelectLR_Bug',
          template: { templateName: 'SelectLR_Bug', components: [] },
        }],
      },
    }],
  };
  const result = parseCompilationFailure(
    [
      'error[T3001]: Non quadratic constraints are not allowed!',
      '┌─ "/repo/MerkleRoot2_Bug.circom":40:5',
      '= call trace:',
      ' ->MerkleRoot2_Bug',
      '  ->MerkleStep',
      '   ->SelectLR_Bug',
    ].join('\n'),
    tree,
    [{ name: 'SelectLR_Bug', sourceFile: '/repo/MerkleRoot2_Bug.circom', line: 17 }],
  );

  assert.equal(result.failedComponents[0].templateName, 'SelectLR_Bug');
  assert.deepEqual(result.failedComponents[0].templatePath, [
    'MerkleRoot2_Bug',
    'MerkleStep',
    'SelectLR_Bug',
  ]);
});

test('falls back from a source location to its nearest template declaration', () => {
  const result = parseCompilationFailure(
    [
      'error[T2011]: Invalid declaration',
      '┌─ "/repo/WithdrawalLimit_Bug.circom":17:9',
    ].join('\n'),
    {
      templateName: 'WithdrawalLimit_Bug',
      components: [{
        templateName: 'Num2Bits',
        template: { templateName: 'Num2Bits', components: [] },
      }],
    },
    [
      { name: 'Bit', sourceFile: '/repo/WithdrawalLimit_Bug.circom', line: 3 },
      { name: 'Num2Bits', sourceFile: '/repo/WithdrawalLimit_Bug.circom', line: 9 },
      { name: 'Range4', sourceFile: '/repo/WithdrawalLimit_Bug.circom', line: 27 },
    ],
  );

  assert.equal(result.failedComponents[0].templateName, 'Num2Bits');
});

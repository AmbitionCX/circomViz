import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CIRCOM_BN254_PRIME, simplifyConstraintEquation } from '../core/partialDebugging/constraintGraph.js';
import type { LinearCombination } from '../types/partialDebugging.js';

const lc = (...terms: Array<[number, bigint]>): LinearCombination => ({
  terms: terms.map(([signalId, coefficient]) => {
    const canonical = ((coefficient % CIRCOM_BN254_PRIME) + CIRCOM_BN254_PRIME) % CIRCOM_BN254_PRIME;
    return { signalId, coefficient: String(canonical), displayCoefficient: String(coefficient) };
  }),
});

describe('constraint equation simplification', () => {
  it('isolates ToyCommit2 commitment from a zero-product linear constraint', () => {
    const equation = simplifyConstraintEquation(lc(), lc(), lc([1, 13n], [2, 17n], [3, -1n]));
    assert.deepEqual(equation, {
      left: { kind: 'signal', signalId: 3 },
      right: {
        kind: 'add',
        operands: [
          { kind: 'mul', operands: [{ kind: 'constant', value: '13' }, { kind: 'signal', signalId: 1 }] },
          { kind: 'mul', operands: [{ kind: 'constant', value: '17' }, { kind: 'signal', signalId: 2 }] },
        ],
      },
      isolatedSignalId: 3,
    });
  });

  it('keeps a normalized zero equation when no signal has a unit coefficient', () => {
    const equation = simplifyConstraintEquation(lc(), lc(), lc([1, 2n], [2, 4n]));
    assert.equal(equation.isolatedSignalId, undefined);
    assert.deepEqual(equation.right, { kind: 'constant', value: '0' });
  });

  it('preserves genuinely nonlinear R1CS factors', () => {
    const equation = simplifyConstraintEquation(lc([1, 1n]), lc([2, 1n]), lc([3, 1n]));
    assert.deepEqual(equation, {
      left: { kind: 'mul', operands: [{ kind: 'signal', signalId: 1 }, { kind: 'signal', signalId: 2 }] },
      right: { kind: 'signal', signalId: 3 },
    });
  });
});

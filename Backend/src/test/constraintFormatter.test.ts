import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ConstraintObject } from '../types/constraint.js';
import {
  formatConstraintSystemWithNames,
  formatConstraintWithNames,
  humanizeConstraint,
  humanizeConstraintSystem,
  resolveConstraintsWithNames,
  type SymEntry,
} from '../core/utils/symbolParser.js';
import { GROTH16_PRIME } from '../core/utils/fieldConstants.js';

const fieldMinusOne = String(BigInt(GROTH16_PRIME) - 1n);

const symEntries: SymEntry[] = [
  { index: 1, witness: 1, component: 0, name: 'main.out' },
  { index: 2, witness: 2, component: 0, name: 'main.x' },
  { index: 3, witness: 3, component: 0, name: 'main.y' },
];

describe('R1CS human-readable constraint formatter', () => {
  it('formats one R1CS equation with signal names, constants, and simplified field elements', () => {
    const constraint: ConstraintObject = [
      { '0': '-3', '2': '1' },
      { '3': fieldMinusOne },
      { '1': '1', '4': '5' },
    ];

    const readable = humanizeConstraint(constraint, symEntries, 7);

    assert.equal(readable.index, 7);
    assert.equal(readable.formula, '(main.x - 3) * -main.y = main.out + 5 * s_4');
    assert.deepEqual(readable.signalsUsed, ['main.out', 'main.x', 'main.y', 's_4']);
    assert.equal(formatConstraintWithNames(constraint, symEntries), readable.formula);
  });

  it('formats a full R1CS constraint system for display or logs', () => {
    const constraints: ConstraintObject[] = [
      [{ '2': '1' }, { '3': '1' }, { '1': '1' }],
      [{ '0': '1' }, { '2': '1', '0': '4' }, { '3': '1' }],
    ];

    assert.deepEqual(
      humanizeConstraintSystem(constraints, symEntries).map(constraint => constraint.formula),
      [
        'main.x * main.y = main.out',
        '1 * (main.x + 4) = main.y',
      ]
    );

    assert.equal(
      formatConstraintSystemWithNames(constraints, symEntries),
      [
        'R1CS constraint system (2 constraints)',
        '#0: main.x * main.y = main.out',
        '#1: 1 * (main.x + 4) = main.y',
      ].join('\n')
    );
  });

  it('keeps signal index 1 as a signal instead of treating it as a constant', () => {
    const constraints: ConstraintObject[] = [
      [{ '1': '1' }, { '0': '1' }, { '2': '1' }],
    ];

    assert.deepEqual(resolveConstraintsWithNames(constraints, symEntries), [
      {
        index: 0,
        formula: 'main.out * 1 = main.x',
        signalsUsed: ['main.out', 'main.x'],
      },
    ]);
  });
});

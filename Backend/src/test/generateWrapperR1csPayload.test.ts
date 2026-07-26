import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { getCircomArtifactPaths } from '../server/compilations/compileDebug.js';
import { resolveR1csDiagramPayload } from '../server/routes/generateWrapper.js';

describe('generate mocked-file R1CS diagram payload', () => {
  it('derives Circom artifact paths from the compiled mocked basename', () => {
    assert.deepEqual(
      getCircomArtifactPaths('/tmp/mocked.circom', '/tmp/out'),
      {
        symPath: '/tmp/out/mocked.sym',
        constraintsJsonPath: '/tmp/out/mocked_constraints.json',
        substitutionsJsonPath: '/tmp/out/mocked_substitutions.json',
      }
    );
    assert.deepEqual(
      getCircomArtifactPaths('/tmp/mocked_ToyCommit2.circom', '/tmp/out'),
      {
        symPath: '/tmp/out/mocked_ToyCommit2.sym',
        constraintsJsonPath: '/tmp/out/mocked_ToyCommit2_constraints.json',
        substitutionsJsonPath: '/tmp/out/mocked_ToyCommit2_substitutions.json',
      }
    );
  });

  it('resolves structured R1CS constraints from mocked artifact names', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'r1cs-mocked-payload-'));
    try {
      const { symPath, constraintsJsonPath } = getCircomArtifactPaths(path.join(dir, 'mocked.circom'), dir);
      await fs.writeFile(symPath, ['1,1,0,main.commitment', '2,2,0,main.x', '3,3,0,main.secret'].join('\n'), 'utf8');
      await fs.writeFile(constraintsJsonPath, JSON.stringify({ constraints: [[{}, {}, { '1': '-1', '2': '13', '3': '17' }]] }), 'utf8');
      const payload = await resolveR1csDiagramPayload(symPath, constraintsJsonPath);
      assert.equal(payload.r1csConstraints?.length, 1);
      assert.equal(payload.r1csConstraints?.[0].formula, '0 * 0 = -main.commitment + 13 * main.x + 17 * main.secret');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('resolves structured R1CS constraints from compiled artifact paths', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'r1cs-payload-'));
    try {
      const symPath = path.join(dir, 'mocked.sym');
      const constraintsPath = path.join(dir, 'mocked_constraints.json');
      await fs.writeFile(symPath, ['1,1,0,main.out', '2,2,0,main.x', '3,3,0,main.y'].join('\n'), 'utf8');
      await fs.writeFile(constraintsPath, JSON.stringify({ constraints: [[{ '2': '1' }, { '3': '1' }, { '1': '1' }]] }), 'utf8');
      const payload = await resolveR1csDiagramPayload(symPath, constraintsPath);
      assert.equal(payload.r1csConstraints?.length, 1);
      assert.equal(payload.r1csConstraints?.[0].formula, 'main.x * main.y = main.out');
      assert.equal(payload.r1csEquationText, 'R1CS constraint system (1 constraints)\n#0: main.x * main.y = main.out');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

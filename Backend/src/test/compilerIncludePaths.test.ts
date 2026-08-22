import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { resolveCompilerIncludePaths } from '../core/resolver/compilerIncludePaths.js';

describe('resolveCompilerIncludePaths', () => {
  it('resolves, normalizes, and deduplicates CircomKit include directories', async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'compiler-includes-'));
    try {
      const circuitDir = path.join(repo, 'packages', 'circuits');
      const srcDir = path.join(circuitDir, 'src');
      const nodeModulesDir = path.join(repo, 'node_modules');
      const circomlibDir = path.join(nodeModulesDir, 'circomlib', 'circuits');
      const merkleDir = path.join(nodeModulesDir, '@zk-kit', 'binary-merkle-root.circom', 'src');

      await Promise.all([
        fs.mkdir(srcDir, { recursive: true }),
        fs.mkdir(circomlibDir, { recursive: true }),
        fs.mkdir(merkleDir, { recursive: true }),
      ]);
      const sourceFilePath = path.join(srcDir, 'semaphore.circom');
      await fs.writeFile(sourceFilePath, 'include "babyjub.circom";\n', 'utf8');
      await fs.writeFile(
        path.join(circuitDir, 'circomkit.json'),
        JSON.stringify({
          include: [
            '../../node_modules/circomlib/circuits',
            '../../node_modules/circomlib/circuits/.',
            '../../node_modules/@zk-kit/binary-merkle-root.circom/src',
            '../../node_modules/missing/circuits',
          ],
        }),
        'utf8',
      );

      assert.deepEqual(resolveCompilerIncludePaths(repo, sourceFilePath), [
        srcDir,
        circomlibDir,
        merkleDir,
        repo,
        nodeModulesDir,
      ]);
    } finally {
      await fs.rm(repo, { recursive: true, force: true });
    }
  });

  it('ignores invalid configs and include directories outside the repository', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'compiler-includes-'));
    try {
      const repo = path.join(tempRoot, 'repo');
      const circuitDir = path.join(repo, 'circuits');
      const srcDir = path.join(circuitDir, 'src');
      const outsideDir = path.join(tempRoot, 'outside');
      await Promise.all([
        fs.mkdir(srcDir, { recursive: true }),
        fs.mkdir(outsideDir, { recursive: true }),
      ]);
      const sourceFilePath = path.join(srcDir, 'main.circom');
      await fs.writeFile(sourceFilePath, 'pragma circom 2.1.5;\n', 'utf8');
      await fs.writeFile(
        path.join(circuitDir, 'circomkit.json'),
        JSON.stringify({ include: ['../../outside'] }),
        'utf8',
      );

      assert.deepEqual(resolveCompilerIncludePaths(repo, sourceFilePath), [srcDir, repo]);

      await fs.writeFile(path.join(circuitDir, 'circomkit.json'), '{invalid', 'utf8');
      assert.deepEqual(resolveCompilerIncludePaths(repo, sourceFilePath), [srcDir, repo]);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});

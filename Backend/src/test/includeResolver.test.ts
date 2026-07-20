import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { IncludeResolver } from '../core/resolver/includeResolver.js';
import type { IncludeNode } from '../core/parser/ast.js';
import { ErrorCollector } from '../utils/errors.js';

describe('IncludeResolver', () => {
  it('caches relative includes by current file directory', async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'include-resolver-'));
    try {
      const dirA = path.join(repo, 'a');
      const dirB = path.join(repo, 'b');
      await fs.mkdir(dirA, { recursive: true });
      await fs.mkdir(dirB, { recursive: true });
      await fs.writeFile(path.join(dirA, 'main.circom'), 'include "./common.circom";\n', 'utf8');
      await fs.writeFile(path.join(dirB, 'main.circom'), 'include "./common.circom";\n', 'utf8');
      await fs.writeFile(path.join(dirA, 'common.circom'), 'template A() {}\n', 'utf8');
      await fs.writeFile(path.join(dirB, 'common.circom'), 'template B() {}\n', 'utf8');

      const resolver = new IncludeResolver(new ErrorCollector());
      const includeNode: IncludeNode = { type: 'Include', path: './common.circom', line: 1 };
      resolver.setCurrentRepoPath(repo);

      resolver.setCurrentFile(path.join(dirA, 'main.circom'));
      const resolvedA = await resolver.resolveInclude(includeNode);

      resolver.setCurrentFile(path.join(dirB, 'main.circom'));
      const resolvedB = await resolver.resolveInclude(includeNode);

      assert.equal(resolvedA, path.join(dirA, 'common.circom'));
      assert.equal(resolvedB, path.join(dirB, 'common.circom'));
      assert.notEqual(resolvedA, resolvedB);
    } finally {
      await fs.rm(repo, { recursive: true, force: true });
    }
  });

  it('resolves node_modules package includes from ancestor package directories', async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'include-resolver-'));
    try {
      const srcDir = path.join(repo, 'circuit', 'src');
      const circomlibDir = path.join(repo, 'circuit', 'node_modules', 'circomlib', 'circuits');
      await fs.mkdir(srcDir, { recursive: true });
      await fs.mkdir(circomlibDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, 'main.circom'), 'include "node_modules/circomlib/circuits/poseidon.circom";\n', 'utf8');
      await fs.writeFile(path.join(circomlibDir, 'poseidon.circom'), 'template Poseidon(n) {}\n', 'utf8');

      const resolver = new IncludeResolver(new ErrorCollector());
      resolver.setCurrentRepoPath(repo);
      resolver.setCurrentFile(path.join(srcDir, 'main.circom'));

      const resolved = await resolver.resolveInclude({
        type: 'Include',
        path: 'node_modules/circomlib/circuits/poseidon.circom',
        line: 1,
      });

      assert.equal(resolved, path.join(circomlibDir, 'poseidon.circom'));
    } finally {
      await fs.rm(repo, { recursive: true, force: true });
    }
  });

  it('resolves package-style circomlib includes from ancestor package directories', async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'include-resolver-'));
    try {
      const srcDir = path.join(repo, 'circuit', 'src');
      const circomlibDir = path.join(repo, 'circuit', 'node_modules', 'circomlib', 'circuits');
      await fs.mkdir(srcDir, { recursive: true });
      await fs.mkdir(circomlibDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, 'main.circom'), 'include "circomlib/circuits/comparators.circom";\n', 'utf8');
      await fs.writeFile(path.join(circomlibDir, 'comparators.circom'), 'template LessEqThan(n) {}\n', 'utf8');

      const resolver = new IncludeResolver(new ErrorCollector());
      resolver.setCurrentRepoPath(repo);
      resolver.setCurrentFile(path.join(srcDir, 'main.circom'));

      const resolved = await resolver.resolveInclude({
        type: 'Include',
        path: 'circomlib/circuits/comparators.circom',
        line: 1,
      });

      assert.equal(resolved, path.join(circomlibDir, 'comparators.circom'));
    } finally {
      await fs.rm(repo, { recursive: true, force: true });
    }
  });

  it('caches failed package includes by current file directory', async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'include-resolver-'));
    try {
      const dirA = path.join(repo, 'a');
      const dirB = path.join(repo, 'b');
      const circomlibDirB = path.join(dirB, 'node_modules', 'circomlib', 'circuits');
      await fs.mkdir(dirA, { recursive: true });
      await fs.mkdir(circomlibDirB, { recursive: true });
      await fs.writeFile(path.join(dirA, 'main.circom'), 'include "circomlib/circuits/poseidon.circom";\n', 'utf8');
      await fs.writeFile(path.join(dirB, 'main.circom'), 'include "circomlib/circuits/poseidon.circom";\n', 'utf8');
      await fs.writeFile(path.join(circomlibDirB, 'poseidon.circom'), 'template Poseidon(n) {}\n', 'utf8');

      const resolver = new IncludeResolver(new ErrorCollector());
      const includeNode: IncludeNode = { type: 'Include', path: 'circomlib/circuits/poseidon.circom', line: 1 };
      resolver.setCurrentRepoPath(repo);

      resolver.setCurrentFile(path.join(dirA, 'main.circom'));
      const missing = await resolver.resolveInclude(includeNode);

      resolver.setCurrentFile(path.join(dirB, 'main.circom'));
      const resolved = await resolver.resolveInclude(includeNode);

      assert.equal(missing, null);
      assert.equal(resolved, path.join(circomlibDirB, 'poseidon.circom'));
    } finally {
      await fs.rm(repo, { recursive: true, force: true });
    }
  });

  it('records an unresolved include error when a declared package is not installed', async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'include-resolver-'));
    try {
      const circuitDir = path.join(repo, 'circuit');
      await fs.mkdir(circuitDir, { recursive: true });
      await fs.writeFile(path.join(circuitDir, 'package.json'), JSON.stringify({ dependencies: { missingcircomlib: '^1.0.0' } }), 'utf8');
      await fs.writeFile(path.join(circuitDir, 'main.circom'), 'include "node_modules/missingcircomlib/circuits/poseidon.circom";\n', 'utf8');

      const errorCollector = new ErrorCollector();
      const resolver = new IncludeResolver(errorCollector);
      resolver.setCurrentRepoPath(repo);
      resolver.setCurrentFile(path.join(circuitDir, 'main.circom'));

      const resolved = await resolver.resolveInclude({
        type: 'Include',
        path: 'node_modules/missingcircomlib/circuits/poseidon.circom',
        line: 1,
      });

      assert.equal(resolved, null);
      assert.deepEqual(errorCollector.getErrors().map((error) => error.message), [
        'Cannot resolve include: node_modules/missingcircomlib/circuits/poseidon.circom',
      ]);
    } finally {
      await fs.rm(repo, { recursive: true, force: true });
    }
  });

  it('resolves relative includes inside an external node_modules package', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'include-resolver-'));
    try {
      const repo = path.join(tmp, 'repo');
      const packageDir = path.join(tmp, 'deps', 'node_modules', 'circomlib', 'circuits');
      await fs.mkdir(repo, { recursive: true });
      await fs.mkdir(packageDir, { recursive: true });
      await fs.writeFile(path.join(packageDir, 'poseidon.circom'), 'include "./poseidon_constants.circom";\n', 'utf8');
      await fs.writeFile(path.join(packageDir, 'poseidon_constants.circom'), 'function C() { return 1; }\n', 'utf8');

      const resolver = new IncludeResolver(new ErrorCollector());
      resolver.setCurrentRepoPath(repo);
      resolver.setCurrentFile(path.join(packageDir, 'poseidon.circom'));

      const resolved = await resolver.resolveInclude({
        type: 'Include',
        path: './poseidon_constants.circom',
        line: 1,
      });

      assert.equal(resolved, path.join(packageDir, 'poseidon_constants.circom'));
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('rejects relative includes that escape an external node_modules package', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'include-resolver-'));
    try {
      const repo = path.join(tmp, 'repo');
      const packageRoot = path.join(tmp, 'deps', 'node_modules', 'circomlib');
      const packageDir = path.join(packageRoot, 'circuits');
      await fs.mkdir(repo, { recursive: true });
      await fs.mkdir(packageDir, { recursive: true });
      await fs.writeFile(path.join(packageDir, 'poseidon.circom'), 'include "../outside.circom";\n', 'utf8');
      await fs.writeFile(path.join(tmp, 'deps', 'node_modules', 'outside.circom'), 'template Outside() {}\n', 'utf8');

      const resolver = new IncludeResolver(new ErrorCollector());
      resolver.setCurrentRepoPath(repo);
      resolver.setCurrentFile(path.join(packageDir, 'poseidon.circom'));

      const resolved = await resolver.resolveInclude({
        type: 'Include',
        path: '../outside.circom',
        line: 1,
      });

      assert.equal(resolved, null);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });


  it('resolves bare includes through nearest CircomKit include paths', async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'include-resolver-'));
    try {
      const circuitDir = path.join(repo, 'packages', 'circuits');
      const srcDir = path.join(circuitDir, 'src');
      const circomlibDir = path.join(repo, 'node_modules', 'circomlib', 'circuits');
      const merkleDir = path.join(repo, 'node_modules', '@zk-kit', 'binary-merkle-root.circom', 'src');
      await fs.mkdir(srcDir, { recursive: true });
      await fs.mkdir(circomlibDir, { recursive: true });
      await fs.mkdir(merkleDir, { recursive: true });
      await fs.writeFile(
        path.join(circuitDir, 'circomkit.json'),
        JSON.stringify({
          include: ['../../node_modules/circomlib/circuits', '../../node_modules/@zk-kit/binary-merkle-root.circom/src'],
        }),
        'utf8',
      );
      await fs.writeFile(path.join(srcDir, 'semaphore.circom'), 'include "babyjub.circom";\n', 'utf8');
      await fs.writeFile(path.join(circomlibDir, 'babyjub.circom'), 'template BabyPbk() {}\n', 'utf8');
      await fs.writeFile(path.join(merkleDir, 'binary-merkle-root.circom'), 'template BinaryMerkleRoot(n) {}\n', 'utf8');

      const resolver = new IncludeResolver(new ErrorCollector());
      resolver.setCurrentRepoPath(repo);
      resolver.setCurrentFile(path.join(srcDir, 'semaphore.circom'));

      const babyjub = await resolver.resolveInclude({
        type: 'Include',
        path: 'babyjub.circom',
        line: 1,
      });
      const merkle = await resolver.resolveInclude({
        type: 'Include',
        path: 'binary-merkle-root.circom',
        line: 2,
      });

      assert.equal(babyjub, path.join(circomlibDir, 'babyjub.circom'));
      assert.equal(merkle, path.join(merkleDir, 'binary-merkle-root.circom'));
    } finally {
      await fs.rm(repo, { recursive: true, force: true });
    }
  });


  it('uses project CircomKit include paths for bare includes inside node_modules dependencies', async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'include-resolver-'));
    try {
      const circuitDir = path.join(repo, 'packages', 'circuits');
      const merkleDir = path.join(repo, 'node_modules', '@zk-kit', 'binary-merkle-root.circom', 'src');
      const circomlibDir = path.join(repo, 'node_modules', 'circomlib', 'circuits');
      await fs.mkdir(path.join(circuitDir, 'src'), { recursive: true });
      await fs.mkdir(merkleDir, { recursive: true });
      await fs.mkdir(circomlibDir, { recursive: true });
      await fs.writeFile(
        path.join(circuitDir, 'circomkit.json'),
        JSON.stringify({ include: ['../../node_modules/circomlib/circuits'] }),
        'utf8',
      );
      await fs.writeFile(path.join(merkleDir, 'binary-merkle-root.circom'), 'include "mux1.circom";\n', 'utf8');
      await fs.writeFile(path.join(circomlibDir, 'mux1.circom'), 'template MultiMux1(n) {}\n', 'utf8');

      const resolver = new IncludeResolver(new ErrorCollector());
      resolver.setCurrentRepoPath(repo);
      resolver.setCurrentFile(path.join(merkleDir, 'binary-merkle-root.circom'));

      const resolved = await resolver.resolveInclude({
        type: 'Include',
        path: 'mux1.circom',
        line: 1,
      });

      assert.equal(resolved, path.join(circomlibDir, 'mux1.circom'));
    } finally {
      await fs.rm(repo, { recursive: true, force: true });
    }
  });

});

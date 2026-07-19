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
});

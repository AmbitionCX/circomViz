import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CircomParser } from '../core/parser/submoduleParser.js';
import { PathGuard } from '../core/project/pathGuard.js';

describe('submodule metadata', () => {
  it('uses the concrete ZK Franchise template as the root component', () => {
    const submodule = CircomParser.getSubmoduleById('zk-franchise-proof-circuit');

    assert.ok(submodule);
    assert.equal(submodule.rootComponent, 'ZkFranchiseProofCircuit');
  });

  it('exposes the Expert Study toy catalog and an empty real-world catalog', () => {
    const examples = CircomParser.getAllExpertStudyToyExamples();

    assert.equal(examples.length, 7);
    assert.equal(examples.find((example) => example.id === 'LoyaltyReward')?.entry, 'LoyaltyReward.circom');
    assert.deepEqual(CircomParser.getAllExpertStudyRealWorldExamples(), []);
  });

  it('resolves Expert Study aliases without changing the compilation root', () => {
    const pathGuard = new PathGuard();
    const toyRepo = pathGuard.validateRepoPath('expert-study-toy-examples');
    const realWorldRepo = pathGuard.validateRepoPath('expert-study-real-world-examples');

    assert.ok(toyRepo.valid && toyRepo.path);
    assert.ok(realWorldRepo.valid && realWorldRepo.path);
    assert.ok(pathGuard.validateEntryPath(toyRepo.path, 'LoyaltyReward.circom').valid);
    assert.equal(pathGuard.validateEntryPath(toyRepo.path, '../toy-demos/LoyaltyReward_Bug.circom').valid, false);
    assert.equal(pathGuard.getCompilationsRoot().replace(/\\/g, '/').endsWith('/Backend/compilations'), true);
  });
});

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

  it('exposes the added real-world circuit submodules', () => {
    const pathGuard = new PathGuard();
    const expectedSubmodules = [
      {
        id: 'email-tx-builder',
        name: 'ZK Email TX Builder',
        entry: 'packages/circuits/src/email_auth.circom'
      },
      {
        id: 'panther-core',
        name: 'Panther Core',
        entry: 'circuits/circuits/mainZSwapV1.circom'
      }
    ];

    for (const expected of expectedSubmodules) {
      const submodule = CircomParser.getSubmoduleById(expected.id);
      const repo = pathGuard.validateRepoPath(expected.id);

      assert.ok(submodule);
      assert.equal(submodule.name, expected.name);
      assert.equal(submodule.entry, expected.entry);
      assert.equal(submodule.rootComponent, 'main');
      assert.ok(repo.valid && repo.path);
      assert.ok(pathGuard.validateEntryPath(repo.path, expected.entry).valid, expected.entry);
    }
  });

  it('exposes the Expert Study toy and real-world catalogs', () => {
    const examples = CircomParser.getAllExpertStudyToyExamples();
    const projects = CircomParser.getAllExpertStudyRealWorldExamples();
    const projectIds = Array.from({ length: 4 }, (_, taskIndex) =>
      Array.from({ length: 3 }, (_, exampleIndex) =>
        'Task' + (taskIndex + 1) + '-Example' + (exampleIndex + 1)
      )
    ).flat();

    assert.equal(examples.length, 7);
    assert.equal(examples.find((example) => example.id === 'LoyaltyReward')?.entry, 'LoyaltyReward.circom');
    assert.deepEqual(projects.map((project) => project.id), projectIds);
    assert.deepEqual(projects.map((project) => project.name), projectIds);
    for (const project of projects) {
      assert.equal(project.entry, project.id + '/aligned-code/main.circom');
      assert.equal(project.rootComponent, 'main');
      assert.equal(CircomParser.getExpertStudyRealWorldExampleById(project.id), project);
    }
  });

  it('resolves Expert Study aliases without changing the compilation root', () => {
    const pathGuard = new PathGuard();
    const toyRepo = pathGuard.validateRepoPath('expert-study-toy-examples');
    const realWorldRepo = pathGuard.validateRepoPath('expert-study-real-world-examples');

    assert.ok(toyRepo.valid && toyRepo.path);
    assert.ok(realWorldRepo.valid && realWorldRepo.path);
    assert.ok(pathGuard.validateEntryPath(toyRepo.path, 'LoyaltyReward.circom').valid);
    for (const project of CircomParser.getAllExpertStudyRealWorldExamples()) {
      assert.ok(pathGuard.validateEntryPath(realWorldRepo.path, project.entry).valid, project.entry);
    }
    assert.equal(pathGuard.validateEntryPath(toyRepo.path, '../toy-demos/LoyaltyReward_Bug.circom').valid, false);
    assert.equal(pathGuard.getCompilationsRoot().replace(/\\/g, '/').endsWith('/Backend/compilations'), true);
  });
});

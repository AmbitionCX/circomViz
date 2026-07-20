import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CircomParser } from '../core/parser/submoduleParser.js';

describe('submodule metadata', () => {
  it('uses the concrete ZK Franchise template as the root component', () => {
    const submodule = CircomParser.getSubmoduleById('zk-franchise-proof-circuit');

    assert.ok(submodule);
    assert.equal(submodule.rootComponent, 'ZkFranchiseProofCircuit');
  });
});

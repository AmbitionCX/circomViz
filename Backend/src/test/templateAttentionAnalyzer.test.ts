import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeLlmIssues } from '../core/llm/templateAttentionAnalyzer.js';

const catalog = {
  sourceNodeIds: new Set(['signal:main.input']),
  sourceEdgeIds: new Set(['collapsed:assignment:main:4:0']),
  r1csNodeIds: new Set(['constraint:7']),
  sourceNodes: [],
  sourceEdges: [],
  r1csNodes: [],
};

test('accepts an issue only when its graph anchor and evidence are allow-listed', () => {
  const issues = normalizeLlmIssues({
    issues: [{
      kind: 'RoleMismatch',
      title: 'Unexpected binding',
      explanation: 'The selected input conflicts with the stated role.',
      severity: 'high',
      confidence: 'medium',
      anchors: [{
        view: 'source',
        type: 'edge',
        id: 'collapsed:assignment:main:4:0',
        relatedNodeIds: ['signal:main.input', 'invented:node'],
      }],
      observed: 'secret is connected',
      expected: 'identifier is connected',
      evidenceIds: ['collapsed:assignment:main:4:0', 'invented:evidence'],
    }],
  }, catalog, new Set(['collapsed:assignment:main:4:0']));

  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.anchors[0]?.id, 'collapsed:assignment:main:4:0');
  assert.deepEqual(issues[0]?.anchors[0]?.relatedNodeIds, ['signal:main.input']);
  assert.deepEqual(issues[0]?.evidenceIds, ['collapsed:assignment:main:4:0']);
  assert.equal(issues[0]?.source, 'llm');
  assert.equal(issues[0]?.resolution, 'open');
});

test('rejects invented anchors and uncited issue claims', () => {
  const inventedAnchor = normalizeLlmIssues({
    issues: [{
      anchors: [{ view: 'source', type: 'node', id: 'invented:node' }],
      evidenceIds: ['signal:main.input'],
    }],
  }, catalog, new Set(['signal:main.input']));

  const uncited = normalizeLlmIssues({
    issues: [{
      anchors: [{ view: 'r1cs', type: 'node', id: 'constraint:7' }],
      evidenceIds: ['invented:evidence'],
    }],
  }, catalog, new Set(['constraint:7']));

  assert.deepEqual(inventedAnchor, []);
  assert.deepEqual(uncited, []);
});


import assert from 'node:assert/strict'
import test from 'node:test'
import type { ConstraintGraphDto, ConstraintNodeDto } from '../types/partialDebugging.js'
import { buildConstraintFamilies, exactConstraintPage, familyMatches, prioritizeConstraintFamilies } from '../utils/r1csProjection.js'

function constraint(index: number, signalId: number): ConstraintNodeDto {
  return {
    id: `constraint:${index}`,
    kind: 'constraint',
    optimization: 'O0',
    index,
    A: { terms: [] },
    B: { terms: [] },
    C: { terms: [] },
    equation: {
      left: { kind: 'signal', signalId },
      right: { kind: 'constant', value: '0' },
    },
    canonicalFingerprint: `fingerprint:${index}`,
    complexity: 'linear',
  }
}

function graph(constraints: ConstraintNodeDto[]): ConstraintGraphDto {
  return {
    level: 'O0',
    signals: [
      { id: 'signal:1', kind: 'signal', signalId: 1, witnessIndex: 1, componentId: 0, qualifiedName: 'main.out', status: 'surviving', role: 'output' },
      { id: 'signal:2', kind: 'signal', signalId: 2, witnessIndex: 2, componentId: 0, qualifiedName: 'main.internal', status: 'surviving', role: 'intermediate' },
    ],
    constraints,
    edges: [],
    adjacency: {},
    signalGroups: [],
    loopClusters: [],
    mockBoundaries: [],
  }
}

test('groups structurally identical constraints while retaining exact member IDs', () => {
  const families = buildConstraintFamilies(graph([constraint(0, 1), constraint(1, 1), constraint(2, 2)]))
  assert.equal(families.length, 2)
  const outputFamily = families.find(family => family.referenceIds.has('signal:1'))
  assert.ok(outputFamily)
  assert.deepEqual(outputFamily.constraints.map(item => item.id), ['constraint:0', 'constraint:1'])
  assert.equal(outputFamily.hasOutput, true)
  assert.equal(familyMatches(outputFamily, new Set(['constraint:1'])), true)
})

test('prioritizes an issue-focused family ahead of output and larger families', () => {
  const families = buildConstraintFamilies(graph([constraint(0, 1), constraint(1, 1), constraint(2, 2)]))
  const prioritized = prioritizeConstraintFamilies(families, new Set(['constraint:2']), new Set())
  assert.equal(prioritized[0].referenceIds.has('constraint:2'), true)
})

test('paginates exact family members without losing family references', () => {
  const constraints = Array.from({ length: 30 }, (_, index) => constraint(index, 1))
  const family = buildConstraintFamilies(graph(constraints))[0]
  const secondPage = exactConstraintPage(family, 1, 25)
  assert.equal(secondPage.length, 5)
  assert.deepEqual(secondPage.map(item => item.constraints[0].id), constraints.slice(25).map(item => item.id))
  assert.equal(secondPage[0].referenceIds.has('signal:1'), true)
})

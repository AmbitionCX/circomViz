import assert from 'node:assert/strict'
import test from 'node:test'
import { connectedEdgeIds, containingNodeIds, togglePinnedNodeExpansion } from '../utils/graphSelection.js'

test('selects all edges incident to a binary operation', () => {
  const selected = connectedEdgeIds('operation:add', [
    { id: 'left-input', source: 'signal:left', target: 'operation:add' },
    { id: 'right-input', source: 'signal:right', target: 'operation:add' },
    { id: 'result-output', source: 'operation:add', target: 'signal:result' },
    { id: 'unrelated', source: 'signal:other', target: 'signal:result' },
  ])

  assert.deepEqual([...selected], ['left-input', 'right-input', 'result-output'])
})

test('selects incoming and outgoing edges incident to a signal', () => {
  const selected = connectedEdgeIds('signal:middle', [
    { id: 'incoming', source: 'operation:left', target: 'signal:middle' },
    { id: 'outgoing', source: 'signal:middle', target: 'operation:right' },
    { id: 'unrelated', source: 'signal:other', target: 'operation:right' },
  ])

  assert.deepEqual([...selected], ['incoming', 'outgoing'])
})

test('returns no highlighted edges without a node selection', () => {
  assert.equal(connectedEdgeIds(null, [
    { id: 'edge', source: 'signal:left', target: 'operation:add' },
  ]).size, 0)
})

test('selects every expression node containing the selected signal', () => {
  const selected = containingNodeIds('signal:remainderBit0', [
    {
      id: 'expression:boolean-check',
      memberNodeIds: ['statement:boolean-check', 'signal:remainderBit0', 'constant:one'],
    },
    {
      id: 'expression:reconstruct-remainder',
      memberNodeIds: ['statement:reconstruct-remainder', 'signal:remainderBit0', 'signal:remainderBit1'],
    },
    {
      id: 'expression:unrelated',
      memberNodeIds: ['statement:unrelated', 'signal:q'],
    },
  ])

  assert.deepEqual([...selected], [
    'expression:boolean-check',
    'expression:reconstruct-remainder',
  ])
})

test('does not infer reverse containment from an expression selection', () => {
  assert.equal(containingNodeIds('expression:boolean-check', [
    {
      id: 'signal:remainderBit0',
      memberNodeIds: ['signal:remainderBit0'],
    },
  ]).size, 0)
})

test('returns no containing nodes without a signal selection', () => {
  assert.equal(containingNodeIds(null, [
    { id: 'expression:value', memberNodeIds: ['signal:value'] },
  ]).size, 0)
})

test('pins, transfers, and releases an expandable node name', () => {
  assert.equal(togglePinnedNodeExpansion(null, 'node:long', true), 'node:long')
  assert.equal(togglePinnedNodeExpansion('node:other', 'node:long', true), 'node:long')
  assert.equal(togglePinnedNodeExpansion('node:long', 'node:long', true), null)
})

test('does not alter pinned expansion for a node whose name is already visible', () => {
  assert.equal(togglePinnedNodeExpansion('node:long', 'node:short', false), 'node:long')
})

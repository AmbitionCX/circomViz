import assert from 'node:assert/strict'
import test from 'node:test'
import type { TemplateInfo } from '../types/circuitTypes.js'
import {
  buildVisibleTemplateTree,
  collectFoldableNodeIds,
  collectSubtreeNodeIds,
  collectTreeNodeIds,
  hasFoldableConfirmedChild,
  isNodeSelectable,
} from '../utils/templateTree.js'
import type { TreeNodeData } from '../utils/templateTree.js'

function node(
  templateName: string,
  options: {
    id?: string
    children?: TreeNodeData[]
    external?: boolean
    recursive?: boolean
    library?: string
  } = {},
): TreeNodeData {
  const children = options.children ?? []
  return {
    id: options.id ?? templateName,
    templateName,
    instanceNames: [],
    depth: 0,
    path: [],
    pathInfo: [],
    templateInfo: { templateName } as TemplateInfo,
    componentCount: children.length,
    parameters: [],
    isTerminal: children.length === 0,
    isExternal: options.external ?? false,
    isRecursiveReference: options.recursive ?? false,
    isLeaf: children.length === 0,
    nodeModulesLibrary: options.library,
    children,
  }
}

test('keeps the leaf-first rule for unresolved templates', () => {
  const unresolvedChild = node('Child')
  const unresolvedParent = node('Parent', { children: [unresolvedChild] })
  assert.equal(isNodeSelectable(unresolvedChild, new Set()), true)
  assert.equal(isNodeSelectable(unresolvedParent, new Set()), false)
  assert.equal(isNodeSelectable(unresolvedParent, new Set(['Child'])), true)
})

test('allows a confirmed non-leaf template to be selected again', () => {
  const parent = node('Parent', { children: [node('UnconfirmedChild')] })
  assert.equal(isNodeSelectable(parent, new Set(['Parent'])), true)
})

test('allows an auto-confirmed library template to bypass the leaf rule', () => {
  const libraryTemplate = node('LibraryTemplate', {
    children: [node('LibraryChild')],
    library: 'circomlib',
  })
  assert.equal(isNodeSelectable(libraryTemplate, new Set(['LibraryTemplate'])), true)
})

test('never selects unresolved external or recursive-reference placeholders', () => {
  assert.equal(isNodeSelectable(node('External', { external: true }), new Set(['External'])), false)
  assert.equal(isNodeSelectable(node('Recursive', { recursive: true }), new Set(['Recursive'])), false)
})

test('folds confirmed branches while preserving unconfirmed siblings', () => {
  const root = node('Root', {
    children: [
      node('Confirmed', { id: 'confirmed' }),
      node('Pending', { id: 'pending' }),
    ],
  })
  const confirmed = new Set(['Confirmed'])

  assert.equal(hasFoldableConfirmedChild(root, confirmed, new Set()), true)
  const visible = buildVisibleTemplateTree(root, new Set(['Root']), confirmed, new Set())
  assert.deepEqual(visible.children.map(child => child.templateName), ['Pending'])
})

test('folds deeper confirmed branches without hiding their unconfirmed ancestors', () => {
  const pending = node('Pending', {
    id: 'pending',
    children: [node('Confirmed', { id: 'pending.confirmed' })],
  })
  const root = node('Root', { children: [pending] })
  const confirmed = new Set(['Confirmed'])
  const foldableIds = collectFoldableNodeIds(root, confirmed, new Set())
  const visible = buildVisibleTemplateTree(root, foldableIds, confirmed, new Set())

  assert.deepEqual([...foldableIds], ['pending'])
  assert.deepEqual(visible.children.map(child => child.templateName), ['Pending'])
  assert.equal(visible.children[0].children.length, 0)
})

test('keeps vulnerable nodes and every ancestor needed to reach them visible', () => {
  const vulnerable = node('Vulnerable', { id: 'confirmed.vulnerable' })
  const confirmedParent = node('ConfirmedParent', {
    id: 'confirmed',
    children: [vulnerable],
  })
  const root = node('Root', { children: [confirmedParent] })
  const confirmed = new Set(['ConfirmedParent', 'Vulnerable'])
  const vulnerableNames = new Set(['Vulnerable'])

  assert.equal(hasFoldableConfirmedChild(root, confirmed, vulnerableNames), false)
  const visible = buildVisibleTemplateTree(root, new Set(['Root']), confirmed, vulnerableNames)
  assert.deepEqual([...collectTreeNodeIds(visible)], ['Root', 'confirmed', 'confirmed.vulnerable'])
})

test('identifies every independently foldable node for fold-all', () => {
  const left = node('PendingLeft', {
    id: 'left',
    children: [node('ConfirmedLeft', { id: 'left.confirmed' })],
  })
  const right = node('PendingRight', {
    id: 'right',
    children: [node('ConfirmedRight', { id: 'right.confirmed' })],
  })
  const root = node('Root', { children: [left, right] })

  assert.deepEqual(
    [...collectFoldableNodeIds(root, new Set(['ConfirmedLeft', 'ConfirmedRight']), new Set())],
    ['left', 'right'],
  )
})

test('uses instance-path ids so repeated template names fold independently', () => {
  const left = node('Parent', {
    id: 'left',
    children: [node('Confirmed', { id: 'left.confirmed' })],
  })
  const right = node('Parent', {
    id: 'right',
    children: [node('Confirmed', { id: 'right.confirmed' })],
  })
  const root = node('Root', { children: [left, right] })
  const visible = buildVisibleTemplateTree(
    root,
    new Set(['left']),
    new Set(['Confirmed']),
    new Set(),
  )

  assert.equal(visible.children[0].children.length, 0)
  assert.equal(visible.children[1].children.length, 1)
})

test('collects every nested fold marker that parent expansion must clear', () => {
  const nested = node('Nested', {
    id: 'parent.nested',
    children: [node('Leaf', { id: 'parent.nested.leaf' })],
  })
  const parent = node('Parent', { id: 'parent', children: [nested] })
  const collapsed = new Set(['parent', 'parent.nested', 'outside'])

  collectSubtreeNodeIds(parent).forEach(id => collapsed.delete(id))
  assert.deepEqual([...collapsed], ['outside'])
})

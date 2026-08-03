import assert from 'node:assert/strict'
import test from 'node:test'
import type { TemplateInfo } from '../types/circuitTypes.js'
import { isNodeSelectable } from '../utils/templateTree.js'
import type { TreeNodeData } from '../utils/templateTree.js'

function node(
  templateName: string,
  options: {
    children?: TreeNodeData[]
    external?: boolean
    recursive?: boolean
    library?: string
  } = {},
): TreeNodeData {
  const children = options.children ?? []
  return {
    id: templateName,
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

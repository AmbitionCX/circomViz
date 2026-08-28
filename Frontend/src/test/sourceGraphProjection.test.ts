import assert from 'node:assert/strict'
import test from 'node:test'
import type { SourceGraphDto, SourceGraphNode } from '../types/partialDebugging.js'
import { compactIterationValues, componentNodePresentation, extractSourceReferenceExpressions, projectSourceArrayAccesses, projectSourceAssignments, projectSourceOpaqueExpressions, projectSourceStatements, sourceBranchCoverageLabel, sourceColumnCenters, sourceStatementColumnCenters, terminalOutputColumn, visibleSourcePredecessorIds } from '../utils/sourceGraphProjection.js'

function assignment(id: string, leftExpression: string, rightExpression: string): SourceGraphNode {
  return {
    id,
    kind: 'assignment',
    label: '<==',
    operator: '<==',
    leftExpression,
    rightExpression,
    generatesConstraint: true,
  }
}

test('aggregates a complete index-preserving component array binding', () => {
  const assignments = [
    assignment('assignment:0', 'eddsa.A[0]', 'ownerKey[0]'),
    assignment('assignment:1', 'eddsa.A[1]', 'ownerKey[1]'),
  ]
  const graph: SourceGraphDto = {
    nodes: [
      { id: 'signal:ownerKey', kind: 'signal', label: 'ownerKey[2]', arrayDimensions: ['2'] },
      { id: 'signal:eddsa.A', kind: 'signal', label: 'eddsa.A[2]', arrayDimensions: ['2'] },
      ...assignments,
    ],
    edges: assignments.flatMap((node, index) => [
      { id: `in:${index}`, source: 'signal:ownerKey', target: node.id, kind: 'data' },
      { id: `out:${index}`, source: node.id, target: 'signal:eddsa.A', kind: 'assignment' },
    ]),
    adjacency: {},
    loops: [],
    statements: [],
  }

  const projected = projectSourceAssignments(graph)
  assert.equal(projected.length, 1)
  assert.equal(projected[0]?.multiplicity, 2)
  assert.deepEqual(projected[0]?.memberEdgeIds, [
    'collapsed:assignment:0:0',
    'collapsed:assignment:1:0',
  ])
  assert.match(projected[0]?.tooltip ?? '', /eddsa\.A\[1\].*ownerKey\[1\]/)
})

test('does not aggregate cross-index or computed array uses', () => {
  const assignments = [
    assignment('assignment:0', 'eddsa.A[0]', 'ownerKey[1]'),
    assignment('assignment:1', 'eddsa.A[1]', 'ownerKey[0]'),
  ]
  const graph: SourceGraphDto = {
    nodes: [
      { id: 'signal:ownerKey', kind: 'signal', label: 'ownerKey[2]', arrayDimensions: ['2'] },
      { id: 'signal:eddsa.A', kind: 'signal', label: 'eddsa.A[2]', arrayDimensions: ['2'] },
      ...assignments,
    ],
    edges: assignments.flatMap((node, index) => [
      { id: `in:${index}`, source: 'signal:ownerKey', target: node.id, kind: 'data' },
      { id: `out:${index}`, source: node.id, target: 'signal:eddsa.A', kind: 'assignment' },
    ]),
    adjacency: {},
    loops: [],
    statements: [],
  }

  assert.equal(projectSourceAssignments(graph).length, 2)
})

test('projects a witness assignment as one source-ordered statement row', () => {
  const graph: SourceGraphDto = {
    nodes: [
      { id: 'signal:encoded_len', kind: 'signal', label: 'encoded_len', role: 'input' },
      { id: 'signal:q', kind: 'signal', label: 'q', role: 'intermediate' },
      { id: 'signal:decoded_len', kind: 'signal', label: 'decoded_len', role: 'output' },
      { id: 'constant:4', kind: 'constant', label: '4' },
      { id: 'operation:idiv', kind: 'operation', label: 'int-div', operation: 'int-div' },
      {
        id: 'assignment:q', kind: 'assignment', label: '<--', operator: '<--',
        leftExpression: 'q', rightExpression: 'encoded_len \\ 4', generatesWitness: true,
      },
    ],
    edges: [
      { id: 'encoded-to-div', source: 'signal:encoded_len', target: 'operation:idiv', kind: 'data', operandIndex: 0 },
      { id: 'four-to-div', source: 'constant:4', target: 'operation:idiv', kind: 'data', operandIndex: 1 },
      { id: 'div-to-assignment', source: 'operation:idiv', target: 'assignment:q', kind: 'data', operator: '<--' },
      { id: 'assignment-to-q', source: 'assignment:q', target: 'signal:q', kind: 'assignment', operator: '<--' },
    ],
    adjacency: {}, loops: [], statements: [],
  }

  const projection = projectSourceStatements(graph)
  assert.deepEqual(projection.nodes.map(node => [node.side, node.label, node.kind, node.referenceId]), [
    ['left', 'q', 'reference', 'signal:q'],
    ['right', 'encoded_len \\ 4', 'expression', 'assignment:q'],
  ])
  assert.deepEqual(projection.edges.map(edge => [edge.source, edge.target, edge.kind]), [
    ['source-statement:assignment%3Aq:left', 'source-statement:assignment%3Aq:right', 'source-witness-statement'],
  ])
  assert.equal(projection.edges[0]?.label, '<--')
  assert.deepEqual([...projection.hiddenNodeIds].sort(), ['constant:4', 'operation:idiv', 'signal:encoded_len', 'signal:q'])
  assert.equal(projection.hiddenNodeIds.has('signal:decoded_len'), false)
  assert.deepEqual([...projection.hiddenEdgeIds].sort(), ['assignment-to-q', 'div-to-assignment', 'encoded-to-div', 'four-to-div'])
  assert.deepEqual(projection.nodes[1]?.memberNodeIds.sort(), ['assignment:q', 'constant:4', 'operation:idiv', 'signal:encoded_len'])
})

test('projects exponentiation as one opaque source expression node', () => {
  const graph: SourceGraphDto = {
    nodes: [
      { id: 'constant:2', kind: 'constant', label: '2' },
      { id: 'signal:N', kind: 'signal', label: 'main.N', localName: 'N' },
      { id: 'operation:pow', kind: 'operation', label: 'pow', operation: 'pow' },
      { id: 'operation:add', kind: 'operation', label: 'add', operation: 'add' },
    ],
    edges: [
      { id: 'two-to-pow', source: 'constant:2', target: 'operation:pow', kind: 'data', operandIndex: 0 },
      { id: 'n-to-pow', source: 'signal:N', target: 'operation:pow', kind: 'data', operandIndex: 1 },
      { id: 'pow-to-add', source: 'operation:pow', target: 'operation:add', kind: 'data', operandIndex: 1 },
    ],
    adjacency: {}, loops: [], statements: [],
  }

  const projection = projectSourceOpaqueExpressions(graph)

  assert.equal(projection.nodes.length, 1)
  assert.equal(projection.nodes[0]?.label, '2^N')
  assert.deepEqual([...projection.hiddenNodeIds].sort(), ['constant:2', 'operation:pow', 'signal:N'])
  assert.deepEqual([...projection.hiddenEdgeIds].sort(), ['n-to-pow', 'two-to-pow'])
  assert.equal(projection.replacementNodeIdBySourceNodeId.get('operation:pow'), projection.nodes[0]?.id)
})

test('projects source constraints as independent two-sided rows ordered by source line', () => {
  const graph: SourceGraphDto = {
    nodes: [
      { id: 'signal:remainder', kind: 'signal', label: 'remainder' },
      { id: 'signal:bit0', kind: 'signal', label: 'remainderBit0' },
      { id: 'signal:bit1', kind: 'signal', label: 'remainderBit1' },
      { id: 'constant:1', kind: 'constant', label: '1' },
      { id: 'constant:2', kind: 'constant', label: '2' },
      { id: 'operation:mul', kind: 'operation', label: 'mul' },
      { id: 'operation:add', kind: 'operation', label: 'add' },
      { id: 'constraint:later', kind: 'source-constraint', label: '===', operator: '===', leftExpression: 'remainder', rightExpression: 'remainderBit0 + 2 * remainderBit1', sourceSpan: { file: 'main.circom', startLine: 12, endLine: 12 } },
      { id: 'constraint:earlier', kind: 'source-constraint', label: '===', operator: '===', leftExpression: 'remainderBit0', rightExpression: '1', sourceSpan: { file: 'main.circom', startLine: 9, endLine: 9 } },
    ],
    edges: [
      { id: 'bit1-to-mul', source: 'signal:bit1', target: 'operation:mul', kind: 'data' },
      { id: 'two-to-mul', source: 'constant:2', target: 'operation:mul', kind: 'data' },
      { id: 'bit0-to-add', source: 'signal:bit0', target: 'operation:add', kind: 'data' },
      { id: 'mul-to-add', source: 'operation:mul', target: 'operation:add', kind: 'data' },
      { id: 'later-left', source: 'signal:remainder', target: 'constraint:later', kind: 'constraint-relation' },
      { id: 'later-right', source: 'operation:add', target: 'constraint:later', kind: 'constraint-relation' },
      { id: 'earlier-left', source: 'signal:bit0', target: 'constraint:earlier', kind: 'constraint-relation' },
      { id: 'earlier-right', source: 'constant:1', target: 'constraint:earlier', kind: 'constraint-relation' },
    ],
    adjacency: {}, loops: [], statements: [],
  }

  const projection = projectSourceStatements(graph)
  assert.deepEqual(projection.lanes.map(lane => [lane.id, lane.sourceLine]), [
    ['constraint:earlier', 9],
    ['constraint:later', 12],
  ])
  assert.deepEqual(projection.edges.map(edge => edge.label), ['===', '==='])
  assert.equal(projection.nodes.find(node => node.statementId === 'constraint:later' && node.side === 'right')?.label, 'remainderBit0 + 2 * remainderBit1')
  assert.ok(projection.hiddenNodeIds.has('operation:mul'))
  assert.ok(projection.hiddenNodeIds.has('operation:add'))
})

test('keeps reverse assignments in source-code left-to-right order', () => {
  const graph: SourceGraphDto = {
    nodes: [
      { id: 'signal:source', kind: 'signal', label: 'source' },
      { id: 'signal:target', kind: 'signal', label: 'target' },
      { id: 'assignment:reverse', kind: 'assignment', label: '-->', operator: '-->', leftExpression: 'source', rightExpression: 'target' },
    ],
    edges: [
      { id: 'source-to-assignment', source: 'signal:source', target: 'assignment:reverse', kind: 'data', operator: '-->' },
      { id: 'assignment-to-target', source: 'assignment:reverse', target: 'signal:target', kind: 'assignment', operator: '-->' },
    ],
    adjacency: {}, loops: [], statements: [],
  }

  const projection = projectSourceStatements(graph)
  assert.deepEqual(projection.nodes.map(node => node.label), ['source', 'target'])
  assert.deepEqual(projection.edges.map(edge => [edge.source, edge.target]), [
    ['source-statement:assignment%3Areverse:left', 'source-statement:assignment%3Areverse:right'],
  ])
  assert.equal(projection.edges[0]?.label, '-->')
})

test('does not duplicate conditional statements into ordinary statement lanes', () => {
  const graph: SourceGraphDto = {
    nodes: [
      { id: 'signal:source', kind: 'signal', label: 'source' },
      { id: 'signal:target', kind: 'signal', label: 'target' },
      {
        id: 'assignment:conditional', kind: 'assignment', label: '<==', operator: '<==',
        leftExpression: 'target', rightExpression: 'source', statementId: 'statement:then',
      },
    ],
    edges: [
      { id: 'source-to-assignment', source: 'signal:source', target: 'assignment:conditional', kind: 'data' },
      { id: 'assignment-to-target', source: 'assignment:conditional', target: 'signal:target', kind: 'assignment' },
    ],
    adjacency: {}, loops: [],
    statements: [{
      id: 'statement:then', order: 0, kind: 'constraint', label: 'target <== source',
      nodeIds: ['assignment:conditional'], conditionalId: 'conditional:root', conditionalBranch: 'then',
      sourceSpan: { file: 'main.circom', startLine: 5, endLine: 5 },
    }],
    conditionals: [{
      id: 'conditional:root', condition: 'flag == 1', order: 0, hasElse: false,
      thenStatementIds: ['statement:then'], elseStatementIds: [],
      thenCoverage: { status: 'unknown' }, elseCoverage: { status: 'unknown' },
      sourceSpan: { file: 'main.circom', startLine: 4, endLine: 4 },
    }],
  }

  assert.equal(projectSourceStatements(graph).lanes.length, 0)
})

test('leaves child-component port bindings in the topology projection', () => {
  const graph: SourceGraphDto = {
    nodes: [
      { id: 'signal:source', kind: 'signal', label: 'source' },
      { id: 'signal:child.in', kind: 'signal', label: 'child.in' },
      { id: 'component:child', kind: 'component-group', label: 'Child' },
      { id: 'assignment:binding', kind: 'assignment', label: '<==', operator: '<==', leftExpression: 'child.in', rightExpression: 'source' },
    ],
    edges: [
      { id: 'component-port', source: 'signal:child.in', target: 'component:child', kind: 'component-input' },
      { id: 'binding-input', source: 'signal:source', target: 'assignment:binding', kind: 'data' },
      { id: 'binding-output', source: 'assignment:binding', target: 'signal:child.in', kind: 'assignment' },
    ],
    adjacency: {}, loops: [], statements: [],
  }

  const projection = projectSourceStatements(graph)
  assert.equal(projection.nodes.length, 0)
  assert.equal(projection.edges.length, 0)
  assert.equal(projection.statementIds.size, 0)
})

test('projects distinct array access patterns without expanding the array family', () => {
  const graph: SourceGraphDto = {
    nodes: [
      {
        id: 'signal:main.in[2]',
        kind: 'signal',
        label: 'main.in[2]',
        localName: 'in[2]',
        componentPath: 'main',
        arrayDimensions: ['2'],
        role: 'input',
      },
      { id: 'operation:sub', kind: 'operation', label: 'sub', operation: 'sub' },
    ],
    edges: [
      { id: 'operand:0', source: 'signal:main.in[2]', target: 'operation:sub', kind: 'data', operandIndex: 0, label: '[0]', accessExpression: 'in[0]' },
      { id: 'operand:1', source: 'signal:main.in[2]', target: 'operation:sub', kind: 'data', operandIndex: 1, label: '[1]', accessExpression: 'in[1]' },
      { id: 'operand:0:again', source: 'signal:main.in[2]', target: 'operation:sub', kind: 'data', operandIndex: 0, label: '[0]', accessExpression: 'in[0]' },
    ],
    adjacency: {},
    loops: [],
    statements: [],
  }

  const projection = projectSourceArrayAccesses(graph)
  assert.deepEqual(projection.nodes.map(node => node.label), ['in[0]', 'in[1]'])
  assert.equal(projection.nodes[0]?.familyNodeId, 'signal:main.in[2]')
  assert.deepEqual(projection.nodes[0]?.memberEdgeIds, ['operand:0', 'operand:0:again'])
  assert.equal(projection.accessNodeIdByEdgeId.get('operand:0'), projection.accessNodeIdByEdgeId.get('operand:0:again'))
  assert.notEqual(projection.accessNodeIdByEdgeId.get('operand:0'), projection.accessNodeIdByEdgeId.get('operand:1'))
})

test('sizes component cards to their names and caps overflowing labels', () => {
  const compact = componentNodePresentation('hasher', 'Poseidon')
  assert.equal(compact.width, 320)
  assert.equal(compact.instanceLabel, 'hasher')
  assert.equal(compact.templateLabel, 'Poseidon')

  const adaptive = componentNodePresentation('membershipPathHasher', 'LinearDigest')
  assert.ok(adaptive.width > 320)
  assert.ok(adaptive.width < 480)
  assert.equal(adaptive.instanceLabel, 'membershipPathHasher')

  const longName = 'zAccountUtxoInNullifierHasherProverWithAnExceptionallyLongSuffix'
  const capped = componentNodePresentation(longName, 'ForceEqualIfEnabledWithAnExceptionallyLongTemplateSuffix')
  assert.equal(capped.width, 480)
  assert.match(capped.instanceLabel, /\.\.\.$/)
  assert.match(capped.templateLabel, /\.\.\.$/)
  assert.equal(capped.tooltip, `Instance: ${longName}\nTemplate: ForceEqualIfEnabledWithAnExceptionallyLongTemplateSuffix`)
})

test('spaces source graph columns by their widest nodes', () => {
  const compact = sourceColumnCenters([
    { depth: 0, width: 100 },
    { depth: 1, width: 120 },
  ])
  assert.equal(compact.get(0), 150)
  assert.equal(compact.get(1), 550)

  const wide = sourceColumnCenters([
    { depth: 0, width: 480 },
    { depth: 1, width: 320 },
  ])
  assert.equal(wide.get(0), 290)
  assert.equal(wide.get(1), 786)
  const clearance = wide.get(1)! - 320 / 2 - (wide.get(0)! + 480 / 2)
  assert.equal(clearance, 96)

  const loopOutput = sourceColumnCenters([
    { depth: 0, width: 100 },
    { depth: 1, width: 100, minimumStepBefore: 640 },
  ])
  assert.equal(loopOutput.get(1)! - loopOutput.get(0)!, 640)
})

test('spaces statement lanes from boundary nodes by their rendered widths', () => {
  const columns = sourceStatementColumnCenters({
    left: 160,
    right: 220,
    leftBoundary: 270,
    rightBoundary: 190,
  })

  assert.equal(columns.leftBoundary, 195)
  assert.equal(columns.left, 458)
  assert.equal(columns.right, 768)
  assert.equal(columns.rightBoundary, 1021)
  assert.equal(
    columns.left - 160 / 2 - (columns.leftBoundary! + 270 / 2),
    48,
  )
  assert.equal(
    columns.rightBoundary! - 190 / 2 - (columns.right + 220 / 2),
    48,
  )
})

test('keeps statement lanes compact without boundary nodes', () => {
  const columns = sourceStatementColumnCenters({ left: 120, right: 120 })

  assert.deepEqual(columns, {
    left: 180,
    right: 420,
    leftBoundary: undefined,
    rightBoundary: undefined,
  })
})

test('formats conditional branch coverage with compact iterator ranges', () => {
  assert.equal(compactIterationValues([0, 1, 2, 4, 5]), '0–2, 4–5')
  assert.equal(sourceBranchCoverageLabel('Then', {
    status: 'active', iterationCount: 1, totalIterations: 6,
    iterator: 'j', iteratorValues: [3], valuesTruncated: false,
  }), 'Then · 1/6 · j={3}')
  assert.equal(sourceBranchCoverageLabel('Else', {
    status: 'active', iterationCount: 5, totalIterations: 6,
    iterator: 'j', iteratorValues: [0, 1, 2, 4, 5], valuesTruncated: false,
  }), 'Else · 5/6 · j={0–2, 4–5}')
  assert.equal(sourceBranchCoverageLabel('Then', { status: 'unknown' }), 'Then · coverage unknown')
})

test('recovers visible loop inputs through hidden expression nodes', () => {
  assert.deepEqual(extractSourceReferenceExpressions('a[i] * b[i]'), ['a[i]', 'b[i]'])
  assert.deepEqual(extractSourceReferenceExpressions('component[i].out + a[i] + a[i]'), ['component[i].out', 'a[i]'])

  const visible = visibleSourcePredecessorIds(
    ['operation:multiply'],
    [
      { source: 'signal:a', target: 'operation:multiply' },
      { source: 'operation:index-offset', target: 'operation:multiply' },
      { source: 'signal:b', target: 'operation:index-offset' },
    ],
    new Set(['signal:a', 'signal:b', 'signal:out']),
  )
  assert.deepEqual([...visible], ['signal:a', 'signal:b'])
})

test('places terminal outputs after every non-terminal source node', () => {
  const depths = new Map([
    ['signal:input', 0],
    ['operation:multiply', 1],
    ['signal:reused-output', 2],
    ['operation:consumer', 3],
    ['signal:terminal-output', 2],
  ])
  assert.equal(terminalOutputColumn(depths, new Set(['signal:terminal-output'])), 4)
})

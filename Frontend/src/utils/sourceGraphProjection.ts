import type { SourceBranchCoverageDto, SourceGraphDto, SourceGraphEdge, SourceGraphNode } from '../types/partialDebugging.js'

export interface SourceAssignmentProjection {
  id: string
  assignmentId: string
  source: string
  target: string
  kind: 'constrained-assignment' | 'witness-assignment'
  label?: string
  multiplicity?: number
  sourceExpression?: string
  targetExpression?: string
  memberEdgeIds: string[]
  tooltip?: string
}

export interface SourceStatementNodeProjection {
  id: string
  statementId: string
  side: 'left' | 'right'
  label: string
  kind: 'reference' | 'constant' | 'expression'
  referenceId?: string
  role?: SourceGraphNode['role']
  memberNodeIds: string[]
  tooltip: string
}

export interface SourceStatementEdgeProjection {
  id: string
  source: string
  target: string
  kind: 'source-witness-statement' | 'source-constrained-statement' | 'source-constraint-statement'
  label: '<--' | '-->' | '<==' | '==>' | '==='
  memberEdgeIds: string[]
  tooltip: string
}

export interface SourceStatementLaneProjection {
  id: string
  sourceLine: number
  leftNodeId: string
  rightNodeId: string
}

export interface SourceStatementProjection {
  nodes: SourceStatementNodeProjection[]
  edges: SourceStatementEdgeProjection[]
  lanes: SourceStatementLaneProjection[]
  hiddenNodeIds: Set<string>
  hiddenEdgeIds: Set<string>
  statementIds: Set<string>
}

export interface SourceArrayAccessNodeProjection {
  id: string
  familyNodeId: string
  label: string
  qualifiedName: string
  role?: SourceGraphNode['role']
  memberEdgeIds: string[]
}

export interface SourceArrayAccessProjection {
  nodes: SourceArrayAccessNodeProjection[]
  accessNodeIdByEdgeId: Map<string, string>
}

export interface SourceOpaqueExpressionNodeProjection {
  id: string
  sourceNodeId: string
  label: string
  memberNodeIds: string[]
  hiddenNodeIds: string[]
  hiddenEdgeIds: string[]
}

export interface SourceOpaqueExpressionProjection {
  nodes: SourceOpaqueExpressionNodeProjection[]
  replacementNodeIdBySourceNodeId: Map<string, string>
  hiddenNodeIds: Set<string>
  hiddenEdgeIds: Set<string>
}

export interface ComponentNodePresentation {
  width: number
  instanceLabel: string
  templateLabel: string
  tooltip: string
}

export interface SourceColumnExtent {
  depth: number
  width: number
  minimumStepBefore?: number
}

export interface SourceStatementColumnWidths {
  left: number
  right: number
  leftBoundary?: number
  rightBoundary?: number
}

export interface SourceStatementColumnCenters {
  left: number
  right: number
  leftBoundary?: number
  rightBoundary?: number
}

interface SourceEdgeEndpoints {
  source: string
  target: string
}

const COMPONENT_MIN_WIDTH = 320
const COMPONENT_MAX_WIDTH = 480
const COMPONENT_HORIZONTAL_PADDING = 40
const COMPONENT_INSTANCE_FONT_SIZE = 24
const COMPONENT_TEMPLATE_FONT_SIZE = 16

const REFERENCE_EXPRESSION = /^[A-Za-z_$][\w$]*(?:\[[^\]]+\])*(?:\.[A-Za-z_$][\w$]*(?:\[[^\]]+\])*)*$/
const INDEX_ACCESS = /\[[^\]]+\]/

function estimatedTextWidth(text: string, fontSize: number) {
  return [...text].reduce((width, character) =>
    width + fontSize * (/^[\u0000-\u00ff]$/.test(character) ? 0.62 : 1), 0)
}

function fitText(text: string, maxWidth: number, fontSize: number) {
  if (estimatedTextWidth(text, fontSize) <= maxWidth) return text
  const suffix = '...'
  let result = ''
  for (const character of text) {
    if (estimatedTextWidth(`${result}${character}${suffix}`, fontSize) > maxWidth) break
    result += character
  }
  return `${result}${suffix}`
}

export function componentNodePresentation(instanceName: string, templateName: string): ComponentNodePresentation {
  const requiredWidth = Math.max(
    estimatedTextWidth(instanceName, COMPONENT_INSTANCE_FONT_SIZE),
    estimatedTextWidth(templateName, COMPONENT_TEMPLATE_FONT_SIZE),
  ) + COMPONENT_HORIZONTAL_PADDING
  const width = Math.min(COMPONENT_MAX_WIDTH, Math.max(COMPONENT_MIN_WIDTH, Math.ceil(requiredWidth)))
  const availableTextWidth = width - COMPONENT_HORIZONTAL_PADDING
  return {
    width,
    instanceLabel: fitText(instanceName, availableTextWidth, COMPONENT_INSTANCE_FONT_SIZE),
    templateLabel: fitText(templateName, availableTextWidth, COMPONENT_TEMPLATE_FONT_SIZE),
    tooltip: `Instance: ${instanceName}\nTemplate: ${templateName}`,
  }
}

export function sourceColumnCenters(
  extents: SourceColumnExtent[],
  minimumColumnStep = 400,
  horizontalClearance = 96,
) {
  const sorted = [...extents].sort((left, right) => left.depth - right.depth)
  const centers = new Map<number, number>()
  let previous: SourceColumnExtent | undefined
  let previousCenter = 0
  for (const extent of sorted) {
    const center = previous
      ? previousCenter + Math.max(minimumColumnStep, extent.minimumStepBefore ?? 0, previous.width / 2 + extent.width / 2 + horizontalClearance)
      : Math.max(150, extent.width / 2 + 50)
    centers.set(extent.depth, center)
    previous = extent
    previousCenter = center
  }
  return centers
}

export function sourceStatementColumnCenters(
  widths: SourceStatementColumnWidths,
  canvasMargin = 60,
  boundaryClearance = 48,
  statementGap = 120,
): SourceStatementColumnCenters {
  const compactLeftCenter = Math.max(180, widths.left / 2 + canvasMargin)
  const leftBoundary = widths.leftBoundary
    ? canvasMargin + widths.leftBoundary / 2
    : undefined
  const left = widths.leftBoundary
    ? Math.max(
      compactLeftCenter,
      canvasMargin + widths.leftBoundary + boundaryClearance + widths.left / 2,
    )
    : compactLeftCenter
  const right = left + widths.left / 2 + statementGap + widths.right / 2
  const rightBoundary = widths.rightBoundary
    ? right + widths.right / 2 + boundaryClearance + widths.rightBoundary / 2
    : undefined
  return { left, right, leftBoundary, rightBoundary }
}

export function compactIterationValues(values: readonly number[], truncated = false) {
  if (!values.length) return truncated ? '…' : ''
  const sorted = [...new Set(values)].sort((left, right) => left - right)
  const ranges: string[] = []
  let start = sorted[0]!
  let end = start
  const flush = () => ranges.push(start === end ? String(start) : `${start}–${end}`)
  for (const value of sorted.slice(1)) {
    if (value === end + 1) { end = value; continue }
    flush(); start = value; end = value
  }
  flush()
  return `${ranges.join(', ')}${truncated ? ', …' : ''}`
}

export function sourceBranchCoverageLabel(
  branch: 'Then' | 'Else',
  coverage: SourceBranchCoverageDto,
) {
  if (coverage.status === 'unknown') return `${branch} · coverage unknown`
  const count = coverage.iterationCount ?? 0
  const total = coverage.totalIterations
  const ratio = total === undefined ? String(count) : `${count}/${total}`
  const values = coverage.iterator && coverage.iteratorValues?.length
    ? ` · ${coverage.iterator}={${compactIterationValues(coverage.iteratorValues, coverage.valuesTruncated)}}`
    : ''
  return `${branch} · ${ratio}${values}`
}

export function extractSourceReferenceExpressions(expression: string) {
  const matches = expression.match(/[A-Za-z_$][\w$]*(?:\s*\[[^\]]+\])*(?:\s*\.\s*[A-Za-z_$][\w$]*(?:\s*\[[^\]]+\])*)*/g) ?? []
  return [...new Set(matches.map(match => match.replace(/\s+/g, '')))]
}

export function visibleSourcePredecessorIds(
  startIds: readonly string[],
  edges: readonly SourceEdgeEndpoints[],
  visibleNodeIds: ReadonlySet<string>,
) {
  const incoming = new Map<string, string[]>()
  for (const edge of edges) {
    const sources = incoming.get(edge.target) ?? []
    sources.push(edge.source)
    incoming.set(edge.target, sources)
  }
  const visible = new Set<string>()
  const visited = new Set<string>()
  const queue = [...startIds]
  while (queue.length) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    if (visibleNodeIds.has(current)) {
      visible.add(current)
      continue
    }
    queue.push(...(incoming.get(current) ?? []))
  }
  return visible
}

export function terminalOutputColumn(
  depthByNodeId: ReadonlyMap<string, number>,
  terminalOutputIds: ReadonlySet<string>,
) {
  const nonTerminalDepths = [...depthByNodeId]
    .filter(([nodeId]) => !terminalOutputIds.has(nodeId))
    .map(([, depth]) => depth)
  const terminalDepths = [...terminalOutputIds].map(nodeId => depthByNodeId.get(nodeId) ?? 0)
  return Math.max(1, Math.max(0, ...nonTerminalDepths) + 1, ...terminalDepths)
}

function indexes(expression?: string) {
  if (!expression || !REFERENCE_EXPRESSION.test(expression)) return undefined
  return [...expression.matchAll(/\[([^\]]+)\]/g)].map(match => match[1]!.replace(/\s+/g, ''))
}

function fallbackAccessExpression(node: SourceGraphNode, edge: SourceGraphEdge) {
  if (!edge.label || !/^(?:\[[^\]]+\])+$/.test(edge.label)) return undefined
  const dimensions = node.arrayDimensions ?? []
  let baseName = node.localName ?? node.label
  for (let index = dimensions.length - 1; index >= 0; index--) {
    const suffix = `[${dimensions[index]}]`
    if (!baseName.endsWith(suffix)) return undefined
    baseName = baseName.slice(0, -suffix.length)
  }
  return `${baseName}${edge.label}`
}

/**
 * Keep compile-time/special arithmetic readable in the source view by
 * replacing an operator subtree with the expression it represents. The raw
 * operands remain graph evidence through memberNodeIds, but are not connected
 * to the compact visual node.
 */
export function projectSourceOpaqueExpressions(
  graph: SourceGraphDto,
  excludedNodeIds: ReadonlySet<string> = new Set<string>(),
): SourceOpaqueExpressionProjection {
  const nodeById = new Map(graph.nodes.map(node => [node.id, node]))
  const incomingByTarget = new Map<string, SourceGraphEdge[]>()
  const incidentByNode = new Map<string, SourceGraphEdge[]>()
  for (const edge of graph.edges) {
    const incoming = incomingByTarget.get(edge.target) ?? []
    incoming.push(edge)
    incomingByTarget.set(edge.target, incoming)
    for (const nodeId of [edge.source, edge.target]) {
      const incident = incidentByNode.get(nodeId) ?? []
      incident.push(edge)
      incidentByNode.set(nodeId, incident)
    }
  }

  const powerNodeIds = new Set(graph.nodes
    .filter(node => node.kind === 'operation' && node.operation === 'pow')
    .map(node => node.id))
  const nestedPowerNodeIds = new Set(graph.edges
    .filter(edge => powerNodeIds.has(edge.source) && powerNodeIds.has(edge.target))
    .map(edge => edge.source))
  const roots = graph.nodes.filter(node =>
    powerNodeIds.has(node.id)
    && !nestedPowerNodeIds.has(node.id)
    && !excludedNodeIds.has(node.id),
  )

  const formatNode = (nodeId: string, visiting = new Set<string>()): string => {
    const node = nodeById.get(nodeId)
    if (!node || visiting.has(nodeId)) return node?.localName ?? node?.label ?? '?'
    if (node.kind !== 'operation') return node.localName ?? node.label
    const next = new Set(visiting).add(nodeId)
    const operands = [...(incomingByTarget.get(nodeId) ?? [])]
      .sort((left, right) => (left.operandIndex ?? 0) - (right.operandIndex ?? 0))
      .map(edge => edge.accessExpression ?? formatNode(edge.source, next))
    if (node.operation === 'pow' && operands.length >= 2) return `${operands[0]}^${operands[1]}`
    const symbol = node.operation === 'add' ? '+'
      : node.operation === 'sub' ? '-'
        : node.operation === 'mul' ? '*'
          : node.operation === 'div' ? '/'
            : node.label
    return operands.length ? `(${operands.join(` ${symbol} `)})` : node.label
  }

  const nodes = roots.map((root): SourceOpaqueExpressionNodeProjection => {
    const memberNodeIds = new Set<string>()
    const queue = [root.id]
    while (queue.length) {
      const nodeId = queue.shift()!
      if (memberNodeIds.has(nodeId)) continue
      memberNodeIds.add(nodeId)
      const node = nodeById.get(nodeId)
      if (node?.kind === 'operation') queue.push(...(incomingByTarget.get(nodeId) ?? []).map(edge => edge.source))
    }
    const hiddenEdgeIds = graph.edges
      .filter(edge => memberNodeIds.has(edge.source) && memberNodeIds.has(edge.target))
      .map(edge => edge.id)
    const hiddenNodeIds = [...memberNodeIds].filter(nodeId => {
      if (nodeId === root.id) return true
      return (incidentByNode.get(nodeId) ?? []).every(edge => memberNodeIds.has(edge.source) && memberNodeIds.has(edge.target))
    })
    return {
      id: `source-opaque-expression:${encodeURIComponent(root.id)}`,
      sourceNodeId: root.id,
      label: formatNode(root.id),
      memberNodeIds: [...memberNodeIds],
      hiddenNodeIds,
      hiddenEdgeIds,
    }
  })

  return {
    nodes,
    replacementNodeIdBySourceNodeId: new Map(nodes.map(node => [node.sourceNodeId, node.id])),
    hiddenNodeIds: new Set(nodes.flatMap(node => node.hiddenNodeIds)),
    hiddenEdgeIds: new Set(nodes.flatMap(node => node.hiddenEdgeIds)),
  }
}

/**
 * Preserve the declared array family while projecting each distinct indexed
 * reference as one access-pattern node. Symbolic accesses such as `in[i]` stay
 * symbolic and are never expanded into every array element.
 */
export function projectSourceArrayAccesses(
  graph: SourceGraphDto,
  candidateEdges: SourceGraphEdge[] = graph.edges,
): SourceArrayAccessProjection {
  const nodeById = new Map(graph.nodes.map(node => [node.id, node]))
  const accessNodeIdByEdgeId = new Map<string, string>()
  const projectedByKey = new Map<string, SourceArrayAccessNodeProjection>()

  for (const edge of candidateEdges) {
    const family = nodeById.get(edge.source)
    if (family?.kind !== 'signal' || !family.arrayDimensions?.length) continue
    const expression = edge.accessExpression ?? fallbackAccessExpression(family, edge)
    if (!expression || !REFERENCE_EXPRESSION.test(expression) || !INDEX_ACCESS.test(expression)) continue
    const normalizedExpression = expression.replace(/\s+/g, '')
    const key = `${family.id}\u0000${normalizedExpression}`
    let projected = projectedByKey.get(key)
    if (!projected) {
      projected = {
        id: `array-access:${encodeURIComponent(family.id)}:${encodeURIComponent(normalizedExpression)}`,
        familyNodeId: family.id,
        label: expression,
        qualifiedName: family.componentPath ? `${family.componentPath}.${expression}` : expression,
        role: family.role,
        memberEdgeIds: [],
      }
      projectedByKey.set(key, projected)
    }
    projected.memberEdgeIds.push(edge.id)
    accessNodeIdByEdgeId.set(edge.id, projected.id)
  }

  return { nodes: [...projectedByKey.values()], accessNodeIdByEdgeId }
}

function projectedAssignment(
  graph: SourceGraphDto,
  assignment: SourceGraphNode,
): SourceAssignmentProjection[] {
  const incoming = graph.edges.filter(edge => edge.target === assignment.id)
  const outgoing = graph.edges.find(edge => edge.source === assignment.id)
  if (!incoming.length || !outgoing) return []
  const reverse = assignment.operator === '==>' || assignment.operator === '-->'
  const sourceExpression = reverse ? assignment.leftExpression : assignment.rightExpression
  const targetExpression = reverse ? assignment.rightExpression : assignment.leftExpression
  return incoming.map((input, index) => ({
    id: `collapsed:${assignment.id}:${index}`,
    assignmentId: assignment.id,
    source: input.source,
    target: outgoing.target,
    kind: assignment.generatesConstraint ? 'constrained-assignment' : 'witness-assignment',
    label: assignment.operator,
    sourceExpression,
    targetExpression,
    memberEdgeIds: [`collapsed:${assignment.id}:${index}`],
    tooltip: sourceExpression && targetExpression
      ? `${targetExpression} ${assignment.operator ?? '='} ${sourceExpression}`
      : undefined,
  }))
}

const PROJECTED_STATEMENT_OPERATORS = new Set(['<--', '-->', '<==', '==>', '==='])
const STATEMENT_INTERNAL_NODE_KINDS = new Set(['operation', 'constant', 'ternary-condition', 'ternary-result'])
const CONSTANT_EXPRESSION = /^[+-]?(?:\d+(?:\.\d+)?|0x[\da-f]+)$/i

/**
 * Project each non-loop arithmetic statement as one source-ordered row. Both
 * sides are statement-local visual nodes, while raw AST membership and signal
 * references remain attached for diagnostics and cross-view selection.
 * Statements touching child-component ports are intentionally left to the
 * component topology projection.
 */
export function projectSourceStatements(graph: SourceGraphDto): SourceStatementProjection {
  const nodeById = new Map(graph.nodes.map(node => [node.id, node]))
  const incomingByTarget = new Map<string, SourceGraphEdge[]>()
  const incidentByNode = new Map<string, SourceGraphEdge[]>()
  for (const edge of graph.edges) {
    const incoming = incomingByTarget.get(edge.target) ?? []
    incoming.push(edge)
    incomingByTarget.set(edge.target, incoming)
    for (const nodeId of [edge.source, edge.target]) {
      const incident = incidentByNode.get(nodeId) ?? []
      incident.push(edge)
      incidentByNode.set(nodeId, incident)
    }
  }

  const componentPortIds = new Set(graph.edges.flatMap(edge =>
    edge.kind === 'component-input'
      ? [edge.source]
      : edge.kind === 'component-output' ? [edge.target] : [],
  ))
  const nodes: SourceStatementNodeProjection[] = []
  const edges: SourceStatementEdgeProjection[] = []
  const lanes: SourceStatementLaneProjection[] = []
  const hiddenEdgeIds = new Set<string>()
  const hideableNodeIds = new Set<string>()
  const statementIds = new Set<string>()

  const conditionalStatementIds = new Set(graph.statements.filter(statement => statement.conditionalId).map(statement => statement.id))
  const statements = graph.nodes
    .filter(node => !node.loopId && !conditionalStatementIds.has(node.statementId ?? '') && (node.kind === 'assignment' || node.kind === 'source-constraint') && PROJECTED_STATEMENT_OPERATORS.has(node.operator ?? ''))
    .sort((left, right) => (left.sourceSpan?.startLine ?? Number.MAX_SAFE_INTEGER) - (right.sourceSpan?.startLine ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id))

  for (const statement of statements) {
    const operator = statement.operator as SourceStatementEdgeProjection['label']
    const connectorEdges = statement.kind === 'source-constraint'
      ? incomingByTarget.get(statement.id) ?? []
      : [
          ...(incomingByTarget.get(statement.id) ?? []),
          ...graph.edges.filter(edge => edge.source === statement.id),
        ]
    const assignmentInputs = statement.kind === 'assignment' ? incomingByTarget.get(statement.id) ?? [] : []
    const assignmentOutput = statement.kind === 'assignment' ? graph.edges.find(edge => edge.source === statement.id) : undefined
    const constraintOperands = statement.kind === 'source-constraint' ? incomingByTarget.get(statement.id) ?? [] : []
    if (!statement.leftExpression || !statement.rightExpression) continue
    if (statement.kind === 'assignment' && (!assignmentInputs.length || !assignmentOutput)) continue
    if (statement.kind === 'source-constraint' && constraintOperands.length < 2) continue

    const reverse = operator === '==>' || operator === '-->'
    const leftRoots = statement.kind === 'source-constraint'
      ? [constraintOperands[0]!.source]
      : reverse ? assignmentInputs.map(edge => edge.source) : [assignmentOutput!.target]
    const rightRoots = statement.kind === 'source-constraint'
      ? [constraintOperands[1]!.source]
      : reverse ? [assignmentOutput!.target] : assignmentInputs.map(edge => edge.source)

    const subtreeNodeIds = (rootIds: string[]) => {
      const result = new Set<string>()
      const queue = [...rootIds]
      while (queue.length) {
        const nodeId = queue.shift()!
        if (result.has(nodeId)) continue
        result.add(nodeId)
        const node = nodeById.get(nodeId)
        if (node && STATEMENT_INTERNAL_NODE_KINDS.has(node.kind) && node.kind !== 'constant') {
          queue.push(...(incomingByTarget.get(nodeId) ?? []).map(edge => edge.source))
        }
      }
      return result
    }
    const leftMemberNodeIds = subtreeNodeIds(leftRoots)
    const rightMemberNodeIds = subtreeNodeIds(rightRoots)
    const allMemberNodeIds = new Set([...leftMemberNodeIds, ...rightMemberNodeIds])
    if ([...allMemberNodeIds].some(nodeId => componentPortIds.has(nodeId))) continue

    for (const nodeId of allMemberNodeIds) {
      const node = nodeById.get(nodeId)
      if (node?.kind !== 'component-group') hideableNodeIds.add(nodeId)
      if (!node || !STATEMENT_INTERNAL_NODE_KINDS.has(node.kind) || node.kind === 'constant') continue
      for (const edge of incomingByTarget.get(nodeId) ?? []) hiddenEdgeIds.add(edge.id)
    }
    connectorEdges.forEach(edge => hiddenEdgeIds.add(edge.id))
    statementIds.add(statement.id)

    const fullStatement = `${statement.leftExpression} ${operator} ${statement.rightExpression}`
    const sideNode = (
      side: 'left' | 'right',
      expression: string,
      rootIds: string[],
      memberNodeIds: Set<string>,
    ): SourceStatementNodeProjection => {
      const root = rootIds.length === 1 ? nodeById.get(rootIds[0]!) : undefined
      const reference = REFERENCE_EXPRESSION.test(expression) && (root?.kind === 'signal' || root?.kind === 'variable')
      const kind: SourceStatementNodeProjection['kind'] = reference
        ? 'reference'
        : CONSTANT_EXPRESSION.test(expression) ? 'constant' : 'expression'
      return {
        id: `source-statement:${encodeURIComponent(statement.id)}:${side}`,
        statementId: statement.id,
        side,
        label: expression,
        kind,
        referenceId: reference ? root!.id : statement.id,
        role: reference ? root!.role : undefined,
        memberNodeIds: [statement.id, ...memberNodeIds],
        tooltip: fullStatement,
      }
    }
    const leftNode = sideNode('left', statement.leftExpression, leftRoots, leftMemberNodeIds)
    const rightNode = sideNode('right', statement.rightExpression, rightRoots, rightMemberNodeIds)
    nodes.push(leftNode, rightNode)
    const edgeKind: SourceStatementEdgeProjection['kind'] = operator === '==='
      ? 'source-constraint-statement'
      : operator === '<--' || operator === '-->'
        ? 'source-witness-statement'
        : 'source-constrained-statement'
    edges.push({
      id: `source-statement:${encodeURIComponent(statement.id)}:edge`,
      source: leftNode.id,
      target: rightNode.id,
      kind: edgeKind,
      label: operator,
      memberEdgeIds: [...new Set([
        ...connectorEdges.map(edge => edge.id),
        ...[...allMemberNodeIds].flatMap(nodeId => (incomingByTarget.get(nodeId) ?? []).map(edge => edge.id)),
      ])],
      tooltip: fullStatement,
    })
    lanes.push({
      id: statement.id,
      sourceLine: statement.sourceSpan?.startLine ?? Number.MAX_SAFE_INTEGER,
      leftNodeId: leftNode.id,
      rightNodeId: rightNode.id,
    })
  }

  const hiddenNodeIds = new Set([...hideableNodeIds].filter(nodeId =>
    (incidentByNode.get(nodeId) ?? []).every(edge => hiddenEdgeIds.has(edge.id)),
  ))
  return { nodes, edges, lanes, hiddenNodeIds, hiddenEdgeIds, statementIds }
}

function expectedMemberCount(graph: SourceGraphDto, nodeId: string) {
  const dimensions = graph.nodes.find(node => node.id === nodeId)?.arrayDimensions
  if (!dimensions?.length || dimensions.some(value => !/^\d+$/.test(value))) return undefined
  return dimensions.reduce((product, value) => product * Number(value), 1)
}

function canAggregateFamily(graph: SourceGraphDto, edges: SourceAssignmentProjection[]) {
  if (edges.length < 2) return false
  const sourceCount = expectedMemberCount(graph, edges[0]!.source)
  const targetCount = expectedMemberCount(graph, edges[0]!.target)
  if (sourceCount === undefined || targetCount === undefined || sourceCount !== edges.length || targetCount !== edges.length) return false
  const coordinatePairs = new Set<string>()
  for (const edge of edges) {
    const sourceIndexes = indexes(edge.sourceExpression)
    const targetIndexes = indexes(edge.targetExpression)
    if (!sourceIndexes?.length || !targetIndexes?.length) return false
    if (sourceIndexes.length !== targetIndexes.length) return false
    if (sourceIndexes.some((index, position) => index !== targetIndexes[position])) return false
    coordinatePairs.add(sourceIndexes.join('|'))
  }
  return coordinatePairs.size === edges.length
}

/**
 * Collapse assignment AST nodes while preserving source expressions. Complete,
 * index-preserving array copies are shown as one family edge with exact member
 * IDs retained for diagnostics and linked selection.
 */
export function projectSourceAssignments(graph: SourceGraphDto): SourceAssignmentProjection[] {
  const assignments = graph.nodes
    .filter(node => node.kind === 'assignment' && !node.loopId)
    .flatMap(assignment => projectedAssignment(graph, assignment))
  const groups = new Map<string, SourceAssignmentProjection[]>()
  for (const edge of assignments) {
    const key = [edge.source, edge.target, edge.kind, edge.label].join('|')
    const group = groups.get(key) ?? []
    group.push(edge)
    groups.set(key, group)
  }

  return [...groups.values()].flatMap(edges => {
    if (!canAggregateFamily(graph, edges)) return edges
    const first = edges[0]!
    return [{
      ...first,
      id: `collapsed-family:${first.source}:${first.target}:${first.label}`,
      multiplicity: edges.length,
      memberEdgeIds: edges.flatMap(edge => edge.memberEdgeIds),
      tooltip: edges
        .map(edge => `${edge.targetExpression} ${edge.label ?? '='} ${edge.sourceExpression}`)
        .join('\n'),
    }]
  })
}

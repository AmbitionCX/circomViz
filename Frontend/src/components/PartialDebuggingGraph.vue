<template>
  <div class="graph-shell" @mouseleave="$emit('hover', null)">

    <div v-if="visibleNodes.length === 0" class="graph-empty">No nodes are available for this template.</div>
    <div v-else class="graph-scroll">
      <span class="figure-title">{{ graphKind === 'source' ? 'Raw Code Graph' : 'Constraint Graph' }}</span>
      <div
        v-if="graphKind === 'source'"
        class="absolute bottom-3 left-3 z-30 bg-white/90 backdrop-blur-sm rounded-lg border border-gray-200 shadow-sm px-3 py-2.5 flex flex-col gap-1.5"
      >
        <div class="flex items-center gap-2">
          <span class="input-legend-dot w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"></span>
          <span class="text-gray-600 text-xs">Input signal</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="output-legend-dot w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"></span>
          <span class="text-gray-600 text-xs">Output signal</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="constant-legend-dot w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"></span>
          <span class="text-gray-600 text-xs">Constant</span>
        </div>
      </div>
      <svg ref="svgRef" width="100%" height="100%" :viewBox="`0 0 ${canvasWidth} ${canvasHeight}`" preserveAspectRatio="xMidYMid meet" class="graph-canvas" role="img" :aria-label="graphKind === 'source' ? 'Source Dataflow Graph' : 'Constraint Graph'">
        <g ref="viewportRef" class="zoom-viewport">

        <g v-if="graphKind === 'source'" class="template-boundary">
          <rect :x="sourceBoundary.x" :y="sourceBoundary.y" :width="sourceBoundary.width" :height="sourceBoundary.height" rx="12" />
          <text :x="sourceBoundary.x + 14" :y="sourceBoundary.y + 22">{{ sourceTemplateName }}</text>
        </g>

        <g class="edges">
          <line
            v-for="edge in visibleEdges"
            :key="edge.id"
            :x1="edgePoint(edge, 'source').x"
            :y1="edgePoint(edge, 'source').y"
            :x2="edgePoint(edge, 'target').x"
            :y2="edgePoint(edge, 'target').y"
            :class="['graph-edge', edge.kind]"
          />
          <text
            v-for="edge in labeledEdges"
            :key="`${edge.id}:label`"
            :x="edgeLabelPosition(edge).x"
            :y="edgeLabelPosition(edge).y"
            class="edge-label"
          >{{ edge.label }}</text>
          <g
            v-for="edge in outputOperatorEdges"
            :key="`${edge.id}:operator`"
            :transform="`translate(${edgeMidpoint(edge).x},${edgeMidpoint(edge).y})`"
            class="output-operator"
          >
            <rect x="-20" y="-11" width="40" height="22" rx="10" />
            <text text-anchor="middle" dy="4">{{ outputOperatorLabel(edge.label) }}</text>
          </g>
        </g>

        <g
          v-for="node in visibleNodes"
          :key="node.id"
          :transform="`translate(${positions.get(node.id)?.x ?? 0},${positions.get(node.id)?.y ?? 0})`"
          :class="['graph-node', node.kind, node.status, node.role, { selected: selectedNodeId === nodeReferenceId(node), linked: linkedNodeIds.has(nodeReferenceId(node)), warning: warningNodeIds.has(nodeReferenceId(node)) }]"
          tabindex="0"
          role="button"
          @click.stop="$emit('select', nodeReferenceId(node))"
          @mouseenter="$emit('hover', node.id)"
          @focus="$emit('hover', node.id)"
        >
          <svg v-if="isSvgOperationNode(node)" x="-21" y="-21" width="42" height="42" viewBox="0 0 1024 1024" class="operation-icon" aria-hidden="true">
            <circle cx="512" cy="512" r="512" fill="#ffffff" />
            <path
              v-if="node.label === '+'"
              d="M512 1024C229.283 1024 0.069 794.761 0.069 512.015 0.069 229.253 229.283 0 512 0c282.69 0 511.931 229.253 511.931 512.015C1023.931 794.761 794.691 1024 512 1024z m0-895.999c-212.026 0-383.955 171.931-383.955 384.012 0 212.053 171.93 383.984 383.955 383.984s383.928-171.931 383.928-383.984c0-212.08-171.902-384.012-383.928-384.012z m191.978 448.016H575.973v127.989c0 35.348-28.625 64.002-63.973 64.002s-64.002-28.654-64.002-64.002V576.017H319.995c-35.29 0-63.975-28.656-63.975-64.002 0-35.347 28.682-64.003 63.975-64.003h128.003V320.008c0-35.348 28.654-64.001 64.002-64.001s63.973 28.653 63.973 64.001v128.004h128.005c35.32 0 63.973 28.656 63.973 64.003 0 35.344-28.653 64.002-63.973 64.002z"
              fill="#333333"
            />
            <path
              v-else
              d="M647.38816 728.54528c22.4768 22.4768 58.9824 22.3232 81.60768-0.30208 22.6304-22.6304 22.77888-59.136 0.30208-81.60768l-135.00928-135.0144 134.784-134.784c22.62528-22.62528 22.77888-59.13088 0.30208-81.60768l-0.45568-0.45056c-22.47168-22.4768-58.97728-22.32832-81.60768 0.30208l-134.784 134.784L377.1392 294.4768c-22.4768-22.4768-58.9824-22.32832-81.60768 0.30208-22.6304 22.62528-22.77888 59.13088-0.30208 81.60768L430.6944 511.85152l-134.784 134.784c-22.6304 22.62528-22.77888 59.13088-0.30208 81.60768l0.45056 0.45056c22.4768 22.4768 58.9824 22.32832 81.60768-0.30208l134.784-134.784 134.9376 134.9376zM174.62272 173.87008c186.44992-186.44992 489.20576-186.14784 675.3536 0 186.44992 186.44992 186.14784 489.20576 0 675.3536-186.44992 186.44992-489.20064 186.14784-675.3536 0-186.5216-186.52672-186.14784-489.20576 0-675.3536z"
              fill="#2c2c2c"
            />
          </svg>
          <circle v-else-if="isCircleNode(node)" :r="nodeCircleRadius(node)" />
          <rect
            v-else
            :x="-nodeWidth(node) / 2"
            :y="-nodeHeight(node) / 2"
            :width="nodeWidth(node)"
            :height="nodeHeight(node)"
            :rx="nodeCornerRadius(node)"
          />
          <text
            v-if="!isSvgOperationNode(node)"
            text-anchor="middle"
            dy="4"
            :class="{
              'gate-label': node.kind === 'operation',
              'value-label': isValueNode(node),
            }"
          >{{ displayNodeLabel(node) }}</text>
          <text v-if="node.badge || warningNodeIds.has(nodeReferenceId(node))" text-anchor="middle" dy="37" class="node-badge">
            {{ warningNodeIds.has(nodeReferenceId(node)) ? 'WARNING' : node.badge }}
          </text>
        </g>
        </g>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as d3 from 'd3'
import type { ConstraintExpressionDto, ConstraintGraphDto, ConstraintRenderMode, GraphDiagnostic, SourceGraphDto } from '@/types/partialDebugging'

interface DisplayNode {
  id: string
  label: string
  kind: string
  role?: string
  status?: string
  badge?: string
  constraintIndex?: number
  referenceId?: string
}
interface DisplayEdge {
  id: string
  source: string
  target: string
  kind: string
  label?: string
}

const props = defineProps<{
  graphKind: 'source' | 'constraint'
  sourceGraph?: SourceGraphDto | null
  constraintGraph?: ConstraintGraphDto | null
  renderMode?: ConstraintRenderMode
  selectedNodeId?: string | null
  hoveredNodeId?: string | null
  diagnostics?: GraphDiagnostic[]
  linkedNodeIds?: Set<string>
}>()

defineEmits<{ select: [nodeId: string]; hover: [nodeId: string | null] }>()

const svgRef = ref<SVGSVGElement | null>(null)
const viewportRef = ref<SVGGElement | null>(null)
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null
let zoomTarget: SVGSVGElement | null = null

const initializeZoom = () => {
  if (!svgRef.value || !viewportRef.value) return
  zoomTarget = svgRef.value
  const svg = d3.select(svgRef.value)
  zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.2, 5])
    .on('zoom', event => {
      d3.select(viewportRef.value).attr('transform', event.transform.toString())
    })
  svg.call(zoomBehavior)
}

onMounted(() => nextTick(initializeZoom))
onBeforeUnmount(() => {
  if (svgRef.value) d3.select(svgRef.value).on('.zoom', null)
})

const hiddenWarningIds = computed(() => new Set((props.diagnostics ?? []).flatMap(diagnostic => diagnostic.nodeIds)))
const warningNodeIds = computed(() => {
  const ids = new Set(hiddenWarningIds.value)
  if (props.graphKind === 'source') {
    for (const id of hiddenWarningIds.value) (props.sourceGraph?.adjacency[id] ?? []).forEach(neighbor => ids.add(neighbor))
  }
  return ids
})
const linkedNodeIds = computed(() => props.linkedNodeIds ?? new Set<string>())
const sourceTemplateName = computed(() => props.sourceGraph?.nodes.find(node => node.kind === 'component-group' && node.componentPath === 'main')?.templateName ?? 'Selected template')

function shortConstraintSignalName(name: string) {
  return name.split('.').pop() ?? name
}

const nodeReferenceId = (node: DisplayNode) => node.referenceId ?? node.id

const relevantSourceIds = computed(() => {
  const graph = props.sourceGraph
  if (!graph) return new Set<string>()
  const roots = graph.nodes.filter(node =>
    node.kind === 'assignment' ||
    node.kind === 'source-constraint' ||
    (node.kind === 'signal' && (node.role === 'output' || node.role === 'mock-output'))
  ).map(node => node.id)
  const incoming = new Map<string, string[]>()
  for (const edge of graph.edges) (incoming.get(edge.target) ?? incoming.set(edge.target, []).get(edge.target)!).push(edge.source)
  const relevant = new Set(roots)
  const queue = [...roots]
  while (queue.length) {
    const current = queue.shift()!
    for (const predecessor of incoming.get(current) ?? []) {
      if (relevant.has(predecessor)) continue
      relevant.add(predecessor)
      queue.push(predecessor)
    }
  }
  for (const edge of graph.edges) {
    if (edge.source.startsWith('assignment:') && relevant.has(edge.source)) relevant.add(edge.target)
  }
  return relevant
})

function operationLabel(operation?: string, fallback = '') {
  if (operation === 'mul') return 'x'
  if (operation === 'add') return '+'
  if (operation === 'sub') return '-'
  if (operation === 'div') return '/'
  if (operation === 'pow') return '^'
  return fallback
}

const constraintDisplay = computed(() => {
  const graph = props.constraintGraph
  const nodes: DisplayNode[] = []
  const edges: DisplayEdge[] = []
  if (!graph) return { nodes, edges }
  const signalById = new Map(graph.signals.map(signal => [signal.signalId, signal]))

  const addExpression = (
    expression: ConstraintExpressionDto,
    constraintId: string,
    constraintIndex: number,
    path: string,
    signalRole: 'input' | 'output' = 'input',
  ): string => {
    const id = `${constraintId}:expression:${path}`
    if (expression.kind === 'signal') {
      const signal = signalById.get(expression.signalId)
      nodes.push({
        id,
        referenceId: signal?.id,
        label: shortConstraintSignalName(signal?.qualifiedName ?? `s${expression.signalId}`),
        kind: 'signal',
        role: signalRole,
        status: signal?.status,
        constraintIndex,
      })
      return id
    }
    if (expression.kind === 'constant') {
      nodes.push({ id, label: expression.value, kind: 'constant', constraintIndex })
      return id
    }
    nodes.push({
      id,
      label: expression.kind === 'mul' ? 'x' : '+',
      kind: 'operation',
      role: 'constraint-expression',
      constraintIndex,
    })
    expression.operands.forEach((operand, operandIndex) => {
      const operandId = addExpression(operand, constraintId, constraintIndex, `${path}:${operandIndex}`)
      edges.push({ id: `${id}:operand:${operandIndex}`, source: operandId, target: id, kind: 'data' })
    })
    return id
  }

  for (const constraint of graph.constraints) {
    const equation = constraint.equation
    const rightRoot = addExpression(equation.right, constraint.id, constraint.index, 'right')
    const leftRoot = addExpression(
      equation.left,
      constraint.id,
      constraint.index,
      'left',
      equation.isolatedSignalId === undefined ? 'input' : 'output',
    )
    const rightNode = nodes.find(node => node.id === rightRoot)
    if (rightNode?.kind === 'operation') rightNode.referenceId = constraint.id
    edges.push({
      id: `${constraint.id}:equality`,
      source: equation.isolatedSignalId === undefined ? leftRoot : rightRoot,
      target: equation.isolatedSignalId === undefined ? rightRoot : leftRoot,
      kind: 'constraint-equality',
      label: '=',
    })
  }
  return { nodes, edges }
})

const allNodes = computed<DisplayNode[]>(() => {
  if (props.graphKind === 'source') {
    return (props.sourceGraph?.nodes ?? [])
      .filter(node => relevantSourceIds.value.has(node.id) && node.kind !== 'component-group' && node.kind !== 'assignment')
      .map(node => ({
        id: node.id,
        label: node.kind === 'signal'
          ? node.localName ?? node.label
          : node.kind === 'operation' ? operationLabel(node.operation, node.label) : node.label,
        kind: node.kind,
        role: node.role,
        status: node.mocked || node.role?.startsWith('mock-') ? 'mocked' : undefined,
        badge: node.role?.startsWith('mock-') ? 'MOCK' : undefined,
      }))
  }
  return constraintDisplay.value.nodes
})

const allEdges = computed<DisplayEdge[]>(() => {
  if (props.graphKind === 'source') {
    const graph = props.sourceGraph
    if (!graph) return []
    const assignmentIds = new Set(graph.nodes.filter(node => node.kind === 'assignment').map(node => node.id))
    const direct = graph.edges
      .filter(edge => !assignmentIds.has(edge.source) && !assignmentIds.has(edge.target))
      .map(edge => ({ id: edge.id, source: edge.source, target: edge.target, kind: edge.kind, label: edge.operator }))
    for (const assignment of graph.nodes.filter(node => node.kind === 'assignment')) {
      const incoming = graph.edges.find(edge => edge.target === assignment.id)
      const outgoing = graph.edges.find(edge => edge.source === assignment.id)
      if (!incoming || !outgoing) continue
      direct.push({
        id: `collapsed:${assignment.id}`,
        source: incoming.source,
        target: outgoing.target,
        kind: assignment.generatesConstraint ? 'constrained-assignment' : 'witness-assignment',
        label: assignment.operator,
      })
    }
    return direct.filter(edge => relevantSourceIds.value.has(edge.source) && relevantSourceIds.value.has(edge.target))
  }
  return constraintDisplay.value.edges
})

const visibleNodes = computed(() => allNodes.value)
const visibleNodeIds = computed(() => new Set(visibleNodes.value.map(node => node.id)))
const visibleNodeById = computed(() => new Map(visibleNodes.value.map(node => [node.id, node])))
const visibleEdges = computed(() => allEdges.value.filter(edge => visibleNodeIds.value.has(edge.source) && visibleNodeIds.value.has(edge.target)))
const outputNodeIds = computed(() => new Set(visibleNodes.value
  .filter(node => node.kind === 'signal' && (node.role === 'output' || node.role === 'mock-output'))
  .map(node => node.id)))
const outputOperatorEdges = computed(() => props.graphKind === 'source'
  ? visibleEdges.value.filter(edge => edge.label && outputNodeIds.value.has(edge.target))
  : visibleEdges.value.filter(edge => edge.kind === 'constraint-equality'))
const outputOperatorEdgeIds = computed(() => new Set(outputOperatorEdges.value.map(edge => edge.id)))
const labeledEdges = computed(() => visibleEdges.value
  .filter(edge => edge.label && !outputOperatorEdgeIds.value.has(edge.id))
  .slice(0, 120))

const sourceLayout = computed(() => {
  const map = new Map<string, { x: number; y: number }>()
  const inputX = 100
  const firstOperationX = 380
  const operationColumnGap = 220
  const inputRowGap = 160
  const operationRowGap = 110
  const connectedNodeGap = 120
  const outputGap = 220
  const inputs = visibleNodes.value.filter(node => node.kind === 'signal' && (node.role === 'input' || node.role === 'mock-input'))
  const outputs = visibleNodes.value.filter(node => node.kind === 'signal' && (node.role === 'output' || node.role === 'mock-output'))
  const operations = visibleNodes.value.filter(node => node.kind === 'operation' || node.kind === 'source-constraint')
  const constants = visibleNodes.value.filter(node => node.kind === 'constant')
  const intermediates = visibleNodes.value.filter(node => node.kind === 'signal' && !inputs.includes(node) && !outputs.includes(node))
  inputs.forEach((node, index) => map.set(node.id, { x: inputX, y: 110 + index * inputRowGap }))

  const operationIds = new Set(operations.map(node => node.id))
  const depthCache = new Map<string, number>()
  const operationDepth = (id: string, visiting = new Set<string>()): number => {
    if (depthCache.has(id)) return depthCache.get(id)!
    if (visiting.has(id)) return 0
    visiting.add(id)
    const parentOperations = visibleEdges.value.filter(edge => edge.target === id && operationIds.has(edge.source)).map(edge => edge.source)
    const depth = parentOperations.length ? Math.max(...parentOperations.map(parent => operationDepth(parent, visiting))) + 1 : 0
    depthCache.set(id, depth)
    return depth
  }
  operations.forEach(node => operationDepth(node.id))
  const maxDepth = Math.max(0, ...depthCache.values())
  const occupiedByDepth = new Map<number, number[]>()
  operations.slice().sort((left, right) => operationDepth(left.id) - operationDepth(right.id)).forEach((node, index) => {
    const depth = operationDepth(node.id)
    const predecessorPositions = visibleEdges.value
      .filter(edge => edge.target === node.id && edge.kind !== 'constraint-relation')
      .map(edge => map.get(edge.source))
      .filter((position): position is { x: number; y: number } => Boolean(position))
    let y = predecessorPositions.length ? predecessorPositions.reduce((sum, position) => sum + position.y, 0) / predecessorPositions.length : 110 + index * operationRowGap
    const occupied = occupiedByDepth.get(depth) ?? []
    while (occupied.some(value => Math.abs(value - y) < 90)) y += operationRowGap
    occupied.push(y); occupiedByDepth.set(depth, occupied)
    map.set(node.id, { x: firstOperationX + depth * operationColumnGap, y })
  })

  constants.forEach((node, index) => {
    const consumer = visibleEdges.value.find(edge => edge.source === node.id)
    const target = consumer ? map.get(consumer.target) : undefined
    map.set(node.id, { x: (target?.x ?? firstOperationX) - connectedNodeGap, y: (target?.y ?? 110 + index * operationRowGap) + 60 })
  })
  intermediates.forEach((node, index) => {
    const producer = visibleEdges.value.find(edge => edge.target === node.id)
    const source = producer ? map.get(producer.source) : undefined
    map.set(node.id, { x: (source?.x ?? firstOperationX) + connectedNodeGap, y: source?.y ?? 110 + index * operationRowGap })
  })
  const outputX = firstOperationX + maxDepth * operationColumnGap + outputGap
  outputs.forEach((node, index) => {
    const producer = visibleEdges.value.find(edge => edge.target === node.id)
    const source = producer ? map.get(producer.source) : undefined
    map.set(node.id, { x: outputX, y: source?.y ?? 110 + index * inputRowGap })
  })
  return { positions: map, maxDepth, outputX }
})

const positions = computed(() => {
  if (props.graphKind === 'source') return sourceLayout.value.positions
  const map = new Map<string, { x: number; y: number }>()
  const constraintIndices = [...new Set(visibleNodes.value.map(node => node.constraintIndex).filter((index): index is number => index !== undefined))]
  let nextY = 100
  for (const constraintIndex of constraintIndices) {
    const nodes = visibleNodes.value.filter(node => node.constraintIndex === constraintIndex)
    const nodeIds = new Set(nodes.map(node => node.id))
    const edges = visibleEdges.value.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    const incoming = new Map<string, string[]>()
    for (const edge of edges) (incoming.get(edge.target) ?? incoming.set(edge.target, []).get(edge.target)!).push(edge.source)
    const depthCache = new Map<string, number>()
    const depth = (nodeId: string, visiting = new Set<string>()): number => {
      if (depthCache.has(nodeId)) return depthCache.get(nodeId)!
      if (visiting.has(nodeId)) return 0
      visiting.add(nodeId)
      const predecessors = incoming.get(nodeId) ?? []
      const value = predecessors.length ? Math.max(...predecessors.map(id => depth(id, visiting))) + 1 : 0
      depthCache.set(nodeId, value)
      return value
    }
    nodes.forEach(node => depth(node.id))
    const leaves = nodes.filter(node => depth(node.id) === 0)
    leaves.forEach((node, index) => map.set(node.id, { x: 110, y: nextY + index * 110 }))
    const maxDepth = Math.max(0, ...nodes.map(node => depth(node.id)))
    for (let column = 1; column <= maxDepth; column++) {
      const occupied: number[] = []
      for (const node of nodes.filter(candidate => depth(candidate.id) === column)) {
        const predecessors = (incoming.get(node.id) ?? []).map(id => map.get(id)).filter((position): position is { x: number; y: number } => Boolean(position))
        let y = predecessors.length ? predecessors.reduce((sum, position) => sum + position.y, 0) / predecessors.length : nextY
        while (occupied.some(value => Math.abs(value - y) < 80)) y += 90
        occupied.push(y)
        map.set(node.id, { x: 110 + column * 190, y })
      }
    }
    const bottom = Math.max(nextY, ...nodes.map(node => map.get(node.id)?.y ?? nextY))
    nextY = bottom + 150
  }
  return map
})

const canvasWidth = computed(() => props.graphKind === 'source'
  ? Math.max(760, sourceLayout.value.outputX + 130)
  : Math.max(760, ...Array.from(positions.value.values()).map(position => position.x + 130)))
const canvasHeight = computed(() => Math.max(420, ...Array.from(positions.value.values()).map(position => position.y + 90)))
const sourceBoundary = computed(() => ({ x: 190, y: 35, width: Math.max(390, sourceLayout.value.outputX - 280), height: canvasHeight.value - 70 }))
watch([canvasWidth, canvasHeight, () => visibleNodes.value.length], async () => {
  await nextTick()
  if (!svgRef.value) return
  if (!zoomBehavior || zoomTarget !== svgRef.value) {
    initializeZoom()
    return
  }
  d3.select(svgRef.value).call(zoomBehavior.transform, d3.zoomIdentity)
}, { flush: 'post' })
const valueLabelLimit = 12
const isValueNode = (node: DisplayNode) => node.kind === 'constant' || (
  node.kind === 'signal' && ['input', 'mock-input', 'output', 'mock-output'].includes(node.role ?? '')
)
const valueNeedsRectangle = (node: DisplayNode) => isValueNode(node) && node.label.length > 4
const displayNodeLabel = (node: DisplayNode) => truncate(
  node.label,
  node.kind === 'constraint-term' ? 38 : node.kind === 'constraint' ? 31 : isValueNode(node) ? valueLabelLimit : 26,
)
const nodeWidth = (node: DisplayNode) => {
  if (node.kind === 'constraint') return 320
  if (node.kind === 'constraint-term') return Math.min(330, Math.max(90, displayNodeLabel(node).length * 8.5 + 30))
  if (valueNeedsRectangle(node)) return Math.min(160, Math.max(76, displayNodeLabel(node).length * 9 + 28))
  return Math.min(260, Math.max(82, node.label.length * 7 + 28))
}
const nodeHeight = (node: DisplayNode) => valueNeedsRectangle(node) || node.kind === 'constraint-term' ? 48 : 40
const nodeCornerRadius = (node: DisplayNode) => node.kind === 'constraint' ? 8 : valueNeedsRectangle(node) || node.kind === 'constraint-term' ? 24 : 18
const isSvgOperationNode = (node: DisplayNode) => node.kind === 'operation' && (node.label === '+' || node.label === 'x')
const isCircleNode = (node: DisplayNode) => node.kind === 'operation' || (isValueNode(node) && !valueNeedsRectangle(node))
const nodeCircleRadius = (node: DisplayNode) => {
  if (node.kind === 'operation') return 25
  return 24
}
const truncate = (label: string, max: number) => label.length > max ? `${label.slice(0, max - 3)}...` : label
const edgePoint = (edge: DisplayEdge, side: 'source' | 'target') => {
  const nodeId = side === 'source' ? edge.source : edge.target
  const oppositeId = side === 'source' ? edge.target : edge.source
  const center = positions.value.get(nodeId) ?? { x: 0, y: 0 }
  const opposite = positions.value.get(oppositeId) ?? center
  const node = visibleNodeById.value.get(nodeId)
  if (!node) return center

  const dx = opposite.x - center.x
  const dy = opposite.y - center.y
  if (dx === 0 && dy === 0) return center

  if (isSvgOperationNode(node) || isCircleNode(node)) {
    const radius = isSvgOperationNode(node) ? 21 : nodeCircleRadius(node)
    const scale = radius / Math.hypot(dx, dy)
    return { x: center.x + dx * scale, y: center.y + dy * scale }
  }

  const halfWidth = nodeWidth(node) / 2
  const halfHeight = nodeHeight(node) / 2
  const horizontalScale = dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx)
  const verticalScale = dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy)
  const scale = Math.min(horizontalScale, verticalScale)
  return { x: center.x + dx * scale, y: center.y + dy * scale }
}
const edgeMidpoint = (edge: DisplayEdge) => {
  const source = edgePoint(edge, 'source'); const target = edgePoint(edge, 'target')
  return { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 }
}
const edgeLabelPosition = (edge: DisplayEdge) => {
  const midpoint = edgeMidpoint(edge)
  return { x: midpoint.x, y: midpoint.y - 7 }
}
const outputOperatorLabel = (operator?: string) => {
  if (operator === '<==') return '==>'
  if (operator === '<--') return '-->'
  return operator ?? '='
}
</script>

<style scoped>
.graph-shell {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background: white;
  overflow: hidden;
}

.graph-scroll {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #f8fafc;
}

.graph-canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}

.graph-canvas:active {
  cursor: grabbing;
}

.figure-title {
  position: absolute;
  top: 8px;
  left: 10px;
  z-index: 2;
  padding: 3px 9px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.92);
  color: #40574f;
  pointer-events: none;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .02em;
}

.input-legend-dot {
  background: rgba(37, 99, 235, 0.14);
  border: 1px solid #2563eb;
}

.output-legend-dot {
  background: rgba(22, 163, 74, 0.14);
  border: 1px solid #16a34a;
}

.constant-legend-dot {
  background: #f8f1df;
  border: 1px solid #aa823f;
}

.template-boundary rect {
  fill: rgba(239, 247, 243, 0.22);
  stroke: #6f887e;
  stroke-width: 1.5;
  stroke-dasharray: 8 6;
}

.template-boundary text {
  fill: #536d63;
  font-size: 11px;
  font-weight: 700;
}

.graph-edge {
  stroke: #6b7280;
  stroke-width: 1.35;
  opacity: .75;
}

.graph-edge.constraint-relation {
  stroke-dasharray: 4 3;
}

.graph-edge.port-A {
  stroke: #3077a8;
}

.graph-edge.port-B {
  stroke: #aa6c2e;
}

.graph-edge.port-C {
  stroke: #368162;
}

.graph-edge.witness-assignment {
  stroke: #d06b32;
  stroke-dasharray: 6 4;
}

.graph-edge.active {
  stroke: #d26338;
  stroke-width: 2.7;
  opacity: 1;
}

.assignment-rails line {
  stroke: #2f6553;
  stroke-width: 1.55;
}

.assignment-rails.active line {
  stroke: #d26338;
  stroke-width: 2.5;
}

.edge-label {
  fill: #71817b;
  font-size: 9px;
  text-anchor: middle;
  paint-order: stroke;
  stroke: #fff;
  stroke-width: 3px;
}

.output-operator rect {
  fill: #fff;
  stroke: #64748b;
  stroke-width: 1.5;
}

.output-operator text {
  fill: #1f2937;
  font-size: 18px;
  font-weight: 700;
  pointer-events: none;
}

.graph-node {
  cursor: pointer;
  outline: none;
}

.graph-node rect,
.graph-node circle {
  fill: #fff;
  stroke: #8ea39b;
  stroke-width: 1.3;
}

.graph-node text {
  fill: #233c34;
  font-size: 10px;
  pointer-events: none;
}

.graph-node.operation circle {
  fill: #fffdf6;
  stroke: #496f60;
  stroke-width: 2;
}

.graph-node.operation .gate-label {
  font-size: 22px;
  font-weight: 700;
}

.graph-node.constant circle,
.graph-node.constant rect {
  fill: #f8f1df;
  stroke: #aa823f;
  stroke-width: 2.5;
}

.graph-node.input circle,
.graph-node.input rect,
.graph-node.mock-input circle,
.graph-node.mock-input rect {
  fill: rgba(37, 99, 235, 0.14);
  stroke: #2563eb;
  stroke-width: 2.5;
}

.graph-node.output circle,
.graph-node.output rect,
.graph-node.mock-output circle,
.graph-node.mock-output rect {
  fill: rgba(22, 163, 74, 0.14);
  stroke: #16a34a;
  stroke-width: 2.5;
}

.graph-node .value-label {
  fill: #111827;
  font-size: 18px;
  font-weight: 600;
}

.graph-node.constraint rect {
  fill: #f5f1e8;
  stroke: #9a7847;
}

.graph-node.constraint-term rect {
  fill: rgba(255, 255, 255, 0.9);
  stroke-width: 2.5;
}

.graph-node.constraint-A rect {
  stroke: #3077a8;
}

.graph-node.constraint-B rect {
  stroke: #aa6c2e;
}

.graph-node.constraint-C rect {
  stroke: #368162;
}

.graph-node.constraint-term text {
  fill: #111827;
  font-size: 16px;
  font-weight: 600;
}

.graph-node.source-constraint rect {
  fill: #fbf0e8;
  stroke: #bf7246;
}

.graph-node.mocked:not(.input):not(.mock-input):not(.output):not(.mock-output) rect {
  fill: #eaf3fb;
  stroke: #3883b7;
}

.graph-node.substituted rect {
  fill: #fff6ce;
  stroke: #b99120;
  stroke-dasharray: 4 2;
  opacity: .82;
}

.graph-node.unused-or-unconstrained rect,
.graph-node.warning rect,
.graph-node.warning circle {
  stroke: #c84d3d;
  stroke-dasharray: 5 3;
}

.graph-node.selected rect,
.graph-node.selected circle {
  stroke: #d0562c;
  stroke-width: 3;
}

.graph-node.linked rect,
.graph-node.linked circle {
  stroke: #17806b;
  stroke-width: 2.5;
}

.node-badge {
  fill: #9a6a25 !important;
  font-size: 8px !important;
  font-weight: 800 !important;
  letter-spacing: .06em;
}

.graph-empty {
  flex: 1;
  display: grid;
  place-items: center;
  color: #85958f;
  font-size: 12px;
}
</style>

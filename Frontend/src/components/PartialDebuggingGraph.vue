<template>
  <div class="graph-shell" @mouseleave="clearGraphHover">

    <div v-if="visibleNodes.length === 0" class="graph-empty">No nodes are available for this template.</div>
    <div v-else class="graph-scroll">
      <span class="figure-title">{{ graphKind === 'source' ? 'Raw Code Graph' : 'Constraint Graph' }}</span>
      <div
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
          <span class="intermediate-legend-dot w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"></span>
          <span class="text-gray-600 text-xs">Intermediate signal</span>
        </div>
        <div v-if="graphKind === 'source'" class="flex items-center gap-2">
          <span class="child-template-legend-box w-4 h-2.5 rounded-sm inline-block flex-shrink-0"></span>
          <span class="text-gray-600 text-xs">Child template</span>
        </div>
        <div v-else class="flex items-center gap-2">
          <span class="mock-boundary-legend-box w-4 h-2.5 rounded-sm inline-block flex-shrink-0"></span>
          <span class="text-gray-600 text-xs">Mock-supplied output</span>
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
          <g
            v-for="edge in visibleEdges"
            :key="edge.id"
            class="graph-edge-group"
            @mouseenter="hoveredEdgeId = edge.id"
            @mouseleave="hoveredEdgeId = null"
          >
            <path :d="edgePath(edge)" class="graph-edge-hit" />
            <path
              :d="edgePath(edge)"
              fill="none"
              :class="['graph-edge', edge.kind, { active: hoveredEdgeId === edge.id }]"
            />
          </g>
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
            :class="['output-operator', { active: hoveredEdgeId === edge.id }]"
            @mouseenter="hoveredEdgeId = edge.id"
            @mouseleave="hoveredEdgeId = null"
          >
            <rect x="-20" y="-11" width="40" height="22" rx="10" />
            <text text-anchor="middle" dy="4">{{ outputOperatorLabel(edge.label) }}</text>
          </g>
        </g>

        <g
          v-for="node in visibleNodes"
          :key="node.id"
          :transform="`translate(${positions.get(node.id)?.x ?? 0},${positions.get(node.id)?.y ?? 0})`"
          :class="['graph-node', node.kind, node.status, node.role, { selected: selectedNodeId === nodeReferenceId(node) || mirroredNodeIds.has(nodeReferenceId(node)), linked: linkedNodeIds.has(nodeReferenceId(node)) && !mirroredNodeIds.has(nodeReferenceId(node)), warning: warningNodeIds.has(nodeReferenceId(node)) }]"
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
            v-if="node.kind === 'component'"
            text-anchor="middle"
            dy="-3"
            class="component-instance-label"
          >{{ node.componentInstanceName ?? node.label }}</text>
          <text
            v-if="node.kind === 'component'"
            text-anchor="middle"
            dy="20"
            class="component-template-label"
          >{{ node.componentTemplateName ?? node.label }}</text>
          <text
            v-if="!isSvgOperationNode(node) && node.kind !== 'component'"
            text-anchor="middle"
            dy="4"
            :style="{ fontSize: `${nodeFontSize(node)}px` }"
            :class="{
              'gate-label': node.kind === 'operation',
              'value-label': isValueNode(node),
              'signal-label': node.kind === 'signal',
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
  componentInstanceName?: string
  componentTemplateName?: string
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
  mirroredNodeIds?: Set<string>
  signalRoleOverrides?: Map<string, string>
}>()

const emit = defineEmits<{ select: [nodeId: string]; hover: [nodeId: string | null] }>()

const hoveredEdgeId = ref<string | null>(null)
const clearGraphHover = () => {
  hoveredEdgeId.value = null
  emit('hover', null)
}

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
const mirroredNodeIds = computed(() => props.mirroredNodeIds ?? new Set<string>())
const sourceTemplateName = computed(() => props.sourceGraph?.nodes.find(node => node.kind === 'component-group' && node.componentPath === 'main')?.templateName ?? 'Selected template')

function shortConstraintSignalName(name: string) {
  return name.startsWith('main.') ? name.slice('main.'.length) : name
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
  const displayIdBySignalNodeId = new Map<string, string>()

  const ensureSignalNode = (signalId: number, constraintIndex: number): string => {
    const signal = signalById.get(signalId)
    const qualifiedName = signal?.qualifiedName ?? `s${signalId}`
    const id = `constraint-signal:${qualifiedName}`
    if (!nodes.some(node => node.id === id)) {
      nodes.push({
        id,
        referenceId: signal?.id,
        label: shortConstraintSignalName(qualifiedName),
        kind: 'signal',
        role: props.signalRoleOverrides?.get(qualifiedName) ?? signal?.role ?? 'intermediate',
        status: signal?.status,
        badge: signal?.mockSupplied ? 'MOCK OUTPUT' : undefined,
        constraintIndex,
      })
    }
    if (signal) displayIdBySignalNodeId.set(signal.id, id)
    return id
  }

  const addExpression = (
    expression: ConstraintExpressionDto,
    constraintId: string,
    constraintIndex: number,
    path: string,
  ): string => {
    if (expression.kind === 'signal') return ensureSignalNode(expression.signalId, constraintIndex)
    const id = `${constraintId}:expression:${path}`
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
    const leftRoot = addExpression(equation.left, constraint.id, constraint.index, 'left')
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

  for (const boundary of graph.mockBoundaries ?? []) {
    const output = graph.signals.find(signal => signal.id === boundary.outputSignalId)
    if (!output) continue
    const outputNodeId = displayIdBySignalNodeId.get(output.id) ?? ensureSignalNode(output.signalId, Number.MAX_SAFE_INTEGER)
    nodes.push({ id: boundary.id, label: 'mock', kind: 'mock-boundary', role: 'mock-boundary' })
    edges.push({ id: `${boundary.id}:edge`, source: boundary.id, target: outputNodeId, kind: 'mock-supplied' })
  }
  return { nodes, edges }
})

const allNodes = computed<DisplayNode[]>(() => {
  if (props.graphKind === 'source') {
    return (props.sourceGraph?.nodes ?? [])
      .filter(node => relevantSourceIds.value.has(node.id) && node.kind !== 'assignment' && node.kind !== 'source-constraint' && (node.kind !== 'component-group' || node.componentPath !== 'main'))
      .map(node => ({
        id: node.id,
        label: node.kind === 'signal'
          ? node.localName ?? node.label
          : node.kind === 'component-group' ? node.templateName ?? node.label
          : node.kind === 'operation' ? operationLabel(node.operation, node.label) : node.label,
        kind: node.kind === 'component-group' ? 'component' : node.kind,
        componentInstanceName: node.kind === 'component-group' ? node.localName ?? node.componentPath?.split('.').pop() : undefined,
        componentTemplateName: node.kind === 'component-group' ? node.templateName ?? node.label : undefined,
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
    const relationIds = new Set(graph.nodes.filter(node => node.kind === 'source-constraint').map(node => node.id))
    const collapsedNodeIds = new Set([...assignmentIds, ...relationIds])
    const direct = graph.edges
      .filter(edge => !collapsedNodeIds.has(edge.source) && !collapsedNodeIds.has(edge.target))
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
    for (const relation of graph.nodes.filter(node => node.kind === 'source-constraint')) {
      const operands = graph.edges.filter(edge => edge.target === relation.id).map(edge => edge.source)
      if (operands.length < 2) continue
      direct.push({
        id: `collapsed:${relation.id}`,
        source: operands[0],
        target: operands[1],
        kind: 'constraint-relation',
        label: '===',
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
const outputOperatorEdges = computed(() => props.graphKind === 'source'
  ? visibleEdges.value.filter(edge => ['===', '==>', '-->'].includes(outputOperatorLabel(edge.label)))
  : visibleEdges.value.filter(edge => edge.kind === 'constraint-equality'))
const outputOperatorEdgeIds = computed(() => new Set(outputOperatorEdges.value.map(edge => edge.id)))
const labeledEdges = computed(() => visibleEdges.value
  .filter(edge => edge.label && !outputOperatorEdgeIds.value.has(edge.id))
  .slice(0, 120))

const sourceLayout = computed(() => {
  const map = new Map<string, { x: number; y: number }>()
  const inputX = 140
  const firstOperationX = 430
  const operationColumnGap = 250
  const inputRowGap = 160
  const operationRowGap = 120
  const edgeGap = 76
  const inputs = visibleNodes.value.filter(node => node.kind === 'signal' && (node.role === 'input' || node.role === 'mock-input'))
  const outputs = visibleNodes.value.filter(node => node.kind === 'signal' && (node.role === 'output' || node.role === 'mock-output'))
  const operations = visibleNodes.value.filter(node => node.kind === 'operation' || node.kind === 'source-constraint')
  const components = visibleNodes.value.filter(node => node.kind === 'component')
  const constants = visibleNodes.value.filter(node => node.kind === 'constant')
  const componentInputPortIds = new Set(visibleEdges.value.filter(edge => edge.kind === 'component-input').map(edge => edge.source))
  const componentOutputPortIds = new Set(visibleEdges.value.filter(edge => edge.kind === 'component-output').map(edge => edge.target))
  const componentPortIds = new Set([...componentInputPortIds, ...componentOutputPortIds])
  const intermediates = visibleNodes.value.filter(node => node.kind === 'signal' && !inputs.includes(node) && !outputs.includes(node) && !componentPortIds.has(node.id))
  const nodeById = new Map(visibleNodes.value.map(node => [node.id, node]))

  const placeWithoutOverlap = (node: DisplayNode, x: number, preferredY: number) => {
    let y = preferredY
    const collides = () => [...map.entries()].some(([otherId, position]) => {
      const other = nodeById.get(otherId)
      if (!other) return false
      const horizontalClearance = (nodeVisualWidth(node) + nodeVisualWidth(other)) / 2 + 24
      const verticalClearance = (nodeHeight(node) + nodeHeight(other)) / 2 + 28
      return Math.abs(position.x - x) < horizontalClearance && Math.abs(position.y - y) < verticalClearance
    })
    while (collides()) y += Math.max(82, nodeHeight(node) + 34)
    map.set(node.id, { x, y })
  }

  inputs.forEach((node, index) => placeWithoutOverlap(node, inputX, 110 + index * inputRowGap))

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
  operations.slice().sort((left, right) => operationDepth(left.id) - operationDepth(right.id)).forEach((node, index) => {
    const depth = operationDepth(node.id)
    const predecessorPositions = visibleEdges.value
      .filter(edge => edge.target === node.id && edge.kind !== 'constraint-relation')
      .map(edge => map.get(edge.source))
      .filter((position): position is { x: number; y: number } => Boolean(position))
    const y = predecessorPositions.length
      ? predecessorPositions.reduce((sum, position) => sum + position.y, 0) / predecessorPositions.length
      : 110 + index * operationRowGap
    placeWithoutOverlap(node, firstOperationX + depth * operationColumnGap, y)
  })

  components.forEach((component, componentIndex) => {
    const inputEdges = visibleEdges.value.filter(edge => edge.kind === 'component-input' && edge.target === component.id)
    const outputEdges = visibleEdges.value.filter(edge => edge.kind === 'component-output' && edge.source === component.id)
    const inputPositions: Array<{ x: number; y: number; node: DisplayNode }> = []
    inputEdges.forEach((edge, index) => {
      const port = nodeById.get(edge.source)
      if (!port) return
      const upstreamEdge = visibleEdges.value.find(candidate => candidate.target === port.id && candidate.kind !== 'component-output')
      const upstreamNode = upstreamEdge ? nodeById.get(upstreamEdge.source) : undefined
      const upstream = upstreamEdge ? map.get(upstreamEdge.source) : undefined
      const x = upstream && upstreamNode
        ? upstream.x + nodeVisualWidth(upstreamNode) / 2 + edgeGap + nodeVisualWidth(port) / 2
        : firstOperationX - 170
      const y = upstream?.y ?? 110 + (componentIndex + index) * inputRowGap
      placeWithoutOverlap(port, x, y)
      inputPositions.push({ x: map.get(port.id)?.x ?? x, y: map.get(port.id)?.y ?? y, node: port })
    })
    const componentX = inputPositions.length
      ? Math.max(...inputPositions.map(position => position.x + nodeVisualWidth(position.node) / 2)) + edgeGap + nodeVisualWidth(component) / 2
      : firstOperationX + componentIndex * operationColumnGap
    const componentY = inputPositions.length
      ? inputPositions.reduce((sum, position) => sum + position.y, 0) / inputPositions.length
      : 110 + componentIndex * inputRowGap
    placeWithoutOverlap(component, componentX, componentY)
    const componentPosition = map.get(component.id)!
    outputEdges.forEach((edge, index) => {
      const port = nodeById.get(edge.target)
      if (!port) return
      const x = componentPosition.x + nodeVisualWidth(component) / 2 + edgeGap + nodeVisualWidth(port) / 2
      const y = componentPosition.y + (index - (outputEdges.length - 1) / 2) * 76
      placeWithoutOverlap(port, x, y)
    })
  })

  constants.forEach((node, index) => {
    const consumer = visibleEdges.value.find(edge => edge.source === node.id)
    const targetNode = consumer ? nodeById.get(consumer.target) : undefined
    const target = consumer ? map.get(consumer.target) : undefined
    const x = target && targetNode
      ? target.x - nodeVisualWidth(targetNode) / 2 - edgeGap - nodeVisualWidth(node) / 2
      : firstOperationX - edgeGap - nodeVisualWidth(node) / 2
    placeWithoutOverlap(node, x, (target?.y ?? 110 + index * operationRowGap) + 68)
  })

  const pendingIntermediates = [...intermediates]
  for (let pass = 0; pass <= intermediates.length && pendingIntermediates.length; pass++) {
    for (let index = pendingIntermediates.length - 1; index >= 0; index--) {
      const node = pendingIntermediates[index]
      const producer = visibleEdges.value.find(edge => edge.target === node.id)
      const producerNode = producer ? nodeById.get(producer.source) : undefined
      const producerPosition = producer ? map.get(producer.source) : undefined
      if (!producerPosition || !producerNode) continue
      const x = producerPosition.x + nodeVisualWidth(producerNode) / 2 + edgeGap + nodeVisualWidth(node) / 2
      placeWithoutOverlap(node, x, producerPosition.y)
      pendingIntermediates.splice(index, 1)
    }
  }
  pendingIntermediates.forEach((node, index) => placeWithoutOverlap(node, firstOperationX, 110 + index * operationRowGap))

  outputs.forEach((node, index) => {
    const producer = visibleEdges.value.find(edge => edge.target === node.id)
    const producerNode = producer ? nodeById.get(producer.source) : undefined
    const producerPosition = producer ? map.get(producer.source) : undefined
    const x = producerPosition && producerNode
      ? producerPosition.x + nodeVisualWidth(producerNode) / 2 + edgeGap + nodeVisualWidth(node) / 2
      : firstOperationX + maxDepth * operationColumnGap + 230
    placeWithoutOverlap(node, x, producerPosition?.y ?? 110 + index * inputRowGap)
  })

  const outputX = Math.max(firstOperationX + maxDepth * operationColumnGap + 230, ...outputs.map(node => map.get(node.id)?.x ?? 0))
  return { positions: map, maxDepth, outputX }
})

const positions = computed(() => {
  if (props.graphKind === 'source') return sourceLayout.value.positions
  const map = new Map<string, { x: number; y: number }>()
  const nodes = visibleNodes.value
  const incoming = new Map<string, string[]>()
  for (const edge of visibleEdges.value) {
    const predecessors = incoming.get(edge.target) ?? []
    predecessors.push(edge.source)
    incoming.set(edge.target, predecessors)
  }

  const depthCache = new Map<string, number>()
  const depth = (nodeId: string, visiting = new Set<string>()): number => {
    if (depthCache.has(nodeId)) return depthCache.get(nodeId)!
    if (visiting.has(nodeId)) return 0
    const nextVisiting = new Set(visiting).add(nodeId)
    const predecessors = incoming.get(nodeId) ?? []
    const value = predecessors.length ? Math.max(...predecessors.map(id => depth(id, nextVisiting))) + 1 : 0
    depthCache.set(nodeId, value)
    return value
  }
  nodes.forEach(node => depth(node.id))
  const maxDepth = Math.max(0, ...nodes.map(node => depth(node.id)))
  const columnWidths = Array.from({ length: maxDepth + 1 }, (_, column) =>
    Math.max(48, ...nodes.filter(node => depth(node.id) === column).map(nodeVisualWidth)))
  const columnCenters: number[] = [70 + columnWidths[0] / 2]
  for (let column = 1; column <= maxDepth; column++) {
    columnCenters[column] = columnCenters[column - 1] + columnWidths[column - 1] / 2 + 100 + columnWidths[column] / 2
  }

  const occupiedByColumn = new Map<number, Array<{ y: number; height: number }>>()
  for (let column = 0; column <= maxDepth; column++) {
    const columnNodes = nodes.filter(node => depth(node.id) === column)
    for (const [index, node] of columnNodes.entries()) {
      const predecessors = (incoming.get(node.id) ?? [])
        .map(id => map.get(id))
        .filter((position): position is { x: number; y: number } => Boolean(position))
      let y = predecessors.length
        ? predecessors.reduce((sum, position) => sum + position.y, 0) / predecessors.length
        : 100 + index * 122
      const occupied = occupiedByColumn.get(column) ?? []
      while (occupied.some(item => Math.abs(item.y - y) < (item.height + nodeHeight(node)) / 2 + 38)) {
        y += Math.max(96, nodeHeight(node) + 48)
      }
      occupied.push({ y, height: nodeHeight(node) })
      occupiedByColumn.set(column, occupied)
      map.set(node.id, { x: columnCenters[column], y })
    }
  }
  return map
})

const canvasWidth = computed(() => Math.max(760, ...visibleNodes.value.map(node => {
  const position = positions.value.get(node.id)
  return (position?.x ?? 0) + nodeVisualWidth(node) / 2 + 70
})))
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
function isValueNode(node: DisplayNode) {
  return node.kind === 'constant' || (
    node.kind === 'signal' && ['input', 'mock-input', 'output', 'mock-output'].includes(node.role ?? '')
  )
}
function valueNeedsRectangle(node: DisplayNode) {
  return isValueNode(node) && node.label.length > 4
}
function displayNodeLabel(node: DisplayNode) {
  return truncate(
    node.label,
    node.kind === 'signal' ? 20 : node.kind === 'constraint-term' ? 38 : node.kind === 'constraint' ? 31 : isValueNode(node) ? 20 : 26,
  )
}
function nodeFontSize(node: DisplayNode) {
  const length = displayNodeLabel(node).length
  if (node.kind === 'operation') return 22
  if (node.kind === 'component') return 16
  if (node.kind === 'constraint-term') return length > 20 ? 13 : length > 14 ? 14 : 16
  if (node.kind === 'signal' && !isValueNode(node)) return length > 17 ? 13 : length > 12 ? 14 : 16
  if (isValueNode(node)) return length > 17 ? 14 : length > 12 ? 16 : 18
  return length > 20 ? 11 : 13
}
function nodeWidth(node: DisplayNode) {
  if (node.kind === 'constraint') return 320
  if (node.kind === 'mock-boundary') return 72
  if (node.kind === 'component') return Math.min(250, Math.max(190, displayNodeLabel(node).length * 10 + 56))
  const labelWidth = displayNodeLabel(node).length * nodeFontSize(node) * 0.62
  if (node.kind === 'constraint-term') return Math.min(360, Math.max(96, labelWidth + 34))
  if (node.kind === 'signal' || node.kind === 'constant') return Math.min(270, Math.max(76, labelWidth + 34))
  return Math.min(280, Math.max(82, labelWidth + 30))
}
function nodeHeight(node: DisplayNode) {
  if (node.kind === 'mock-boundary') return 34
  if (node.kind === 'component') return 110
  return node.kind === 'signal' || valueNeedsRectangle(node) || node.kind === 'constraint-term' ? 48 : 40
}
function nodeCornerRadius(node: DisplayNode) {
  if (node.kind === 'component') return 8
  return node.kind === 'constraint' ? 8 : node.kind === 'signal' || valueNeedsRectangle(node) || node.kind === 'constraint-term' ? 24 : 18
}
function isSvgOperationNode(node: DisplayNode) {
  return node.kind === 'operation' && (node.label === '+' || node.label === 'x')
}
function isCircleNode(node: DisplayNode) {
  return node.kind === 'operation' || (isValueNode(node) && !valueNeedsRectangle(node))
}
function nodeCircleRadius(node: DisplayNode) {
  if (node.kind === 'operation') return 25
  return 24
}
function nodeVisualWidth(node: DisplayNode) {
  return isSvgOperationNode(node) || isCircleNode(node) ? nodeCircleRadius(node) * 2 : nodeWidth(node)
}
function truncate(label: string, max: number) {
  return label.length > max ? `${label.slice(0, max - 3)}...` : label
}
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
interface EdgeRoute {
  source: { x: number; y: number }
  target: { x: number; y: number }
  control1?: { x: number; y: number }
  control2?: { x: number; y: number }
}

const routePoint = (route: EdgeRoute, t: number) => {
  if (!route.control1 || !route.control2) {
    return {
      x: route.source.x + (route.target.x - route.source.x) * t,
      y: route.source.y + (route.target.y - route.source.y) * t,
    }
  }
  const inverse = 1 - t
  return {
    x: inverse ** 3 * route.source.x + 3 * inverse ** 2 * t * route.control1.x + 3 * inverse * t ** 2 * route.control2.x + t ** 3 * route.target.x,
    y: inverse ** 3 * route.source.y + 3 * inverse ** 2 * t * route.control1.y + 3 * inverse * t ** 2 * route.control2.y + t ** 3 * route.target.y,
  }
}

const routeIntersectsNode = (edge: DisplayEdge, route: EdgeRoute) => {
  const obstacles = visibleNodes.value.filter(node => node.id !== edge.source && node.id !== edge.target)
  return obstacles.some(node => {
    const center = positions.value.get(node.id)
    if (!center) return false
    const halfWidth = nodeVisualWidth(node) / 2 + 26
    const halfHeight = nodeHeight(node) / 2 + 26
    for (let step = 2; step < 39; step++) {
      const point = routePoint(route, step / 40)
      if (Math.abs(point.x - center.x) <= halfWidth && Math.abs(point.y - center.y) <= halfHeight) return true
    }
    return false
  })
}

const routeStaysInsideCanvas = (route: EdgeRoute) => {
  if (!route.control1 || !route.control2) return true
  const maxX = Math.max(120, ...visibleNodes.value.map(node => {
    const position = positions.value.get(node.id)
    return (position?.x ?? 0) + nodeVisualWidth(node) / 2 + 70
  }))
  const maxY = Math.max(120, ...visibleNodes.value.map(node => {
    const position = positions.value.get(node.id)
    return (position?.y ?? 0) + nodeHeight(node) / 2 + 70
  }))
  for (let step = 0; step <= 40; step++) {
    const point = routePoint(route, step / 40)
    if (point.x < 8 || point.y < 8 || point.x > maxX || point.y > maxY) return false
  }
  return true
}

const buildEdgeRoute = (edge: DisplayEdge): EdgeRoute => {
  const source = edgePoint(edge, 'source')
  const target = edgePoint(edge, 'target')
  const direct = { source, target }
  if (props.graphKind !== 'source' || !routeIntersectsNode(edge, direct)) return direct

  const dx = target.x - source.x
  const dy = target.y - source.y
  const length = Math.hypot(dx, dy)
  if (!length) return direct
  const normal = { x: -dy / length, y: dx / length }
  const offsets = [72, -72, 104, -104, 144, -144, 192, -192, 256, -256]
  for (const offset of offsets) {
    const route: EdgeRoute = {
      source,
      target,
      control1: {
        x: source.x + dx / 3 + normal.x * offset,
        y: source.y + dy / 3 + normal.y * offset,
      },
      control2: {
        x: source.x + dx * 2 / 3 + normal.x * offset,
        y: source.y + dy * 2 / 3 + normal.y * offset,
      },
    }
    if (routeStaysInsideCanvas(route) && !routeIntersectsNode(edge, route)) return route
  }
  return direct
}

const edgeRoutes = computed(() => new Map(visibleEdges.value.map(edge => [edge.id, buildEdgeRoute(edge)])))
const edgeRoute = (edge: DisplayEdge) => edgeRoutes.value.get(edge.id) ?? buildEdgeRoute(edge)
const edgePath = (edge: DisplayEdge) => {
  const route = edgeRoute(edge)
  if (!route.control1 || !route.control2) return `M ${route.source.x} ${route.source.y} L ${route.target.x} ${route.target.y}`
  return `M ${route.source.x} ${route.source.y} C ${route.control1.x} ${route.control1.y}, ${route.control2.x} ${route.control2.y}, ${route.target.x} ${route.target.y}`
}
const edgeMidpoint = (edge: DisplayEdge) => routePoint(edgeRoute(edge), 0.5)
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

.intermediate-legend-dot {
  background: rgba(107, 114, 128, 0.14);
  border: 1px solid #6b7280;
}

.child-template-legend-box {
  background: rgba(255, 255, 255, 0.94);
  border: 2px solid #6b7280;
}

.mock-boundary-legend-box {
  background: #6b7280;
  border: 2px dashed #6b7280;
  opacity: 0.5;
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

.graph-edge-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 14;
  pointer-events: stroke;
}

.graph-edge {
  fill: none;
  pointer-events: none;
  stroke: #6b7280;
  stroke-width: 1.35;
  opacity: .75;
}

.graph-edge.constraint-relation {
  stroke-dasharray: 4 3;
}

.graph-edge.mock-supplied {
  stroke: #6b7280;
  stroke-width: 2;
  stroke-dasharray: 5 3;
  opacity: 0.5;
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
  stroke-width: 3;
  opacity: 1;
}

.output-operator.active rect {
  stroke: #d26338;
  stroke-width: 2;
}

.output-operator.active text {
  fill: #d26338;
  font-weight: 700;
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
  pointer-events: none;
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

.graph-node.component rect {
  fill: rgba(255, 255, 255, 0.94);
  stroke: #6b7280;
  stroke-width: 2.5;
}

.graph-node.component text {
  fill: #111827;
  font-weight: 700;
}

.graph-node.intermediate circle,
.graph-node.intermediate rect {
  fill: rgba(107, 114, 128, 0.14);
  stroke: #6b7280;
  stroke-width: 2.5;
}

.graph-node .component-instance-label {
  fill: #111827;
  font-size: 24px;
  font-weight: 700;
}

.graph-node .component-template-label {
  fill: #6b7280;
  opacity: 0.6;
  font-size: 16px;
  font-weight: 500;
  font-style: italic;
}

.graph-node .value-label,
.graph-node .signal-label {
  fill: #111827;
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

.graph-node.mock-boundary {
  opacity: 0.5;
}

.graph-node.mock-boundary rect {
  fill: #6b7280;
  stroke: #6b7280;
  stroke-width: 2.5;
  stroke-dasharray: 5 3;
}

.graph-node.mock-boundary text {
  fill: #374151;
  font-size: 14px;
  font-weight: 700;
}

.graph-node.synthetic rect,
.graph-node.synthetic circle {
  fill: rgba(220, 38, 38, 0.1);
  stroke: #dc2626;
  stroke-width: 2.5;
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
  fill: rgba(220, 38, 38, 0.2);
  stroke: #dc2626;
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

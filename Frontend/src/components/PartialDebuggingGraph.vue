<template>
  <div class="graph-shell" @mouseleave="clearGraphHover">

    <div v-if="visibleNodes.length === 0 && frameBounds.length === 0" class="graph-empty">No nodes are available for this template.</div>
    <div v-else class="graph-scroll">
      <button
        type="button"
        class="figure-title"
        :aria-label="`Show ${graphKind === 'source' ? 'Source Semantics Graph' : 'R1CS Enforcement'} view`"
        @click="emit('activate-view', graphKind)"
      >
        {{ graphKind === 'source' ? 'Source Semantics Graph' : 'R1CS Enforcement' }}
      </button>
      <div v-if="graphKind === 'constraint'" class="constraint-toolbar" aria-label="R1CS display controls">
        <button type="button" :class="{ active: effectiveConstraintMode === 'overview' }" @click="showConstraintOverview">Overview</button>
        <button v-if="hasConstraintFocus" type="button" :class="{ active: effectiveConstraintMode === 'focus' }" @click="showConstraintFocus">Issue focus</button>
        <button v-if="effectiveConstraintMode === 'exact'" type="button" class="active" @click="showConstraintOverview">Overview › Group</button>
        <span class="constraint-count">{{ projectionVisibleCount }} / {{ projectionTotalCount }} constraints</span>
        <span v-if="hiddenEntryCount && effectiveConstraintMode !== 'exact'" class="constraint-hidden">{{ hiddenEntryCount }} more entries</span>
        <template v-if="effectiveConstraintMode === 'exact' && exactPageCount > 1">
          <button type="button" :disabled="exactConstraintPage === 0" aria-label="Previous constraint page" @click="changeExactPage(-1)">‹</button>
          <span class="constraint-page">{{ exactConstraintPage + 1 }} / {{ exactPageCount }}</span>
          <button type="button" :disabled="exactConstraintPage + 1 >= exactPageCount" aria-label="Next constraint page" @click="changeExactPage(1)">›</button>
        </template>
        <button type="button" aria-label="Fit graph at a readable scale" @click="fitReadableView">Fit</button>
      </div>
      <div
        v-if="showLegend"
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
          <span class="variable-legend-dot w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"></span>
          <span class="text-gray-600 text-xs">Variable</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="constant-legend-dot w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"></span>
          <span class="text-gray-600 text-xs">Constant</span>
        </div>
        <div v-if="graphKind === 'constraint'" class="flex items-center gap-2">
          <span class="constraint-group-legend-box w-4 h-2.5 rounded-sm inline-block flex-shrink-0"></span>
          <span class="text-gray-600 text-xs">Group</span>
        </div>
        <div v-if="graphKind === 'source'" class="flex items-center gap-2">
          <span class="child-template-legend-box w-4 h-2.5 rounded-sm inline-block flex-shrink-0"></span>
          <span class="text-gray-600 text-xs">Child template</span>
        </div>
        <div v-if="graphKind === 'source'" class="flex items-center gap-2">
          <span class="for-loop-legend-box w-4 h-2.5 rounded-sm inline-block flex-shrink-0"></span>
          <span class="text-gray-600 text-xs">For loop</span>
        </div>
        <div v-if="graphKind === 'source'" class="flex items-center gap-2">
          <span class="ternary-legend-diamond inline-block flex-shrink-0"></span>
          <span class="text-gray-600 text-xs">Ternary operator</span>
        </div>

      </div>
      <svg ref="svgRef" width="100%" height="100%" :viewBox="`0 0 ${viewportWidth} ${viewportHeight}`" preserveAspectRatio="xMidYMid meet" class="graph-canvas" role="img" :aria-label="graphKind === 'source' ? 'Source Semantics Graph' : 'R1CS Enforcement'">
        <g ref="viewportRef" class="zoom-viewport">

        <g v-if="graphKind === 'source'" class="template-boundary">
          <rect :x="sourceBoundary.x" :y="sourceBoundary.y" :width="sourceBoundary.width" :height="sourceBoundary.height" rx="10" />
          <text :x="sourceBoundary.x + 14" :y="sourceBoundary.y + 22">{{ sourceTemplateName }}</text>
        </g>

        <g v-if="graphKind === 'source'" class="source-loop-blocks">
          <g
            v-for="frame in sourceLoopFrames"
            :key="frame.id"
            :class="['source-loop-frame', { selected: selectedNodeId === frame.id || mirroredNodeIds.has(frame.id), linked: linkedNodeIds.has(frame.id), 'issue-attention': issueNodeIds.has(frame.id), 'issue-active': activeIssueNodeIds.has(frame.id) }]"
            @click.stop="$emit('select', frame.id)"
          >
            <rect class="loop-frame-box" :x="frame.x" :y="frame.y" :width="frame.width" :height="frame.height" rx="4" />
            <path class="loop-header-band" :d="loopHeaderBandPath(frame)" />
            <line class="loop-section-divider" :x1="frame.x" :x2="frame.x + frame.width" :y1="frame.y + frame.headerHeight" :y2="frame.y + frame.headerHeight" />
            <line
              v-for="divider in frame.headerDividers"
              :key="divider"
              class="loop-header-divider"
              :x1="divider"
              :x2="divider"
              :y1="frame.y"
              :y2="frame.y + frame.headerHeight"
            />
            <text
              v-for="(condition, index) in frame.headerParts"
              :key="condition"
              class="loop-header-condition"
              :x="frame.x + frame.width * (index + 0.5) / frame.headerParts.length"
              :y="frame.y + frame.headerHeight / 2 + 4"
              text-anchor="middle"
            >{{ condition }}</text>

            <g
              v-for="card in frame.cards"
              :key="card.id"
              :class="['loop-code-card', card.kind, { selected: selectedNodeId === card.id || mirroredNodeIds.has(card.id), linked: linkedNodeIds.has(card.id), 'issue-attention': issueNodeIds.has(card.id), 'issue-active': activeIssueNodeIds.has(card.id) }]"
              tabindex="0"
              role="button"
              :aria-label="card.label"
              @click.stop="$emit('select', card.id)"
              @keydown.enter.prevent="$emit('select', card.id)"
            >
              <title>{{ card.label }}</title>
              <line v-if="card.order > 0" class="loop-card-divider" :x1="frame.x + 5" :x2="frame.x + frame.width - 5" :y1="card.y" :y2="card.y" />
              <circle class="statement-index" :cx="frame.x + 10" :cy="card.y + 10" r="6" />
              <text class="statement-number" :x="frame.x + 10" :y="card.y + 13" text-anchor="middle">{{ card.order + 1 }}</text>

              <line class="assignment-connector" :x1="card.leftX + card.leftWidth" :x2="card.operatorCenterX - card.operatorWidth / 2" :y1="card.centerY" :y2="card.centerY" />
              <line class="assignment-connector" :x1="card.operatorCenterX + card.operatorWidth / 2" :x2="card.rightX" :y1="card.centerY" :y2="card.centerY" />

              <circle v-if="card.leftShape === 'circle'" :class="['code-operand', 'left', card.leftStyle]" :cx="card.leftX + card.leftWidth / 2" :cy="card.centerY" :r="card.leftHeight / 2" />
              <rect v-else :class="['code-operand', 'left', card.leftStyle]" :x="card.leftX" :y="card.leftY" :width="card.leftWidth" :height="card.leftHeight" :rx="card.leftRadius" />
              <text class="code-operand-label" :x="card.leftX + card.leftWidth / 2" :y="card.centerY + 5" text-anchor="middle">{{ card.leftDisplayLabel }}</text>

              <rect class="code-operator" :x="card.operatorCenterX - card.operatorWidth / 2" :y="card.centerY - card.operatorHeight / 2" :width="card.operatorWidth" :height="card.operatorHeight" :rx="card.operatorRadius" />
              <text class="code-operator-label" :x="card.operatorCenterX" :y="card.centerY + 5" text-anchor="middle">{{ card.operator }}</text>

              <circle v-if="card.rightShape === 'circle'" :class="['code-operand', 'right', card.rightStyle]" :cx="card.rightX + card.rightWidth / 2" :cy="card.centerY" :r="card.rightHeight / 2" />
              <rect v-else :class="['code-operand', 'right', card.rightStyle]" :x="card.rightX" :y="card.rightY" :width="card.rightWidth" :height="card.rightHeight" :rx="card.rightRadius" />
              <text :class="['code-operand-label', { 'component-label': card.rightStyle === 'component' }]" :x="card.rightX + card.rightWidth / 2" :y="card.centerY + 5" text-anchor="middle">{{ card.rightDisplayLabel }}</text>
            </g>
          </g>
        </g>

        <g v-if="graphKind === 'source'" class="loop-external-connections">
          <path
            v-for="connection in sourceLoopConnections"
            :key="connection.id"
            :d="connection.path"
            :class="['loop-external-connection', connection.kind]"
          />
        </g>

        <g v-else class="constraint-loop-clusters">
          <g
            v-for="frame in constraintLoopFrames"
            :key="frame.id"
            :class="['constraint-loop-frame', { selected: selectedNodeId === frame.id || mirroredNodeIds.has(frame.id), linked: linkedNodeIds.has(frame.id), empty: frame.empty, 'issue-attention': issueNodeIds.has(frame.id), 'issue-active': activeIssueNodeIds.has(frame.id) }]"
            @click.stop="$emit('select', frame.id)"
          >
            <rect :x="frame.x" :y="frame.y" :width="frame.width" :height="frame.height" rx="10" />
            <text class="constraint-loop-label" :x="frame.x + 4" :y="frame.y - 8">{{ frame.label }}</text>
            <text v-if="frame.empty" class="constraint-loop-empty" :x="frame.x + 14" :y="frame.y + 48">No compiled constraint could be mapped to this loop.</text>
          </g>
        </g>

        <g v-if="graphKind === 'constraint'" class="constraint-pattern-frames">
          <g
            v-for="frame in constraintPatternFrames"
            :key="frame.id"
            class="constraint-pattern-frame interactive"
            role="button"
            tabindex="0"
            @click.stop="openConstraintFamily(frame.familyKey)"
            @keydown.enter.prevent="openConstraintFamily(frame.familyKey)"
          >
            <rect :x="frame.x" :y="frame.y" :width="frame.width" :height="frame.height" rx="8" />
            <text :x="frame.x + frame.width + 8" :y="frame.y + frame.height / 2" dominant-baseline="middle">×{{ frame.count }}</text>
          </g>
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
              :class="['graph-edge', edge.kind, { active: hoveredEdgeId === edge.id, 'issue-attention': issueEdgeIds.has(edge.id), 'issue-active': activeIssueEdgeIds.has(edge.id) }]"
            />
          </g>
          <text
            v-for="edge in labeledEdges"
            :key="`${edge.id}:label`"
            :x="edgeLabelPosition(edge).x"
            :y="edgeLabelPosition(edge).y"
            :class="['edge-label', edge.kind, edge.operandRole]"
          >{{ edge.label }}</text>
          <g
            v-for="edge in outputOperatorEdges"
            :key="`${edge.id}:operator`"
            :transform="`translate(${edgeMidpoint(edge).x},${edgeMidpoint(edge).y})`"
            :class="['output-operator', edge.kind, { active: hoveredEdgeId === edge.id }]"
            @mouseenter="hoveredEdgeId = edge.id"
            @mouseleave="hoveredEdgeId = null"
          >
            <rect
              :x="edge.kind === 'constraint-equality' ? -27 : -20"
              :y="edge.kind === 'constraint-equality' ? -16 : -11"
              :width="edge.kind === 'constraint-equality' ? 54 : 40"
              :height="edge.kind === 'constraint-equality' ? 32 : 22"
              :rx="edge.kind === 'constraint-equality' ? 16 : 10"
            />
            <text text-anchor="middle" :dy="edge.kind === 'constraint-equality' ? 6 : 4">{{ outputOperatorLabel(edge.label) }}</text>
          </g>
        </g>

        <g
          v-for="node in visibleNodes"
          :key="node.id"
          :transform="`translate(${positions.get(node.id)?.x ?? 0},${positions.get(node.id)?.y ?? 0})`"
          :class="['graph-node', node.kind, node.status, node.role, { selected: selectedNodeId === nodeReferenceId(node) || mirroredNodeIds.has(nodeReferenceId(node)), linked: linkedNodeIds.has(nodeReferenceId(node)) && !mirroredNodeIds.has(nodeReferenceId(node)), 'issue-attention': issueNodeIds.has(nodeReferenceId(node)) || issueNodeIds.has(node.id), 'issue-active': activeIssueNodeIds.has(nodeReferenceId(node)) || activeIssueNodeIds.has(node.id) }]"
          tabindex="0"
          role="button"
          @click.stop="$emit('select', nodeReferenceId(node))"
          @dblclick.stop="node.kind === 'signal' && $emit('navigate-signal', nodeReferenceId(node))"
          @mouseenter="$emit('hover', node.id)"
          @focus="$emit('hover', node.id)"
        >
          <title v-if="node.tooltip">{{ node.tooltip }}</title>
          <svg v-if="isSvgOperationNode(node)" x="-21" y="-21" width="42" height="42" viewBox="0 0 1024 1024" class="operation-icon" aria-hidden="true">
            <circle cx="512" cy="512" r="512" fill="#ffffff" />
            <path
              v-if="node.label === '+'"
              d="M512 1024C229.283 1024 0.069 794.761 0.069 512.015 0.069 229.253 229.283 0 512 0c282.69 0 511.931 229.253 511.931 512.015C1023.931 794.761 794.691 1024 512 1024z m0-895.999c-212.026 0-383.955 171.931-383.955 384.012 0 212.053 171.93 383.984 383.955 383.984s383.928-171.931 383.928-383.984c0-212.08-171.902-384.012-383.928-384.012z m191.978 448.016H575.973v127.989c0 35.348-28.625 64.002-63.973 64.002s-64.002-28.654-64.002-64.002V576.017H319.995c-35.29 0-63.975-28.656-63.975-64.002 0-35.347 28.682-64.003 63.975-64.003h128.003V320.008c0-35.348 28.654-64.001 64.002-64.001s63.973 28.653 63.973 64.001v128.004h128.005c35.32 0 63.973 28.656 63.973 64.003 0 35.344-28.653 64.002-63.973 64.002z"
              fill="#333333"
            />
            <path
              v-else-if="node.label === '-'"
              d="M511.45 1024C228.987 1024 0 794.749 0 512.006 0 229.251 228.987 0 511.45 0c282.466 0 511.482 229.251 511.482 512.006C1022.932 794.75 793.916 1024 511.45 1024z m0-895.998c-211.827 0-383.616 171.928-383.616 384.004 0 212.05 171.789 383.99 383.616 383.99 211.857 0 383.589-171.94 383.589-383.99 0-212.076-171.732-384.004-383.59-384.004z m191.81 448.005H319.642c-35.291 0-63.917-28.654-63.917-64 0-35.345 28.628-64.002 63.917-64.002H703.26c35.29 0 63.945 28.655 63.945 64.001 0 35.349-28.654 64-63.945 64z"
              fill="#333333"
            />
            <path
              v-else
              d="M647.38816 728.54528c22.4768 22.4768 58.9824 22.3232 81.60768-0.30208 22.6304-22.6304 22.77888-59.136 0.30208-81.60768l-135.00928-135.0144 134.784-134.784c22.62528-22.62528 22.77888-59.13088 0.30208-81.60768l-0.45568-0.45056c-22.47168-22.4768-58.97728-22.32832-81.60768 0.30208l-134.784 134.784L377.1392 294.4768c-22.4768-22.4768-58.9824-22.32832-81.60768 0.30208-22.6304 22.62528-22.77888 59.13088-0.30208 81.60768L430.6944 511.85152l-134.784 134.784c-22.6304 22.62528-22.77888 59.13088-0.30208 81.60768l0.45056 0.45056c22.4768 22.4768 58.9824 22.32832 81.60768-0.30208l134.784-134.784 134.9376 134.9376zM174.62272 173.87008c186.44992-186.44992 489.20576-186.14784 675.3536 0 186.44992 186.44992 186.14784 489.20576 0 675.3536-186.44992 186.44992-489.20064 186.14784-675.3536 0-186.5216-186.52672-186.14784-489.20576 0-675.3536z"
              fill="#2c2c2c"
            />
          </svg>
          <polygon v-else-if="node.kind === 'ternary-condition'" :points="diamondPoints(node)" />
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
              'value-label': isValueNode(node) || node.kind === 'variable',
              'signal-label': node.kind === 'signal',
            }"
          >{{ displayNodeLabel(node) }}</text>
          <text v-if="node.badge || issueNodeIds.has(nodeReferenceId(node)) || issueNodeIds.has(node.id)" text-anchor="middle" dy="37" :class="['node-badge', { 'issue-badge': issueNodeIds.has(nodeReferenceId(node)) || issueNodeIds.has(node.id) }]">
            {{ activeIssueNodeIds.has(nodeReferenceId(node)) || activeIssueNodeIds.has(node.id)
              ? 'ISSUE'
              : issueNodeIds.has(nodeReferenceId(node)) || issueNodeIds.has(node.id) ? 'ATTENTION' : node.badge }}
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
import type { ConstraintExpressionDto, ConstraintGraphDto, ConstraintRenderMode, SourceGraphDto } from '@/types/partialDebugging'
import { buildConstraintFamilies, exactConstraintPage as buildExactConstraintPage, familyMatches, prioritizeConstraintFamilies } from '@/utils/r1csProjection'
import type { R1csConstraintFamily } from '@/utils/r1csProjection'
import { loopOperandPresentation } from '@/utils/loopOperandPresentation'

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
  aggregate?: boolean
  initialExpression?: string
  initialValue?: number
  tooltip?: string
  loopId?: string
  statementId?: string
  statePhase?: 'initial' | 'current' | 'next' | 'final'
}
interface DisplayEdge {
  id: string
  source: string
  target: string
  kind: string
  label?: string
  operandIndex?: number
  operandRole?: 'minuend' | 'subtrahend'
  multiplicity?: number
  familyKey?: string
}

const props = withDefaults(defineProps<{
  graphKind: 'source' | 'constraint'
  sourceGraph?: SourceGraphDto | null
  constraintGraph?: ConstraintGraphDto | null
  renderMode?: ConstraintRenderMode
  selectedNodeId?: string | null
  hoveredNodeId?: string | null
  linkedNodeIds?: Set<string>
  mirroredNodeIds?: Set<string>
  issueNodeIds?: Set<string>
  issueEdgeIds?: Set<string>
  activeIssueNodeIds?: Set<string>
  activeIssueEdgeIds?: Set<string>
  focusNodeIds?: Set<string>
  signalRoleOverrides?: Map<string, string>
  showLegend?: boolean
}>(), { showLegend: true })

const emit = defineEmits<{
  select: [nodeId: string]
  hover: [nodeId: string | null]
  'navigate-signal': [nodeId: string]
  'activate-view': [view: 'source' | 'constraint']
  'change-render-mode': [mode: ConstraintRenderMode]
}>()

const hoveredEdgeId = ref<string | null>(null)
const clearGraphHover = () => {
  hoveredEdgeId.value = null
  emit('hover', null)
}

const svgRef = ref<SVGSVGElement | null>(null)
const viewportRef = ref<SVGGElement | null>(null)
const viewportWidth = ref(1200)
const viewportHeight = ref(720)
let resizeObserver: ResizeObserver | null = null
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null
let zoomTarget: SVGSVGElement | null = null

const initializeZoom = () => {
  if (!svgRef.value || !viewportRef.value) return
  zoomTarget = svgRef.value
  const svg = d3.select(svgRef.value)
  zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([props.graphKind === 'constraint' ? 0.72 : 0.2, 5])
    .on('zoom', event => {
      d3.select(viewportRef.value).attr('transform', event.transform.toString())
    })
  svg.call(zoomBehavior)
}

function updateViewportSize() {
  const rect = svgRef.value?.getBoundingClientRect()
  if (!rect) return
  viewportWidth.value = Math.max(320, Math.round(rect.width))
  viewportHeight.value = Math.max(240, Math.round(rect.height))
}

function fitReadableView() {
  if (!svgRef.value || !zoomBehavior) return
  const padding = 32
  const availableWidth = Math.max(1, viewportWidth.value - padding * 2)
  const availableHeight = Math.max(1, viewportHeight.value - padding * 2)
  const minimumScale = props.graphKind === 'constraint' ? 0.72 : 0.2
  const scale = Math.max(minimumScale, Math.min(1, availableWidth / canvasWidth.value, availableHeight / canvasHeight.value))
  const x = canvasWidth.value * scale < availableWidth
    ? padding + (availableWidth - canvasWidth.value * scale) / 2
    : padding
  const y = canvasHeight.value * scale < availableHeight
    ? padding + (availableHeight - canvasHeight.value * scale) / 2
    : padding
  d3.select(svgRef.value).call(zoomBehavior.transform, d3.zoomIdentity.translate(x, y).scale(scale))
}

onMounted(() => nextTick(() => {
  updateViewportSize()
  initializeZoom()
  resizeObserver = new ResizeObserver(() => {
    updateViewportSize()
    nextTick(fitReadableView)
  })
  if (svgRef.value) resizeObserver.observe(svgRef.value)
  fitReadableView()
}))
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  if (svgRef.value) d3.select(svgRef.value).on('.zoom', null)
})

const linkedNodeIds = computed(() => props.linkedNodeIds ?? new Set<string>())
const mirroredNodeIds = computed(() => props.mirroredNodeIds ?? new Set<string>())
const issueNodeIds = computed(() => props.issueNodeIds ?? new Set<string>())
const issueEdgeIds = computed(() => props.issueEdgeIds ?? new Set<string>())
const activeIssueNodeIds = computed(() => props.activeIssueNodeIds ?? new Set<string>())
const activeIssueEdgeIds = computed(() => props.activeIssueEdgeIds ?? new Set<string>())
const focusNodeIds = computed(() => props.focusNodeIds ?? new Set<string>())
const sourceTemplateName = computed(() => props.sourceGraph?.nodes.find(node => node.kind === 'component-group' && node.componentPath === 'main')?.templateName ?? 'Selected template')

function loopHeaderBandPath(frame: { x: number; y: number; width: number; headerHeight: number }) {
  const inset = 1.5
  const radius = 3
  const left = frame.x + inset
  const top = frame.y + inset
  const right = frame.x + frame.width - inset
  const bottom = frame.y + frame.headerHeight
  return `M ${left + radius} ${top} H ${right - radius} Q ${right} ${top} ${right} ${top + radius} V ${bottom} H ${left} V ${top + radius} Q ${left} ${top} ${left + radius} ${top} Z`
}

function splitLoopHeader(header: string) {
  const body = header.replace(/^for\s*\(/, '').replace(/\)$/, '')
  const parts = body.split(';').map(part => part.trim()).filter(Boolean)
  return parts.length ? parts : [body]
}

function splitStatementLabel(label: string) {
  const match = label.match(/^(.*?)\s+(<==|==>|<--|-->|===|=)\s+(.*)$/)
  return match
    ? { left: match[1].trim(), operator: match[2], right: match[3].trim() }
    : { left: label, operator: '', right: '' }
}

function orientLoopAssignment(parts: ReturnType<typeof splitStatementLabel>) {
  if (parts.operator === '<--') return { left: parts.right, operator: '-->', right: parts.left }
  if (parts.operator === '<==') return { left: parts.right, operator: '==>', right: parts.left }
  return parts
}

type LoopOperandStyle = 'input' | 'output' | 'variable' | 'constant' | 'intermediate' | 'component-reference' | 'component' | 'expression'
type LoopOperandShape = 'circle' | 'capsule' | 'component'

function normalizeLoopReference(label: string) {
  return label.trim().replace(/\s+/g, '').replace(/\[[^\]]*\]/g, '[]').replace(/^main\./, '')
}

function loopOperandHasOperators(label: string) {
  const withoutIndexes = label.replace(/\[[^\]]*\]/g, '')
  return /<<|>>|[+\-*/%&|^~?:<>!]/.test(withoutIndexes) || /[A-Za-z_$][\w$]*\s*\(/.test(withoutIndexes)
}

function loopReferenceNode(label: string) {
  const reference = normalizeLoopReference(label)
  const unindexedReference = reference.replace(/\[\]/g, '')
  return props.sourceGraph?.nodes.find(node => {
    if (!['signal', 'variable', 'component-group'].includes(node.kind)) return false
    return [node.localName, node.label, node.qualifiedName, node.arrayBaseQualifiedName]
      .filter((name): name is string => Boolean(name))
      .some(name => {
        const candidate = normalizeLoopReference(name)
        const unindexedCandidate = candidate.replace(/\[\]/g, '')
        return candidate === reference || candidate.endsWith(`.${reference}`) || unindexedCandidate === unindexedReference || unindexedCandidate.endsWith(`.${unindexedReference}`)
      })
  })
}

function loopOperandStyle(label: string): LoopOperandStyle {
  if (/^[+-]?(?:\d+(?:\.\d+)?|0x[\da-f]+)$/i.test(label.trim())) return 'constant'
  if (loopOperandHasOperators(label)) return 'expression'
  const node = loopReferenceNode(label)
  if (node?.kind === 'variable') return 'variable'
  if (node?.kind === 'component-group') return 'component-reference'
  if (node?.kind === 'signal') {
    if (node.role === 'input' || node.role === 'mock-input') return 'input'
    if (node.role === 'output' || node.role === 'mock-output') return 'output'
  }
  return 'intermediate'
}

function loopOperandShape(style: LoopOperandStyle, label: string): LoopOperandShape {
  if (style === 'component') return 'component'
  if (style === 'variable') return 'circle'
  if (style === 'constant') return label.trim().length > 4 ? 'capsule' : 'circle'
  if ((style === 'input' || style === 'output') && label.trim().length <= 4) return 'circle'
  return 'capsule'
}

const sourceLoopFrames = computed(() => {
  let nextY = 82
  return (props.sourceGraph?.loops ?? []).map(loop => {
    const statements = (props.sourceGraph?.statements ?? [])
      .filter(statement => loop.bodyStatementIds.includes(statement.id))
      .sort((left, right) => left.order - right.order)
    const preparedCards = statements.map(statement => {
      const parts = orientLoopAssignment(splitStatementLabel(statement.label))
      const leftStyle = loopOperandStyle(parts.left)
      const rightStyle = statement.kind === 'component' ? 'component' : loopOperandStyle(parts.right)
      const leftShape = loopOperandShape(leftStyle, parts.left)
      const rightShape = loopOperandShape(rightStyle, parts.right)
      const leftPresentation = loopOperandPresentation(parts.left, leftStyle, leftShape)
      const rightPresentation = loopOperandPresentation(parts.right, rightStyle, rightShape)
      const leftWidth = leftPresentation.width
      const rightWidth = rightPresentation.width
      const leftHeight = 40
      const rightHeight = rightStyle === 'component' ? 82 : 40
      const operatorWidth = 40
      const operatorHeight = 22
      const connectorLength = 12
      return {
        ...statement,
        ...parts,
        leftStyle,
        rightStyle,
        leftShape,
        rightShape,
        leftWidth,
        rightWidth,
        leftDisplayLabel: leftPresentation.displayLabel,
        rightDisplayLabel: rightPresentation.displayLabel,
        leftHeight,
        rightHeight,
        leftRadius: 20,
        rightRadius: rightStyle === 'component' ? 7 : 20,
        operatorWidth,
        operatorHeight,
        operatorRadius: 10,
        connectorLength,
        contentWidth: leftWidth + rightWidth + operatorWidth + connectorLength * 2,
        cardHeight: Math.max(leftHeight, rightHeight) + 20,
      }
    })
    const x = 330
    const width = Math.max(360, ...preparedCards.map(card => card.contentWidth + 36))
    const headerHeight = 30
    const bodyY = nextY + headerHeight
    let cardY = bodyY
    const cards = preparedCards.map(card => {
      const y = cardY
      const centerY = y + card.cardHeight / 2
      const contentStart = x + (width - card.contentWidth) / 2
      const operatorCenterX = contentStart + card.leftWidth + card.connectorLength + card.operatorWidth / 2
      cardY += card.cardHeight
      return {
        ...card,
        y,
        centerY,
        leftY: centerY - card.leftHeight / 2,
        rightY: centerY - card.rightHeight / 2,
        leftX: contentStart,
        operatorCenterX,
        rightX: operatorCenterX + card.operatorWidth / 2 + card.connectorLength,
      }
    })
    const headerParts = splitLoopHeader(loop.header)
    const bodyHeight = Math.max(68, preparedCards.reduce((sum, card) => sum + card.cardHeight, 0))
    const height = headerHeight + bodyHeight
    const frame = {
      id: loop.id,
      x,
      y: nextY,
      width,
      height,
      headerHeight,
      headerParts,
      headerDividers: headerParts.slice(1).map((_, index) => x + width * (index + 1) / headerParts.length),
      bodyY,
      bodyHeight,
      cards,
    }
    nextY += height + 12
    return frame
  })
})

const sourceLoopHiddenNodeIds = computed(() => {
  const graph = props.sourceGraph
  if (!graph) return new Set<string>()
  const hidden = new Set<string>()
  for (const statement of graph.statements ?? []) statement.nodeIds.forEach(nodeId => hidden.add(nodeId))
  for (const node of graph.nodes) {
    if (node.loopId && node.statePhase !== 'final') hidden.add(node.id)
  }
  for (const nodeId of [...hidden]) {
    const node = graph.nodes.find(candidate => candidate.id === nodeId)
    node?.childNodeIds?.forEach(childId => hidden.add(childId))
  }
  return hidden
})

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
  for (const edge of graph.edges) {
    if (edge.kind === 'component-input' && relevant.has(edge.source)) relevant.add(edge.target)
    if (edge.kind === 'component-output' && relevant.has(edge.target)) relevant.add(edge.source)
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

function variableInitialText(initialExpression?: string, initialValue?: number) {
  if (!initialExpression) return '= ?'
  if (initialValue === undefined || initialExpression === String(initialValue)) return '= ' + initialExpression
  return '= ' + initialExpression + ' → ' + initialValue
}

function variableTooltip(name: string, initialExpression?: string, initialValue?: number) {
  return name + ' ' + variableInitialText(initialExpression, initialValue)
}

const OVERVIEW_FAMILY_LIMIT = 60
const EXACT_PAGE_SIZE = 25

type ConstraintFamilyProjection = R1csConstraintFamily

const selectedConstraintFamilyKey = ref<string | null>(null)
const exactConstraintPage = ref(0)
const constraintFamilies = computed<ConstraintFamilyProjection[]>(() =>
  props.constraintGraph ? buildConstraintFamilies(props.constraintGraph) : [],
)
const matchingConstraintFocusFamilies = computed(() =>
  constraintFamilies.value.filter(family => familyMatches(family, focusNodeIds.value)),
)
const effectiveConstraintMode = computed<ConstraintRenderMode>(() => {
  if (selectedConstraintFamilyKey.value) return 'exact'
  if (props.renderMode === 'focus' && matchingConstraintFocusFamilies.value.length) return 'focus'
  return 'overview'
})

const prioritizedConstraintFamilies = computed(() => prioritizeConstraintFamilies(
  constraintFamilies.value,
  focusNodeIds.value,
  new Set([...issueNodeIds.value, ...activeIssueNodeIds.value]),
))
const projectedConstraintFamilies = computed<ConstraintFamilyProjection[]>(() => {
  if (effectiveConstraintMode.value === 'exact') {
    const family = constraintFamilies.value.find(candidate => candidate.key === selectedConstraintFamilyKey.value)
    if (!family) return []
    return buildExactConstraintPage(family, exactConstraintPage.value, EXACT_PAGE_SIZE)
  }
  if (effectiveConstraintMode.value === 'focus') {
    const matching = prioritizedConstraintFamilies.value.filter(family =>
      familyMatches(family, focusNodeIds.value),
    )
    if (matching.length) return matching.slice(0, OVERVIEW_FAMILY_LIMIT)
  }
  return prioritizedConstraintFamilies.value.slice(0, OVERVIEW_FAMILY_LIMIT)
})

const selectedConstraintFamily = computed(() =>
  constraintFamilies.value.find(family => family.key === selectedConstraintFamilyKey.value),
)
const exactPageCount = computed(() => Math.max(1, Math.ceil((selectedConstraintFamily.value?.constraints.length ?? 0) / EXACT_PAGE_SIZE)))
const projectionTotalCount = computed(() => props.constraintGraph?.constraints.length ?? 0)
const projectionVisibleCount = computed(() => projectedConstraintFamilies.value.reduce((total, family) => total + family.constraints.length, 0))
const hiddenEntryCount = computed(() => Math.max(0, constraintFamilies.value.length - projectedConstraintFamilies.value.length))
const hasConstraintFocus = computed(() => matchingConstraintFocusFamilies.value.length > 0)

function showConstraintOverview() {
  selectedConstraintFamilyKey.value = null
  exactConstraintPage.value = 0
  emit('change-render-mode', 'overview')
}
function showConstraintFocus() {
  selectedConstraintFamilyKey.value = null
  exactConstraintPage.value = 0
  emit('change-render-mode', 'focus')
}
function openConstraintFamily(familyKey?: string) {
  if (!familyKey) return
  const normalizedKey = familyKey.replace(/:exact:constraint:\d+$/, '')
  if (!constraintFamilies.value.some(family => family.key === normalizedKey)) return
  selectedConstraintFamilyKey.value = normalizedKey
  exactConstraintPage.value = 0
}
function changeExactPage(offset: number) {
  exactConstraintPage.value = Math.min(exactPageCount.value - 1, Math.max(0, exactConstraintPage.value + offset))
}

watch(() => props.constraintGraph, () => {
  selectedConstraintFamilyKey.value = null
  exactConstraintPage.value = 0
})
watch(() => props.renderMode, () => {
  selectedConstraintFamilyKey.value = null
  exactConstraintPage.value = 0
})

const constraintDisplay = computed(() => {
  const graph = props.constraintGraph
  const nodes: DisplayNode[] = []
  const edges: DisplayEdge[] = []
  if (!graph) return { nodes, edges }
  const signalById = new Map(graph.signals.map(signal => [signal.signalId, signal]))
  const groupBySignalId = new Map(graph.signalGroups.flatMap(group => group.memberSignalIds.map(signalId => [signalId, group] as const)))
  const displayIdsBySignalNodeId = new Map<string, string[]>()

  const addSignalNode = (
    signalId: number,
    id: string,
    constraintIndex: number,
    labelPrefix = '',
  ) => {
    const signal = signalById.get(signalId)
    const qualifiedName = signal?.qualifiedName ?? 's' + signalId
    const group = groupBySignalId.get(signalId)
    if (group) {
      nodes.push({
        id,
        referenceId: group.id,
        label: shortConstraintSignalName(group.displayQualifiedName),
        kind: 'signal',
        role: group.role,
        status: group.status,
        badge: group.mockSupplied ? 'MOCK OUTPUT' : undefined,
        constraintIndex,
        aggregate: true,
        tooltip: group.displayQualifiedName + ' (' + group.memberSignalIds.length + ' elements)',
      })
      for (const memberId of group.memberSignalNodeIds) {
        const displayIds = displayIdsBySignalNodeId.get(memberId) ?? []
        displayIds.push(id)
        displayIdsBySignalNodeId.set(memberId, displayIds)
      }
      return id
    }
    nodes.push({
      id,
      referenceId: signal?.id,
      label: `${labelPrefix}${shortConstraintSignalName(qualifiedName)}`,
      kind: 'signal',
      role: props.signalRoleOverrides?.get(qualifiedName) ?? signal?.role ?? 'intermediate',
      status: signal?.status,
      badge: signal?.mockSupplied ? 'MOCK OUTPUT' : undefined,
      constraintIndex,
    })
    if (signal) {
      const displayIds = displayIdsBySignalNodeId.get(signal.id) ?? []
      displayIds.push(id)
      displayIdsBySignalNodeId.set(signal.id, displayIds)
    }
    return id
  }

  const addExpression = (
    expression: ConstraintExpressionDto,
    constraintId: string,
    constraintIndex: number,
    path: string,
  ): string => {
    const id = `${constraintId}:expression:${path}`
    if (expression.kind === 'signal') return addSignalNode(expression.signalId, id, constraintIndex)
    if (expression.kind === 'constant') {
      nodes.push({ id, label: expression.value, kind: 'constant', constraintIndex })
      return id
    }
    if (expression.kind === 'mul' && expression.operands.length === 2) {
      const [first, second] = expression.operands
      const negatedSignal = first.kind === 'signal' && second.kind === 'constant' && second.value === '-1'
        ? first
        : second.kind === 'signal' && first.kind === 'constant' && first.value === '-1'
          ? second
          : undefined
      if (negatedSignal && !groupBySignalId.has(negatedSignal.signalId)) return addSignalNode(negatedSignal.signalId, id, constraintIndex, '-')
    }
    nodes.push({
      id,
      referenceId: constraintId,
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

  for (const family of projectedConstraintFamilies.value) {
    const highlightedIds = new Set([...focusNodeIds.value, ...issueNodeIds.value, ...activeIssueNodeIds.value])
    const constraint = family.constraints.find(candidate => highlightedIds.has(candidate.id)) ?? family.constraints[0]
    const equation = constraint.equation
    const leftRoot = addExpression(equation.left, constraint.id, constraint.index, 'left')
    const rightRoot = addExpression(equation.right, constraint.id, constraint.index, 'right')
    edges.push({
      id: `${constraint.id}:equality`,
      source: leftRoot,
      target: rightRoot,
      kind: 'constraint-equality',
      label: '=',
      multiplicity: family.constraints.length,
      familyKey: family.key,
    })
  }

  return { nodes, edges }
})
const allNodes = computed<DisplayNode[]>(() => {
  if (props.graphKind === 'source') {
    return (props.sourceGraph?.nodes ?? [])
      .filter(node => relevantSourceIds.value.has(node.id) && !sourceLoopHiddenNodeIds.value.has(node.id) && node.kind !== 'assignment' && node.kind !== 'source-constraint' && (node.kind !== 'component-group' || node.componentPath !== 'main'))
      .map(node => ({
        id: node.id,
        label: node.statePhase === 'final' && node.stateVariable
          ? node.stateVariable
          : node.kind === 'signal' || node.kind === 'variable'
          ? node.localName ?? node.label
          : node.kind === 'component-group' ? node.templateName ?? node.label
          : node.kind === 'operation' ? operationLabel(node.operation, node.label) : node.label,
        kind: node.kind === 'component-group' ? 'component' : node.kind,
        componentInstanceName: node.kind === 'component-group' ? node.localName ?? node.componentPath?.split('.').pop() : undefined,
        componentTemplateName: node.kind === 'component-group' ? node.templateName ?? node.label : undefined,
        role: node.role,
        status: node.mocked || node.role?.startsWith('mock-') ? 'mocked' : undefined,
        badge: node.role?.startsWith('mock-') ? 'MOCK' : undefined,
        initialExpression: node.initialExpression,
        initialValue: node.initialValue,
        tooltip: node.kind === 'variable' ? variableTooltip(node.localName ?? node.label, node.initialExpression, node.initialValue) : node.qualifiedName,
        loopId: node.loopId,
        statementId: node.statementId,
        statePhase: node.statePhase,
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
    const direct: DisplayEdge[] = graph.edges
      .filter(edge => !collapsedNodeIds.has(edge.source) && !collapsedNodeIds.has(edge.target))
      .map(edge => {
        const target = graph.nodes.find(node => node.id === edge.target)
        const operandRole: DisplayEdge['operandRole'] = target?.kind === 'operation' && target.operation === 'sub'
          ? edge.operandIndex === 0 ? 'minuend' : edge.operandIndex === 1 ? 'subtrahend' : undefined
          : undefined
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          kind: edge.kind,
          label: edge.label ?? edge.operator ?? operandRole,
          operandIndex: edge.operandIndex,
          operandRole,
        }
      })
    for (const assignment of graph.nodes.filter(node => node.kind === 'assignment')) {
      const incoming = graph.edges.filter(edge => edge.target === assignment.id)
      const outgoing = graph.edges.find(edge => edge.source === assignment.id)
      if (!incoming.length || !outgoing) continue
      incoming.forEach((input, index) => direct.push({
        id: `collapsed:${assignment.id}:${index}`,
        source: input.source,
        target: outgoing.target,
        kind: assignment.generatesConstraint ? 'constrained-assignment' : 'witness-assignment',
        label: assignment.operator,
      }))
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
  const inputRowGap = 210
  const operationRowGap = 165
  const edgeGap = 76
  const inputs = visibleNodes.value.filter(node => node.kind === 'signal' && (node.role === 'input' || node.role === 'mock-input'))
  const outputs = visibleNodes.value.filter(node => node.kind === 'signal' && (node.role === 'output' || node.role === 'mock-output'))
  const operations = visibleNodes.value.filter(node => node.kind === 'operation' || node.kind === 'source-constraint' || node.kind === 'ternary-condition' || node.kind === 'ternary-result')
  const components = visibleNodes.value.filter(node => node.kind === 'component')
  const constants = visibleNodes.value.filter(node => node.kind === 'constant')
  const variables = visibleNodes.value.filter(node => node.kind === 'variable')
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
      const verticalClearance = (nodeHeight(node) + nodeHeight(other)) / 2 + 48
      return Math.abs(position.x - x) < horizontalClearance && Math.abs(position.y - y) < verticalClearance
    })
    while (collides()) y += Math.max(112, nodeHeight(node) + 60)
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
      const y = componentPosition.y + (index - (outputEdges.length - 1) / 2) * 108
      placeWithoutOverlap(port, x, y)
    })
  })

  const loopStateByNodeId = new Map<string, { loopId: string }>()
  for (const loop of props.sourceGraph?.loops ?? []) {
    for (const state of loop.stateVariables) {
      loopStateByNodeId.set(state.initialNodeId, { loopId: loop.id })
      loopStateByNodeId.set(state.finalNodeId, { loopId: loop.id })
    }
  }
  const visibleLoopVariables = variables.filter(node => loopStateByNodeId.has(node.id))

  variables.forEach((node, index) => {
    const loopState = loopStateByNodeId.get(node.id)
    const frame = loopState ? sourceLoopFrames.value.find(candidate => candidate.id === loopState.loopId) : undefined
    const consumers = visibleEdges.value.filter(edge => edge.source === node.id).map(edge => map.get(edge.target)).filter((position): position is { x: number; y: number } => Boolean(position))
    const target = consumers[0]
    if (frame && loopState) {
      const siblings = visibleLoopVariables.filter(candidate => loopStateByNodeId.get(candidate.id)?.loopId === loopState.loopId)
      const siblingIndex = siblings.findIndex(candidate => candidate.id === node.id)
      const minimumY = frame.y + frame.headerHeight + 34
      const maximumY = frame.y + frame.height - 34
      const distributedY = minimumY + (maximumY - minimumY) * (siblingIndex + 1) / (siblings.length + 1)
      const preferredY = target ? Math.min(maximumY, Math.max(minimumY, target.y)) : distributedY
      placeWithoutOverlap(node, frame.x - 100, preferredY)
      return
    }
    const x = target ? target.x - edgeGap - nodeVisualWidth(node) : firstOperationX - edgeGap - nodeVisualWidth(node)
    const y = target?.y ?? 110 + index * operationRowGap
    placeWithoutOverlap(node, x, y)
  })

  constants.forEach((node, index) => {
    const consumer = visibleEdges.value.find(edge => edge.source === node.id)
    const targetNode = consumer ? nodeById.get(consumer.target) : undefined
    const target = consumer ? map.get(consumer.target) : undefined
    const x = target && targetNode
      ? target.x - nodeVisualWidth(targetNode) / 2 - edgeGap - nodeVisualWidth(node) / 2
      : firstOperationX - edgeGap - nodeVisualWidth(node) / 2
    placeWithoutOverlap(node, x, (target?.y ?? 110 + index * operationRowGap) + 92)
  })

  const pendingIntermediates = [...intermediates]
  for (let pass = 0; pass <= intermediates.length && pendingIntermediates.length; pass++) {
    for (let index = pendingIntermediates.length - 1; index >= 0; index--) {
      const node = pendingIntermediates[index]
      const producers = visibleEdges.value
        .filter(edge => edge.target === node.id)
        .map(edge => ({ node: nodeById.get(edge.source), position: map.get(edge.source) }))
        .filter((producer): producer is { node: DisplayNode; position: { x: number; y: number } } => Boolean(producer.node && producer.position))
      if (!producers.length) continue
      const x = Math.max(...producers.map(producer => producer.position.x + nodeVisualWidth(producer.node) / 2)) + edgeGap + nodeVisualWidth(node) / 2
      const y = producers.reduce((sum, producer) => sum + producer.position.y, 0) / producers.length
      placeWithoutOverlap(node, x, y)
      pendingIntermediates.splice(index, 1)
    }
  }
  pendingIntermediates.forEach((node, index) => placeWithoutOverlap(node, firstOperationX, 110 + index * operationRowGap))


  const internalNodes = visibleNodes.value.filter(node => !inputs.includes(node) && !outputs.includes(node))
  const loopBottom = Math.max(0, ...sourceLoopFrames.value.map(frame => frame.y + frame.height))
  let displacedNodeIndex = 0
  for (const node of internalNodes) {
    const position = map.get(node.id)
    if (!position) continue
    const overlapsLoop = sourceLoopFrames.value.some(frame =>
      position.x + nodeVisualWidth(node) / 2 > frame.x &&
      position.x - nodeVisualWidth(node) / 2 < frame.x + frame.width &&
      position.y + nodeHeight(node) / 2 > frame.y &&
      position.y - nodeHeight(node) / 2 < frame.y + frame.height
    )
    if (!overlapsLoop) continue
    map.set(node.id, { x: position.x, y: loopBottom + 90 + displacedNodeIndex * 120 })
    displacedNodeIndex += 1
  }
  const internalRight = Math.max(
    firstOperationX + maxDepth * operationColumnGap,
    ...sourceLoopFrames.value.map(frame => frame.x + frame.width),
    ...internalNodes.map(node => {
      const position = map.get(node.id)
      return position ? position.x + nodeVisualWidth(node) / 2 : 0
    }),
  )
  const boundaryRight = Math.max(580, internalRight + 48)

  outputs.forEach((node, index) => {
    const producers = visibleEdges.value
      .filter(edge => edge.target === node.id)
      .map(edge => map.get(edge.source))
      .filter((position): position is { x: number; y: number } => Boolean(position))
    const x = boundaryRight + edgeGap + nodeVisualWidth(node) / 2
    const y = producers.length
      ? producers.reduce((sum, position) => sum + position.y, 0) / producers.length
      : 110 + index * inputRowGap
    placeWithoutOverlap(node, x, y)
  })

  const outputX = Math.max(boundaryRight, ...outputs.map(node => map.get(node.id)?.x ?? 0))
  return { positions: map, maxDepth, outputX, boundaryRight }
})

const positions = computed(() => {
  if (props.graphKind === 'source') return sourceLayout.value.positions
  const map = new Map<string, { x: number; y: number }>()
  const nodeById = new Map(visibleNodes.value.map(node => [node.id, node]))
  const equalityEdges = visibleEdges.value.filter(edge => edge.kind === 'constraint-equality')
  const expressionEdges = visibleEdges.value.filter(edge => edge.kind !== 'constraint-equality')
  const childrenOf = (nodeId: string) => expressionEdges.filter(edge => edge.target === nodeId).map(edge => edge.source)

  const depth = (nodeId: string, visiting = new Set<string>()): number => {
    if (visiting.has(nodeId)) return 0
    const children = childrenOf(nodeId)
    if (!children.length) return 0
    const next = new Set(visiting).add(nodeId)
    return Math.max(...children.map(childId => depth(childId, next))) + 1
  }
  const maxLeftDepth = Math.max(0, ...equalityEdges.map(edge => depth(edge.source)))
  const equalityX = 150 + maxLeftDepth * 230
  const rootGap = 62
  const columnGap = 230
  const leafGap = 122
  let nextBandTop = 90

  const layoutSide = (rootId: string, direction: -1 | 1) => {
    const relative = new Map<string, { x: number; y: number }>()
    let nextLeafY = 0
    const visit = (nodeId: string, nodeDepth: number, visiting = new Set<string>()): number => {
      if (visiting.has(nodeId)) return nextLeafY
      const next = new Set(visiting).add(nodeId)
      const children = childrenOf(nodeId)
      let y: number
      if (!children.length) {
        y = nextLeafY
        nextLeafY += leafGap
      } else {
        const childYs = children.map(childId => visit(childId, nodeDepth + 1, next))
        y = childYs.reduce((sum, value) => sum + value, 0) / childYs.length
      }
      relative.set(nodeId, { x: direction * nodeDepth * columnGap, y })
      return y
    }
    visit(rootId, 0)
    const rootY = relative.get(rootId)?.y ?? 0
    for (const [nodeId, position] of relative) relative.set(nodeId, { x: position.x, y: position.y - rootY })
    return relative
  }

  for (const equality of equalityEdges) {
    const leftRootNode = nodeById.get(equality.source)
    const rightRootNode = nodeById.get(equality.target)
    if (!leftRootNode || !rightRootNode) continue
    const left = layoutSide(equality.source, -1)
    const right = layoutSide(equality.target, 1)
    const allRelative = [...left.entries(), ...right.entries()]
    const minY = Math.min(0, ...allRelative.map(([nodeId, position]) => position.y - nodeHeight(nodeById.get(nodeId)!) / 2))
    const maxY = Math.max(0, ...allRelative.map(([nodeId, position]) => position.y + nodeHeight(nodeById.get(nodeId)!) / 2))
    const centerY = nextBandTop - minY
    const leftRootX = equalityX - rootGap - nodeVisualWidth(leftRootNode) / 2
    const rightRootX = equalityX + rootGap + nodeVisualWidth(rightRootNode) / 2

    for (const [nodeId, position] of left) map.set(nodeId, { x: leftRootX + position.x, y: centerY + position.y })
    for (const [nodeId, position] of right) map.set(nodeId, { x: rightRootX + position.x, y: centerY + position.y })
    nextBandTop = centerY + maxY + 120
  }

  visibleNodes.value.filter(node => !map.has(node.id)).forEach((node, index) => {
    map.set(node.id, { x: equalityX, y: nextBandTop + index * leafGap })
  })
  return map
})

const sourceLoopConnections = computed(() => {
  if (props.graphKind !== 'source') return []
  const connections: Array<{ id: string; kind: 'variable' | 'output'; path: string }> = []
  const seen = new Set<string>()
  const referenceKey = (label: string) => normalizeLoopReference(label).replace(/\[\]/g, '')
  const referencesMatch = (left: string, right: string) => referenceKey(left) === referenceKey(right)
  const connectorPath = (source: { x: number; y: number }, target: { x: number; y: number }) => {
    const direction = target.x >= source.x ? 1 : -1
    const controlOffset = Math.max(28, Math.abs(target.x - source.x) * 0.45)
    return `M ${source.x} ${source.y} C ${source.x + direction * controlOffset} ${source.y}, ${target.x - direction * controlOffset} ${target.y}, ${target.x} ${target.y}`
  }

  for (const frame of sourceLoopFrames.value) {
    for (const card of frame.cards) {
      const operands = [
        { side: 'left', label: card.left, style: card.leftStyle, x: card.leftX, width: card.leftWidth },
        { side: 'right', label: card.right, style: card.rightStyle, x: card.rightX, width: card.rightWidth },
      ] as const
      for (const operand of operands) {
        let kind: 'variable' | 'output' | undefined
        let externalNode: DisplayNode | undefined
        if (operand.style === 'variable') {
          kind = 'variable'
          externalNode = visibleNodes.value.find(node => node.kind === 'variable' && node.loopId === frame.id && node.statePhase === 'final' && referencesMatch(node.label, operand.label))
            ?? visibleNodes.value.find(node => node.kind === 'variable' && referencesMatch(node.label, operand.label))
        } else if (operand.side === 'right' && operand.style === 'output' && ['-->', '==>'].includes(card.operator)) {
          kind = 'output'
          externalNode = visibleNodes.value.find(node => node.kind === 'signal' && (node.role === 'output' || node.role === 'mock-output') && referencesMatch(node.label, operand.label))
        }
        if (!kind || !externalNode) continue
        const connectionKey = `${frame.id}:${kind}:${referenceKey(operand.label)}`
        if (seen.has(connectionKey)) continue
        const externalPosition = positions.value.get(externalNode.id)
        if (!externalPosition) continue
        seen.add(connectionKey)
        const operandCenterX = operand.x + operand.width / 2
        const source = {
          x: externalPosition.x < operandCenterX ? operand.x : operand.x + operand.width,
          y: card.centerY,
        }
        const target = {
          x: source.x < externalPosition.x
            ? externalPosition.x - nodeVisualWidth(externalNode) / 2
            : externalPosition.x + nodeVisualWidth(externalNode) / 2,
          y: externalPosition.y,
        }
        connections.push({ id: connectionKey, kind, path: connectorPath(source, target) })
      }
    }
  }
  return connections
})

const constraintPatternFrames = computed(() => {
  if (props.graphKind !== 'constraint') return []
  return visibleEdges.value
    .filter(edge => edge.kind === 'constraint-equality' && effectiveConstraintMode.value !== 'exact' && (edge.multiplicity ?? 1) > 1)
    .flatMap(edge => {
      const root = visibleNodeById.value.get(edge.source)
      if (root?.constraintIndex === undefined) return []
      const members = visibleNodes.value
        .filter(node => node.constraintIndex === root.constraintIndex)
        .map(node => ({ node, position: positions.value.get(node.id) }))
        .filter((member): member is { node: DisplayNode; position: { x: number; y: number } } => Boolean(member.position))
      if (!members.length) return []
      const minX = Math.min(...members.map(member => member.position.x - nodeVisualWidth(member.node) / 2)) - 28
      const maxX = Math.max(...members.map(member => member.position.x + nodeVisualWidth(member.node) / 2)) + 28
      const minY = Math.min(...members.map(member => member.position.y - nodeHeight(member.node) / 2)) - 28
      const maxY = Math.max(...members.map(member => member.position.y + nodeHeight(member.node) / 2)) + 28
      return [{
        id: `${edge.id}:pattern`,
        familyKey: edge.familyKey,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        count: edge.multiplicity ?? 1,
      }]
    })
})

const constraintLoopFrames = computed(() => {
  if (props.graphKind !== 'constraint') return []
  const graph = props.constraintGraph
  if (!graph) return []
  const projectedClusterIds = new Set(projectedConstraintFamilies.value.map(family => family.clusterId).filter(Boolean))
  const constraintIndexById = new Map(graph.constraints.map(constraint => [constraint.id, constraint.index]))
  return (graph.loopClusters ?? []).filter(cluster => projectedClusterIds.has(cluster.id)).flatMap(cluster => {
    const constraintIndices = new Set(
      cluster.constraintNodeIds
        .map(constraintId => constraintIndexById.get(constraintId))
        .filter((index): index is number => index !== undefined),
    )
    const members = visibleNodes.value
      .filter(node => node.constraintIndex !== undefined && constraintIndices.has(node.constraintIndex))
      .map(node => ({ node, position: positions.value.get(node.id) }))
      .filter((member): member is { node: DisplayNode; position: { x: number; y: number } } => Boolean(member.position))
    if (!members.length) return []
    const minX = Math.min(...members.map(member => member.position.x - nodeVisualWidth(member.node) / 2)) - 34
    const maxX = Math.max(...members.map(member => member.position.x + nodeVisualWidth(member.node) / 2)) + 34
    const minY = Math.min(...members.map(member => member.position.y - nodeHeight(member.node) / 2)) - 34
    const maxY = Math.max(...members.map(member => member.position.y + nodeHeight(member.node) / 2)) + 34
    return [{ id: cluster.id, label: cluster.label, x: minX, y: minY, width: maxX - minX, height: maxY - minY, empty: false }]
  })
})
const frameBounds = computed(() => props.graphKind === 'source'
  ? sourceLoopFrames.value
  : [...constraintLoopFrames.value, ...constraintPatternFrames.value])
const canvasWidth = computed(() => Math.max(
  760,
  ...visibleNodes.value.map(node => {
    const position = positions.value.get(node.id)
    return (position?.x ?? 0) + nodeVisualWidth(node) / 2 + 70
  }),
  ...frameBounds.value.map(frame => frame.x + frame.width + 50),
))
const canvasHeight = computed(() => Math.max(
  props.graphKind === 'source' ? 560 : 420,
  ...Array.from(positions.value.values()).map(position => position.y + (props.graphKind === 'source' ? 130 : 90)),
  ...frameBounds.value.map(frame => frame.y + frame.height + 50),
))
const sourceBoundary = computed(() => ({ x: 190, y: 35, width: sourceLayout.value.boundaryRight - 190, height: canvasHeight.value - 70 }))
watch([canvasWidth, canvasHeight, () => visibleNodes.value.length, exactConstraintPage], async () => {
  await nextTick()
  if (!svgRef.value) return
  if (!zoomBehavior || zoomTarget !== svgRef.value) initializeZoom()
  fitReadableView()
}, { flush: 'post' })
function isValueNode(node: DisplayNode) {
  return node.kind === 'constant' || node.kind === 'ternary-result' || (
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
  if (node.kind === 'ternary-condition') return 15
  if (node.kind === 'component') return 16
  if (node.kind === 'variable') return length > 17 ? 14 : length > 12 ? 16 : 18
  if (node.kind === 'constraint-term') return length > 20 ? 13 : length > 14 ? 14 : 16
  if (node.kind === 'signal' && !isValueNode(node)) return length > 17 ? 13 : length > 12 ? 14 : 16
  if (isValueNode(node)) return length > 17 ? 14 : length > 12 ? 16 : 18
  return length > 20 ? 11 : 13
}
function nodeWidth(node: DisplayNode) {
  if (node.kind === 'constraint') return 320
  if (node.kind === 'component') return Math.min(250, Math.max(190, displayNodeLabel(node).length * 10 + 56))
  if (node.kind === 'ternary-condition') return Math.min(190, Math.max(130, displayNodeLabel(node).length * 10 + 48))
  const labelWidth = displayNodeLabel(node).length * nodeFontSize(node) * 0.62
  if (node.kind === 'constraint-term') return Math.min(360, Math.max(96, labelWidth + 34))
  if (node.kind === 'signal' || node.kind === 'constant') return Math.min(270, Math.max(76, labelWidth + 34))
  return Math.min(280, Math.max(82, labelWidth + 30))
}
function nodeHeight(node: DisplayNode) {
  if (node.kind === 'component') return 110
  if (node.kind === 'variable') return 48
  if (node.kind === 'ternary-condition') return 82
  return node.kind === 'signal' || valueNeedsRectangle(node) || node.kind === 'constraint-term' ? 48 : 40
}
function diamondPoints(node: DisplayNode) {
  const halfWidth = nodeWidth(node) / 2
  const halfHeight = nodeHeight(node) / 2
  return `0,${-halfHeight} ${halfWidth},0 0,${halfHeight} ${-halfWidth},0`
}
function nodeCornerRadius(node: DisplayNode) {
  if (node.kind === 'component') return 8
  return node.kind === 'constraint' ? 8 : node.kind === 'signal' || valueNeedsRectangle(node) || node.kind === 'constraint-term' ? 24 : 18
}
function isSvgOperationNode(node: DisplayNode) {
  return node.kind === 'operation' && (node.label === '+' || node.label === '-' || node.label === 'x')
}
function isCircleNode(node: DisplayNode) {
  return node.kind === 'operation' || node.kind === 'variable' || (isValueNode(node) && !valueNeedsRectangle(node))
}
function nodeCircleRadius(node: DisplayNode) {
  if (node.kind === 'operation') return 25
  if (node.kind === 'variable') return 24
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

  if (node.kind === 'ternary-condition') {
    const halfWidth = nodeWidth(node) / 2
    const halfHeight = nodeHeight(node) / 2
    const scale = 1 / (Math.abs(dx) / halfWidth + Math.abs(dy) / halfHeight)
    return { x: center.x + dx * scale, y: center.y + dy * scale }
  }

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
    const halfWidth = nodeVisualWidth(node) / 2 + 12
    const halfHeight = nodeHeight(node) / 2 + 12
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
  const dx = target.x - source.x
  const dy = target.y - source.y
  const length = Math.hypot(dx, dy)
  if (!length) return direct
  const normal = { x: -dy / length, y: dx / length }
  const curvedRoute = (offset: number): EdgeRoute => ({
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
  })

  if (props.graphKind !== 'source') return direct

  const parallelEdges = visibleEdges.value.filter(candidate =>
    candidate.source === edge.source && candidate.target === edge.target
  )
  const parallelIndex = parallelEdges.findIndex(candidate => candidate.id === edge.id)
  if (parallelIndex > 0) {
    const direction = parallelIndex % 2 === 1 ? 1 : -1
    const rank = Math.ceil(parallelIndex / 2)
    const offsets = [28 + (rank - 1) * 18, 44 + (rank - 1) * 18, 64 + (rank - 1) * 18]
      .map(offset => offset * direction)
    const route = offsets
      .map(curvedRoute)
      .find(candidate => routeStaysInsideCanvas(candidate) && !routeIntersectsNode(edge, candidate))
    return route ?? curvedRoute(offsets[0])
  }

  if (!routeIntersectsNode(edge, direct)) return direct

  const offsets = [36, -36, 52, -52, 72, -72, 96, -96, 128, -128]
  for (const offset of offsets) {
    const route = curvedRoute(offset)
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
  const verticalOffset = edge.operandRole ? -1 : -7
  return { x: midpoint.x, y: midpoint.y + verticalOffset }
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
  pointer-events: auto;
  cursor: pointer;
  font-family: inherit;
  line-height: 1.4;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .02em;
  transition: border-color 0.2s, color 0.2s, background-color 0.2s;
}

.figure-title:hover,
.figure-title:focus-visible {
  border-color: #409eff;
  color: #409eff;
  background: #fff;
  outline: none;
}

.constraint-toolbar {
  position: absolute;
  top: 7px;
  left: 158px;
  right: 10px;
  z-index: 3;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  pointer-events: none;
}

.constraint-toolbar button,
.constraint-toolbar span {
  pointer-events: auto;
}

.constraint-toolbar button {
  min-height: 26px;
  padding: 2px 8px;
  border: 1px solid #d7dee7;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.94);
  color: #52616f;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.constraint-toolbar button:hover,
.constraint-toolbar button:focus-visible,
.constraint-toolbar button.active {
  border-color: #409eff;
  color: #1677c8;
  outline: none;
}

.constraint-toolbar button:disabled {
  opacity: 0.42;
  cursor: default;
}

.constraint-count,
.constraint-hidden,
.constraint-page {
  padding: 3px 5px;
  border-radius: 4px;
  background: rgba(248, 250, 252, 0.92);
  color: #52616f;
  font-size: 11px;
  white-space: nowrap;
}

.constraint-hidden {
  color: #b45309;
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

.variable-legend-dot {
  background: rgba(251, 191, 36, 0.34);
  border: 1px solid #d97706;
}

.constraint-group-legend-box {
  background: transparent;
  border: 2px dashed #64748b;
}

.child-template-legend-box {
  background: rgba(255, 255, 255, 0.94);
  border: 2px solid #6b7280;
}

.for-loop-legend-box {
  background: rgba(167, 139, 190, 0.12);
  border: 1.5px solid #a78bbe;
}

.ternary-legend-diamond {
  width: 11px;
  height: 11px;
  margin: 0 3px;
  background: #fffdf6;
  border: 1.5px solid #aa823f;
  transform: rotate(45deg);
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

.source-loop-frame,
.loop-code-card,
.constraint-loop-frame {
  cursor: pointer;
}

.source-loop-frame text,
.loop-code-card text,
.constraint-loop-frame text {
  pointer-events: none;
}

.loop-frame-box {
  fill: rgba(167, 139, 190, 0.035);
  stroke: #a78bbe;
  stroke-width: 1.5;
}

.loop-header-band {
  fill: rgba(167, 139, 190, 0.12);
  pointer-events: none;
}

.loop-section-divider {
  stroke: #b9a8cc;
  stroke-width: 1.5;
}

.loop-header-divider {
  stroke: #d8cfe3;
  stroke-width: 1;
}

.loop-header-condition {
  fill: #6f5f82;
  font-size: 14px;
  font-weight: 600;
}

.loop-external-connection {
  fill: none;
  stroke-width: 1.25;
  opacity: 0.8;
  pointer-events: none;
}

.loop-external-connection.variable {
  stroke: #d97706;
  stroke-dasharray: 6 4;
}

.loop-external-connection.output {
  stroke: #16a34a;
}

.assignment-connector {
  stroke: #6b7280;
  stroke-width: 1;
  opacity: 0.75;
}

.loop-card-divider {
  stroke: #9ca3af;
  stroke-width: 0.6;
  stroke-dasharray: 6 5;
  opacity: 0.72;
}

.statement-index {
  fill: rgba(107, 114, 128, 0.14);
  stroke: #6b7280;
  stroke-width: 1;
  opacity: 0.55;
}

.loop-code-card .statement-number {
  fill: #111827;
  font-size: 10px;
  font-weight: 600;
  opacity: 0.75;
}

.code-operand {
  fill: rgba(107, 114, 128, 0.14);
  stroke: #6b7280;
  stroke-width: 1.5;
}

.code-operand.input {
  fill: rgba(37, 99, 235, 0.14);
  stroke: #2563eb;
}

.code-operand.output {
  fill: rgba(22, 163, 74, 0.14);
  stroke: #16a34a;
}

.code-operand.variable {
  fill: rgba(251, 191, 36, 0.34);
  stroke: #d97706;
}

.code-operand.constant {
  fill: #f8f1df;
  stroke: #aa823f;
}

.code-operand.component-reference {
  fill: rgba(107, 114, 128, 0.14);
  stroke: #6b7280;
}

.code-operand.expression {
  fill: rgba(107, 114, 128, 0.14);
  stroke: #94a3b8;
}

.code-operator {
  fill: #fff;
  stroke: #64748b;
  stroke-width: 1.2;
}

.code-operand.component {
  fill: rgba(255, 255, 255, 0.94);
  stroke: #6b7280;
  stroke-width: 1.5;
}

.code-operand-label {
  fill: #111827;
  font-size: 16px;
  font-weight: 600;
}

.code-operand-label.component-label {
  fill: #6b7280;
  font-size: 16px;
  font-weight: 500;
  font-style: italic;
}

.code-operator-label {
  fill: #1f2937;
  font-size: 18px;
  font-weight: 700;
}

.source-loop-frame.selected > .loop-frame-box,
.loop-code-card.selected .code-operand,
.loop-code-card.selected .code-operator,
.constraint-loop-frame.selected rect {
  stroke: #dc2626;
  stroke-width: 3;
}

.source-loop-frame.issue-attention > .loop-frame-box,
.loop-code-card.issue-attention .code-operand,
.loop-code-card.issue-attention .code-operator,
.constraint-loop-frame.issue-attention rect {
  stroke: #d97706;
  stroke-width: 3;
}

.source-loop-frame.issue-active > .loop-frame-box,
.loop-code-card.issue-active .code-operand,
.loop-code-card.issue-active .code-operator,
.constraint-loop-frame.issue-active rect {
  stroke: #dc2626;
  stroke-width: 3.5;
}

.source-loop-frame.linked > .loop-frame-box,
.loop-code-card.linked .code-operand,
.loop-code-card.linked .code-operator,
.constraint-loop-frame.linked rect {
  stroke: #17806b;
  stroke-width: 2.5;
}

.constraint-pattern-frame rect {
  fill: rgba(255, 255, 255, 0.01);
  stroke: #64748b;
  stroke-width: 2.5;
  stroke-dasharray: 6 3;
  pointer-events: all;
}

.constraint-pattern-frame.interactive {
  cursor: pointer;
}

.constraint-pattern-frame.interactive:hover rect,
.constraint-pattern-frame.interactive:focus-visible rect {
  fill: rgba(64, 158, 255, 0.05);
  stroke: #409eff;
  outline: none;
}

.constraint-pattern-frame text {
  fill: #475569;
  font-size: 18px;
  font-weight: 700;
  pointer-events: none;
}

.constraint-loop-frame rect {
  fill: rgba(240, 249, 255, 0.22);
  stroke: #39748a;
  stroke-width: 2;
  stroke-dasharray: 8 5;
}

.constraint-loop-frame.empty rect {
  fill: rgba(254, 249, 195, 0.34);
  stroke: #a16207;
}

.constraint-loop-label {
  fill: #164e63;
  font-size: 11px;
  font-weight: 800;
}

.constraint-loop-empty {
  fill: #854d0e;
  font-size: 10px;
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


.graph-edge.port-A {
  stroke: #3077a8;
}

.graph-edge.port-B {
  stroke: #aa6c2e;
}

.graph-edge.issue-attention {
  stroke: #d97706 !important;
  stroke-width: 3;
  opacity: 1;
}

.graph-edge.issue-active {
  stroke: #dc2626 !important;
  stroke-width: 4;
  opacity: 1;
}

.graph-edge.port-C {
  stroke: #368162;
}

.graph-edge.loop-carried {
  stroke: #d97706;
  stroke-width: 2;
  stroke-dasharray: 7 4;
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

.output-operator.constraint-equality rect {
  stroke: #374151;
  stroke-width: 2.5;
  filter: drop-shadow(0 1px 2px rgba(17, 24, 39, 0.18));
}

.output-operator.constraint-equality text {
  fill: #111827;
  font-size: 24px;
  font-weight: 800;
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
.graph-node.constant rect,
.graph-node.ternary-result circle,
.graph-node.ternary-result rect {
  fill: #f8f1df;
  stroke: #aa823f;
  stroke-width: 2.5;
}

.graph-node.ternary-condition polygon {
  fill: #fffdf6;
  stroke: #aa823f;
  stroke-width: 2.5;
}

.graph-node.ternary-condition text {
  fill: #3f3422;
  font-weight: 700;
}

.edge-label.control-dependency {
  fill: #7c5a22;
  font-size: 13px;
  font-weight: 700;
}

.edge-label.minuend,
.edge-label.subtrahend {
  fill: #374151;
  font-size: 11px;
  font-weight: 700;
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

.graph-node.variable circle {
  fill: rgba(251, 191, 36, 0.34);
  stroke: #d97706;
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

.graph-node.issue-attention rect,
.graph-node.issue-attention circle,
.graph-node.issue-attention polygon {
  stroke: #d97706;
  stroke-width: 3;
}

.graph-node.issue-active rect,
.graph-node.issue-active circle,
.graph-node.issue-active polygon {
  fill: rgba(220, 38, 38, 0.14);
  stroke: #dc2626;
  stroke-width: 3.5;
}

.node-badge.issue-badge {
  fill: #b45309 !important;
}

.graph-node.issue-active .node-badge.issue-badge {
  fill: #dc2626 !important;
}


.graph-node.selected rect,
.graph-node.selected circle,
.graph-node.selected polygon {
  fill: rgba(220, 38, 38, 0.2);
  stroke: #dc2626;
  stroke-width: 3;
}

.graph-node.linked rect,
.graph-node.linked circle,
.graph-node.linked polygon {
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

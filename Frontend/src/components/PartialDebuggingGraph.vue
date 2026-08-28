<template>
  <div class="graph-shell" @mouseleave="clearGraphHover">

    <div v-if="visibleNodes.length === 0 && frameBounds.length === 0" class="graph-empty">No nodes are available for this template.</div>
    <div v-else class="graph-scroll">
      <button
        type="button"
        class="figure-title"
        :aria-label="`Show ${graphKind === 'source' ? 'Source Semantics Graph' : 'Constraint Enforcement'} view`"
        @click="emit('activate-view', graphKind)"
      >
        {{ graphKind === 'source' ? 'Source Semantics Graph' : 'Constraint Enforcement' }}
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
          <span class="conditional-legend-box w-4 h-2.5 rounded-sm inline-block flex-shrink-0"></span>
          <span class="text-gray-600 text-xs">If / else</span>
        </div>
        <div v-if="graphKind === 'source'" class="flex items-center gap-2">
          <span class="ternary-legend-diamond inline-block flex-shrink-0"></span>
          <span class="text-gray-600 text-xs">Ternary operator</span>
        </div>

      </div>
      <svg ref="svgRef" width="100%" height="100%" :viewBox="`0 0 ${viewportWidth} ${viewportHeight}`" preserveAspectRatio="xMidYMid meet" class="graph-canvas" role="img" :aria-label="graphKind === 'source' ? 'Source Semantics Graph' : 'Constraint Enforcement'">
        <g ref="viewportRef" class="zoom-viewport">

        <g v-if="graphKind === 'source'" class="source-loop-blocks">
          <g
            v-for="frame in sourceLoopFrames"
            :key="frame.id"
            :class="['source-loop-frame', frame.kind, { selected: selectedNodeId === frame.id || mirroredNodeIds.has(frame.id), linked: linkedNodeIds.has(frame.id), 'issue-attention': issueNodeIds.has(frame.id), 'issue-active': activeIssueNodeIds.has(frame.id) }]"
            @click.stop="$emit('select', frame.id)"
          >
            <rect v-if="frame.kind === 'loop'" class="loop-frame-box" :x="frame.x" :y="frame.y" :width="frame.width" :height="frame.height" rx="4" />
            <path v-if="frame.kind === 'loop'" class="loop-header-band" :d="loopHeaderBandPath(frame)" />
            <line v-if="frame.kind === 'loop'" class="loop-section-divider" :x1="frame.x" :x2="frame.x + frame.width" :y1="frame.y + frame.headerHeight" :y2="frame.y + frame.headerHeight" />
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
              v-for="conditional in frame.conditionalBlocks"
              :key="conditional.id"
              :class="['source-conditional-block', { nested: conditional.depth > 0 }]"
              tabindex="0"
              role="group"
              :aria-label="`if (${conditional.condition})`"
            >
              <title>if ({{ conditional.condition }})</title>
              <rect class="conditional-frame-box" :x="conditional.x" :y="conditional.y" :width="conditional.width" :height="conditional.height" rx="8" />
              <rect class="conditional-header-band" :x="conditional.x" :y="conditional.y" :width="conditional.width" :height="conditional.headerHeight" rx="8" />
              <text class="conditional-header-label" :x="conditional.x + 12" :y="conditional.y + 19">if ({{ conditional.condition }})</text>
              <g
                v-for="branch in conditional.branches"
                :key="branch.kind"
                :class="['conditional-branch', branch.kind, branch.status]"
              >
                <title>{{ branch.fullLabel }}</title>
                <rect class="conditional-branch-box" :x="conditional.x + 5" :y="branch.y" :width="conditional.width - 10" :height="branch.height" rx="6" />
                <text class="conditional-branch-label" :x="conditional.x + 14" :y="branch.y + 17">{{ branch.label }}</text>
              </g>
            </g>

            <g
              v-for="card in loopCardsForRender(frame.cards)"
              :key="card.id"
              :class="['loop-code-card', card.kind, card.compileActivity, { selected: selectedNodeId === card.id || mirroredNodeIds.has(card.id), linked: linkedNodeIds.has(card.id), 'issue-attention': issueNodeIds.has(card.id), 'issue-active': activeIssueNodeIds.has(card.id) }]"
              @click.stop
            >
              <title>{{ card.label }}</title>
              <line v-if="card.order > 0" class="loop-card-divider" :x1="frame.x + 5" :x2="frame.x + frame.width - 5" :y1="card.y" :y2="card.y" />
              <circle class="statement-index" :cx="frame.x + 10" :cy="card.y + 10" r="6" />
              <text class="statement-number" :x="frame.x + 10" :y="card.y + 13" text-anchor="middle">{{ card.order + 1 }}</text>

              <line class="assignment-connector" :x1="card.leftX + card.leftWidth" :x2="card.operatorCenterX - card.operatorWidth / 2" :y1="card.centerY" :y2="card.centerY" />
              <line class="assignment-connector" :x1="card.operatorCenterX + card.operatorWidth / 2" :x2="card.rightX" :y1="card.centerY" :y2="card.centerY" />

              <g
                :class="['loop-operand-node', 'left', { 'name-expanded': isLoopOperandExpanded(card, 'left') }]"
                tabindex="0"
                role="button"
                :aria-label="card.left"
                :aria-expanded="card.leftTruncated ? isLoopOperandExpanded(card, 'left') : undefined"
                @click.stop="handleLoopOperandClick(card, 'left')"
                @keydown.enter.prevent.stop="handleLoopOperandClick(card, 'left')"
                @keydown.space.prevent.stop="handleLoopOperandClick(card, 'left')"
                @mouseenter="handleLoopOperandEnter(card, 'left')"
                @mouseleave="handleLoopOperandLeave(card, 'left')"
                @focus="handleLoopOperandEnter(card, 'left')"
                @blur="handleLoopOperandLeave(card, 'left')"
              >
                <title>{{ card.left }}</title>
                <circle
                  v-if="loopOperandRenderedShape(card, 'left') === 'circle'"
                  :class="['code-operand', 'left', card.leftStyle]"
                  :cx="loopOperandRenderedX(card, 'left') + loopOperandRenderedWidth(card, 'left') / 2"
                  :cy="card.centerY"
                  :r="card.leftHeight / 2"
                />
                <rect
                  v-else
                  :class="['code-operand', 'left', card.leftStyle]"
                  :x="loopOperandRenderedX(card, 'left')"
                  :y="card.leftY"
                  :width="loopOperandRenderedWidth(card, 'left')"
                  :height="card.leftHeight"
                  :rx="card.leftRadius"
                />
                <text class="code-operand-label" :x="loopOperandRenderedX(card, 'left') + loopOperandRenderedWidth(card, 'left') / 2" :y="card.centerY + 5" text-anchor="middle">{{ loopOperandDisplayLabel(card, 'left') }}</text>
              </g>

              <rect class="code-operator" :x="card.operatorCenterX - card.operatorWidth / 2" :y="card.centerY - card.operatorHeight / 2" :width="card.operatorWidth" :height="card.operatorHeight" :rx="card.operatorRadius" />
              <text class="code-operator-label" :x="card.operatorCenterX" :y="card.centerY + 5" text-anchor="middle">{{ card.operator }}</text>

              <g
                :class="['loop-operand-node', 'right', { 'name-expanded': isLoopOperandExpanded(card, 'right') }]"
                tabindex="0"
                role="button"
                :aria-label="card.right"
                :aria-expanded="card.rightTruncated ? isLoopOperandExpanded(card, 'right') : undefined"
                @click.stop="handleLoopOperandClick(card, 'right')"
                @keydown.enter.prevent.stop="handleLoopOperandClick(card, 'right')"
                @keydown.space.prevent.stop="handleLoopOperandClick(card, 'right')"
                @mouseenter="handleLoopOperandEnter(card, 'right')"
                @mouseleave="handleLoopOperandLeave(card, 'right')"
                @focus="handleLoopOperandEnter(card, 'right')"
                @blur="handleLoopOperandLeave(card, 'right')"
              >
                <title>{{ card.right }}</title>
                <circle
                  v-if="loopOperandRenderedShape(card, 'right') === 'circle'"
                  :class="['code-operand', 'right', card.rightStyle]"
                  :cx="loopOperandRenderedX(card, 'right') + loopOperandRenderedWidth(card, 'right') / 2"
                  :cy="card.centerY"
                  :r="card.rightHeight / 2"
                />
                <rect
                  v-else
                  :class="['code-operand', 'right', card.rightStyle]"
                  :x="loopOperandRenderedX(card, 'right')"
                  :y="card.rightY"
                  :width="loopOperandRenderedWidth(card, 'right')"
                  :height="card.rightHeight"
                  :rx="card.rightRadius"
                />
                <text :class="['code-operand-label', { 'component-label': card.rightStyle === 'component' }]" :x="loopOperandRenderedX(card, 'right') + loopOperandRenderedWidth(card, 'right') / 2" :y="card.centerY + 5" text-anchor="middle">{{ loopOperandDisplayLabel(card, 'right') }}</text>
              </g>
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
            <title v-if="edge.tooltip">{{ edge.tooltip }}</title>
            <path :d="edgePath(edge)" class="graph-edge-hit" />
            <path
              :d="edgePath(edge)"
              fill="none"
              :class="['graph-edge', edge.kind, { active: hoveredEdgeId === edge.id, 'node-selected': selectedSourceNodeEdgeIds.has(edge.id), 'issue-attention': edgeHasIssue(edge), 'issue-active': edgeHasActiveIssue(edge) }]"
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
            :class="['output-operator', edge.kind, { active: hoveredEdgeId === edge.id, 'node-selected': selectedSourceNodeEdgeIds.has(edge.id) }]"
            @mouseenter="hoveredEdgeId = edge.id"
            @mouseleave="hoveredEdgeId = null"
          >
            <rect
              :x="-operatorBadgeWidth(edge) / 2"
              :y="edge.kind === 'constraint-equality' ? -16 : -11"
              :width="operatorBadgeWidth(edge)"
              :height="edge.kind === 'constraint-equality' ? 32 : 22"
              :rx="edge.kind === 'constraint-equality' ? 16 : 10"
            />
            <text text-anchor="middle" :dy="edge.kind === 'constraint-equality' ? 6 : 4">{{ outputOperatorLabel(edge.label, edge.kind) }}{{ (edge.multiplicity ?? 1) > 1 ? ` ×${edge.multiplicity}` : '' }}</text>
          </g>
        </g>

        <g
          v-for="node in visibleNodesForRender"
          :key="node.id"
          :transform="`translate(${positions.get(node.id)?.x ?? 0},${positions.get(node.id)?.y ?? 0})`"
          :class="['graph-node', node.kind, node.status, node.role, { selected: selectedNodeId === nodeReferenceId(node) || mirroredNodeIds.has(nodeReferenceId(node)), linked: linkedNodeIds.has(nodeReferenceId(node)) && !mirroredNodeIds.has(nodeReferenceId(node)), 'name-expanded': isNodeNameExpanded(node), 'contains-selected': containingExpressionNodeIds.has(node.id), 'issue-attention': nodeHasIssue(node), 'issue-active': nodeHasActiveIssue(node) }]"
          tabindex="0"
          role="button"
          :aria-label="node.tooltip ?? node.label"
          :aria-expanded="nodeNameIsTruncated(node) ? isNodeNameExpanded(node) : undefined"
          @click.stop="handleGraphNodeClick(node)"
          @keydown.enter.prevent.stop="handleGraphNodeClick(node)"
          @keydown.space.prevent.stop="handleGraphNodeClick(node)"
          @dblclick.stop="handleGraphNodeDoubleClick(node)"
          @mouseenter="handleGraphNodeEnter(node)"
          @mouseleave="handleGraphNodeLeave(node)"
          @focus="handleGraphNodeEnter(node)"
          @blur="handleGraphNodeLeave(node)"
        >
          <title>{{ node.tooltip ?? node.label }}</title>
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
          <circle v-else-if="node.kind === 'component-port'" class="component-port-anchor" r="4" />
          <circle v-else-if="isRenderedCircleNode(node)" :r="nodeCircleRadius(node)" />
          <rect
            v-else
            :x="-renderedNodeWidth(node) / 2"
            :y="-nodeHeight(node) / 2"
            :width="renderedNodeWidth(node)"
            :height="nodeHeight(node)"
            :rx="nodeCornerRadius(node)"
          />
          <text
            v-if="node.kind === 'component'"
            text-anchor="middle"
            :y="-nodeHeight(node) / 2 + 24"
            class="component-instance-label"
          >{{ displayComponentInstanceLabel(node) }}</text>
          <text
            v-if="node.kind === 'component'"
            text-anchor="middle"
            :y="-nodeHeight(node) / 2 + 44"
            class="component-template-label"
          >{{ displayComponentTemplateLabel(node) }}</text>
          <line
            v-if="node.kind === 'component'"
            class="component-header-divider"
            :x1="-renderedNodeWidth(node) / 2"
            :x2="renderedNodeWidth(node) / 2"
            :y1="-nodeHeight(node) / 2 + 56"
            :y2="-nodeHeight(node) / 2 + 56"
          />
          <text
            v-if="node.kind === 'component-port'"
            :x="node.portDirection === 'input' ? 12 : -12"
            dy="4"
            :text-anchor="node.portDirection === 'input' ? 'start' : 'end'"
            :class="['component-port-label', node.portDirection]"
          >{{ node.label }}</text>
          <text
            v-if="!isSvgOperationNode(node) && node.kind !== 'component' && node.kind !== 'component-port'"
            text-anchor="middle"
            dy="4"
            :style="{ fontSize: `${nodeFontSize(node)}px` }"
            :class="{
              'gate-label': node.kind === 'operation',
              'value-label': isValueNode(node) || node.kind === 'variable',
              'signal-label': node.kind === 'signal' || node.kind === 'array-access' || node.kind === 'statement-reference',
            }"
          >{{ displayNodeLabel(node) }}</text>
          <text v-if="node.badge || nodeHasIssue(node)" text-anchor="middle" dy="37" :class="['node-badge', { 'issue-badge': nodeHasIssue(node) }]">
            {{ nodeHasActiveIssue(node)
              ? 'ISSUE'
              : nodeHasIssue(node) ? 'ATTENTION' : node.badge }}
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
import type { ConstraintExpressionDto, ConstraintGraphDto, ConstraintRenderMode, SourceConditionalDto, SourceGraphDto, SourceStatementDto } from '@/types/partialDebugging'
import { buildConstraintFamilies, exactConstraintPage as buildExactConstraintPage, familyMatches, negatedSignalId, prioritizeConstraintFamilies, signalGroupsRequiringMemberLabels } from '@/utils/r1csProjection'
import type { R1csConstraintFamily } from '@/utils/r1csProjection'
import { expandedLoopOperandWidth, LOOP_CONNECTOR_LENGTH, LOOP_FRAME_HORIZONTAL_PADDING, LOOP_FRAME_MAX_WIDTH, LOOP_FRAME_MIN_WIDTH, LOOP_OPERATOR_WIDTH, loopStatementPresentation } from '@/utils/loopOperandPresentation'
import type { LoopOperandPresentationShape, LoopOperandPresentationStyle } from '@/utils/loopOperandPresentation'
import { componentNodePresentation, extractSourceReferenceExpressions, projectSourceArrayAccesses, projectSourceAssignments, projectSourceOpaqueExpressions, projectSourceStatements, sourceBranchCoverageLabel, sourceColumnCenters, sourceStatementColumnCenters, terminalOutputColumn, visibleSourcePredecessorIds } from '@/utils/sourceGraphProjection'
import { connectedEdgeIds, containingNodeIds, togglePinnedNodeExpansion } from '@/utils/graphSelection'

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
  memberNodeIds?: string[]
  loopId?: string
  statementId?: string
  statementSide?: 'left' | 'right'
  statePhase?: 'initial' | 'current' | 'next' | 'final'
  parentComponentId?: string
  portDirection?: 'input' | 'output'
  portCount?: number
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
  memberEdgeIds?: string[]
  tooltip?: string
}
type LoopOperandSide = 'left' | 'right'
interface InteractiveLoopCard {
  id: string
  left: string
  right: string
  leftStyle: LoopOperandPresentationStyle
  rightStyle: LoopOperandPresentationStyle
  leftShape: LoopOperandPresentationShape
  rightShape: LoopOperandPresentationShape
  leftTruncated: boolean
  rightTruncated: boolean
  leftDisplayLabel: string
  rightDisplayLabel: string
  leftX: number
  rightX: number
  leftY: number
  rightY: number
  leftWidth: number
  rightWidth: number
  leftHeight: number
  rightHeight: number
  leftRadius: number
  rightRadius: number
  centerY: number
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
  'navigate-template': [nodeId: string]
  'activate-view': [view: 'source' | 'constraint']
  'change-render-mode': [mode: ConstraintRenderMode]
}>()

const hoveredEdgeId = ref<string | null>(null)
const selectedSourceNodeId = ref<string | null>(null)
const hoveredGraphNodeId = ref<string | null>(null)
const pinnedExpandedNodeId = ref<string | null>(null)
const hoverSuppressedNodeId = ref<string | null>(null)
const hoveredLoopOperandKey = ref<string | null>(null)
const pinnedExpandedLoopOperandKey = ref<string | null>(null)
const hoverSuppressedLoopOperandKey = ref<string | null>(null)
const clearGraphHover = () => {
  hoveredEdgeId.value = null
  hoveredGraphNodeId.value = null
  hoverSuppressedNodeId.value = null
  hoveredLoopOperandKey.value = null
  hoverSuppressedLoopOperandKey.value = null
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

const nodeMatchesIds = (node: DisplayNode, ids: ReadonlySet<string>) =>
  ids.has(node.id) || ids.has(nodeReferenceId(node)) || node.memberNodeIds?.some(nodeId => ids.has(nodeId)) === true
const nodeHasIssue = (node: DisplayNode) => nodeMatchesIds(node, issueNodeIds.value)
const nodeHasActiveIssue = (node: DisplayNode) => nodeMatchesIds(node, activeIssueNodeIds.value)

const edgeHasIssue = (edge: DisplayEdge) => issueEdgeIds.value.has(edge.id)
  || edge.memberEdgeIds?.some(edgeId => issueEdgeIds.value.has(edgeId)) === true
const edgeHasActiveIssue = (edge: DisplayEdge) => activeIssueEdgeIds.value.has(edge.id)
  || edge.memberEdgeIds?.some(edgeId => activeIssueEdgeIds.value.has(edgeId)) === true

const sourceComponentPortInfo = computed(() => {
  const graph = props.sourceGraph
  const result = new Map<string, { componentId: string; direction: 'input' | 'output'; label: string }>()
  if (!graph) return result
  const nodeById = new Map(graph.nodes.map(node => [node.id, node]))
  for (const edge of graph.edges) {
    if (edge.kind !== 'component-input' && edge.kind !== 'component-output') continue
    const componentId = edge.kind === 'component-input' ? edge.target : edge.source
    const portId = edge.kind === 'component-input' ? edge.source : edge.target
    const component = nodeById.get(componentId)
    const port = nodeById.get(portId)
    if (!component || !port) continue
    const instanceName = component.localName ?? component.componentPath?.split('.').pop() ?? ''
    const localName = port.localName ?? port.label
    result.set(portId, {
      componentId,
      direction: edge.kind === 'component-input' ? 'input' : 'output',
      label: localName.startsWith(`${instanceName}.`) ? localName.slice(instanceName.length + 1) : localName,
    })
  }
  return result
})

const sourceComponentPortCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const port of sourceComponentPortInfo.value.values()) {
    counts.set(port.componentId, (counts.get(port.componentId) ?? 0) + 1)
  }
  return counts
})

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

function loopReferenceNodes(label: string) {
  const direct = loopReferenceNode(label)
  const candidates = direct
    ? [direct]
    : extractSourceReferenceExpressions(label)
      .map(reference => loopReferenceNode(reference))
      .filter((node): node is NonNullable<typeof node> => Boolean(node))
  return [...new Map(candidates.map(node => [node.id, node] as const)).values()]
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
  const allStatements = props.sourceGraph?.statements ?? []
  const allConditionals = props.sourceGraph?.conditionals ?? []
  const standaloneRoots = allConditionals.filter(conditional => !conditional.parentLoopId && !conditional.parentConditionalId)
  const sources: Array<
    | { kind: 'loop'; id: string; header: string; sourceLine: number; statementIds: Set<string>; conditionals: SourceConditionalDto[] }
    | { kind: 'conditional'; id: string; header: string; sourceLine: number; statementIds: Set<string>; conditionals: SourceConditionalDto[] }
  > = (props.sourceGraph?.loops ?? []).map(loop => ({
    kind: 'loop',
    id: loop.id,
    header: loop.header,
    sourceLine: loop.sourceSpan.startLine,
    statementIds: new Set(loop.bodyStatementIds),
    conditionals: allConditionals.filter(conditional => conditional.parentLoopId === loop.id),
  }))
  for (const root of standaloneRoots) {
    const conditionalIds = new Set<string>([root.id])
    for (let changed = true; changed;) {
      changed = false
      for (const conditional of allConditionals) {
        if (!conditional.parentConditionalId || !conditionalIds.has(conditional.parentConditionalId) || conditionalIds.has(conditional.id)) continue
        conditionalIds.add(conditional.id); changed = true
      }
    }
    sources.push({
      kind: 'conditional',
      id: `standalone:${root.id}`,
      header: '',
      sourceLine: root.sourceSpan.startLine,
      statementIds: new Set(allStatements.filter(statement => statement.conditionalId && conditionalIds.has(statement.conditionalId)).map(statement => statement.id)),
      conditionals: allConditionals.filter(conditional => conditionalIds.has(conditional.id)),
    })
  }
  return sources.sort((left, right) => left.sourceLine - right.sourceLine).map(source => {
    const statements = allStatements.filter(statement => source.statementIds.has(statement.id))
    const conditionals = source.conditionals
    const prepareCard = (statement: SourceStatementDto) => {
      const parts = orientLoopAssignment(splitStatementLabel(statement.label))
      const leftStyle = loopOperandStyle(parts.left)
      const rightStyle = statement.kind === 'component' ? 'component' : loopOperandStyle(parts.right)
      const leftShape = loopOperandShape(leftStyle, parts.left)
      const rightShape = loopOperandShape(rightStyle, parts.right)
      const statementPresentation = loopStatementPresentation(
        { label: parts.left, style: leftStyle, shape: leftShape },
        { label: parts.right, style: rightStyle, shape: rightShape },
      )
      const leftPresentation = statementPresentation.left
      const rightPresentation = statementPresentation.right
      const leftWidth = leftPresentation.width
      const rightWidth = rightPresentation.width
      const leftHeight = 40
      const rightHeight = rightStyle === 'component' ? 82 : 40
      const operatorWidth = LOOP_OPERATOR_WIDTH
      const operatorHeight = 22
      const connectorLength = LOOP_CONNECTOR_LENGTH
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
        leftTruncated: leftPresentation.truncated,
        rightTruncated: rightPresentation.truncated,
        leftHeight,
        rightHeight,
        leftRadius: 20,
        rightRadius: rightStyle === 'component' ? 7 : 20,
        operatorWidth,
        operatorHeight,
        operatorRadius: 10,
        connectorLength,
        contentWidth: statementPresentation.contentWidth,
        cardHeight: Math.max(leftHeight, rightHeight) + 20,
      }
    }
    const preparedCards = statements.map(prepareCard)
    type PreparedCard = ReturnType<typeof prepareCard>
    type PositionedCard = PreparedCard & {
      y: number; centerY: number; leftY: number; rightY: number; leftX: number; operatorCenterX: number; rightX: number
    }
    type ControlItem =
      | { kind: 'statement'; order: number; card: PreparedCard }
      | { kind: 'conditional'; order: number; conditional: SourceConditionalDto }
    type ConditionalBlock = {
      id: string; condition: string; depth: number; x: number; y: number; width: number; height: number; headerHeight: number
      branches: Array<{ kind: 'then' | 'else'; status: 'active' | 'inactive' | 'unknown'; label: string; fullLabel: string; y: number; height: number }>
    }
    const itemsFor = (parentConditionalId?: string, branch?: 'then' | 'else'): ControlItem[] => {
      const childStatements = preparedCards
        .filter(card => parentConditionalId
          ? card.conditionalId === parentConditionalId && card.conditionalBranch === branch
          : !card.conditionalId)
        .map(card => ({ kind: 'statement' as const, order: card.order, card }))
      const childConditionals = conditionals
        .filter(conditional => parentConditionalId
          ? conditional.parentConditionalId === parentConditionalId && conditional.parentBranch === branch
          : !conditional.parentConditionalId)
        .map(conditional => ({ kind: 'conditional' as const, order: conditional.order, conditional }))
      return [...childStatements, ...childConditionals]
        .sort((left, right) => left.order - right.order || (left.kind === 'conditional' ? -1 : 1))
    }
    const conditionalHeaderHeight = 30
    const branchHeaderHeight = 24
    const branchBottomPadding = 8
    const emptyBranchHeight = 18
    const measureItems = (items: ControlItem[]): number => items.reduce((height, item) => {
      if (item.kind === 'statement') return height + item.card.cardHeight
      const thenHeight = Math.max(emptyBranchHeight, measureItems(itemsFor(item.conditional.id, 'then')))
      const elseHeight = item.conditional.hasElse
        ? Math.max(emptyBranchHeight, measureItems(itemsFor(item.conditional.id, 'else')))
        : 0
      return height + conditionalHeaderHeight
        + branchHeaderHeight + thenHeight + branchBottomPadding
        + (item.conditional.hasElse ? branchHeaderHeight + elseHeight + branchBottomPadding : 0)
    }, 0)
    const rootItems = itemsFor()
    const width = Math.min(LOOP_FRAME_MAX_WIDTH, Math.max(LOOP_FRAME_MIN_WIDTH, ...preparedCards.map(card => card.contentWidth + LOOP_FRAME_HORIZONTAL_PADDING)))
    const headerHeight = source.kind === 'loop' ? 30 : 0
    const bodyHeight = Math.max(68, measureItems(rootItems))
    const height = headerHeight + bodyHeight
    const anchorNodes = [...new Map(preparedCards
      .flatMap(card => [card.left, card.right])
      .flatMap(label => loopReferenceNodes(label))
      .map(node => [node.id, node] as const)).values()]
    const anchorPositions = anchorNodes
      .map(node => sourceLayout.value.positions.get(node.id))
      .filter((position): position is { x: number; y: number } => Boolean(position))
    const anchorCenterX = anchorPositions.length
      ? anchorPositions.reduce((sum, position) => sum + position.x, 0) / anchorPositions.length
      : 330 + width / 2
    const desiredY = anchorPositions.length
      ? anchorPositions.reduce((sum, position) => sum + position.y, 0) / anchorPositions.length - height / 2
      : nextY
    const x = Math.max(230, anchorCenterX - width / 2)
    const relatedComponentBottom = Math.max(0, ...anchorNodes.map(node => {
      const port = sourceComponentPortInfo.value.get(node.id)
      if (!port) return 0
      const component = visibleNodes.value.find(candidate => candidate.id === port.componentId)
      const position = sourceLayout.value.positions.get(port.componentId)
      return component && position ? position.y + nodeHeight(component) / 2 : 0
    }))
    let y = Math.max(nextY, desiredY, relatedComponentBottom ? relatedComponentBottom + 20 : 0)
    const collidingBottom = () => Math.max(0, ...visibleNodes.value.map(node => {
      const position = sourceLayout.value.positions.get(node.id)
      if (!position) return 0
      const overlapsHorizontally = position.x + nodeVisualWidth(node) / 2 + 10 > x
        && position.x - nodeVisualWidth(node) / 2 - 10 < x + width
      const overlapsVertically = position.y + nodeHeight(node) / 2 + 10 > y
        && position.y - nodeHeight(node) / 2 - 10 < y + height
      return overlapsHorizontally && overlapsVertically
        ? position.y + nodeHeight(node) / 2 + 20
        : 0
    }))
    for (let attempt = 0; attempt < 12; attempt++) {
      const nextClearY = collidingBottom()
      if (!nextClearY) break
      y = nextClearY
    }
    const bodyY = y + headerHeight
    const cards: PositionedCard[] = []
    const conditionalBlocks: ConditionalBlock[] = []
    const positionCard = (card: PreparedCard, cardY: number) => {
      const centerY = cardY + card.cardHeight / 2
      const contentStart = x + (width - card.contentWidth) / 2
      const operatorCenterX = contentStart + card.leftWidth + card.connectorLength + card.operatorWidth / 2
      cards.push({
        ...card,
        y: cardY,
        centerY,
        leftY: centerY - card.leftHeight / 2,
        rightY: centerY - card.rightHeight / 2,
        leftX: contentStart,
        operatorCenterX,
        rightX: operatorCenterX + card.operatorWidth / 2 + card.connectorLength,
      })
      return cardY + card.cardHeight
    }
    const layoutItems = (items: ControlItem[], startY: number, depth = 0): number => {
      let cursor = startY
      for (const item of items) {
        if (item.kind === 'statement') { cursor = positionCard(item.card, cursor); continue }
        const blockY = cursor
        cursor += conditionalHeaderHeight
        const branches: ConditionalBlock['branches'] = []
        const block: ConditionalBlock = {
          id: item.conditional.id,
          condition: item.conditional.condition,
          depth,
          x: x + 7 + depth * 8,
          y: blockY,
          width: width - 14 - depth * 16,
          height: 0,
          headerHeight: conditionalHeaderHeight,
          branches,
        }
        conditionalBlocks.push(block)
        const layoutBranch = (kind: 'then' | 'else') => {
          const coverage = kind === 'then' ? item.conditional.thenCoverage : item.conditional.elseCoverage
          const branchY = cursor
          cursor += branchHeaderHeight
          const contentStartY = cursor
          cursor = layoutItems(itemsFor(item.conditional.id, kind), cursor, depth + 1)
          if (cursor === contentStartY) cursor += emptyBranchHeight
          cursor += branchBottomPadding
          const fullLabel = sourceBranchCoverageLabel(kind === 'then' ? 'Then' : 'Else', coverage)
          branches.push({
            kind,
            status: coverage.status,
            label: truncate(fullLabel, 56),
            fullLabel,
            y: branchY,
            height: cursor - branchY,
          })
        }
        layoutBranch('then')
        if (item.conditional.hasElse) layoutBranch('else')
        block.height = cursor - blockY
      }
      return cursor
    }
    layoutItems(rootItems, bodyY)
    const headerParts = source.kind === 'loop' ? splitLoopHeader(source.header) : []
    const frame = {
      id: source.id,
      kind: source.kind,
      x,
      y,
      width,
      height,
      headerHeight,
      headerParts,
      headerDividers: headerParts.slice(1).map((_, index) => x + width * (index + 1) / headerParts.length),
      bodyY,
      bodyHeight,
      cards,
      conditionalBlocks,
    }
    nextY = y + height + 12
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

function selectGraphNode(node: DisplayNode) {
  selectedSourceNodeId.value = props.graphKind === 'source' ? node.id : null
  emit('select', nodeReferenceId(node))
}

function handleGraphNodeEnter(node: DisplayNode) {
  hoveredGraphNodeId.value = node.id
  if (hoverSuppressedNodeId.value !== node.id) hoverSuppressedNodeId.value = null
  emit('hover', node.id)
}

function handleGraphNodeLeave(node: DisplayNode) {
  if (hoveredGraphNodeId.value === node.id) hoveredGraphNodeId.value = null
  if (hoverSuppressedNodeId.value === node.id) hoverSuppressedNodeId.value = null
  emit('hover', null)
}

function handleGraphNodeClick(node: DisplayNode) {
  const wasPinned = pinnedExpandedNodeId.value === node.id
  pinnedExpandedNodeId.value = togglePinnedNodeExpansion(
    pinnedExpandedNodeId.value,
    node.id,
    nodeNameIsTruncated(node),
  )
  hoverSuppressedNodeId.value = wasPinned ? node.id : null
  selectGraphNode(node)
}

function handleGraphNodeDoubleClick(node: DisplayNode) {
  if (node.kind === 'signal' || node.kind === 'array-access') emit('navigate-signal', nodeReferenceId(node))
  else if (props.graphKind === 'source' && node.kind === 'component') emit('navigate-template', nodeReferenceId(node))
}

function loopOperandKey(card: Pick<InteractiveLoopCard, 'id'>, side: LoopOperandSide) {
  return `${card.id}:${side}`
}

function loopOperandIsTruncated(card: InteractiveLoopCard, side: LoopOperandSide) {
  return side === 'left' ? card.leftTruncated : card.rightTruncated
}

function isLoopOperandExpanded(card: InteractiveLoopCard, side: LoopOperandSide) {
  if (!loopOperandIsTruncated(card, side)) return false
  const key = loopOperandKey(card, side)
  return pinnedExpandedLoopOperandKey.value === key
    || (hoveredLoopOperandKey.value === key && hoverSuppressedLoopOperandKey.value !== key)
}

function loopOperandRenderedWidth(card: InteractiveLoopCard, side: LoopOperandSide) {
  const collapsedWidth = side === 'left' ? card.leftWidth : card.rightWidth
  if (!isLoopOperandExpanded(card, side)) return collapsedWidth
  return Math.max(collapsedWidth, expandedLoopOperandWidth(
    side === 'left' ? card.left : card.right,
    side === 'left' ? card.leftStyle : card.rightStyle,
    side === 'left' ? card.leftShape : card.rightShape,
  ))
}

function loopOperandRenderedX(card: InteractiveLoopCard, side: LoopOperandSide) {
  if (side === 'right') return card.rightX
  return card.leftX + card.leftWidth - loopOperandRenderedWidth(card, side)
}

function loopOperandRenderedShape(card: InteractiveLoopCard, side: LoopOperandSide) {
  const shape = side === 'left' ? card.leftShape : card.rightShape
  return isLoopOperandExpanded(card, side) && shape === 'circle' ? 'capsule' : shape
}

function loopOperandDisplayLabel(card: InteractiveLoopCard, side: LoopOperandSide) {
  if (isLoopOperandExpanded(card, side)) return side === 'left' ? card.left : card.right
  return side === 'left' ? card.leftDisplayLabel : card.rightDisplayLabel
}

function loopCardsForRender<T extends InteractiveLoopCard>(cards: T[]): T[] {
  return [...cards].sort((left, right) =>
    Number(isLoopOperandExpanded(left, 'left') || isLoopOperandExpanded(left, 'right'))
      - Number(isLoopOperandExpanded(right, 'left') || isLoopOperandExpanded(right, 'right')),
  )
}

function handleLoopOperandEnter(card: InteractiveLoopCard, side: LoopOperandSide) {
  const key = loopOperandKey(card, side)
  hoveredLoopOperandKey.value = key
  if (hoverSuppressedLoopOperandKey.value !== key) hoverSuppressedLoopOperandKey.value = null
}

function handleLoopOperandLeave(card: InteractiveLoopCard, side: LoopOperandSide) {
  const key = loopOperandKey(card, side)
  if (hoveredLoopOperandKey.value === key) hoveredLoopOperandKey.value = null
  if (hoverSuppressedLoopOperandKey.value === key) hoverSuppressedLoopOperandKey.value = null
}

function handleLoopOperandClick(card: InteractiveLoopCard, side: LoopOperandSide) {
  const key = loopOperandKey(card, side)
  const wasPinned = pinnedExpandedLoopOperandKey.value === key
  pinnedExpandedLoopOperandKey.value = togglePinnedNodeExpansion(
    pinnedExpandedLoopOperandKey.value,
    key,
    loopOperandIsTruncated(card, side),
  )
  hoverSuppressedLoopOperandKey.value = wasPinned ? key : null
}

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
    memberLabelGroupIds: ReadonlySet<string>,
    labelPrefix = '',
  ) => {
    const signal = signalById.get(signalId)
    const qualifiedName = signal?.qualifiedName ?? 's' + signalId
    const group = groupBySignalId.get(signalId)
    if (group) {
      const showMemberLabel = memberLabelGroupIds.has(group.id)
      const displayName = showMemberLabel ? qualifiedName : group.displayQualifiedName
      nodes.push({
        id,
        referenceId: group.id,
        label: `${labelPrefix}${shortConstraintSignalName(displayName)}`,
        kind: 'signal',
        role: group.role,
        status: group.status,
        badge: group.mockSupplied ? 'MOCK OUTPUT' : undefined,
        constraintIndex,
        aggregate: !showMemberLabel,
        tooltip: showMemberLabel
          ? `${qualifiedName} · member of ${group.displayQualifiedName}`
          : group.displayQualifiedName + ' (' + group.memberSignalIds.length + ' elements)',
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
    memberLabelGroupIds: ReadonlySet<string>,
  ): string => {
    const id = `${constraintId}:expression:${path}`
    if (expression.kind === 'signal') return addSignalNode(expression.signalId, id, constraintIndex, memberLabelGroupIds)
    if (expression.kind === 'constant') {
      nodes.push({ id, label: expression.value, kind: 'constant', constraintIndex })
      return id
    }
    const negatedId = negatedSignalId(expression)
    if (negatedId !== undefined) return addSignalNode(negatedId, id, constraintIndex, memberLabelGroupIds, '-')
    nodes.push({
      id,
      referenceId: constraintId,
      label: expression.kind === 'mul' ? 'x' : '+',
      kind: 'operation',
      role: 'constraint-expression',
      constraintIndex,
    })
    expression.operands.forEach((operand, operandIndex) => {
      const operandId = addExpression(operand, constraintId, constraintIndex, `${path}:${operandIndex}`, memberLabelGroupIds)
      edges.push({ id: `${id}:operand:${operandIndex}`, source: operandId, target: id, kind: 'data' })
    })
    return id
  }

  for (const family of projectedConstraintFamilies.value) {
    const highlightedIds = new Set([...focusNodeIds.value, ...issueNodeIds.value, ...activeIssueNodeIds.value])
    const constraint = family.constraints.find(candidate => highlightedIds.has(candidate.id)) ?? family.constraints[0]
    const equation = constraint.equation
    const memberLabelGroupIds = signalGroupsRequiringMemberLabels(graph, equation)
    const leftRoot = addExpression(equation.left, constraint.id, constraint.index, 'left', memberLabelGroupIds)
    const rightRoot = addExpression(equation.right, constraint.id, constraint.index, 'right', memberLabelGroupIds)
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

const sourceDirectEdges = computed(() => {
  const graph = props.sourceGraph
  if (!graph) return []
  const collapsedNodeIds = new Set(graph.nodes
    .filter(node => node.kind === 'assignment' || node.kind === 'source-constraint')
    .map(node => node.id))
  return graph.edges.filter(edge =>
    !collapsedNodeIds.has(edge.source)
    && !collapsedNodeIds.has(edge.target)
    && !sourceStatementProjection.value.hiddenEdgeIds.has(edge.id)
    && !sourceOpaqueExpressionProjection.value.hiddenEdgeIds.has(edge.id)
    && edge.kind !== 'component-input'
    && edge.kind !== 'component-output',
  ).map(edge => ({
    ...edge,
    source: sourceOpaqueExpressionProjection.value.replacementNodeIdBySourceNodeId.get(edge.source) ?? edge.source,
    target: sourceOpaqueExpressionProjection.value.replacementNodeIdBySourceNodeId.get(edge.target) ?? edge.target,
  }))
})

const sourceStatementProjection = computed(() => {
  const graph = props.sourceGraph
  return graph
    ? projectSourceStatements(graph)
    : { nodes: [], edges: [], lanes: [], hiddenNodeIds: new Set<string>(), hiddenEdgeIds: new Set<string>(), statementIds: new Set<string>() }
})

const sourceOpaqueExpressionProjection = computed(() => {
  const graph = props.sourceGraph
  return graph
    ? projectSourceOpaqueExpressions(graph, sourceStatementProjection.value.hiddenNodeIds)
    : { nodes: [], replacementNodeIdBySourceNodeId: new Map<string, string>(), hiddenNodeIds: new Set<string>(), hiddenEdgeIds: new Set<string>() }
})

const sourceArrayAccessProjection = computed(() => {
  const graph = props.sourceGraph
  if (!graph) return { nodes: [], accessNodeIdByEdgeId: new Map<string, string>() }
  const candidateEdges = graph.edges.filter(edge =>
    relevantSourceIds.value.has(edge.source)
    && relevantSourceIds.value.has(edge.target)
    && !sourceLoopHiddenNodeIds.value.has(edge.source)
    && !sourceLoopHiddenNodeIds.value.has(edge.target)
    && !sourceStatementProjection.value.hiddenEdgeIds.has(edge.id)
    && !sourceOpaqueExpressionProjection.value.hiddenEdgeIds.has(edge.id)
    && !edge.target.startsWith('assignment:'),
  )
  return projectSourceArrayAccesses(graph, candidateEdges)
})

const hiddenSourceArrayFamilyIds = computed(() => {
  const graph = props.sourceGraph
  if (!graph) return new Set<string>()
  const accessNodeIdByEdgeId = sourceArrayAccessProjection.value.accessNodeIdByEdgeId
  const familyIds = new Set(sourceArrayAccessProjection.value.nodes.map(node => node.familyNodeId))
  const relevantEdges = graph.edges.filter(edge =>
    relevantSourceIds.value.has(edge.source)
    && relevantSourceIds.value.has(edge.target)
    && !sourceLoopHiddenNodeIds.value.has(edge.source)
    && !sourceLoopHiddenNodeIds.value.has(edge.target),
  )
  return new Set([...familyIds].filter(familyId => !relevantEdges.some(edge =>
    edge.target === familyId
    || (edge.source === familyId && !accessNodeIdByEdgeId.has(edge.id)),
  )))
})

const allNodes = computed<DisplayNode[]>(() => {
  if (props.graphKind === 'source') {
    const sourceNodes = (props.sourceGraph?.nodes ?? [])
      .filter(node => relevantSourceIds.value.has(node.id) && !sourceLoopHiddenNodeIds.value.has(node.id) && !sourceStatementProjection.value.hiddenNodeIds.has(node.id) && !sourceOpaqueExpressionProjection.value.hiddenNodeIds.has(node.id) && !hiddenSourceArrayFamilyIds.value.has(node.id) && node.kind !== 'assignment' && node.kind !== 'source-constraint' && (node.kind !== 'component-group' || node.componentPath !== 'main'))
      .map(node => {
        const port = sourceComponentPortInfo.value.get(node.id)
        return {
          id: node.id,
          label: port?.label ?? (node.statePhase === 'final' && node.stateVariable
            ? node.stateVariable
            : node.kind === 'signal' || node.kind === 'variable'
            ? node.localName ?? node.label
            : node.kind === 'component-group' ? node.templateName ?? node.label
            : node.kind === 'operation' ? operationLabel(node.operation, node.label) : node.label),
          kind: port ? 'component-port' : node.kind === 'component-group' ? 'component' : node.kind,
          componentInstanceName: node.kind === 'component-group' ? node.localName ?? node.componentPath?.split('.').pop() : undefined,
          componentTemplateName: node.kind === 'component-group' ? node.templateName ?? node.label : undefined,
          parentComponentId: port?.componentId,
          portDirection: port?.direction,
          portCount: node.kind === 'component-group' ? sourceComponentPortCounts.value.get(node.id) ?? 0 : undefined,
          role: node.role,
          status: node.mocked || node.role?.startsWith('mock-') ? 'mocked' : undefined,
          badge: node.role?.startsWith('mock-') ? 'MOCK' : undefined,
          initialExpression: node.initialExpression,
          initialValue: node.initialValue,
          tooltip: node.kind === 'component-group'
            ? componentNodePresentation(
              node.localName ?? node.componentPath?.split('.').pop() ?? node.label,
              node.templateName ?? node.label,
            ).tooltip
            : node.kind === 'variable'
              ? variableTooltip(node.localName ?? node.label, node.initialExpression, node.initialValue)
              : node.declaredArrayDimensions && node.arrayDimensions
              && node.declaredArrayDimensions.join('|') !== node.arrayDimensions.join('|')
              ? `${node.qualifiedName} · declared [${node.declaredArrayDimensions.join('][')}]`
              : node.qualifiedName,
          loopId: node.loopId,
          statementId: node.statementId,
          statePhase: node.statePhase,
        }
      })
    const accessNodes: DisplayNode[] = sourceArrayAccessProjection.value.nodes.map(node => ({
      id: node.id,
      referenceId: node.familyNodeId,
      label: node.label,
      kind: 'array-access',
      role: node.role,
      tooltip: `${node.qualifiedName} · indexed access`,
    }))
    const statementNodes: DisplayNode[] = sourceStatementProjection.value.nodes.map(node => ({
      id: node.id,
      referenceId: node.referenceId,
      label: node.label,
      kind: node.kind === 'reference'
        ? 'statement-reference'
        : node.kind === 'constant' ? 'constant' : 'source-expression',
      role: node.role,
      memberNodeIds: node.memberNodeIds,
      tooltip: node.tooltip,
      statementId: node.statementId,
      statementSide: node.side,
    }))
    const opaqueExpressionNodes: DisplayNode[] = sourceOpaqueExpressionProjection.value.nodes
      .filter(node => relevantSourceIds.value.has(node.sourceNodeId))
      .map(node => ({
        id: node.id,
        referenceId: node.sourceNodeId,
        label: node.label,
        kind: 'source-expression',
        memberNodeIds: node.memberNodeIds,
        tooltip: node.label,
      }))
    return [...sourceNodes, ...accessNodes, ...statementNodes, ...opaqueExpressionNodes]
  }
  return constraintDisplay.value.nodes
})

const allEdges = computed<DisplayEdge[]>(() => {
  if (props.graphKind === 'source') {
    const graph = props.sourceGraph
    if (!graph) return []
    const direct: DisplayEdge[] = sourceDirectEdges.value
      .map(edge => {
        const target = graph.nodes.find(node => node.id === edge.target)
        const operandRole: DisplayEdge['operandRole'] = target?.kind === 'operation' && target.operation === 'sub'
          ? edge.operandIndex === 0 ? 'minuend' : edge.operandIndex === 1 ? 'subtrahend' : undefined
          : undefined
        const accessNodeId = sourceArrayAccessProjection.value.accessNodeIdByEdgeId.get(edge.id)
        return {
          id: edge.id,
          source: accessNodeId ?? edge.source,
          target: edge.target,
          kind: edge.kind,
          label: accessNodeId ? edge.operator ?? operandRole : edge.label ?? edge.operator ?? operandRole,
          operandIndex: edge.operandIndex,
          operandRole,
          memberEdgeIds: accessNodeId ? [edge.id] : undefined,
        }
      })
    direct.push(...projectSourceAssignments(graph)
      .filter(edge => !sourceStatementProjection.value.statementIds.has(edge.assignmentId))
      .map(edge => ({
        ...edge,
        source: sourceOpaqueExpressionProjection.value.replacementNodeIdBySourceNodeId.get(edge.source) ?? edge.source,
        target: sourceOpaqueExpressionProjection.value.replacementNodeIdBySourceNodeId.get(edge.target) ?? edge.target,
      })))
    direct.push(...sourceStatementProjection.value.edges)
    for (const relation of graph.nodes.filter(node => node.kind === 'source-constraint' && !sourceStatementProjection.value.statementIds.has(node.id))) {
      const operands = graph.edges.filter(edge => edge.target === relation.id)
      if (operands.length < 2) continue
      direct.push({
        id: `collapsed:${relation.id}`,
        source: sourceArrayAccessProjection.value.accessNodeIdByEdgeId.get(operands[0]!.id)
          ?? sourceOpaqueExpressionProjection.value.replacementNodeIdBySourceNodeId.get(operands[0]!.source)
          ?? operands[0]!.source,
        target: sourceArrayAccessProjection.value.accessNodeIdByEdgeId.get(operands[1]!.id)
          ?? sourceOpaqueExpressionProjection.value.replacementNodeIdBySourceNodeId.get(operands[1]!.source)
          ?? operands[1]!.source,
        kind: 'constraint-relation',
        label: '===',
      })
    }
    const projectedNodeIds = new Set([
      ...sourceArrayAccessProjection.value.nodes.map(node => node.id),
      ...sourceOpaqueExpressionProjection.value.nodes.map(node => node.id),
    ])
    const statementNodeIds = new Set(sourceStatementProjection.value.nodes.map(node => node.id))
    const isRelevant = (nodeId: string) => relevantSourceIds.value.has(nodeId) || projectedNodeIds.has(nodeId) || statementNodeIds.has(nodeId)
    return direct.filter(edge => isRelevant(edge.source) && isRelevant(edge.target))
  }
  return constraintDisplay.value.edges
})

const visibleNodes = computed(() => allNodes.value)
const visibleNodesForRender = computed(() => [...visibleNodes.value].sort((left, right) =>
  Number(isNodeNameExpanded(left)) - Number(isNodeNameExpanded(right)),
))
const visibleNodeIds = computed(() => new Set(visibleNodes.value.map(node => node.id)))
const visibleNodeById = computed(() => new Map(visibleNodes.value.map(node => [node.id, node])))
const visibleEdges = computed(() => allEdges.value.filter(edge => visibleNodeIds.value.has(edge.source) && visibleNodeIds.value.has(edge.target)))
const selectedSourceSignalId = computed(() => {
  if (props.graphKind !== 'source' || !props.selectedNodeId) return null
  const selectedNode = props.sourceGraph?.nodes.find(node => node.id === props.selectedNodeId)
  return selectedNode?.kind === 'signal' ? selectedNode.id : null
})
const containingExpressionNodeIds = computed(() => containingNodeIds(
  selectedSourceSignalId.value,
  visibleNodes.value.filter(node => node.kind === 'source-expression'),
))
const selectedSourceNodeEdgeIds = computed(() => {
  if (props.graphKind !== 'source') return new Set<string>()
  return connectedEdgeIds(selectedSourceNodeId.value, visibleEdges.value)
})
const outputOperatorEdges = computed(() => props.graphKind === 'source'
  ? visibleEdges.value.filter(edge => ['===', '<==', '==>', '-->', '<--'].includes(outputOperatorLabel(edge.label, edge.kind)))
  : visibleEdges.value.filter(edge => edge.kind === 'constraint-equality'))
const outputOperatorEdgeIds = computed(() => new Set(outputOperatorEdges.value.map(edge => edge.id)))
const labeledEdges = computed(() => visibleEdges.value
  .filter(edge => edge.label && !outputOperatorEdgeIds.value.has(edge.id))
  .slice(0, 120))

watch(() => props.selectedNodeId, selectedNodeId => {
  const selectedSourceNode = selectedSourceNodeId.value
    ? visibleNodeById.value.get(selectedSourceNodeId.value)
    : undefined
  if (!selectedSourceNode || selectedNodeId !== nodeReferenceId(selectedSourceNode)) {
    selectedSourceNodeId.value = null
  }
})

watch(visibleNodeIds, nodeIds => {
  if (selectedSourceNodeId.value && !nodeIds.has(selectedSourceNodeId.value)) {
    selectedSourceNodeId.value = null
  }
})

const sourceLayout = computed(() => {
  const map = new Map<string, { x: number; y: number }>()
  const nodeById = new Map(visibleNodes.value.map(node => [node.id, node]))
  const statementNodeIds = new Set(sourceStatementProjection.value.nodes.map(node => node.id))
  const portNodes = visibleNodes.value.filter(node => node.kind === 'component-port')
  const layoutNodes = visibleNodes.value.filter(node => node.kind !== 'component-port' && !statementNodeIds.has(node.id))
  const entityId = (nodeId: string) => nodeById.get(nodeId)?.parentComponentId ?? nodeId
  const incoming = new Map<string, Set<string>>()
  const outgoing = new Map<string, Set<string>>()
  const addDependency = (sourceId: string, targetId: string) => {
    const source = entityId(sourceId)
    const target = entityId(targetId)
    if (source === target || !nodeById.has(source) || !nodeById.has(target)) return
    ;(incoming.get(target) ?? incoming.set(target, new Set()).get(target)!).add(source)
    ;(outgoing.get(source) ?? outgoing.set(source, new Set()).get(source)!).add(target)
  }
  visibleEdges.value
    .filter(edge => !edge.kind.startsWith('source-') || !edge.kind.endsWith('-statement'))
    .forEach(edge => addDependency(edge.source, edge.target))

  const graphEdges = props.sourceGraph?.edges ?? []
  const visibleLayoutNodeIds = new Set(layoutNodes.map(node => node.id))
  for (const assignment of (props.sourceGraph?.nodes ?? []).filter(node => node.kind === 'assignment' && node.loopId)) {
    const target = graphEdges.find(edge => edge.source === assignment.id)?.target
    if (!target) continue
    const sourceRoots = graphEdges.filter(candidate => candidate.target === assignment.id).map(edge => edge.source)
    for (const sourceId of visibleSourcePredecessorIds(sourceRoots, graphEdges, visibleLayoutNodeIds)) {
      addDependency(sourceId, target)
    }
  }

  const depthCache = new Map<string, number>()
  const operationDepth = (id: string, visiting = new Set<string>()): number => {
    if (depthCache.has(id)) return depthCache.get(id)!
    if (visiting.has(id)) return 0
    const next = new Set(visiting).add(id)
    const predecessors = [...(incoming.get(id) ?? [])]
    const depth = predecessors.length ? Math.max(...predecessors.map(parent => operationDepth(parent, next))) + 1 : 0
    depthCache.set(id, depth)
    return depth
  }
  layoutNodes.forEach(node => operationDepth(node.id))
  const baseLayoutDepth = (node: DisplayNode) => {
    if (node.kind !== 'constant') return operationDepth(node.id)
    const consumerDepths = [...(outgoing.get(node.id) ?? [])].map(consumer => operationDepth(consumer))
    return consumerDepths.length ? Math.max(0, Math.min(...consumerDepths) - 1) : 0
  }
  const inputs = layoutNodes.filter(node => node.kind === 'signal' && (node.role === 'input' || node.role === 'mock-input'))
  const outputs = layoutNodes.filter(node => node.kind === 'signal' && (node.role === 'output' || node.role === 'mock-output'))
  const terminalOutputIds = new Set(outputs
    .filter(node => !(outgoing.get(node.id)?.size))
    .map(node => node.id))
  const baseDepthByNodeId = new Map(layoutNodes.map(node => [node.id, baseLayoutDepth(node)]))
  const finalOutputDepth = terminalOutputColumn(baseDepthByNodeId, terminalOutputIds)
  const layoutDepth = (node: DisplayNode) => terminalOutputIds.has(node.id)
    ? finalOutputDepth
    : baseDepthByNodeId.get(node.id) ?? 0
  const sinkIndex = new Map(outputs.map((node, index) => [node.id, index]))
  const sinkCache = new Map<string, Set<number>>()
  const reachableSinks = (id: string, visiting = new Set<string>()): Set<number> => {
    if (sinkCache.has(id)) return sinkCache.get(id)!
    if (visiting.has(id)) return new Set()
    const sinks = new Set<number>()
    const ownSink = sinkIndex.get(id)
    if (ownSink !== undefined) sinks.add(ownSink)
    const next = new Set(visiting).add(id)
    for (const child of outgoing.get(id) ?? []) reachableSinks(child, next).forEach(index => sinks.add(index))
    sinkCache.set(id, sinks)
    return sinks
  }
  const desiredY = (node: DisplayNode, fallbackIndex: number) => {
    const sinks = [...reachableSinks(node.id)]
    if (!sinks.length) return 150 + fallbackIndex * 110
    return 170 + sinks.reduce((sum, index) => sum + index * 480, 0) / sinks.length
  }
  const columns = new Map<number, DisplayNode[]>()
  layoutNodes.forEach(node => {
    const depth = layoutDepth(node)
    const column = columns.get(depth) ?? []
    column.push(node)
    columns.set(depth, column)
  })
  const columnCenters = sourceColumnCenters([...columns].map(([depth, column]) => ({
    depth,
    width: Math.max(...column.map(node => nodeVisualWidth(node))),
    minimumStepBefore: column.some(node => terminalOutputIds.has(node.id)) && (props.sourceGraph?.loops.length ?? 0) > 0
      ? 640
      : undefined,
  })))
  for (const [depth, column] of columns) {
    const ordered = column
      .map((node, index) => ({ node, desired: desiredY(node, index) }))
      .sort((left, right) => left.desired - right.desired)
    let cursor = 60
    for (const entry of ordered) {
      const halfHeight = nodeHeight(entry.node) / 2
      const y = Math.max(entry.desired, cursor + halfHeight)
      map.set(entry.node.id, { x: columnCenters.get(depth) ?? 150, y })
      cursor = y + halfHeight + 92
    }
  }

  for (const component of layoutNodes.filter(node => node.kind === 'component')) {
    const position = map.get(component.id)
    if (!position) continue
    const ports = portNodes
      .filter(port => port.parentComponentId === component.id)
      .sort((left, right) => left.portDirection === right.portDirection ? 0 : left.portDirection === 'input' ? -1 : 1)
    const rowTop = position.y - nodeHeight(component) / 2 + 78
    ports.forEach((port, index) => {
      map.set(port.id, {
        x: position.x + (port.portDirection === 'input' ? -1 : 1) * nodeWidth(component) / 2,
        y: rowTop + index * 32,
      })
    })
  }

  const statementLanes = [...sourceStatementProjection.value.lanes]
    .sort((left, right) => left.sourceLine - right.sourceLine || left.id.localeCompare(right.id))
  if (statementLanes.length) {
    const leftNodes = statementLanes
      .map(lane => nodeById.get(lane.leftNodeId))
      .filter((node): node is DisplayNode => Boolean(node))
    const rightNodes = statementLanes
      .map(lane => nodeById.get(lane.rightNodeId))
      .filter((node): node is DisplayNode => Boolean(node))
    const leftWidth = Math.max(120, ...leftNodes.map(node => nodeVisualWidth(node)))
    const rightWidth = Math.max(120, ...rightNodes.map(node => nodeVisualWidth(node)))
    const hasComponentTopology = layoutNodes.some(node => node.kind === 'component')
    const hasVisibleIncidentEdge = (nodeId: string) => visibleEdges.value.some(edge => edge.source === nodeId || edge.target === nodeId)
    const orphanInputs = hasComponentTopology ? [] : inputs.filter(node => !hasVisibleIncidentEdge(node.id))
    const orphanOutputs = hasComponentTopology ? [] : outputs.filter(node => !hasVisibleIncidentEdge(node.id))
    const statementColumns = sourceStatementColumnCenters({
      left: leftWidth,
      right: rightWidth,
      leftBoundary: Math.max(0, ...orphanInputs.map(node => nodeVisualWidth(node))),
      rightBoundary: Math.max(0, ...orphanOutputs.map(node => nodeVisualWidth(node))),
    })
    const topologyBottom = Math.max(0, ...layoutNodes.map(node => {
      const position = map.get(node.id)
      return position ? position.y + nodeHeight(node) / 2 : 0
    }))
    const laneTop = hasComponentTopology ? topologyBottom + 100 : 100
    statementLanes.forEach((lane, index) => {
      const y = laneTop + index * 86
      map.set(lane.leftNodeId, { x: statementColumns.left, y })
      map.set(lane.rightNodeId, { x: statementColumns.right, y })
    })

    if (!hasComponentTopology) {
      orphanInputs.forEach((node, index) => map.set(node.id, { x: statementColumns.leftBoundary!, y: laneTop + index * 86 }))
      orphanOutputs.forEach((node, index) => map.set(node.id, { x: statementColumns.rightBoundary!, y: laneTop + index * 86 }))
    }
  }

  const internalNodes = layoutNodes.filter(node => !inputs.includes(node) && !outputs.includes(node))
  const internalRight = Math.max(580, ...internalNodes.map(node => {
    const position = map.get(node.id)
    return position ? position.x + nodeVisualWidth(node) / 2 : 0
  }))
  const boundaryRight = internalRight + 58
  const boundaryLeft = Math.max(190, ...inputs.map(node => {
    const position = map.get(node.id)
    return position ? position.x + nodeVisualWidth(node) / 2 + 24 : 190
  }))
  return { positions: map, boundaryLeft, boundaryRight }
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
  const connections: Array<{ id: string; kind: 'variable' | 'output' | 'signal'; path: string }> = []
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
        const externalNodes: Array<{ kind: 'variable' | 'output' | 'signal'; node: DisplayNode }> = []
        if (operand.style === 'variable') {
          const externalNode = visibleNodes.value.find(node => node.kind === 'variable' && node.loopId === frame.id && node.statePhase === 'final' && referencesMatch(node.label, operand.label))
            ?? visibleNodes.value.find(node => node.kind === 'variable' && referencesMatch(node.label, operand.label))
          if (externalNode) externalNodes.push({ kind: 'variable', node: externalNode })
        } else if (operand.side === 'right' && operand.style === 'output' && ['-->', '==>'].includes(card.operator)) {
          const externalNode = visibleNodes.value.find(node => node.kind === 'signal' && (node.role === 'output' || node.role === 'mock-output') && referencesMatch(node.label, operand.label))
          if (externalNode) externalNodes.push({ kind: 'output', node: externalNode })
        } else {
          for (const sourceReference of loopReferenceNodes(operand.label)) {
            const externalNode = visibleNodes.value.find(node => node.id === sourceReference.id)
            if (!externalNode) continue
            if (externalNode.kind === 'signal' || externalNode.kind === 'component-port') externalNodes.push({ kind: 'signal', node: externalNode })
            else if (externalNode.kind === 'variable') externalNodes.push({ kind: 'variable', node: externalNode })
          }
        }
        for (const { kind, node: externalNode } of externalNodes) {
          const connectionKey = `${frame.id}:${card.id}:${kind}:${operand.side}:${externalNode.id}`
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
watch([canvasWidth, canvasHeight, () => visibleNodes.value.length, exactConstraintPage], async () => {
  await nextTick()
  if (!svgRef.value) return
  if (!zoomBehavior || zoomTarget !== svgRef.value) initializeZoom()
  fitReadableView()
}, { flush: 'post' })
function isSignalLikeNode(node: DisplayNode) {
  return node.kind === 'signal' || node.kind === 'array-access' || node.kind === 'statement-reference'
}
function isValueNode(node: DisplayNode) {
  return node.kind === 'constant' || node.kind === 'ternary-result' || (
    isSignalLikeNode(node) && ['input', 'mock-input', 'output', 'mock-output'].includes(node.role ?? '')
  )
}
function valueNeedsRectangle(node: DisplayNode) {
  return isValueNode(node) && node.label.length > 4
}
function collapsedNodeLabel(node: DisplayNode) {
  return truncate(
    node.label,
    node.kind === 'source-expression' ? 52 : isSignalLikeNode(node) ? 20 : node.kind === 'constraint-term' ? 38 : node.kind === 'constraint' ? 31 : isValueNode(node) ? 20 : 26,
  )
}
function nodeNameIsTruncated(node: DisplayNode) {
  if (node.kind === 'component') {
    const presentation = componentPresentation(node)
    return presentation.instanceLabel !== (node.componentInstanceName ?? node.label)
      || presentation.templateLabel !== (node.componentTemplateName ?? node.label)
  }
  if (node.kind === 'component-port' || isSvgOperationNode(node)) return false
  return collapsedNodeLabel(node) !== node.label
}
function isNodeNameExpanded(node: DisplayNode) {
  if (!nodeNameIsTruncated(node)) return false
  return pinnedExpandedNodeId.value === node.id
    || (hoveredGraphNodeId.value === node.id && hoverSuppressedNodeId.value !== node.id)
}
function displayNodeLabel(node: DisplayNode) {
  return isNodeNameExpanded(node) ? node.label : collapsedNodeLabel(node)
}
function nodeFontSizeForLabel(node: DisplayNode, label: string) {
  const length = label.length
  if (node.kind === 'operation') return 22
  if (node.kind === 'ternary-condition') return 15
  if (node.kind === 'component') return 16
  if (node.kind === 'source-expression') return length > 40 ? 13 : 15
  if (node.kind === 'variable') return length > 17 ? 14 : length > 12 ? 16 : 18
  if (node.kind === 'constraint-term') return length > 20 ? 13 : length > 14 ? 14 : 16
  if (isSignalLikeNode(node) && !isValueNode(node)) return length > 17 ? 13 : length > 12 ? 14 : 16
  if (isValueNode(node)) return length > 17 ? 14 : length > 12 ? 16 : 18
  return length > 20 ? 11 : 13
}
function nodeFontSize(node: DisplayNode) {
  return nodeFontSizeForLabel(node, displayNodeLabel(node))
}
function componentPresentation(node: DisplayNode) {
  return componentNodePresentation(
    node.componentInstanceName ?? node.label,
    node.componentTemplateName ?? node.label,
  )
}
function displayComponentInstanceLabel(node: DisplayNode) {
  return isNodeNameExpanded(node)
    ? node.componentInstanceName ?? node.label
    : componentPresentation(node).instanceLabel
}
function displayComponentTemplateLabel(node: DisplayNode) {
  return isNodeNameExpanded(node)
    ? node.componentTemplateName ?? node.label
    : componentPresentation(node).templateLabel
}
function nodeWidth(node: DisplayNode) {
  if (node.kind === 'constraint') return 320
  if (node.kind === 'component') return componentPresentation(node).width
  if (node.kind === 'component-port') return 8
  const label = collapsedNodeLabel(node)
  const fontSize = nodeFontSizeForLabel(node, label)
  if (node.kind === 'source-expression') return Math.min(480, Math.max(160, label.length * fontSize * 0.62 + 36))
  if (node.kind === 'ternary-condition') return Math.min(190, Math.max(130, label.length * 10 + 48))
  const labelWidth = label.length * fontSize * 0.62
  if (node.kind === 'constraint-term') return Math.min(360, Math.max(96, labelWidth + 34))
  if (isSignalLikeNode(node) || node.kind === 'constant') return Math.min(270, Math.max(76, labelWidth + 34))
  return Math.min(280, Math.max(82, labelWidth + 30))
}
function renderedNodeWidth(node: DisplayNode) {
  const collapsedWidth = nodeWidth(node)
  if (!isNodeNameExpanded(node)) return collapsedWidth
  if (node.kind === 'component') {
    const instanceWidth = (node.componentInstanceName ?? node.label).length * 24 * 0.62 + 40
    const templateWidth = (node.componentTemplateName ?? node.label).length * 16 * 0.62 + 40
    return Math.max(collapsedWidth, instanceWidth, templateWidth)
  }
  const padding = node.kind === 'ternary-condition' || node.kind === 'constraint' ? 48 : 36
  return Math.max(collapsedWidth, node.label.length * nodeFontSize(node) * 0.62 + padding)
}
function nodeHeight(node: DisplayNode) {
  if (node.kind === 'component') return Math.max(126, 78 + (node.portCount ?? 0) * 32)
  if (node.kind === 'component-port') return 20
  if (node.kind === 'source-expression') return 48
  if (node.kind === 'variable') return 48
  if (node.kind === 'ternary-condition') return 82
  return isSignalLikeNode(node) || valueNeedsRectangle(node) || node.kind === 'constraint-term' ? 48 : 40
}
function diamondPoints(node: DisplayNode) {
  const halfWidth = renderedNodeWidth(node) / 2
  const halfHeight = nodeHeight(node) / 2
  return `0,${-halfHeight} ${halfWidth},0 0,${halfHeight} ${-halfWidth},0`
}
function nodeCornerRadius(node: DisplayNode) {
  if (node.kind === 'component') return 8
  if (node.kind === 'source-expression') return 24
  return node.kind === 'constraint' ? 8 : isSignalLikeNode(node) || valueNeedsRectangle(node) || node.kind === 'constraint-term' ? 24 : 18
}
function isSvgOperationNode(node: DisplayNode) {
  return node.kind === 'operation' && (node.label === '+' || node.label === '-' || node.label === 'x')
}
function isCircleNode(node: DisplayNode) {
  return node.kind === 'operation' || node.kind === 'variable' || (isValueNode(node) && !valueNeedsRectangle(node))
}
function isRenderedCircleNode(node: DisplayNode) {
  return isCircleNode(node) && !isNodeNameExpanded(node)
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
  if (node.kind === 'component-port') return center

  const dx = opposite.x - center.x
  const dy = opposite.y - center.y
  if (dx === 0 && dy === 0) return center

  if (node.kind === 'ternary-condition') {
    const halfWidth = renderedNodeWidth(node) / 2
    const halfHeight = nodeHeight(node) / 2
    const scale = 1 / (Math.abs(dx) / halfWidth + Math.abs(dy) / halfHeight)
    return { x: center.x + dx * scale, y: center.y + dy * scale }
  }

  if (isSvgOperationNode(node) || isRenderedCircleNode(node)) {
    const radius = isSvgOperationNode(node) ? 21 : nodeCircleRadius(node)
    const scale = radius / Math.hypot(dx, dy)
    return { x: center.x + dx * scale, y: center.y + dy * scale }
  }

  const halfWidth = renderedNodeWidth(node) / 2
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

const outputOperatorLabel = (operator?: string, edgeKind?: string) => {
  if (edgeKind?.startsWith('source-') && edgeKind.endsWith('-statement')) return operator ?? '='
  if (edgeKind === 'witness-assignment') return operator ?? '='
  if (operator === '<==') return '==>'
  if (operator === '<--') return '-->'
  return operator ?? '='
}
const operatorBadgeWidth = (edge: DisplayEdge) => edge.kind === 'constraint-equality'
  ? 54
  : (edge.multiplicity ?? 1) > 1 ? 62 : 40
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

.conditional-legend-box {
  background: rgba(71, 85, 105, 0.08);
  border: 1.5px dashed #64748b;
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

.source-loop-frame,
.constraint-loop-frame {
  cursor: pointer;
}

.loop-code-card,
.loop-operand-node {
  outline: none;
}

.loop-operand-node {
  cursor: pointer;
}

.loop-operand-node.name-expanded {
  filter: drop-shadow(0 4px 7px rgba(15, 23, 42, 0.24));
}

.loop-operand-node.name-expanded .code-operand {
  stroke-width: 2.8;
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

.conditional-frame-box {
  fill: rgba(71, 85, 105, 0.035);
  stroke: #64748b;
  stroke-width: 1.25;
  stroke-dasharray: 5 3;
}

.conditional-header-band {
  fill: rgba(71, 85, 105, 0.12);
  stroke: none;
}

.conditional-header-label {
  fill: #334155;
  font-size: 13px;
  font-weight: 750;
}

.conditional-branch-box {
  fill: rgba(255, 255, 255, 0.3);
  stroke: #cbd5e1;
  stroke-width: 1;
}

.conditional-branch-label {
  fill: #475569;
  font-size: 11px;
  font-weight: 700;
}

.conditional-branch.then.active .conditional-branch-box {
  fill: rgba(22, 163, 74, 0.035);
  stroke: rgba(22, 163, 74, 0.45);
}

.conditional-branch.else.active .conditional-branch-box {
  fill: rgba(59, 130, 246, 0.025);
  stroke: rgba(59, 130, 246, 0.4);
}

.conditional-branch.inactive {
  opacity: 0.46;
}

.conditional-branch.inactive .conditional-branch-box,
.conditional-branch.unknown .conditional-branch-box {
  stroke-dasharray: 4 3;
}

.loop-code-card.inactive {
  opacity: 0.42;
}

.loop-code-card.unknown .code-operand,
.loop-code-card.unknown .code-operator {
  stroke-dasharray: 4 3;
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

.graph-edge.source-witness-statement {
  stroke: #d06b32;
  stroke-dasharray: 6 4;
}

.graph-edge.source-constrained-statement {
  stroke: #64748b;
}

.graph-edge.source-constraint-statement {
  stroke: #8b5fbf;
  stroke-dasharray: 4 3;
}

.graph-edge.active {
  stroke: #d26338;
  stroke-width: 3;
  opacity: 1;
}

.graph-edge.node-selected {
  stroke: #dc2626;
  stroke-width: 3.25;
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

.output-operator.node-selected rect {
  stroke: #dc2626;
  stroke-width: 2.5;
}

.output-operator.node-selected text {
  fill: #dc2626;
  font-weight: 800;
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

.graph-node.name-expanded {
  filter: drop-shadow(0 4px 7px rgba(15, 23, 42, 0.24));
}

.graph-node.name-expanded rect,
.graph-node.name-expanded polygon {
  stroke-width: 2.8;
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

.graph-node.component .component-header-divider {
  stroke: #cbd5e1;
  stroke-width: 1;
}

.graph-node.component-port .component-port-anchor {
  fill: #ffffff;
  stroke: #64748b;
  stroke-width: 2;
}

.graph-node.component-port .component-port-label {
  fill: #334155;
  font-size: 13px;
  font-weight: 650;
  pointer-events: none;
}

.graph-node.component-port .component-port-label.output {
  fill: #166534;
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

.graph-node.source-expression rect {
  fill: rgba(100, 116, 139, 0.1);
  stroke: #64748b;
  stroke-width: 2.5;
}

.graph-node.source-expression text {
  fill: #1f2937;
  font-weight: 650;
}

.graph-node.source-expression.contains-selected:not(.selected):not(.linked):not(.issue-attention):not(.issue-active) rect {
  fill: rgba(220, 38, 38, 0.1);
  stroke: #dc2626;
  stroke-width: 3;
  stroke-dasharray: 6 3;
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

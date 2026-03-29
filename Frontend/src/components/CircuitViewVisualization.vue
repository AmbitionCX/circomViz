<template>
  <div class="circuit-visualization h-full w-full flex flex-col overflow-hidden relative">
    <div ref="svgContainer" class="flex-1 min-h-0 relative bg-gray-50 rounded-lg">
      <svg ref="svgRef" class="w-full h-full"></svg>
      <div v-if="!circuitStore.isParsed" class="absolute inset-0 flex items-center justify-center">
        <el-empty description="No circuit loaded" :image-size="80" />
      </div>
    </div>

    <transition name="slide">
      <div
        v-if="detailPanel.visible"
        class="detail-panel absolute top-0 right-0 h-full z-40 bg-white border-l border-gray-200 shadow-xl flex flex-col"
        :style="{ width: '300px' }"
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <span class="text-sm font-semibold text-gray-700">Template Details</span>
          <el-icon class="cursor-pointer text-gray-400 hover:text-gray-600" @click="detailPanel.visible = false">
            <Close />
          </el-icon>
        </div>
        <div class="flex-1 overflow-auto px-4 py-3">
          <div class="mb-3">
            <div class="flex items-center gap-2">
              <span class="text-sm font-bold" :style="templateColorStyle(detailPanel.node?.templateName ?? '')">
                {{ detailPanel.node?.templateName }}
              </span>
              <el-tag v-if="detailPanel.node?.nodeModulesLibrary" size="small" type="info">
                {{ detailPanel.node.nodeModulesLibrary }}
              </el-tag>
            </div>
          </div>

          <div v-if="detailPanel.node?.instanceName" class="mb-2 text-xs text-gray-500">
            Instance: <span class="font-mono">{{ detailPanel.node.instanceName }}</span>
          </div>

          <div class="mb-3 text-xs text-gray-500">
            Path: <span class="font-mono">{{ detailPanel.node?.path.join(' → ') }}</span>
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs mb-3">
            <div class="bg-gray-50 rounded px-2 py-1.5">
              <div class="text-gray-400">Components</div>
              <div class="text-gray-700 font-semibold">{{ detailPanel.node?.componentCount ?? 0 }}</div>
            </div>
            <div class="bg-gray-50 rounded px-2 py-1.5">
              <div class="text-gray-400">Parameters</div>
              <div class="text-gray-700 font-semibold">{{ detailPanel.node?.parameters.length ?? 0 }}</div>
            </div>
          </div>

          <div v-if="detailPanel.node?.parameters && detailPanel.node.parameters.length > 0" class="mb-3">
            <div class="text-xs font-semibold text-gray-600 mb-1">Parameters</div>
            <div class="flex flex-wrap gap-1">
              <el-tag v-for="p in detailPanel.node.parameters" :key="p.name" size="small" type="info">
                {{ p.name }}
              </el-tag>
            </div>
          </div>

          <div v-if="detailPanel.node?.nodeModulesLibrary" class="mb-3">
            <div class="text-xs text-gray-500">
              Source: <span class="font-mono">{{ detailPanel.node.sourceFile }}</span>
            </div>
          </div>

          <div v-if="!isNodeSelectableForPanel" class="mt-2 p-2 bg-amber-50 rounded border border-amber-200 text-xs text-amber-700">
            Confirm child templates first
          </div>
          <div v-else-if="!isNodeConfirmableForPanel" class="mt-2 p-2 bg-blue-50 rounded border border-blue-200 text-xs text-blue-700">
            User Code
          </div>
        </div>

        <div class="border-t border-gray-100 px-4 py-3 flex gap-2 flex-shrink-0">
          <el-button
            type="primary"
            size="small"
            class="flex-1"
            :disabled="!isNodeSelectableForPanel || !detailPanel.node?.templateInfo"
            :loading="isSelecting"
            @click="handlePanelSelect"
          >
            Select
          </el-button>
          <el-button
            type="success"
            size="small"
            class="flex-1"
            :disabled="!isNodeConfirmableForPanel"
            @click="handlePanelConfirm"
          >
            Confirm
          </el-button>
        </div>
      </div>
    </transition>

    <el-dialog
      v-model="showParamDialog"
      title="Create a wrapper to compile this template"
      width="600px"
      @click.stop
    >
      <div v-if="paramResponse">
        <div v-if="paramResponse.hasCandidates">
          <div class="mb-4">
            <p class="text-sm text-gray-600 mb-2">
              Found {{ paramResponse.candidates.length }} parameter candidates for template <strong>{{ paramResponse.templateName }}</strong>:
            </p>
            <el-radio-group v-model="selectedCandidateIndex" class="w-full">
              <div
                v-for="(candidate, idx) in paramResponse.candidates"
                :key="idx"
                class="mb-2 p-6 border rounded hover:bg-gray-50 cursor-pointer"
              >
                <el-radio :value="idx" class="w-full">
                  <div class="text-xs">
                    <div class="font-semibold mb-2">
                      Parameters: {{ candidate.params.map(p => `${p.name}=${p.value}`).join(', ') }}
                    </div>
                    <div v-if="candidate.publicSignals && candidate.publicSignals.length > 0" class="text-gray-600 mb-1">
                      Public signals: {{ candidate.publicSignals.join(', ') }}
                    </div>
                    <div class="text-gray-500">
                      Location: {{ candidate.location.component }} at {{ candidate.location.file.split('/').pop() }}:{{ candidate.location.line }}
                    </div>
                  </div>
                </el-radio>
              </div>
            </el-radio-group>
          </div>
        </div>
        <div v-else>
          <p class="text-sm text-gray-600 mb-4">
            No existing parameter candidates found for template <strong>{{ paramResponse.templateName }}</strong>. Please enter parameters manually:
          </p>
        </div>

        <div v-if="paramResponse.templateParams.length > 0" class="mt-4 pt-4 border-t">
          <p class="text-sm font-semibold text-gray-700 mb-2">Compile Constants:</p>
          <el-table :data="paramResponse.templateParams" size="small" max-height="300">
            <el-table-column label="Constant Name" width="150">
              <template #default="scope">
                <span class="font-mono">{{ scope.row }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Value">
              <template #default="scope">
                <el-input
                  v-model="paramInputs[scope.row]"
                  size="small"
                  placeholder="Enter value"
                  class="w-full"
                />
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="paramResponse.signals.length > 0" class="mt-4 pt-4 border-t">
          <p class="text-sm font-semibold text-gray-700 mb-2">Input Signals:</p>
          <el-table :data="paramResponse.signals.filter(s => s.kind === 'input')" size="small" max-height="300">
            <el-table-column label="Signal Name" width="150">
              <template #default="scope">
                <span class="font-mono">{{ scope.row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Visibility">
              <template #default="scope">
                <el-radio-group v-model="signalVisibility[scope.row.name]" size="small">
                  <el-radio-button value="public">Public</el-radio-button>
                  <el-radio-button value="private">Private</el-radio-button>
                </el-radio-group>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showParamDialog = false">Cancel</el-button>
          <el-button type="primary" @click="confirmParamSelection" :disabled="!isParamSelectionValid">
            Wrap
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import * as d3 from 'd3';
import { Close } from '@element-plus/icons-vue';
import { useCircuitStore } from '@/stores/circuit';
import { buildD3Hierarchy, isNodeSelectable, isNodeConfirmable } from '@/utils/templateTree';
import type { TreeNodeData } from '@/utils/templateTree';
import { hexToRgba } from '@/composables/colors';
import { findTemplateParams } from '@/apis';
import { ElMessage } from 'element-plus';
import type { FindTemplateParamsResponse } from '@/types/circuitTypes';

const emit = defineEmits<{
  'template-params-selected': [data: {
    templateName: string;
    params: { name: string; value: number }[];
    publicParams: string[];
    publicSignals: string[];
  }];
}>();

const circuitStore = useCircuitStore();
const svgRef = ref<SVGSVGElement | null>(null);
const svgContainer = ref<HTMLDivElement | null>(null);

const NODE_WIDTH = 200;
const HEADER_HEIGHT = 28;
const BODY_HEIGHT = 50;
const NODE_HEIGHT = HEADER_HEIGHT + BODY_HEIGHT;
const NODE_GAP_Y = 16;
const NODE_GAP_X = 400;
const PORT_RADIUS = 5;

const CONFIRMED_GREEN = '#16a34a';

const isSelecting = ref(false);
const paramResponse = ref<FindTemplateParamsResponse | null>(null);
const paramInputs = reactive<Record<string, string>>({});
const paramVisibility = reactive<Record<string, 'public' | 'private'>>({});
const signalVisibility = reactive<Record<string, 'public' | 'private'>>({});
const selectedCandidateIndex = ref<number>(-1);
const showParamDialog = ref(false);

const detailPanel = reactive({
  visible: false,
  node: null as TreeNodeData | null,
});

function templateColorStyle(templateName: string) {
  const color = circuitStore.getTemplateColor(templateName);
  return {
    backgroundColor: hexToRgba(color, 0.15),
    color: color,
    borderRadius: '4px',
    padding: '1px 8px',
    fontWeight: '600' as const,
  };
}

function confirmedNamesSet(): Set<string> {
  return new Set(circuitStore.confirmedTemplateNames);
}

const isNodeSelectableForPanel = computed(() => {
  if (!detailPanel.node) return false;
  return isNodeSelectable(detailPanel.node, confirmedNamesSet());
});

const isNodeConfirmableForPanel = computed(() => {
  if (!detailPanel.node) return false;
  return isNodeConfirmable(detailPanel.node);
});

function textEllipsis(text: string, maxWidth: number): string {
  const charWidth = 7;
  const maxChars = Math.floor(maxWidth / charWidth);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 2) + '..';
}

let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
let resizeObserver: ResizeObserver | null = null;

function bezierMidpoint(sx: number, sy: number, tx: number, ty: number): { x: number; y: number } {
  const mx = (sx + tx) / 2;
  return { x: mx, y: (sy + ty) / 2 };
}

function renderTree() {
  const svg = d3.select(svgRef.value);
  svg.selectAll('*').remove();

  if (!circuitStore.parseData.tree || !svgContainer.value) return;

  const treeData = buildD3Hierarchy(circuitStore.parseData.tree);

  const containerWidth = svgContainer.value.clientWidth;
  const containerHeight = svgContainer.value.clientHeight;

  const confirmed = confirmedNamesSet();

  const defs = svg.append('defs');

  const filter = defs.append('filter')
    .attr('id', 'node-shadow')
    .attr('x', '-10%')
    .attr('y', '-10%')
    .attr('width', '120%')
    .attr('height', '130%');

  filter.append('feDropShadow')
    .attr('dx', 0)
    .attr('dy', 2)
    .attr('stdDeviation', 3)
    .attr('flood-color', '#000000')
    .attr('flood-opacity', 0.12);

  const glowFilter = defs.append('filter')
    .attr('id', 'selected-glow')
    .attr('x', '-20%')
    .attr('y', '-20%')
    .attr('width', '140%')
    .attr('height', '140%');

  glowFilter.append('feDropShadow')
    .attr('dx', 0)
    .attr('dy', 0)
    .attr('stdDeviation', 4)
    .attr('flood-color', '#1a73e8')
    .attr('flood-opacity', 0.4);

  const arrowMarker = defs.append('marker')
    .attr('id', 'arrowhead')
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 10)
    .attr('refY', 5)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto');

  arrowMarker.append('path')
    .attr('d', 'M 0 0 L 10 5 L 0 10 z')
    .attr('fill', '#94a3b8');

  const root = d3.hierarchy<TreeNodeData>(treeData);

  const treeLayout = d3.tree<TreeNodeData>()
    .nodeSize([NODE_HEIGHT + NODE_GAP_Y, NODE_GAP_X])
    .separation((a, b) => {
      if (a.parent === b.parent) return 1;
      return 1.2;
    });

  treeLayout(root);

  const g = svg.append('g').attr('class', 'tree-container');

  const linksGroup = g.append('g').attr('class', 'links');
  const nodesGroup = g.append('g').attr('class', 'nodes');

  const linkElements = linksGroup.selectAll('g.link-group')
    .data(root.links())
    .join('g')
    .attr('class', 'link-group');

  linkElements.append('path')
    .attr('d', (d) => {
      const sx = (d.source.y ?? 0) + NODE_WIDTH / 2;
      const sy = d.source.x ?? 0;
      const tx = (d.target.y ?? 0) - NODE_WIDTH / 2;
      const ty = d.target.x ?? 0;
      const mx = (sx + tx) / 2;
      return `M ${sx},${sy} C ${mx},${sy} ${mx},${ty} ${tx},${ty}`;
    })
    .attr('fill', 'none')
    .attr('stroke', '#94a3b8')
    .attr('stroke-width', 2)
    .attr('marker-end', 'url(#arrowhead)');

  linkElements.each(function (d) {
    const linkGroup = d3.select(this);
    const instanceName = d.target.data.instanceName;
    if (!instanceName) return;

    const sx = (d.source.y ?? 0) + NODE_WIDTH / 2;
    const sy = d.source.x ?? 0;
    const tx = (d.target.y ?? 0) - NODE_WIDTH / 2;
    const ty = d.target.x ?? 0;
    const mid = bezierMidpoint(sx, sy, tx, ty);

    const label = instanceName;

    const textWidth = label.length * 7;
    const padX = 6;
    const padY = 3;

    linkGroup.append('rect')
      .attr('x', mid.x - textWidth / 2 - padX)
      .attr('y', mid.y - 8 - padY)
      .attr('width', textWidth + padX * 2)
      .attr('height', 16 + padY * 2)
      .attr('rx', 4)
      .attr('fill', 'rgba(248, 250, 252, 0.75)')
      .attr('stroke', 'rgba(203, 213, 225, 0.6)')
      .attr('stroke-width', 1);

    linkGroup.append('text')
      .attr('x', mid.x)
      .attr('y', mid.y)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', 'rgba(100, 116, 139, 0.8)')
      .attr('font-size', '10px')
      .attr('font-family', 'monospace')
      .text(label);
  });

  const nodeGroups = nodesGroup.selectAll('g')
    .data(root.descendants())
    .join('g')
    .attr('class', 'node')
    .attr('transform', (d) => `translate(${d.y}, ${d.x})`)
    .style('cursor', (d) => d.data.templateInfo ? 'pointer' : 'default');

  nodeGroups.each(function (d) {
    const nodeG = d3.select(this);
    const color = circuitStore.getTemplateColor(d.data.templateName);
    const isExternal = d.data.isExternal;
    const isConfirmed = confirmed.has(d.data.templateName);
    const isNmLib = !!d.data.nodeModulesLibrary;
    const hw = NODE_WIDTH / 2;

    if (isConfirmed && !isExternal) {
      const totalH = NODE_HEIGHT;
      nodeG.append('rect')
        .attr('class', 'node-bg')
        .attr('x', -hw)
        .attr('y', -totalH / 2)
        .attr('width', NODE_WIDTH)
        .attr('height', totalH)
        .attr('rx', 8)
        .attr('fill', CONFIRMED_GREEN)
        .attr('stroke', CONFIRMED_GREEN)
        .attr('stroke-width', 2)
        .attr('filter', 'url(#node-shadow)');

      let headerLabel = d.data.templateName;

      if (isNmLib && d.data.nodeModulesLibrary) {
        const libLabel = d.data.nodeModulesLibrary;
        const lineSpacing = 20;
        const line1Y = -lineSpacing / 2;
        const line2Y = lineSpacing / 2;

        nodeG.append('text')
          .attr('x', 0)
          .attr('y', line1Y)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', '#ffffff')
          .attr('font-size', '18px')
          .attr('font-weight', '700')
          .text(() => textEllipsis(headerLabel, NODE_WIDTH - 20));

        const tagTextWidth = libLabel.length * 7.5;
        const tagPadX = 8;
        const tagPadY = 3;
        const tagWidth = tagTextWidth + tagPadX * 2;

        nodeG.append('rect')
          .attr('x', -tagWidth / 2)
          .attr('y', line2Y - 9 - tagPadY)
          .attr('width', tagWidth)
          .attr('height', 18 + tagPadY * 2)
          .attr('rx', 4)
          .attr('fill', 'rgba(255, 255, 255, 0.25)');

        nodeG.append('text')
          .attr('x', 0)
          .attr('y', line2Y)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', 'rgba(255, 255, 255, 0.9)')
          .attr('font-size', '16px')
          .attr('font-weight', '500')
          .text(libLabel);
      } else {
        nodeG.append('text')
          .attr('x', 0)
          .attr('y', 0)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', '#ffffff')
          .attr('font-size', '15px')
          .attr('font-weight', '700')
          .text(() => textEllipsis(headerLabel, NODE_WIDTH - 20));
      }

      const portColor = CONFIRMED_GREEN;
      nodeG.append('circle')
        .attr('cx', -hw)
        .attr('cy', 0)
        .attr('r', PORT_RADIUS)
        .attr('fill', portColor)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1.5);

      if (d.children && d.children.length > 0) {
        nodeG.append('circle')
          .attr('cx', hw)
          .attr('cy', 0)
          .attr('r', PORT_RADIUS)
          .attr('fill', portColor)
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 1.5);
      }

      return;
    }

    nodeG.attr('opacity', 0.85);

    const headerColor = color;
    const bodyFill = '#ffffff';
    const isSelectable = isNodeSelectable(d.data, confirmed);
    const borderColor = isSelectable ? '#2563eb' : '#e2e8f0';

    const bgRect = nodeG.append('rect')
      .attr('class', 'node-bg')
      .attr('x', -hw)
      .attr('y', -NODE_HEIGHT / 2)
      .attr('width', NODE_WIDTH)
      .attr('height', NODE_HEIGHT)
      .attr('rx', 8)
      .attr('fill', bodyFill)
      .attr('stroke', borderColor)
      .attr('stroke-width', isSelectable ? 2.5 : 1.5)
      .attr('stroke-dasharray', (isExternal || isSelectable) ? '6 3' : 'none');

    if (!isExternal) {
      bgRect.attr('filter', 'url(#node-shadow)');
    }

    nodeG.append('rect')
      .attr('x', -hw)
      .attr('y', -NODE_HEIGHT / 2)
      .attr('width', NODE_WIDTH)
      .attr('height', HEADER_HEIGHT)
      .attr('rx', 8)
      .attr('fill', headerColor);

    nodeG.append('rect')
      .attr('x', -hw)
      .attr('y', -NODE_HEIGHT / 2 + HEADER_HEIGHT - 8)
      .attr('width', NODE_WIDTH)
      .attr('height', 8)
      .attr('fill', headerColor);

    let headerLabel = d.data.templateName;
    const maxLabelWidth = NODE_WIDTH - 16;

    if (isNmLib && d.data.nodeModulesLibrary) {
      const libLabel = d.data.nodeModulesLibrary;
      const nameWidth = headerLabel.length * 7;
      const tagTextWidth = libLabel.length * 6.5;
      const tagPadX = 5;
      const tagPadY = 2;
      const tagWidth = tagTextWidth + tagPadX * 2;
      const totalWidth = nameWidth + 6 + tagWidth;
      const startX = -totalWidth / 2;

      nodeG.append('text')
        .attr('x', startX + nameWidth / 2)
        .attr('y', -NODE_HEIGHT / 2 + HEADER_HEIGHT / 2 + 1)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#ffffff')
        .attr('font-size', '12px')
        .attr('font-weight', '700')
        .text(() => textEllipsis(headerLabel, nameWidth));

      const tagX = startX + nameWidth + 6;
      const tagY = -NODE_HEIGHT / 2 + HEADER_HEIGHT / 2 + 1;

      nodeG.append('rect')
        .attr('x', tagX)
        .attr('y', tagY - 8 - tagPadY)
        .attr('width', tagWidth)
        .attr('height', 16 + tagPadY * 2)
        .attr('rx', 3)
        .attr('fill', 'rgba(255, 255, 255, 0.25)');

      nodeG.append('text')
        .attr('x', tagX + tagWidth / 2)
        .attr('y', tagY)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', 'rgba(255, 255, 255, 0.9)')
        .attr('font-size', '12px')
        .attr('font-weight', '500')
        .text(libLabel);
    } else {
      nodeG.append('text')
        .attr('x', 0)
        .attr('y', -NODE_HEIGHT / 2 + HEADER_HEIGHT / 2 + 1)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#ffffff')
        .attr('font-size', '12px')
        .attr('font-weight', '700')
        .text(() => textEllipsis(headerLabel, maxLabelWidth));
    }

    const bodyTop = -NODE_HEIGHT / 2 + HEADER_HEIGHT + 4;

    if (isExternal) {
      nodeG.append('text')
        .attr('x', 0)
        .attr('y', bodyTop + 14)
        .attr('text-anchor', 'middle')
        .attr('fill', '#94a3b8')
        .attr('font-size', '10px')
        .attr('font-style', 'italic')
        .text('external / primitive');
    } else {
      const line1 = bodyTop + 12;
      const line2 = bodyTop + 25;

      nodeG.append('text')
        .attr('x', 0)
        .attr('y', line1)
        .attr('text-anchor', 'middle')
        .attr('fill', '#475569')
        .attr('font-size', '10px')
        .text(() => `components: ${d.data.componentCount}`);

      if (d.data.parameters.length > 0) {
        const paramsStr = d.data.parameters.map(p => p.name).join(', ');
        nodeG.append('text')
          .attr('x', 0)
          .attr('y', line2)
          .attr('text-anchor', 'middle')
          .attr('fill', '#64748b')
          .attr('font-size', '10px')
          .text(() => `params: ${textEllipsis(paramsStr, NODE_WIDTH - 24)}`);
      }
    }

    const portColor = color;
    nodeG.append('circle')
      .attr('cx', -hw)
      .attr('cy', 0)
      .attr('r', PORT_RADIUS)
      .attr('fill', portColor)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.5);

    if (d.children && d.children.length > 0) {
      nodeG.append('circle')
        .attr('cx', hw)
        .attr('cy', 0)
        .attr('r', PORT_RADIUS)
        .attr('fill', portColor)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1.5);
    }
  });

  nodeGroups
    .on('mouseenter', function () {
      d3.select(this).select('.node-bg').attr('stroke-width', 2.5);
    })
    .on('mouseleave', function (_event, d) {
      const isSelected = d.data.templateInfo === circuitStore.selectedTemplate;
      const isConfirmed = confirmed.has(d.data.templateName);
      const isSel = isNodeSelectable(d.data, confirmed);
      const border = isConfirmed ? CONFIRMED_GREEN : (isSelected ? '#1a73e8' : (isSel ? '#2563eb' : '#e2e8f0'));
      const sw = isSelected ? 2.5 : (isSel ? 2.5 : 1.5);
      d3.select(this).select('.node-bg')
        .attr('stroke', border)
        .attr('stroke-width', sw);
    })
    .on('click', (_event, d) => {
      if (d.data.templateInfo) {
        circuitStore.setSelectedTemplate(d.data.templateInfo, d.data.path);
      }
    })
    .on('dblclick', (event: MouseEvent, d) => {
      event.preventDefault();
      event.stopPropagation();
      if (!d.data.templateInfo || d.data.isExternal) return;
      if (!isNodeSelectable(d.data, confirmedNamesSet())) return;
      detailPanel.node = d.data;
      detailPanel.visible = true;
    });

  zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.15, 3])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });

  svg.call(zoomBehavior as unknown as (selection: d3.Selection<SVGSVGElement | null, unknown, null, undefined>) => void);

  nextTick(() => {
    const bbox = (g.node() as SVGGElement | null)?.getBBox();
    if (!bbox) return;

    const padding = 80;
    const bw = bbox.width + padding * 2;
    const bh = bbox.height + padding * 2;

    const scale = Math.min(
      containerWidth / bw,
      containerHeight / bh,
      1
    );

    const tx = containerWidth / 2 - scale * (bbox.x + bbox.width / 2);
    const ty = containerHeight / 2 - scale * (bbox.y + bbox.height / 2);

    (svg as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>).call(
      zoomBehavior!.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
  });
}

async function handlePanelSelect() {
  if (!detailPanel.node?.templateInfo) return;

  if (!isNodeSelectable(detailPanel.node, confirmedNamesSet())) {
    ElMessage.warning('All child templates must be confirmed first');
    return;
  }

  isSelecting.value = true;
  try {
    const response = await findTemplateParams({
      templateName: detailPanel.node.templateName,
      repo: circuitStore.parseData.repo,
      entry: circuitStore.parseData.entry,
    });
    paramResponse.value = response;

    Object.keys(paramInputs).forEach(key => delete paramInputs[key]);
    Object.keys(paramVisibility).forEach(key => delete paramVisibility[key]);
    Object.keys(signalVisibility).forEach(key => delete signalVisibility[key]);

    selectedCandidateIndex.value = -1;

    if (response.hasCandidates && response.candidates.length > 0) {
      selectedCandidateIndex.value = 0;
      const candidate = response.candidates[0];
      candidate.params.forEach(param => {
        paramInputs[param.name] = param.value.toString();
      });
    } else {
      response.templateParams.forEach(paramName => {
        paramInputs[paramName] = '';
      });
    }

    response.templateParams.forEach(paramName => {
      paramVisibility[paramName] = 'public';
    });

    response.signals.filter(s => s.kind === 'input').forEach(signal => {
      signalVisibility[signal.name] = 'private';
    });

    showParamDialog.value = true;
  } catch (error: any) {
    ElMessage.error(`Failed to search for template parameters: ${error.message}`);
  } finally {
    isSelecting.value = false;
  }
}

function handlePanelConfirm() {
  if (detailPanel.node) {
    circuitStore.confirmTemplateName(detailPanel.node.templateName);
    detailPanel.visible = false;
    renderTree();
  }
}

const isParamSelectionValid = computed(() => {
  if (!paramResponse.value) return false;
  return paramResponse.value.templateParams.every(
    paramName => paramInputs[paramName] && paramInputs[paramName].trim() !== ''
  );
});

const confirmParamSelection = () => {
  if (!paramResponse.value || !detailPanel.node) return;

  const params = paramResponse.value.templateParams.map(paramName => ({
    name: paramName,
    value: parseInt(paramInputs[paramName], 10),
  }));

  const publicParams = Object.entries(paramVisibility)
    .filter(([, visibility]) => visibility === 'public')
    .map(([name]) => name);

  const publicSignals = Object.entries(signalVisibility)
    .filter(([, visibility]) => visibility === 'public')
    .map(([name]) => name);

  emit('template-params-selected', {
    templateName: detailPanel.node.templateName,
    params,
    publicParams,
    publicSignals,
  });

  showParamDialog.value = false;
  ElMessage.success('Generating wrapper...');
};

function updateSelection() {
  const svg = d3.select(svgRef.value);
  const confirmed = confirmedNamesSet();

  svg.selectAll<SVGGElement, d3.HierarchyPointNode<TreeNodeData>>('g.node').each(function (d) {
    const nodeGroup = d3.select(this);
    const data = d.data;
    const isSelected = data.templateInfo === circuitStore.selectedTemplate;
    const isConfirmed = confirmed.has(data.templateName);

    if (isConfirmed && !data.isExternal) return;

    const isSel = isNodeSelectable(data, confirmed);
    const bgRect = nodeGroup.select('.node-bg');
    if (isSelected) {
      bgRect
        .attr('filter', 'url(#selected-glow)')
        .attr('stroke', '#1a73e8')
        .attr('stroke-width', 2.5)
        .attr('fill', '#ffffff');
    } else if (isSel) {
      bgRect
        .attr('filter', 'url(#node-shadow)')
        .attr('stroke', '#2563eb')
        .attr('stroke-width', 2.5)
        .attr('stroke-dasharray', '6 3')
        .attr('fill', '#ffffff');
    } else if (!data.isExternal) {
      bgRect
        .attr('filter', 'url(#node-shadow)')
        .attr('stroke', '#e2e8f0')
        .attr('stroke-width', 1.5)
        .attr('fill', '#ffffff');
    }
  });
}

watch(selectedCandidateIndex, (newIndex) => {
  if (paramResponse.value && newIndex >= 0 && paramResponse.value.hasCandidates) {
    const candidate = paramResponse.value.candidates[newIndex];
    candidate.params.forEach(param => {
      paramInputs[param.name] = param.value.toString();
    });

    paramResponse.value.signals.filter(s => s.kind === 'input').forEach(signal => {
      signalVisibility[signal.name] = 'private';
    });

    if (candidate.publicSignals) {
      candidate.publicSignals.forEach(signalName => {
        signalVisibility[signalName] = 'public';
      });
    }
  }
});

watch(
  () => circuitStore.isParsed,
  (parsed) => {
    if (parsed) {
      nextTick(() => renderTree());
    }
  },
  { immediate: true }
);

watch(
  () => circuitStore.selectedTemplate,
  () => {
    updateSelection();
  }
);

watch(
  () => circuitStore.confirmedTemplateNames,
  () => {
    renderTree();
  },
  { deep: true }
);

onMounted(() => {
  if (svgContainer.value) {
    resizeObserver = new ResizeObserver(() => {
      if (circuitStore.isParsed) {
        renderTree();
      }
    });
    resizeObserver.observe(svgContainer.value);
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});
</script>

<style scoped>
.circuit-visualization {
  background: white;
  border-radius: 8px;
}

.detail-panel {
  transition: transform 0.3s ease;
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
</style>

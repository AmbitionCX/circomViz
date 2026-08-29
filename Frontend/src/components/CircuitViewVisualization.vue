<template>
  <div class="circuit-visualization h-full w-full flex flex-col overflow-hidden relative">
    <div ref="svgContainer" class="flex-1 min-h-0 relative bg-gray-50 rounded-lg">
      <svg ref="svgRef" class="w-full h-full"></svg>
      <div
        v-if="signalTooltip.visible"
        class="signal-tooltip el-popper is-light"
        :style="{ left: `${signalTooltip.x}px`, top: `${signalTooltip.y}px` }"
      >
        {{ signalTooltip.content }}
      </div>
      <div v-if="!circuitStore.isParsed" class="absolute inset-0 flex items-center justify-center">
        <el-empty description="No circuit loaded" :image-size="80" />
      </div>
      <div v-if="circuitStore.isParsed"
           class="absolute bottom-3 left-3 z-30 bg-white/90 backdrop-blur-sm rounded-lg border border-gray-200 shadow-sm px-3 py-2.5 flex flex-col gap-1.5">
        <div class="flex items-center gap-2">
          <span class="inline-flex items-center justify-center h-3.5 px-1.5 rounded bg-indigo-300 flex-shrink-0">
            <span class="text-white font-bold leading-none" style="font-size: 9px;">name</span>
          </span>
          <span class="text-gray-600 text-xs">Template name</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="inline-flex items-center h-3.5 px-1 rounded bg-indigo-300 gap-0.5 flex-shrink-0">
            <span class="text-white font-bold leading-none" style="font-size: 9px;">name</span>
            <span class="bg-white/25 rounded px-0.5 text-white/90 leading-none" style="font-size: 9px;">pkg</span>
          </span>
          <span class="text-gray-600 text-xs">Package</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block flex-shrink-0"></span>
          <span class="text-gray-600 text-xs">Input signal</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-green-600 inline-block flex-shrink-0"></span>
          <span class="text-gray-600 text-xs">Output signal</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-4 h-3 border border-green-600 bg-green-600/30 rounded inline-block flex-shrink-0"></span>
          <span class="text-gray-600 text-xs">Confirmed template</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-4 h-3 border border-red-600 bg-red-600/30 rounded inline-block flex-shrink-0"></span>
          <span class="text-gray-600 text-xs">Vulnerable node</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-4 h-3 border border-dashed border-gray-500 rounded inline-block flex-shrink-0"></span>
          <span class="text-gray-600 text-xs">Duplicate pattern</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-4 h-3 border border-dashed border-amber-600 rounded inline-block flex-shrink-0"></span>
          <span class="text-gray-600 text-xs">Recursive reference</span>
        </div>
      </div>
    </div>

    <transition name="slide">
      <div
        v-if="detailPanel.visible"
        class="detail-panel absolute top-0 right-0 h-full z-40 bg-white border-l border-gray-200 shadow-xl flex flex-col"
        :style="{ width: '300px' }"
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <span class="text-sm font-semibold text-gray-700">
            Template: <span v-if="detailPanel.node" :style="templateColorStyle(detailPanel.node.templateName)">{{ detailPanel.node.templateName }}</span>
          </span>
          <el-icon class="cursor-pointer text-gray-400 hover:text-gray-600" @click="detailPanel.visible = false">
            <Close />
          </el-icon>
        </div>
        <div class="flex-1 overflow-auto px-4 py-3">
          <div v-if="detailPanel.node?.nodeModulesLibrary" class="mb-3">
            <el-tag size="small" type="info">
              {{ detailPanel.node.nodeModulesLibrary }}
            </el-tag>
          </div>

          <div v-if="detailPanel.node?.pathInfo && detailPanel.node.pathInfo.length > 0" class="mb-4 flex flex-col items-center">
            <div class="text-xs font-semibold text-gray-500 mb-1.5">Path</div>
            <div class="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-center">
              <div class="text-xs font-semibold text-gray-700">{{ rootTemplateName }}</div>
              <div class="text-[10px] text-gray-400">root</div>
            </div>

            <template v-for="(item, idx) in panelAncestorPath" :key="idx">
              <span class="text-gray-300 leading-none my-0.5">▼</span>
              <div class="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-center">
                <div class="text-xs font-semibold text-gray-700">{{ item.templateName }}</div>
                <div class="text-[10px] text-gray-400 font-mono">{{ item.instanceName }}</div>
              </div>
            </template>

            <span class="text-gray-300 leading-none my-0.5">▼</span>
          </div>

          <div v-if="detailPanel.node?.templateInfo" class="mt-4 mb-4">
            <div class="flex justify-center mb-0">
              <div v-for="sig in panelInputSignals" :key="sig.name"
                   class="flex flex-col items-center flex-shrink-0" style="width: 16px;">
                <div style="position: relative; height: 36px; width: 16px; overflow: visible;">
                  <span class="text-[10px] text-gray-600 font-mono whitespace-nowrap"
                        :title="sig.name + arraySuffix(sig)"
                        style="position: absolute; left: 50%; bottom: 0; transform-origin: bottom left; transform: rotate(-45deg);">
                    {{ expandedPanelSignals.has(sig.name) ? sig.name + arraySuffix(sig) : textEllipsis(sig.name + arraySuffix(sig), 70) }}
                  </span>
                </div>
                <span class="w-2 h-2 rounded-full bg-blue-600 inline-block flex-shrink-0 cursor-pointer"
                      @click="togglePanelSignal(sig.name)"></span>
                <span class="w-px h-3 bg-gray-300"></span>
              </div>
            </div>

            <div class="flex justify-center">
              <div class="rounded-lg px-4 py-2 text-center"
                   :style="{
                     backgroundColor: hexToRgba(circuitStore.getTemplateColor(detailPanel.node?.templateName ?? ''), 0.1),
                     border: '1.5px solid ' + circuitStore.getTemplateColor(detailPanel.node?.templateName ?? ''),
                     color: circuitStore.getTemplateColor(detailPanel.node?.templateName ?? '')
                   }">
                <div class="text-sm font-bold">{{ detailPanel.node?.templateName }}</div>
                <div v-if="panelParamNames" class="text-xs text-gray-500 font-normal mt-0.5">
                  ({{ panelParamNames }})
                </div>
              </div>
            </div>

            <div class="flex justify-center mt-0">
              <div v-for="sig in panelOutputSignals" :key="sig.name"
                   class="flex flex-col items-center flex-shrink-0" style="width: 16px;">
                <span class="w-px h-3 bg-gray-300"></span>
                <span class="w-2 h-2 rounded-full bg-green-600 inline-block flex-shrink-0 cursor-pointer"
                      @click="togglePanelSignal(sig.name)"></span>
                <div style="position: relative; height: 18px; width: 16px; overflow: visible;">
                  <span class="text-[10px] text-gray-600 font-mono whitespace-nowrap"
                        :title="sig.name + arraySuffix(sig)"
                        style="position: absolute; left: 50%; bottom: 50%; transform-origin: bottom left; transform: rotate(45deg);">
                    {{ expandedPanelSignals.has(sig.name) ? sig.name + arraySuffix(sig) : textEllipsis(sig.name + arraySuffix(sig), 70) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div v-if="detailPanel.node?.nodeModulesLibrary" class="mb-3">
            <div class="text-xs text-gray-500">
              Source: <span class="font-mono">{{ detailPanel.node.sourceFile }}</span>
            </div>
          </div>

          <div v-if="showParamDialog && paramResponse" class="wrapper-config mt-4 pt-4">
            <div v-if="paramResponse.hasCandidates" class="mb-4">
              <p class="text-xs text-gray-600 mb-2">
                Found {{ paramResponse.candidates.length }} parameter candidates for <strong>{{ paramResponse.templateName }}</strong>:
              </p>
              <el-radio-group v-model="selectedCandidateIndex" class="w-full">
                <div
                  v-for="(candidate, idx) in paramResponse.candidates"
                  :key="idx"
                  class="mb-2 p-3 border rounded hover:bg-gray-50 cursor-pointer"
                >
                  <el-radio :value="idx" class="w-full">
                    <div class="text-xs leading-relaxed">
                      <div class="font-semibold mb-1">
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

            <div v-if="paramResponse.templateParams.length > 0" class="mt-4 pt-4 border-t">
              <p class="text-xs font-semibold text-gray-700 mb-2">Compile Constants:</p>
              <el-table :data="paramResponse.templateParams" size="small" max-height="180">
                <el-table-column label="Constant" width="120">
                  <template #default="scope">
                    <span class="font-mono text-xs">{{ scope.row }}</span>
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

            <div v-if="isRootDetailNode() && paramResponse.signals.length > 0" class="mt-4 pt-4 border-t">
              <el-collapse v-model="signalVisibilitySections" class="signal-visibility-collapse">
                <el-collapse-item name="signals">
                  <template #title>
                    <span class="text-xs font-semibold text-gray-700">Signals Visibility</span>
                  </template>

                  <el-table
                    :data="paramResponse.signals.filter(s => s.kind === 'input' || s.kind === 'output')"
                    size="small"
                    max-height="220"
                  >
                    <el-table-column label="Signal" width="110">
                      <template #default="scope">
                        <div class="flex items-center gap-1.5">
                          <span
                            class="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
                            :class="scope.row.kind === 'output' ? 'bg-green-600' : 'bg-blue-600'"
                          ></span>
                          <span class="font-mono text-xs">{{ scope.row.name }}</span>
                        </div>
                      </template>
                    </el-table-column>
                    <el-table-column label="Visibility">
                      <template #default="scope">
                        <el-tag v-if="scope.row.kind === 'output'" size="small" type="success" effect="plain">Public</el-tag>
                        <el-radio-group v-else v-model="signalVisibility[scope.row.name]" size="small">
                          <el-radio-button value="public">Public</el-radio-button>
                          <el-radio-button value="private">Private</el-radio-button>
                        </el-radio-group>
                      </template>
                    </el-table-column>
                  </el-table>
                </el-collapse-item>
              </el-collapse>
            </div>
          </div>
        </div>

        <div class="border-t border-gray-100 px-4 py-3 flex gap-2 flex-shrink-0">
          <el-button
            type="primary"
            size="small"
            class="flex-1"
            :disabled="!canPartialCompile"
            :loading="isSelecting"
            @click="handlePartialCompile"
          >
            Partial Compile
          </el-button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import * as d3 from 'd3';
import { Close } from '@element-plus/icons-vue';
import { useCircuitStore } from '@/stores/circuit';
import {
  buildD3Hierarchy,
  buildVisibleTemplateTree,
  collectTreeNodeIds,
  findTreeNode,
  hasFoldableConfirmedChild,
  isNodeSelectable,
  treeNodeIdForSelection,
} from '@/utils/templateTree';
import type { TreeNodeData } from '@/utils/templateTree';
import { buildSignalRelationGraph, makeSignalKey } from '@/utils/signalRelations';
import type { SignalRelationGraph } from '@/utils/signalRelations';
import { hexToRgba } from '@/composables/colors';
import { findTemplateParams } from '@/apis';
import { ElMessage } from 'element-plus';
import type { FindTemplateParamsResponse, SignalInfo } from '@/types/circuitTypes';

const props = withDefaults(defineProps<{
  collapsedNodeIds?: string[];
  fitToViewVersion?: number;
  searchQuery?: string;
  markedNodeIds?: string[];
  focusNodeId?: string;
  focusRequestVersion?: number;
}>(), {
  collapsedNodeIds: () => [],
  fitToViewVersion: 0,
  searchQuery: '',
  markedNodeIds: () => [],
  focusNodeId: '',
  focusRequestVersion: 0,
});

const emit = defineEmits<{
  'fold-node': [nodeId: string];
  'expand-node': [nodeId: string];
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

const CONFIRMED_GREEN = '#16a34a';
const VULNERABLE_RED = '#dc2626';
const RECURSIVE_BORDER = '#d97706';
const RECURSIVE_ENCLOSURE_PAD = 8;
const SELECTED_SIGNAL_COLOR = '#f59e0b';
const RELATED_SIGNAL_COLOR = '#fbbf24';
const COMPILATION_FAILURE_RED = '#dc2626';
const FOLD_ICON_PATH = 'M896 192H128v128h768zm0 256H384v128h512zm0 256H128v128h768zM320 384 128 512l192 128z';
const EXPAND_ICON_PATH = 'M128 192h768v128H128zm0 256h512v128H128zm0 256h768v128H128zm576-352 192 160-192 128z';

const isSelecting = ref(false);
const paramResponse = ref<FindTemplateParamsResponse | null>(null);
const paramInputs = reactive<Record<string, string>>({});
const paramVisibility = reactive<Record<string, 'public' | 'private'>>({});
const signalVisibility = reactive<Record<string, 'public' | 'private'>>({});
const signalVisibilitySections = ref<string[]>([]);
const selectedCandidateIndex = ref<number>(-1);
const showParamDialog = ref(false);

const detailPanel = reactive({
  visible: false,
  node: null as TreeNodeData | null,
});

const signalTooltip = reactive({
  visible: false,
  content: '',
  x: 0,
  y: 0,
});

const selectedSignalKeys = ref<Set<string>>(new Set());
let signalRelationGraph: SignalRelationGraph = new Map();
let renderedTreeData: TreeNodeData | null = null;

function isCompilationFailureNode(node: TreeNodeData) {
  const nodePath = [
    rootTemplateName.value,
    ...node.pathInfo.map((entry) => entry.templateName),
  ];
  return (circuitStore.parseCompilation?.failedComponents ?? []).some((failure) =>
    failure.templatePath.length === nodePath.length
    && failure.templatePath.every((name, index) => name === nodePath[index])
  );
}

function showSignalTooltip(event: MouseEvent, signalName: string) {
  if (!svgContainer.value) return;

  const bounds = svgContainer.value.getBoundingClientRect();
  signalTooltip.content = signalName;
  signalTooltip.x = event.clientX - bounds.left;
  signalTooltip.y = event.clientY - bounds.top + 14;
  signalTooltip.visible = true;
}

function hideSignalTooltip() {
  signalTooltip.visible = false;
}

function updateSignalHighlights() {
  const selectedKeys = selectedSignalKeys.value;
  const relatedKeys = new Set<string>();

  for (const selectedKey of selectedKeys) {
    for (const relatedKey of signalRelationGraph.get(selectedKey) ?? []) {
      if (!selectedKeys.has(relatedKey)) {
        relatedKeys.add(relatedKey);
      }
    }
  }

  d3.select(svgRef.value)
    .selectAll<SVGCircleElement, unknown>('circle.signal-dot')
    .each(function () {
      const dot = d3.select(this);
      const key = dot.attr('data-signal-key');
      const isSelected = selectedKeys.has(key);
      const isRelated = !isSelected && relatedKeys.has(key);

      dot
        .attr('r', isSelected ? 7 : (isRelated ? 6.5 : 5))
        .attr('stroke', isSelected ? SELECTED_SIGNAL_COLOR : (isRelated ? RELATED_SIGNAL_COLOR : 'none'))
        .attr('stroke-width', isSelected ? 3 : (isRelated ? 2.5 : 0))
        .attr('filter', isSelected ? 'url(#selected-signal-shadow)' : null);
    });
}

function applySharedSignalHighlight(treeData: TreeNodeData | null = renderedTreeData) {
  const highlight = circuitStore.signalHighlight;
  const matchingKeys = new Set<string>();

  if (highlight && treeData) {
    const visit = (node: TreeNodeData) => {
      const sourceFile = node.sourceFile ?? node.templateInfo?.sourceFile;
      const hasSignal = node.templateInfo?.signals.some(signal => signal.name === highlight.signalName);

      if (
        sourceFile === highlight.sourceFile
        && node.templateName === highlight.templateName
        && hasSignal
      ) {
        matchingKeys.add(makeSignalKey(node.id, highlight.signalName));
      }

      node.children.forEach(visit);
    };

    visit(treeData);
  }

  selectedSignalKeys.value = matchingKeys;
  updateSignalHighlights();
}

function clearSignalHighlight() {
  selectedSignalKeys.value = new Set();
  circuitStore.clearSignalHighlight();
  updateSignalHighlights();
}

function handleSignalClick(event: MouseEvent, node: TreeNodeData, signalName: string) {
  event.stopPropagation();
  hideSignalTooltip();

  const key = makeSignalKey(node.id, signalName);
  if (selectedSignalKeys.value.has(key)) {
    clearSignalHighlight();
    return;
  }

  selectedSignalKeys.value = new Set([key]);
  circuitStore.highlightSignal(node.sourceFile, node.templateName, signalName);
  updateSignalHighlights();
}

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

function vulnerableNamesSet(): Set<string> {
  return new Set(circuitStore.vulnerableTemplateNames);
}

function selectedTreeNodeId(): string | null {
  if (!circuitStore.selectedTemplate) return null;
  return treeNodeIdForSelection(
    circuitStore.selectedTemplate.templateName,
    circuitStore.selectedTemplatePath,
  );
}

const isNodeSelectableForPanel = computed(() => {
  if (!detailPanel.node) return false;
  return isNodeSelectable(detailPanel.node);
});

const rootTemplateName = computed(() => circuitStore.parseData.tree?.templateName ?? '');

const panelAncestorPath = computed(() => {
  const info = detailPanel.node?.pathInfo ?? [];
  return info.slice(0, -1);
});

const panelInputSignals = computed(() =>
  detailPanel.node?.templateInfo?.signals.filter(s => s.kind === 'input') ?? []
);

const panelOutputSignals = computed(() =>
  detailPanel.node?.templateInfo?.signals.filter(s => s.kind === 'output') ?? []
);

const panelParamNames = computed(() =>
  (detailPanel.node?.parameters ?? []).map(p => p.name).join(', ')
);

const expandedPanelSignals = ref<Set<string>>(new Set());

function togglePanelSignal(name: string) {
  const newSet = new Set(expandedPanelSignals.value);
  if (newSet.has(name)) {
    newSet.delete(name);
  } else {
    newSet.add(name);
  }
  expandedPanelSignals.value = newSet;
}

function isRootDetailNode(): boolean {
  return detailPanel.node?.depth === 0 || (detailPanel.node?.path?.length ?? 0) === 0;
}

function arraySuffix(sig: SignalInfo): string {
  if (!sig.isArray) return '';
  const sizes = sig.arraySizes.map(s => {
    if (s.type === 'Literal') return String(s.value);
    if (s.type === 'Identifier') return s.name;
    return '';
  }).join(',');
  return `[${sizes}]`;
}

function textEllipsis(text: string, maxWidth: number): string {
  const charWidth = 7;
  const maxChars = Math.floor(maxWidth / charWidth);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 2) + '..';
}

let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
let resizeObserver: ResizeObserver | null = null;

function renderTree(options: { fitToView?: boolean } = {}) {
  hideSignalTooltip();

  const svg = d3.select(svgRef.value);
  const previousTransform = svgRef.value
    ? d3.zoomTransform(svgRef.value)
    : d3.zoomIdentity;
  svg.selectAll('*').remove();
  svg.on('click.signal-highlight', (event: MouseEvent) => {
    const target = event.target;
    if (target instanceof Element && target.closest('g.node')) return;
    clearSignalHighlight();
  });

  if (!circuitStore.parseData.tree || !svgContainer.value) return;

  const treeData = buildD3Hierarchy(circuitStore.parseData.tree);
  const confirmed = confirmedNamesSet();
  const vulnerable = vulnerableNamesSet();
  const collapsed = new Set(props.collapsedNodeIds);
  const visibleTreeData = buildVisibleTemplateTree(treeData, collapsed, confirmed, vulnerable);
  const visibleNodeIds = collectTreeNodeIds(visibleTreeData);

  renderedTreeData = treeData;
  signalRelationGraph = buildSignalRelationGraph(treeData);
  applySharedSignalHighlight(treeData);

  if (detailPanel.node && !visibleNodeIds.has(detailPanel.node.id)) {
    detailPanel.visible = false;
    detailPanel.node = null;
    resetWrapperConfig();
  }

  const containerWidth = svgContainer.value.clientWidth;
  const containerHeight = svgContainer.value.clientHeight;

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

  const selectedSignalShadow = defs.append('filter')
    .attr('id', 'selected-signal-shadow')
    .attr('x', '-100%')
    .attr('y', '-100%')
    .attr('width', '300%')
    .attr('height', '300%');

  selectedSignalShadow.append('feDropShadow')
    .attr('dx', 0)
    .attr('dy', 0)
    .attr('stdDeviation', 2.5)
    .attr('flood-color', SELECTED_SIGNAL_COLOR)
    .attr('flood-opacity', 0.8);

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

  const root = d3.hierarchy<TreeNodeData>(visibleTreeData);

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

  const nodeGroups = nodesGroup.selectAll('g')
    .data(root.descendants())
    .join('g')
    .attr('class', 'node')
    .attr('transform', (d) => `translate(${d.y}, ${d.x})`)
    .style('cursor', (d) => d.data.templateInfo ? 'pointer' : 'default');

  nodeGroups.each(function (d) {
    const nodeG = d3.select(this);
    const fullNode = findTreeNode(treeData, d.data.id) ?? d.data;
    const color = circuitStore.getTemplateColor(fullNode.templateName);
    const isExternal = fullNode.isExternal;
    const isRecursiveReference = fullNode.isRecursiveReference;
    const isConfirmed = confirmed.has(fullNode.templateName);
    const isVulnerable = vulnerable.has(fullNode.templateName);
    const isNmLib = !!fullNode.nodeModulesLibrary;
    const hw = NODE_WIDTH / 2;

    nodeG.attr('opacity', 0.85);

    const headerColor = color;
    const bodyFill = '#ffffff';
    const isCompilationFailure = isCompilationFailureNode(fullNode);
    const borderColor = isCompilationFailure ? COMPILATION_FAILURE_RED : (isVulnerable ? VULNERABLE_RED : (isConfirmed ? CONFIRMED_GREEN : '#e2e8f0'));

    const bgRect = nodeG.append('rect')
      .attr('class', 'node-bg')
      .attr('x', -hw)
      .attr('y', -NODE_HEIGHT / 2)
      .attr('width', NODE_WIDTH)
      .attr('height', NODE_HEIGHT)
      .attr('rx', 8)
      .attr('fill', bodyFill)
      .attr('stroke', borderColor)
      .attr('stroke-width', isCompilationFailure ? 3.5 : (isConfirmed ? 2 : 1.5))
      .attr('stroke-dasharray', isCompilationFailure ? 'none' : (isConfirmed ? 'none' : (isExternal ? '6 3' : 'none')));

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

    let headerLabel = fullNode.templateName;
    const maxLabelWidth = NODE_WIDTH - 16;

    if (isNmLib && fullNode.nodeModulesLibrary) {
      const libLabel = fullNode.nodeModulesLibrary;
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

    const bodyCenterY = bodyTop + BODY_HEIGHT / 2 - 2;

    if (isRecursiveReference) {
      nodeG.append('rect')
        .attr('class', 'recursive-enclosure')
        .attr('x', -hw - RECURSIVE_ENCLOSURE_PAD)
        .attr('y', -NODE_HEIGHT / 2 - RECURSIVE_ENCLOSURE_PAD)
        .attr('width', NODE_WIDTH + RECURSIVE_ENCLOSURE_PAD * 2)
        .attr('height', NODE_HEIGHT + RECURSIVE_ENCLOSURE_PAD * 2)
        .attr('rx', 10)
        .attr('fill', 'none')
        .attr('stroke', RECURSIVE_BORDER)
        .attr('stroke-width', 2.5)
        .attr('stroke-dasharray', '6 3')
        .attr('pointer-events', 'none');

      nodeG.append('text')
        .attr('x', hw + RECURSIVE_ENCLOSURE_PAD + 8)
        .attr('y', 0)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'middle')
        .attr('fill', RECURSIVE_BORDER)
        .attr('font-size', '24px')
        .attr('font-weight', '700')
        .attr('pointer-events', 'none')
        .text('...');
    } else if (isExternal) {
      nodeG.append('text')
        .attr('x', 0)
        .attr('y', bodyCenterY)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#94a3b8')
        .attr('font-size', '10px')
        .attr('font-style', 'italic')
        .text('external / primitive');
    } else {
      const signals = fullNode.templateInfo?.signals || [];
      const inputSignals = signals.filter(s => s.kind === 'input');
      const outputSignals = signals.filter(s => s.kind === 'output');

      const dotR = 5;
      const dotSpacing = 15;
      const leftStart = -hw + 15;
      const rightStart = hw - 15;

      for (let i = 0; i < inputSignals.length; i++) {
        const cx = leftStart + i * dotSpacing;
        if (cx >= -4) break;
        const sig = inputSignals[i];
        nodeG.append('circle')
          .attr('class', 'signal-dot')
          .attr('data-signal-key', makeSignalKey(fullNode.id, sig.name))
          .attr('cx', cx)
          .attr('cy', bodyCenterY)
          .attr('r', dotR)
          .attr('fill', '#2563eb')
          .style('cursor', 'pointer')
          .on('click', (event) => handleSignalClick(event as MouseEvent, fullNode, sig.name))
          .on('mouseenter', (event) => showSignalTooltip(event as MouseEvent, sig.name))
          .on('mousemove', (event) => showSignalTooltip(event as MouseEvent, sig.name))
          .on('mouseleave', hideSignalTooltip);
      }

      for (let i = 0; i < outputSignals.length; i++) {
        const cx = rightStart - i * dotSpacing;
        if (cx <= 4) break;
        const sig = outputSignals[i];
        nodeG.append('circle')
          .attr('class', 'signal-dot')
          .attr('data-signal-key', makeSignalKey(fullNode.id, sig.name))
          .attr('cx', cx)
          .attr('cy', bodyCenterY)
          .attr('r', dotR)
          .attr('fill', '#16a34a')
          .style('cursor', 'pointer')
          .on('click', (event) => handleSignalClick(event as MouseEvent, fullNode, sig.name))
          .on('mouseenter', (event) => showSignalTooltip(event as MouseEvent, sig.name))
          .on('mousemove', (event) => showSignalTooltip(event as MouseEvent, sig.name))
          .on('mouseleave', hideSignalTooltip);
      }
    }

    if (isConfirmed && !isExternal) {
      nodeG.append('rect')
        .attr('class', isVulnerable ? 'node-vulnerable-overlay' : 'node-confirmed-overlay')
        .attr('x', -hw)
        .attr('y', -NODE_HEIGHT / 2)
        .attr('width', NODE_WIDTH)
        .attr('height', NODE_HEIGHT)
        .attr('rx', 8)
        .attr('fill', isVulnerable ? VULNERABLE_RED : CONFIRMED_GREEN)
        .attr('opacity', 0.3)
        .attr('pointer-events', 'none');
    }

    if (hasFoldableConfirmedChild(fullNode, confirmed, vulnerable)) {
      const isCollapsed = collapsed.has(fullNode.id);
      const actionLabel = `${isCollapsed ? 'Expand' : 'Fold'} confirmed descendants of ${fullNode.templateName}`;
      const control = nodeG.append('g')
        .attr('class', 'fold-toggle')
        .attr('transform', `translate(${hw}, 0)`)
        .attr('role', 'button')
        .attr('tabindex', 0)
        .attr('aria-label', actionLabel)
        .style('cursor', 'pointer');

      control.append('title').text(actionLabel);
      control.append('rect')
        .attr('x', -12)
        .attr('y', -12)
        .attr('width', 24)
        .attr('height', 24)
        .attr('rx', 5)
        .attr('fill', '#ffffff')
        .attr('stroke', isCollapsed ? '#409eff' : '#cbd5e1')
        .attr('stroke-width', 1.5)
        .attr('filter', 'url(#node-shadow)');
      control.append('path')
        .attr('d', isCollapsed ? EXPAND_ICON_PATH : FOLD_ICON_PATH)
        .attr('transform', 'translate(-7.2, -7.2) scale(0.014)')
        .attr('fill', isCollapsed ? '#409eff' : '#475569')
        .attr('pointer-events', 'none');

      const activate = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        if (isCollapsed) emit('expand-node', fullNode.id);
        else emit('fold-node', fullNode.id);
      };

      control
        .on('click', activate)
        .on('dblclick', (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
        })
        .on('keydown', (event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') activate(event);
        });
    }

  });

  nodeGroups
    .on('mouseenter', function (_event, d) {
      d3.select(this).select('.node-bg').attr('stroke-width', isCompilationFailureNode(d.data) ? 3.5 : 2.5);
    })
    .on('mouseleave', function (_event, d) {
      const fullNode = findTreeNode(treeData, d.data.id) ?? d.data;
      const isSelected = fullNode.id === selectedTreeNodeId();
      const isConfirmedNode = confirmed.has(fullNode.templateName);
      const isVulnerableNode = vulnerable.has(fullNode.templateName);
      const isCompilationFailure = isCompilationFailureNode(fullNode);
      const border = isCompilationFailure ? COMPILATION_FAILURE_RED : (isVulnerableNode ? VULNERABLE_RED : (isConfirmedNode ? CONFIRMED_GREEN : (isSelected ? '#1a73e8' : '#e2e8f0')));
      const sw = isCompilationFailure ? 3.5 : (isConfirmedNode ? 2 : (isSelected ? 2.5 : 1.5));
      d3.select(this).select('.node-bg')
        .attr('stroke', border)
        .attr('stroke-width', sw);
    })
    .on('click', (_event, d) => {
      const fullNode = findTreeNode(treeData, d.data.id) ?? d.data;
      if (fullNode.templateInfo && !fullNode.isRecursiveReference) {
        circuitStore.setSelectedTemplate(fullNode.templateInfo, fullNode.path);
      }
    })
    .on('dblclick', (event: MouseEvent, d) => {
      event.preventDefault();
      event.stopPropagation();
      const fullNode = findTreeNode(treeData, d.data.id) ?? d.data;
      if (!fullNode.templateInfo || fullNode.isExternal || fullNode.isRecursiveReference) return;
      if (!isNodeSelectable(fullNode)) return;
      circuitStore.setSelectedTemplate(fullNode.templateInfo, fullNode.path);
      detailPanel.node = fullNode;
      detailPanel.visible = true;
      circuitStore.highlightTemplate(fullNode.sourceFile, fullNode.templateName);
      resetWrapperConfig();
      void handlePanelSelect();
    });

  const bordersGroup = g.append('g').attr('class', 'subtree-borders');

  root.descendants().forEach(node => {
    if (!node.data.instanceCount || node.data.instanceCount <= 1) return;

    const desc = node.descendants();
    const borderPad = 10;

    const yGroups = new Map<number, typeof desc>();
    for (const d of desc) {
      const y = d.y ?? 0;
      if (!yGroups.has(y)) yGroups.set(y, []);
      yGroups.get(y)!.push(d);
    }
    const yValues = Array.from(yGroups.keys()).sort((a, b) => a - b);

    const layers = yValues.map(y => {
      const nodes = yGroups.get(y)!;
      return {
        leftX: y - NODE_WIDTH / 2 - borderPad,
        rightX: y + NODE_WIDTH / 2 + borderPad,
        topY: Math.min(...nodes.map(n => n.x ?? 0)) - NODE_HEIGHT / 2 - borderPad,
        bottomY: Math.max(...nodes.map(n => n.x ?? 0)) + NODE_HEIGHT / 2 + borderPad,
      };
    });

    const points: string[] = [];
    for (const layer of layers) {
      points.push(`${layer.leftX},${layer.topY}`);
      points.push(`${layer.rightX},${layer.topY}`);
    }
    const deepest = layers[layers.length - 1];
    for (let i = layers.length - 1; i >= 0; i--) {
      points.push(`${layers[i].rightX},${layers[i].bottomY}`);
      points.push(`${layers[i].leftX},${layers[i].bottomY}`);
    }

    bordersGroup.append('polygon')
      .attr('points', points.join(' '))
      .attr('fill', 'none')
      .attr('stroke', '#64748b')
      .attr('stroke-width', 2.5)
      .attr('stroke-dasharray', '6 3')
      .attr('pointer-events', 'none');

    bordersGroup.append('text')
      .attr('x', deepest.rightX + 16)
      .attr('y', (deepest.topY + deepest.bottomY) / 2)
      .attr('text-anchor', 'start')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#475569')
      .attr('font-size', '20px')
      .attr('font-weight', '700')
      .attr('pointer-events', 'none')
      .text(`×${node.data.instanceCount}`);
  });

  const markedFlagsGroup = g.append('g')
    .attr('class', 'marked-template-flags')
    .attr('pointer-events', 'none');
  const markedFlags = markedFlagsGroup
    .selectAll<SVGGElement, d3.HierarchyPointNode<TreeNodeData>>('g.marked-template-flag')
    .data(root.descendants())
    .join('g')
    .attr('class', 'marked-template-flag')
    .attr('transform', d => `translate(${(d.y ?? 0) + NODE_WIDTH / 2 - 2}, ${(d.x ?? 0) - NODE_HEIGHT / 2 + 2})`);
  markedFlags.append('circle')
    .attr('r', 13)
    .attr('fill', '#ffffff')
    .attr('stroke', '#ef4444')
    .attr('stroke-width', 2)
    .attr('filter', 'url(#node-shadow)');
  markedFlags.append('line')
    .attr('x1', -4)
    .attr('y1', -7)
    .attr('x2', -4)
    .attr('y2', 8)
    .attr('stroke', '#dc2626')
    .attr('stroke-width', 2.4)
    .attr('stroke-linecap', 'round');
  markedFlags.append('path')
    .attr('d', 'M-3,-7 H7 L4,-2 L7,3 H-3 Z')
    .attr('fill', '#ef4444');

  zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.15, 3])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });

  svg.call(zoomBehavior as unknown as (selection: d3.Selection<SVGSVGElement | null, unknown, null, undefined>) => void);

  if (options.fitToView !== false) nextTick(() => {
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
  else {
    (svg as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>).call(
      zoomBehavior.transform,
      previousTransform,
    );
  }

  updateSelection();
  updateSignalHighlights();
  updateSearchHighlights();
  updateMarkedFlags();
}

function resetWrapperConfig() {
  paramResponse.value = null;
  showParamDialog.value = false;
  selectedCandidateIndex.value = -1;
  Object.keys(paramInputs).forEach(key => delete paramInputs[key]);
  Object.keys(paramVisibility).forEach(key => delete paramVisibility[key]);
  Object.keys(signalVisibility).forEach(key => delete signalVisibility[key]);
  signalVisibilitySections.value = [];
}

async function handlePanelSelect() {
  if (!detailPanel.node?.templateInfo) return;

  if (!isNodeSelectable(detailPanel.node)) return;

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

    signalVisibilitySections.value = isRootDetailNode() ? ['signals'] : [];
    showParamDialog.value = true;
  } catch (error: any) {
    ElMessage.error(`Failed to search for template parameters: ${error.message}`);
  } finally {
    isSelecting.value = false;
  }
}

const isParamSelectionValid = computed(() => {
  if (!paramResponse.value) return false;
  return paramResponse.value.templateParams.every(
    paramName => paramInputs[paramName] && paramInputs[paramName].trim() !== ''
  );
});

const canPartialCompile = computed(() => {
  if (!isNodeSelectableForPanel.value || !detailPanel.node?.templateInfo) return false;
  if (!paramResponse.value || !showParamDialog.value) return true;
  return isParamSelectionValid.value;
});

async function handlePartialCompile() {
  if (!paramResponse.value || !showParamDialog.value) {
    await handlePanelSelect();
    return;
  }

  confirmParamSelection();
}

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
  const vulnerable = vulnerableNamesSet();

  svg.selectAll<SVGGElement, d3.HierarchyPointNode<TreeNodeData>>('g.node').each(function (d) {
    const nodeGroup = d3.select(this);
    const data = renderedTreeData
      ? (findTreeNode(renderedTreeData, d.data.id) ?? d.data)
      : d.data;
    const isSelected = data.id === selectedTreeNodeId();
    const isConfirmedNode = confirmed.has(data.templateName);
    const isVulnerableNode = vulnerable.has(data.templateName);
    const isCompilationFailure = isCompilationFailureNode(data);

    const bgRect = nodeGroup.select('.node-bg');
    if (isCompilationFailure) {
      bgRect
        .attr('filter', 'url(#node-shadow)')
        .attr('stroke', COMPILATION_FAILURE_RED)
        .attr('stroke-width', 3.5)
        .attr('stroke-dasharray', 'none')
        .attr('fill', '#ffffff');
    } else if (isVulnerableNode && !data.isExternal) {
      bgRect
        .attr('filter', 'url(#node-shadow)')
        .attr('stroke', VULNERABLE_RED)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', 'none')
        .attr('fill', '#ffffff');
    } else if (isConfirmedNode && !data.isExternal) {
      bgRect
        .attr('filter', 'url(#node-shadow)')
        .attr('stroke', CONFIRMED_GREEN)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', 'none')
        .attr('fill', '#ffffff');
    } else if (isSelected) {
      bgRect
        .attr('filter', 'url(#selected-glow)')
        .attr('stroke', '#1a73e8')
        .attr('stroke-width', 2.5)
        .attr('stroke-dasharray', 'none')
        .attr('fill', '#ffffff');
    } else if (!data.isExternal) {
      bgRect
        .attr('filter', 'url(#node-shadow)')
        .attr('stroke', '#e2e8f0')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', 'none')
        .attr('fill', '#ffffff');
    }
  });
}

function updateSearchHighlights() {
  const query = props.searchQuery.trim().toLowerCase();
  const svg = d3.select(svgRef.value);

  svg.selectAll<SVGGElement, d3.HierarchyPointNode<TreeNodeData>>('g.node')
    .attr('opacity', d => {
      if (!query) return 0.85;
      const data = renderedTreeData
        ? (findTreeNode(renderedTreeData, d.data.id) ?? d.data)
        : d.data;
      const searchText = [data.templateName, data.instanceName, ...data.instanceNames]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchText.includes(query) ? 1 : 0.18;
    });
}

function updateMarkedFlags() {
  const marked = new Set(props.markedNodeIds);
  const svg = d3.select(svgRef.value);

  svg.selectAll<SVGGElement, d3.HierarchyPointNode<TreeNodeData>>('g.marked-template-flag')
    .attr('display', d => marked.has(d.data.id) ? null : 'none');
}

function focusTreeNode(nodeId: string) {
  if (!nodeId || !zoomBehavior || !svgRef.value || !svgContainer.value) return;
  const svg = d3.select(svgRef.value);
  const target = svg
    .selectAll<SVGGElement, d3.HierarchyPointNode<TreeNodeData>>('g.node')
    .data()
    .find(d => d.data.id === nodeId);
  if (!target) return;

  const currentTransform = d3.zoomTransform(svgRef.value);
  const scale = Math.min(Math.max(currentTransform.k, 0.65), 1.2);
  const tx = svgContainer.value.clientWidth / 2 - target.y * scale;
  const ty = svgContainer.value.clientHeight / 2 - target.x * scale;
  const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
  const svgSelection = svg as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>;
  svgSelection.transition().duration(320).call(zoomBehavior.transform, transform);
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
  () => circuitStore.parseData.tree,
  (tree) => {
    selectedSignalKeys.value = new Set();
    signalRelationGraph = new Map();
    renderedTreeData = null;
    if (tree) {
      nextTick(() => renderTree());
    } else {
      d3.select(svgRef.value).selectAll('*').remove();
    }
  },
  { immediate: true }
);

watch(
  () => circuitStore.signalHighlight?.version,
  () => {
    applySharedSignalHighlight();
  }
);

watch(
  () => circuitStore.selectedTemplate,
  () => {
    updateSelection();
    updateSearchHighlights();
  }
);

watch(
  () => props.searchQuery,
  () => updateSearchHighlights(),
);

watch(
  () => props.markedNodeIds,
  () => updateMarkedFlags(),
  { deep: true },
);

watch(
  [() => props.focusNodeId, () => props.focusRequestVersion],
  ([nodeId]) => {
    if (nodeId) nextTick(() => focusTreeNode(nodeId));
  },
);

watch(
  () => circuitStore.parseCompilation,
  () => updateSelection(),
  { deep: true },
);

watch(
  [() => circuitStore.confirmedTemplateNames, () => circuitStore.vulnerableTemplateNames],
  () => {
    renderTree({ fitToView: false });
  },
  { deep: true }
);

let lastFitToViewVersion = props.fitToViewVersion;
watch(
  [() => props.collapsedNodeIds, () => props.fitToViewVersion],
  ([, fitToViewVersion]) => {
    const shouldFit = fitToViewVersion !== lastFitToViewVersion;
    lastFitToViewVersion = fitToViewVersion;
    renderTree({ fitToView: shouldFit });
  },
  { deep: true },
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

.signal-tooltip {
  position: absolute;
  z-index: 50;
  transform: translateX(-50%);
  max-width: 240px;
  padding: 6px 10px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  background: var(--el-bg-color-overlay);
  color: var(--el-text-color-primary);
  box-shadow: var(--el-box-shadow-light);
  font-size: 12px;
  line-height: 1.2;
  pointer-events: none;
  white-space: nowrap;
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

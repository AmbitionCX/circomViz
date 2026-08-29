<template>
  <div class="circuit-view-container h-full flex flex-col overflow-hidden">
    <div class="template-tree-toolbar mb-3 flex-shrink-0">
      <div class="template-tree-context">
        <h2 class="view-title text-base font-bold text-gray-800">Template Tree</h2>
        <el-tooltip content="Explore the circuit’s template and component hierarchy, inspect template details, or start partial compilation." placement="top">
          <el-icon class="text-gray-400 cursor-help">
            <QuestionFilled />
          </el-icon>
        </el-tooltip>
        <el-tooltip
          v-if="compilationStatus"
          :content="compilationStatus.message || compilationStatusLabel"
          placement="top"
        >
          <el-tag :type="compilationStatusType" effect="plain" round class="compile-status-tag">
            {{ compilationStatusLabel }}
          </el-tag>
        </el-tooltip>
        <div v-if="compilationStatus?.status === 'failure'" class="error-template-legend">
          <span class="error-template-swatch"></span>
          <span>Error template</span>
        </div>
        <div class="flex-shrink-0 ml-2" style="width: 240px" @click.stop>
          <el-input
            v-model="templateSearchQuery"
            :prefix-icon="Search"
            clearable
            placeholder="Search template nodes"
            style="--el-input-bg-color: #f8fafc"
          />
        </div>
      </div>

      <div v-if="treeData" class="template-mark-space">
        <el-button round class="mark-template-action" :disabled="!canMarkSelectedNode" @click="toggleSelectedMark">
          <el-icon><Flag /></el-icon>
          <span>{{ selectedNodeIsMarked ? 'Unmark' : 'Mark' }}</span>
        </el-button>

        <div class="marked-template-strip" aria-label="Marked templates">
          <el-tooltip
            v-for="entry in markedNodes"
            :key="entry.id"
            :content="markedNodeTooltip(entry.node)"
            placement="top"
          >
            <button
              type="button"
              class="marked-template-chip"
              :class="{ 'is-selected': selectedNodeId === entry.id }"
              :style="markedNodeStyle(entry.node.templateName)"
              :aria-label="`Jump to ${entry.node.templateName}`"
              @click="jumpToMarkedNode(entry.id)"
            >
              {{ entry.node.templateName.slice(0, 1).toUpperCase() }}
            </button>
          </el-tooltip>
        </div>
      </div>

      <el-button-group v-if="treeData" class="tree-fold-actions">
        <el-button round :disabled="!canFoldAll" @click="foldAll">
          <el-icon><FoldIcon /></el-icon>
          <span>Fold All</span>
        </el-button>
        <el-button round :disabled="!canExpandAll" @click="expandAll">
          <el-icon><ExpandIcon /></el-icon>
          <span>Expand All</span>
        </el-button>
      </el-button-group>
    </div>

    <div class="flex-1 min-h-0 overflow-hidden">
      <CircuitViewVisualization
        :collapsed-node-ids="collapsedNodeIdList"
        :fit-to-view-version="fitToViewVersion"
        :search-query="templateSearchQuery"
        :marked-node-ids="markedNodeIds"
        :focus-node-id="focusNodeId"
        :focus-request-version="focusRequestVersion"
        @fold-node="foldNode"
        @expand-node="expandNode"
        @template-params-selected="(data: any) => emit('template-params-selected', data)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { Expand as ExpandIcon, Flag, Fold as FoldIcon, QuestionFilled, Search } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import CircuitViewVisualization from './CircuitViewVisualization.vue';
import { getParseCompilationStatus } from '@/apis';
import { useCircuitStore } from '@/stores/circuit';
import {
  buildD3Hierarchy,
  collectAncestorNodeIds,
  collectFoldableNodeIds,
  collectSubtreeNodeIds,
  findTreeNode,
  treeNodeIdForSelection,
} from '@/utils/templateTree';

const circuitStore = useCircuitStore();
const collapsedNodeIds = ref<Set<string>>(new Set());
const fitToViewVersion = ref(0);
const templateSearchQuery = ref('');
const markedNodeIds = ref<string[]>([]);
const focusNodeId = ref('');
const focusRequestVersion = ref(0);
const compilationStatus = computed(() => circuitStore.parseCompilation);
const treeData = computed(() =>
  circuitStore.parseData.tree ? buildD3Hierarchy(circuitStore.parseData.tree) : null
);
const confirmedNames = computed(() => new Set(circuitStore.confirmedTemplateNames));
const vulnerableNames = computed(() => new Set(circuitStore.vulnerableTemplateNames));
const foldableNodeIds = computed(() =>
  treeData.value
    ? collectFoldableNodeIds(treeData.value, confirmedNames.value, vulnerableNames.value)
    : new Set<string>()
);
const collapsedNodeIdList = computed(() => [...collapsedNodeIds.value]);
const canFoldAll = computed(() =>
  [...foldableNodeIds.value].some(id => !collapsedNodeIds.value.has(id))
);
const canExpandAll = computed(() => collapsedNodeIds.value.size > 0);
const selectedNodeId = computed(() => {
  if (!circuitStore.selectedTemplate) return null;
  return treeNodeIdForSelection(
    circuitStore.selectedTemplate.templateName,
    circuitStore.selectedTemplatePath,
  );
});
const selectedTreeNode = computed(() => {
  if (!treeData.value || !selectedNodeId.value) return null;
  return findTreeNode(treeData.value, selectedNodeId.value);
});
const canMarkSelectedNode = computed(() => {
  const node = selectedTreeNode.value;
  return !!node?.templateInfo && !node.isExternal && !node.isRecursiveReference;
});
const selectedNodeIsMarked = computed(() =>
  !!selectedNodeId.value && markedNodeIds.value.includes(selectedNodeId.value)
);
const markedNodes = computed(() => {
  if (!treeData.value) return [];
  return markedNodeIds.value.flatMap(id => {
    const node = findTreeNode(treeData.value!, id);
    return node ? [{ id, node }] : [];
  });
});

function markedNodeStyle(templateName: string) {
  const color = circuitStore.getTemplateColor(templateName);
  return {
    backgroundColor: color,
    borderColor: color,
  };
}

function markedNodeTooltip(node: { templateName: string; path: string[] }) {
  return `${node.templateName} · ${node.path.join(' › ') || 'root'}`;
}

function toggleSelectedMark() {
  if (!canMarkSelectedNode.value || !selectedNodeId.value) return;
  const nodeId = selectedNodeId.value;
  markedNodeIds.value = markedNodeIds.value.includes(nodeId)
    ? markedNodeIds.value.filter(id => id !== nodeId)
    : [...markedNodeIds.value, nodeId];
}

async function jumpToMarkedNode(nodeId: string) {
  if (!treeData.value) return;
  const node = findTreeNode(treeData.value, nodeId);
  const ancestorIds = collectAncestorNodeIds(treeData.value, nodeId);
  if (!node?.templateInfo || !ancestorIds) return;

  templateSearchQuery.value = '';
  const nextCollapsed = new Set(collapsedNodeIds.value);
  ancestorIds.forEach(id => nextCollapsed.delete(id));
  collapsedNodeIds.value = nextCollapsed;
  circuitStore.setSelectedTemplate(node.templateInfo, node.path);

  await nextTick();
  focusNodeId.value = nodeId;
  focusRequestVersion.value += 1;
}

function foldNode(nodeId: string) {
  if (!treeData.value) return;
  const node = findTreeNode(treeData.value, nodeId);
  if (!node) return;

  const next = new Set(collapsedNodeIds.value);
  collectFoldableNodeIds(node, confirmedNames.value, vulnerableNames.value)
    .forEach(id => next.add(id));
  collapsedNodeIds.value = next;
}

function expandNode(nodeId: string) {
  if (!treeData.value) return;
  const node = findTreeNode(treeData.value, nodeId);
  if (!node) return;

  const next = new Set(collapsedNodeIds.value);
  collectSubtreeNodeIds(node).forEach(id => next.delete(id));
  collapsedNodeIds.value = next;
}

function foldAll() {
  collapsedNodeIds.value = new Set(foldableNodeIds.value);
  fitToViewVersion.value += 1;
}

function expandAll() {
  collapsedNodeIds.value = new Set();
  fitToViewVersion.value += 1;
}
const compilationStatusLabel = computed(() => {
  if (compilationStatus.value?.status === 'success') return 'Compile Success';
  if (compilationStatus.value?.status === 'failure') return 'Compile Failed';
  return 'Compiling';
});
const compilationStatusType = computed(() => {
  if (compilationStatus.value?.status === 'success') return 'success';
  if (compilationStatus.value?.status === 'failure') return 'danger';
  return 'info';
});
let pollTimer: ReturnType<typeof setTimeout> | null = null;

const stopPolling = () => {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
};

const pollCompilation = async (id: string) => {
  if (circuitStore.parseCompilation?.id !== id || circuitStore.parseCompilation.status !== 'compiling') return;
  try {
    const status = await getParseCompilationStatus(id);
    if (circuitStore.parseCompilation?.id !== id) return;
    circuitStore.setParseCompilation(status);
    if (status.status === 'success') ElMessage.success('Circuit compilation succeeded');
    else if (status.status === 'failure') ElMessage.error(status.message || 'Circuit compilation failed');
    else pollTimer = setTimeout(() => void pollCompilation(id), 1000);
  } catch {
    pollTimer = setTimeout(() => void pollCompilation(id), 1500);
  }
};

watch(
  () => circuitStore.parseCompilation?.id,
  (id) => {
    stopPolling();
    if (id && circuitStore.parseCompilation?.status === 'compiling') {
      pollTimer = setTimeout(() => void pollCompilation(id), 250);
    }
  },
  { immediate: true },
);

watch(
  () => circuitStore.parseData.tree,
  () => {
    collapsedNodeIds.value = new Set();
    markedNodeIds.value = [];
    focusNodeId.value = '';
    templateSearchQuery.value = '';
  },
);

watch(foldableNodeIds, (ids) => {
  const validIds = new Set([...collapsedNodeIds.value].filter(id => ids.has(id)));
  if (validIds.size !== collapsedNodeIds.value.size) {
    collapsedNodeIds.value = validIds;
  }
});

onUnmounted(stopPolling);

const emit = defineEmits<{
  'template-params-selected': [data: {
    templateName: string;
    params: { name: string; value: number }[];
    publicParams: string[];
    publicSignals: string[];
  }];
}>();
</script>

<style scoped>
.compile-status-tag {
  min-height: 28px;
  padding: 0 14px;
  font-size: 14px;
  font-weight: 600;
}

.error-template-legend {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #606266;
  font-size: 12px;
}

.error-template-swatch {
  width: 12px;
  height: 12px;
  border: 2px solid #f56c6c;
  border-radius: 2px;
  background: rgba(245, 108, 108, 0.16);
}

.view-title {
  padding: 2px 10px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.view-title:hover {
  border-color: #409eff;
  color: #409eff;
}

.circuit-view-container {
  background: white;
  border-radius: 8px;
}

.template-tree-toolbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.template-tree-context {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.marked-template-strip {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  padding: 3px;
  scrollbar-width: thin;
}

.marked-template-chip {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid;
  border-radius: 7px;
  color: white;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.16);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.marked-template-chip:hover {
  transform: translateY(-1px);
  box-shadow: 0 3px 7px rgba(15, 23, 42, 0.22);
}

.marked-template-chip.is-selected {
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #409eff;
}

.template-mark-space {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 220px;
  min-height: 40px;
  padding: 5px 8px;
  overflow: hidden;
  background: rgba(241, 243, 245, 0.7);
  border-radius: 10px;
}

.mark-template-action {
  min-width: 96px;
}

.mark-template-action :deep(span) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.tree-fold-actions :deep(.el-button) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 96px;
}
</style>

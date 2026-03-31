<template>
  <div class="debugging-visualization h-full w-full flex flex-col overflow-hidden">
    <div class="flex items-center gap-3 px-3 py-2 bg-white border-b border-gray-200 flex-shrink-0">
      <span class="text-xs font-medium text-gray-500">{{ toolbarSummary }}</span>
      <span v-if="signalBreakdown" class="text-xs text-gray-400">{{ signalBreakdown }}</span>
      <div class="flex-1" />
      <el-button v-if="activeSlice && !isCompact" size="small" @click="clearSlice">
        Clear Slice
      </el-button>
    </div>
    <div class="flex flex-1 min-h-0">
      <SlicePanel
        class="flex-shrink-0"
        style="width: 300px;"
        :schema-summary="currentSchemaSummary"
        @slice-selected="handleSliceSelected"
        @load-full-slice="handleLoadFullSlice"
      />
      <div class="flex-1 min-w-0 flex flex-col">
        <div
          class="flex-1 min-h-0 overflow-hidden"
          :style="{ flexBasis: topPanelRatio + '%' }"
        >
          <ConstraintTreeView
            class="h-full w-full"
            :slice-result="activeSlice"
            :target-signals="activeTargetSignals"
            :all-signal-names="allSignalNames"
            @schema-summary="currentSchemaSummary = $event"
          />
        </div>
        <div
          class="splitter-bar flex-shrink-0 cursor-row-resize"
          @mousedown="startDrag"
        />
        <div
          class="overflow-hidden"
          :style="{ flexBasis: bottomPanelRatio + '%' }"
        >
          <VerificationResultsPanel
            :constraint-indices="activeConstraintIndices"
            :active-target-signals="activeTargetSignals"
            :slice-id="activeSliceId"
            @signal-click="handleSignalClick"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useCircuitStore } from '@/stores/circuit';
import { coneSlice, bipartiteGraph } from '@/apis';
import type { SliceResult, SliceCandidate } from '@/types/circuitTypes';
import SlicePanel from './SlicePanel.vue';
import ConstraintTreeView from './ConstraintTreeView.vue';
import VerificationResultsPanel from './VerificationResultsPanel.vue';

const circuitStore = useCircuitStore();
const activeSlice = ref<SliceResult | null>(null);
const activeSliceId = ref<string | null>(null);
const activeTargetSignals = ref<string[]>([]);
const bipartiteLoaded = ref(false);
const currentSchemaSummary = ref('');
const topPanelRatio = ref(60);
const bottomPanelRatio = ref(40);

const activeConstraintIndices = computed(() => activeSlice.value?.constraintIndices || []);

const isCompact = computed(() => {
  const meta = circuitStore.bipartiteData.graph?.metadata;
  if (!meta) return false;
  return meta.componentCount === 0 || meta.constraintCount < 50;
});

const toolbarSummary = computed(() => {
  if (!circuitStore.compilationData.symPath) return '';
  const meta = circuitStore.bipartiteData.graph?.metadata;
  if (!meta) return '';
  const parts: string[] = [];
  if (meta.signalCount) parts.push(`${meta.signalCount} signals`);
  if (meta.constraintCount) parts.push(`${meta.constraintCount} constraints`);
  if (meta.componentCount) parts.push(`${meta.componentCount} components`);
  if (activeSlice.value) {
    const label = isCompact.value ? 'full' : 'slice';
    parts.push(`(${label}: ${activeSlice.value.constraintCount}c / ${activeSlice.value.signalCount}s)`);
  }
  return parts.join(' | ');
});

const signalBreakdown = computed(() => {
  const meta = circuitStore.bipartiteData.graph?.metadata;
  if (!meta) return '';
  return `${meta.inputCount} in  ${meta.outputCount} out  ${meta.intermediateCount} mid`;
});

const allSignalNames = computed(() => {
  const names: string[] = [];
  const graph = circuitStore.bipartiteData.graph;
  if (graph) {
    for (const s of graph.topLevelSignals) {
      names.push(s.name);
    }
    for (const c of graph.components) {
      for (const s of c.signals) {
        names.push(s.name);
      }
    }
  }
  return names;
});

async function loadBipartiteData() {
  const symPath = circuitStore.compilationData.symPath;
  const constraintsJsonPath = circuitStore.compilationData.constraintsJsonPath;
  if (!symPath || !constraintsJsonPath || bipartiteLoaded.value) return;

  try {
    const graphResp = await bipartiteGraph({ symPath, constraintsJsonPath });
    if (graphResp.success) {
      circuitStore.bipartiteData.graph = graphResp;
    }
  } catch (err: any) {
    console.error('Failed to load bipartite graph:', err);
  } finally {
    bipartiteLoaded.value = true;
  }
}

async function loadFullTemplateSlice() {
  const symPath = circuitStore.compilationData.symPath;
  const constraintsJsonPath = circuitStore.compilationData.constraintsJsonPath;
  if (!symPath || !constraintsJsonPath) return;

  await loadBipartiteData();

  const graph = circuitStore.bipartiteData.graph;

  const allSignalNames: string[] = [];
  const allOutputNames: string[] = [];
  const allInputNames: string[] = [];

  if (graph) {
    const gatherSignals = (signals: any[]) => {
      for (const s of signals) {
        allSignalNames.push(s.name);
        if (s.classification === 'output') allOutputNames.push(s.name);
        if (s.classification === 'input') allInputNames.push(s.name);
      }
    };
    if (graph.topLevelSignals) gatherSignals(graph.topLevelSignals);
    if (graph.components) {
      for (const c of graph.components) {
        if (c.signals) gatherSignals(c.signals);
      }
    }
  }

  const targetSignals = allOutputNames.length > 0 ? allOutputNames : allInputNames.length > 0 ? allInputNames : allSignalNames;
  if (targetSignals.length === 0) return;

  const sourceSignals = allInputNames.length > 0 ? allInputNames : [];

  try {
    const response = await coneSlice({
      symPath,
      constraintsJsonPath,
      direction: 'bidirectional',
      targetSignals,
      sourceSignals,
    });

    if (response.success && response.slice) {
      activeSlice.value = response.slice;
      activeSliceId.value = '__full__';
      activeTargetSignals.value = [];
    }
  } catch (err: any) {
    console.error('Failed to load full template slice:', err);
  }
}

watch(
  () => circuitStore.compilationData.symPath,
  async (newPath) => {
    activeSlice.value = null;
    activeSliceId.value = null;
    activeTargetSignals.value = [];
    bipartiteLoaded.value = false;
    currentSchemaSummary.value = '';
    if (newPath && circuitStore.compilationData.constraintsJsonPath) {
      if (isCompact.value) {
        await loadFullTemplateSlice();
      } else {
        await loadBipartiteData();
      }
    }
  }
);

watch(
  () => circuitStore.compilationVersion,
  () => {
    activeSlice.value = null;
    activeSliceId.value = null;
    activeTargetSignals.value = [];
  }
);

function handleSliceSelected(slice: SliceResult, candidate: SliceCandidate | null, sliceId: string) {
  activeSlice.value = slice;
  activeSliceId.value = sliceId;
  activeTargetSignals.value = candidate?.targetSignals || [];
}

function clearSlice() {
  activeSlice.value = null;
  activeSliceId.value = null;
  activeTargetSignals.value = [];
}

async function handleLoadFullSlice() {
  await loadFullTemplateSlice();
}

function handleSignalClick(signalName: string) {
  circuitStore.toggleSignalSelection(signalName);
}

onMounted(async () => {
  const symPath = circuitStore.compilationData.symPath;
  const constraintsJsonPath = circuitStore.compilationData.constraintsJsonPath;
  if (symPath && constraintsJsonPath && !activeSlice.value) {
    if (isCompact.value) {
      await loadFullTemplateSlice();
    } else {
      await loadBipartiteData();
    }
  }
});

function startDrag(e: MouseEvent) {
  e.preventDefault();
  const parent = (e.currentTarget as HTMLElement).parentElement;
  if (!parent) return;
  const startY = e.clientY;
  const startTop = parent.children[0].getBoundingClientRect().height;
  const startBot = parent.children[2].getBoundingClientRect().height;
  const total = startTop + startBot;
  const onMove = (e: MouseEvent) => {
    const dy = e.clientY - startY;
    if (total <= 0) return;
    const newTop = Math.max(20, Math.min(total - 20, startTop + dy));
    topPanelRatio.value = (newTop / total) * 100;
    bottomPanelRatio.value = 100 - topPanelRatio.value;
  };

  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  document.body.style.cursor = 'row-resize';
  document.body.style.userSelect = 'none';
}
</script>

<style scoped>
.splitter-bar {
  height: 4px;
  background: #e5e7eb;
  transition: background 0.15s;
}
.splitter-bar:hover {
  background: #93c5fd;
}
</style>

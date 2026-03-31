<template>
  <div class="bg-white border-r border-gray-200 flex flex-col h-full">
    <div v-if="schemaSummary" class="px-3 py-2 border-b border-gray-100 flex-shrink-0">
      <div class="text-xs font-medium text-indigo-700 mb-1">Schema Summary</div>
      <div class="text-xs text-indigo-600">{{ schemaSummary }}</div>
    </div>

    <div class="flex-1 overflow-auto min-h-0 flex flex-col">
      <template v-if="isCompactTemplate">
        <div class="px-3 py-2 border-b border-gray-100 flex-shrink-0">
          <div
            class="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5 -mx-1 transition-colors"
            :class="{ 'bg-blue-50': loadingFullSlice }"
            @click="handleFullTemplateClick"
          >
            <el-tag size="small" type="success" effect="plain">Full Template</el-tag>
            <span class="text-xs text-gray-400">All constraints</span>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="px-3 py-2 border-b border-gray-100 flex-shrink-0">
          <div class="text-xs font-medium text-gray-500 mb-1">Auto-suggested Slices</div>
          <div v-if="loadingCandidates" class="flex items-center gap-1 text-xs text-gray-400">
            <el-icon class="is-loading" :size="12"><Loading /></el-icon>
            <span>Loading candidates...</span>
          </div>
          <div v-else-if="candidates.length === 0 && !candidatesError" class="flex items-center gap-2">
            <el-icon class="text-blue-400" :size="12"><Loading /></el-icon>
            <span class="text-xs text-gray-400">No sub-components found — loading all constraints</span>
          </div>
          <div v-else-if="candidatesError" class="text-xs text-red-400">
            {{ candidatesError }}
          </div>
        </div>

        <div class="flex-1 overflow-auto min-h-0 px-2 py-1">
          <div
            v-for="candidate in candidates"
            :key="candidate.id"
            class="mb-1"
          >
            <div
              class="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-50 transition-colors"
              :class="{ 'bg-blue-50 ring-1 ring-blue-200': activeCandidateId === candidate.id }"
              @click="executeCandidateSlice(candidate)"
            >
              <el-tooltip :content="directionTooltip(candidate.direction)" placement="top">
                <el-icon class="direction-icon" :class="directionIconClass(candidate.direction)" :size="14">
                  <component :is="directionIcon(candidate.direction)" />
                </el-icon>
              </el-tooltip>
              <div class="flex-1 min-w-0">
                <div class="text-xs font-medium text-gray-700 truncate">{{ stripMain(candidate.name) }}</div>
                <div class="text-xs text-gray-400">{{ candidate.signalCount }} signals</div>
              </div>
              <el-icon v-if="loadingSliceFor === candidate.id" class="is-loading text-gray-400" :size="14"><Loading /></el-icon>
              <el-tooltip v-else :content="groupKindTooltip(candidate.groupKind)" placement="top">
                <el-icon class="group-icon" :class="groupKindIconClass(candidate.groupKind)" :size="14">
                  <component :is="groupKindIcon(candidate.groupKind)" />
                </el-icon>
              </el-tooltip>
            </div>
          </div>
        </div>

        <div
          class="flex-shrink-0 px-2 py-2 border-t border-gray-100"
        >
          <div
            class="flex items-center gap-2 cursor-pointer hover:bg-green-50 rounded px-2 py-1.5 transition-colors"
            :class="{ 'bg-green-50 ring-1 ring-green-200': loadingFullSlice }"
            @click="handleFullTemplateClick"
          >
            <el-tag size="small" type="success" effect="plain">Full Template</el-tag>
            <span class="text-xs text-gray-400 flex-1">Show all constraints</span>
            <el-icon v-if="loadingFullSlice" class="is-loading text-green-500" :size="14"><Loading /></el-icon>
          </div>
        </div>

        <div class="flex-shrink-0 px-3 py-2 border-t border-gray-100 space-y-1.5">
          <div class="text-[11px] text-gray-400 font-medium">Slice direction</div>
          <div class="flex flex-wrap gap-x-3 gap-y-1">
            <span class="legend-item"><el-icon class="text-amber-500" :size="12"><Top /></el-icon><span class="text-gray-500">Backward</span></span>
            <span class="legend-item"><el-icon class="text-blue-500" :size="12"><Bottom /></el-icon><span class="text-gray-500">Forward</span></span>
            <span class="legend-item"><el-icon class="text-emerald-500" :size="12"><Sort /></el-icon><span class="text-gray-500">Bidirectional</span></span>
          </div>
          <div class="text-[11px] text-gray-400 font-medium">Source</div>
          <div class="flex flex-wrap gap-x-3 gap-y-1">
            <span class="legend-item"><el-icon class="text-green-600" :size="12"><Upload /></el-icon><span class="text-gray-500">Output array</span></span>
            <span class="legend-item"><el-icon class="text-green-400" :size="12"><Upload /></el-icon><span class="text-gray-500">Output signal</span></span>
            <span class="legend-item"><el-icon class="text-blue-600" :size="12"><Download /></el-icon><span class="text-gray-500">Input array</span></span>
            <span class="legend-item"><el-icon class="text-blue-400" :size="12"><Download /></el-icon><span class="text-gray-500">Input signal</span></span>
            <span class="legend-item"><el-icon class="text-orange-500" :size="12"><Box /></el-icon><span class="text-gray-500">Component</span></span>
            <span class="legend-item"><el-icon class="text-purple-500" :size="12"><MagicStick /></el-icon><span class="text-gray-500">Heuristic</span></span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { Loading, Top, Bottom, Sort, Upload, Download, Box, MagicStick } from '@element-plus/icons-vue';
import { useCircuitStore } from '@/stores/circuit';
import { sliceCandidates, coneSlice } from '@/apis';
import type { SliceCandidate, SliceResult, SliceDirection } from '@/types/circuitTypes';

defineProps<{
  schemaSummary: string;
}>();

const emit = defineEmits<{
  sliceSelected: [slice: SliceResult, candidate: SliceCandidate | null, sliceId: string];
  loadFullSlice: [];
}>();

const circuitStore = useCircuitStore();

const metadata = computed(() => circuitStore.bipartiteData.graph?.metadata ?? null);

const isCompactTemplate = computed(() => {
  if (!metadata.value) return false;
  return metadata.value.componentCount === 0 || metadata.value.constraintCount < 50;
});

const candidates = ref<SliceCandidate[]>([]);
const loadingCandidates = ref(false);
const candidatesError = ref('');
const activeCandidateId = ref<string | null>(null);
const loadingSliceFor = ref<string | null>(null);
const loadingFullSlice = ref(false);

function handleFullTemplateClick() {
  loadingFullSlice.value = true;
  emit('loadFullSlice');
}

function stripMain(s: string): string {
  return s.replace(/^main\./, '');
}

function directionIcon(direction: SliceDirection) {
  switch (direction) {
    case 'backward': return Top;
    case 'forward': return Bottom;
    case 'bidirectional': return Sort;
  }
}

function directionIconClass(direction: SliceDirection) {
  switch (direction) {
    case 'backward': return 'text-amber-500';
    case 'forward': return 'text-blue-500';
    case 'bidirectional': return 'text-emerald-500';
  }
}

function directionTooltip(direction: SliceDirection) {
  switch (direction) {
    case 'backward': return 'Backward slice (output → input)';
    case 'forward': return 'Forward slice (input → output)';
    case 'bidirectional': return 'Bidirectional slice (both directions)';
  }
}

function groupKindIcon(kind: string) {
  switch (kind) {
    case 'output_array':
    case 'output_single': return Upload;
    case 'input_array':
    case 'input_single': return Download;
    case 'component': return Box;
    case 'heuristic': return MagicStick;
    default: return Box;
  }
}

function groupKindIconClass(kind: string) {
  switch (kind) {
    case 'output_array': return 'text-green-600';
    case 'output_single': return 'text-green-400';
    case 'input_array': return 'text-blue-600';
    case 'input_single': return 'text-blue-400';
    case 'component': return 'text-orange-500';
    case 'heuristic': return 'text-purple-500';
    default: return 'text-gray-400';
  }
}

function groupKindTooltip(kind: string) {
  switch (kind) {
    case 'output_array': return 'Output array';
    case 'output_single': return 'Output signal';
    case 'input_array': return 'Input array';
    case 'input_single': return 'Input signal';
    case 'component': return 'Sub-component group';
    case 'heuristic': return 'Heuristic suggestion';
    default: return kind;
  }
}

async function loadCandidates() {
  const symPath = circuitStore.compilationData.symPath;
  const constraintsJsonPath = circuitStore.compilationData.constraintsJsonPath;
  if (!symPath || !constraintsJsonPath) return;

  loadingCandidates.value = true;
  candidatesError.value = '';
  candidates.value = [];

  try {
    const response = await sliceCandidates({ symPath, constraintsJsonPath });
    if (response.success) {
      const raw = response.candidates || [];
      candidates.value = raw.sort((a, b) => a.priority - b.priority);
      if (raw.length === 0) {
        emit('loadFullSlice');
      }
    } else {
      candidatesError.value = response.error || 'Failed to load candidates';
    }
  } catch (err: any) {
    candidatesError.value = err?.message || 'Failed to load candidates';
  } finally {
    loadingCandidates.value = false;
  }
}

async function executeCandidateSlice(candidate: SliceCandidate) {
  const symPath = circuitStore.compilationData.symPath;
  const constraintsJsonPath = circuitStore.compilationData.constraintsJsonPath;
  if (!symPath || !constraintsJsonPath) return;

  activeCandidateId.value = candidate.id;
  loadingSliceFor.value = candidate.id;

  try {
    const response = await coneSlice({
      symPath,
      constraintsJsonPath,
      direction: candidate.direction,
      targetSignals: candidate.targetSignals,
      sourceSignals: candidate.sourceSignals,
    });

    if (response.success && response.slice) {
      emit('sliceSelected', response.slice, candidate, candidate.id);
    }
  } catch (err: any) {
    console.error('Candidate slice failed:', err);
  } finally {
    loadingSliceFor.value = null;
  }
}

watch(
  () => circuitStore.compilationData.symPath,
  () => {
    candidates.value = [];
    activeCandidateId.value = null;
    loadCandidates();
  }
);

onMounted(() => {
  loadCandidates();
});
</script>

<style scoped>
.direction-icon,
.group-icon {
  flex: 0 0 auto;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
}
</style>

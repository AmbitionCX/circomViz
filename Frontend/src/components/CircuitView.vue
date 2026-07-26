<template>
  <div class="circuit-view-container h-full flex flex-col overflow-hidden">
    <div class="flex items-center justify-between mb-3 flex-shrink-0">
      <div class="flex items-center gap-2">
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
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-hidden">
      <CircuitViewVisualization @template-params-selected="(data: any) => emit('template-params-selected', data)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue';
import { QuestionFilled } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import CircuitViewVisualization from './CircuitViewVisualization.vue';
import { getParseCompilationStatus } from '@/apis';
import { useCircuitStore } from '@/stores/circuit';

const circuitStore = useCircuitStore();
const compilationStatus = computed(() => circuitStore.parseCompilation);
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
</style>

<template>
  <div class="circuit-view-container h-full flex flex-col overflow-hidden">
    <div class="flex items-center justify-between mb-3 flex-shrink-0">
      <div class="flex items-center gap-2">
        <h2 class="view-title text-base font-bold text-gray-800">Template Tree</h2>
        <el-tooltip content="Explore the hierarchical structure of templates and components in the circuit" placement="top">
          <el-icon class="text-gray-400 cursor-help">
            <QuestionFilled />
          </el-icon>
        </el-tooltip>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-hidden">
      <CircuitViewVisualization @template-params-selected="(data: any) => emit('template-params-selected', data)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { QuestionFilled } from '@element-plus/icons-vue';
import CircuitViewVisualization from './CircuitViewVisualization.vue';

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

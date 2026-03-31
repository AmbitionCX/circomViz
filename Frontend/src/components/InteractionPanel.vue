<template>
  <div class="interaction-panel-container h-full flex flex-col overflow-hidden">
    <div class="mb-3 flex-shrink-0">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <h2 class="view-title text-base font-bold text-gray-800">Debugging Panel</h2>
            <el-tooltip content="Debug constraints, verification, and signals for selected template" placement="top">
              <el-icon class="text-gray-400 cursor-help">
                <QuestionFilled />
              </el-icon>
            </el-tooltip>
          </div>
          <div v-if="hasSelectedTemplate" class="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <span class="text-xs font-medium text-gray-500">Template:</span>
            <span :style="templateColorStyle(selectedTemplate?.templateName ?? '')">{{ selectedTemplate?.templateName }}</span>
          </div>
        </div>
        <div v-if="hasSelectedTemplate" class="flex gap-3">
          <el-tooltip content="Debug compilation output (O0)" placement="top">
            <div class="flex items-center gap-1" :class="compileStatusClass(debugStatus)">
              <el-icon v-if="debugStatus === 'success'"><CircleCheckFilled /></el-icon>
              <el-icon v-else-if="debugStatus === 'failure'"><CircleCloseFilled /></el-icon>
              <span class="text-xs">Debug</span>
            </div>
          </el-tooltip>
          <el-tooltip content="Optimized compilation output (O2)" placement="top">
            <div class="flex items-center gap-1" :class="compileStatusClass(optimizedStatus)">
              <el-icon v-if="optimizedStatus === 'success'"><CircleCheckFilled /></el-icon>
              <el-icon v-else-if="optimizedStatus === 'failure'"><CircleCloseFilled /></el-icon>
              <span class="text-xs">Optimized</span>
            </div>
          </el-tooltip>
          <el-tooltip content="Witness computation output" placement="top">
            <div class="flex items-center gap-1" :class="compileStatusClass(witnessStatus)">
              <el-icon v-if="witnessStatus === 'success'"><CircleCheckFilled /></el-icon>
              <el-icon v-else-if="witnessStatus === 'failure'"><CircleCloseFilled /></el-icon>
              <span class="text-xs">Witness</span>
            </div>
          </el-tooltip>
        </div>
      </div>
    </div>

    <el-empty
      v-if="!hasSelectedTemplate"
      description="Select a template in Circuit View to start debugging"
      :image-size="80"
    />

    <div v-else class="flex-1 min-h-0 overflow-hidden">
      <DebuggingPanelVisualization />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { QuestionFilled, CircleCheckFilled, CircleCloseFilled } from '@element-plus/icons-vue';
import { useCircuitStore } from '@/stores/circuit';
import { hexToRgba } from '@/composables/colors';
import DebuggingPanelVisualization from './DebuggingPanelVisualization.vue';

const circuitStore = useCircuitStore();

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

const hasSelectedTemplate = computed(() => circuitStore.selectedTemplate !== null);

const selectedTemplate = computed(() => circuitStore.selectedTemplate);

const debugStatus = computed(() => circuitStore.compilationData.debugStatus);
const optimizedStatus = computed(() => circuitStore.compilationData.optimizedStatus);
const witnessStatus = computed(() => circuitStore.compilationData.witnessStatus);

function compileStatusClass(status: 'success' | 'failure' | null): string {
  if (status === 'success') return 'text-green-600';
  if (status === 'failure') return 'text-red-500';
  return 'text-gray-400';
}
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

.interaction-panel-container {
  background: white;
  border-radius: 8px;
}
</style>

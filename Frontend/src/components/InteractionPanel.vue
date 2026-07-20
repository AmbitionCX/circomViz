<template>
  <div class="interaction-panel-container h-full flex flex-col overflow-hidden">
    <div class="mb-3 flex-shrink-0">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <h2 class="view-title text-base font-bold text-gray-800">Partial Debugging</h2>
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
        <div v-if="hasSelectedTemplate" class="flex items-center">
          <el-button
            type="success"
            size="small"
            :disabled="isSelectedTemplateConfirmed"
            @click.stop="handleConfirmTemplate"
          >
            {{ isSelectedTemplateConfirmed ? 'Confirmed' : 'Confirm' }}
          </el-button>
        </div>
      </div>
    </div>

    <el-empty
      v-if="!hasSelectedTemplate"
      description="Select a template in Circuit View to start debugging"
      :image-size="80"
    />

    <div v-else class="flex-1 min-h-0 overflow-hidden">
      <R1CSDiagram />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { QuestionFilled } from '@element-plus/icons-vue';
import { useCircuitStore } from '@/stores/circuit';
import { hexToRgba } from '@/composables/colors';
import R1CSDiagram from './R1CSDiagram.vue';

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

const isSelectedTemplateConfirmed = computed(() => {
  if (!selectedTemplate.value) return false;
  return circuitStore.isTemplateConfirmed(selectedTemplate.value.templateName);
});

function handleConfirmTemplate() {
  if (!selectedTemplate.value) return;
  circuitStore.confirmTemplateName(selectedTemplate.value.templateName);
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

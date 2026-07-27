<template>
  <div class="interaction-panel-container h-full flex flex-col overflow-hidden">
    <div class="mb-3 flex-shrink-0">
      <div class="title-row">
        <div class="flex items-center gap-2">
          <h2 class="view-title text-base font-bold text-gray-800">Partial Debugging</h2>
          <el-tooltip content="Compare the selected template's source dataflow graph with its unoptimized O0 constraint relationships." placement="top">
            <el-icon class="text-gray-400 cursor-help">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
          <span class="text-sm font-semibold text-gray-700">
            Template: <span v-if="selectedTemplate" :style="templateColorStyle(selectedTemplate.templateName)">{{ selectedTemplate.templateName }}</span>
          </span>
        </div>

        <div class="title-actions">
          <el-button
            type="success"
            size="small"
            :disabled="!selectedTemplate"
            @click.stop="handleConfirmTemplate"
          >
            {{ isSelectedTemplateConfirmed ? 'Confirmed' : 'Confirm' }}
          </el-button>
        </div>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-hidden">
      <PartialDebuggingWorkspace />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import PartialDebuggingWorkspace from './PartialDebuggingWorkspace.vue'
import { useCircuitStore } from '@/stores/circuit'
import { hexToRgba } from '@/composables/colors'

const circuitStore = useCircuitStore()
const selectedTemplate = computed(() => circuitStore.selectedTemplate)
const isSelectedTemplateConfirmed = computed(() => selectedTemplate.value ? circuitStore.isTemplateConfirmed(selectedTemplate.value.templateName) : false)

const templateColorStyle = (templateName: string) => {
  const color = circuitStore.getTemplateColor(templateName)
  return { backgroundColor: hexToRgba(color, 0.15), color, borderRadius: '4px', padding: '1px 8px', fontWeight: '600' }
}

const emit = defineEmits<{ confirmed: [] }>()

const handleConfirmTemplate = () => {
  if (!selectedTemplate.value) return
  if (!isSelectedTemplateConfirmed.value) {
    circuitStore.confirmTemplateName(selectedTemplate.value.templateName)
  }
  emit('confirmed')
}
</script>

<style scoped>
.interaction-panel-container {
  min-height: 0;
  border-radius: 8px;
}

.title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.title-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
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

@media (max-width: 760px) {
  .title-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .title-actions {
    width: 100%;
    justify-content: space-between;
  }
}
</style>

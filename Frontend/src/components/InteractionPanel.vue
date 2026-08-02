<template>
  <div class="interaction-panel-container h-full flex flex-col overflow-hidden">
    <div class="mb-3 flex-shrink-0">
      <el-alert
        v-if="partialDebuggingStore.analysisError"
        class="analysis-error"
        :title="partialDebuggingStore.analysisError"
        type="error"
        :closable="false"
        show-icon
      />
      <div class="title-row">
        <div class="title-context">
          <h2 class="view-title text-base font-bold text-gray-800">Partial Debugging</h2>
          <el-tooltip
            content="Compare the selected template's Source Semantics Graph with its unoptimized R1CS Enforcement."
            placement="top"
          >
            <el-icon class="text-gray-400 cursor-help">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
          <span class="text-sm font-semibold text-gray-700">
            Template:
            <span
              v-if="selectedTemplate"
              :style="templateColorStyle(selectedTemplate.templateName)"
            >
              {{ selectedTemplate.templateName }}
            </span>
          </span>
        </div>

        <div class="intent-row" @click.stop>
          <el-input
            v-model="input"
            placeholder="What should this template enforce?"
            @keyup.enter="handleAnalyzeIntent"
          />
          <el-button
            type="primary"
            circle
            :icon="ArrowRight"
            :loading="partialDebuggingStore.analysisLoading"
            :disabled="!partialDebuggingStore.summary || !input.trim()"
            aria-label="Analyze attention"
            title="Analyze attention"
            @click.stop="handleAnalyzeIntent"
          />
        </div>

        <div class="graph-view-switch">
          <el-segmented
            v-model="graphViewMode"
            :options="graphViewModeOptions"
            size="small"
            aria-label="Partial Debugging graph layout"
          />
        </div>

        <div class="title-actions">
          <el-button
            type="danger"
            size="small"
            :disabled="!selectedTemplate"
            @click.stop="handleVulnerableTemplate"
          >
            Vulnerable
          </el-button>
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
      <PartialDebuggingWorkspace
        :view-mode="graphViewMode"
        @select-view="graphViewMode = $event"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowRight, QuestionFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import PartialDebuggingWorkspace from './PartialDebuggingWorkspace.vue'
import { useCircuitStore } from '@/stores/circuit'
import { usePartialDebuggingStore } from '@/stores/partialDebugging'
import { hexToRgba } from '@/composables/colors'

type GraphViewMode = 'source' | 'compare' | 'constraint'

const circuitStore = useCircuitStore()
const partialDebuggingStore = usePartialDebuggingStore()
const input = ref('')
const graphViewMode = ref<GraphViewMode>('compare')
const graphViewModeOptions: Array<{ label: string; value: GraphViewMode }> = [
  { label: 'Source', value: 'source' },
  { label: 'Compare', value: 'compare' },
  { label: 'R1CS', value: 'constraint' },
]

const selectedTemplate = computed(() => circuitStore.selectedTemplate)
const isSelectedTemplateVulnerable = computed(() =>
  selectedTemplate.value
    ? circuitStore.isTemplateVulnerable(selectedTemplate.value.templateName)
    : false,
)
const isSelectedTemplateConfirmed = computed(() =>
  selectedTemplate.value
    ? circuitStore.isTemplateConfirmed(selectedTemplate.value.templateName)
      && !isSelectedTemplateVulnerable.value
    : false,
)

const templateColorStyle = (templateName: string) => {
  const color = circuitStore.getTemplateColor(templateName)
  return {
    backgroundColor: hexToRgba(color, 0.15),
    color,
    borderRadius: '4px',
    padding: '1px 8px',
    fontWeight: '600',
  }
}

const emit = defineEmits<{ confirmed: [] }>()

const handleAnalyzeIntent = async () => {
  if (!input.value.trim()) {
    ElMessage.warning('Describe what you want this template to do first.')
    return
  }
  const succeeded = await partialDebuggingStore.analyzeIntent(input.value.trim())
  if (!succeeded) {
    ElMessage.error(partialDebuggingStore.analysisError ?? 'Unable to analyze template intent')
    return
  }
  if (partialDebuggingStore.analysisWarning) {
    ElMessage.warning(partialDebuggingStore.analysisWarning)
  } else if (partialDebuggingStore.issues.length) {
    ElMessage.success('Attention points are now linked to the graph.')
  } else {
    ElMessage.info('No evidence-grounded attention points were returned.')
  }
}

const handleConfirmTemplate = () => {
  if (!selectedTemplate.value) return
  if (!isSelectedTemplateConfirmed.value) {
    circuitStore.confirmTemplateName(selectedTemplate.value.templateName)
  }
  emit('confirmed')
}

const handleVulnerableTemplate = () => {
  if (!selectedTemplate.value) return
  circuitStore.markTemplateVulnerable(selectedTemplate.value.templateName)
  emit('confirmed')
}
</script>

<style scoped>
.interaction-panel-container {
  min-height: 0;
  border-radius: 8px;
}

.intent-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  min-width: 180px;
}

.intent-row :deep(.el-input__wrapper) {
  background: #f8fafc;
}

.analysis-error {
  margin-bottom: 8px;
}

.title-row {
  display: grid;
  grid-template-columns: auto minmax(180px, 1fr) auto auto;
  align-items: center;
  gap: 12px;
}

.title-context {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  justify-self: start;
}

.title-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
  justify-self: end;
}

.graph-view-switch {
  display: flex;
  align-items: center;
  justify-self: end;
}

.graph-view-switch :deep(.el-segmented) {
  --el-border-radius-base: 14px;
  border-radius: 14px;
}

.graph-view-switch :deep(.el-segmented__item),
.graph-view-switch :deep(.el-segmented__item-selected) {
  border-radius: 14px;
  white-space: nowrap;
  font-size: 12px;
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

@media (max-width: 760px) {
  .intent-row {
    grid-template-columns: minmax(0, 1fr) auto;
    width: 100%;
  }

  .title-row {
    display: flex;
    align-items: flex-start;
    flex-direction: column;
  }

  .graph-view-switch {
    width: 100%;
    justify-content: flex-end;
  }

  .title-context {
    width: 100%;
  }

  .title-actions {
    width: 100%;
    justify-content: space-between;
  }
}
</style>

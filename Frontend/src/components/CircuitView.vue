<template>
  <div class="circuit-view-container h-full flex flex-col overflow-hidden">
    <div class="flex items-center justify-between mb-3 flex-shrink-0">
      <div class="flex items-center gap-2">
        <h2 class="view-title text-base font-bold text-gray-800">Circuit View</h2>
        <el-tooltip content="Explore the hierarchical structure of templates and components in the circuit" placement="top">
          <el-icon class="text-gray-400 cursor-help">
            <QuestionFilled />
          </el-icon>
        </el-tooltip>
        <el-tooltip :content="viewMode === 'text' ? 'Switch to Visualization' : 'Switch to Plain Text'" placement="top">
          <el-icon
            class="cursor-pointer transition-colors duration-200"
            :class="viewMode === 'visualization' ? 'text-indigo-500' : 'text-gray-400 hover:text-indigo-400'"
            @click.stop="viewMode = viewMode === 'text' ? 'visualization' : 'text'"
          >
            <Switch />
          </el-icon>
        </el-tooltip>
      </div>
      <div class="text-xs text-gray-500">
        {{ templateTreeData ? 'Template structure loaded' : 'No template loaded' }}
      </div>
    </div>
    
    <div v-if="viewMode === 'text'" class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div class="h-full overflow-auto min-h-0 mb-3 bg-gray-50 rounded-lg p-2">
        <el-empty v-if="!isParsed" description="No circuit loaded" :image-size="80" />
        
        <el-tree
          v-else-if="templateTreeData"
          :data="[templateTreeData]"
          :props="treeProps"
          node-key="id"
          highlight-current
          @node-click="handleNodeClick"
          class="template-tree"
          @click.stop
        >
          <template #default="{ data }">
            <div class="tree-node-content">
              <el-icon v-if="data.type === 'template'" class="mr-2 text-indigo-600">
                <Box />
              </el-icon>
              <el-icon v-else-if="data.type === 'component'" class="mr-2 text-blue-500">
                <Connection />
              </el-icon>
              <el-icon v-else class="mr-2 text-gray-400">
                <Document />
              </el-icon>
              
              <div class="flex-1">
                <div class="font-medium text-sm">
                  {{ data.name }}
                </div>
                <div v-if="data.type === 'template'" class="text-xs text-gray-500">
                  {{ data.templateName }}
                  <span v-if="data.parameters.length > 0" class="ml-1">
                    ({{ data.parameters.map((p: any) => p.name).join(', ') }})
                  </span>
                </div>
                <div v-if="data.type === 'component'" class="text-xs text-gray-500">
                  {{ data.templateName }}
                </div>
              </div>
              
              <div class="flex items-center gap-1 ml-2">
                <el-tag
                  v-if="data.type === 'template' && circuitStore.isTemplateConfirmed(data.templateName)"
                  size="small"
                  type="success"
                  class="text-xs"
                >
                  Confirmed
                </el-tag>
                <el-tag v-if="data.signalCount" size="small" type="info" class="text-xs">
                  {{ data.signalCount }} sig
                </el-tag>
                <el-tag v-if="data.componentCount" size="small" type="warning" class="text-xs">
                  {{ data.componentCount }} comp
                </el-tag>
              </div>
            </div>
          </template>
        </el-tree>
      </div>
      
      <div v-if="selectedTemplate" class="p-3 bg-blue-50 rounded-lg border border-blue-200 flex-shrink-0" @click.stop>
        <div class="flex items-center justify-between mb-2">
          <div class="text-sm font-semibold text-blue-900">
            Selected: {{ selectedTemplate.templateName }}
          </div>
          <el-button
            type="primary"
            size="small"
            @click.stop="handleSelectTemplate"
            :loading="isSearching"
          >
            Select
          </el-button>
        </div>
        <div class="grid grid-cols-2 gap-2 text-xs text-blue-800">
          <div>Parameters: {{ selectedTemplate.parameters.length }}</div>
          <div>Signals: {{ selectedTemplate.signals.length }}</div>
          <div>Input Signals: {{ inputSignalCount }}</div>
          <div>Output Signals: {{ outputSignalCount }}</div>
        </div>
        <div class="mt-2 text-xs text-blue-700">
          <span class="font-semibold">Path:</span> {{ selectedTemplatePath.join(' → ') }}
        </div>
      </div>

      <el-dialog
        v-model="showParamDialog"
        title="Create a wrapper to compile this template"
        width="600px"
      >
        <div v-if="paramResponse">
          <div v-if="paramResponse.hasCandidates">
            <div class="mb-4">
              <p class="text-sm text-gray-600 mb-2">
                Found {{ paramResponse.candidates.length }} parameter candidates for template <strong>{{ paramResponse.templateName }}</strong>:
              </p>
                <el-radio-group v-model="selectedCandidateIndex" class="w-full">
                  <div
                    v-for="(candidate, idx) in paramResponse.candidates"
                    :key="idx"
                    class="mb-2 p-6 border rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <el-radio :value="idx" class="w-full">
                      <div class="text-xs">
                        <div class="font-semibold mb-2">
                          Parameters: {{ candidate.params.map(p => `${p.name}=${p.value}`).join(', ') }}
                        </div>
                        <div v-if="candidate.publicSignals && candidate.publicSignals.length > 0" class="text-gray-600 mb-1">
                          Public signals: {{ candidate.publicSignals.join(', ') }}
                        </div>
                        <div class="text-gray-500">
                          Location: {{ candidate.location.component }} at {{ getShortFilePath(candidate.location.file) }}:{{ candidate.location.line }}
                        </div>
                      </div>
                    </el-radio>
                  </div>
                </el-radio-group>
            </div>
          </div>
          <div v-else>
            <p class="text-sm text-gray-600 mb-4">
              No existing parameter candidates found for template <strong>{{ paramResponse.templateName }}</strong>. Please enter parameters manually:
            </p>
          </div>

          <div v-if="paramResponse.templateParams.length > 0" class="mt-4 pt-4 border-t">
            <p class="text-sm font-semibold text-gray-700 mb-2">Compile Constants:</p>
            <el-table :data="paramResponse.templateParams" size="small" max-height="300">
              <el-table-column label="Constant Name" width="150">
                <template #default="scope">
                  <span class="font-mono">{{ scope.row }}</span>
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

          <div v-if="paramResponse.signals.length > 0" class="mt-4 pt-4 border-t">
            <p class="text-sm font-semibold text-gray-700 mb-2">Input Signals:</p>
            <el-table :data="paramResponse.signals.filter(s => s.kind === 'input')" size="small" max-height="300">
              <el-table-column label="Signal Name" width="150">
                <template #default="scope">
                  <span class="font-mono">{{ scope.row.name }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Visibility">
                <template #default="scope">
                  <el-radio-group v-model="signalVisibility[scope.row.name]" size="small">
                    <el-radio-button value="public">Public</el-radio-button>
                    <el-radio-button value="private">Private</el-radio-button>
                  </el-radio-group>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
        <template #footer>
          <span class="dialog-footer">
            <el-button @click="showParamDialog = false">Cancel</el-button>
            <el-button type="primary" @click="confirmParamSelection" :disabled="!isParamSelectionValid">
              Wrap
            </el-button>
          </span>
        </template>
      </el-dialog>
    </div>

    <div v-else class="flex-1 min-h-0 overflow-hidden">
      <CircuitViewVisualization @template-params-selected="(data: any) => emit('template-params-selected', data)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch } from 'vue';
import { Box, Connection, Document, QuestionFilled, Switch } from '@element-plus/icons-vue';
import { useCircuitStore } from '@/stores/circuit';
import { findTemplateParams } from '@/apis';
import type { TemplateInfo, FindTemplateParamsResponse } from '@/types/circuitTypes';
import { ElMessage } from 'element-plus';
import CircuitViewVisualization from './CircuitViewVisualization.vue';

const circuitStore = useCircuitStore();

const viewMode = ref<'text' | 'visualization'>('text');

const emit = defineEmits<{
  'template-selected': [template: TemplateInfo, path: string[]];
  'template-params-selected': [data: {
    templateName: string;
    params: { name: string; value: number }[];
    publicParams: string[];
    publicSignals: string[];
  }];
}>();

const treeProps = {
  children: 'children',
  label: 'name'
};

const isParsed = computed(() => circuitStore.isParsed);

const selectedTemplate = computed(() => circuitStore.selectedTemplate);

const selectedTemplatePath = computed(() => circuitStore.selectedTemplatePath);

const inputSignalCount = computed(() => {
  return selectedTemplate.value?.signals.filter(s => s.kind === 'input').length || 0;
});

const outputSignalCount = computed(() => {
  return selectedTemplate.value?.signals.filter(s => s.kind === 'output').length || 0;
});

const showParamDialog = ref(false);
const isSearching = ref(false);
const paramResponse = ref<FindTemplateParamsResponse | null>(null);
const selectedCandidateIndex = ref<number>(-1);
const paramInputs = reactive<Record<string, string>>({});
const paramVisibility = reactive<Record<string, 'public' | 'private'>>({});
const signalVisibility = reactive<Record<string, 'public' | 'private'>>({});

const isParamSelectionValid = computed(() => {
  if (!paramResponse.value) return false;
  
  return paramResponse.value.templateParams.every(
    paramName => paramInputs[paramName] && paramInputs[paramName].trim() !== ''
  );
});

const getShortFilePath = (filePath: string): string => {
  const maxLength = 50;
  if (filePath.length <= maxLength) {
    return filePath;
  }
  return filePath.slice(-maxLength);
};

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

const templateTreeData = computed(() => {
  if (!circuitStore.parseData.tree) return null;
  return buildTemplateTreeNode(
    circuitStore.parseData.tree,
    'main',
    ['main']
  );
});

const buildTemplateTreeNode = (
  template: TemplateInfo,
  name: string,
  path: string[]
): any => {
  const signalsByType = {
    input: template.signals.filter(s => s.kind === 'input').length,
    output: template.signals.filter(s => s.kind === 'output').length,
    intermediate: template.signals.filter(s => s.kind === 'intermediate').length
  };
  
  return {
    id: path.join('.'),
    name: name,
    type: 'template',
    templateName: template.templateName,
    template: template,
    parameters: template.parameters,
    signals: template.signals,
    statements: template.statements,
    signalCount: template.signals.length,
    componentCount: template.components.length,
    inputSignalCount: signalsByType.input,
    outputSignalCount: signalsByType.output,
    intermediateSignalCount: signalsByType.intermediate,
    path: [...path],
    children: [
      ...template.components.map((component) => ({
        id: `${path.join('.')}.${component.name}`,
        name: component.name,
        type: 'component',
        templateName: component.templateName,
        component: component,
        parameters: component.arguments,
        path: [...path, component.name],
        signalCount: component.template?.signals.length || 0,
        componentCount: component.template?.components.length || 0,
        children: component.template ? [buildTemplateTreeNode(
          component.template,
          `${component.template.templateName}`,
          [...path, component.name]
        )] : []
      }))
    ]
  };
};

const handleNodeClick = (data: any) => {
  if (data.type === 'template' && data.template) {
    circuitStore.setSelectedTemplate(data.template, data.path);
    emit('template-selected', data.template, data.path);
  } else if (data.type === 'component' && data.component) {
    circuitStore.setSelectedTemplate(data.component.template, data.path);
    emit('template-selected', data.component.template, data.path);
  }
};

const handleSelectTemplate = async () => {
  if (!selectedTemplate.value || !circuitStore.parseData.repo || !circuitStore.parseData.entry) {
    ElMessage.error('No template selected or circuit not parsed');
    return;
  }

  isSearching.value = true;
  try {
    const response = await findTemplateParams({
      templateName: selectedTemplate.value.templateName,
      repo: circuitStore.parseData.repo,
      entry: circuitStore.parseData.entry
    });
    paramResponse.value = response;
    
    Object.keys(paramInputs).forEach(key => delete paramInputs[key]);
    Object.keys(paramVisibility).forEach(key => delete paramVisibility[key]);
    Object.keys(signalVisibility).forEach(key => delete signalVisibility[key]);
    
    if (response.hasCandidates && selectedCandidateIndex.value >= 0) {
      const candidate = response.candidates[selectedCandidateIndex.value];
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
    
    showParamDialog.value = true;
  } catch (error: any) {
    ElMessage.error(`Failed to search for template parameters: ${error.message}`);
  } finally {
    isSearching.value = false;
  }
};

const confirmParamSelection = () => {
  if (!paramResponse.value || !selectedTemplate.value) return;
  
  const params = paramResponse.value.templateParams.map(paramName => ({
    name: paramName,
    value: parseInt(paramInputs[paramName], 10)
  }));
  
  const publicParams = Object.entries(paramVisibility)
    .filter(([_, visibility]) => visibility === 'public')
    .map(([name]) => name);
  
  const publicSignals = Object.entries(signalVisibility)
    .filter(([_, visibility]) => visibility === 'public')
    .map(([name]) => name);
  
  emit('template-params-selected', {
    templateName: selectedTemplate.value.templateName,
    params,
    publicParams,
    publicSignals
  });
  
  showParamDialog.value = false;
  ElMessage.success('Generating wrapper...');
};
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

.template-tree :deep(.el-tree-node__content) {
  height: auto;
  padding: 6px 12px;
  margin: 2px 0;
  border-radius: 6px;
  transition: all 0.2s;
  min-width: 0;
}

.template-tree :deep(.el-tree-node__content:hover) {
  background-color: #eef2ff;
}

.template-tree :deep(.el-tree-node__content.is-current) {
  background-color: #c7d2fe;
}

.tree-node-content {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.tree-node-content .flex-1 {
  min-width: 0;
}
</style>

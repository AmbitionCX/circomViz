<template>
  <div class="submodule-selector-container p-4" :class="{ compact }">
    <div class="flex flex-row flex-nowrap justify-between mb-2">
      <div class="flex items-center gap-2">
        <h2 class="view-title text-base font-bold">Load Circuit</h2>
        <el-tooltip content="Select and parse a circuit from toy examples or available submodules to begin debugging" placement="top">
          <el-icon class="text-gray-400 cursor-help">
            <QuestionFilled />
          </el-icon>
        </el-tooltip>
      </div>
      <div class="selection-mode-label segmented-custom-style text-sm text-gray-600">
        <el-segmented
          v-model="selectionMode"
          :options="selectionModeOptions"
          size="small"
          @change="handleSelectionModeChange"
        >
          <template #default="scope">
            <div class="selection-mode-option">
              <el-icon size="14">
                <component :is="scope.item.icon" />
              </el-icon>
              <span>{{ scope.item.label }}</span>
            </div>
          </template>
        </el-segmented>
      </div>
    </div>
    
    <el-select 
      v-model="selectedCircuitId" 
      :placeholder="`Choose a ${selectionModeLabel.toLowerCase()} circuit...`"
      size="large"
      @change="handleCircuitChange"
      @click.stop
      clearable
      :loading="isLoading"
    >
      <el-option
        v-for="circuit in availableCircuits"
        :key="circuit.id"
        :label="circuit.name"
        :value="circuit.id"
      >
        <span class="flex items-center gap-2">
          <span>{{ circuit.name }}</span>
          <el-tag size="small" type="info" effect="plain">{{ circuit.description }}</el-tag>
        </span>
      </el-option>
    </el-select>
    
    <div v-if="selectedCircuitConfig && !compact" class="mt-4 p-4 bg-blue-50 rounded-lg">
      <div class="text-sm text-gray-700 mb-2">
        <span class="font-semibold">Selected Circuit:</span> 
        <span>{{ selectedCircuitConfig.name }}</span>
      </div>
      <div class="text-sm">
        <div class="mb-1"><span class="font-semibold">Type:</span> {{ selectionModeLabel }}</div>
        <div class="mb-1"><span class="font-semibold">Entry:</span> {{ selectedCircuitConfig.entry }}</div>
        <div class="mb-1"><span class="font-semibold">Root Component:</span> {{ selectedCircuitConfig.rootComponent }}</div>
        <div v-if="selectionMode === 'example'" class="mb-1"><span class="font-semibold">Bug family:</span> {{ selectedCircuitConfig.description }}</div>
      </div>
    </div>
    
    <el-button 
      v-if="!compact"
      type="primary" 
      size="large" 
      :disabled="!selectedCircuitConfig" 
      :loading="isParsing" 
      @click.stop="parseCircuit"
      class="w-full mt-4"
    >
      <el-icon class="mr-2"><Tools /></el-icon>
      {{ isParsing ? 'Parsing...' : 'Parse Circuit' }}
    </el-button>
    
    <el-alert 
      v-if="parseError" 
      type="error" 
      :title="parseError" 
      show-icon
      closable
      @click.stop
      @close="parseError = ''"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Tools, QuestionFilled, FolderOpened, Document } from '@element-plus/icons-vue';
import type { SubmoduleInfo } from '@/types/parseTypes.js';
import { getExamples, getSubmodules, parseCircuitRequest, parse_circuit_request } from '@/apis/index.js';
import { ElMessage } from 'element-plus';

defineProps<{
  compact?: boolean;
}>();

const emit = defineEmits<{
  'circuit-selected': [data: SubmoduleInfo];
  'parse-complete': [data: any];
}>();

type SelectionMode = 'example' | 'project';

const selectionMode = ref<SelectionMode>('example');
const selectedCircuitId = ref<string>('');
const isLoading = ref<boolean>(false);
const isParsing = ref<boolean>(false);
const parseError = ref<string>('');
const submodules = ref<SubmoduleInfo[]>([]);
const examples = ref<SubmoduleInfo[]>([]);

const selectionModeOptions = [
  { label: 'Example', value: 'example', icon: Document },
  { label: 'Project', value: 'project', icon: FolderOpened },
];

const selectionModeLabel = computed(() => selectionMode.value === 'example' ? 'Example' : 'Project');

const availableCircuits = computed(() => {
  return selectionMode.value === 'example' ? examples.value : submodules.value;
});

const selectedCircuitConfig = computed(() => {
  return availableCircuits.value.find(s => s.id === selectedCircuitId.value);
});

const handleCircuitChange = () => {
  console.log('Selected circuit:', selectedCircuitId.value);
  parseError.value = '';

  if (selectedCircuitConfig.value) {
    emit('circuit-selected', selectedCircuitConfig.value);
  }
};

const handleSelectionModeChange = () => {
  selectedCircuitId.value = '';
  parseError.value = '';
};

const loadCircuits = async () => {
  isLoading.value = true;
  try {
    const [submodulesResponse, examplesResponse] = await Promise.all([
      getSubmodules() as any,
      getExamples() as any
    ]);
    console.log('Fetch submodules: ', submodulesResponse);
    console.log('Fetch examples: ', examplesResponse);
    
    submodules.value = submodulesResponse.submodules;
    examples.value = examplesResponse.examples;
    ElMessage.success('Successfully loaded circuit list');
  } catch (error: any) {
    console.error('Failed to load circuits:', error);
    ElMessage.error('Failed to load circuit list');
    parseError.value = error.response?.data?.error || 'Failed to load circuit list';
  } finally {
    isLoading.value = false;
  }
};

const parseCircuit = async () => {
  if (!selectedCircuitConfig.value) {
    ElMessage.warning('Please select a circuit first');
    return;
  }

  isParsing.value = true;
  parseError.value = '';

  try {
    const request: parse_circuit_request = {
      repo: selectionMode.value === 'example' ? 'toy-demos' : selectedCircuitConfig.value.id,
      entry: selectedCircuitConfig.value.entry,
      rootComponent: selectedCircuitConfig.value.rootComponent
    };

    const response = await parseCircuitRequest(request);
    ElMessage.success(`Successfully parsed ${selectedCircuitConfig.value.name}`);
    
    emit('parse-complete', response);
  } catch (error: any) {
    console.error('Parse error:', error);
    parseError.value = error.response?.data?.error || error.message || 'Failed to parse circuit';
    ElMessage.error(parseError.value);
  } finally {
    isParsing.value = false;
  }
};

onMounted(() => {
  loadCircuits();
});
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

.submodule-selector-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.submodule-selector-container.compact {
  padding-bottom: 8px;
}

.selection-mode-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.segmented-custom-style :deep(.el-segmented) {
  --el-border-radius-base: 4px;
  border-radius: 16px;
}

.segmented-custom-style :deep(.el-segmented__item) {
  border-radius: 16px;
}

.segmented-custom-style :deep(.el-segmented__item-selected) {
  border-radius: 16px;
}

.selection-mode-option {
  --el-border-radius-base: 4px;
}

.selection-mode-option {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 2px;
  line-height: 1;
}
</style>

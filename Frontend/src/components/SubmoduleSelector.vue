<template>
  <div class="submodule-selector-container p-4">
    <div class="flex flex-row flex-nowrap justify-between mb-2">
      <h2 class="text-base font-bold">Circuit Selection</h2>
    </div>
    
    <div class="mb-4">
      <span class="text-sm text-gray-600">Select a circuit to analyze:</span>
    </div>
    
    <el-select 
      v-model="selectedSubmoduleId" 
      placeholder="Choose a circuit..."
      size="large"
      @change="handleSubmoduleChange"
      clearable
      :loading="isLoading"
    >
      <el-option
        v-for="submodule in submodules"
        :key="submodule.id"
        :label="submodule.name"
        :value="submodule.id"
      >
        <span class="flex items-center gap-2">
          <span>{{ submodule.name }}</span>
          <el-tag size="small" type="info" effect="plain">{{ submodule.description }}</el-tag>
        </span>
      </el-option>
    </el-select>
    
    <div v-if="selectedSubmodule" class="mt-4 p-4 bg-blue-50 rounded-lg">
      <div class="text-sm text-gray-700 mb-2">
        <span class="font-semibold">Selected Circuit:</span> 
        <span>{{ selectedSubmoduleConfig?.name }}</span>
      </div>
      <div v-if="selectedSubmodule" class="text-sm">
        <div class="mb-1"><span class="font-semibold">Entry:</span> {{ selectedSubmoduleConfig?.entry }}</div>
        <div class="mb-1"><span class="font-semibold">Root Component:</span> {{ selectedSubmoduleConfig?.rootComponent }}</div>
      </div>
    </div>
    
    <el-button 
      type="primary" 
      size="large" 
      :disabled="!selectedSubmodule" 
      :loading="isParsing" 
      @click="parseCircuit"
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
      @close="parseError = ''"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Tools } from '@element-plus/icons-vue';
import type { SubmoduleInfo } from '@/types/parseTypes.js';
import { getSubmodules, parseCircuitRequest, parse_circuit_request } from '@/apis/index.js';
import { ElMessage } from 'element-plus';

const emit = defineEmits<{
  'parse-complete': [data: any];
}>();

const selectedSubmoduleId = ref<string>('');
const isLoading = ref<boolean>(false);
const isParsing = ref<boolean>(false);
const parseError = ref<string>('');
const submodules = ref<SubmoduleInfo[]>([]);

const selectedSubmodule = computed(() => {
  return selectedSubmoduleId.value == null? false : true;
});

const selectedSubmoduleConfig = computed(() => {
  return submodules.value.find(s => s.id === selectedSubmoduleId.value);
});

const handleSubmoduleChange = () => {
  console.log('Selected submodule:', selectedSubmoduleId.value);
  parseError.value = '';
};

const loadSubmodules = async () => {
  isLoading.value = true;
  try {
    const response = await getSubmodules() as any;
    console.log("Fetch submodules: ", response);
    
    submodules.value = response.submodules;
    ElMessage.success('Successfully loaded submodules list');
  } catch (error: any) {
    console.error('Failed to load submodules:', error);
    ElMessage.error('Failed to load submodules list');
    parseError.value = error.response?.data?.error || 'Failed to load submodules list';
  } finally {
    isLoading.value = false;
  }
};

const parseCircuit = async () => {
  if (!selectedSubmoduleConfig || selectedSubmoduleConfig.value == null) {
    ElMessage.warning('Please select a circuit first');
    return;
  }

  isParsing.value = true;
  parseError.value = '';

  try {
    const request: parse_circuit_request = {
      repo: selectedSubmoduleConfig.value.id,
      entry: selectedSubmoduleConfig.value.entry,
      rootComponent: selectedSubmoduleConfig.value.rootComponent
    };

    const response = await parseCircuitRequest(request);
    ElMessage.success(`Successfully parsed ${selectedSubmoduleConfig.value.name}`);
    
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
  loadSubmodules();
});
</script>

<style scoped>
.submodule-selector-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
</style>

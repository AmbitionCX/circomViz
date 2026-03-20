<template>
  <el-container class="h-screen">
    <el-header class="bg-indigo-900 shadow-md">
      <div class="flex items-center justify-between h-full px-4">
        <div class="flex items-center gap-3">
          <h1 class="text-lg text-white font-bold">Visual Assistance System for Circom</h1>
          <el-tag v-if="circuitStore.parseData.repo" size="small" type="info">
            {{ circuitStore.parseData.repo }}
          </el-tag>
        </div>
        <div class="text-xs text-indigo-200">
          Circom Structure Debugging
        </div>
      </div>
    </el-header>
    
    <el-main class="bg-gray-100 pt-2 px-2">
      <el-row class="h-full" :gutter="8">
        <el-col :span="6" class="h-full flex flex-col">
          <div class="bg-white p-4 mb-2 rounded-lg shadow-custom flex-shrink-0">
            <SubmoduleSelector @parse-complete="handleParseComplete" />
          </div>
          
          <div class="bg-white p-4 rounded-lg shadow-custom flex-1 overflow-hidden flex flex-col min-h-0">
            <SignalSelection />
          </div>
        </el-col>
        
        <el-col :span="18" class="h-full pl-2 flex flex-col">
          <div class="bg-white p-4 mb-2 rounded-lg shadow-custom h-1/2 overflow-hidden flex flex-col">
            <CircuitView @template-selected="handleTemplateSelected" />
          </div>
          
          <div class="bg-white p-4 mb-2 rounded-lg shadow-custom h-1/2 overflow-hidden flex flex-col">
            <InteractionPanel />
          </div>
        </el-col>
      </el-row>
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import SubmoduleSelector from './components/SubmoduleSelector.vue';
import SignalSelection from './components/SignalSelection.vue';
import CircuitView from './components/CircuitView.vue';
import InteractionPanel from './components/InteractionPanel.vue';
import { useCircuitStore } from '@/stores/circuit';
import type { TemplateInfo } from '@/types/circuitTypes';

const circuitStore = useCircuitStore();

const handleParseComplete = (data: any) => {
  console.log('Parse complete:', data);
  
  circuitStore.setParseData({
    repo: data.repo || '',
    entry: data.entry || '',
    files: data.files || [],
    tree: data.tree || null,
    errors: data.errors || [],
    statistics: data.statistics || {
      totalFiles: 0,
      totalTemplates: 0,
      totalInstances: 0,
      maxDepth: 0
    }
  });
  
  circuitStore.clearSelectedTemplate();
  circuitStore.resetCompilationData();
};

const handleTemplateSelected = (template: TemplateInfo, path: string[]) => {
  console.log('Template selected:', template.templateName, 'at path:', path);
};
</script>

<style scoped>
.el-header {
  --el-header-height: 48px;
  padding: 0;
}

.el-main {
  padding: 8px;
}

.shadow-custom {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
  border: 1px solid #e5e7eb;
}

:deep(.el-row) {
  height: 100%;
}

:deep(.el-col) {
  height: 100%;
}
</style>

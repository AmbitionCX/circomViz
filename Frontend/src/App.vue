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
     
     <el-main class="bg-gray-100 pt-2 px-2 h-full">
       <el-row class="h-full" :gutter="8">
          <el-col :span="6" class="h-full flex flex-col gap-2 overflow-hidden">
              <div
                :class="['bg-white p-4 rounded-lg shadow-custom overflow-hidden flex flex-col cursor-pointer transition-all duration-300', submoduleHeightClass]"
                @click.self="handleSubmoduleClick"
              >
                <SubmoduleSelector @parse-complete="handleParseComplete" />
              </div>
             
              <div
                :class="['bg-white p-4 rounded-lg shadow-custom overflow-hidden flex flex-col cursor-pointer transition-all duration-300', signalViewHeightClass]"
                @click.self="handleSignalViewClick"
              >
                <SignalSelection />
              </div>
           </el-col>
          
          <el-col :span="18" class="h-full pl-2 flex flex-col overflow-hidden">
             <div 
               :class="['bg-white p-4 rounded-lg shadow-custom overflow-hidden flex flex-col cursor-pointer transition-all duration-300', circuitViewHeightClass]"
               @click.self="handleCircuitViewClick"
             >
               <CircuitView 
                 @template-selected="handleTemplateSelected"
                 @template-params-selected="handleWrapTemplate"
               />
             </div>
            
             <div 
               :class="['bg-white p-4 rounded-lg shadow-custom overflow-hidden flex flex-col cursor-pointer transition-all duration-300', interactionPanelHeightClass]"
               @click.self="handleInteractionPanelClick"
             >
               <InteractionPanel @formal-conformance-confirmed="handleFormalConformanceConfirmed" />
             </div>
         </el-col>
       </el-row>
     </el-main>
   </el-container>
 </template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import SubmoduleSelector from './components/SubmoduleSelector.vue';
import SignalSelection from './components/SignalSelection.vue';
import CircuitView from './components/CircuitView.vue';
import InteractionPanel from './components/InteractionPanel.vue';
import { useCircuitStore } from '@/stores/circuit';
import type { TemplateInfo } from '@/types/circuitTypes';
import { ElMessage } from 'element-plus';
import { generateWrapper } from '@/apis';

const circuitStore = useCircuitStore();

type PanelState = 'circuit' | 'interaction';
type LeftPanelState = 'signal' | 'submodule';
const activePanel = ref<PanelState>('circuit');
const activeLeftPanel = ref<LeftPanelState>('submodule');

const circuitViewHeightClass = computed(() => {
  return activePanel.value === 'circuit' ? 'h-4/5' : 'h-1/5';
});

const interactionPanelHeightClass = computed(() => {
  return activePanel.value === 'interaction' ? 'h-4/5' : 'h-1/5';
});

const submoduleHeightClass = computed(() => {
  return activeLeftPanel.value === 'submodule' ? 'h-2/3' : 'h-1/3';
});

const signalViewHeightClass = computed(() => {
  return activeLeftPanel.value === 'signal' ? 'h-2/3' : 'h-1/3';
});

const handleCircuitViewClick = () => {
  activePanel.value = 'circuit';
};

const handleInteractionPanelClick = () => {
  activePanel.value = 'interaction';
};

const handleFormalConformanceConfirmed = () => {
  activePanel.value = 'circuit';
};

const handleSubmoduleClick = () => {
  activeLeftPanel.value = 'submodule';
};

const handleSignalViewClick = () => {
  activeLeftPanel.value = 'signal';
};

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
  activeLeftPanel.value = 'signal';
};

const handleTemplateSelected = (template: TemplateInfo, path: string[]) => {
  console.log('Template selected:', template.templateName, 'at path:', path);
};

const handleWrapTemplate = async (data: any) => {
  console.log('Wrap template:', data);
  
  circuitStore.setCompiling(true);
  
  try {
    const result = await generateWrapper({
      templateName: data.templateName,
      params: data.params,
      publicParams: data.publicParams,
      publicSignals: data.publicSignals || [],
      repo: circuitStore.parseData.repo,
      entry: circuitStore.parseData.entry,
      templatePath: circuitStore.selectedTemplatePath
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to generate wrapper');
    }
    
    console.log('Wrapper generated:', result.wrapperCode);
    
    circuitStore.setDebugOutput('debugOutput' in result ? (result.debugOutput ?? null) : null);
    circuitStore.setOptimizedOutput('optimizedOutput' in result ? (result.optimizedOutput ?? null) : null);
    circuitStore.setWitnessOutput('witnessOutput' in result ? (result.witnessOutput ?? null) : null);
    circuitStore.setDebugStatus(result.debugSuccess ? 'success' : 'failure');
    circuitStore.setOptimizedStatus(result.optimizedSuccess ? 'success' : 'failure');
    circuitStore.setWitnessStatus(result.witnessSuccess ? 'success' : 'failure');
    circuitStore.setSymPath('symPath' in result ? (result.symPath ?? null) : null);
    circuitStore.setConstraintsJsonPath('constraintsJsonPath' in result ? (result.constraintsJsonPath ?? null) : null);
    if (typeof circuitStore.bumpCompilationVersion === 'function') {
      circuitStore.bumpCompilationVersion();
    } else {
      console.warn('[App] bumpCompilationVersion not found on store - store may need reload');
      circuitStore.compilationVersion++;
    }
    
    activePanel.value = 'interaction';
    
    ElMessage.success('Wrapper generated successfully');
    
  } catch (error: any) {
    console.error('Error generating wrapper:', error);
    ElMessage.error(error.response?.data?.error || error.message || 'Failed to generate wrapper');
  } finally {
    circuitStore.setCompiling(false);
  }
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

:deep(.cursor-pointer):hover {
  box-shadow: 0 4px 8px rgba(79, 70, 229, 0.2);
  border-color: #c7d2fe;
}
</style>

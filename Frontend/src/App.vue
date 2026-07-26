<template>
   <el-container class="h-screen overflow-hidden">
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
     
     <el-main class="bg-gray-100 pt-2 px-2 flex-1 min-h-0 overflow-hidden">
       <el-row class="h-full min-h-0" :gutter="8">
          <el-col :span="6" class="h-full min-h-0 flex flex-col gap-2 overflow-hidden left-panel-column">
               <div
                 :class="['bg-white p-4 rounded-lg shadow-custom overflow-hidden flex flex-col cursor-pointer transition-all duration-300', submoduleHeightClass]"
                 @click="handleSubmoduleClick"
               >
                <SubmoduleSelector
                  :compact="isCircuitSelectionCompact"
                  @circuit-selected="handleCircuitSelected"
                  @parse-complete="handleParseComplete"
                />
              </div>
             
               <div
                 :class="['bg-white p-4 rounded-lg shadow-custom overflow-hidden flex flex-col cursor-pointer transition-all duration-300', signalViewHeightClass]"
                 @click="handleSignalViewClick"
               >
                <SignalSelection />
              </div>
           </el-col>
          
          <el-col :span="18" class="h-full min-h-0 pl-2 flex flex-col overflow-hidden">
              <div 
                :class="['bg-white p-4 rounded-lg shadow-custom overflow-hidden flex flex-col cursor-pointer transition-all duration-300', circuitViewHeightClass]"
                @click="handleCircuitViewClick"
              >
                <CircuitView 
                  @template-params-selected="handleWrapTemplate"
                />
             </div>
            
              <div 
                :class="['bg-white p-4 rounded-lg shadow-custom overflow-hidden flex flex-col cursor-pointer transition-all duration-300', interactionPanelHeightClass]"
                @click="handleInteractionPanelClick"
              >
               <InteractionPanel />
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
import { usePartialDebuggingStore } from '@/stores/partialDebugging';
import { ElMessage } from 'element-plus';
import { generateWrapper } from '@/apis';

const circuitStore = useCircuitStore();
const partialDebuggingStore = usePartialDebuggingStore();

type PanelState = 'circuit' | 'interaction';
type LeftPanelMode = 'initial' | 'selection' | 'signal';

const activePanel = ref<PanelState>('circuit');
const leftPanelMode = ref<LeftPanelMode>('initial');

const circuitViewHeightClass = computed(() => {
  return activePanel.value === 'circuit' ? 'h-4/5' : 'h-1/5';
});

const interactionPanelHeightClass = computed(() => {
  return activePanel.value === 'interaction' ? 'h-4/5' : 'h-1/5';
});

const isCircuitSelectionCompact = computed(() => leftPanelMode.value === 'signal');

const submoduleHeightClass = computed(() => {
  if (leftPanelMode.value === 'selection') {
    return 'selection-panel-fit min-h-0';
  }

  return isCircuitSelectionCompact.value ? 'h-1/5 min-h-0' : 'h-2/7 min-h-0';
});

const signalViewHeightClass = computed(() => {
  if (leftPanelMode.value === 'selection') {
    return 'signal-panel-fill min-h-0';
  }

  return isCircuitSelectionCompact.value ? 'h-4/5 min-h-0' : 'h-5/7 min-h-0';
});

const handleCircuitViewClick = () => {
  activePanel.value = 'circuit';
};

const handleInteractionPanelClick = () => {
  activePanel.value = 'interaction';
};

const handleSubmoduleClick = () => {
  circuitStore.activeLeftPanel = 'submodule';
  if (leftPanelMode.value !== 'selection') {
    leftPanelMode.value = 'initial';
  }
};

const handleCircuitSelected = () => {
  circuitStore.activeLeftPanel = 'submodule';
  leftPanelMode.value = 'selection';
};

const handleSignalViewClick = () => {
  circuitStore.activeLeftPanel = 'signal';
  leftPanelMode.value = 'signal';
};

const compileStatus = (success: boolean | undefined): 'success' | 'failure' | null => {
  if (success === undefined) return null;
  return success ? 'success' : 'failure';
};

const handleParseComplete = (data: any) => {
  console.log('Parse complete:', data);

  if (!data.tree) {
    const message = data.error || 'Parse completed without a renderable root template';
    ElMessage.error(message);
    return;
  }
  
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
  
  circuitStore.setParseCompilation(data.compilation ?? null);
  circuitStore.clearSelectedTemplate();
  circuitStore.resetCompilationData();
  circuitStore.autoConfirmNodeModulesTemplates();
  circuitStore.activeLeftPanel = 'signal';
  leftPanelMode.value = 'signal';
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
      templatePath: circuitStore.selectedTemplatePath,
      confirmedTemplateNames: circuitStore.confirmedTemplateNames,
      mode: 'interface-mock'
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to generate wrapper');
    }
    
    console.log('Wrapper generated:', result.wrapperCode);
    
    circuitStore.setDebugOutput('debugOutput' in result ? (result.debugOutput ?? null) : null);
    circuitStore.setOptimizedOutput('optimizedOutput' in result ? (result.optimizedOutput ?? null) : null);
    circuitStore.setWitnessOutput('witnessOutput' in result ? (result.witnessOutput ?? null) : null);
    circuitStore.setDebugStatus(compileStatus(result.debugSuccess));
    circuitStore.setOptimizedStatus(compileStatus(result.optimizedSuccess));
    circuitStore.setWitnessStatus(compileStatus(result.witnessSuccess));
    circuitStore.setSymPath('symPath' in result ? (result.symPath ?? null) : null);
    circuitStore.setConstraintsJsonPath('constraintsJsonPath' in result ? (result.constraintsJsonPath ?? null) : null);
    partialDebuggingStore.setSummary((result as any).partialDebugging ?? null);
    circuitStore.setR1csDiagramData({
      constraints: 'r1csConstraints' in result ? (result.r1csConstraints ?? []) : [],
      equationText: 'r1csEquationText' in result ? (result.r1csEquationText ?? '') : '',
    });
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

.selection-panel-fit {
  flex: 0 0 auto;
  max-height: 52%;
}

.signal-panel-fill {
  flex: 1 1 0;
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

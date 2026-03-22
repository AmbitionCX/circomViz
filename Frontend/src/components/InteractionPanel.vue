<template>
  <div class="interaction-panel-container h-full flex flex-col overflow-hidden">
    <div class="flex items-center justify-between mb-3 flex-shrink-0">
      <div class="flex items-center gap-2">
        <h2 class="text-base font-bold text-gray-800">Interaction Panel</h2>
        <el-tooltip content="Compile, verify constraints, and inspect signal values for the selected template" placement="top">
          <el-icon class="text-gray-400 cursor-help">
            <QuestionFilled />
          </el-icon>
        </el-tooltip>
      </div>
      <el-button
        size="small"
        type="primary"
        :disabled="!canCompile"
        :loading="isCompiling"
        @click="handleCompile"
      >
        <el-icon class="mr-1"><VideoPlay /></el-icon>
        Compile
      </el-button>
    </div>

    <el-empty
      v-if="!hasSelectedTemplate"
      description="Select a template in Circuit View to start debugging"
      :image-size="80"
    />

    <div v-else class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div class="mb-3 p-3 bg-gray-50 rounded-lg flex-shrink-0">
        <div class="text-sm font-semibold text-gray-700 mb-1">
          Template: {{ selectedTemplate?.templateName }}
        </div>
        <div class="text-xs text-gray-500">
          <span class="font-medium">Parameters:</span>
          {{ selectedTemplate?.parameters.map(p => p.name).join(', ') || 'None' }}
        </div>
      </div>
      
      <el-tabs v-model="activeTab" class="flex-1 flex flex-col min-h-0">
        <el-tab-pane label="Constraints" name="constraints">
          <div class="h-full flex flex-col min-h-0 overflow-hidden">
            <div v-if="!hasConstraints" class="h-full flex items-center justify-center">
              <el-empty description="Click 'Compile' to generate constraints" :image-size="60" />
            </div>
            
            <div v-else class="h-full flex flex-col min-h-0 overflow-hidden">
              <div class="mb-2 text-xs text-gray-500">
                {{ constraints?.constraints.length || 0 }} constraints generated
              </div>
              
              <div class="flex-1 overflow-auto bg-gray-900 rounded-lg p-3">
                <div 
                  v-for="(constraint, index) in constraints?.constraints" 
                  :key="index"
                  class="mb-3 p-2 bg-gray-800 rounded border-l-2 border-blue-500"
                >
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs text-gray-400">Constraint #{{ index + 1 }}</span>
                    <el-icon 
                      class="cursor-pointer text-blue-400 hover:text-blue-300"
                      @click="handleEditConstraint(index)"
                    >
                      <Edit />
                    </el-icon>
                  </div>
                  <pre class="text-sm text-green-400 font-mono whitespace-pre-wrap">{{ constraint }}</pre>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>
        
        <el-tab-pane label="Verification" name="verification">
          <div class="h-full flex flex-col min-h-0 overflow-hidden">
            <div v-if="!hasConstraints" class="h-full flex items-center justify-center">
              <el-empty description="Compile first, then verify constraints" :image-size="60" />
            </div>
            
            <div v-else class="h-full flex flex-col min-h-0 overflow-hidden">
              <div class="mb-3">
                <el-button size="small" @click="handleVerifyAll">
                  <el-icon class="mr-1"><Select /></el-icon>
                  Verify All
                </el-button>
              </div>
              
              <div class="flex-1 overflow-auto">
                <div 
                  v-for="(verification, index) in verifications" 
                  :key="index"
                  :class="[
                    'mb-3 p-3 rounded-lg border',
                    verification.matches ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  ]"
                >
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                      <el-icon :class="verification.matches ? 'text-green-600' : 'text-red-600'">
                        <CircleCheck v-if="verification.matches" />
                        <CircleClose v-else />
                      </el-icon>
                      <span class="text-sm font-semibold">
                        Constraint #{{ verification.constraintIndex + 1 }}
                      </span>
                    </div>
                    <el-tag :type="verification.matches ? 'success' : 'danger'" size="small">
                      {{ verification.matches ? 'Matches' : 'Mismatch' }}
                    </el-tag>
                  </div>
                  
                  <div class="mb-2 p-2 bg-gray-900 rounded">
                    <pre class="text-xs text-gray-300 font-mono">{{ verification.constraint }}</pre>
                  </div>
                  
                  <div class="text-sm text-gray-700 mb-1">
                    <span class="font-semibold">Your Specification:</span>
                  </div>
                  <el-input
                    v-model="verification.userSpecification"
                    type="textarea"
                    :rows="2"
                    placeholder="Enter expected constraint..."
                    @change="handleVerifySingle(index)"
                  />
                  
                  <div v-if="verification.explanation" class="mt-2 text-xs text-gray-600">
                    <span class="font-semibold">Explanation:</span> {{ verification.explanation }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>
        
        <el-tab-pane label="Signals" name="signals">
          <div class="h-full flex flex-col min-h-0 overflow-hidden">
            <div v-if="!hasConstraints" class="h-full flex items-center justify-center">
              <el-empty description="Compile to see signal values" :image-size="60" />
            </div>
            
            <div v-else class="h-full flex flex-col min-h-0 overflow-hidden">
              <div class="mb-2">
                <el-input
                  v-model="signalSearchTerm"
                  placeholder="Search signals..."
                  size="small"
                  clearable
                />
              </div>
              
              <div class="flex-1 overflow-auto">
                <el-table 
                  :data="filteredSignals" 
                  stripe 
                  size="small"
                  max-height="100%"
                >
                  <el-table-column prop="name" label="Signal Name" width="200" />
                  <el-table-column prop="value" label="Value" />
                </el-table>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { VideoPlay, Edit, Select, CircleCheck, CircleClose, QuestionFilled } from '@element-plus/icons-vue';
import { useCircuitStore } from '@/stores/circuit';
import type { ConstraintVerification } from '@/types/circuitTypes';

const circuitStore = useCircuitStore();

const activeTab = ref('constraints');
const signalSearchTerm = ref('');

const hasSelectedTemplate = computed(() => circuitStore.selectedTemplate !== null);

const selectedTemplate = computed(() => circuitStore.selectedTemplate);

const canCompile = computed(() => hasSelectedTemplate.value);

const isCompiling = computed(() => circuitStore.compilationData.isCompiling);

const constraints = computed(() => circuitStore.compilationData.constraints);

const verifications = computed(() => circuitStore.compilationData.verifications);

const hasConstraints = computed(() => constraints.value !== null);

const signalData = computed(() => {
  return Object.entries(constraints.value?.signals || {}).map(([name, value]) => ({
    name,
    value: value.toString()
  }));
});

const filteredSignals = computed(() => {
  if (!signalSearchTerm.value) return signalData.value;
  const term = signalSearchTerm.value.toLowerCase();
  return signalData.value.filter(s => s.name.toLowerCase().includes(term));
});

const handleCompile = async () => {
  circuitStore.setCompiling(true);
  circuitStore.setCompilationError(null);
  
  try {
    console.log('Compiling template:', selectedTemplate.value?.templateName);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const mockConstraints = {
      constraints: [
        'a * b = c',
        'd <== e * f',
        'g * h * i = j'
      ],
      signals: {
        'a': 1,
        'b': 2,
        'c': 2,
        'd': 3,
        'e': 2,
        'f': 4,
        'g': 5,
        'h': 6,
        'i': 7,
        'j': 210
      },
      templateName: selectedTemplate.value?.templateName || '',
      componentPath: circuitStore.selectedTemplatePath
    };
    
    circuitStore.setCompilationResult(mockConstraints);
    
    const mockVerifications: ConstraintVerification[] = mockConstraints.constraints.map((constraint, index) => ({
      constraintIndex: index,
      constraint: constraint,
      userSpecification: '',
      matches: false
    }));
    
    circuitStore.setVerification(mockVerifications);
    
  } catch (error: any) {
    console.error('Compilation error:', error);
    circuitStore.setCompilationError(error.message || 'Compilation failed');
  } finally {
    circuitStore.setCompiling(false);
  }
};

const handleEditConstraint = (index: number) => {
  console.log('Edit constraint:', index);
};

const handleVerifyAll = () => {
  console.log('Verify all constraints');
};

const handleVerifySingle = (index: number) => {
  console.log('Verify single constraint:', index);
};
</script>

<style scoped>
.interaction-panel-container {
  background: white;
  border-radius: 8px;
}

:deep(.el-tabs) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

:deep(.el-tabs__header) {
  margin: 0;
  flex-shrink: 0;
}

:deep(.el-tabs__content) {
  height: 100%;
  overflow: hidden;
}

:deep(.el-tab-pane) {
  height: 100%;
  overflow: hidden;
}
</style>

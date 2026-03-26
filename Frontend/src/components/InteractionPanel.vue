<template>
  <div class="interaction-panel-container h-full flex flex-col overflow-hidden">
    <div class="mb-3 flex-shrink-0">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <h2 class="text-base font-bold text-gray-800">Debugging Panel</h2>
            <el-tooltip content="Debug constraints, verification, and signals for selected template" placement="top">
              <el-icon class="text-gray-400 cursor-help">
                <QuestionFilled />
              </el-icon>
            </el-tooltip>
          </div>
          <div v-if="hasSelectedTemplate" class="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <span class="text-xs font-medium text-gray-500">Template:</span>
            <span class="text-gray-800">{{ selectedTemplate?.templateName }}</span>
          </div>
        </div>
        <div v-if="hasSelectedTemplate" class="flex gap-3">
          <el-tooltip content="Debug compilation output (O0)" placement="top">
            <div class="flex items-center gap-1" :class="{ 'text-green-600': hasDebugOutput }">
              <el-icon><Finished /></el-icon>
              <span class="text-xs">Debug</span>
            </div>
          </el-tooltip>
          <el-tooltip content="Optimized compilation output (O2)" placement="top">
            <div class="flex items-center gap-1" :class="{ 'text-green-600': hasOptimizedOutput }">
              <el-icon><Finished /></el-icon>
              <span class="text-xs">Optimized</span>
            </div>
          </el-tooltip>
          <el-tooltip content="Witness computation output" placement="top">
            <div class="flex items-center gap-1" :class="{ 'text-green-600': hasWitnessOutput }">
              <el-icon><Finished /></el-icon>
              <span class="text-xs">Witness</span>
            </div>
          </el-tooltip>
        </div>
      </div>
    </div>

    <el-empty
      v-if="!hasSelectedTemplate"
      description="Select a template in Circuit View to start debugging"
      :image-size="80"
    />
    
    <div v-else class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div class="flex items-center gap-0 mb-3 flex-shrink-0">
        <button 
          @click="activeTab = 'constraints'"
          :class="['step-tab-btn', soundnessConfirmed ? 'step-tab-confirmed' : activeTab === 'constraints' ? 'step-tab-active' : 'step-tab-inactive']"
        >
          <el-icon v-if="soundnessConfirmed" class="mr-1"><CircleCheckFilled /></el-icon>
          {{ constraintTabLabel }}
        </button>
        <el-icon class="mx-2 text-gray-400"><DArrowRight /></el-icon>
        <button 
          @click="activeTab = 'verification'"
          :class="['step-tab-btn', activeTab === 'verification' ? 'step-tab-active' : 'step-tab-inactive']"
        >
          {{ verificationTabLabel }}
        </button>
        <el-icon class="mx-2 text-gray-400"><DArrowRight /></el-icon>
        <button 
          @click="activeTab = 'signals'"
          :class="['step-tab-btn', activeTab === 'signals' ? 'step-tab-active' : 'step-tab-inactive']"
        >
          {{ signalsTabLabel }}
        </button>
      </div>

      <div class="flex-1 min-h-0 overflow-hidden">
        <div v-show="activeTab === 'constraints'">
          <SoundnessCheck 
            ref="soundnessCheckRef"
            :canRunStaticAnalysis="allCompilesComplete"
            @confirm="handleConfirmSoundness"
          />
        </div>
        <div v-show="activeTab === 'verification'">
          <IntentAlignment />
        </div>
        <div v-show="activeTab === 'signals'">
          <FormalConformance />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { QuestionFilled, Finished, CircleCheckFilled, DArrowRight } from '@element-plus/icons-vue';
import { useCircuitStore } from '@/stores/circuit';
import SoundnessCheck from './SoundnessCheck.vue';
import IntentAlignment from './IntentAlignment.vue';
import FormalConformance from './FormalConformance.vue';

const circuitStore = useCircuitStore();

const activeTab = ref('constraints');
const soundnessConfirmed = ref(false);

const soundnessCheckRef = ref<InstanceType<typeof SoundnessCheck> | null>(null);

watch(() => circuitStore.compilationVersion, () => {
  soundnessConfirmed.value = false;
  activeTab.value = 'constraints';
});

const hasSelectedTemplate = computed(() => circuitStore.selectedTemplate !== null);

const selectedTemplate = computed(() => circuitStore.selectedTemplate);

const hasDebugOutput = computed(() => circuitStore.compilationData.debugOutput !== null);

const hasOptimizedOutput = computed(() => circuitStore.compilationData.optimizedOutput !== null);

const hasWitnessOutput = computed(() => circuitStore.compilationData.witnessOutput !== null);

const allCompilesComplete = computed(() => 
  hasDebugOutput.value && hasOptimizedOutput.value && hasWitnessOutput.value
);

const constraintTabLabel = computed(() => 
  allCompilesComplete.value ? 'Soundness Check' : 'Constraints'
);

const verificationTabLabel = computed(() => 
  allCompilesComplete.value ? 'Intent Alignment' : 'Verification'
);

const signalsTabLabel = computed(() => 
  allCompilesComplete.value ? 'Formal Conformance' : 'Signals'
);

const handleConfirmSoundness = () => {
  soundnessConfirmed.value = true;
  activeTab.value = 'verification';
};
</script>

<style scoped>
.interaction-panel-container {
  background: white;
  border-radius: 8px;
}

.step-tab-btn {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid #dcdfe6;
  cursor: pointer;
  transition: all 0.2s;
  background: #fff;
  color: #606266;
}

.step-tab-btn:hover {
  border-color: #409eff;
  color: #409eff;
}

.step-tab-active {
  border-color: #409eff;
  color: #409eff;
  background: #ecf5ff;
}

.step-tab-inactive {
  border-color: #dcdfe6;
  color: #606266;
  background: #fff;
}

.step-tab-confirmed {
  border-color: #67c23a;
  color: #67c23a;
  background: #f0f9eb;
}
</style>

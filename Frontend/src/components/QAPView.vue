<template>
  <div class="flex flex-col h-full">
    <div class="flex flex-row flex-nowrap mb-2">
      <h2 class="text-base font-bold">QAP View</h2>
      <el-tooltip class="box-item" effect="light" :content="constraintViewExplanation" placement="top">
        <el-icon class="my-auto ml-1 hover:cursor-pointer">
          <Warning style="width: 0.9em; height: 0.9em; fill: black; fill-opacity: 0.8;" />
        </el-icon>
      </el-tooltip>
    </div>

    <div class="border border-gray-300 rounded-md bg-gray-50 flex-grow overflow-x-auto">
      <div v-if="hasQAPData" class="w-full flex flex-col">
        <!-- Matrix Display Component -->
        <QAPMatrixView 
          :qap-data="qapData" 
          :symbols="symbols" 
          :selected-rows="selectedRows"
          @update:selected-rows="selectedRows = $event"
        />
        
        <!-- Constraint Formula Display Component -->
        <QAPConstraintView 
          :selected-rows="selectedRows" 
          :qap-data="qapData"
        />
      </div>
      <div v-else class="flex justify-center items-center h-full">
        <p>No QAP data available. Please compile a circuit first.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useCircuitStore } from '@/stores/circuit';
import { Warning } from '@element-plus/icons-vue';
import QAPMatrixView from './QAPMatrixView.vue';
import QAPConstraintView from './QAPConstraintView.vue';

// Access circuit store for QAP data
const circuitStore = useCircuitStore();
const qapData = computed(() => circuitStore.qapData);
const symbols = computed(() => circuitStore.symbols);

// Help text explaining the QAP view
const constraintViewExplanation = "This view displays the three matrices A, B, and C resulting from converting circuit constraints into a Quadratic Arithmetic Program (QAP). Each column corresponds to a signal, and each row corresponds to a constraint point.";

// Check if QAP data is available
const hasQAPData = computed(() => {
  return qapData.value && 
         qapData.value.qapPolysA && 
         qapData.value.qapPolysA.length > 0;
});

// Track selected constraint rows
const selectedRows = ref<number[]>([]);
</script>

<style lang="css" scoped>
</style>

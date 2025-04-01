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

    <div class="border border-gray-300 p-2 rounded-md bg-gray-50 flex-grow">
      <ul>
        <li v-for="signal in selectedSignals" :key="signal" class="mb-2">
          Constraint for signal: {{ signal }}
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useCircuitStore } from '@/stores/circuit';

const circuitStore = useCircuitStore();
const selectedSignals = computed(() => circuitStore.selectedSignals);

const constraintViewExplanation = "This is QAP View"

</script>

<style lang="css" scoped>
.h-full {
  max-height: 400px;
}

.overflow-y-auto {
  overflow-y: auto;
}
</style>

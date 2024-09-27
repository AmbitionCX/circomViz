<template>
  <div>
    <div class="flex flex-row flex-nowrap mb-2">
      <h2 class="text-base font-bold">Restriction View</h2>
      <el-tooltip class="box-item" effect="light" content="Restriction View" placement="top">
        <el-icon class="my-auto ml-1 hover:cursor-pointer">
          <Warning style="width: 0.9em; height: 0.9em; fill: black; fill-opacity: 0.8;" />
        </el-icon>
      </el-tooltip>
    </div>

    <div class="border border-gray-300 p-4 rounded-md bg-gray-50 h-full overflow-y-auto">
      <ul>
        <li v-for="signal in selectedSignals" :key="signal" class="mb-2">
          Restriction for signal: {{ signal }}
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

</script>

<style scoped>
.h-full {
  max-height: 400px;
}

.overflow-y-auto {
  overflow-y: auto;
}
</style>

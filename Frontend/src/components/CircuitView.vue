<template>
  <div>
    <div class="flex flex-row flex-nowrap mb-2">
      <h2 class="text-base font-bold">Circuit View</h2>
      <el-tooltip class="box-item" effect="light" content="Circuit View" placement="top">
        <el-icon class="my-auto ml-1 hover:cursor-pointer">
          <Warning style="width: 0.9em; height: 0.9em; fill: black; fill-opacity: 0.8;" />
        </el-icon>
      </el-tooltip>
    </div>
    <div ref="circuitContainer" class="border border-gray-300 p-4 rounded-md bg-gray-50 h-full">
      <p>{{ constraints }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useCircuitStore } from '@/stores/circuit';

const circuitStore = useCircuitStore();
const constraints = computed(() => circuitStore.constraints); 
const circuitContainer = ref(null);

watch(constraints, () => {
});
</script>

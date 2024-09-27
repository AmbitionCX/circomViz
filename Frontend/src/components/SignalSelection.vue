<template>
  <div>
    <div class="flex flex-row flex-nowrap mb-2">
      <h2 class="text-base font-bold">Signal Selection</h2>
      <el-tooltip class="box-item" effect="light" content="Signal Selection" placement="top">
        <el-icon class="my-auto ml-1 hover:cursor-pointer">
          <Warning style="width: 0.9em; height: 0.9em; fill: black; fill-opacity: 0.8;" />
        </el-icon>
      </el-tooltip>
    </div>

    <div>
      <el-checkbox-group v-model="selectedSignals">
        <el-checkbox v-for="signal in signals" :key="signal.name" :label="signal.name">{{ signal.symbol_id }}:{{ signal.name }}</el-checkbox>
      </el-checkbox-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useCircuitStore } from '@/stores/circuit';

const circuitStore = useCircuitStore();
const selectedSignals = ref([]);

const signals = computed(() => circuitStore.symbols || []);

// Todo: Tree structures

watch(selectedSignals, (newSignals) => {
  circuitStore.setSelectedSignals(newSignals);
});
</script>
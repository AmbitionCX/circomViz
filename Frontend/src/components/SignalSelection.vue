<template>
  <div>
    <h2 class="text-xl font-bold mb-4">Signal Selection</h2>
    <el-checkbox-group v-model="selectedSignals">
      <el-checkbox v-for="signal in signals" :key="signal" :label="signal">{{ signal }}</el-checkbox>
    </el-checkbox-group>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useCircuitStore } from '../stores/circuit';

const circuitStore = useCircuitStore();
const signals = computed(() => circuitStore.circuitData.signals || []);
const selectedSignals = ref([]);

watch(selectedSignals, (newSignals) => {
  circuitStore.setSelectedSignals(newSignals);
});
</script>

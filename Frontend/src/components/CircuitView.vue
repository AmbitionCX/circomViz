<template>
  <div>
    <h2 class="text-xl font-bold mb-4">Circuit View</h2>
    <div ref="circuitContainer" class="border border-gray-300 p-4 rounded-md bg-gray-50 h-full"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useCircuitStore } from '../stores/circuit';

const circuitStore = useCircuitStore();
const circuitData = computed(() => circuitStore.circuitData); 
const circuitContainer = ref(null);

watch(circuitData, () => {
});
</script>

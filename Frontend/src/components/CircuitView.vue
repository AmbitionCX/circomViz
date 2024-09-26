<template>
  <div>
    <h2 class="text-base font-bold mb-2">Circuit View</h2>
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

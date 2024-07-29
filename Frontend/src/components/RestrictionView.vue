<template>
  <div>
    <h2 class="text-base font-bold mb-2">Restriction View</h2>
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

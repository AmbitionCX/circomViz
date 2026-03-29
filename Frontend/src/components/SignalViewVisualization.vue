<template>
  <div class="signal-visualization h-full w-full flex flex-col overflow-hidden">
    <div ref="svgContainer" class="flex-1 min-h-0 relative bg-gray-50 rounded-lg">
      <svg ref="svgRef" class="w-full h-full"></svg>
      <div v-if="!circuitStore.isParsed" class="absolute inset-0 flex items-center justify-center">
        <el-empty description="No circuit loaded" :image-size="80" />
      </div>
      <div v-else-if="circuitStore.filteredSignals.length === 0" class="absolute inset-0 flex items-center justify-center">
        <el-empty description="No signals found" :image-size="80" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useCircuitStore } from '@/stores/circuit';

const circuitStore = useCircuitStore();
const svgRef = ref<SVGSVGElement | null>(null);
const svgContainer = ref<HTMLDivElement | null>(null);
</script>

<style scoped>
.signal-visualization {
  background: white;
  border-radius: 8px;
}
</style>

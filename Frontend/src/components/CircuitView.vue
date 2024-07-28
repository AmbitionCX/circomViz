<template>
  <div>
    <h2 class="text-xl font-bold mb-4">Circuit View</h2>
    <div ref="circuitContainer" class="border border-gray-300 p-4 rounded-md bg-gray-50 h-full"></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useCircuitStore } from '../stores/circuit';
import * as d3 from 'd3';

const circuitStore = useCircuitStore();
const circuitData = computed(() => circuitStore.circuitData);
const circuitContainer = ref(null);

const drawCircuit = () => {
  const container = d3.select(circuitContainer.value);
  container.selectAll('*').remove();  // 清空之前的图形

  const width = 800;
  const height = 600;

  const svg = container.append('svg')
    .attr('width', width)
    .attr('height', height);

  const components = circuitData.value.components;
  const connections = circuitData.value.connections;

  // 绘制组件
  components.forEach((component, index) => {
    svg.append('rect')
      .attr('x', 100)
      .attr('y', 50 + index * 100)
      .attr('width', 150)
      .attr('height', 50)
      .attr('stroke', 'black')
      .attr('fill', 'none');

    svg.append('text')
      .attr('x', 105)
      .attr('y', 75 + index * 100)
      .text(`${component.name} (${component.type})`);
  });

  // 绘制连接
  connections.forEach((connection, index) => {
    svg.append('line')
      .attr('x1', 250)
      .attr('y1', 75 + index * 100)
      .attr('x2', 400)
      .attr('y2', 75 + index * 100)
      .attr('stroke', 'black');
  });
};

watch(circuitData, () => {
  if (circuitData.value.components.length > 0) {
    drawCircuit();
  }
});
</script>

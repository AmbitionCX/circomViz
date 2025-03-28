<template>
  <div class="signal-selection-container">
    <div class="flex flex-row flex-nowrap mb-2">
      <h2 class="text-base font-bold">Signal View</h2>
      <el-tooltip class="box-item" effect="light" :content="signalViewExplanation" placement="top">
        <el-icon class="my-auto ml-1 hover:cursor-pointer">
          <Warning style="width: 0.9em; height: 0.9em; fill: black; fill-opacity: 0.8;" />
        </el-icon>
      </el-tooltip>
      <el-button 
        type="info" 
        size="small" 
        :icon="isExpanded ? ArrowDownBold : ArrowUpBold" 
        circle 
        class="ml-auto"
        @click="toggleLayout"
      />
    </div>
    <div class="tree-container" ref="treeContainer">
      <svg ref="treeSvg"></svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue';
import { useCircuitStore } from '@/stores/circuit';
import * as d3 from 'd3';
import { ArrowUpBold, ArrowDownBold } from '@element-plus/icons-vue'

const emit = defineEmits(['toggle-layout']);

const circuitStore = useCircuitStore();
const treeContainer = ref<HTMLElement | null>(null);
const treeSvg = ref<SVGSVGElement | null>(null);

const signalTree = ref<any[]>([]);

const isExpanded = ref(false);
const signalViewExplanation = "All Signals"

const toggleLayout = () => {
  isExpanded.value = !isExpanded.value;
  // Emit event to parent to adjust layout
  emit('toggle-layout', isExpanded.value);
};

onMounted(() => {
  nextTick(() => {
    renderTree();
  });
});

watch(() => circuitStore.symbols, () => {
  if (circuitStore.symbols.length > 0) {
    signalTree.value = buildSignalTree(circuitStore.symbols);
    renderTree();
  }
});

function buildSignalTree(symbols: { symbol_id: string; name: string }[]): any[] {
  const tree: any[] = [];
  const nodeMap: Record<string, any> = {};

  symbols.forEach((symbol) => {
    const parts = symbol.name.split('.');
    let currentNode: any | undefined;
    let currentChildren = tree;

    parts.forEach((part, index) => {
      const currentPath = parts.slice(0, index + 1).join('.');
      if (index === 0 && part === "main" && !nodeMap[currentPath]) {
        const newNode = {
          name: part,
          symbol_id: symbol.symbol_id,
          children: [],
        };
        tree.push(newNode);
        nodeMap[currentPath] = newNode;
      } else if (!nodeMap[currentPath]) {
        const newNode = {
          name: part,
          symbol_id: symbol.symbol_id,
          children: [],
        };
        currentChildren.push(newNode);
        nodeMap[currentPath] = newNode;
      }
      currentNode = nodeMap[currentPath];
      currentChildren = currentNode.children;
    });
  });

  return tree;
}

function renderTree() {
  if (!treeSvg.value || !treeContainer.value) return;

  d3.select(treeSvg.value).selectAll('*').remove();

  const width = treeContainer.value.offsetWidth;
  const height = treeContainer.value.offsetHeight;

  const treeLayout = d3.tree().nodeSize([width / 8, height * 1.5]); // set the size of the tree layout
  const root = d3.hierarchy(signalTree.value[0]);

  treeLayout(root);

  const svg = d3.select(treeSvg.value)
    .attr('width', width)
    .attr('height', height)
    .style('overflow', 'visible')
    .append('g');

  svg.selectAll('*').remove();

  svg.selectAll('.link')
    .data(root.links())
    .enter()
    .append('line')
    .attr('class', 'link')
    .attr('x1', d => (d.source as d3.HierarchyPointNode<any>).y)
    .attr('y1', d => (d.source as d3.HierarchyPointNode<any>).x)
    .attr('x2', d => (d.target as d3.HierarchyPointNode<any>).y)
    .attr('y2', d => (d.target as d3.HierarchyPointNode<any>).x)
    .attr('stroke', '#ccc');

  const nodes = svg.selectAll('.node')
    .data(root.descendants())
    .enter()
    .append('g')
    .attr('class', 'node')
    .attr('transform', d => `translate(${(d as d3.HierarchyPointNode<any>).y},${(d as d3.HierarchyPointNode<any>).x})`)
    .on('click', function (_, d) {
      toggleSelection(d.data);
    });

  nodes.append('circle')
    .attr('r', 10)
    .attr('fill', '#2b8cbe');

  nodes.append('text')
    .attr('dy', -15)
    .attr('text-anchor', 'middle')
    .text(d => (d.data as any).name);

  const zoom = d3.zoom<SVGSVGElement, unknown>().on('zoom', function (event) {
    svg.attr('transform', event.transform);
  });

  d3.select(treeSvg.value).call(zoom);
}

function toggleSelection(nodeData: any) {
  const isSelected = circuitStore.selectedSignals.some(signal => signal.symbol_id === nodeData.symbol_id);

  if (isSelected) {
    circuitStore.selectedSignals = circuitStore.selectedSignals.filter(signal => signal.symbol_id !== nodeData.symbol_id);
    markAllDescendants(nodeData, false);
  } else {
    circuitStore.selectedSignals.push(nodeData);
    markAllDescendants(nodeData, true);
  }

  updateNodeColor();
}

function markAllDescendants(nodeData: any, isSelected: boolean) {
  if (isSelected) {
    if (!circuitStore.selectedSignals.some(signal => signal.symbol_id === nodeData.symbol_id)) {
      circuitStore.selectedSignals.push(nodeData);
    }
  } else {
    circuitStore.selectedSignals = circuitStore.selectedSignals.filter(signal => signal.symbol_id !== nodeData.symbol_id);
  }

  nodeData.children?.forEach((child: any) => {
    markAllDescendants(child, isSelected);
  });
}

function updateNodeColor() {
  if (!treeSvg.value) return;

  const svg = d3.select(treeSvg.value);
  const selectedSignalIds = circuitStore.selectedSignals.map(signal => signal.symbol_id);

  svg.selectAll('.node')
    .select('circle')
    .attr('fill', function (d: any) {
      const node = d.data;
      return selectedSignalIds.includes(node.symbol_id) ? 'red' : '#2b8cbe';
    });
}
</script>

<style scoped>
.signal-selection-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tree-container {
  flex-grow: 1;
  overflow: hidden;
  width: 100%;
  height: 100%;
  position: relative;
}

.tree-container svg {
  width: 100%;
  height: 100%;
}
</style>

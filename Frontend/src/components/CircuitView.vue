<template>
  <div class="flex flex-col h-full">
    <div class="flex flex-row flex-nowrap mb-2">
      <h2 class="text-base font-bold">Circuit View</h2>
      <el-tooltip class="box-item" effect="light" :content="circuitViewExplanation" placement="top">
        <el-icon class="my-auto ml-1 hover:cursor-pointer">
          <Warning style="width: 0.9em; height: 0.9em; fill: black; fill-opacity: 0.8;" />
        </el-icon>
      </el-tooltip>
    </div>
    <div ref="circuitContainer" class="border border-gray-300 p-2 rounded-md bg-gray-50 flex-grow">
    </div>
  </div>
</template>

<script setup lang="ts">
import * as d3 from 'd3';
import { graphStratify, sugiyama, layeringLongestPath, decrossTwoLayer, coordQuad } from 'd3-dag';
import { computed, ref, watch } from 'vue';
import { useCircuitStore } from '@/stores/circuit';
import { QAPNode, QAPLink, NodeType, ConstraintObject, SymbolObject } from '@/types/circuitTypes';

const circuitStore = useCircuitStore();
const constraints = computed(() => circuitStore.constraints);
const signals = computed(() => circuitStore.symbols)
const selectedSignals = computed(() => circuitStore.selectedSignals);
const circuitContainer = ref<HTMLElement | null>(null);

const circuitViewExplanation = "This is Circuit View"

function buildCircuitGraph(constraints: ConstraintObject[], signals: SymbolObject[]) {
  const nodes: QAPNode[] = [];
  const links: QAPLink[] = [];
  const CONST_NODE_NAME = 'const';
  const CONST_NODE_COMPONENT = -1;
  const nodeMap = new Map<string, QAPNode>(); // Avoid duplicates
  let nodeId = 0; // 0 is the equation node

  // signal with different coefficient is treated as different signal
  const createNode = (symbolId: number, type: NodeType, name: string, component: number, coefficient?: string): QAPNode => {
    // Coefficient is part of the key to differentiate nodes with the same symbolId but different coefficients
    const key = `${type}_${symbolId}_${name}_${coefficient}`;
    if (nodeMap.has(key)) return nodeMap.get(key)!;

    const node: QAPNode = {
      id: nodeId++,
      symbolId,
      type,
      name,
      component,
      coefficient
    };
    nodeMap.set(key, node);
    nodes.push(node);
    return node;
  };

  // Create a single "equation" link
  const equationNode: QAPNode = createNode(-1, 'equation', 'equation', -1);

  constraints.forEach((constraint, constraintIndex) => {
    const [aComp, bComp, cComp] = constraint;

    // Create add nodes for A, B, and C for each constraint
    const aAdd = createNode(-1, 'add', `addA_${constraintIndex}`, -1);
    const bAdd = createNode(-2, 'add', `addB_${constraintIndex}`, -1);
    const cAdd = createNode(-3, 'add', `addC_${constraintIndex}`, -1);

    // Link A signals to aAdd
    for (const [sigIdStr, coeff] of Object.entries(aComp)) {
      const sigId = parseInt(sigIdStr);
      const type = sigId === 0 ? 'constant' : 'signal';
      const component = sigId === 0 ? CONST_NODE_COMPONENT : signals.find(signal => signal.index === sigId)!.component
      const name = sigId === 0 ? CONST_NODE_NAME : signals.find(signal => signal.index === sigId)!.name
      const signalNode = createNode(sigId, type, name, component, coeff.toString());
      links.push({ source: signalNode.id, target: aAdd.id });
    }
    // Link B signals to bAdd
    for (const [sigIdStr, coeff] of Object.entries(bComp)) {
      const sigId = parseInt(sigIdStr);
      const type = sigId === 0 ? 'constant' : 'signal';
      const component = sigId === 0 ? CONST_NODE_COMPONENT : signals.find(signal => signal.index === sigId)!.component
      const name = sigId === 0 ? CONST_NODE_NAME : signals.find(signal => signal.index === sigId)!.name
      const signalNode = createNode(sigId, type, name, component, coeff.toString());
      links.push({ source: signalNode.id, target: bAdd.id });
    }

    // Link C signals to cAdd
    for (const [sigIdStr, coeff] of Object.entries(cComp)) {
      const sigId = parseInt(sigIdStr);
      const type = sigId === 0 ? 'constant' : 'signal';
      const component = sigId === 0 ? CONST_NODE_COMPONENT : signals.find(signal => signal.index === sigId)!.component
      const name = sigId === 0 ? CONST_NODE_NAME : signals.find(signal => signal.index === sigId)!.name
      const signalNode = createNode(sigId, type, name, component, coeff.toString());
      links.push({ source: signalNode.id, target: cAdd.id });
    }

    // Create multiplication node for this constraint
    const mulNode = createNode(-1000 - constraintIndex, 'mul', `mul_${constraintIndex}`, -1);
    links.push({ source: aAdd.id, target: mulNode.id });
    links.push({ source: bAdd.id, target: mulNode.id });

    // Equation: mul = cAdd (create the equation node to represent this equation)
    links.push({ source: mulNode.id, target: cAdd.id });

    // Link final mulNode to the equation node (single equation node)
    links.push({ source: equationNode.id, target: mulNode.id });
  });

  // Store the graph data (nodes and links)
  circuitStore.setNodesList(nodes);
  circuitStore.setLinksList(links);
  // console.log("QAP nodes:", nodes);
  // console.log("QAP links:", links);
}

const convertAllToString = (array: any[]) => {
  return array.map(obj => {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key, String(value)])
    );
  });
};

function drawCircuitGraph() {
  if (!circuitContainer.value) return;
  const { width, height } = circuitContainer.value.getBoundingClientRect();

  // Remove all previous content when graph changes
  d3.select(circuitContainer.value).selectAll('*').remove();

  buildCircuitGraph(constraints.value, signals.value); // Build graph data with QAP nodes and links
  const circuit_nodes = convertAllToString(circuitStore.nodes_list);
  const circuit_links = convertAllToString(circuitStore.links_list);

  const svg = d3.select(circuitContainer.value)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .style('width', '100%')
    .style('height', '100%');

  const zoomGroup = svg.append('g');

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.5, 5])
    .on('zoom', (event) => {
      zoomGroup.attr('transform', event.transform);
    });
  svg.call(zoom);

  // Create a DAG from the QAP nodes and links
  const stratify = graphStratify()
    .id(data => data.id)
    .parentIds(data =>
      circuit_links.filter(e => e.target === data.id)
        .map(e => e.source));
  const dag = stratify(circuit_nodes);

  // Sugiyama layout: used for layered graph
  const layout = sugiyama()
    .nodeSize([100, 40])
    .layering(layeringLongestPath())
    .decross(decrossTwoLayer())
    .coord(coordQuad());
  layout(dag);

  const link = d3.linkHorizontal()
    .source(d => [d.source.x, d.source.y])
    .target(d => [d.target.x, d.target.y]);

  // Draw links (edges)
  zoomGroup.append('g')
    .selectAll('path')
    .data(dag.links())
    .enter()
    .append('path')
    .attr('d', link)
    .attr('fill', 'none')
    .attr('stroke', d => {
      if (d.source.data.type === 'equation' || d.target.data.type === 'equation') {
        return 'red'
      } else {
        return '#999'
      }
    })
    .attr('stroke-width', 1.5);

  // Draw nodes
  const nodeGroup = zoomGroup.append('g')
    .selectAll('g')
    .data(dag.nodes())
    .enter()
    .append('g')
    .attr('transform', d => `translate(${d.x},${d.y})`);

  nodeGroup.each(function (d) {
    const node = circuit_nodes.find(n => n.id === d.data.id);
    if (!node) return; // if node is invalid
    const g = d3.select(this);

    const symbolSize = 20; // Size of the multiplication symbol
    const strokeWidth = 4;
    const halfSize = symbolSize / 2;

    // Node visualization based on node type
    switch (node.type) {
      case 'signal':
        g.append('circle')
          .attr('r', 20)
          .attr('fill', '#2b8cbe');
        break;
      case 'add':
        g.append('circle')
          .attr('r', halfSize)
          .attr('fill', '#f0f0f0')
          .attr('stroke', '#2c2c2c')
          .attr('stroke-width', strokeWidth);

        g.append('line')
          .attr('x1', -halfSize + strokeWidth)
          .attr('y1', 0)
          .attr('x2', halfSize - strokeWidth)
          .attr('y2', 0)
          .attr('stroke', '#2c2c2c')
          .attr('stroke-width', strokeWidth);

        g.append('line')
          .attr('x1', 0)
          .attr('y1', -halfSize + strokeWidth)
          .attr('x2', 0)
          .attr('y2', halfSize - strokeWidth)
          .attr('stroke', '#2c2c2c')
          .attr('stroke-width', strokeWidth);
        break;
      case 'mul':
        g.append('circle')
          .attr('r', halfSize)
          .attr('fill', '#f0f0f0')
          .attr('stroke', '#2c2c2c')
          .attr('stroke-width', strokeWidth);

        g.append('line')
          .attr('x1', -halfSize + strokeWidth)
          .attr('y1', -halfSize + strokeWidth)
          .attr('x2', halfSize - strokeWidth)
          .attr('y2', halfSize - strokeWidth)
          .attr('stroke', '#2c2c2c')
          .attr('stroke-width', strokeWidth);

        g.append('line')
          .attr('x1', halfSize - strokeWidth)
          .attr('y1', -halfSize + strokeWidth)
          .attr('x2', -halfSize + strokeWidth)
          .attr('y2', halfSize - strokeWidth)
          .attr('stroke', '#2c2c2c')
          .attr('stroke-width', strokeWidth);
        break;
      case 'constant':
        g.append('circle')
          .attr('r', 15)
          .attr('fill', '#756bb1');
        break;
      case 'equation':
        g.append('circle')
          .attr('r', 10)
          .attr('fill', '#ffcc00')
          .attr('stroke', '#2c2c2c')
          .attr('stroke-width', strokeWidth);
        break;
    }

    // Text inside nodes
    g.append('text')
      .text(d => {
        switch (d.data.type) {
          case 'signal':
            return `${d.data.coefficient}${d.data.name.split(".").slice(-1)[0]}`;
          case 'add':
            return null; // No text for add nodes
          case 'mul':
            return null; // No text for mul nodes
          case 'constant':
            return d.data.coefficient;
          case 'equation':
            return "Equation";
        }
      })
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .style('font-size', '12px');
  });
};

function updateNodeColor() {
  if (!circuitContainer.value) return;

  const svg = d3.select(circuitContainer.value);
  const selectedSignalIds = circuitStore.selectedSignals.map(signal => signal.symbol_id);

  svg.selectAll('.node')
    .select('circle')
    .attr('fill', function (d: any) {
      const node = d.data;
      return selectedSignalIds.includes(node.symbolId) ? 'red' : '#2b8cbe';
    });
}

watch(constraints, () => {
  drawCircuitGraph();
})

watch(selectedSignals, () => {
  console.log("selectedSignalssss");

  // updateNodeColor();
})
</script>

<style lang="css" scoped>
.bg-gray-50 {
  overflow: hidden;
  /* Prevent SVG overflow */
}

svg {
  overflow: visible;
}
</style>
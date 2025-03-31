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
import { CircuitNode, SymbolType, CircuitEdge, constraintType } from '@/types/circuitTypes';

const circuitStore = useCircuitStore();
const symbolMap = computed(() => circuitStore.symbolMap);
const constraints = computed(() => circuitStore.constraints);
const selectedSignals = computed(() => circuitStore.selectedSignals);
const circuitContainer = ref(null);

const circuitViewExplanation = "This is Circuit View"

// return nodes and edges
function buildCircuitGraph(constra: constraintType[], symMap: Map<string, SymbolType>){
  const nodes: CircuitNode[] = [];
  const edges: CircuitEdge[] = [];

  constra.forEach((constraint: constraintType, constra_index: number) => { // index start from 0

    // build constraints for linear expression A
    if(constraint.lin_expr_A.length > 0){ // signal A exist
      if(constraint.lin_expr_A.length === 1){
        // only one signal in A, push the node to node set.
        constraint.lin_expr_A.forEach((signal: string, sig_index: number) => {
        const node: CircuitNode = {
          id: `c${constra_index}_A_${sig_index}`,
          symbolId: signal,
          type: signal === '0' ? 'constant' : 'signal',
          name: signal === '0' ? 'const' : symMap.get(signal)!.name || 'none',
          component: symMap.get(signal)!.component || 'none',
          coefficient: constraint.coefficient_A[sig_index] || 'none',
        };
        nodes.push(node);
      })
      } else {
        // multiple signals in A, push all nodes to the node set, create an add node and connect them all together
        constraint.lin_expr_A.forEach((signal: string, sig_index: number) => {
          const node: CircuitNode = {
            id: `c${constra_index}_A_${sig_index}`,
            symbolId: signal,
            type: signal === '0' ? 'constant' : 'signal',
            name: signal === '0' ? 'const' : symMap.get(signal)!.name || 'none',
            component: symMap.get(signal)!.component || 'none',
            coefficient: constraint.coefficient_A[sig_index] || 'none',
          };
          nodes.push(node);
        })

        // add node
        const addNode: CircuitNode = {
          id: `c${constra_index}_A_add`,
          symbolId: 'none',
          type: 'add',
          name: 'add',
          component: 'none',
          coefficient: 'none',
        };
        nodes.push(addNode);

        // add edge
        constraint.lin_expr_A.forEach((_, sig_index: number) => {
          const edge: CircuitEdge = {
            source: `c${constra_index}_A_${sig_index}`,
            target: addNode.id,
        };
        edges.push(edge);
      })
      }
    }

    // ----------------------------------------------------------------
    // build constraints for linear expression B
    if(constraint.lin_expr_B.length > 0){ // signal B exist
      if(constraint.lin_expr_B.length === 1){
        // only one signal in B, push the node to node set.
        constraint.lin_expr_B.forEach((signal: string, sig_index: number) => {
        const node: CircuitNode = {
          id: `c${constra_index}_B_${sig_index}`,
          symbolId: signal,
          type: signal === '0' ? 'constant' : 'signal',
          name: signal === '0' ? 'const' : symMap.get(signal)!.name || 'none',
          component: symMap.get(signal)!.component || 'none',
          coefficient: constraint.coefficient_B[sig_index] || 'none',
        };
        nodes.push(node);
      })
      } else {
        // multiple signals in B, push all nodes to the node set, create an add node and connect them all together
        constraint.lin_expr_B.forEach((signal: string, sig_index: number) => {
          const node: CircuitNode = {
            id: `c${constra_index}_B_${sig_index}`,
            symbolId: signal,
            type: signal === '0' ? 'constant' : 'signal',
            name: signal === '0' ? 'const' : symMap.get(signal)!.name || 'none',
            component: symMap.get(signal)!.component || 'none',
            coefficient: constraint.coefficient_B[sig_index] || 'none',
          };
          nodes.push(node);
        })

        // add node
        const addNode: CircuitNode = {
          id: `c${constra_index}_B_add`,
          symbolId: 'none',
          type: 'add',
          name: 'add',
          component: 'none',
          coefficient: 'none',
        };
        nodes.push(addNode);

        // add edge
        constraint.lin_expr_B.forEach((_, sig_index: number) => {
          const edge: CircuitEdge = {
            source: `c${constra_index}_B_${sig_index}`,
            target: addNode.id,
        };
        edges.push(edge);
      })
      }
    }

    // ----------------------------------------------------------------
    // build constraints for linear expression C
    if(constraint.lin_expr_C.length > 0){ // signal A exist
      if(constraint.lin_expr_C.length === 1){
        // only one signal in C, push the node to node set.
        constraint.lin_expr_C.forEach((signal: string, sig_index: number) => {
        const node: CircuitNode = { 
          id: `c${constra_index}_C_${sig_index}`,
          symbolId: signal,
          type: signal === '0' ? 'constant' : 'signal',
          name: signal === '0' ? 'const' : symMap.get(signal)!.name || 'none',
          component: symMap.get(signal)!.component || 'none',
          coefficient: constraint.coefficient_C[sig_index] || 'none',
        };
        nodes.push(node);
      })
      } else {
        // multiple signals in C, push all nodes to the node set, create an add node and connect them all together
        constraint.lin_expr_C.forEach((signal: string, sig_index: number) => {
          const node: CircuitNode = {
            id: `c${constra_index}_C_${sig_index}`,
            symbolId: signal,
            type: signal === '0' ? 'constant' : 'signal',
            name: signal === '0' ? 'const' : symMap.get(signal)!.name || 'none',
            component: symMap.get(signal)!.component || 'none',
            coefficient: constraint.coefficient_C[sig_index] || 'none',
          };
          nodes.push(node);
        })

        // add node
        const addNode: CircuitNode = {
          id: `c${constra_index}_C_add`,
          symbolId: 'none',
          type: 'add',
          name: 'add',
          component: 'none',
          coefficient: 'none',
        };
        nodes.push(addNode);

        // add edge
        constraint.lin_expr_C.forEach((_, sig_index: number) => {
          const edge: CircuitEdge = {
            source: `c${constra_index}_C_${sig_index}`,
            target: addNode.id,
          };
          edges.push(edge);
        })
      }
    }

    // ----------------------------------------------------------------
    // build node and edge for A * B = C

    // mul node
    const addNode: CircuitNode = {
      id: `c${constra_index}_mul`,
      symbolId: 'none',
      type: 'mul',
      name: 'mul',
      component: 'none',
      coefficient: 'none',
    };
    nodes.push(addNode);

    // connect A to the mul nodes
    if(constraint.lin_expr_A.length === 1){
      const edge: CircuitEdge = {
        source: `c${constra_index}_A_0`,
        target: `c${constra_index}_mul`,
      };
      edges.push(edge);
    } else if(constraint.lin_expr_A.length > 1) {
      const edge: CircuitEdge = {
        source: `c${constra_index}_A_add`,
        target: `c${constra_index}_mul`,
      };
      edges.push(edge);
    }

    // connect B to the mul nodes
    if(constraint.lin_expr_B.length === 1){
      const edge: CircuitEdge = {
        source: `c${constra_index}_B_0`,
        target: `c${constra_index}_mul`,
      };
      edges.push(edge);
    } else if(constraint.lin_expr_B.length > 1) {
      const edge: CircuitEdge = {
        source: `c${constra_index}_B_add`,
        target: `c${constra_index}_mul`,
      };
      edges.push(edge);
    }

    // connect C to the mul nodes
    if(constraint.lin_expr_C.length === 1){
      const edge: CircuitEdge = {
        source: `c${constra_index}_C_0`,
        target: `c${constra_index}_mul`,
      };
      edges.push(edge);
    } else if(constraint.lin_expr_C.length > 1) {
      const edge: CircuitEdge = {
        source: `c${constra_index}_C_add`,
        target: `c${constra_index}_mul`,
      };
      edges.push(edge);
    }
  }) // constra.forEach, looping all constraints

  circuitStore.setNodesList(nodes);
  circuitStore.setEdgesList(edges);
  console.log("nodes", circuitStore.nodes_list);
  console.log("edges", circuitStore.edges_list);
  // return { nodes, edges };
}

function drawCircuitGraph(){
  if (!circuitContainer.value) return;
  const { width, height } = circuitContainer.value.getBoundingClientRect();

  // remove all content when changed
  d3.select(circuitContainer.value).selectAll('*').remove();

  buildCircuitGraph(constraints.value, symbolMap.value);
  const circuit_nodes = circuitStore.nodes_list;
  const circuit_edges = circuitStore.edges_list;

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

  // build D3 DAG structure
  const stratify = graphStratify()
    .id(data => data.id)
    .parentIds(data => 
    circuit_edges.filter(e => e.target === data.id)
          .map(e => e.source));
  const dag = stratify(circuit_nodes);
  
  // Sugiyama
  const layout = sugiyama()
    .nodeSize([100, 40])
    .layering(layeringLongestPath())
    .decross(decrossTwoLayer())
    .coord(coordQuad());
  layout(dag);

  const link = d3.linkHorizontal()
    .source(d => [d.source.x, d.source.y])
    .target(d => [d.target.x, d.target.y]);

  zoomGroup.append('g')
    .selectAll('path')
    .data(dag.links())
    .enter()
    .append('path')
    .attr('d', link)
    .attr('fill', 'none')
    .attr('stroke', '#999')
    .attr('stroke-width', 1.5);

  const nodeGroup = zoomGroup.append('g')
    .selectAll('g')
    .data(dag.nodes())
    .enter()
    .append('g')
    .attr('transform', d => `translate(${d.x},${d.y})`);

  nodeGroup.each(function(d) {
    const node = circuit_nodes.find(n => n.id === d.data.id);
    if (!node) return; // if node is invalid
    const g = d3.select(this);
    
    const symbolSize = 20; // Size of the multiplication symbol
    const strokeWidth = 4;
    const halfSize = symbolSize / 2;

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
    }

    g.append('text')
      .text(d => {
        switch (d.data.type) {
          case 'signal':
            return `${d.data.coefficient}${d.data.name.split(".").slice(-1)[0]}`
          case 'add':
            return null
          case 'mul':
            return null
          case 'constant':
            return d.data.coefficient
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
    .attr('fill', function(d: any) {
      const node = d.data;
      console.log("a", node);
      
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
  overflow: hidden; /* Prevent SVG overflow */
}
svg {
  overflow: visible;
}
</style>
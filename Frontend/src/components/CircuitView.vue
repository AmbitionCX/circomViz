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
import { graphStratify } from 'd3-dag';
import { computed, ref, watch } from 'vue';
import { useCircuitStore } from '@/stores/circuit';
import { hexToRgba } from '@/composables/colors'
import { QAPNode, QAPLink, NodeType, NodePosition, ConstraintObject, SymbolObject, ConstraintComponent } from '@/types/circuitTypes';

const circuitStore = useCircuitStore();
const constraints = computed(() => circuitStore.constraints);
const signals = computed(() => circuitStore.symbols);
const selectedSignals = computed(() => circuitStore.selectedSignals);
const circuitContainer = ref<HTMLElement | null>(null);

const componentColors = computed(() => circuitStore.componentIdColorMap);

const circuitViewExplanation = "This is Circuit View"

function buildCircuitGraph(constraints: ConstraintObject[], signals: SymbolObject[]) {
  const nodes: QAPNode[] = [];
  const links: QAPLink[] = [];

  const CONST_NODE_NAME = 'const';
  const CONST_NODE_COMPONENT = -1;

  const ADD_NODE_NAME = 'add';
  const ADD_NODE_ID = -2;
  const ADD_NODE_COMPONENT = -2;

  const MUL_NODE_NAME = 'mul';
  const MUL_NODE_ID = -3;
  const MUL_NODE_COMPONENT = -3;

  const EQUATION_NODE_NAME = 'equation';
  const EQUATION_NODE_POSITION = 'equation';
  const EQUATION_NODE_ID = -1;
  const EQUATION_NODE_COMPONENT = -4;
  const EQUATION_CONSTRAINT_INDEX = -1;

  const nodeMap = new Map<string, QAPNode>(); // Avoid duplicates
  let nodeId = 0; // 0 is the equation node

  // signal with different coefficient is treated as different signal
  const createNode = (constraintIndex: number, position: NodePosition, nodeType: NodeType, signalIndex: number, signalName: string, component: number, coefficient?: string): QAPNode => {
    // 
    const key = `${constraintIndex}_${position}_${nodeType}_${signalIndex}`;
    if (nodeMap.has(key)) return nodeMap.get(key)!;

    const node: QAPNode = {
      id: nodeId++,
      constraintIndex,
      position,
      nodeType,
      signalIndex,
      signalName,
      component,
      coefficient
    };
    nodeMap.set(key, node);
    nodes.push(node);
    return node;
  };

  // Create a single "equation" link
  const equationNode: QAPNode = createNode(EQUATION_CONSTRAINT_INDEX, EQUATION_NODE_POSITION, 'equation', EQUATION_NODE_ID, EQUATION_NODE_NAME, EQUATION_NODE_COMPONENT);

  constraints.forEach((constraint, constraintIndex) => {
    const [aComp, bComp, cComp] = constraint;

    // create the linear expression of each constraint component [A] * [B] = [C]
    const createLinear = (constraintComp: ConstraintComponent, position_label: NodePosition): QAPNode => {
      const entries = Object.entries(constraintComp);
      if (entries.length === 1) {
        // not necessary to add an add node
        const [sigIdStr, coeff] = entries[0];
        const sigIndex = parseInt(sigIdStr);
        const nodeType = sigIndex === 0 ? 'constant' : 'signal';
        const component = sigIndex === 0 ? CONST_NODE_COMPONENT : signals.find(s => s.index === sigIndex)!.component;
        const nodeName = sigIndex === 0 ? CONST_NODE_NAME : signals.find(s => s.index === sigIndex)!.name;
        return createNode(constraintIndex, position_label, nodeType, sigIndex, nodeName, component, coeff.toString());
      } else {
        // need to add an add node
        const addNode = createNode(constraintIndex, position_label, 'add', ADD_NODE_ID, ADD_NODE_NAME, ADD_NODE_COMPONENT);

        for (const [sigIdStr, coeff] of entries) {
          const sigIndex = parseInt(sigIdStr);
          const nodeType = sigIndex === 0 ? 'constant' : 'signal';
          const component = sigIndex === 0 ? CONST_NODE_COMPONENT : signals.find(s => s.index === sigIndex)!.component;
          const nodeName = sigIndex === 0 ? CONST_NODE_NAME : signals.find(s => s.index === sigIndex)!.name;
          const termNode = createNode(constraintIndex, position_label, nodeType, sigIndex, nodeName, component, coeff.toString());
          links.push({ target: termNode.id, source: addNode.id });
        }
        return addNode;
      }
    };

    // A helper to detect if a linear component has any signals
    const hasSignals = (comp: ConstraintComponent) => Object.entries(comp).length > 0;

    // Create add nodes only if the component has signals
    const aNode = hasSignals(aComp) ? createLinear(aComp, `A`) : null;
    const bNode = hasSignals(bComp) ? createLinear(bComp, `B`) : null;
    const cNode = hasSignals(cComp) ? createLinear(cComp, `C`) : null;

    // A, B, or C may be empty, we only consider the situation when A and B is not empty
    // Link direction is radiating from the center equation node to the outside signal nodes
    if (aNode != null && bNode != null) {
      const mulNode = createNode(constraintIndex, 'A', 'mul', MUL_NODE_ID, MUL_NODE_NAME, MUL_NODE_COMPONENT);
      links.push({ target: aNode.id, source: mulNode.id });
      links.push({ target: bNode.id, source: mulNode.id });
      links.push({ target: mulNode.id, source: equationNode.id });
      if (cNode != null) {
        // Link both mul and C to the equation node
        links.push({ target: cNode.id, source: equationNode.id });
      }
    }

  });

  // Store the graph data (nodes and links)
  circuitStore.setNodesList(nodes);
  circuitStore.setLinksList(links);
}

const convertAllToString = (array: any[]) => {
  return array.map(obj => {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key, String(value)])
    );
  });
};

const minRadius = 10; // min radius when coeff less than 1
const middleRadius = 20 // radius when coeff is 1
const maxRadius = 30; // max radius when coeff larger than 1
const minCoeff = 4; // min 1/4
const maxCoeff = 1000; // max prime number, Ignore JavaScript big number errors

function getRadiusFromCoefficient(coeff: string) {
  let absCoef: number = 1;
  if (!coeff) {
    return 1;
  } else if (coeff.startsWith('-1/')) {
    let denominator = Number(coeff.split("-1/")[1]) || 1;
    return Math.min(middleRadius, Math.max(minRadius, (minCoeff / denominator) * minRadius));
  } else {
    absCoef = Math.abs(Number(coeff))
    return Math.max(middleRadius, Math.min(maxRadius, (absCoef / maxCoeff) * maxRadius));
  }
}

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

  //////////////////////////////////////////////////////////////////////

  const svgNodeMap = new Map<string, any>();
  const centerY = height / 2;
  const ySpacing = 80; // space between layers
  const xSpacing = 160; // space between constraints

  // Step 1: Group nodes by constraintIndex and role
  type ConstraintGroup = { index: number, AandB: any[], C: any[], equation: any | null };
  const constraintMap = new Map<number, ConstraintGroup>();

  // distribute all nodes to the constraint group with constraint index
  dag.nodes().forEach(d => {
    const data = d.data;
    const idx = data.constraintIndex ?? -1; // -1 is the constraint index of the equation node

    if (!constraintMap.has(idx)) {
      constraintMap.set(idx, { index: idx, AandB: [], C: [], equation: null });
    }

    const group = constraintMap.get(idx)!;
    if (data.nodeType === 'equation') {
      group.equation = d;
    } else {
      if (data.position === 'A' || data.position === 'B') { group.AandB.push(d); }
      if (data.position === 'C') { group.C.push(d); }
    }
  });

  // Step 2: Sort groups by constraintIndex
  // constraintGroups divide each constraint to AandB[] and C[], each array containt signal nodes and symbol nodes.
  const constraintGroups = Array.from(constraintMap.values()).sort((a, b) => a.index - b.index);

  const totalWidth = constraintGroups.length * xSpacing;
  const offsetX = (width - totalWidth) / 2;

  // Utility function to find children of a node based on links
  function findChildren(nodeId: number, allLinks: QAPLink[]): number[] {
    return allLinks
      .filter(link => link.source === nodeId)  // find links where the current node is the source
      .map(link => link.target); // return the target nodes (children)
  }

  // Utility function to place nodes in a binary tree structure
  function placeBinaryTree(nodes: any[], direction: 'top' | 'bottom', baseX: number, startY: number, depth: number, maxDepth: number, allLinks: QAPLink[], circuitNodes: any[]) {
    const nodeSpacing = ySpacing / 2; // Y Vertical distance between parent and child nodes
    const groupSpacing = xSpacing / 2; // X Horizontal distance between siblings

    // If depth exceeds maxDepth, return early
    if (depth > maxDepth) return;
    if (nodes.length <= 0) return;
    // Calculate horizontal spacing for children (evenly spaced)
    const totalChildren = nodes.length; // totalChildren > 0
    // baseX is the middle of a subtree
    const startX = baseX - (totalChildren - 1) * groupSpacing / 2;  // Start position for the first child

    nodes.forEach((node, index) => {
      // Position the current node
      node.x = startX + index * groupSpacing;
      if (direction === 'top') {
        node.y = startY - depth * nodeSpacing;
      } else if (direction === 'bottom') {
        node.y = startY + depth * nodeSpacing;
      }

      svgNodeMap.set(node.data.id, node);

      // Find children of the current node and recursively place them
      const children = findChildren(node.data.id, allLinks);

      const childNodes: any[] = [];
      if (children.length > 0) {
        for (const childId of children) {
          let child_node = circuitNodes.find(node => node.data.id === childId);
          if (child_node) { childNodes.push(child_node); }
        }
      }

      placeBinaryTree(childNodes, direction, baseX, node.y, depth + 1, maxDepth, allLinks, circuitNodes); // Recursively place child nodes
    });
  }

  // Step 3: Assign positions
  constraintGroups.forEach((group, i) => {
    const baseX = offsetX + i * xSpacing;

    // Find root symbol node for A/B, which is directly connected to the equation node
    const rootAorB = group.AandB.find(node => circuit_links.some(link => link.target === node.data.id && link.source === '0'));
    const rootAorBArray = rootAorB ? [rootAorB] : []
    // Place the binary tree for top layer (A and B)
    if (rootAorBArray.length > 0) {
      placeBinaryTree(rootAorBArray, 'top', baseX, centerY - ySpacing, 0, 3, circuit_links, group.AandB); // True for left, false for right
    }

    // Find root symbol node for C
    const rootC = group.C.find(node => circuit_links.some(link => link.target === node.data.id && link.source === '0'));
    const rootCArray = rootC ? [rootC] : []

    // Place the binary tree for bottom layer (C)    
    if (rootCArray.length > 0) {
      placeBinaryTree(rootCArray, 'bottom', baseX, centerY + ySpacing, 0, 3, circuit_links, group.C); // True for left, false for right
    }

    // Place the equation node at the center of the middle layer
    if (group.equation) {
      group.equation.x = baseX + constraintGroups.length / 2 * xSpacing;
      group.equation.y = centerY;
      svgNodeMap.set(group.equation.data.id, group.equation);
    }
  });

  const link = d3.linkVertical()
    .source(d => [svgNodeMap.get(String(d.source.data.id)).x, svgNodeMap.get(String(d.source.data.id)).y])
    .target(d => [svgNodeMap.get(String(d.target.data.id)).x, svgNodeMap.get(String(d.target.data.id)).y]);

  //////////////////////////////////////////////////////////////////////

  // Draw links (edges)
  zoomGroup.append('g')
    .selectAll('path')
    .data(dag.links())
    .enter()
    .append('path')
    .attr('d', link)
    .attr('fill', 'none')
    .attr('stroke', d => {
      if (d.source.data.nodeType === 'equation' || d.target.data.nodeType === 'equation') {
        return '#CE6149'
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

    const strokeWidth = 4;
    const nodeRadius = getRadiusFromCoefficient(node.coefficient);
    const isSelected = circuitStore.selectedSignals.some(s => s.symbol_id === node.symbol_id);
    const baseColor = componentColors.value[d.data.component] || '#aaa';
    const fillColor = hexToRgba(baseColor, isSelected ? 1.0 : 0.6);

    const g = d3.select(this);
    // Node visualization based on node type
    switch (node.nodeType) {
      case 'signal':
        g.append('circle')
          .attr('class', 'signal-node')
          .attr('r', nodeRadius)
          .attr('fill', fillColor)
          .attr('stroke', '#2c2c2c')
          .attr('stroke-width', strokeWidth / 2)
          .attr('stroke-dasharray', node.coefficient.startsWith('-') ? '8 4' : 'none')
          .on('click', function (_, d) {
            const node = circuit_nodes.find(n => n.id === d.data.id);
            if (!node) return;

            const selected = circuitStore.selectedSignals.some(s => s.symbol_id === node.signalIndex);
            const signal = {
              symbol_id: d.data.signalIndex,
              fullName: d.data.signalName,
              component: d.data.component,
              name: d.data.signalName.split('.').pop()
            };

            if (selected) {
              circuitStore.popSignal(signal);
            } else {
              circuitStore.pushSignal(signal);
            }

            updateNodeColor();
          });
        break;
      case 'add':
        g.append('circle')
          .attr('r', minRadius)
          .attr('fill', '#f0f0f0')
          .attr('stroke', '#2c2c2c')
          .attr('stroke-width', strokeWidth);

        g.append('line')
          .attr('x1', -minRadius + strokeWidth)
          .attr('y1', 0)
          .attr('x2', minRadius - strokeWidth)
          .attr('y2', 0)
          .attr('stroke', '#2c2c2c')
          .attr('stroke-width', strokeWidth);

        g.append('line')
          .attr('x1', 0)
          .attr('y1', -minRadius + strokeWidth)
          .attr('x2', 0)
          .attr('y2', minRadius - strokeWidth)
          .attr('stroke', '#2c2c2c')
          .attr('stroke-width', strokeWidth);
        break;
      case 'mul':
        g.append('circle')
          .attr('r', minRadius)
          .attr('fill', '#f0f0f0')
          .attr('stroke', '#2c2c2c')
          .attr('stroke-width', strokeWidth);

        g.append('line')
          .attr('x1', -minRadius + strokeWidth)
          .attr('y1', -minRadius + strokeWidth)
          .attr('x2', minRadius - strokeWidth)
          .attr('y2', minRadius - strokeWidth)
          .attr('stroke', '#2c2c2c')
          .attr('stroke-width', strokeWidth);

        g.append('line')
          .attr('x1', minRadius - strokeWidth)
          .attr('y1', -minRadius + strokeWidth)
          .attr('x2', -minRadius + strokeWidth)
          .attr('y2', minRadius - strokeWidth)
          .attr('stroke', '#2c2c2c')
          .attr('stroke-width', strokeWidth);
        break;
      case 'constant':
        g.append('circle')
          .attr('r', nodeRadius)
          .attr('fill', fillColor)
          .attr('stroke', '#2c2c2c')
          .attr('stroke-width', strokeWidth / 2)
          .attr('stroke-dasharray', node.coefficient.startsWith('-') ? '8 4' : 'none')
        break;
      case 'equation':
        const eqSize = 20;
        const eqLineSpacing = 4;
        // draw a transparent clickable background
        g.append('rect')
          .attr('x', -eqSize / 2)
          .attr('y', -eqSize / 2)
          .attr('width', eqSize)
          .attr('height', eqSize)
          .attr('fill', '#ffcc00')
          .attr('stroke', '#2c2c2c')
          .attr('stroke-width', strokeWidth / 2)
          .attr('rx', 4); // rounded corners

        // Top line of '='
        g.append('line')
          .attr('x1', -eqSize / 3)
          .attr('y1', -eqLineSpacing)
          .attr('x2', eqSize / 3)
          .attr('y2', -eqLineSpacing)
          .attr('stroke', '#2c2c2c')
          .attr('stroke-width', strokeWidth / 1.5);

        // Bottom line of '='
        g.append('line')
          .attr('x1', -eqSize / 3)
          .attr('y1', eqLineSpacing)
          .attr('x2', eqSize / 3)
          .attr('y2', eqLineSpacing)
          .attr('stroke', '#2c2c2c')
          .attr('stroke-width', strokeWidth / 1.5);
        break;
    }

    // Text inside nodes
    g.append('text')
      .text(d => {
        switch (d.data.nodeType) {
          case 'signal':
            switch (d.data.coefficient) {
              case '1':
                return `${d.data.signalName.split(".").slice(-1)[0]}`;
              case '-1':
                return `-${d.data.signalName.split(".").slice(-1)[0]}`;
              default:
                return `${d.data.coefficient}${d.data.signalName.split(".").slice(-1)[0]}`;
            }
          case 'add':
            return null; // No text for add nodes
          case 'mul':
            return null; // No text for mul nodes
          case 'constant':
            return d.data.coefficient;
          case 'equation':
            return "";
        }
      })
      .attr('fill', d => {
        switch (d.data.nodeType) {
          case 'signal':
            return 'black';
          case 'add':
            return null; // No filling color
          case 'mul':
            return null; // No filling color
          case 'constant':
            return 'white';
          case 'equation':
            return null; // No filling color
        }
      })
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('class', 'node-label')
      .attr('font-size', '14px');
  });
}; // drawGraph function

function updateNodeColor() {
  if (!circuitContainer.value) return;
  const svg = d3.select(circuitContainer.value)

  svg.selectAll('.signal-node')
    .attr('fill', function (d: any) {
      const node = d.data;
      const isSelected = circuitStore.selectedSignals.some(s => s.symbol_id === node.signalIndex);

      const baseColor = componentColors.value[d.data.component] || '#aaa';
      const opacityColor = hexToRgba(baseColor, isSelected ? 1.0 : 0.6);

      if (!node.symbol_id) return opacityColor;
      return isSelected ? baseColor : opacityColor;
    });
}

watch(constraints, () => {
  drawCircuitGraph();
})

watch(selectedSignals, () => {
  updateNodeColor();
}, { deep: true })
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
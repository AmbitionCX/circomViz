<template>
  <div ref="containerRef" class="h-full w-full overflow-hidden bg-gray-50 relative">
    <div v-if="!props.sliceResult" class="h-full flex items-center justify-center">
      <el-empty description="Select a slice from the left panel" :image-size="80" />
    </div>
    <div v-else-if="loadingTrees" class="h-full flex items-center justify-center">
      <el-icon class="is-loading" :size="24"><Loading /></el-icon>
    </div>
    <div v-else-if="treesError" class="h-full flex items-center justify-center">
      <span class="text-sm text-red-500">{{ treesError }}</span>
    </div>
    <div v-else-if="trees.length === 0" class="h-full flex items-center justify-center">
      <el-empty description="No constraints in this slice" :image-size="60" />
    </div>
    <div v-else ref="svgContainer" class="h-full w-full"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue';
import * as d3 from 'd3';
import { graphStratify, sugiyama } from 'd3-dag';
import { Loading } from '@element-plus/icons-vue';
import { useCircuitStore } from '@/stores/circuit';
import { constraintTrees } from '@/apis';
import { hexToRgba } from '@/composables/colors';
import type { SliceResult, ConstraintTree, LinearExpression } from '@/types/circuitTypes';

const props = defineProps<{
  sliceResult: SliceResult | null;
  targetSignals: string[];
  allSignalNames: string[];
}>();

const emit = defineEmits<{
  schemaSummary: [summary: string];
}>();

const circuitStore = useCircuitStore();
const trees = ref<ConstraintTree[]>([]);
const loadingTrees = ref(false);
const treesError = ref('');
const containerRef = ref<HTMLElement | null>(null);
const svgContainer = ref<HTMLElement | null>(null);

const targetSignalSet = computed(() => new Set(props.targetSignals));

const kindLabels: Record<string, string> = {
  boolean: 'Boolean',
  decomposition: 'Decomp',
  range_check: 'Range',
  selector_gate: 'Selector',
  linear_equality: 'LinEq',
  multiplication: 'Mul',
  complex: 'Complex',
  zero_constraint: 'Zero',
};

const schemaSummary = computed(() => {
  if (trees.value.length === 0) return '';
  const kindCounts: Record<string, number> = {};
  for (const t of trees.value) {
    kindCounts[t.kind] = (kindCounts[t.kind] || 0) + 1;
  }
  const kindOrder = ['boolean', 'multiplication', 'decomposition', 'range_check', 'selector_gate', 'linear_equality', 'complex', 'zero_constraint'];
  const parts: string[] = [];
  for (const k of kindOrder) {
    if (kindCounts[k]) parts.push(`${kindCounts[k]}\u00d7 ${kindLabels[k] || k}`);
  }
  for (const k of Object.keys(kindCounts)) {
    if (!kindOrder.includes(k)) parts.push(`${kindCounts[k]}\u00d7 ${kindLabels[k] || k}`);
  }
  return parts.join(' + ');
});

watch(schemaSummary, (val) => emit('schemaSummary', val), { immediate: true });

const signalClassificationMap = computed(() => {
  const map = new Map<string, string>();
  const graph = circuitStore.bipartiteData.graph;
  if (graph) {
    for (const s of graph.topLevelSignals) map.set(s.name, s.classification);
    for (const c of graph.components) {
      for (const s of c.signals) map.set(s.name, s.classification);
    }
  }
  if (props.sliceResult) {
    for (const s of props.sliceResult.signals) {
      if (!map.has(s.name)) map.set(s.name, s.classification);
    }
  }
  return map;
});

function getSignalClassification(name: string): string {
  return signalClassificationMap.value.get(name) || 'intermediate';
}

interface ConstraintGraphNode {
  id: string;
  parentIds: string[];
  nodeType: 'signal' | 'add' | 'mul' | 'equation';
  coefficient: string;
  signalName: string;
  fullName: string;
  position: 'A' | 'B' | 'C' | 'equation' | 'product';
  classification: string;
  constraintIndex: number;
  kind: string;
  formula: string;
}

function fmtLinear(expr: LinearExpression): string {
  if (expr.terms.length === 0) return '0';
  return expr.terms.map((t, i) => {
    const short = t.signal.split('.').pop() || t.signal;
    if (t.coefficient === '1') return i === 0 ? short : `+ ${short}`;
    if (t.coefficient === '-1') return i === 0 ? `-${short}` : `- ${short}`;
    return `${t.coefficient}\u00B7${short}`;
  }).join(' ');
}

function buildFormula(tree: ConstraintTree): string {
  return `${fmtLinear(tree.a)} \u00D7 ${fmtLinear(tree.b)} = ${fmtLinear(tree.c)}`;
}

function buildGraph(constraintTrees: ConstraintTree[]): ConstraintGraphNode[] {
  const nodes: ConstraintGraphNode[] = [];
  const nodeMap = new Map<string, ConstraintGraphNode>();

  const getOrCreate = (node: ConstraintGraphNode): ConstraintGraphNode => {
    if (nodeMap.has(node.id)) return nodeMap.get(node.id)!;
    nodeMap.set(node.id, node);
    nodes.push(node);
    return node;
  };

  for (const tree of constraintTrees) {
    const idx = tree.index;
    const eqId = `eq_${idx}`;
    const formula = buildFormula(tree);

    const eqNode = getOrCreate({
      id: eqId,
      parentIds: [],
      nodeType: 'equation',
      coefficient: '',
      signalName: '',
      fullName: '',
      position: 'equation',
      classification: '',
      constraintIndex: idx,
      kind: tree.kind,
      formula,
    });

    const buildLinearAB = (
      expr: LinearExpression,
      position: 'A' | 'B'
    ): string | null => {
      if (expr.terms.length === 0) return null;
      if (expr.terms.length === 1) {
        const term = expr.terms[0];
        const shortName = term.signal.split('.').pop() || term.signal;
        const sigId = `sig_${idx}_${position}_${term.signalIndex}`;
        getOrCreate({
          id: sigId,
          parentIds: [],
          nodeType: 'signal',
          coefficient: term.coefficient,
          signalName: shortName,
          fullName: term.signal,
          position,
          classification: getSignalClassification(term.signal),
          constraintIndex: idx,
          kind: tree.kind,
          formula,
        });
        return sigId;
      } else {
        const addId = `add_${idx}_${position}`;
        const sigIds: string[] = [];
        for (const term of expr.terms) {
          const shortName = term.signal.split('.').pop() || term.signal;
          const sigId = `sig_${idx}_${position}_${term.signalIndex}`;
          sigIds.push(sigId);
          getOrCreate({
            id: sigId,
            parentIds: [],
            nodeType: 'signal',
            coefficient: term.coefficient,
            signalName: shortName,
            fullName: term.signal,
            position,
            classification: getSignalClassification(term.signal),
            constraintIndex: idx,
            kind: tree.kind,
            formula,
          });
        }
        getOrCreate({
          id: addId,
          parentIds: sigIds,
          nodeType: 'add',
          coefficient: '',
          signalName: '',
          fullName: '',
          position,
          classification: '',
          constraintIndex: idx,
          kind: tree.kind,
          formula,
        });
        return addId;
      }
    };

    const hasA = tree.a.terms.length > 0;
    const hasB = tree.b.terms.length > 0;
    const hasC = tree.c.terms.length > 0;

    const mulParents: string[] = [];

    if (hasA && hasB) {
      const aTop = buildLinearAB(tree.a, 'A');
      const bTop = buildLinearAB(tree.b, 'B');
      if (aTop) mulParents.push(aTop);
      if (bTop) mulParents.push(bTop);
      const mulId = `mul_${idx}`;
      getOrCreate({
        id: mulId,
        parentIds: mulParents,
        nodeType: 'mul',
        coefficient: '',
        signalName: '',
        fullName: '',
        position: 'product',
        classification: '',
        constraintIndex: idx,
        kind: tree.kind,
        formula,
      });
      eqNode.parentIds = [mulId];
    } else if (hasA) {
      const aTop = buildLinearAB(tree.a, 'A');
      if (aTop) eqNode.parentIds = [aTop];
    } else if (hasB) {
      const bTop = buildLinearAB(tree.b, 'B');
      if (bTop) eqNode.parentIds = [bTop];
    }

    if (hasC) {
      if (tree.c.terms.length === 1) {
        const term = tree.c.terms[0];
        const shortName = term.signal.split('.').pop() || term.signal;
        getOrCreate({
          id: `sig_${idx}_C_${term.signalIndex}`,
          parentIds: [eqId],
          nodeType: 'signal',
          coefficient: term.coefficient,
          signalName: shortName,
          fullName: term.signal,
          position: 'C',
          classification: getSignalClassification(term.signal),
          constraintIndex: idx,
          kind: tree.kind,
          formula,
        });
      } else {
        const addId = `add_${idx}_C`;
        getOrCreate({
          id: addId,
          parentIds: [eqId],
          nodeType: 'add',
          coefficient: '',
          signalName: '',
          fullName: '',
          position: 'C',
          classification: '',
          constraintIndex: idx,
          kind: tree.kind,
          formula,
        });
        for (const term of tree.c.terms) {
          const shortName = term.signal.split('.').pop() || term.signal;
          getOrCreate({
            id: `sig_${idx}_C_${term.signalIndex}`,
            parentIds: [addId],
            nodeType: 'signal',
            coefficient: term.coefficient,
            signalName: shortName,
            fullName: term.signal,
            position: 'C',
            classification: getSignalClassification(term.signal),
            constraintIndex: idx,
            kind: tree.kind,
            formula,
          });
        }
      }
    } else {
      getOrCreate({
        id: `zero_${idx}`,
        parentIds: [eqId],
        nodeType: 'signal',
        coefficient: '0',
        signalName: '0',
        fullName: '',
        position: 'C',
        classification: '',
        constraintIndex: idx,
        kind: tree.kind,
        formula,
      });
    }
  }

  return nodes;
}

const MIN_RADIUS = 12;
const MIDDLE_RADIUS = 20;
const MAX_RADIUS = 30;

function getRadiusFromCoefficient(coeff: string): number {
  if (!coeff) return MIN_RADIUS;
  if (coeff === '0') return 14;
  if (coeff.startsWith('-1/')) {
    const denominator = Number(coeff.split('-1/')[1]) || 1;
    return Math.min(MIDDLE_RADIUS, Math.max(MIN_RADIUS, (4 / denominator) * MIN_RADIUS));
  }
  const absCoef = Math.abs(Number(coeff));
  return Math.max(MIDDLE_RADIUS, Math.min(MAX_RADIUS, (absCoef / 1000) * MAX_RADIUS));
}

const SIG_COLORS: Record<string, string> = {
  input: '#2563eb',
  output: '#16a34a',
  intermediate: '#6b7280',
};

function getSignalLabel(data: ConstraintGraphNode): string {
  if (data.nodeType !== 'signal') return '';
  if (data.coefficient === '0') return '0';
  if (data.coefficient === '1') return data.signalName;
  if (data.coefficient === '-1') return `-${data.signalName}`;
  return `${data.coefficient}\u00B7${data.signalName}`;
}

let resizeObserver: ResizeObserver | null = null;

function renderGraph() {
  if (!svgContainer.value) return;
  const container = svgContainer.value;
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (width === 0 || height === 0) return;

  d3.select(container).selectAll('*').remove();

  const graphNodes = buildGraph(trees.value);
  if (graphNodes.length === 0) return;

  const svg = d3.select(container)
    .append('svg')
    .style('width', '100%')
    .style('height', '100%')
    .style('display', 'block');

  const zoomGroup = svg.append('g');

  const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.2, 5])
    .on('zoom', (event) => {
      zoomGroup.attr('transform', event.transform);
    });
  svg.call(zoomBehavior);

  const dag = graphStratify()(graphNodes as any);

  const layout = sugiyama()
    .nodeSize([1, 1])
    .gap([100, 100]);
  const { width: dagWidth, height: dagHeight } = layout(dag as any);

  const dagNodes: any[] = (dag as any).nodes();
  const dagLinks: any[] = (dag as any).links();

  zoomGroup.append('g')
    .attr('class', 'links')
    .selectAll('path')
    .data(dagLinks)
    .enter()
    .append('path')
    .attr('d', (d: any) => {
      const sx = d.source.x;
      const sy = d.source.y;
      const tx = d.target.x;
      const ty = d.target.y;
      const my = (sy + ty) / 2;
      return `M ${sx},${sy} C ${sx},${my} ${tx},${my} ${tx},${ty}`;
    })
    .attr('fill', 'none')
    .attr('stroke', (d: any) => {
      const srcType: string = d.source.data?.nodeType;
      const tgtType: string = d.target.data?.nodeType;
      if (srcType === 'equation' || tgtType === 'equation') return '#CE6149';
      return '#bbb';
    })
    .attr('stroke-width', 1.5);

  const nodeGroups = zoomGroup.append('g')
    .attr('class', 'nodes')
    .selectAll('g')
    .data(dagNodes)
    .enter()
    .append('g')
    .attr('transform', (d: any) => `translate(${d.x},${d.y})`);

  nodeGroups.each(function (d: any) {
    const data = d.data as ConstraintGraphNode;
    const g = d3.select(this);

    switch (data.nodeType) {
      case 'signal': {
        const radius = getRadiusFromCoefficient(data.coefficient);
        const isZero = data.coefficient === '0';
        const isSelected = !isZero && circuitStore.signalFilter.selectedSignals.has(data.fullName);
        const isTarget = !isZero && targetSignalSet.value.has(data.fullName);
        const baseColor = SIG_COLORS[data.classification] || '#aaa';
        const fillColor = isZero
          ? '#e5e7eb'
          : isTarget
            ? '#818cf8'
            : hexToRgba(baseColor, isSelected ? 1.0 : 0.6);

        g.append('circle')
          .attr('class', 'signal-node')
          .attr('data-full-name', data.fullName)
          .attr('data-classification', data.classification)
          .attr('data-target', isTarget ? 'true' : 'false')
          .attr('data-is-zero', isZero ? 'true' : 'false')
          .attr('r', radius)
          .attr('fill', fillColor)
          .attr('stroke', isZero ? '#9ca3af' : isTarget ? '#4f46e5' : '#2c2c2c')
          .attr('stroke-width', isZero ? 1.5 : isTarget ? 3 : 2)
          .attr('stroke-dasharray', !isZero && data.coefficient.startsWith('-') ? '6 3' : 'none')
          .style('cursor', isZero ? 'default' : 'pointer')
          .on('click', (event: MouseEvent) => {
            if (isZero) return;
            event.stopPropagation();
            circuitStore.toggleSignalSelection(data.fullName);
          });

        g.append('text')
          .text(getSignalLabel(data))
          .attr('fill', isZero ? '#9ca3af' : 'black')
          .attr('dy', '0.35em')
          .attr('text-anchor', 'middle')
          .attr('font-size', radius < 15 ? '9px' : '11px')
          .attr('font-family', 'ui-monospace, monospace')
          .attr('pointer-events', 'none');
        break;
      }

      case 'add': {
        const r = 10;
        const sw = 2.5;
        g.append('circle')
          .attr('r', r)
          .attr('fill', '#f5f5f5')
          .attr('stroke', '#555')
          .attr('stroke-width', sw);
        g.append('line')
          .attr('x1', -r + sw).attr('y1', 0)
          .attr('x2', r - sw).attr('y2', 0)
          .attr('stroke', '#555').attr('stroke-width', sw);
        g.append('line')
          .attr('x1', 0).attr('y1', -r + sw)
          .attr('x2', 0).attr('y2', r - sw)
          .attr('stroke', '#555').attr('stroke-width', sw);
        break;
      }

      case 'mul': {
        const r = 10;
        const sw = 2.5;
        g.append('circle')
          .attr('r', r)
          .attr('fill', '#f5f5f5')
          .attr('stroke', '#555')
          .attr('stroke-width', sw);
        g.append('line')
          .attr('x1', -r + sw).attr('y1', -r + sw)
          .attr('x2', r - sw).attr('y2', r - sw)
          .attr('stroke', '#555').attr('stroke-width', sw);
        g.append('line')
          .attr('x1', r - sw).attr('y1', -r + sw)
          .attr('x2', -r + sw).attr('y2', r - sw)
          .attr('stroke', '#555').attr('stroke-width', sw);
        break;
      }

      case 'equation': {
        const size = 24;
        const ls = 4;

        g.append('text')
          .text(`#${data.constraintIndex}`)
          .attr('x', 0).attr('y', -size / 2 - 36)
          .attr('text-anchor', 'middle')
          .attr('font-size', '11px')
          .attr('font-weight', '600')
          .attr('fill', '#374151');

        const kl = kindLabels[data.kind] || data.kind;
        if (kl) {
          g.append('text')
            .text(kl)
            .attr('x', 0).attr('y', -size / 2 - 22)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', '#9ca3af');
        }

        g.append('text')
          .text(data.formula)
          .attr('x', 0).attr('y', -size / 2 - 8)
          .attr('text-anchor', 'middle')
          .attr('font-size', '10px')
          .attr('font-family', 'ui-monospace, monospace')
          .attr('fill', '#374151');

        g.append('rect')
          .attr('x', -size / 2).attr('y', -size / 2)
          .attr('width', size).attr('height', size)
          .attr('fill', '#ffcc00')
          .attr('stroke', '#2c2c2c')
          .attr('stroke-width', 1.5)
          .attr('rx', 4);

        g.append('line')
          .attr('x1', -size / 3).attr('y1', -ls)
          .attr('x2', size / 3).attr('y2', -ls)
          .attr('stroke', '#2c2c2c').attr('stroke-width', 2.5);

        g.append('line')
          .attr('x1', -size / 3).attr('y1', ls)
          .attr('x2', size / 3).attr('y2', ls)
          .attr('stroke', '#2c2c2c').attr('stroke-width', 2.5);
        break;
      }
    }
  });

  if (dagWidth > 0 && dagHeight > 0) {
    const padding = 100;
    const scale = Math.min(
      (width - padding * 2) / dagWidth,
      (height - padding * 2) / dagHeight,
      1.5
    );
    const tx = width / 2 - (dagWidth / 2) * scale;
    const ty = height / 2 - (dagHeight / 2) * scale;
    svg.call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }
}

watch(trees, () => {
  nextTick(() => renderGraph());
});

watch(
  () => circuitStore.signalFilter.selectedSignals,
  () => {
    if (!svgContainer.value) return;
    d3.select(svgContainer.value).selectAll('.signal-node').each(function () {
      const el = this as SVGCircleElement;
      const isZero = el.getAttribute('data-is-zero') === 'true';
      if (isZero) return;
      const fullName = el.getAttribute('data-full-name') || '';
      const classification = el.getAttribute('data-classification') || 'intermediate';
      const isTarget = el.getAttribute('data-target') === 'true';
      const isSelected = circuitStore.signalFilter.selectedSignals.has(fullName);
      const baseColor = SIG_COLORS[classification] || '#aaa';
      const fillColor = isTarget
        ? '#818cf8'
        : hexToRgba(baseColor, isSelected ? 1.0 : 0.6);
      d3.select(el).attr('fill', fillColor);
    });
  },
  { deep: true }
);

watch(
  () => props.sliceResult,
  async (newResult) => {
    trees.value = [];
    treesError.value = '';

    if (!newResult) return;

    const symPath = circuitStore.compilationData.symPath;
    const constraintsJsonPath = circuitStore.compilationData.constraintsJsonPath;
    if (!symPath || !constraintsJsonPath) return;

    let indicesToFetch = newResult.constraintIndices;

    if (props.targetSignals.length > 0 && newResult.resolvedConstraints.length > 0) {
      const targetSet = new Set(props.targetSignals);
      indicesToFetch = newResult.resolvedConstraints
        .filter(rc => rc.signalsUsed.some(s => targetSet.has(s)))
        .map(rc => rc.index);
    }

    if (indicesToFetch.length === 0) {
      treesError.value = props.targetSignals.length > 0
        ? 'No constraints directly reference the selected signal(s)'
        : 'No constraints in this slice';
      return;
    }

    loadingTrees.value = true;
    try {
      const response = await constraintTrees({
        symPath,
        constraintsJsonPath,
        constraintIndices: indicesToFetch,
      });

      if (response.success) {
        trees.value = response.trees || [];
      } else {
        treesError.value = response.error || 'Failed to load constraint trees';
      }
    } catch (err: any) {
      treesError.value = err?.message || 'Failed to load constraint trees';
    } finally {
      loadingTrees.value = false;
    }
  }
);

onMounted(() => {
  if (svgContainer.value) {
    resizeObserver = new ResizeObserver(() => {
      if (trees.value.length > 0) renderGraph();
    });
    resizeObserver.observe(svgContainer.value);
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});
</script>

<style scoped>
svg {
  overflow: visible;
}
</style>

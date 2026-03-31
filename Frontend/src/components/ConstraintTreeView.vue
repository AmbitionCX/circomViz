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
    <div v-else class="h-full overflow-auto">
      <div class="px-4 py-2">
        <div class="text-xs text-gray-400 mb-2">
          {{ trees.length }} constraint{{ trees.length > 1 ? 's' : '' }}
          <span v-if="targetSignalSet.size > 0" class="ml-2 text-indigo-500">
            — filtered by {{ targetSignalSet.size }} target signal{{ targetSignalSet.size > 1 ? 's' : '' }}
            (from {{ props.sliceResult?.constraintCount || 0 }} total in slice)
          </span>
        </div>
        <div class="space-y-2">
          <div
            v-for="tree in trees"
            :key="tree.index"
            class="constraint-card"
          >
            <div class="flex items-center gap-2 mb-1">
              <span class="idx">#{{ tree.index }}</span>
              <el-tag size="small" effect="plain" :type="kindTagType(tree.kind)" class="kind-tag">
                {{ kindLabels[tree.kind] || tree.kind }}
              </el-tag>
              <div class="flex-1" />
              <span v-if="tree.description" class="text-xs text-gray-400 truncate max-w-xs">{{ tree.description }}</span>
            </div>
            <div class="formula">
              <span
                v-for="(token, ti) in formatFormula(tree)"
                :key="ti"
                :class="formulaTokenClass(token)"
              >{{ token.text }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Loading } from '@element-plus/icons-vue';
import { useCircuitStore } from '@/stores/circuit';
import { constraintTrees } from '@/apis';
import type { SliceResult, ConstraintTree } from '@/types/circuitTypes';

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

const targetSignalSet = computed(() => new Set(props.targetSignals));

const kindLabels: Record<string, string> = {
  boolean: 'Boolean',
  decomposition: 'Decomposition',
  range_check: 'Range check',
  selector_gate: 'Selector',
  linear_equality: 'Linear eq.',
  multiplication: 'Multiplication',
  complex: 'Complex',
  zero_constraint: 'Zero',
};

function kindTagType(kind: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  switch (kind) {
    case 'boolean': return 'success';
    case 'multiplication': return 'warning';
    case 'decomposition': return '';
    case 'range_check': return 'info';
    case 'selector_gate': return 'warning';
    case 'complex': return 'danger';
    default: return 'info';
  }
}

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

function shortName(n: string): string {
  const p = n.split('.');
  return p.length > 1 ? p[p.length - 1] : n;
}

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

function sigClass(n: string): string {
  const cls = signalClassificationMap.value.get(n);
  if (cls === 'input') return 'sig-input';
  if (cls === 'output') return 'sig-output';
  return 'sig-mid';
}

interface FormulaToken {
  text: string;
  type: 'signal' | 'op' | 'const' | 'bracket' | 'label';
  signalName?: string;
}

function formatTerm(coeff: string, signal: string): FormulaToken[] {
  const tokens: FormulaToken[] = [];
  if (coeff === '1') {
    tokens.push({ text: shortName(signal), type: 'signal', signalName: signal });
  } else if (coeff === '-1') {
    tokens.push({ text: '-', type: 'op' });
    tokens.push({ text: shortName(signal), type: 'signal', signalName: signal });
  } else {
    tokens.push({ text: coeff, type: 'const' });
    tokens.push({ text: '\u00B7', type: 'op' });
    tokens.push({ text: shortName(signal), type: 'signal', signalName: signal });
  }
  return tokens;
}

function formatLinear(expr: { terms: Array<{ signal: string; coefficient: string }>; constant: string }, label: string): FormulaToken[] {
  const tokens: FormulaToken[] = [];
  tokens.push({ text: `${label}: `, type: 'label' });
  if (expr.terms.length === 0) {
    tokens.push({ text: expr.constant || '0', type: 'const' });
    return tokens;
  }
  for (let i = 0; i < expr.terms.length; i++) {
    const t = expr.terms[i];
    if (i === 0) {
      const first = formatTerm(t.coefficient, t.signal);
      tokens.push(...first);
    } else {
      const c = BigInt(t.coefficient);
      if (c >= 0n) {
        tokens.push({ text: ' + ', type: 'op' });
      } else {
        tokens.push({ text: ' - ', type: 'op' });
      }
      const absCoeff = c >= 0n ? t.coefficient : (-c).toString();
      const sign = c >= 0n ? '1' : '-1';
      const term = formatTerm(sign, t.signal);
      if (sign === '1' && absCoeff !== '1') {
        tokens.push({ text: absCoeff, type: 'const' });
        tokens.push({ text: '\u00B7', type: 'op' });
        tokens.push(term[term.length - 1]);
      } else if (sign === '-1' && absCoeff !== '1') {
        tokens.push({ text: absCoeff, type: 'const' });
        tokens.push({ text: '\u00B7', type: 'op' });
        tokens.push(term[term.length - 1]);
      } else {
        tokens.push(term[term.length - 1]);
      }
    }
  }
  if (expr.constant && expr.constant !== '0') {
    tokens.push({ text: expr.constant.startsWith('-') ? ` - ${expr.constant.slice(1)}` : ` + ${expr.constant}`, type: 'const' });
  }
  return tokens;
}

function formatFormula(tree: ConstraintTree): FormulaToken[] {
  const tokens: FormulaToken[] = [];
  tokens.push(...formatLinear(tree.a, 'A'));
  tokens.push({ text: '  \u00D7  ', type: 'op' });
  tokens.push(...formatLinear(tree.b, 'B'));
  tokens.push({ text: '  =  ', type: 'op' });
  tokens.push(...formatLinear(tree.c, 'C'));
  return tokens;
}

function formulaTokenClass(token: FormulaToken): string {
  if (token.type === 'signal') {
    if (token.signalName && targetSignalSet.value.has(token.signalName)) return 'sig-active';
    return sigClass(token.signalName || '');
  }
  if (token.type === 'op') return 'token-op';
  if (token.type === 'const') return 'token-const';
  if (token.type === 'label') return 'token-label';
  return '';
}

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
</script>

<style scoped>
.constraint-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 8px 12px;
  transition: border-color 0.15s;
}

.constraint-card:hover {
  border-color: #c7d2fe;
}

.idx {
  font-size: 10px;
  color: #9ca3af;
  font-family: ui-monospace, monospace;
  min-width: 32px;
}

.kind-tag {
  font-size: 10px;
}

.formula {
  font-family: ui-monospace, 'SF Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.sig-input {
  color: #2563eb;
  font-weight: 500;
}

.sig-output {
  color: #16a34a;
  font-weight: 500;
}

.sig-mid {
  color: #6b7280;
}

.sig-active {
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: #818cf8;
  text-underline-offset: 2px;
}

.token-op {
  color: #9ca3af;
}

.token-const {
  color: #b45309;
}

.token-label {
  color: #a1a1aa;
  font-size: 11px;
}
</style>

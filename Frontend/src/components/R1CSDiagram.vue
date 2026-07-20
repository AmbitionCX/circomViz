<template>
  <div class="r1cs-diagram h-full min-h-0 flex flex-col overflow-hidden">
    <div v-if="totalCount === 0" class="flex-1 min-h-0 flex items-center justify-center">
      <el-empty description="No R1CS constraints available" :image-size="72" />
    </div>

    <div v-else class="flex-1 min-h-0 overflow-auto py-3 pr-1">
      <div class="flex flex-col gap-3">
        <div
          v-for="constraint in visibleConstraints"
          :key="constraint.index"
          class="constraint-row border border-gray-200 rounded-md bg-white overflow-hidden"
        >
          <div class="px-3 py-2 border-b border-gray-100 flex items-center justify-between gap-3">
            <span class="text-xs font-semibold text-gray-600">#{{ constraint.index }}</span>
            <span class="formula-label font-mono text-xs text-gray-500 truncate" :title="constraint.formula">
              {{ constraint.formula }}
            </span>
          </div>

          <div class="diagram-row px-3 py-3">
            <ExpressionDiagram :expr="constraint.a" side="input" />
            <div class="op-node multiply" title="Multiplication">*</div>
            <ExpressionDiagram :expr="constraint.b" side="input" />
            <div class="op-node equals" title="Equals">=</div>
            <ExpressionDiagram :expr="constraint.c" side="output" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, type PropType } from 'vue';
import { useCircuitStore } from '@/stores/circuit';
import type { HumanReadableLinearExpression } from '@/types/circuitTypes';

const MAX_RENDERED_CONSTRAINTS = 50;

const circuitStore = useCircuitStore();

const constraints = computed(() => circuitStore.compilationData.r1csConstraints);
const totalCount = computed(() => constraints.value.length);
const visibleConstraints = computed(() => constraints.value.slice(0, MAX_RENDERED_CONSTRAINTS));

type ExprSide = 'input' | 'output';
type ExpressionPart = { kind: 'signal' | 'constant'; label: string };

function termLabel(term: HumanReadableLinearExpression['terms'][number]): string {
  if (term.coefficient === '1') return term.signal;
  if (term.coefficient === '-1') return `-${term.signal}`;
  return `${term.coefficient} * ${term.signal}`;
}

function expressionParts(expr: HumanReadableLinearExpression) {
  const parts: ExpressionPart[] = expr.terms.map(term => ({ kind: 'signal', label: termLabel(term) }));
  if (expr.constant !== '0') {
    parts.push({ kind: 'constant' as const, label: expr.constant });
  }
  if (parts.length === 0) {
    parts.push({ kind: 'constant' as const, label: '0' });
  }
  return parts;
}

const ExpressionDiagram = defineComponent({
  name: 'ExpressionDiagram',
  props: {
    expr: {
      type: Object as PropType<HumanReadableLinearExpression>,
      required: true,
    },
    side: {
      type: String as PropType<ExprSide>,
      required: true,
    },
  },
  setup(props) {
    const parts = computed(() => expressionParts(props.expr));
    const needsAddNode = computed(() => parts.value.length > 1);

    return { parts, needsAddNode };
  },
  template: `
    <div class="expr-diagram">
      <div class="term-stack">
        <template v-for="(part, idx) in parts" :key="idx">
          <div :class="['term-node', side, part.kind]" :title="part.label">{{ part.label }}</div>
        </template>
      </div>
      <div v-if="needsAddNode" class="op-node add" title="Addition">+</div>
    </div>
  `,
});
</script>

<style scoped>
.r1cs-diagram {
  color: #1f2937;
}

.constraint-row {
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.formula-label {
  min-width: 0;
}

.diagram-row {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) 36px minmax(150px, 1fr) 36px minmax(150px, 1fr);
  align-items: center;
  gap: 10px;
  min-width: 680px;
}

.expr-diagram {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
}

.term-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  max-width: 220px;
}

.term-node {
  min-height: 28px;
  max-width: 220px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  padding: 5px 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 11px;
  line-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: #f9fafb;
}

.term-node.input.signal {
  border-color: #93c5fd;
  background: #eff6ff;
  color: #1d4ed8;
}

.term-node.output.signal {
  border-color: #86efac;
  background: #f0fdf4;
  color: #15803d;
}

.term-node.constant {
  border-color: #d1d5db;
  background: #f8fafc;
  color: #475569;
}

.op-node {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}

.op-node.add {
  border: 1px solid #f59e0b;
  background: #fffbeb;
  color: #b45309;
}

.op-node.multiply {
  border: 1px solid #a78bfa;
  background: #f5f3ff;
  color: #6d28d9;
  justify-self: center;
}

.op-node.equals {
  border: 1px solid #9ca3af;
  background: #f9fafb;
  color: #4b5563;
  justify-self: center;
}
</style>

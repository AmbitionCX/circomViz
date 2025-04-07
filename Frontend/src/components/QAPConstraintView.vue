<template>
  <div v-if="selectedRows.length > 0" class="constraint-formulas">
    <!-- <h3 class="formula-title">Selected Constraints:</h3> -->
    <div class="formulas-container">
      <div v-for="(rowIndex, index) in sortedSelectedRows" :key="index" class="formula-item">
        <div class="row-label">{{ formatConstraintLabel(rowIndex) }}:</div>
        <div class="formula-content" ref="mathElements"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch, nextTick } from 'vue';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { browserAdaptor } from 'mathjax-full/js/adaptors/browserAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

import { readableCoefficient } from '@/composables/coefficient'
import { useCircuitStore } from '@/stores/circuit';
const circuitStore = useCircuitStore();
const signals = computed(() => circuitStore.symbols);

// MathJax core setup
const adaptor = browserAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({ packages: AllPackages });
const svg = new SVG({ fontCache: 'none' });
const html = mathjax.document('', { InputJax: tex, OutputJax: svg });

// Define props for the component
const props = defineProps({
  selectedRows: {
    type: Array as () => number[],
    required: true
  },
  qapData: {
    type: Object,
    required: true
  }
});

// Refs and computed values
const mathElements = ref<HTMLElement[]>([]);

const sortedSelectedRows = computed(() => {
  return [...props.selectedRows].sort((a: number, b: number) => a - b);
});

const matrixSize = computed(() => {
  if (!props.qapData) return { rows: 0, cols: 0 };
  const numConstraints = parseInt(props.qapData.numConstraints?.toString() || '0');
  const numVars = props.qapData.numVars || 0;
  return { rows: numConstraints, cols: numVars };
});

const generatedFormulas = computed(() => {
  return sortedSelectedRows.value.map(rowIndex => generateConstraintFormula(rowIndex));
});

// Core rendering function using mathjax npm
async function renderMathJax() {
  await nextTick();
  if (mathElements.value && mathElements.value.length > 0) {
    mathElements.value.forEach((el, index) => {
      const formula = generatedFormulas.value[index];
      if (formula) {
        const node = html.convert(`${formula}`, { display: true });
        el.innerHTML = ''; // Clear previous
        adaptor.append(el, node);
      }
    });
  }
}

// Watch for changes
watch(() => generatedFormulas.value, renderMathJax);

// Initialize
onMounted(() => {
  renderMathJax();
});

function generateConstraintFormula(rowIndex: number): string {
  const matrixA = getMatrix(0);
  const matrixB = getMatrix(1);
  const matrixC = getMatrix(2);

  if (!matrixA[rowIndex] || !matrixB[rowIndex] || !matrixC[rowIndex]) return '';

  let leftSideA = '', leftSideB = '', rightSide = '';

  for (let j = 0; j < matrixSize.value.cols; j++) {
    const coeffA = matrixA[rowIndex][j];

    if (coeffA !== 0) leftSideA += (leftSideA ? ' + ' : '') + formatCoefficient(coeffA, j);

    const coeffB = matrixB[rowIndex][j];
    if (coeffB !== 0) leftSideB += (leftSideB ? ' + ' : '') + formatCoefficient(coeffB, j);

    const coeffC = matrixC[rowIndex][j];
    if (coeffC !== 0) rightSide += (rightSide ? ' + ' : '') + formatCoefficient(coeffC, j);
  }

  // Final cleanup for any remaining "+ -" cases (with possible spaces)
  const cleanFormula = (formula: string) =>
    formula.replace(/\+\s*\-/g, '- ').replace(/\+\s*\+/g, '+ ');

  leftSideA = cleanFormula(leftSideA) || '0';
  leftSideB = cleanFormula(leftSideB) || '0';
  rightSide = cleanFormula(rightSide) || '0';

  return `\\left(${leftSideA}\\right) \\cdot \\left(${leftSideB}\\right) = ${rightSide}`;
}

function formatCoefficient(coeff: number, signalIndex: number): string {
  const signalName = String(getSignalName(signalIndex));

  if (coeff === 1) return signalName;
  if (coeff === -1) return `-${signalName}`;

  const coeffStr = readableCoefficient(coeff)
  const coeffExpon = coeffStr.length > 6 ? formatExponential(coeff.toExponential(4)) : coeffStr

  if (signalName === "") { // constant
    return coeffExpon;
  } else {
    return `${coeffExpon} \\cdot ${signalName}`;
  }
}

function formatExponential(num: string | number): string {
  // Convert to string if it's a number in exponential form
  const numStr = typeof num === 'number' ? num.toExponential() : num;

  const [coefficient, exponent] = numStr.split('e');

  // Handle cases without exponent (e.g., "123" instead of "1.23e+2")
  if (!exponent) return numStr;

  // Format as "a × 10^b"
  return `${coefficient} \\times 10^{${exponent.replace('+', '')}}`;
}

function getSignalName(signalIndex: number) {
  if (signalIndex === 0) return ""

  const signalName = signals.value.find(s => s.index === signalIndex);
  if (!signalName || !signalName.name) return "";

  const parts = signalName.name.split(".");
  const lastTwo = parts.slice(-2); // get last two elements
  return lastTwo.join(".");
}

function getMatrix(matrixIndex: number) {
  if (!props.qapData) return [];
  const matrix = matrixIndex === 0 ? props.qapData.qapPolysA :
    matrixIndex === 1 ? props.qapData.qapPolysB :
      props.qapData.qapPolysC;

  const result = [];
  const size = matrixSize.value;

  for (let i = 0; i < size.rows; i++) {
    const row = [];
    for (let j = 0; j < size.cols; j++) {
      const poly = matrix[j] || [];
      const val = i < poly.length ? parseFloat(poly[i]) : 0;
      row.push(val);
    }
    result.push(row);
  }

  return result;
}

function formatConstraintLabel(index: number): string {
  const subscripts = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
  return 'C' + index.toString().split('').map(d => subscripts[+d]).join('');
}
</script>


<style lang="css" scoped>
.constraint-formulas {
  margin-top: 15px;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background-color: #fff;
  width: 100%;
  max-width: 95%;
  margin-left: auto;
  margin-right: auto;
  margin-bottom: 15px;
  flex-shrink: 0;
}

.formula-title {
  font-weight: bold;
  margin-bottom: 10px;
  font-size: 16px;
  color: #333;
}

.formulas-container {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
}

.formula-item {
  display: flex;
  align-items: flex-start;
  padding: 8px;
  background-color: #f9f9f9;
  border-radius: 4px;
  width: 100%;
}

.row-label {
  min-width: 40px;
  font-weight: bold;
  color: #444;
  padding-top: 8px;
  flex-shrink: 0;
}

.formula-content {
  flex-grow: 1;
  overflow-x: auto;
  padding: 6px 0;
  width: calc(100% - 130px);
}
</style>

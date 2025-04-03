<template>
  <div v-if="selectedRows.length > 0" class="constraint-formulas">
    <h3 class="formula-title">Selected Constraints:</h3>
    <div class="formulas-container">
      <div v-for="(rowIndex, index) in sortedSelectedRows" :key="index" class="formula-item">
        <div class="row-label">Constraint {{ rowIndex }}:</div>
        <div class="formula-content" ref="mathElements"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">

// Declare MathJax on the global window object
declare global {
  interface Window {
    MathJax?: any;
  }
}
import { computed, ref, onMounted, watch, nextTick } from 'vue';

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

// Reference to elements where MathJax will be rendered
const mathElements = ref<HTMLElement[]>([]);

// Sort selected rows by index for consistent display
const sortedSelectedRows = computed(() => {
  return [...props.selectedRows].sort((a: number, b: number) => a - b);
});

// Matrix dimensions
const matrixSize = computed(() => {
  if (!props.qapData) return { rows: 0, cols: 0 };
  
  const numConstraints = parseInt(props.qapData.numConstraints?.toString() || '0');
  const numVars = props.qapData.numVars || 0;
  
  return {
    rows: numConstraints, 
    cols: numVars        
  };
});

// Generate formulas for each selected row
const generatedFormulas = computed(() => {
  return sortedSelectedRows.value.map(rowIndex => generateConstraintFormula(rowIndex));
});

/**
 * Generate a constraint formula for the given row
 * @param rowIndex Index of the constraint row
 * @returns LaTeX string for the constraint formula
 */
function generateConstraintFormula(rowIndex: number): string {
  // Get matrix data for all three matrices
  const matrixA = getMatrix(0);
  const matrixB = getMatrix(1);
  const matrixC = getMatrix(2);
  
  if (!matrixA[rowIndex] || !matrixB[rowIndex] || !matrixC[rowIndex]) return '';
  
  // Build polynomial expressions for each part of the constraint
  let leftSideA = '';
  let leftSideB = '';
  let rightSide = '';
  
  for (let j = 0; j < matrixSize.value.cols; j++) {
    const coeffA = matrixA[rowIndex][j];
    if (coeffA !== 0) {
      leftSideA += (leftSideA ? ' + ' : '') + formatCoefficient(coeffA, j);
    }
    
    const coeffB = matrixB[rowIndex][j];
    if (coeffB !== 0) {
      leftSideB += (leftSideB ? ' + ' : '') + formatCoefficient(coeffB, j);
    }
    
    const coeffC = matrixC[rowIndex][j];
    if (coeffC !== 0) {
      rightSide += (rightSide ? ' + ' : '') + formatCoefficient(coeffC, j);
    }
  }
  
  // Default to 0 if any side is empty
  leftSideA = leftSideA || '0';
  leftSideB = leftSideB || '0';
  rightSide = rightSide || '0';
  
  // Return the complete LaTeX formula
  return `\\left(${leftSideA}\\right) \\cdot \\left(${leftSideB}\\right) = ${rightSide}`;
}

/**
 * Format a coefficient and signal into a term
 * @param coeff Coefficient value
 * @param signalIndex Signal index
 * @returns Formatted term
 */
function formatCoefficient(coeff: number, signalIndex: number): string {
  const signalName = `s_{${signalIndex}}`;
  
  // Special cases for coefficients of 1 or -1
  if (coeff === 1) return signalName;
  if (coeff === -1) return `-${signalName}`;
  
  // Format coefficient based on magnitude
  let coeffStr = Math.abs(coeff) < 0.001 || Math.abs(coeff) > 10000 
                ? `(${coeff.toExponential(4)})` 
                : Math.round(coeff * 1000) / 1000;
                
  return `${coeffStr} \\cdot ${signalName}`;
}

/**
 * Get matrix data for a specific matrix
 * @param matrixIndex 0 for A, 1 for B, 2 for C
 * @returns 2D array of matrix values
 */
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

/**
 * Load MathJax from CDN if not already loaded
 * @returns Promise resolving to MathJax object
 */
function loadMathJax() {
  if (window.MathJax) {
    return Promise.resolve(window.MathJax);
  }
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';
    script.async = true;
    script.onload = () => resolve(window.MathJax);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * Render the formulas using MathJax
 */
async function renderMathJax() {
  try {
    await loadMathJax();
    await nextTick();
    
    if (mathElements.value && mathElements.value.length > 0) {
      mathElements.value.forEach((el, index) => {
        if (el && generatedFormulas.value[index]) {
          el.innerHTML = `\\[${generatedFormulas.value[index]}\\]`;
        }
      });
      
      window.MathJax.typeset(mathElements.value);
    }
  } catch (error) {
    console.error('Failed to render MathJax:', error);
  }
}

// Watch for changes in formulas and rerender
watch(() => generatedFormulas.value, renderMathJax);

// Initialize MathJax on component mount
onMounted(async () => {
  await loadMathJax();
});
</script>

<style lang="css" scoped>
.constraint-formulas {
  margin-top: 20px;
  padding: 15px;
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
  gap: 15px;
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
  min-width: 120px;
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

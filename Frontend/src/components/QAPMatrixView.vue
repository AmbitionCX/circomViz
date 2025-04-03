<template>
  <div class="qap-matrices">
    <div v-for="(matrix, matrixIndex) in ['A', 'B', 'C']" :key="matrixIndex" class="matrix-container">
      <h3 class="matrix-title">{{ matrix }}</h3>
      <div class="matrix-wrapper">
        <!-- Column Headers (Signal Names) -->
        <div class="signal-names-row" :style="matrixIndex===0 ? { marginLeft: rowNumbersWidth + 'px' } : {}">
          <div 
            v-for="(_, index) in matrixSize.cols" 
            :key="`header-${matrixIndex}-${index}`" 
            class="signal-name-cell"
            :style="{ width: `${cellSize}px` }"
            @click="toggleColumnSelection(index)"
          >
            <el-tooltip :content="getSignalName(index)" placement="top" effect="light" 
                        :show-after="300" :hide-after="100" :enterable="false">
              <span class="column-label" :class="{'highlighted-label': isHighlighted(index)}">
                {{ formatIndex(index, 'signal') }}
              </span>
            </el-tooltip>
          </div>
        </div>
        
        <div class="matrix-grid-container">
          <!-- Column Highlight Layer -->
          <div class="column-highlight-layer">
            <div 
              v-for="(_, index) in matrixSize.cols" 
              :key="`highlight-${matrixIndex}-${index}`"
              class="column-highlight"
              :class="{ 'highlighted': isHighlighted(index) }"
              :style="matrixIndex===0 
                ? { width: `${cellSize}px`, left: `${rowNumbersWidth + index * (cellSize + 1)}px` } 
                : { width: `${cellSize}px`, left: `${index * (cellSize + 1)}px` }"
            ></div>
          </div>
          
          <!-- Matrix with Row Numbers (only for A matrix) -->
          <div :class="{'matrix-with-row-numbers': matrixIndex === 0, 'matrix-without-row-numbers': matrixIndex !== 0}">
            <div v-if="matrixIndex === 0" class="row-numbers">
              <div 
                v-for="rowIndex in matrixSize.rows" 
                :key="`row-number-${rowIndex-1}`"
                class="row-number"
                :class="{'selected-row-number': selectedRows.includes(rowIndex-1)}"
                @click="toggleRowSelection(rowIndex-1)"
                :style="{ height: `${cellSize}px` }"
              >
                {{ formatIndex(rowIndex-1, 'constraint') }}
              </div>
            </div>
            
            <!-- The actual matrix grid -->
            <div class="matrix-grid" :style="matrixGridStyle">
              <div 
                v-for="(rowData, rowIndex) in getMatrix(matrixIndex)" 
                :key="`${matrixIndex}-${rowIndex}`" 
                class="matrix-row"
                :class="{'selected-row': selectedRows.includes(rowIndex)}"
                @click="matrixIndex !== 0 ? toggleRowSelection(rowIndex) : undefined"
              >
                <div 
                  v-for="(value, colIndex) in rowData" 
                  :key="`${matrixIndex}-${rowIndex}-${colIndex}`" 
                  class="matrix-cell" 
                  :style="[getCellStyle(value, colIndex), { width: `${cellSize}px`, height: `${cellSize}px` }]"
                >
                  <el-tooltip 
                    :content="`Signal: ${getSignalName(colIndex)}, Value: ${value}`" 
                    placement="top" 
                    effect="light" 
                    :show-after="200" 
                    :hide-after="100" 
                    :enterable="false"
                    popper-class="matrix-tooltip"
                  >
                    <div class="w-full h-full cell-content"></div>
                  </el-tooltip>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import * as d3 from 'd3';
import { useCircuitStore } from '@/stores/circuit';

// Define props for the component
const props = defineProps({
  qapData: {
    type: Object,
    required: true
  },
  symbols: {
    type: Array as () => Array<{ index: number; name: string }>,
    default: () => []
  },
  selectedRows: {
    type: Array,
    default: () => []
  }
});

// Define emits for events that need to be communicated to parent
const emit = defineEmits(['update:selectedRows', 'update:selectedSignals']);

// Access circuit store for signals
const circuitStore = useCircuitStore();
const selectedSignals = computed(() => circuitStore.selectedSignals);

// Create color scale for signals
const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

// Computed for matrix dimensions
const matrixSize = computed(() => {
  if (!props.qapData) return { rows: 0, cols: 0 };
  
  const numConstraints = parseInt(props.qapData.numConstraints?.toString() || '0');
  const numVars = props.qapData.numVars || 0;
  
  return {
    rows: numConstraints, 
    cols: numVars        
  };
});

// Compute appropriate cell size based on matrix dimensions and viewport
const cellSize = computed(() => {
  const { rows, cols } = matrixSize.value;
  if (!rows || !cols) return 16;
  
  const totalMatrices = 3;
  const maxMatrixWidth = Math.floor(window.innerWidth * 0.85 / totalMatrices);
  const maxCellSizeByWidth = Math.floor(maxMatrixWidth / cols);
  
  const maxHeight = 350; 
  const maxCellSizeByHeight = Math.floor(maxHeight / rows);
  
  let size = Math.min(maxCellSizeByWidth, maxCellSizeByHeight);
  
  // Constrain size within reasonable bounds
  size = Math.min(Math.max(size, 8), 18);
  
  return size;
});

// Style for the matrix grid rows
const matrixGridStyle = computed(() => {
  return {
    gridTemplateRows: `repeat(${matrixSize.value.rows}, ${cellSize.value}px)`
  };
});

const rowNumbersWidth = 20;

/**
 * Format an index with subscript notation
 * @param index The index number to format
 * @param type The type of index ('signal' or 'constraint')
 * @returns Formatted index string with subscript notation
 */
function formatIndex(index: number, type: 'signal' | 'constraint'): string {
  const subscripts = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
  
  const indexStr = index.toString();
  const subscriptStr = indexStr
    .split('')
    .map(digit => subscripts[parseInt(digit)])
    .join('');
  
  return type === 'signal' ? 'S' + subscriptStr : 'C' + subscriptStr;
}

/**
 * Toggle selection of a row
 * @param rowIndex Index of the row to toggle
 */
function toggleRowSelection(rowIndex: number) {
  // Create a copy of the selected rows
  const updatedRows = [...props.selectedRows];
  const index = updatedRows.indexOf(rowIndex);
  
  if (index === -1) {
    updatedRows.push(rowIndex);
  } else {
    updatedRows.splice(index, 1);
  }
  
  // Emit the updated rows to parent
  emit('update:selectedRows', updatedRows);
}

/**
 * Toggle selection of a column/signal
 * @param colIndex Index of the column to toggle
 */
function toggleColumnSelection(colIndex: number) {
  if (!props.symbols) return;
  
  const signal = props.symbols.find((s: { index: number; name: string }) => s.index === colIndex);
  if (!signal) return;
  
  const isSelected = isHighlighted(colIndex);
  
  // Get current selected signals
  let updatedSignals = [...selectedSignals.value];
  
  if (isSelected) {
    // Remove signal if it's already selected
    updatedSignals = updatedSignals.filter(s => s.symbol_id !== colIndex);
  } else {
    // Add signal to selection
    const signalObject = {
      name: signal.name.split('.').pop() || signal.name,
      fullName: signal.name,
      symbol_id: colIndex,
      component: getComponentName(signal.name),
      children: []
    };
    
    updatedSignals.push(signalObject);
  }
  
  // Update the store directly
  circuitStore.selectedSignals = updatedSignals;

  
  updateRowsFromSignals();
}

/**
 * Update selectedRows based on union of rows in matrices A, B, and C
 * where each currently selected signal column has non-zero value.
 */
function updateRowsFromSignals() {
  const unionRows = new Set<number>();
  const matA = getMatrix(0);
  const matB = getMatrix(1);
  const matC = getMatrix(2);
  const totalRows = matrixSize.value.rows;
  
  selectedSignals.value.forEach(signal => {
    const col = signal.symbol_id;
    for (let row = 0; row < totalRows; row++) {
      // 如果任一矩阵对应单元格非零，则包含该行
      if (matA[row][col] !== 0 || matB[row][col] !== 0 || matC[row][col] !== 0) {
        unionRows.add(row);
      }
    }
  });
  
  const newRows = Array.from(unionRows).sort((a, b) => a - b);
  emit('update:selectedRows', newRows);
}

/**
 * Get the matrix data for a given matrix index
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
 * Get the signal name for a column index
 * @param colIndex Column index
 * @returns Signal name
 */
function getSignalName(colIndex: number) {
  if (!props.symbols) return `Signal ${colIndex}`;
  
  const signal = props.symbols.find(s => s.index === colIndex);
  return signal ? signal.name : `Signal ${colIndex}`;
}

/**
 * Get the component name from a signal's full name
 * @param signalName Full signal name with path
 * @returns Component name
 */
function getComponentName(signalName: string): string {
  const parts = signalName.split('.');
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}

/**
 * Check if a column/signal is highlighted
 * @param colIndex Column index
 * @returns True if highlighted
 */
function isHighlighted(colIndex: number) {
  if (!selectedSignals.value || selectedSignals.value.length === 0) return false;
  return selectedSignals.value.some(signal => signal.symbol_id === colIndex);
}

/**
 * Get the color for a signal based on its component
 * @param colIndex Column index
 * @returns Color string
 */
function getSignalColor(colIndex: number) {
  if (!props.symbols) return '#aaa';
  
  const signal = props.symbols.find(s => s.index === colIndex);
  if (!signal) return '#aaa';
  
  const parts = signal.name.split('.');
  const componentName = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  
  return colorScale(componentName);
}

/**
 * Get the style for a matrix cell based on its value and column
 * @param value Cell value
 * @param colIndex Column index
 * @returns Style object
 */
function getCellStyle(value: number, colIndex: number) {
  if (value === 0) {
    return {
      backgroundColor: '#f8f8f8',
      border: '1px solid #e8e8e8',
      boxShadow: 'none'
    };
  }
  
  const baseColor = getSignalColor(colIndex);
  
  let r = 0, g = 0, b = 0;
  
  if (baseColor.startsWith('#')) {
    const hex = baseColor.substring(1);
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  }
  else if (baseColor.startsWith('rgb')) {
    const matches = baseColor.match(/\d+/g);
    if (matches && matches.length >= 3) {
      r = parseInt(matches[0]);
      g = parseInt(matches[1]);
      b = parseInt(matches[2]);
    }
  }
  
  const highlighted = isHighlighted(colIndex);
  
  const opacity = highlighted ? 1 : 0.5;
  const color = `rgba(${r}, ${g}, ${b}, ${opacity})`;
  
  return {
    backgroundColor: color,
    border: '1px solid #ddd',
    boxShadow: 'inset 0 0 1px rgba(0,0,0,0.1)'
  };
}
</script>

<style lang="css" scoped>
/* Matrix container layout */
.qap-matrices {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  gap: 16px;
  padding: 10px;
  overflow-x: auto;
  width: 100%;
  flex-shrink: 0;
}

.matrix-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  margin-bottom: 15px;
}

.matrix-title {
  font-weight: bold;
  margin-bottom: 8px;
  font-size: 18px;
}

.matrix-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Column headers styling */
.signal-names-row {
  display: flex;
  flex-direction: row;
  gap: 1px;
  padding-bottom: 2px;
  min-height: 20px;
}

.signal-name-cell {
  font-size: 9px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
}

.column-label {
  transition: all 0.2s ease;
  font-weight: normal;
}

.highlighted-label {
  font-weight: bold;
  transform: scale(1.1);
  color: #000;
  text-shadow: 0 0 2px rgba(255,255,255,0.8);
}

/* Matrix grid layout and styling */
.matrix-grid-container {
  position: relative;
  margin-top: 2px;
}

.column-highlight-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
}

.column-highlight {
  position: absolute;
  top: 0;
  height: 100%;
  border: 2px solid transparent;
  transition: border-color 0.15s ease;
  pointer-events: none;
}

.highlighted {
  border-color: rgba(0, 0, 0, 0.3);
}

.matrix-with-row-numbers {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
}

.matrix-without-row-numbers {
  display: flex;
  justify-content: center;
}

/* Row numbers styling */
.row-numbers {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-right: 4px;
  padding-top: 1px;
}

.row-number {
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 9px;
  min-width: 16px;
  background-color: #f0f0f0;
  border: 1px solid #ddd;
  cursor: pointer;
  transition: all 0.2s ease;
}

.row-number:hover {
  background-color: #e0e0e0;
}

.selected-row-number {
  background-color: #1677ff;
  color: white;
  font-weight: bold;
}

/* Matrix rows and cells */
.matrix-grid {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background-color: #e0e0e0;
  border: 1px solid #ccc;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.matrix-row {
  display: flex;
  flex-direction: row;
  gap: 1px;
  position: relative;
  transition: background-color 0.2s ease;
}

.selected-row {
  background-color: rgba(22, 119, 255, 0.1);
}

.matrix-row:hover {
  background-color: rgba(0, 0, 0, 0.03);
}

.matrix-cell {
  position: relative;
  user-select: none;
  cursor: default;
  min-width: 6px;
  min-height: 6px;
  overflow: visible;
}

.matrix-cell:hover {
  outline: 1px solid rgba(0, 0, 0, 0.1);
}

.cell-content {
  position: relative;
  z-index: 1;
}

/* Tooltip customization */
:deep(.el-tooltip__trigger):after {
  display: none !important;
}

:deep(.el-tooltip__popper) {
  max-width: 300px;
  word-break: break-all;
  z-index: 10000 !important;
}

:deep(.matrix-tooltip) {
  z-index: 10000 !important;
}
</style>

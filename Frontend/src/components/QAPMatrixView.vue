<template>
  <div class="flex flex-row w-full pl-1 justify-start items-center overflow-x-auto gap-x-4">
    <div v-for="(matrix, matrixIndex) in ['A', 'B', 'C']" :key="matrixIndex"
      class="flex flex-col items-center shrink-0 mb-0">
      <h3 class="font-bold text-lg">{{ matrix }}</h3>
      <div class="matrix-wrapper">

        <div class="matrix-grid-container">
          <!-- Column Highlight Layer -->
          <div class="column-highlight-layer">
            <div v-for="(_, index) in matrixSize.cols" :key="`highlight-${matrixIndex}-${index}`"
              class="column-highlight" :class="{ 'highlighted': isHighlighted(index) }" :style="matrixIndex === 0
                ? { width: `${cellSize}px`, left: `${rowNumbersWidth + index * (cellSize + 1)}px` }
                : { width: `${cellSize}px`, left: `${index * (cellSize + 1)}px` }"></div>
          </div>

          <!-- Matrix with Row Numbers (only for A matrix) -->
          <div
            :class="{ 'matrix-with-row-numbers': matrixIndex === 0, 'matrix-without-row-numbers': matrixIndex !== 0 }">
            <div v-if="matrixIndex === 0" class="row-numbers">
              <div v-for="rowIndex in matrixSize.rows" :key="`row-number-${rowIndex - 1}`" class="row-number"
                :class="{ 'selected-row-number': selectedRows.includes(rowIndex - 1) }"
                @click="toggleRowSelection(rowIndex - 1)" :style="{ height: `${cellSize}px` }">
                {{ formatIndex(rowIndex - 1, 'constraint') }}
              </div>
            </div>

            <!-- The actual matrix grid -->
            <div class="matrix-grid" :style="matrixGridStyle">
              <div v-for="(rowData, rowIndex) in getMatrix(matrixIndex)" :key="`${matrixIndex}-${rowIndex}`"
                class="matrix-row" :class="{ 'selected-row': selectedRows.includes(rowIndex) }"
                @click="matrixIndex !== 0 ? toggleRowSelection(rowIndex) : undefined">
                <div v-for="(value, colIndex) in rowData" :key="`${matrixIndex}-${rowIndex}-${colIndex}`"
                  class="matrix-cell"
                  :style="[getCellStyle(value, colIndex), { width: `${cellSize}px`, height: `${cellSize}px` }]">
                  <el-tooltip :content="`Signal: ${getSignalName(colIndex)}, Value: ${value}`" placement="top"
                    effect="light" :show-after="200" :hide-after="100" :enterable="false" popper-class="matrix-tooltip">
                    <div class="w-full h-full cell-content"></div>
                  </el-tooltip>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Signal Names -->
        <div class="signal-names-row" :style="matrixIndex === 0 ? { marginLeft: rowNumbersWidth + 'px' } : {}">
          <div v-for="(_, index) in matrixSize.cols" :key="`header-${matrixIndex}-${index}`" class="signal-name-cell"
            :style="{ width: `${cellSize}px` }" @click="toggleColumnSelection(index)">
            <el-tooltip :content="getSignalName(index)" placement="top" effect="light" :show-after="300"
              :hide-after="100" :enterable="false">
              <div class="rotated-label-wrapper">
                <span class="column-label" :class="{ 'highlighted-label': isHighlighted(index) }"
                  :style="getSignalLabelStyle(index)">
                  {{ getSignalName(index).split('.').pop() }}
                </span>
              </div>
            </el-tooltip>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useCircuitStore } from '@/stores/circuit';
import { hexToRgba } from '@/composables/colors'

const componentColors = computed(() => circuitStore.componentNameColorMap);

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

  // Update row selection based on signals
  updateRowsFromSignals();
}

function getSignalLabelStyle(colIndex: number) {
  const signal = props.symbols.find(s => s.index === colIndex);
  if (!signal) return {};

  const componentName = getComponentName(signal.name);

  const baseColor = componentColors.value[componentName] || '#ccc';
  const isSelected = isHighlighted(colIndex);
  const bgColor = hexToRgba(baseColor, isSelected ? 0.8 : 0.2); // Transparent only for bg

  return {
    backgroundColor: bgColor,
    color: '#000', // ensure text is always visible
  };
}

// Update row selection on component mount and when signals change
onMounted(() => {
  // Initialize row selection based on selected signals
  if (selectedSignals.value.length > 0) {
    updateRowsFromSignals();
  }
});

// Watch for changes in selected signals
watch(() => selectedSignals.value, () => {
  // Update rows when selected signals change
  updateRowsFromSignals();
}, { deep: true });

/**
 * Update selectedRows based on intersection of rows in matrices A, B, and C
 * where each currently selected signal column has non-zero value.
 */
function updateRowsFromSignals() {
  const matA = getMatrix(0);
  const matB = getMatrix(1);
  const matC = getMatrix(2);
  const totalRows = matrixSize.value.rows;
  const selectedSignalIds = selectedSignals.value.map(signal => signal.symbol_id);

  // If no signals are selected, clear selected rows
  if (selectedSignalIds.length === 0) {
    emit('update:selectedRows', []);
    return;
  }

  // Create an array to track how many selected signals match each row
  const rowMatchCounts = Array(totalRows).fill(0);

  // For each selected signal, check all rows
  selectedSignalIds.forEach(colIndex => {
    for (let row = 0; row < totalRows; row++) {
      // If row has non-zero value for this signal in any matrix, increment match count
      if (matA[row][colIndex] !== 0 || matB[row][colIndex] !== 0 || matC[row][colIndex] !== 0) {
        rowMatchCounts[row]++;
      }
    }
  });

  // Filter rows that match all selected signals (intersection logic)
  const intersectionRows = [];
  for (let row = 0; row < totalRows; row++) {
    if (rowMatchCounts[row] === selectedSignalIds.length) {
      intersectionRows.push(row);
    }
  }

  emit('update:selectedRows', intersectionRows.sort((a, b) => a - b));
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
  if (colIndex === 0) return "const"
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

  return componentColors.value[componentName];
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
.signal-names-row {
  display: flex;
  flex-direction: row;
  gap: 1px;
  padding-top: 2px;
  /* Was padding-bottom before */
  min-height: 20px;
  justify-content: center;
}

.matrix-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.signal-name-cell {
  font-size: 9px;
  text-align: left;
  overflow: visible;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.rotated-label-wrapper {
  writing-mode: vertical-rl;
  /* vertical text from bottom to top */
  transform: rotate(-20deg);
  /* flip so text reads top-down */
  transform-origin: top right;
  white-space: nowrap;
  text-align: center;
  display: flex;
  align-items: center;
  height: 100%;
  max-height: 90px;
}

.column-label {
  transition: all 0.2s ease;
  font-weight: normal;
  padding-inline: 6px;
  border-radius: 8px;
}

.highlighted-label {
  font-weight: bold;
  transform: scale(1.1);
  color: #1677ff;
  text-shadow: 0 0 2px rgba(255, 255, 255, 0.8);
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

.column-highlight.highlighted {
  background-color: rgba(0, 0, 0, 0.05);
  border-color: transparent;
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
  box-sizing: border-box;
  /* Ensure borders are included in size calculations */
}

.row-number:hover {
  background-color: #e0e0e0;
}

.selected-row-number {
  background-color: #1677ff;
  color: white;
  font-weight: bold;
  outline: 2px solid rgba(22, 119, 255, 0.7);
  /* Use outline instead of border */
  z-index: 5;
}

/* Matrix rows and cells */
.matrix-grid {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background-color: #e0e0e0;
  border: 1px solid #ccc;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.matrix-row {
  display: flex;
  flex-direction: row;
  gap: 1px;
  position: relative;
  transition: background-color 0.2s ease;
  box-sizing: border-box;
  /* Ensure borders are included in size calculations */
}

.selected-row {
  background-color: rgba(22, 119, 255, 0.1);
  outline: 2px solid rgba(22, 119, 255, 0.7);
  /* Use outline instead of border */
  position: relative;
  z-index: 5;
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

:deep(.matrix-tooltip) {
  z-index: 10000 !important;
}
</style>

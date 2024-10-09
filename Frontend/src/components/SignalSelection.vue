<template>
  <div class="signal-selection-container">
    <div class="flex flex-row flex-nowrap mb-2">
      <h2 class="text-base font-bold">Signal Selection</h2>
      <el-tooltip class="box-item" effect="light" content="Signal Selection" placement="top">
        <el-icon class="my-auto ml-1 hover:cursor-pointer">
          <Warning style="width: 0.9em; height: 0.9em; fill: black; fill-opacity: 0.8;" />
        </el-icon>
      </el-tooltip>
    </div>

    <!-- Tree View for Signal Selection with Scrollbar -->
    <div class="tree-container">
      <el-tree
        :data="signalTree"
        :props="defaultProps"
        show-checkbox
        @check-change="handleCheckChange"
        class="h-full"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useCircuitStore } from '@/stores/circuit';

const circuitStore = useCircuitStore();
const selectedSignals = ref<string[]>([]);

//const signals = computed(() => circuitStore.symbols || []);

interface Signal {
  symbol_id: string;
  name: string;
  children?: Signal[];
}

const signalTree = computed<Signal[]>(() => {
  return buildSignalTree(circuitStore.symbols);
});

const defaultProps = {
  children: 'children',
  label: 'name',
};

/*watch(selectedSignals, (newSignals) => {
  circuitStore.setSelectedSignals(newSignals);
});*/

const handleCheckChange = (checkedKeys: string[]) => {
  selectedSignals.value = checkedKeys;
  circuitStore.setSelectedSignals(checkedKeys);
};

function buildSignalTree(symbols: { symbol_id: string; name: string }[]): Signal[] {
  const tree: Signal[] = [];
  const nodeMap: Record<string, Signal> = {};

  symbols.forEach((symbol) => {
    const parts = symbol.name.split('.');
    let currentNode: Signal | undefined;
    let currentChildren = tree;

    parts.forEach((part, index) => {
      const currentPath = parts.slice(0, index + 1).join('.');

      if (!nodeMap[currentPath]) {
        const newNode: Signal = {
          name: part,
          symbol_id: symbol.symbol_id,
          children: [],
        };

        currentChildren.push(newNode);
        nodeMap[currentPath] = newNode;
      }

      currentNode = nodeMap[currentPath];
      currentChildren = currentNode.children!;
    });
  });

  return tree;
}
</script>


<style scoped>
.signal-selection-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tree-container {
  flex-grow: 1;
  overflow-y: auto;
  border: 1px solid #e0e0e0;
  padding: 10px;
  border-radius: 4px;
}
</style>

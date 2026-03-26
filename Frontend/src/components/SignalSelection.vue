<template>
  <div class="signal-selection-container h-full flex flex-col overflow-hidden">
    <div class="flex items-center justify-between flex-shrink-0">
      <div class="flex items-center gap-2">
        <h2 class="text-base font-bold text-gray-800">Signal View</h2>
        <el-tooltip content="View all signals in the circuit, including inputs, outputs, and intermediate signals" placement="top">
          <el-icon class="text-gray-400 cursor-help">
            <QuestionFilled />
          </el-icon>
        </el-tooltip>
      </div>
      <div class="flex items-center gap-3 text-xs text-gray-500">
        <div class="flex items-center gap-1">
          <el-icon class="text-blue-500"><CircleCheck /></el-icon>
          <span>Input</span>
        </div>
        <div class="flex items-center gap-1">
          <el-icon class="text-green-500"><CircleCheckFilled /></el-icon>
          <span>Output</span>
        </div>
        <div class="flex items-center gap-1">
          <el-icon class="text-gray-500"><RemoveFilled /></el-icon>
          <span>Intermediate</span>
        </div>
        <el-tag v-if="totalSignalCount" type="info" size="small">{{ totalSignalCount }} signals</el-tag>
      </div>
    </div>
    
    <div class="flex-1 overflow-auto min-h-0 mt-2">
      <el-empty v-if="!isParsed" description="No circuit loaded" :image-size="80" />
      
      <el-tree
        v-else-if="filteredSignalGroups.length > 0"
        :data="filteredSignalGroups"
        :props="treeProps"
        default-expand-all
        :expand-on-click-node="false"
        node-key="id"
        class="signal-tree"
      >
        <template #default="{ data }">
          <div class="tree-node-content">
            <el-icon v-if="data.kind === 'input'" class="mr-1 text-blue-500">
              <CircleCheck />
            </el-icon>
            <el-icon v-else-if="data.kind === 'output'" class="mr-1 text-green-500">
              <CircleCheckFilled />
            </el-icon>
            <el-icon v-else class="mr-1 text-gray-500">
              <RemoveFilled />
            </el-icon>
            
            <span class="signal-name">{{ data.name }}</span>
            
            <el-tag v-if="data.isArray" size="small" type="info" class="ml-2">
              Array
            </el-tag>
            
            <span class="text-xs text-gray-400 ml-auto">{{ data.line }}</span>
          </div>
        </template>
      </el-tree>
      
      <el-empty v-else description="No signals found" :image-size="80" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CircleCheck, CircleCheckFilled, RemoveFilled, QuestionFilled } from '@element-plus/icons-vue';
import { useCircuitStore } from '@/stores/circuit';
import type { SignalInfo } from '@/types/circuitTypes';

const circuitStore = useCircuitStore();

const treeProps = {
  children: 'children',
  label: 'name'
};

const isParsed = computed(() => circuitStore.isParsed);

const filteredSignalGroups = computed(() => {
  if (!isParsed.value) return [];
  
  const signals = circuitStore.filteredSignals;
  return groupSignalsByType(signals);
});

const totalSignalCount = computed(() => {
  return isParsed.value ? circuitStore.filteredSignals.length : 0;
});

const groupSignalsByType = (signals: SignalInfo[]) => {
  const groups: any[] = [];
  
  const types: ('input' | 'output' | 'intermediate')[] = ['input', 'output', 'intermediate'];
  
  for (const kind of types) {
    const kindSignals = signals.filter(s => s.kind === kind);
    
    if (kindSignals.length > 0) {
      const groupNode = {
        id: `group-${kind}`,
        name: `${kind.charAt(0).toUpperCase() + kind.slice(1)} Signals (${kindSignals.length})`,
        kind: kind,
        children: kindSignals.map(s => createSignalTreeNode(s))
      };
      
      groups.push(groupNode);
    }
  }
  
  return groups;
};

const createSignalTreeNode = (signal: SignalInfo) => {
  return {
    id: signal.name,
    name: signal.name,
    kind: signal.kind,
    isArray: signal.isArray,
    line: signal.line,
    signal: signal
  };
};
</script>

<style scoped>
.signal-selection-container {
  background: white;
  border-radius: 8px;
}

.signal-tree :deep(.el-tree-node__content) {
  height: 36px;
  padding: 4px 8px;
}

.tree-node-content {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0 8px;
  border-radius: 4px;
  transition: background-color 0.2s;
  min-width: 0;
}

.tree-node-content:hover {
  background-color: #f5f5f5;
}

.signal-name {
  font-size: 13px;
  color: #333;
  font-family: 'Monaco', 'Menlo', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

<template>
  <section class="debug-workspace">
    <el-alert v-if="store.error" :title="store.error" type="error" :closable="false" show-icon />
    <div v-if="store.loading && !store.sourceGraph" class="workspace-loading"><el-icon class="is-loading"><Loading /></el-icon><span>Building linked graph views...</span></div>
    <el-empty v-else-if="!store.summary" description="Confirm a template to build Source and Constraint graphs" :image-size="70" />

    <template v-else>
      <el-row class="graph-columns" :gutter="8">
        <el-col :xs="24" :sm="12">
          <PartialDebuggingGraph
            graph-kind="source"
            :source-graph="store.sourceGraph"
            :selected-node-id="store.selectedNodeId"
            :hovered-node-id="store.hoveredNodeId"
            :diagnostics="store.diagnostics"
            :linked-node-ids="sourceLinkedIds"
            @select="store.selectNode"
            @hover="store.hoveredNodeId = $event"
          />
        </el-col>
        <el-col :xs="24" :sm="12">
          <PartialDebuggingGraph
            graph-kind="constraint"
            :constraint-graph="store.activeConstraintGraph"
            render-mode="exact"
            :selected-node-id="store.selectedNodeId"
            :hovered-node-id="store.hoveredNodeId"
            :diagnostics="store.diagnostics"
            :linked-node-ids="constraintLinkedIds"
            @select="store.selectNode"
            @hover="store.hoveredNodeId = $event"
          />
        </el-col>
      </el-row>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import PartialDebuggingGraph from './PartialDebuggingGraph.vue'
import { usePartialDebuggingStore } from '@/stores/partialDebugging'

const store = usePartialDebuggingStore()

const sourceLinkedIds = computed(() => {
  const ids = new Set<string>()
  const selected = store.selectedNodeId
  if (!selected) return ids
  if (selected.startsWith('signal:')) ids.add(selected)
  const graph = store.activeConstraintGraph
  if (selected.startsWith('constraint:')) {
    (graph?.adjacency[selected] ?? []).filter(id => id.startsWith('signal:')).forEach(id => ids.add(id))
  }
  store.sourceToO0.filter(link => link.constraintNodeIds.includes(selected)).forEach(link => ids.add(link.sourceNodeId))
  return ids
})

const constraintLinkedIds = computed(() => {
  const ids = new Set<string>()
  const selected = store.selectedNodeId
  if (!selected) return ids
  if (selected.startsWith('signal:')) ids.add(selected)
  const sourceLink = store.sourceToO0.find(link => link.sourceNodeId === selected)
  if (store.optimization === 'O0') sourceLink?.constraintNodeIds.forEach(id => ids.add(id))
  return ids
})
</script>

<style scoped>
.debug-workspace {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: #758982;
}

.graph-columns {
  flex: 1;
  min-height: 0;
}

@media (max-width: 900px) {
  .graph-columns { margin-left: 0 !important; margin-right: 0 !important; }
  :deep(.el-col) { padding-left: 0 !important; padding-right: 0 !important; }
  :deep(.el-col + .el-col) { margin-top: 8px; }
}
</style>

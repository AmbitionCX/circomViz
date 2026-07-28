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
            :mirrored-node-ids="sourceMirroredIds"
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
            :mirrored-node-ids="constraintMirroredIds"
            :signal-role-overrides="sourceSignalRoles"
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

const sourceSignalRoles = computed(() => {
  const roles = new Map<string, string>()
  for (const node of store.sourceGraph?.nodes ?? []) {
    if (node.kind !== 'signal' || !node.role) continue
    const qualifiedName = node.qualifiedName ?? (node.componentPath && node.localName ? `${node.componentPath}.${node.localName}` : undefined)
    if (qualifiedName) roles.set(qualifiedName, node.role)
  }
  return roles
})

const sourceSignalNames = computed(() => {
  const names = new Map<string, string>()
  for (const node of store.sourceGraph?.nodes ?? []) {
    if (node.kind !== 'signal') continue
    const qualifiedName = node.qualifiedName ?? (node.componentPath && node.localName ? `${node.componentPath}.${node.localName}` : undefined)
    if (qualifiedName) names.set(node.id, qualifiedName)
  }
  return names
})

const constraintSignalNames = computed(() => new Map(
  (store.activeConstraintGraph?.signals ?? []).map(signal => [signal.id, signal.qualifiedName]),
))

const sourceMirroredIds = computed(() => {
  const ids = new Set<string>()
  const selectedName = store.selectedNodeId ? constraintSignalNames.value.get(store.selectedNodeId) : undefined
  if (!selectedName) return ids
  for (const [nodeId, qualifiedName] of sourceSignalNames.value) {
    if (qualifiedName === selectedName) ids.add(nodeId)
  }
  return ids
})

const constraintMirroredIds = computed(() => {
  const ids = new Set<string>()
  const selectedName = store.selectedNodeId ? sourceSignalNames.value.get(store.selectedNodeId) : undefined
  if (!selectedName) return ids
  for (const [nodeId, qualifiedName] of constraintSignalNames.value) {
    if (qualifiedName === selectedName) ids.add(nodeId)
  }
  return ids
})

const sourceLinkedIds = computed(() => {
  const ids = new Set<string>()
  const selected = store.selectedNodeId
  if (!selected) return ids
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
  const sourceLink = store.sourceToO0.find(link => link.sourceNodeId === selected)
  sourceLink?.constraintNodeIds.forEach(id => ids.add(id))
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

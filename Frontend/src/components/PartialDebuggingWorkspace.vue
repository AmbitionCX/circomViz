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
            @navigate-signal="navigateToFileStructureSignal"
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
            @navigate-signal="navigateToFileStructureSignal"
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
import { useCircuitStore } from '@/stores/circuit'
import type { TemplateInfo } from '@/types/circuitTypes'

const store = usePartialDebuggingStore()
const circuitStore = useCircuitStore()

const findTemplateSourceFile = (templateName: string) => {
  const root = circuitStore.parseData.tree
  if (!root) return undefined
  const queue: TemplateInfo[] = [root]
  const visited = new Set<TemplateInfo>()
  while (queue.length) {
    const template = queue.shift()!
    if (visited.has(template)) continue
    visited.add(template)
    if (template.templateName === templateName) return template.sourceFile
    for (const component of template.components) {
      if (component.template) queue.push(component.template)
    }
  }
  return undefined
}

const navigateToFileStructureSignal = (nodeId: string) => {
  const sourceNodes = store.sourceGraph?.nodes ?? []
  const sourceSignal = sourceNodes.find(node => node.id === nodeId && node.kind === 'signal')
  const constraintSignal = store.activeConstraintGraph?.signals.find(signal => signal.id === nodeId)
  const qualifiedName = sourceSignal?.qualifiedName ?? constraintSignal?.qualifiedName
  if (!qualifiedName) return

  const owner = sourceNodes
    .filter(node => node.kind === 'component-group' && node.componentPath && node.templateName)
    .filter(node => qualifiedName.startsWith(`${node.componentPath}.`))
    .sort((left, right) => (right.componentPath?.length ?? 0) - (left.componentPath?.length ?? 0))[0]
  if (!owner?.componentPath || !owner.templateName) return

  const declaredSignalName = qualifiedName
    .slice(owner.componentPath.length + 1)
    .replace(/\[.*$/, '')
  if (!declaredSignalName || declaredSignalName.includes('.')) return

  const sourceFile = findTemplateSourceFile(owner.templateName)
    ?? (owner.componentPath === 'main' ? sourceSignal?.sourceSpan?.file : undefined)
  circuitStore.highlightSignal(sourceFile, owner.templateName, declaredSignalName)
}

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

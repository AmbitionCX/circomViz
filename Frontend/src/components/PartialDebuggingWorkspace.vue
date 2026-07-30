<template>
  <section class="debug-workspace">
    <el-alert v-if="store.error" :title="store.error" type="error" :closable="false" show-icon />
    <div v-if="store.loading && !store.sourceGraph" class="workspace-loading"><el-icon class="is-loading"><Loading /></el-icon><span>Building linked graph views...</span></div>
    <el-empty v-else-if="!store.summary" description="Confirm a template to build the Source Semantics Graph and R1CS Enforcement" :image-size="70" />

    <template v-else>
      <el-row class="graph-columns" :gutter="8">
        <el-col
          :xs="sourceColumnSpan"
          :sm="sourceColumnSpan"
          :class="['graph-column', { 'is-collapsed': viewMode === 'constraint' }]"
        >
          <PartialDebuggingGraph
            graph-kind="source"
            :show-legend="viewMode !== 'constraint'"
            :source-graph="store.sourceGraph"
            :selected-node-id="store.selectedNodeId"
            :hovered-node-id="store.hoveredNodeId"
            :diagnostics="store.diagnostics"
            :linked-node-ids="sourceLinkedIds"
            :mirrored-node-ids="sourceMirroredIds"
            @select="store.selectNode"
            @hover="store.hoveredNodeId = $event"
            @navigate-signal="navigateToFileStructureSignal"
            @activate-view="emit('select-view', $event)"
          />
        </el-col>
        <el-col
          :xs="constraintColumnSpan"
          :sm="constraintColumnSpan"
          :class="['graph-column', { 'is-collapsed': viewMode === 'source' }]"
        >
          <PartialDebuggingGraph
            graph-kind="constraint"
            :show-legend="viewMode !== 'source'"
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
            @activate-view="emit('select-view', $event)"
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

type GraphViewMode = 'source' | 'compare' | 'constraint'

const props = withDefaults(defineProps<{ viewMode?: GraphViewMode }>(), { viewMode: 'compare' })
const emit = defineEmits<{ 'select-view': [view: 'source' | 'constraint'] }>()
const viewMode = computed(() => props.viewMode)
const sourceColumnSpan = computed(() => viewMode.value === 'source' ? 22 : viewMode.value === 'constraint' ? 2 : 12)
const constraintColumnSpan = computed(() => viewMode.value === 'constraint' ? 22 : viewMode.value === 'source' ? 2 : 12)

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
  const constraintGroup = store.activeConstraintGraph?.signalGroups.find(group => group.id === nodeId)
  const groupedSourceSignal = constraintGroup ? sourceNodes.find(node => node.id === constraintGroup.sourceNodeId) : undefined
  const qualifiedName = sourceSignal?.qualifiedName ?? groupedSourceSignal?.qualifiedName ?? constraintSignal?.qualifiedName ?? constraintGroup?.displayQualifiedName
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
    ?? (owner.componentPath === 'main' ? groupedSourceSignal?.sourceSpan?.file ?? sourceSignal?.sourceSpan?.file : undefined)
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

const constraintSignalNames = computed(() => new Map([
  ...(store.activeConstraintGraph?.signals ?? []).map(signal => [signal.id, signal.qualifiedName] as const),
  ...(store.activeConstraintGraph?.signalGroups ?? []).map(group => [group.id, group.displayQualifiedName] as const),
]))

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
  const constraintGraph = store.activeConstraintGraph
  const sourceGraph = store.sourceGraph
  const selectedCluster = constraintGraph?.loopClusters.find(cluster => cluster.id === selected)
  if (selectedCluster) {
    ids.add(selectedCluster.sourceLoopId)
    sourceGraph?.statements
      .filter(statement => statement.loopId === selectedCluster.sourceLoopId)
      .forEach(statement => ids.add(statement.id))
  }
  if (selected.startsWith('constraint:')) {
    (constraintGraph?.adjacency[selected] ?? []).filter(id => id.startsWith('signal:')).forEach(id => {
      const group = constraintGraph?.signalGroups.find(candidate => candidate.memberSignalNodeIds.includes(id))
      ids.add(group?.sourceNodeId ?? id)
    })
  }
  store.sourceToO0.filter(link => link.constraintNodeIds.includes(selected)).forEach(link => {
    ids.add(link.sourceNodeId)
    const sourceNode = sourceGraph?.nodes.find(node => node.id === link.sourceNodeId)
    if (sourceNode?.loopId) ids.add(sourceNode.loopId)
    if (sourceNode?.statementId) ids.add(sourceNode.statementId)
  })
  return ids
})

const constraintLinkedIds = computed(() => {
  const ids = new Set<string>()
  const selected = store.selectedNodeId
  if (!selected) return ids
  const sourceGraph = store.sourceGraph
  const constraintGraph = store.activeConstraintGraph
  const selectedLoop = sourceGraph?.loops.find(loop => loop.id === selected)
  const selectedStatement = sourceGraph?.statements.find(statement => statement.id === selected)
  const sourceNodeIds = new Set<string>(selectedStatement?.nodeIds ?? [selected])
  if (selectedLoop) {
    sourceGraph?.statements
      .filter(statement => statement.loopId === selectedLoop.id)
      .flatMap(statement => statement.nodeIds)
      .forEach(nodeId => sourceNodeIds.add(nodeId))
  }
  for (const link of store.sourceToO0) {
    if (!sourceNodeIds.has(link.sourceNodeId)) continue
    link.constraintNodeIds.forEach(id => ids.add(id))
  }
  for (const cluster of constraintGraph?.loopClusters ?? []) {
    if (selectedLoop?.id === cluster.sourceLoopId || cluster.constraintNodeIds.some(id => ids.has(id))) {
      ids.add(cluster.id)
      cluster.constraintNodeIds.forEach(id => ids.add(id))
    }
  }
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

.graph-column {
  min-width: 0;
  transition: flex-basis 220ms ease, max-width 220ms ease;
}

.graph-column.is-collapsed {
  overflow: hidden;
}

@media (max-width: 900px) {
  .graph-columns { margin-left: 0 !important; margin-right: 0 !important; }
  :deep(.el-col) { padding-left: 0 !important; padding-right: 0 !important; }
}
</style>

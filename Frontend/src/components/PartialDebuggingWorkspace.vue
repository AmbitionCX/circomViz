<template>
  <section class="debug-workspace">
    <el-alert v-if="store.error" :title="store.error" type="error" :closable="false" show-icon />
    <div v-if="store.loading && !store.sourceGraph" class="workspace-loading"><el-icon class="is-loading"><Loading /></el-icon><span>Building linked graph views...</span></div>
    <el-empty v-else-if="!store.summary" description="Confirm a template to build the Source Semantics Graph and Constraint Enforcement" :image-size="70" />

    <template v-else>
      <el-row :class="['graph-columns', { 'has-issues': store.analysisLoading || store.lastIntent, 'has-expanded-issue': activeIssue }]" :gutter="8">
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
            :linked-node-ids="sourceLinkedIds"
            :mirrored-node-ids="sourceMirroredIds"
            :issue-node-ids="sourceIssueNodeIds"
            :issue-edge-ids="sourceIssueEdgeIds"
            :active-issue-node-ids="activeSourceIssueNodeIds"
            :active-issue-edge-ids="activeSourceIssueEdgeIds"
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
            :render-mode="store.renderMode"
            :focus-node-ids="constraintFocusNodeIds"
            :selected-node-id="store.selectedNodeId"
            :hovered-node-id="store.hoveredNodeId"
            :linked-node-ids="constraintLinkedIds"
            :mirrored-node-ids="constraintMirroredIds"
            :signal-role-overrides="sourceSignalRoles"
            :issue-node-ids="constraintIssueNodeIds"
            :active-issue-node-ids="activeConstraintIssueNodeIds"
            @select="store.selectNode"
            @hover="store.hoveredNodeId = $event"
            @navigate-signal="navigateToFileStructureSignal"
            @activate-view="emit('select-view', $event)"
            @change-render-mode="store.renderMode = $event"
          />
        </el-col>
      </el-row>

      <aside v-if="store.analysisLoading || store.lastIntent" class="issue-rail" aria-label="Issues">
        <strong class="issue-rail-label">Issues</strong>
        <div v-if="store.analysisLoading" class="issue-rail-loading">
          <el-icon class="is-loading"><Loading /></el-icon>
        </div>
        <div v-else class="issue-dots">
          <button
            v-for="issue in store.issues"
            :key="issue.id"
            type="button"
            :class="['issue-dot', 'severity-' + issue.severity, issue.resolution, { active: store.activeIssueId === issue.id }]"
            :aria-label="'Toggle ' + issue.severity + ' severity issue: ' + issue.title"
            :aria-expanded="store.activeIssueId === issue.id"
            @click="openIssue(issue)"
          >
            <span class="sr-only">{{ issue.title }}</span>
          </button>
        </div>
      </aside>

      <article
        v-if="activeIssue"
        :class="['issue-detail', activeIssue.resolution]"
      >
        <div class="issue-card-heading">
          <el-tag :type="issueSeverityType(activeIssue.severity)" size="small">{{ activeIssue.severity }}</el-tag>
          <span>{{ activeIssue.kind }}</span>
          <span class="issue-anchor-label">{{ activeIssue.anchors[0]?.view }} · {{ activeIssue.anchors[0]?.type }}</span>
        </div>
        <h3>{{ activeIssue.title }}</h3>
        <dl class="issue-comparison">
          <div class="expected"><dt>Expected</dt>{{ activeIssue.expected }}</div>
          <div class="observed"><dt>Observed</dt>{{ activeIssue.observed }}</div>
        </dl>
        <p class="issue-explanation">{{ activeIssue.explanation }}</p>
        <p v-if="activeIssue.followUpQuestion" class="follow-up">{{ activeIssue.followUpQuestion }}</p>
        <div class="issue-actions">
          <el-button size="small" text type="danger" @click.stop="setResolution(activeIssue.id, 'confirmed')">Confirm issue</el-button>
          <el-button size="small" text @click.stop="setResolution(activeIssue.id, 'dismissed')">Dismiss</el-button>
        </div>
      </article>
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
import type { IssueCard, IssueResolution } from '@/types/partialDebugging'

type GraphViewMode = 'source' | 'compare' | 'constraint'

const props = withDefaults(defineProps<{ viewMode?: GraphViewMode }>(), { viewMode: 'compare' })
const emit = defineEmits<{ 'select-view': [view: 'source' | 'constraint'] }>()
const viewMode = computed(() => props.viewMode)
const sourceColumnSpan = computed(() => viewMode.value === 'source' ? 22 : viewMode.value === 'constraint' ? 2 : 12)
const constraintColumnSpan = computed(() => viewMode.value === 'constraint' ? 22 : viewMode.value === 'source' ? 2 : 12)

const store = usePartialDebuggingStore()
const circuitStore = useCircuitStore()
const activeIssue = computed(() => store.activeIssue)

const attentionAnchors = (graphView: 'source' | 'r1cs', activeOnly = false) => {
  const nodes = new Set<string>()
  const edges = new Set<string>()
  const visibleIssues = store.issues.filter(
    issue => issue.resolution === 'open' || issue.resolution === 'confirmed',
  )
  const issues = activeOnly
    ? visibleIssues.filter(issue => issue.id === store.activeIssueId)
    : visibleIssues
  for (const issue of issues) {
    for (const anchor of issue.anchors.filter(candidate => candidate.view === graphView)) {
      if (anchor.type === 'edge') edges.add(anchor.id)
      else if (anchor.type !== 'ghost') nodes.add(anchor.id)
      anchor.relatedNodeIds?.forEach(nodeId => nodes.add(nodeId))
    }
  }
  return { nodes, edges }
}

const sourceIssueNodeIds = computed(() => attentionAnchors('source').nodes)
const sourceIssueEdgeIds = computed(() => attentionAnchors('source').edges)
const constraintIssueNodeIds = computed(() => attentionAnchors('r1cs').nodes)
const activeSourceIssueNodeIds = computed(() => attentionAnchors('source', true).nodes)
const activeSourceIssueEdgeIds = computed(() => attentionAnchors('source', true).edges)
const activeConstraintIssueNodeIds = computed(() => attentionAnchors('r1cs', true).nodes)
const constraintFocusNodeIds = computed(() => {
  if (!activeIssue.value) return new Set<string>()
  return new Set([...activeConstraintIssueNodeIds.value, ...constraintLinkedIds.value])
})

const issueSeverityType = (severity: IssueCard['severity']) =>
  severity === 'high' ? 'danger' : severity === 'medium' ? 'warning' : 'info'

const openIssue = (issue: IssueCard) => {
  if (store.activeIssueId === issue.id) {
    store.selectIssue(null)
    return
  }
  store.selectIssue(issue.id)
  const primary = issue.anchors[0]
  if (primary) emit('select-view', primary.view === 'r1cs' ? 'constraint' : 'source')
}

const setResolution = (issueId: string, resolution: IssueResolution) => {
  store.setIssueResolution(issueId, resolution)
}

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
    .filter(node => qualifiedName.startsWith(node.componentPath + '.'))
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
    const qualifiedName = node.qualifiedName ?? (node.componentPath && node.localName ? node.componentPath + '.' + node.localName : undefined)
    if (qualifiedName) roles.set(qualifiedName, node.role)
  }
  return roles
})

const sourceSignalNames = computed(() => {
  const names = new Map<string, string>()
  for (const node of store.sourceGraph?.nodes ?? []) {
    if (node.kind !== 'signal') continue
    const qualifiedName = node.qualifiedName ?? (node.componentPath && node.localName ? node.componentPath + '.' + node.localName : undefined)
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
  position: relative;
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

.graph-columns.has-issues {
  margin-right: 60px !important;
}

.graph-columns.has-expanded-issue {
  margin-right: 408px !important;
}

.graph-column {
  min-width: 0;
  transition: flex-basis 220ms ease, max-width 220ms ease;
}

.graph-column.is-collapsed {
  overflow: hidden;
}

.issue-rail {
  position: absolute;
  z-index: 36;
  top: 0;
  right: 0;
  bottom: 0;
  width: 52px;
  overflow-y: auto;
  padding: 10px 7px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 12px;
}

.issue-card-heading,
.issue-actions {
  display: flex;
  align-items: center;
}


.issue-rail-label {
  color: #475569;
  font-size: 11px;
  line-height: 1;
}

.issue-rail-loading {
  display: flex;
  color: #64748b;
}

.issue-dots {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 13px;
  width: 100%;
}

.issue-dot {
  appearance: none;
  width: 14px;
  height: 14px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #64748b;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease, opacity 150ms ease;
  flex: 0 0 auto;
}

.issue-dot:hover,
.issue-dot:focus-visible {
  transform: scale(1.2);
  outline: 2px solid #fff;
  outline-offset: 2px;
}

.issue-dot.severity-high {
  background: #dc2626;
}

.issue-dot.severity-medium {
  background: #f97316;
}

.issue-dot.severity-low {
  background: #3b82f6;
}

.issue-dot.active {
  box-shadow: 0 0 0 3px #fff, 0 0 0 5px #334155;
  transform: scale(1.08);
}

.issue-dot.dismissed {
  opacity: 0.42;
}

.issue-detail {
  position: absolute;
  z-index: 35;
  top: 0;
  right: 60px;
  bottom: 0;
  width: 340px;
  overflow-y: auto;
  padding: 16px;
  font-size: 13px;
  border: 1px solid #e2e8f0;
  border-left: 4px solid #d97706;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
}


.issue-detail.dismissed {
  border-left-color: #94a3b8;
  opacity: 0.6;
}

.issue-detail.confirmed {
  border-left-color: #dc2626;
}

.issue-card-heading {
  gap: 6px;
  color: #64748b;
  font-size: 12px;
}

.issue-anchor-label {
  margin-left: auto;
  text-transform: uppercase;
}

.issue-detail h3 {
  margin: 10px 0 8px;
  color: #27352f;
  font-size: 16px;
}


.issue-comparison .expected {
  background: #f0fdf4;
  border-left-color: #16a34a;
}

.issue-comparison .observed {
  background: #fff7ed;
  border-left-color: #f97316;
}

.issue-comparison .expected dt {
  color: #15803d;
}

.issue-comparison .observed dt {
  color: #c2410c;
}

.issue-detail .issue-explanation {
  color: #475569;
  font-weight: 300;
}

.issue-detail p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.55;
}

.issue-detail dl {
  display: grid;
  gap: 9px;
  margin: 12px 0;
}

.issue-detail dl > div {
  padding: 10px;
  border-radius: 7px;
  border-left: 3px solid transparent;
  background: #f8fafc;
}

.issue-detail dt {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.issue-detail dd {
  margin: 4px 0 0;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
}

.issue-detail .follow-up {
  margin-top: 12px;
  padding: 10px;
  background: #fff7ed;
  color: #9a5d08;
  font-weight: 600;
}

.issue-actions {
  justify-content: flex-end;
  gap: 2px;
  margin-top: 12px;
}

.issue-actions :deep(.el-button) {
  margin-left: 0;
  padding: 6px;
  font-size: 12px;
}

@media (max-width: 900px) {
  .graph-columns { margin-left: 0 !important; margin-right: 0 !important; }
  :deep(.el-col) { padding-left: 0 !important; padding-right: 0 !important; }
  .issue-rail {
    width: 44px;
    padding-inline: 5px;
  }
  .issue-detail {
    right: 52px;
    width: min(340px, calc(100% - 60px));
  }
}
</style>

import { defineStore } from 'pinia'
import { getPartialDebuggingConstraintGraph, getPartialDebuggingSourceGraph } from '@/apis/partialDebugging'
import type { ConstraintGraphDto, ConstraintRenderMode, GraphDiagnostic, PartialDebuggingBuildSummary, ProvenanceLink, SourceGraphDto } from '@/types/partialDebugging'

interface PartialDebuggingState {
  summary: PartialDebuggingBuildSummary | null
  sourceGraph: SourceGraphDto | null
  constraintGraph: ConstraintGraphDto | null
  sourceToO0: ProvenanceLink[]
  diagnostics: GraphDiagnostic[]
  renderMode: ConstraintRenderMode
  selectedNodeId: string | null
  hoveredNodeId: string | null
  searchTerm: string
  onlyWarnings: boolean
  loading: boolean
  error: string | null
}

export const usePartialDebuggingStore = defineStore('partialDebugging', {
  state: (): PartialDebuggingState => ({
    summary: null,
    sourceGraph: null,
    constraintGraph: null,
    sourceToO0: [],
    diagnostics: [],
    renderMode: 'exact',
    selectedNodeId: null,
    hoveredNodeId: null,
    searchTerm: '',
    onlyWarnings: false,
    loading: false,
    error: null,
  }),
  getters: {
    activeConstraintGraph: (state) => state.constraintGraph,
  },
  actions: {
    async setSummary(summary: PartialDebuggingBuildSummary | null) {
      this.summary = summary
      this.sourceGraph = null
      this.constraintGraph = null
      this.sourceToO0 = []
      this.diagnostics = summary?.diagnostics ?? []
      this.selectedNodeId = null
      this.error = null
      if (!summary) return
      this.loading = true
      try {
        await Promise.all([this.loadSourceGraph(), this.loadConstraintGraph()])
      } catch (error: any) {
        this.error = error?.message ?? 'Unable to load Partial Debugging graphs'
      } finally {
        this.loading = false
      }
    },
    async loadSourceGraph() {
      if (!this.summary || this.sourceGraph) return
      this.sourceGraph = await getPartialDebuggingSourceGraph(this.summary.buildId)
    },
    async loadConstraintGraph() {
      if (!this.summary || this.constraintGraph) return
      const response = await getPartialDebuggingConstraintGraph(this.summary.buildId)
      this.constraintGraph = response.graph
      this.sourceToO0 = response.mappings.sourceToO0
      this.diagnostics = response.diagnostics
    },
    selectNode(nodeId: string | null) { this.selectedNodeId = nodeId },
  },
})

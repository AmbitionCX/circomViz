import { defineStore } from 'pinia'
import { getPartialDebuggingConstraintGraph, getPartialDebuggingSourceGraph } from '@/apis/partialDebugging'
import type { ConstraintGraphDto, ConstraintRenderMode, GraphDiagnostic, OptimizationLevel, OptimizationLink, PartialDebuggingBuildSummary, ProvenanceLink, SourceGraphDto } from '@/types/partialDebugging'

interface PartialDebuggingState {
  summary: PartialDebuggingBuildSummary | null
  sourceGraph: SourceGraphDto | null
  constraintGraphs: Partial<Record<OptimizationLevel, ConstraintGraphDto>>
  sourceToO0: ProvenanceLink[]
  optimizationLinks: Partial<Record<'O0ToO1' | 'O1ToO2', OptimizationLink[]>>
  diagnostics: GraphDiagnostic[]
  optimization: OptimizationLevel
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
    constraintGraphs: {},
    sourceToO0: [],
    optimizationLinks: {},
    diagnostics: [],
    optimization: 'O1',
    renderMode: 'exact',
    selectedNodeId: null,
    hoveredNodeId: null,
    searchTerm: '',
    onlyWarnings: false,
    loading: false,
    error: null,
  }),
  getters: {
    activeConstraintGraph: (state) => state.constraintGraphs[state.optimization] ?? null,
  },
  actions: {
    async setSummary(summary: PartialDebuggingBuildSummary | null) {
      this.summary = summary
      this.sourceGraph = null
      this.constraintGraphs = {}
      this.sourceToO0 = []
      this.diagnostics = summary?.diagnostics ?? []
      this.selectedNodeId = null
      this.error = null
      if (!summary) return
      this.loading = true
      try {
        await Promise.all([this.loadSourceGraph(), this.loadConstraintGraph(this.optimization)])
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
    async loadConstraintGraph(level: OptimizationLevel) {
      if (!this.summary || this.constraintGraphs[level]) return
      const response = await getPartialDebuggingConstraintGraph(this.summary.buildId, level)
      this.constraintGraphs[level] = response.graph
      this.sourceToO0 = response.mappings.sourceToO0
      this.optimizationLinks = { O0ToO1: response.mappings.O0ToO1, O1ToO2: response.mappings.O1ToO2 }
      this.diagnostics = response.diagnostics
    },
    async setOptimization(level: OptimizationLevel) {
      this.optimization = level
      this.loading = true
      try { await this.loadConstraintGraph(level) }
      catch (error: any) { this.error = error?.message ?? `Unable to load ${level}` }
      finally { this.loading = false }
    },
    selectNode(nodeId: string | null) { this.selectedNodeId = nodeId },
  },
})

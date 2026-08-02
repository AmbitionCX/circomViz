import { defineStore } from 'pinia'
import { analyzePartialDebuggingTemplate, getPartialDebuggingConstraintGraph, getPartialDebuggingSourceGraph } from '@/apis/partialDebugging'
import type { ConstraintGraphDto, ConstraintRenderMode, GraphDiagnostic, IssueCard, IssueResolution, PartialDebuggingBuildSummary, ProvenanceLink, SourceGraphDto } from '@/types/partialDebugging'

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
  issues: IssueCard[]
  analysisSummary: string
  analysisProvider: string
  analysisWarning: string | null
  analysisLoading: boolean
  analysisError: string | null
  activeIssueId: string | null
  lastIntent: string
}

export const usePartialDebuggingStore = defineStore('partialDebugging', {
  state: (): PartialDebuggingState => ({
    summary: null,
    sourceGraph: null,
    constraintGraph: null,
    sourceToO0: [],
    diagnostics: [],
    issues: [],
    analysisSummary: '',
    analysisProvider: '',
    analysisWarning: null,
    analysisLoading: false,
    analysisError: null,
    activeIssueId: null,
    lastIntent: '',
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
    activeIssue: (state) => state.issues.find(issue => issue.id === state.activeIssueId) ?? null,
  },
  actions: {
    async setSummary(summary: PartialDebuggingBuildSummary | null) {
      this.summary = summary
      this.sourceGraph = null
      this.constraintGraph = null
      this.sourceToO0 = []
      this.diagnostics = summary?.diagnostics ?? []
      this.selectedNodeId = null
      this.issues = []
      this.analysisSummary = ''
      this.analysisProvider = ''
      this.analysisWarning = null
      this.analysisError = null
      this.activeIssueId = null
      this.lastIntent = ''
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
    async analyzeIntent(intent: string) {
      if (!this.summary) return false
      this.analysisLoading = true
      this.analysisError = null
      this.analysisWarning = null
      try {
        const response = await analyzePartialDebuggingTemplate(this.summary.buildId, intent)
        this.issues = response.issues
        this.analysisSummary = response.summary
        this.analysisProvider = response.provider + ' / ' + response.model
        this.analysisWarning = response.warning ?? null
        this.lastIntent = response.intent
        this.activeIssueId = null
        return true
      } catch (error: any) {
        this.analysisError = error?.response?.data?.error ?? error?.message ?? 'Unable to analyze template intent'
        return false
      } finally {
        this.analysisLoading = false
      }
    },
    selectIssue(issueId: string | null) {
      this.activeIssueId = issueId
      const issue = this.issues.find(candidate => candidate.id === issueId)
      const anchor = issue?.anchors[0]
      this.selectedNodeId = anchor
        ? anchor.type === 'node' || anchor.type === 'family'
          ? anchor.id
          : anchor.relatedNodeIds?.[0] ?? null
        : null
    },
    setIssueResolution(issueId: string, resolution: IssueResolution) {
      const issue = this.issues.find(candidate => candidate.id === issueId)
      if (issue) issue.resolution = resolution
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

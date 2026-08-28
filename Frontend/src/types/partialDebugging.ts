export type OptimizationLevel = 'O0'
export type ConstraintRenderMode = 'overview' | 'focus' | 'exact'

export interface SourceSpan { file: string; startLine: number; endLine: number }
export interface SourceGraphNode {
  id: string
  kind: 'signal' | 'variable' | 'constant' | 'operation' | 'ternary-condition' | 'ternary-result' | 'assignment' | 'source-constraint' | 'component-group'
  label: string
  qualifiedName?: string
  localName?: string
  arrayDimensions?: string[]
  declaredArrayDimensions?: string[]
  arrayBaseQualifiedName?: string
  initialExpression?: string
  initialValue?: number
  loopVariable?: boolean
  loopId?: string
  statementId?: string
  stateVariable?: string
  statePhase?: 'initial' | 'current' | 'next' | 'final'
  role?: 'input' | 'output' | 'intermediate' | 'mock-input' | 'mock-output'
  templateName?: string
  componentPath?: string
  operation?: string
  operator?: '<==' | '==>' | '<--' | '-->' | '===' | '='
  leftExpression?: string
  rightExpression?: string
  generatesWitness?: boolean
  generatesConstraint?: boolean
  dangerLevel?: 'safe' | 'review'
  mocked?: boolean
  childNodeIds?: string[]
  conditionalId?: string
  conditionalBranch?: 'then' | 'else'
  compileActivity?: 'active' | 'inactive' | 'unknown'
  sourceSpan?: SourceSpan
}
export interface SourceGraphEdge { id: string; source: string; target: string; kind: string; operandIndex?: number; operator?: string; label?: string; accessExpression?: string }
export interface SourceStatementDto {
  id: string; loopId?: string; order: number; kind: 'component' | 'witness' | 'constraint' | 'state-update' | 'other'
  label: string; nodeIds: string[]; conditionalId?: string; conditionalBranch?: 'then' | 'else'
  compileActivity?: 'active' | 'inactive' | 'unknown'; sourceSpan: SourceSpan
}
export interface SourceLoopStateDto { variableName: string; initialNodeId: string; currentNodeId: string; nextNodeId: string; finalNodeId: string }
export interface SourceLoopDto { id: string; header: string; iterator: string; iterationLabel: string; iterationCount?: number; parentLoopId?: string; bodyStatementIds: string[]; stateVariables: SourceLoopStateDto[]; sourceSpan: SourceSpan }
export interface SourceBranchCoverageDto {
  status: 'active' | 'inactive' | 'unknown'; iterationCount?: number; totalIterations?: number
  iterator?: string; iteratorValues?: number[]; valuesTruncated?: boolean
}
export interface SourceConditionalDto {
  id: string; condition: string; order: number; parentLoopId?: string; parentConditionalId?: string
  parentBranch?: 'then' | 'else'; hasElse: boolean; thenStatementIds: string[]; elseStatementIds: string[]
  thenCoverage: SourceBranchCoverageDto; elseCoverage: SourceBranchCoverageDto; sourceSpan: SourceSpan
}
export interface SourceGraphDto { nodes: SourceGraphNode[]; edges: SourceGraphEdge[]; adjacency: Record<string, string[]>; loops: SourceLoopDto[]; statements: SourceStatementDto[]; conditionals?: SourceConditionalDto[] }

export interface LinearCombinationTerm { signalId: number; coefficient: string; displayCoefficient: string }
export interface LinearCombination { terms: LinearCombinationTerm[] }
export type ConstraintExpressionDto =
  | { kind: 'signal'; signalId: number }
  | { kind: 'constant'; value: string }
  | { kind: 'add' | 'mul'; operands: ConstraintExpressionDto[] }
export interface ConstraintEquationDto {
  left: ConstraintExpressionDto
  right: ConstraintExpressionDto
  isolatedSignalId?: number
}
export interface ConstraintNodeDto {
  id: string; kind: 'constraint'; optimization: OptimizationLevel; index: number
  A: LinearCombination; B: LinearCombination; C: LinearCombination
  equation: ConstraintEquationDto
  canonicalFingerprint: string; complexity: 'linear' | 'simple-mul' | 'general-r1cs'
}
export interface ConstraintSignalNodeDto {
  id: string; kind: 'signal'; signalId: number; witnessIndex: number; componentId: number; qualifiedName: string
  status: 'surviving' | 'substituted' | 'unused-or-unconstrained'; substitution?: LinearCombination
  role?: 'input' | 'output' | 'intermediate' | 'synthetic'
  mockSupplied?: boolean
}
export interface ConstraintSignalGroupDto {
  id: string
  sourceNodeId: string
  displayQualifiedName: string
  arrayDimensions: string[]
  memberSignalNodeIds: string[]
  memberSignalIds: number[]
  role?: 'input' | 'output' | 'intermediate' | 'synthetic'
  status: 'surviving' | 'substituted' | 'unused-or-unconstrained'
  mockSupplied?: boolean
}
export interface ConstraintEdgeDto { id: string; signalNodeId: string; constraintNodeId: string; port: 'A' | 'B' | 'C'; coefficient: string; displayCoefficient: string }
export interface ConstraintLoopClusterDto { id: string; sourceLoopId: string; label: string; constraintNodeIds: string[]; confidence: 'high' | 'medium' | 'low' }
export interface MockBoundaryDto { id: string; outputSignalId: string; label: string }
export interface ConstraintGraphDto { level: OptimizationLevel; signals: ConstraintSignalNodeDto[]; constraints: ConstraintNodeDto[]; edges: ConstraintEdgeDto[]; adjacency: Record<string, string[]>; signalGroups: ConstraintSignalGroupDto[]; loopClusters: ConstraintLoopClusterDto[]; mockBoundaries: MockBoundaryDto[] }
export interface ProvenanceLink { sourceNodeId: string; constraintNodeIds: string[]; confidence: 'exact' | 'high' | 'medium' | 'low'; evidence: string[] }
export interface GraphDiagnostic { id: string; type: string; severity: 'high' | 'medium' | 'low'; message: string; nodeIds: string[] }
export interface PartialDebuggingBuildSummary {
  buildId: string
  compiler: { version: string; prime: string; actualOptimization?: OptimizationLevel }
  selectedComponentPath: string
  mockManifest: { selectedRoot: string; mocks: Array<{ instancePath: string; originalTemplate: string; mockedTemplate: string; boundaryInputs: string[]; boundaryOutputs: string[]; syntheticSignals: Array<{ path: string; role: 'root-mock-input' | 'mock-bridge'; forOutput: string }> }> }
  stats: { sourceSignals: number; sourceOperations: number; constraints: Record<OptimizationLevel, number>; survivingSignals: Record<OptimizationLevel, number>; substitutedSignals: Record<OptimizationLevel, number> }
  diagnostics: GraphDiagnostic[]
}
export interface ConstraintGraphResponse {
  graph: ConstraintGraphDto
  mappings: { sourceToO0: ProvenanceLink[] }
  diagnostics: GraphDiagnostic[]
}

export type IssueSeverity = 'high' | 'medium' | 'low'
export type IssueResolution = 'open' | 'confirmed' | 'dismissed'
export interface IssueAnchor {
  view: 'source' | 'r1cs'
  type: 'node' | 'edge' | 'family' | 'ghost'
  id: string
  relatedNodeIds?: string[]
}
export interface IssueCard {
  id: string
  kind: string
  title: string
  explanation: string
  severity: IssueSeverity
  confidence: 'deterministic' | 'high' | 'medium' | 'low'
  anchors: IssueAnchor[]
  observed: string
  expected: string
  evidenceIds: string[]
  followUpQuestion?: string
  resolution: IssueResolution
  source: 'detector' | 'llm' | 'detector+llm'
}
export interface TemplateAttentionAnalysisResponse {
  intent: string
  summary: string
  issues: IssueCard[]
  provider: 'deepseek'
  model: string
  warning?: string
}

export type OptimizationLevel = 'O0'
export type ConstraintRenderMode = 'intuitive' | 'exact'

export interface SourceSpan { file: string; startLine: number; endLine: number }
export interface SourceGraphNode {
  id: string
  kind: 'signal' | 'constant' | 'operation' | 'ternary-condition' | 'ternary-result' | 'assignment' | 'source-constraint' | 'component-group'
  label: string
  qualifiedName?: string
  localName?: string
  role?: 'input' | 'output' | 'intermediate' | 'mock-input' | 'mock-output'
  templateName?: string
  componentPath?: string
  operation?: string
  operator?: '<==' | '==>' | '<--' | '-->' | '==='
  generatesWitness?: boolean
  generatesConstraint?: boolean
  dangerLevel?: 'safe' | 'review'
  mocked?: boolean
  childNodeIds?: string[]
  sourceSpan?: SourceSpan
}
export interface SourceGraphEdge { id: string; source: string; target: string; kind: string; operandIndex?: number; operator?: string; label?: string }
export interface SourceGraphDto { nodes: SourceGraphNode[]; edges: SourceGraphEdge[]; adjacency: Record<string, string[]> }

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
export interface ConstraintEdgeDto { id: string; signalNodeId: string; constraintNodeId: string; port: 'A' | 'B' | 'C'; coefficient: string; displayCoefficient: string }
export interface MockBoundaryDto { id: string; outputSignalId: string; label: string }
export interface ConstraintGraphDto { level: OptimizationLevel; signals: ConstraintSignalNodeDto[]; constraints: ConstraintNodeDto[]; edges: ConstraintEdgeDto[]; adjacency: Record<string, string[]>; mockBoundaries: MockBoundaryDto[] }
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

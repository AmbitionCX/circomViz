export interface SignalRef {
  index: number;
  name: string;
  witness: number;
  component: string;
  classification: 'input' | 'output' | 'intermediate';
}

export interface ComponentGroup {
  prefix: string;
  signalCount: number;
  constraintCount: number;
  inputCount: number;
  outputCount: number;
  intermediateCount: number;
  kindCounts: Record<string, number>;
  childComponents: string[];
}

export interface ArrayFamily {
  baseName: string;
  indices: number[];
  signalIndices: number[];
}

export interface ConstraintIndexData {
  signalToConstraints: Record<string, number[]>;
  constraintToSignals: Record<string, number[]>;
  signalToName: Record<string, string>;
  nameToSignal: Record<string, number>;
  componentToSignals: Record<string, number[]>;
  signalToComponent: Record<string, string>;
  arrayFamilies: ArrayFamily[];
  signalClassification: Record<string, 'input' | 'output' | 'intermediate'>;
  metadata: IndexMetadata;
}

export interface IndexMetadata {
  signalCount: number;
  constraintCount: number;
  componentCount: number;
  arrayFamilyCount: number;
  inputCount: number;
  outputCount: number;
  intermediateCount: number;
  maxComponentDepth: number;
  componentGroups: ComponentGroup[];
  buildTimeMs: number;
}

export type SliceDirection = 'backward' | 'forward' | 'bidirectional';

export interface SliceRequest {
  symPath: string;
  constraintsJsonPath: string;
  direction: SliceDirection;
  targetSignals: string[];
  sourceSignals?: string[];
  maxDepth?: number;
  indexCachePath?: string;
}

export interface SliceResult {
  constraintIndices: number[];
  signalIndices: number[];
  constraintCount: number;
  signalCount: number;
  resolvedConstraints: ResolvedSliceConstraint[];
  componentGroups: ComponentGroup[];
  signals: SignalRef[];
}

export interface ResolvedSliceConstraint {
  index: number;
  formula: string;
  signalsUsed: string[];
  kind: string;
  component: string;
}

export interface SliceResponse {
  success: boolean;
  slice?: SliceResult;
  totalConstraintCount: number;
  totalSignalCount: number;
  reductionPercent: number;
  error?: string;
}

export interface BuildConstraintIndexRequest {
  symPath: string;
  constraintsJsonPath: string;
}

export interface BuildConstraintIndexResponse {
  success: boolean;
  metadata?: IndexMetadata;
  cachePath?: string;
  error?: string;
}

export interface BipartiteGraphRequest {
  symPath: string;
  constraintsJsonPath: string;
  indexCachePath?: string;
}

export interface BipartiteSignalNode {
  id: string;
  index: number;
  name: string;
  shortName: string;
  component: string;
  classification: 'input' | 'output' | 'intermediate';
  witness: number;
  constraintCount: number;
}

export interface BipartiteConstraintCluster {
  id: string;
  kind: string;
  indexRange: string;
  count: number;
  sampleFormula: string;
  signals: string[];
}

export interface BipartiteComponentNode {
  id: string;
  prefix: string;
  label: string;
  signalCount: number;
  constraintCount: number;
  inputCount: number;
  outputCount: number;
  intermediateCount: number;
  kindCounts: Record<string, number>;
  childComponents: string[];
  signals: BipartiteSignalNode[];
  constraints: BipartiteConstraintCluster[];
}

export interface BipartiteGraphEdge {
  source: string;
  target: string;
  weight: number;
  type: 'signal-constraint' | 'component-flow';
}

export interface BipartiteGraphResponse {
  success: boolean;
  components: BipartiteComponentNode[];
  topLevelSignals: BipartiteSignalNode[];
  edges: BipartiteGraphEdge[];
  metadata: IndexMetadata;
  error?: string;
}

export interface SliceCandidate {
  id: string;
  name: string;
  direction: SliceDirection;
  targetSignals: string[];
  sourceSignals: string[];
  groupKind: 'output_array' | 'input_array' | 'output_single' | 'input_single' | 'component' | 'heuristic';
  signalCount: number;
  priority: number;
}

export interface SliceCandidatesRequest {
  symPath: string;
  constraintsJsonPath: string;
}

export interface SliceCandidatesResponse {
  success: boolean;
  candidates: SliceCandidate[];
  error?: string;
}

export interface LinearTerm {
  signal: string;
  signalIndex: number;
  coefficient: string;
}

export interface LinearExpression {
  terms: LinearTerm[];
  constant: string;
}

export interface ConstraintTree {
  index: number;
  kind: string;
  description: string;
  a: LinearExpression;
  b: LinearExpression;
  c: LinearExpression;
}

export interface ConstraintTreesRequest {
  symPath: string;
  constraintsJsonPath: string;
  constraintIndices: number[];
}

export interface ConstraintTreesResponse {
  success: boolean;
  trees: ConstraintTree[];
  error?: string;
}

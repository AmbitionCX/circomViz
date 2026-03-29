export interface SignalRef {
  name: string;
  index: number;
  kind: 'input' | 'output' | 'intermediate';
}

export interface ComponentGroup {
  prefix: string;
  signalIndices: number[];
  constraintCount: number;
  inputCount: number;
  outputCount: number;
  intermediateCount: number;
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
  componentGroups: ComponentGroup[];
  totalSignals: number;
  totalConstraints: number;
  builtAt: number;
}

export interface IndexMetadata {
  totalSignals: number;
  totalConstraints: number;
  componentCount: number;
  arrayFamilyCount: number;
  cachePath: string;
}

export type SliceDirection = 'backward' | 'forward' | 'bidirectional';

export interface SliceRequest {
  symPath: string;
  constraintsJsonPath: string;
  direction: SliceDirection;
  targetSignals: string[];
  sourceSignals?: string[];
  maxDepth?: number;
}

export interface SliceResult {
  constraintIndices: number[];
  signalIndices: number[];
  constraintCount: number;
  signalCount: number;
  totalConstraints: number;
  totalSignals: number;
  reductionPercent: number;
  componentGroups: ComponentGroup[];
  resolvedConstraints: Array<{
    index: number;
    formula: string;
    signalsUsed: string[];
  }>;
}

export interface BuildIndexRequest {
  symPath: string;
  constraintsJsonPath: string;
}

export interface BuildIndexResponse {
  success: boolean;
  metadata: IndexMetadata;
  error?: string;
}

export interface ConeSliceResponse {
  success: boolean;
  slice: SliceResult | null;
  error?: string;
}

export interface ComponentEdge {
  fromComponent: string;
  toComponent: string;
  signalCount: number;
  sharedConstraints: number;
}

export interface ConstraintKindSummary {
  component: string;
  kindCounts: Record<string, number>;
  total: number;
}

export interface BipartiteGraphData {
  componentGroups: ComponentGroup[];
  boundarySignals: SignalRef[];
  constraintSummaries: ConstraintKindSummary[];
  componentEdges: ComponentEdge[];
}

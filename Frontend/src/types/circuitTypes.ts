export type SignalKind = 'input' | 'output' | 'intermediate';

export interface SignalInfo {
  type: 'Signal';
  name: string;
  kind: SignalKind;
  isArray: boolean;
  arraySizes: ArraySize[];
  line: number;
  initialValue?: Expression;
}

export type ArraySize = 
  | { type: 'Identifier'; name: string; line: number }
  | { type: 'Literal'; value: number; line: number }
  | { type: 'FunctionCall'; function: string; arguments: Expression[]; line: number };

export type Expression = 
  | { type: 'Identifier'; name: string; line: number }
  | { type: 'Literal'; value: number | boolean; line: number }
  | { type: 'BinaryOp'; operator: string; left: Expression; right: Expression; line: number }
  | { type: 'MemberAccess'; object: Expression; property: string; line: number }
  | { type: 'FunctionCall'; function: string; arguments: Expression[]; line: number };

export interface TemplateParameter {
  name: string;
  isArray: boolean;
}

export interface ComponentInstance {
  name: string;
  templateName: string;
  arguments: Expression[];
  template: TemplateInfo | null;
}

export interface Statement {
  type: string;
  line: number;
  [key: string]: any;
}

export interface TemplateInfo {
  name: string;
  templateName: string;
  parameters: TemplateParameter[];
  signals: SignalInfo[];
  variables: any[];
  statements: Statement[];
  components: ComponentInstance[];
  sourceFile?: string;
  line?: number;
}

export interface FileSummary {
  id: string;
  path: string;
  displayId: string;
  includes: string[];
}

export interface ParseError {
  level: 'warning' | 'error';
  file?: string;
  message: string;
}

export interface CircuitStatistics {
  totalFiles: number;
  totalTemplates: number;
  totalInstances: number;
  maxDepth: number;
}

export interface ParseCircuitResponse {
  repo: string;
  entry: string;
  files: FileSummary[];
  tree: TemplateInfo;
  errors: ParseError[];
  statistics: CircuitStatistics;
}

export interface CompilationConstraints {
  constraints: string[];
  signals: Record<string, number>;
  templateName: string;
  componentPath: string[];
  wrapperCode?: string;
  symPath?: string;
  constraintsJsonPath?: string;
}

export interface ConstraintVerification {
  constraintIndex: number;
  constraint: string;
  userSpecification: string;
  matches: boolean;
  explanation?: string;
}

export interface TemplateParamCandidate {
  params: { name: string; value: number }[];
  publicSignals: string[];
  location: {
    file: string;
    line: number;
    component: string;
  };
}

export interface FindTemplateParamsResponse {
  templateName: string;
  hasCandidates: boolean;
  candidates: TemplateParamCandidate[];
  templateParams: string[];
  signals: Array<{ name: string; kind: string }>;
}

export interface SatisfiabilityResult {
  satisfiable: boolean;
  model?: Record<string, string>;
  solverOutput: string;
  executionTimeMs: number;
}

export interface DeterminismResult {
  deterministic: boolean;
  counterexample?: {
    input: Record<string, string>;
    output1: Record<string, string>;
    output2: Record<string, string>;
  };
  solverOutput: string;
  executionTimeMs: number;
}

export interface CoverageCheckResult {
  covered: boolean;
  drifts?: Array<{
    signalName: string;
    value1: string;
    value2: string;
  }>;
  solverOutput: string;
  executionTimeMs: number;
}

export interface SoundnessCheckRequest {
  repo: string;
  entry: string;
  symPath: string;
  constraintsJsonPath: string;
  queries: {
    satisfiability?: boolean;
    determinism?: boolean;
    coverage?: {
      signalNames: string[];
      fixedInputs?: Record<string, string | number>;
    };
  };
}

export interface SoundnessCheckResponse {
  success: boolean;
  results: {
    satisfiability?: SatisfiabilityResult;
    determinism?: DeterminismResult;
    coverage?: CoverageCheckResult;
  };
  error?: string;
}

export interface ResolvedConstraint {
  index: number;
  formula: string;
  signalsUsed: string[];
}

export type InvariantKind =
  | 'boolean'
  | 'range_check'
  | 'multiplication'
  | 'addition'
  | 'linear_equality'
  | 'selector_gate'
  | 'decomposition'
  | 'constant_constraint'
  | 'complex'
  | 'zero_constraint';

export interface NormalizedInvariant {
  kind: InvariantKind;
  description: string;
  signals: string[];
  rawFormula: string;
}

export interface SubcomponentCluster {
  prefix: string;
  signals: Array<{ name: string; index: number; witness: number }>;
  publicSignals: string[];
  privateSignals: string[];
  constraintCount: number;
}

export interface InterfaceSummary {
  templateName: string;
  inputs: Array<{ name: string; kind: string }>;
  outputs: Array<{ name: string; kind: string }>;
  publicSignals: string[];
  privateSignals: string[];
  likelyBooleanFlags: string[];
  likelyCommitments: string[];
  likelyHashes: string[];
}

export interface NormalizedContext {
  interfaceSummary: InterfaceSummary;
  subcomponentClusters: SubcomponentCluster[];
  invariantSummary: string;
  representativeInvariants: NormalizedInvariant[];
  totalConstraints: number;
  templateSignature: string;
  callerInfo: string;
}

export interface LLMGroupResult {
  summary: string;
  candidateSpecDSL: string;
  ambiguities: string[];
  riskNotes: string[];
}

export interface IntentAlignmentGroup {
  groupId: string;
  sourceFile: string;
  templateName: string;
  lineRange: [number, number];
  normalizedContext: NormalizedContext;
  sourceSnippet: string;
  metadata: {
    signals: { name: string; kind: string }[];
    subcomponents: { name: string; templateName: string }[];
    parameters: string[];
    comments: string[];
  };
  llmResult: LLMGroupResult | null;
  error?: string;
}

export interface IntentAlignmentRequest {
  repo: string;
  entry: string;
  symPath: string;
  constraintsJsonPath: string;
  templatePath: string[];
  templateName: string;
  groupingStrategy: string;
}

export interface IntentAlignmentResponse {
  success: boolean;
  groups: IntentAlignmentGroup[];
  error?: string;
}

export interface ResolveConstraintsRequest {
  symPath: string;
  constraintsJsonPath: string;
}

export interface ResolveConstraintsResponse {
  success: boolean;
  constraints: ResolvedConstraint[];
  signalCount: number;
  constraintCount: number;
  error?: string;
}

export interface FormalConformanceRequest {
  repo: string;
  entry: string;
  symPath: string;
  constraintsJsonPath: string;
  candidateSpecDSL: string;
  templateName: string;
  templatePath: string[];
  queries: {
    soundness?: boolean;
    completeness?: boolean;
    determinism?: boolean;
    totality?: boolean;
  };
}

export interface FormalConformanceSoundnessResult {
  conformant: boolean;
  violation?: {
    inputValues: Record<string, string>;
    outputValues: Record<string, string>;
    violatedSpec: string;
  };
  solverOutput: string;
  executionTimeMs: number;
  translatedSpecLines: number;
}

export interface FormalConformanceCompletenessResult {
  complete: boolean;
  gap?: {
    inputValues: Record<string, string>;
    specAllowsOutput: string;
    circuitCannotProduce: string;
  };
  solverOutput: string;
  executionTimeMs: number;
}

export interface FormalConformanceDeterminismResult {
  deterministic: boolean;
  counterexample?: {
    input: Record<string, string>;
    output1: Record<string, string>;
    output2: Record<string, string>;
  };
  solverOutput: string;
  executionTimeMs: number;
}

export interface FormalConformanceTotalityResult {
  total: boolean;
  noWitnessInputs?: Array<Record<string, string>>;
  solverOutput: string;
  executionTimeMs: number;
  checkedInputs: number;
}

export interface FormalConformanceResponse {
  success: boolean;
  specTranslation?: {
    assumptions: Array<{
      raw: string;
      signal: string;
      kind: string;
      smt2Lines: string[];
    }>;
    posts: Array<{
      raw: string;
      kind: string;
      lhsSignals: string[];
      rhsSignals: string[];
      smt2Lines: string[];
      parseable: boolean;
    }>;
    invariants: Array<{
      raw: string;
      kind: string;
      smt2Lines: string[];
      parseable: boolean;
    }>;
    parseErrors: string[];
  };
  results?: {
    soundness?: FormalConformanceSoundnessResult;
    completeness?: FormalConformanceCompletenessResult;
    determinism?: FormalConformanceDeterminismResult;
    totality?: FormalConformanceTotalityResult;
  };
  error?: string;
}

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

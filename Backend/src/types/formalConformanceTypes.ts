export interface formal_conformance_request {
  repo: string;
  entry: string;
  symPath: string;
  constraintsJsonPath: string;
  constraintIndices?: number[];
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

export interface SpecTranslation {
  assumptions: Array<{
    raw: string;
    signal: string;
    kind: 'boolean' | 'range' | 'constant';
    params: Record<string, string>;
    smt2Lines: string[];
  }>;
  posts: Array<{
    raw: string;
    kind: 'equality' | 'hash' | 'selector' | 'boolean_gating';
    lhsSignals: string[];
    rhsSignals: string[];
    smt2Lines: string[];
    parseable: boolean;
  }>;
  invariants: Array<{
    raw: string;
    kind: 'boolean' | 'equality' | 'unknown';
    smt2Lines: string[];
    parseable: boolean;
  }>;
  parseErrors: string[];
}

export interface SoundnessConformanceResult {
  conformant: boolean;
  noVerifiableSpec?: boolean;
  violation?: {
    inputValues: Record<string, string>;
    outputValues: Record<string, string>;
    violatedSpec: string;
  };
  solverOutput: string;
  executionTimeMs: number;
  translatedSpecLines: number;
  parseErrors?: string[];
}

export interface CompletenessConformanceResult {
  complete: boolean;
  gap?: {
    inputValues: Record<string, string>;
    specAllowsOutput: string;
    circuitCannotProduce: string;
  };
  solverOutput: string;
  executionTimeMs: number;
}

export interface DeterminismConformanceResult {
  deterministic: boolean;
  counterexample?: {
    input: Record<string, string>;
    output1: Record<string, string>;
    output2: Record<string, string>;
  };
  solverOutput: string;
  executionTimeMs: number;
}

export interface TotalityConformanceResult {
  total: boolean;
  noWitnessInputs?: Array<Record<string, string>>;
  solverOutput: string;
  executionTimeMs: number;
  checkedInputs: number;
}

export interface formal_conformance_response {
  success: boolean;
  specTranslation?: {
    assumptions: Array<{ raw: string; signal: string; kind: string; smt2Lines: string[] }>;
    posts: Array<{ raw: string; kind: string; lhsSignals: string[]; rhsSignals: string[]; smt2Lines: string[]; parseable: boolean }>;
    invariants: Array<{ raw: string; kind: string; smt2Lines: string[]; parseable: boolean }>;
    parseErrors: string[];
  };
  results?: {
    soundness?: SoundnessConformanceResult;
    completeness?: CompletenessConformanceResult;
    determinism?: DeterminismConformanceResult;
    totality?: TotalityConformanceResult;
  };
  error?: string;
}

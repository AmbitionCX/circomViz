export interface soundness_check_request {
  repo: string;
  entry: string;
  symPath: string;
  constraintsJsonPath: string;
  constraintIndices?: number[];
  queries: {
    satisfiability?: boolean;
    determinism?: boolean;
    coverage?: {
      signalNames: string[];
      fixedInputs?: Record<string, string | number>;
    };
  };
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

export interface soundness_check_response {
  success: boolean;
  results: {
    satisfiability?: SatisfiabilityResult;
    determinism?: DeterminismResult;
    coverage?: CoverageCheckResult;
  };
  error?: string;
}

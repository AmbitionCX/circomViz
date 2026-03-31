export interface ContractClause {
  signal: string;
  kind: 'boolean' | 'range' | 'equality' | 'hash' | 'commitment' | 'custom';
  smt2Representation: string;
  description: string;
}

export interface ContractInvariant {
  kind: string;
  description: string;
  smt2Representation: string;
  signals: string[];
}

export interface ContractVerificationSummary {
  soundnessPassed: boolean;
  intentAligned: boolean;
  formalConformancePassed: boolean;
  satisfiabilityModel?: Record<string, string>;
  counterexample?: any;
}

export interface TemplateContract {
  templateName: string;
  instancePath: string;
  compiledAt: number;
  assumptions: ContractClause[];
  guarantees: ContractClause[];
  invariants: ContractInvariant[];
  verification: ContractVerificationSummary;
  coveredConstraints: number[];
  coveredSignals: number[];
  interface: {
    inputs: Array<{ name: string; index: number; kind: 'input' }>;
    outputs: Array<{ name: string; index: number; kind: 'output' }>;
  };
}

export interface GenerateContractRequest {
  symPath: string;
  constraintsJsonPath: string;
  templateName: string;
  instancePath: string;
  constraintIndices?: number[];
  soundnessResult?: any;
  intentResult?: any;
  formalResult?: any;
}

export interface GenerateContractResponse {
  success: boolean;
  contract: TemplateContract | null;
  error?: string;
}

export interface ContractVerifyRequest {
  symPath: string;
  constraintsJsonPath: string;
  templateName: string;
  childContracts: TemplateContract[];
  constraintIndices?: number[];
  queries: {
    checkSatisfiability?: boolean;
    checkDeterminism?: boolean;
    checkCoverage?: boolean;
  };
}

export interface ContractVerifyResponse {
  success: boolean;
  results?: {
    satisfiability?: any;
    determinism?: any;
    coverage?: any;
  };
  suspectChildren: string[];
  refinementNeeded: boolean;
  error?: string;
}

export interface RefinementExpandRequest {
  symPath: string;
  constraintsJsonPath: string;
  templateName: string;
  childContracts: TemplateContract[];
  expandedChildren: string[];
  constraintIndices?: number[];
  queries: {
    checkSatisfiability?: boolean;
    checkDeterminism?: boolean;
    checkCoverage?: boolean;
  };
}

export interface RefinementExpandResponse {
  success: boolean;
  results?: {
    satisfiability?: any;
    determinism?: any;
    coverage?: any;
  };
  suspectChildren: string[];
  refinementNeeded: boolean;
  error?: string;
}

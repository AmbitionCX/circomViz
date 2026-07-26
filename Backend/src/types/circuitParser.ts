import type { HumanReadableConstraint } from '../core/utils/symbolParser.js';

export interface parse_circuit_request {
  repo: string;
  entry: string;
  rootComponent?: string;
}

export interface parse_circuit_response {
  repo: string;
  entry: string;
  files: FileSummary[];
  tree: any;
  errors: ParseMessage[];
  statistics: {
    totalFiles: number;
    totalTemplates: number;
    totalInstances: number;
    maxDepth: number;
  };
}

export interface FileSummary {
  id: string;
  path: string;
  displayId: string;
  includes: string[];
}

export interface ParseMessage {
  level: 'warning' | 'error';
  file?: string;
  message: string;
}

export interface find_template_params_request {
  templateName: string;
  repo: string;
  entry: string;
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

export interface find_template_params_response {
  templateName: string;
  hasCandidates: boolean;
  candidates: TemplateParamCandidate[];
  templateParams: string[];
  signals: Array<{ name: string; kind: string }>;
}

export type AbstractCompileMode = 'full' | 'interface-mock';

export interface generate_wrapper_request {
  templateName: string;
  params: { name: string; value: number }[];
  publicParams: string[];
  publicSignals: string[];
  repo: string;
  entry: string;
  templatePath: string[];
  confirmedTemplateNames?: string[];
  mode?: AbstractCompileMode;
}

export interface AbstractValidatorWarning {
  templateName: string;
  instance: string;
  reason: string;
}

export interface generate_wrapper_response {
  success: boolean;
  wrapperCode: string;
  debugOutput?: string;
  optimizedOutput?: string;
  witnessOutput?: string;
  debugSuccess?: boolean;
  optimizedSuccess?: boolean;
  witnessSuccess?: boolean;
  symPath?: string;
  constraintsJsonPath?: string;
  r1csConstraints?: HumanReadableConstraint[];
  r1csEquationText?: string;
  error?: string;
  abstractCompile?: boolean;
  mockedChildren?: string[];
  unmockedChildren?: string[];
  validatorWarnings?: AbstractValidatorWarning[];
  boundaryInputs?: Array<{ instance: string; signal: string; isArray: boolean }>;
  originSymPath?: string;
  originConstraintsJsonPath?: string;
  partialDebugging?: import('./partialDebugging.js').PartialDebuggingBuildSummary;
}

export interface static_analysis_request {
  repo: string;
  entry: string;
  symPath: string;
  constraintsJsonPath: string;
}

export interface static_analysis_response {
  success: boolean;
  findings: Array<{
    severity: 'high' | 'medium' | 'low';
    type: string;
    message: string;
    file?: string;
    line?: number;
  }>;
  error?: string;
}

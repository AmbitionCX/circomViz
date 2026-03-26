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

export interface generate_wrapper_request {
  templateName: string;
  params: { name: string; value: number }[];
  publicParams: string[];
  publicSignals: string[];
  repo: string;
  entry: string;
  templatePath: string[];
}

export interface generate_wrapper_response {
  success: boolean;
  wrapperCode: string;
  debugOutput?: string;
  optimizedOutput?: string;
  witnessOutput?: string;
  symPath?: string;
  constraintsJsonPath?: string;
  error?: string;
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

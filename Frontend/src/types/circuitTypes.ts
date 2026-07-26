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
  sourceFile?: string;
  isRecursiveReference?: boolean;
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

export interface ParseCompilationFailure {
  templateName: string;
  templatePath: string[];
  sourceFile?: string;
  line?: number;
  column?: number;
  errorCode?: string;
}

export interface ParseCompilationStatus {
  id: string;
  status: 'compiling' | 'success' | 'failure';
  message?: string;
  exitCode?: number | null;
  failedComponents: ParseCompilationFailure[];
}

export interface ParseCircuitResponse {
  repo: string;
  entry: string;
  files: FileSummary[];
  tree: TemplateInfo;
  errors: ParseError[];
  statistics: CircuitStatistics;
  compilation: ParseCompilationStatus;
}

export interface HumanReadableLinearExpression {
  text: string;
  terms: Array<{
    signalIndex: number;
    signal: string;
    coefficient: string;
  }>;
  constant: string;
}

export interface HumanReadableConstraint {
  index: number;
  formula: string;
  a: HumanReadableLinearExpression;
  b: HumanReadableLinearExpression;
  c: HumanReadableLinearExpression;
  signalsUsed: string[];
}

export interface CompilationConstraints {
  constraints: string[];
  signals: Record<string, number>;
  templateName: string;
  componentPath: string[];
  wrapperCode?: string;
  symPath?: string;
  constraintsJsonPath?: string;
  r1csConstraints?: HumanReadableConstraint[];
  r1csEquationText?: string;
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

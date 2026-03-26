export interface SignalRef {
  name: string;
  path?: string[];
}

export interface UnsafeAssignmentFinding {
  kind: 'unsafe-assign';
  operator: '<--' | '-->';
  target: SignalRef;
  exprText: string;
  line: number;
  templateName?: string;
  sourceFile?: string;
  constrainedLater?: boolean;
}

export interface ConstraintLikeFinding {
  kind: 'constraint-like';
  operator: '<==' | '==>' | '===';
  signalsMentioned: string[];
  line: number;
  templateName?: string;
  sourceFile?: string;
}

export interface SignalDeclarationFinding {
  kind: 'signal-decl';
  name: string;
  signalKind: 'input' | 'output' | 'intermediate';
  line: number;
  templateName?: string;
  sourceFile?: string;
}

export interface StaticCheckFinding {
  severity: 'high' | 'medium' | 'low';
  type: string;
  message: string;
  file?: string;
  line?: number;
}

export interface AstAnalysis {
  unsafeAssignments: UnsafeAssignmentFinding[];
  constraintLikes: ConstraintLikeFinding[];
  declaredSignals: SignalDeclarationFinding[];
}

export interface SymEntry {
  index: number;
  witness: number;
  component: number;
  name: string;
}

export interface ConstraintIndex {
  symEntries: SymEntry[];
  constrainedIds: Set<number>;
  nameToEntries: Map<string, SymEntry[]>;
  isSignalNameConstrained: (name: string) => boolean;
}

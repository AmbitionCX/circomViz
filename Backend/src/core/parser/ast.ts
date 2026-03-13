// AST (Abstract Syntax Tree)
// Type definition of AST

export type ASTNode = 
  | PragmaNode
  | IncludeNode
  | TemplateDefinitionNode
  | FunctionDefinitionNode
  | SignalNode
  | VariableNode
  | ComponentInstantiationNode
  | AssignmentNode
  | IfStatementNode
  | ForLoopNode
  | ReturnNode
  | AssertNode;

export interface PragmaNode {
  type: 'Pragma';
  version: string;
  line: number;
}

export interface IncludeNode {
  type: 'Include';
  path: string;
  resolvedPath?: string;
  line: number;
}

export interface TemplateDefinitionNode {
  type: 'TemplateDefinition';
  name: string;
  parameters: Parameter[];
  signals: SignalNode[];
  variables: VariableNode[];
  components: ComponentInstantiationNode[];
  statements: StatementNode[];
  sourceFile: string;
  line: number;
}

export interface Parameter {
  name: string;
  isArray?: boolean;
  arraySize?: number;
}

export interface FunctionDefinitionNode {
  type: 'FunctionDefinition';
  name: string;
  parameters: Parameter[];
  returnType?: string;
  body: StatementNode[];
  sourceFile: string;
  line: number;
}

export interface SignalNode {
  type: 'Signal';
  name: string;
  kind: 'input' | 'output' | 'intermediate';
  isArray?: boolean;
  arraySize?: number;
  line: number;
}

export interface VariableNode {
  type: 'Variable';
  name: string;
  isArray?: boolean;
  arraySize?: number;
  initialValue?: ExpressionNode;
  line: number;
}

export interface ComponentInstantiationNode {
  type: 'ComponentInstantiation';
  name: string;
  templateName: string;
  arguments: ExpressionNode[];
  sourceFile: string;
  line: number;
}

export type StatementNode = 
  | AssignmentNode
  | IfStatementNode
  | ForLoopNode
  | ReturnNode
  | AssertNode;

export interface AssignmentNode {
  type: 'Assignment';
  left: ExpressionNode;
  operator: '<==' | '==>' | '===' | '=';
  right: ExpressionNode;
  line: number;
}

export interface IfStatementNode {
  type: 'IfStatement';
  condition: ExpressionNode;
  thenBranch: StatementNode[];
  elseBranch?: StatementNode[];
  line: number;
}

export interface ForLoopNode {
  type: 'ForLoop';
  variable: string;
  start: ExpressionNode;
  end: ExpressionNode;
  step?: ExpressionNode;
  body: StatementNode[];
  line: number;
}

export interface ReturnNode {
  type: 'Return';
  value: ExpressionNode;
  line: number;
}

export interface AssertNode {
  type: 'Assert';
  condition: ExpressionNode;
  message?: ExpressionNode;
  line: number;
}

export type ExpressionNode = 
  | LiteralNode
  | IdentifierNode
  | BinaryOpNode
  | UnaryOpNode
  | ArrayAccessNode
  | FunctionCallNode
  | TernaryNode;

export interface LiteralNode {
  type: 'Literal';
  value: number | boolean | string;
  line: number;
}

export interface IdentifierNode {
  type: 'Identifier';
  name: string;
  line: number;
}

export interface BinaryOpNode {
  type: 'BinaryOp';
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
  line: number;
}

export interface UnaryOpNode {
  type: 'UnaryOp';
  operator: string;
  operand: ExpressionNode;
  line: number;
}

export interface ArrayAccessNode {
  type: 'ArrayAccess';
  array: ExpressionNode;
  index: ExpressionNode;
  line: number;
}

export interface FunctionCallNode {
  type: 'FunctionCall';
  function: string;
  arguments: ExpressionNode[];
  line: number;
}

export interface TernaryNode {
  type: 'Ternary';
  condition: ExpressionNode;
  thenExpr: ExpressionNode;
  elseExpr: ExpressionNode;
  line: number;
}

export interface ParsedFile {
  path: string;
  content: string;
  ast: ASTNode[];
  includes: IncludeNode[];
  templates: TemplateDefinitionNode[];
  functions: FunctionDefinitionNode[];
  components: ComponentInstantiationNode[];
}

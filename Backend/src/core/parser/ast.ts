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
  | ComponentDeclarationNode
  | ComponentInstantiationWithInitNode
  | ComponentArrayInitNode
  | FunctionCallNode
  | AssignmentNode
  | IfStatementNode
  | ForLoopNode
  | WhileLoopNode
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
  components: (ComponentInstantiationNode | ComponentDeclarationNode | ComponentInstantiationWithInitNode | ComponentArrayInitNode)[];
  statements: StatementNode[];
  sourceFile: string;
  line: number;
}

export interface Parameter {
  name: string;
  isArray?: boolean;
  arraySizes?: (number | ExpressionNode)[];
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
  arraySizes?: (number | ExpressionNode)[];
  initialValue?: ExpressionNode;
  line: number;
}

export interface VariableNode {
  type: 'Variable';
  name: string;
  isArray?: boolean;
  arraySizes?: (number | ExpressionNode)[];
  initialValue?: ExpressionNode;
  line: number;
}

export interface ComponentInstantiationNode {
  type: 'ComponentInstantiationNode';
  name: string;
  templateName: string;
  arguments: ExpressionNode[];
  publicSignals: string[];
  line: number;
}

export interface ComponentDeclarationNode {
  type: 'ComponentDeclaration';
  name: string;
  arraySizes?: (number | ExpressionNode)[];
  line: number;
}

export interface ComponentArrayInitNode {
  type: 'ComponentArrayInit';
  name: string;
  arraySizes: (number | ExpressionNode)[];
  initStatements: StatementNode[];
  line: number;
}

export interface ComponentInstantiationWithInitNode {
  type: 'ComponentInstantiationWithInitNode';
  name: string;
  arraySizes?: (number | ExpressionNode)[];
  initBlock: StatementNode[];
  line: number;
}

export type StatementNode =
  | AssignmentNode
  | ExpressionStatementNode
  | VariableNode
  | BlockStatementNode
  | ComponentDeclarationNode
  | ComponentInstantiationWithInitNode
  | IfStatementNode
  | ForLoopNode
  | WhileLoopNode
  | ReturnNode
  | AssertNode;

export interface AssignmentNode {
  type: 'Assignment';
  left: ExpressionNode;
  operator: '<==' | '==>' | '===' | '<--' | '-->' | '+=' | '-=' | '*=' | '/=' | '&=' | '|=' | '^=' | '\\=' | '=';
  right: ExpressionNode;
  line: number;
}

export interface ExpressionStatementNode {
  type: 'ExpressionStatement';
  expression: ExpressionNode;
  line: number;
}

export interface BlockStatementNode {
  type: 'BlockStatement';
  body: StatementNode[];
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

export interface WhileLoopNode {
  type: 'WhileLoop';
  condition: ExpressionNode;
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
  | ArrayLiteralNode
  | MemberAccessNode
  | FunctionCallNode
  | ComponentCallNode
  | TernaryNode
  | TupleNode;

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
  isPostfix?: boolean;
  line: number;
}

export interface ArrayAccessNode {
  type: 'ArrayAccess';
  array: ExpressionNode;
  index: ExpressionNode;
  line: number;
}

export interface ArrayLiteralNode {
  type: 'ArrayLiteral';
  elements: ExpressionNode[];
  line: number;
}

export interface MemberAccessNode {
  type: 'MemberAccess';
  object: ExpressionNode;
  property: string;
  line: number;
}

export interface FunctionCallNode {
  type: 'FunctionCall';
  function: string;
  arguments: ExpressionNode[];
  line: number;
}

export interface ComponentCallNode {
  type: 'ComponentCall';
  template: string;
  templateArgs: ExpressionNode[];
  callArgs: ExpressionNode[];
  line: number;
}

export interface TernaryNode {
  type: 'Ternary';
  condition: ExpressionNode;
  thenExpr: ExpressionNode;
  elseExpr: ExpressionNode;
  line: number;
}

export interface TupleNode {
  type: 'Tuple';
  elements: ExpressionNode[];
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

// Converting the token sequence (from lexer.ts) into an AST (Abstract Syntax Tree)
// Construct the tree structure based on circom grammar rules.

import { CircomLexer, Token, TokenType } from './lexer.js';
import { ASTNode, PragmaNode, IncludeNode, TemplateDefinitionNode, FunctionDefinitionNode, SignalNode, VariableNode, ComponentInstantiationNode, AssignmentNode, IfStatementNode, ForLoopNode, ReturnNode, AssertNode, Parameter, ExpressionNode, StatementNode } from './ast.js';

export class CircomParser {
  private lexer: CircomLexer;
  private tokens: Token[] = [];
  private current = 0;
  private sourceFile: string;

  constructor(lexer: CircomLexer, sourceFile: string = '') {
    this.lexer = lexer;
    this.sourceFile = sourceFile;
  }

  // parse 
  parse(content: string, filePath: string = ''): ASTNode[] {
    this.sourceFile = filePath || this.sourceFile;
    this.lexer = new CircomLexer(content);
    this.tokens = this.lexer.tokenize(); // token sequence
    this.current = 0;

    const nodes: ASTNode[] = [];

    while (!this.isAtEnd()) {
      try {
        const node = this.parseTopLevel(); // grammar analysis
        if (node) {
          nodes.push(node);
        }
      } catch (error) {
        this.synchronize();
      }
    }

    return nodes; // AST Nodes
  }

  private parseTopLevel(): ASTNode | null {
    const token = this.peek();

    if (this.matchKeyword('pragma')) {
      return this.parsePragma();
    }

    if (this.matchKeyword('include')) {
      return this.parseInclude();
    }

    if (this.matchKeyword('template')) {
      return this.parseTemplateDefinition();
    }

    if (this.matchKeyword('function')) {
      return this.parseFunctionDefinition();
    }

    if (this.matchKeyword('component')) {
      return this.parseComponentInstantiation();
    }

    this.advance();
    return null;
  }

  private parsePragma(): PragmaNode {
    const line = this.previous().line;
    this.consume('IDENTIFIER', 'Expect circom after pragma');
    const circomKeyword = this.previous().value;

    const version = this.parseVersion();
    this.consumePunctuation(';');

    return {
      type: 'Pragma',
      version,
      line
    };
  }

  private parseVersion(): string {
    let version = '';
    let hasDecimal = false;

    while (!this.isAtEnd() && !this.checkPunctuation(';')) {
      const token = this.peek();

      if (token.type === 'NUMBER' || (token.type === 'PUNCTUATION' && token.value === '.')) {
        if (token.value === '.') {
          hasDecimal = true;
        }
        version += token.value;
        this.advance();
      } else {
        break;
      }
    }

    return version;
  }

  private parseInclude(): IncludeNode {
    const line = this.previous().line;
    this.consume('STRING', 'Expect string after include');
    const path = this.previous().value;
    this.consumePunctuation(';');

    return {
      type: 'Include',
      path,
      line
    };
  }

  private parseTemplateDefinition(): TemplateDefinitionNode {
    const line = this.previous().line;
    const name = this.consumeIdentifier();

    this.consumePunctuation('(');
    const parameters: Parameter[] = [];
    if (!this.checkPunctuation(')')) {
      do {
        parameters.push(this.parseParameter());
      } while (this.matchPunctuation(','));
    }
    this.consumePunctuation(')');

    this.consumePunctuation('{');

    const signals: SignalNode[] = [];
    const variables: VariableNode[] = [];
    const components: ComponentInstantiationNode[] = [];
    const statements: StatementNode[] = [];

    while (!this.checkPunctuation('}') && !this.isAtEnd()) {
      if (this.matchKeyword('signal')) {
        signals.push(this.parseSignal());
      } else if (this.matchKeyword('var')) {
        variables.push(this.parseVariable());
      } else if (this.matchKeyword('component')) {
        components.push(this.parseComponentInstantiation());
      } else {
        statements.push(this.parseStatement());
      }
    }

    this.consumePunctuation('}');

    return {
      type: 'TemplateDefinition',
      name,
      parameters,
      signals,
      variables,
      components,
      statements,
      sourceFile: this.sourceFile,
      line
    };
  }

  private parseParameter(): Parameter {
    const name = this.consumeIdentifier();
    let isArray = false;
    let arraySize: number | undefined;

    if (this.matchPunctuation('[')) {
      isArray = true;
      arraySize = this.parseNumberLiteral();
      this.consumePunctuation(']');
    }

    return { name, isArray, arraySize };
  }

  private parseSignal(): SignalNode {
    const line = this.previous().line;
    let kind: 'input' | 'output' | 'intermediate' = 'intermediate';

    if (this.matchKeyword('input')) {
      kind = 'input';
    } else if (this.matchKeyword('output')) {
      kind = 'output';
    }

    const name = this.consumeIdentifier();
    let isArray = false;
    let arraySize: number | undefined;

    if (this.matchPunctuation('[')) {
      isArray = true;
      arraySize = this.parseNumberLiteral();
      this.consumePunctuation(']');
    }

    this.consumePunctuation(';');

    return {
      type: 'Signal',
      name,
      kind,
      isArray,
      arraySize,
      line
    };
  }

  private parseVariable(): VariableNode {
    const line = this.previous().line;
    const name = this.consumeIdentifier();
    let isArray = false;
    let arraySize: number | undefined;
    let initialValue: ExpressionNode | undefined;

    if (this.matchPunctuation('[')) {
      isArray = true;
      arraySize = this.parseNumberLiteral();
      this.consumePunctuation(']');
    }

    if (this.matchOperator('=')) {
      initialValue = this.parseExpression();
    }

    this.consumePunctuation(';');

    return {
      type: 'Variable',
      name,
      isArray,
      arraySize,
      initialValue,
      line
    };
  }

  private parseComponentInstantiation(): ComponentInstantiationNode {
    const line = this.previous().line;
    const name = this.consumeIdentifier();
    
    // Skip optional { public [...] } block
    if (this.checkPunctuation('{')) {
      this.consumePunctuation('{');
      
      // Check for 'public' keyword (may not be a keyword in all contexts)
      if (this.checkPunctuation('[') || this.checkType('KEYWORD')) {
        // Skip 'public' keyword if present
        if (this.checkType('KEYWORD') && this.peek().value === 'public') {
          this.advance();
        }
        this.consumePunctuation('[');
        
        // Skip signal names
        while (!this.checkPunctuation(']')) {
          if (this.matchType('IDENTIFIER')) {
            this.advance(); // Skip signal name
          } else if (this.matchPunctuation(',')) {
            this.advance(); // Skip comma
          }
        }
        
        this.consumePunctuation(']');
        this.consumePunctuation('}');
      } else {
        // If no 'public' keyword, just skip the braces
        this.skipBraces();
      }
    }

    const templateName = this.consumeIdentifier();

    this.consumePunctuation('(');
    const args: ExpressionNode[] = [];
    if (!this.checkPunctuation(')')) {
      do {
        args.push(this.parseExpression());
      } while (this.matchPunctuation(','));
    }
    this.consumePunctuation(')');

    this.consumePunctuation(';');

    return {
      type: 'ComponentInstantiation',
      name,
      templateName,
      arguments: args,
      sourceFile: this.sourceFile,
      line
    };
  }

  private skipBraces(): void {
    let depth = 1;
    while (depth > 0 && !this.isAtEnd()) {
      const char = this.peek().value;
      if (char === '{') {
        depth++;
        this.advance();
      } else if (char === '}') {
        depth--;
        this.advance();
      } else {
        this.advance();
      }
    }
  }

  private parseFunctionDefinition(): FunctionDefinitionNode {
    const line = this.previous().line;
    const name = this.consumeIdentifier();

    this.consumePunctuation('(');
    const parameters: Parameter[] = [];
    if (!this.checkPunctuation(')')) {
      do {
        parameters.push(this.parseParameter());
      } while (this.matchPunctuation(','));
    }
    this.consumePunctuation(')');

    let returnType: string | undefined;
    if (this.matchKeyword('returns')) {
      returnType = this.consumeIdentifier();
    }

    this.consumePunctuation('{');

    const body: StatementNode[] = [];
    while (!this.checkPunctuation('}') && !this.isAtEnd()) {
      body.push(this.parseStatement());
    }

    this.consumePunctuation('}');

    return {
      type: 'FunctionDefinition',
      name,
      parameters,
      returnType,
      body,
      sourceFile: this.sourceFile,
      line
    };
  }

  private parseStatement(): StatementNode {
    if (this.matchKeyword('if')) {
      return this.parseIfStatement();
    }
    if (this.matchKeyword('for')) {
      return this.parseForLoop();
    }
    if (this.matchKeyword('return')) {
      return this.parseReturn();
    }
    if (this.matchKeyword('assert')) {
      return this.parseAssert();
    }
    return this.parseAssignment();
  }

  private parseAssignment(): AssignmentNode {
    const left = this.parseExpression();
    
    let operator: '<==' | '==>' | '===' | '=' = '=';
    if (this.matchOperator('<==')) {
      operator = '<==';
    } else if (this.matchOperator('==>')) {
      operator = '==>';
    } else if (this.matchOperator('===')) {
      operator = '===';
    } else {
      this.consumeOperator('=');
    }

    const right = this.parseExpression();
    this.consumePunctuation(';');

    return {
      type: 'Assignment',
      left,
      operator,
      right,
      line: left.line
    };
  }

  private parseIfStatement(): IfStatementNode {
    const line = this.previous().line;
    this.consumePunctuation('(');
    const condition = this.parseExpression();
    this.consumePunctuation(')');
    this.consumePunctuation('{');

    const thenBranch: StatementNode[] = [];
    while (!this.checkPunctuation('}') && !this.isAtEnd()) {
      thenBranch.push(this.parseStatement());
    }
    this.consumePunctuation('}');

    let elseBranch: StatementNode[] | undefined;
    if (this.matchKeyword('else')) {
      this.consumePunctuation('{');
      elseBranch = [];
      while (!this.checkPunctuation('}') && !this.isAtEnd()) {
        elseBranch.push(this.parseStatement());
      }
      this.consumePunctuation('}');
    }

    return {
      type: 'IfStatement',
      condition,
      thenBranch,
      elseBranch,
      line
    };
  }

  private parseForLoop(): ForLoopNode {
    const line = this.previous().line;
    this.consumePunctuation('(');
    const variable = this.consumeIdentifier();
    this.consumePunctuation('=');
    const start = this.parseExpression();
    this.consumePunctuation(';');
    const end = this.parseExpression();
    
    let step: ExpressionNode | undefined;
    if (!this.checkPunctuation(')')) {
      step = this.parseExpression();
    }
    this.consumePunctuation(')');
    this.consumePunctuation('{');

    const body: StatementNode[] = [];
    while (!this.checkPunctuation('}') && !this.isAtEnd()) {
      body.push(this.parseStatement());
    }
    this.consumePunctuation('}');

    return {
      type: 'ForLoop',
      variable,
      start,
      end,
      step,
      body,
      line
    };
  }

  private parseReturn(): ReturnNode {
    const line = this.previous().line;
    const value = this.parseExpression();
    this.consumePunctuation(';');

    return {
      type: 'Return',
      value,
      line
    };
  }

  private parseAssert(): AssertNode {
    const line = this.previous().line;
    this.consumePunctuation('(');
    const condition = this.parseExpression();
    
    let message: ExpressionNode | undefined;
    if (!this.checkPunctuation(')')) {
      this.consumePunctuation(',');
      message = this.parseExpression();
    }
    this.consumePunctuation(')');
    this.consumePunctuation(';');

    return {
      type: 'Assert',
      condition,
      message,
      line
    };
  }

  private parseExpression(): ExpressionNode {
    return this.parseConditional();
  }

  private parseConditional(): ExpressionNode {
    let expr = this.parseLogicalOr();

    if (this.matchOperator('?')) {
      const thenExpr = this.parseExpression();
      this.consumeOperator(':');
      const elseExpr = this.parseConditional();

      return {
        type: 'Ternary',
        condition: expr,
        thenExpr,
        elseExpr,
        line: (expr as any).line
      };
    }

    return expr;
  }

  private parseLogicalOr(): ExpressionNode {
    let expr = this.parseLogicalAnd();

    while (this.matchOperator('||')) {
      const operator = this.previous().value;
      const right = this.parseLogicalAnd();
      expr = {
        type: 'BinaryOp',
        operator,
        left: expr,
        right,
        line: (expr as any).line
      };
    }

    return expr;
  }

  private parseLogicalAnd(): ExpressionNode {
    let expr = this.parseEquality();

    while (this.matchOperator('&&')) {
      const operator = this.previous().value;
      const right = this.parseEquality();
      expr = {
        type: 'BinaryOp',
        operator,
        left: expr,
        right,
        line: (expr as any).line
      };
    }

    return expr;
  }

  private parseEquality(): ExpressionNode {
    let expr = this.parseComparison();

    while (this.matchOperator('==') || this.matchOperator('!=')) {
      const operator = this.previous().value;
      const right = this.parseComparison();
      expr = {
        type: 'BinaryOp',
        operator,
        left: expr,
        right,
        line: (expr as any).line
      };
    }

    return expr;
  }

  private parseComparison(): ExpressionNode {
    let expr = this.parseTerm();

    while (this.matchOperator('<') || this.matchOperator('>') ||
           this.matchOperator('<=') || this.matchOperator('>=')) {
      const operator = this.previous().value;
      const right = this.parseTerm();
      expr = {
        type: 'BinaryOp',
        operator,
        left: expr,
        right,
        line: (expr as any).line
      };
    }

    return expr;
  }

  private parseTerm(): ExpressionNode {
    let expr = this.parseFactor();

    while (this.matchOperator('+') || this.matchOperator('-')) {
      const operator = this.previous().value;
      const right = this.parseFactor();
      expr = {
        type: 'BinaryOp',
        operator,
        left: expr,
        right,
        line: (expr as any).line
      };
    }

    return expr;
  }

  private parseFactor(): ExpressionNode {
    let expr = this.parseUnary();

    while (this.matchOperator('*') || this.matchOperator('/') || this.matchOperator('%')) {
      const operator = this.previous().value;
      const right = this.parseUnary();
      expr = {
        type: 'BinaryOp',
        operator,
        left: expr,
        right,
        line: (expr as any).line
      };
    }

    return expr;
  }

  private parseUnary(): ExpressionNode {
    if (this.matchOperator('!') || this.matchOperator('-') || this.matchOperator('~')) {
      const operator = this.previous().value;
      const operand = this.parseUnary();
      return {
        type: 'UnaryOp',
        operator,
        operand,
        line: this.previous().line
      };
    }

    return this.parsePostfix();
  }

  private parsePostfix(): ExpressionNode {
    let expr = this.parsePrimary();

    while (this.matchPunctuation('[')) {
      const index = this.parseExpression();
      this.consumePunctuation(']');
      expr = {
        type: 'ArrayAccess',
        array: expr,
        index,
        line: (expr as any).line
      };
    }

    return expr;
  }

  private parsePrimary(): ExpressionNode {
    if (this.matchType('NUMBER')) {
      return {
        type: 'Literal',
        value: parseInt(this.previous().value),
        line: this.previous().line
      };
    }

    if (this.matchType('IDENTIFIER')) {
      const name = this.previous().value;

      if (this.matchPunctuation('(')) {
        const args: ExpressionNode[] = [];
        if (!this.checkPunctuation(')')) {
          do {
            args.push(this.parseExpression());
          } while (this.matchPunctuation(','));
        }
        this.consumePunctuation(')');

        return {
          type: 'FunctionCall',
          function: name,
          arguments: args,
          line: this.previous().line
        };
      }

      return {
        type: 'Identifier',
        name,
        line: this.previous().line
      };
    }

    if (this.matchPunctuation('(')) {
      const expr = this.parseExpression();
      this.consumePunctuation(')');
      return expr;
    }

    throw new Error(`Unexpected token: ${this.peek().value} at line ${this.peek().line}`);
  }

  private matchType(type: TokenType): boolean {
    if (this.checkType(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  private checkType(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private matchKeyword(keyword: string): boolean {
    if (this.checkKeyword(keyword)) {
      this.advance();
      return true;
    }
    return false;
  }

  private checkKeyword(keyword: string): boolean {
    return this.peek().type === 'KEYWORD' && this.peek().value === keyword;
  }

  private matchPunctuation(punct: string): boolean {
    if (this.checkPunctuation(punct)) {
      this.advance();
      return true;
    }
    return false;
  }

  private checkPunctuation(punct: string): boolean {
    return this.peek().type === 'PUNCTUATION' && this.peek().value === punct;
  }

  private matchOperator(op: string): boolean {
    if (this.checkOperator(op)) {
      this.advance();
      return true;
    }
    return false;
  }

  private checkOperator(op: string): boolean {
    return this.peek().type === 'OPERATOR' && this.peek().value === op;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.checkType(type)) {
      return this.advance();
    }
    throw new Error(`${message} at line ${this.peek().line}`);
  }

  private consumePunctuation(punct: string): void {
    if (this.checkPunctuation(punct)) {
      this.advance();
      return;
    }
    throw new Error(`Expected '${punct}' at line ${this.peek().line}`);
  }

  private consumeOperator(op: string): void {
    if (this.checkOperator(op)) {
      this.advance();
      return;
    }
    throw new Error(`Expected '${op}' operator at line ${this.peek().line}`);
  }

  private consumeIdentifier(): string {
    const token = this.consume('IDENTIFIER', 'Expected identifier');
    return token.value;
  }

  private parseNumberLiteral(): number {
    const token = this.consume('NUMBER', 'Expected number');
    return parseInt(token.value);
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.current++;
    }
    return this.tokens[this.current - 1];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private peek(): Token {
    if (this.current >= this.tokens.length) {
      return { type: 'PUNCTUATION', value: '', line: 0, column: 0 };
    }
    return this.tokens[this.current];
  }

  private isAtEnd(): boolean {
    return this.current >= this.tokens.length;
  }

  private synchronize(): void {
    this.advance();

    while (!this.isAtEnd()) {
      if (this.previous().type === 'PUNCTUATION' && this.previous().value === ';') {
        return;
      }

      const type = this.peek().type;
      if (type === 'KEYWORD') {
        const value = this.peek().value;
        if (['template', 'function', 'component', 'signal', 'pragma', 'include'].includes(value)) {
          return;
        }
      }

      this.advance();
    }
  }
}

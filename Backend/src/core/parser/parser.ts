// Converting the token sequence (from lexer.ts) into an AST (Abstract Syntax Tree)
// Construct the tree structure based on circom grammar rules.

import { CircomLexer, Token, TokenType } from './lexer.js';
import { ASTNode, PragmaNode, IncludeNode, TemplateDefinitionNode, FunctionDefinitionNode, SignalNode, VariableNode, ComponentInstantiationNode, ComponentDeclarationNode, ComponentInstantiationWithInitNode, ComponentArrayInitNode, AssignmentNode, IfStatementNode, ForLoopNode, WhileLoopNode, ReturnNode, AssertNode, Parameter, ExpressionNode, StatementNode, BlockStatementNode, TupleNode, TupleSignalDeclarationNode, TupleSignalElement } from './ast.js';

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
    // console.log(`[Parser DEBUG] ========== PARSE START ===========`);
    // console.log(`[Parser DEBUG] File: ${filePath}`);
    // console.log(`[Parser DEBUG] Tokens: ${this.tokens.length}`);
    
    this.sourceFile = filePath || this.sourceFile;
    this.lexer = new CircomLexer(content);
    this.tokens = this.lexer.tokenize(); // token sequence
    this.current = 0;

    const nodes: ASTNode[] = [];
    let nodeCount = 0;

    while (!this.isAtEnd()) {
      try {
        const node = this.parseTopLevel(); // grammar analysis
        if (node) {
          nodeCount++;
          // console.log(`[Parser DEBUG] Node ${nodeCount}: ${node.type}${(node as any).name ? `:${(node as any).name}` : ''}`);
          nodes.push(node);
        }
      } catch (error: any) {
        // console.log(`[Parser DEBUG] ERROR parsing node: ${error.message}`);
        this.synchronize();
      }
    }

    // console.log(`[Parser DEBUG] Total nodes parsed: ${nodes.length}`);
    // console.log(`[Parser DEBUG] ========== PARSE END ============`);

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
    // console.log(`[Parser DEBUG] parseTemplateDefinition called at line ${this.peek().line}`);
    const line = this.previous().line;
    const name = this.consumeIdentifier();
    // console.log(`[Parser DEBUG] Template name: ${name}`);

    this.consumePunctuation('(');
    const parameters: Parameter[] = [];
    if (!this.checkPunctuation(')')) {
      do {
        parameters.push(this.parseParameter());
      } while (this.matchPunctuation(','));
    }
    this.consumePunctuation(')');
    // console.log(`[Parser DEBUG] Parsed ${parameters.length} parameters`);

    this.consumePunctuation('{');
    // console.log(`[Parser DEBUG] Starting template body parsing`);

    const signals: SignalNode[] = [];
    const variables: VariableNode[] = [];
    const components: (ComponentInstantiationNode | ComponentDeclarationNode | ComponentInstantiationWithInitNode | ComponentArrayInitNode)[] = [];
    const statements: StatementNode[] = [];

    let statementCount = 0;
    while (!this.checkPunctuation('}') && !this.isAtEnd()) {
      statementCount++;
      const token = this.peek();
      // console.log(`[Parser DEBUG] Statement ${statementCount}: token type=${token.type}, value=${token.value}`);
      
      if (this.matchKeyword('signal')) {
        // console.log(`[Parser DEBUG]   -> parsing signal`);
        const signalDeclarations = this.parseSignalDeclarations();
        for (const sig of signalDeclarations) {
          if (sig.type === 'Signal') {
            signals.push(sig);
          } else {
            statements.push(sig);
          }
        }
      } else if (this.matchKeyword('var')) {
        // console.log(`[Parser DEBUG]   -> parsing variable`);
        variables.push(...this.parseVariableDeclarations());
      } else if (this.matchKeyword('component')) {
        // console.log(`[Parser DEBUG]   -> parsing component`);
        components.push(this.parseComponentInstantiation());
      } else {
        const stmt = this.parseStatement();
        if (stmt.type === 'ComponentInstantiationNode') {
          components.push(stmt);
        } else {
          statements.push(stmt);
        }
      }
    }
    // console.log(`[Parser DEBUG] Parsed ${statementCount} statements in template body`);

    this.consumePunctuation('}');
    // console.log(`[Parser DEBUG] Template ${name} parsed successfully: ${signals.length} signals, ${components.length} components, ${statements.length} statements`);

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
    let arraySizes: (number | ExpressionNode)[] | undefined;

    if (this.matchPunctuation('[')) {
      isArray = true;
      arraySizes = [];
      
      // Parse the first dimension
      arraySizes.push(this.parseExpression());
      this.consumePunctuation(']');
      
      // Check for additional dimensions (e.g., a[2][3])
      while (this.matchPunctuation('[')) {
        arraySizes.push(this.parseExpression());
        this.consumePunctuation(']');
      }
    }

    return { name, isArray, arraySizes };
  }

  private parseSignal(): SignalNode | TupleSignalDeclarationNode {
    return this.parseSignalDeclarations()[0];
  }

  private parseSignalDeclarations(): (SignalNode | TupleSignalDeclarationNode)[] {
    const line = this.previous().line;
    let kind: 'input' | 'output' | 'intermediate' = 'intermediate';

    if (this.matchKeyword('input')) {
      kind = 'input';
    } else if (this.matchKeyword('output')) {
      kind = 'output';
    }

    // Check for tuple signal declaration: signal (a, b[n]) <== expr;
    if (this.checkPunctuation('(')) {
      return [this.parseTupleSignalDeclaration(line, kind)];
    }

    const declarations: SignalNode[] = [];

    do {
      const name = this.consumeIdentifier();
      const arraySizes = this.parseArraySizes();

      let initialValue: ExpressionNode | undefined;
      if (this.matchOperator('<==')) {
        initialValue = this.parseExpression();
      }

      declarations.push({
        type: 'Signal',
        name,
        kind,
        isArray: !!arraySizes,
        arraySizes,
        initialValue,
        line
      });
    } while (!declarations[declarations.length - 1].initialValue && this.matchPunctuation(','));

    this.consumePunctuation(';');

    return declarations;
  }

  private parseTupleSignalDeclaration(line: number, kind: 'input' | 'output' | 'intermediate'): TupleSignalDeclarationNode {
    this.consumePunctuation('(');
    const elements: TupleSignalElement[] = [];

    do {
      const name = this.consumeIdentifier();
      let isArray = false;
      let arraySizes: (number | ExpressionNode)[] | undefined;

      if (this.matchPunctuation('[')) {
        isArray = true;
        arraySizes = [];
        arraySizes.push(this.parseExpression());
        this.consumePunctuation(']');
        while (this.matchPunctuation('[')) {
          arraySizes.push(this.parseExpression());
          this.consumePunctuation(']');
        }
      }

      elements.push({ name, isArray, arraySizes });
    } while (this.matchPunctuation(','));

    this.consumePunctuation(')');

    let initialValue: ExpressionNode | undefined;
    if (this.matchOperator('<==')) {
      initialValue = this.parseExpression();
    }

    this.consumePunctuation(';');

    return {
      type: 'TupleSignalDeclaration',
      kind,
      elements,
      initialValue,
      line
    };
  }

  private parseVariable(): VariableNode {
    return this.parseVariableDeclarations()[0];
  }

  private parseVariableDeclarations(): VariableNode[] {
    const line = this.previous().line;
    const declarations: VariableNode[] = [];

    do {
      const name = this.consumeIdentifier();
      const arraySizes = this.parseArraySizes();
      let initialValue: ExpressionNode | undefined;

      if (this.matchOperator('=')) {
        initialValue = this.parseExpression();
      }

      declarations.push({
        type: 'Variable',
        name,
        isArray: !!arraySizes,
        arraySizes,
        initialValue,
        line
      });
    } while (this.matchPunctuation(','));

    this.consumePunctuation(';');

    return declarations;
  }

  private parseArraySizes(): (number | ExpressionNode)[] | undefined {
    if (!this.matchPunctuation('[')) {
      return undefined;
    }

    const arraySizes: (number | ExpressionNode)[] = [];
    arraySizes.push(this.parseExpression());
    this.consumePunctuation(']');

    while (this.matchPunctuation('[')) {
      arraySizes.push(this.parseExpression());
      this.consumePunctuation(']');
    }

    return arraySizes;
  }

  private parseComponentInstantiation(): ComponentInstantiationNode | ComponentDeclarationNode | ComponentInstantiationWithInitNode | ComponentArrayInitNode {
    // console.log(`[Parser DEBUG] parseComponentInstantiation called, next token: ${this.peek().type}:${this.peek().value}`);
    const line = this.previous().line;
    const name = this.consumeIdentifier();
    // console.log(`[Parser DEBUG] Component name: ${name} at line ${line}`);
    
    // Check for array syntax: component name[expr]
    let arraySizes: (number | ExpressionNode)[] | undefined;
    if (this.matchPunctuation('[')) {
      arraySizes = [];
      arraySizes.push(this.parseExpression());
      this.consumePunctuation(']');
      
      // Check for additional dimensions (e.g., a[2][3])
      while (this.matchPunctuation('[')) {
        arraySizes.push(this.parseExpression());
        this.consumePunctuation(']');
      }
    }

    // If it's an array, handle differently
    if (arraySizes) {
      // Check for initialization - component array followed by statements that initialize it
      // Pattern 1: component c[n]; { c[0] = A(); c[1] = B(); }
      // Pattern 2: component c[n]; for(...) { c[i] = A(); }
      if (this.checkPunctuation(';')) {
        // Don't consume ';' yet - check if there's initialization
        const hasInitialization = this.checkForComponentArrayInitialization(name);

        if (hasInitialization) {
          // Consume the ';' and collect init statements
          this.consumePunctuation(';');
          // console.log(`[Parser DEBUG] Detected component array initialization for ${name}`);
          const initStatements: StatementNode[] = [];

          // Collect statements that initialize this component array
          while (this.isComponentArrayInitStatement(name)) {
            initStatements.push(this.parseStatement());
          }

          // console.log(`[Parser DEBUG] Collected ${initStatements.length} init statements for ${name}`);
          // console.log(`[Parser DEBUG] Init statement types: ${initStatements.map((s: any) => s.type).join(', ')}`);
          return {
            type: 'ComponentArrayInit',
            name,
            arraySizes,
            initStatements,
            line
          };
        } else {
          // Simple component array declaration without initialization
          this.consumePunctuation(';');
          // console.log(`[Parser DEBUG] Simple component array declaration: ${name}[...]`);
          return {
            type: 'ComponentDeclaration',
            name,
            arraySizes,
            line
          };
        }
      } else if (this.checkPunctuation('{')) {
        // Initialization block with braces
        // component c[5]; { c[0] = A(); c[1] = B(); }
        this.consumePunctuation('{');
        const body: StatementNode[] = [];
        while (!this.checkPunctuation('}') && !this.isAtEnd()) {
          body.push(this.parseStatement());
        }
        this.consumePunctuation('}');
        return {
          type: 'ComponentInstantiationWithInitNode',
          name,
          arraySizes,
          initBlock: body,
          line
        };
      } else {
        // Unrecognized syntax - should not reach here
        return {
          type: 'ComponentDeclaration',
          name,
          arraySizes,
          line
        };
      }
    }

    // Check if this is a component declaration without initialization: component name;
    if (this.checkPunctuation(';')) {
      // console.log(`[Parser DEBUG] -> component declaration without initialization`);
      this.consumePunctuation(';');
      return {
        type: 'ComponentDeclaration',
        name,
        line
      };
    }

    // Component instantiation: component name = Template(args);
    // Capture optional { public [...] } block
    let publicSignals: string[] = [];
    if (this.checkPunctuation('{')) {
      // console.log(`[Parser DEBUG] -> capturing public block`);
      this.consumePunctuation('{');
      
      // Check for 'public' keyword (may not be a keyword in all contexts)
      if (this.checkPunctuation('[') || this.checkType('KEYWORD') || (this.checkType('IDENTIFIER') && this.peek().value === 'public')) {
        // Skip 'public' keyword if present
        if ((this.checkType('KEYWORD') || this.checkType('IDENTIFIER')) && this.peek().value === 'public') {
          this.advance();
        }
        this.consumePunctuation('[');
        
        // Capture signal names
        while (!this.checkPunctuation(']')) {
          if (this.matchType('IDENTIFIER')) {
            publicSignals.push(this.previous().value);
          } else if (this.matchPunctuation(',')) {
            // Skip comma
          } else {
            this.advance();
          }
        }
        
        this.consumePunctuation(']');
        this.consumePunctuation('}');
      } else {
        // If no 'public' keyword, just skip the braces
        this.skipBraces();
      }
    }
    
    // Consume the '=' operator
    this.consumeOperator('=');
    // console.log(`[Parser DEBUG] Consumed = operator at line ${line}`);

    // Extract template name with validation
    const templateName = this.consumeIdentifier();
    // console.log(`[Parser DEBUG] Template name: ${templateName} at line ${line}`);
    
    // CRITICAL: Validate templateName is not undefined
    if (!templateName || templateName === undefined) {
      throw new Error(`Failed to parse template name at line ${line}: Expected template name after '='`);
    }

    this.consumePunctuation('(');
    const args: ExpressionNode[] = [];
    if (!this.checkPunctuation(')')) {
      do {
        args.push(this.parseExpression());
      } while (this.matchPunctuation(','));
    }
    this.consumePunctuation(')');
    // console.log(`[Parser DEBUG] Parsed ${args.length} arguments for template ${templateName}`);

    this.consumePunctuation(';');

    // console.log(`[Parser DEBUG] Component parsed successfully: ${name} = ${templateName} at line ${line}`);
    return {
      type: 'ComponentInstantiationNode',
      name,
      templateName,
      arguments: args,
      publicSignals,
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
    // console.log(`[Parser DEBUG] parseStatement called, next token: ${this.peek().type}:${this.peek().value}`);
    // console.log(`[Parser DEBUG] current position before parsing: ${this.current}`);
    
    if (this.matchKeyword('if')) {
      // console.log(`[Parser DEBUG] -> parsing if statement`);
      return this.parseIfStatement();
    }
    if (this.matchKeyword('for')) {
      // console.log(`[Parser DEBUG] -> parsing for loop`);
      return this.parseForLoop();
    }
    if (this.matchKeyword('while')) {
      // console.log(`[Parser DEBUG] -> parsing while loop`);
      return this.parseWhileLoop();
    }
    if (this.matchKeyword('return')) {
      // console.log(`[Parser DEBUG] -> parsing return`);
      return this.parseReturn();
    }
    if (this.matchKeyword('assert')) {
      // console.log(`[Parser DEBUG] -> parsing assert`);
      return this.parseAssert();
    }
    if (this.matchKeyword('var')) {
      // console.log(`[Parser DEBUG] -> parsing variable`);
      const variables = this.parseVariableDeclarations();
      if (variables.length === 1) return variables[0];
      return {
        type: 'BlockStatement',
        body: variables,
        line: variables[0]?.line ?? this.previous().line
      };
    }
    if (this.matchKeyword('signal')) {
      const signals = this.parseSignalDeclarations();
      if (signals.length === 1) return signals[0];
      return {
        type: 'BlockStatement',
        body: signals,
        line: signals[0]?.line ?? this.previous().line
      };
    }
    if (this.matchKeyword('component')) {
      return this.parseComponentInstantiation();
    }
    if (this.checkPunctuation('{')) {
      // Handle block statement
      // console.log(`[Parser DEBUG] -> parsing block statement`);
      const body = this.parseBlock();
      return {
        type: 'BlockStatement',
        body,
        line: this.peek().line
      };
    }
    
    // Check for tuple assignment: (a, b) <== expr
    if (this.checkPunctuation('(')) {
      const savedPos = this.current;
      
      // Try to parse as tuple assignment
      try {
        // Parse the tuple
        this.consumePunctuation('(');
        const elements: ExpressionNode[] = [];
        elements.push(this.parseExpression());
        
        // Check if this is a tuple (has comma)
        if (this.matchPunctuation(',')) {
          do {
            elements.push(this.parseExpression());
          } while (this.matchPunctuation(','));
          
          this.consumePunctuation(')');
          
          const operator = this.matchAssignmentOperator();
          
          const right = this.parseExpression();
          this.consumePunctuation(';');
          
          return {
            type: 'Assignment',
            left: {
              type: 'Tuple',
              elements,
              line: this.previous().line
            },
            operator,
            right,
            line: (elements[0] as any).line
          };
        } else {
          // Not a tuple, just a parenthesized expression, restore and parse normally
          this.current = savedPos;
        }
      } catch (error) {
        // If parsing fails, restore position and parse normally
        this.current = savedPos;
      }
    }
    
    // Parse expression first
    const expr = this.parseExpression();
    // console.log(`[Parser DEBUG] position after parseExpression: ${this.current}, next token: ${this.peek().type}:${this.peek().value}`);
    
    // Check if NEXT token is a semicolon (standalone expression statement)
    if (this.checkPunctuation(';')) {
      this.consumePunctuation(';');

      // Anonymous component as statement: Template(args)(inputs);
      if ((expr as any).type === 'ComponentCall') {
        const call = expr as any;
        return {
          type: 'ComponentInstantiationNode',
          name: call.template,
          templateName: call.template,
          arguments: call.templateArgs,
          callArgs: call.callArgs,
          publicSignals: [],
          isAnonymous: true,
          line: call.line
        } as any;
      }

      return {
        type: 'ExpressionStatement',
        expression: expr,
        line: (expr as any).line
      };
    }
    
    // Otherwise, let parseAssignment handle the operator and semicolon
    // console.log(`[Parser DEBUG] -> parsing assignment`);
    return this.parseAssignment(expr);
  }

  private parseAssignment(left: ExpressionNode): AssignmentNode | ComponentInstantiationNode {
    const leftExpr = left;
    const operator = this.matchAssignmentOperator();

    const right = this.parseExpression();
    this.consumePunctuation(';');

    // Anonymous component in assignment: target <== Template(args)(inputs);
    if ((right as any).type === 'ComponentCall') {
      const call = right as any;
      const targetName = leftExpr.type === 'Identifier' ? leftExpr.name : `__anon_${call.line}`;
      return {
        type: 'ComponentInstantiationNode',
        name: targetName,
        templateName: call.template,
        arguments: call.templateArgs,
        callArgs: call.callArgs,
        publicSignals: [],
        isAnonymous: true,
        line: (leftExpr as any).line
      };
    }

    return {
      type: 'Assignment',
      left: leftExpr,
      operator,
      right,
      line: (leftExpr as any).line
    };
  }

  private matchAssignmentOperator(): '<==' | '==>' | '===' | '<--' | '-->' | '+=' | '-=' | '*=' | '/=' | '&=' | '|=' | '^=' | '\\=' | '=' {
    const ops: Array<'<==' | '==>' | '===' | '<--' | '-->' | '+=' | '-=' | '*=' | '/=' | '&=' | '|=' | '^=' | '\\='> = [
      '<==', '==>', '===', '<--', '-->', '+=', '-=', '*=', '/=', '&=', '|=', '^=', '\\=',
    ];
    for (const op of ops) {
      if (this.matchOperator(op)) return op;
    }
    this.consumeOperator('=');
    return '=';
  }

  private parseBlock(): StatementNode[] {
    // console.log(`[Parser DEBUG] parseBlock called`);
    this.consumePunctuation('{');
    const body: StatementNode[] = [];
    while (!this.checkPunctuation('}') && !this.isAtEnd()) {
      body.push(this.parseStatement());
    }
    this.consumePunctuation('}');
    // console.log(`[Parser DEBUG] parseBlock parsed ${body.length} statements`);
    return body;
  }

  private parseIfStatement(): IfStatementNode {
    const line = this.previous().line;
    return this.parseIfStatementBody(line);
  }

  private parseIfStatementBody(startLine: number): IfStatementNode {
    const line = startLine;
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
      // Check for 'else if' pattern
      if (this.matchKeyword('if')) {
        // Parse else if as a nested if statement
        elseBranch = [this.parseIfStatementBody(this.previous().line)];
      } else {
        // Parse else block
        this.consumePunctuation('{');
        elseBranch = [];
        while (!this.checkPunctuation('}') && !this.isAtEnd()) {
          elseBranch.push(this.parseStatement());
        }
        this.consumePunctuation('}');
      }
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
    
    // Handle optional 'var' keyword
    if (this.matchKeyword('var')) {
    }
    
    const variable = this.consumeIdentifier();
    this.consumeOperator('=');
    const start = this.parseExpression();
    this.consumePunctuation(';');
    const end = this.parseExpression();
    this.consumePunctuation(';');
    
    let step: ExpressionNode | undefined;
    if (!this.checkPunctuation(')')) {
      // Parse step expression (may be a compound assignment like i += 4)
      const stepLeft = this.parseExpression();
      
      // Check for compound assignment operator
      if (this.matchOperator('+=') || this.matchOperator('-=') || this.matchOperator('*=') ||
          this.matchOperator('/=') || this.matchOperator('&=') || this.matchOperator('|=') ||
          this.matchOperator('^=') || this.matchOperator('\\=')) {
        // This is a compound assignment, create a BinaryOp to represent it
        const operator = this.previous().value;
        const stepRight = this.parseExpression();
        step = {
          type: 'BinaryOp',
          operator,
          left: stepLeft,
          right: stepRight,
          line: (stepLeft as any).line
        };
      } else {
        // Simple expression (e.g., just "1" or "i")
        step = stepLeft;
      }
    }
    this.consumePunctuation(')');

    // Handle both braced and non-braced for loops
    const body: StatementNode[] = [];
    if (this.matchPunctuation('{')) {
      // Braced version
      while (!this.checkPunctuation('}') && !this.isAtEnd()) {
        body.push(this.parseStatement());
      }
      this.consumePunctuation('}');
    } else {
      // Single statement version
      body.push(this.parseStatement());
    }

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

  private parseWhileLoop(): WhileLoopNode {
    const line = this.previous().line;
    this.consumePunctuation('(');
    const condition = this.parseExpression();
    this.consumePunctuation(')');

    // Handle both braced and non-braced while loops
    const body: StatementNode[] = [];
    if (this.matchPunctuation('{')) {
      // Braced version
      while (!this.checkPunctuation('}') && !this.isAtEnd()) {
        body.push(this.parseStatement());
      }
      this.consumePunctuation('}');
    } else {
      // Single statement version
      body.push(this.parseStatement());
    }

    return {
      type: 'WhileLoop',
      condition,
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
    let expr = this.parseBitwiseOr();

    while (this.matchOperator('<') || this.matchOperator('>') ||
           this.matchOperator('<=') || this.matchOperator('>=')) {
      const operator = this.previous().value;
      const right = this.parseBitwiseOr();
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

  private parseBitwiseOr(): ExpressionNode {
    let expr = this.parseBitwiseXor();

    while (this.matchOperator('|')) {
      const operator = this.previous().value;
      const right = this.parseBitwiseXor();
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

  private parseBitwiseXor(): ExpressionNode {
    let expr = this.parseBitwiseAnd();

    while (this.matchOperator('^')) {
      const operator = this.previous().value;
      const right = this.parseBitwiseAnd();
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

  private parseBitwiseAnd(): ExpressionNode {
    let expr = this.parseShift();

    while (this.matchOperator('&')) {
      const operator = this.previous().value;
      const right = this.parseShift();
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

  private parseShift(): ExpressionNode {
    let expr = this.parseTerm();

    while (this.matchOperator('<<') || this.matchOperator('>>')) {
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
    let expr = this.parsePower();

    while (this.matchOperator('*') || this.matchOperator('/') || this.matchOperator('%') || this.matchOperator('\\')) {
      const operator = this.previous().value;
      const right = this.parsePower();
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

  private parsePower(): ExpressionNode {
    let expr = this.parseUnary();

    while (this.matchOperator('**')) {
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

    while (true) {
      if (this.matchPunctuation('[')) {
        const index = this.parseExpression();
        this.consumePunctuation(']');
        expr = {
          type: 'ArrayAccess',
          array: expr,
          index,
          line: (expr as any).line
        };
      } else if (this.matchPunctuation('.')) {
        const property = this.consumeIdentifier();
        expr = {
          type: 'MemberAccess',
          object: expr,
          property,
          line: (expr as any).line
        };
      } else if (this.matchOperator('++')) {
        expr = {
          type: 'UnaryOp',
          operator: '++',
          operand: expr,
          isPostfix: true,
          line: this.previous().line
        };
      } else if (this.matchOperator('--')) {
        expr = {
          type: 'UnaryOp',
          operator: '--',
          operand: expr,
          isPostfix: true,
          line: this.previous().line
        };
      } else {
        break;
      }
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

        // Check for immediate function call - e.g., Func()(args)
        if (this.matchPunctuation('(')) {
          const callArgs: ExpressionNode[] = [];
          if (!this.checkPunctuation(')')) {
            do {
              callArgs.push(this.parseExpression());
            } while (this.matchPunctuation(','));
          }
          this.consumePunctuation(')');

          return {
            type: 'ComponentCall',
            template: name,
            templateArgs: args,
            callArgs,
            line: this.previous().line
          };
        }

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

    // Handle tuple expressions: (a, b, c)
    if (this.matchPunctuation('(')) {
      // Check if this is a tuple by looking ahead for a comma after parsing the first element
      const savedPos = this.current;
      try {
        const firstElement = this.parseExpression();
        
        // If we see a comma, this is a tuple
        if (this.matchPunctuation(',')) {
          const elements: ExpressionNode[] = [firstElement];
          
          // Parse remaining elements
          do {
            elements.push(this.parseExpression());
          } while (this.matchPunctuation(','));
          
          this.consumePunctuation(')');
          
          return {
            type: 'Tuple',
            elements,
            line: this.previous().line
          };
        } else {
          // Not a tuple, just a parenthesized expression
          this.consumePunctuation(')');
          return firstElement;
        }
      } catch (error) {
        // If parsing fails, restore position and try as simple parenthesized expression
        this.current = savedPos;
        const expr = this.parseExpression();
        this.consumePunctuation(')');
        return expr;
      }
    }

    if (this.matchPunctuation('[')) {
      const elements: ExpressionNode[] = [];
      if (!this.checkPunctuation(']')) {
        do {
          elements.push(this.parseExpression());
        } while (this.matchPunctuation(','));
      }
      this.consumePunctuation(']');
      return {
        type: 'ArrayLiteral',
        elements,
        line: this.previous().line
      };
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

  private checkForComponentArrayInitialization(componentName: string): boolean {
    // Look ahead to see if the NEXT statement directly initializes this component array.
    // Only detect direct element assignments: componentName[...] = ... or componentName = ...
    // Do NOT collect for/while loops or blocks — those remain regular template statements.
    const savedPos = this.current;

    try {
      while (this.checkPunctuation(';')) {
        this.advance();
      }

      if (this.checkType('IDENTIFIER') && this.peek().value === componentName) {
        this.advance(); // Skip component name

        if (this.checkPunctuation('[')) {
          this.advance(); // Skip '['
          while (!this.checkPunctuation(']') && !this.isAtEnd()) {
            this.advance();
          }
          if (this.checkPunctuation(']')) {
            this.advance(); // Skip ']'
            if (this.checkOperator('=') || this.checkOperator('<==') || this.checkPunctuation('.')) {
              return true;
            }
          }
        } else if (this.checkOperator('=') || this.checkOperator('<==')) {
          return true;
        }
      }

      return false;
    } finally {
      this.current = savedPos;
    }
  }

  private isComponentArrayInitStatement(componentName: string): boolean {
    // Check if the current statement directly initializes this component array.
    // Only collect statements that start with componentName[...] or componentName.
    // For/while loops and blocks are NOT collected — they remain regular statements.
    const savedPos = this.current;

    try {
      while (this.checkPunctuation(';')) {
        this.advance();
      }

      if (this.isAtEnd()) {
        return false;
      }

      // componentName[...] ... (instantiation, signal assignment, or member access)
      if (this.checkType('IDENTIFIER') && this.peek().value === componentName) {
        this.advance(); // Skip component name

        if (this.checkPunctuation('[')) {
          this.advance(); // Skip '['
          while (!this.checkPunctuation(']') && !this.isAtEnd()) {
            this.advance();
          }
          if (this.checkPunctuation(']')) {
            this.advance(); // Skip ']'
            // Any statement starting with componentName[...] is an init statement
            return true;
          }
        }

        // componentName = ... or componentName <== ...
        if (this.checkOperator('=') || this.checkOperator('<==')) {
          return true;
        }
      }

      return false;
    } finally {
      this.current = savedPos;
    }
  }

  private synchronize(): void {
    // console.log(`[Parser DEBUG] synchronize() called, current position: ${this.current}, previous token: ${this.previous().type}:${this.previous().value}`);
    this.advance();

    let syncCount = 0;
    while (!this.isAtEnd()) {
      if (this.previous().type === 'PUNCTUATION' && this.previous().value === ';') {
        // console.log(`[Parser DEBUG] synchronize() found semicolon, syncing after ${syncCount} tokens`);
        return;
      }

      const type = this.peek().type;
      if (type === 'KEYWORD') {
        const value = this.peek().value;
        if (['template', 'function', 'component', 'signal', 'pragma', 'include'].includes(value)) {
          // console.log(`[Parser DEBUG] synchronize() found keyword: ${value}, stopping`);
          return;
        }
      }

      syncCount++;
      this.advance();
    }
    
    // console.log(`[Parser DEBUG] synchronize() reached end of file without finding sync point`);
  }
}

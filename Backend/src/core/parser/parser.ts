// Converting the token sequence (from lexer.ts) into an AST (Abstract Syntax Tree)
// Construct the tree structure based on circom grammar rules.

import { CircomLexer, Token, TokenType } from './lexer.js';
import { ASTNode, PragmaNode, IncludeNode, TemplateDefinitionNode, FunctionDefinitionNode, SignalNode, VariableNode, ComponentInstantiationNode, ComponentDeclarationNode, ComponentInstantiationWithInitNode, AssignmentNode, IfStatementNode, ForLoopNode, WhileLoopNode, ReturnNode, AssertNode, Parameter, ExpressionNode, StatementNode, BlockStatementNode, TupleNode } from './ast.js';

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
    console.log(`[Parser DEBUG] ========== PARSE START ===========`);
    console.log(`[Parser DEBUG] File: ${filePath}`);
    console.log(`[Parser DEBUG] Tokens: ${this.tokens.length}`);
    
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
          console.log(`[Parser DEBUG] Node ${nodeCount}: ${node.type}${(node as any).name ? `:${(node as any).name}` : ''}`);
          nodes.push(node);
        }
      } catch (error: any) {
        console.log(`[Parser DEBUG] ERROR parsing node: ${error.message}`);
        this.synchronize();
      }
    }

    console.log(`[Parser DEBUG] Total nodes parsed: ${nodes.length}`);
    console.log(`[Parser DEBUG] ========== PARSE END ============`);

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
    console.log(`[Parser DEBUG] parseTemplateDefinition called at line ${this.peek().line}`);
    const line = this.previous().line;
    const name = this.consumeIdentifier();
    console.log(`[Parser DEBUG] Template name: ${name}`);

    this.consumePunctuation('(');
    const parameters: Parameter[] = [];
    if (!this.checkPunctuation(')')) {
      do {
        parameters.push(this.parseParameter());
      } while (this.matchPunctuation(','));
    }
    this.consumePunctuation(')');
    console.log(`[Parser DEBUG] Parsed ${parameters.length} parameters`);

    this.consumePunctuation('{');
    console.log(`[Parser DEBUG] Starting template body parsing`);

    const signals: SignalNode[] = [];
    const variables: VariableNode[] = [];
    const components: (ComponentInstantiationNode | ComponentDeclarationNode | ComponentInstantiationWithInitNode)[] = [];
    const statements: StatementNode[] = [];

    let statementCount = 0;
    while (!this.checkPunctuation('}') && !this.isAtEnd()) {
      statementCount++;
      const token = this.peek();
      console.log(`[Parser DEBUG] Statement ${statementCount}: token type=${token.type}, value=${token.value}`);
      
      if (this.matchKeyword('signal')) {
        console.log(`[Parser DEBUG]   -> parsing signal`);
        signals.push(this.parseSignal());
      } else if (this.matchKeyword('var')) {
        console.log(`[Parser DEBUG]   -> parsing variable`);
        variables.push(this.parseVariable());
      } else if (this.matchKeyword('component')) {
        console.log(`[Parser DEBUG]   -> parsing component`);
        components.push(this.parseComponentInstantiation());
      } else {
        console.log(`[Parser DEBUG]   -> parsing statement`);
        statements.push(this.parseStatement());
      }
    }
    console.log(`[Parser DEBUG] Parsed ${statementCount} statements in template body`);

    this.consumePunctuation('}');
    console.log(`[Parser DEBUG] Template ${name} parsed successfully: ${signals.length} signals, ${components.length} components, ${statements.length} statements`);

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

    // Check for initial value assignment (e.g., signal x[5] <== y;)
    let initialValue: ExpressionNode | undefined;
    if (this.matchOperator('<==')) {
      initialValue = this.parseExpression();
    }
    
    this.consumePunctuation(';');

    return {
      type: 'Signal',
      name,
      kind,
      isArray,
      arraySizes,
      initialValue,
      line
    };
  }

  private parseVariable(): VariableNode {
    const line = this.previous().line;
    const name = this.consumeIdentifier();
    let isArray = false;
    let arraySizes: (number | ExpressionNode)[] | undefined;
    let initialValue: ExpressionNode | undefined;

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

    if (this.matchOperator('=')) {
      initialValue = this.parseExpression();
    }

    this.consumePunctuation(';');

    return {
      type: 'Variable',
      name,
      isArray,
      arraySizes,
      initialValue,
      line
    };
  }

  private parseComponentInstantiation(): ComponentInstantiationNode | ComponentDeclarationNode | ComponentInstantiationWithInitNode {
    console.log(`[Parser DEBUG] parseComponentInstantiation called, next token: ${this.peek().type}:${this.peek().value}`);
    const line = this.previous().line;
    const name = this.consumeIdentifier();
    console.log(`[Parser DEBUG] Component name: ${name}`);
    
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
      // Simple component array declaration without initialization
      this.consumePunctuation(';');

      // Check for optional initialization block
      // In circom, component arrays can have initialization blocks like:
      // component c[5];
      // {
      //     c[0] = A();
      //     c[1] = B();
      // }
      // The block must start with an assignment to component
      if (this.checkPunctuation('{')) {
        // Check if this looks like an initialization block
        // Look ahead to see if first statement is an assignment to component
        const savedPos = this.current;
        this.consumePunctuation('{');
        const isInitBlock = this.checkType('IDENTIFIER') && this.peek().value === name;
        this.current = savedPos;

        if (isInitBlock) {
          // Parse as initialization block
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
        }
        // Otherwise, treat as a regular block statement (will be parsed separately)
        return {
          type: 'ComponentDeclaration',
          name,
          arraySizes,
          line
        };
      }

      return {
        type: 'ComponentDeclaration',
        name,
        arraySizes,
        line
      };
    }

    // Check if this is a component declaration without initialization: component name;
    if (this.checkPunctuation(';')) {
      console.log(`[Parser DEBUG] -> component declaration without initialization`);
      this.consumePunctuation(';');
      return {
        type: 'ComponentDeclaration',
        name,
        line
      };
    }

    // Component instantiation: component name = Template(args);
    // Skip optional { public [...] } block
    if (this.checkPunctuation('{')) {
      console.log(`[Parser DEBUG] -> skipping public block`);
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
    
    // Consume the '=' operator
    this.consumeOperator('=');
    console.log(`[Parser DEBUG] Consumed = operator`);

    const templateName = this.consumeIdentifier();
    console.log(`[Parser DEBUG] Template name: ${templateName}`);

    this.consumePunctuation('(');
    const args: ExpressionNode[] = [];
    if (!this.checkPunctuation(')')) {
      do {
        args.push(this.parseExpression());
      } while (this.matchPunctuation(','));
    }
    this.consumePunctuation(')');
    console.log(`[Parser DEBUG] Parsed ${args.length} arguments`);

    this.consumePunctuation(';');

    console.log(`[Parser DEBUG] Component parsed successfully: ${name} = ${templateName}`);
    return {
      type: 'ComponentInstantiationNode',
      name,
      templateName,
      arguments: args,
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
    console.log(`[Parser DEBUG] parseStatement called, next token: ${this.peek().type}:${this.peek().value}`);
    console.log(`[Parser DEBUG] current position before parsing: ${this.current}`);
    
    if (this.matchKeyword('if')) {
      console.log(`[Parser DEBUG] -> parsing if statement`);
      return this.parseIfStatement();
    }
    if (this.matchKeyword('for')) {
      console.log(`[Parser DEBUG] -> parsing for loop`);
      return this.parseForLoop();
    }
    if (this.matchKeyword('while')) {
      console.log(`[Parser DEBUG] -> parsing while loop`);
      return this.parseWhileLoop();
    }
    if (this.matchKeyword('return')) {
      console.log(`[Parser DEBUG] -> parsing return`);
      return this.parseReturn();
    }
    if (this.matchKeyword('assert')) {
      console.log(`[Parser DEBUG] -> parsing assert`);
      return this.parseAssert();
    }
    if (this.matchKeyword('var')) {
      console.log(`[Parser DEBUG] -> parsing variable`);
      return this.parseVariable();
    }
    if (this.checkPunctuation('{')) {
      // Handle block statement
      console.log(`[Parser DEBUG] -> parsing block statement`);
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
          
          // Now check for assignment operator
          let operator: '<==' | '==>' | '===' | '<--' | '-->' | '+=' | '-=' | '*=' | '/=' | '&=' | '|=' | '^=' | '\\=' | '=' = '=';
          if (this.matchOperator('<==')) {
            operator = '<==';
          } else if (this.matchOperator('==>')) {
            operator = '==>';
          } else if (this.matchOperator('===')) {
            operator = '===';
          } else if (this.matchOperator('<--')) {
            operator = '<--';
          } else if (this.matchOperator('-->')) {
            operator = '-->';
          } else if (this.matchOperator('+=')) {
            operator = '+=';
          } else if (this.matchOperator('-=')) {
            operator = '-=';
          } else if (this.matchOperator('*=')) {
            operator = '*=';
          } else if (this.matchOperator('/=')) {
            operator = '/=';
          } else if (this.matchOperator('&=')) {
            operator = '&=';
          } else if (this.matchOperator('|=')) {
            operator = '|=';
          } else if (this.matchOperator('^=')) {
            operator = '^=';
          } else if (this.matchOperator('\\=')) {
            operator = '\\=';
          } else {
            this.consumeOperator('=');
          }
          
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
    console.log(`[Parser DEBUG] position after parseExpression: ${this.current}, next token: ${this.peek().type}:${this.peek().value}`);
    
    // Check if the NEXT token is a semicolon (standalone expression statement)
    if (this.checkPunctuation(';')) {
      console.log(`[Parser DEBUG] -> found standalone expression statement`);
      this.consumePunctuation(';');
      return {
        type: 'ExpressionStatement',
        expression: expr,
        line: (expr as any).line
      };
    }
    
    // Otherwise, let parseAssignment handle the operator and semicolon
    console.log(`[Parser DEBUG] -> parsing assignment`);
    return this.parseAssignment();
  }

  private parseAssignment(): AssignmentNode {
    // Left side should already be parsed (we're positioned at it from parseStatement)
    const left = this.previous() as any;
    
    let operator: '<==' | '==>' | '===' | '<--' | '-->' | '+=' | '-=' | '*=' | '/=' | '&=' | '|=' | '^=' | '\\=' | '=' = '=';
    if (this.matchOperator('<==')) {
      operator = '<==';
    } else if (this.matchOperator('==>')) {
      operator = '==>';
    } else if (this.matchOperator('===')) {
      operator = '===';
    } else if (this.matchOperator('<--')) {
      operator = '<--';
    } else if (this.matchOperator('-->')) {
      operator = '-->';
    } else if (this.matchOperator('+=')) {
      operator = '+=';
    } else if (this.matchOperator('-=')) {
      operator = '-=';
    } else if (this.matchOperator('*=')) {
      operator = '*=';
    } else if (this.matchOperator('/=')) {
      operator = '/=';
    } else if (this.matchOperator('&=')) {
      operator = '&=';
    } else if (this.matchOperator('|=')) {
      operator = '|=';
    } else if (this.matchOperator('^=')) {
      operator = '^=';
    } else if (this.matchOperator('\\=')) {
      operator = '\\=';
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
      line: (left as any).line
    };
  }

  private parseBlock(): StatementNode[] {
    console.log(`[Parser DEBUG] parseBlock called`);
    this.consumePunctuation('{');
    const body: StatementNode[] = [];
    while (!this.checkPunctuation('}') && !this.isAtEnd()) {
      body.push(this.parseStatement());
    }
    this.consumePunctuation('}');
    console.log(`[Parser DEBUG] parseBlock parsed ${body.length} statements`);
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
    console.log(`[Parser DEBUG] synchronize() called, current position: ${this.current}, previous token: ${this.previous().type}:${this.previous().value}`);
    this.advance();

    let syncCount = 0;
    while (!this.isAtEnd()) {
      if (this.previous().type === 'PUNCTUATION' && this.previous().value === ';') {
        console.log(`[Parser DEBUG] synchronize() found semicolon, syncing after ${syncCount} tokens`);
        return;
      }

      const type = this.peek().type;
      if (type === 'KEYWORD') {
        const value = this.peek().value;
        if (['template', 'function', 'component', 'signal', 'pragma', 'include'].includes(value)) {
          console.log(`[Parser DEBUG] synchronize() found keyword: ${value}, stopping`);
          return;
        }
      }

      syncCount++;
      this.advance();
    }
    
    console.log(`[Parser DEBUG] synchronize() reached end of file without finding sync point`);
  }
}

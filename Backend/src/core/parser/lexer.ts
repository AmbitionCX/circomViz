// Circom Lexical Analyzer
// Convert the source code string into a token sequence

export type TokenType =
  | 'KEYWORD'       // template, component, signal, include, pragma, function, return, if, for, var
  | 'IDENTIFIER'    // identifier
  | 'NUMBER'        // number
  | 'OPERATOR'      // <==, ==> , ===, =, *, +, -, /, %, &&, ||, !, <, >, <=, >=, ==, !=
  | 'PUNCTUATION'   // ;, {, }, (, ), [, ], <, >, :, , (comma)
  | 'STRING'        // string
  | 'COMMENT'       // comments
  | 'WHITESPACE';   // space

// Token type of token sequence
export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export class CircomLexer {
  private keywords = new Set([
    'pragma', 'template', 'component', 'signal', 'input', 'output', 
    'include', 'function', 'return', 'if', 'else', 'for', 'var',
    'assert'
  ]);

  private operators = new Set([
    '<==', '==>', '===', '<=', '>=', '==', '!=', '=',
    '&&', '||', '++', '--', '+', '-', '*', '/', '%',
    '&', '|', '^', '~', '<<', '>>', '\\', '<', '>', '?', ':', '=>'
  ]);

  private source: string;
  private tokens: Token[] = [];
  private pos = 0;
  private line = 1;
  private column = 1;

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    this.tokens = [];
    this.pos = 0;
    this.line = 1;
    this.column = 1;

    while (this.pos < this.source.length) {
      const char = this.source[this.pos];

      if (/\s/.test(char)) {
        this.skipWhitespace();
      } else if (char === '/' && this.peekChar() === '*') {
        this.skipMultiLineComment();
      } else if (char === '/' && this.peekChar() === '/') {
        this.skipLineComment();
      } else if (char === '"') {
        this.readString();
      } else if (/[a-zA-Z_]/.test(char)) {
        this.readIdentifierOrKeyword();
      } else if (/[0-9]/.test(char)) {
        this.readNumber();
      } else if (this.isOperatorStart(char)) {
        this.readOperator();
      } else if (this.isPunctuation(char)) {
        this.readPunctuation();
      } else {
        throw new Error(`Unexpected character '${char}' at line ${this.line}, column ${this.column}`);
      }
    }

    return this.tokens;
  }

  private peekChar(offset = 1): string {
    return this.source[this.pos + offset] || '';
  }

  private addToken(type: TokenType, value: string): void {
    this.tokens.push({
      type,
      value,
      line: this.line,
      column: this.column
    });
  }

  private advance(): void {
    const char = this.source[this.pos++];
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
  }

  private skipWhitespace(): void {
    while (this.pos < this.source.length && /\s/.test(this.source[this.pos])) {
      this.advance();
    }
  }

  private skipLineComment(): void {
    while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
      this.advance();
    }
  }

  private skipMultiLineComment(): void {
    this.advance(); // Skip /
    this.advance(); // Skip *

    while (this.pos < this.source.length) {
      if (this.source[this.pos] === '*' && this.peekChar() === '/') {
        this.advance(); // Skip *
        this.advance(); // Skip /
        return;
      }
      this.advance();
    }

    throw new Error('Unterminated multi-line comment');
  }

  private readString(): void {
    let value = '';
    this.advance(); // Skip the beginning "

    while (this.pos < this.source.length && this.source[this.pos] !== '"') {
      value += this.source[this.pos];
      this.advance();
    }

    if (this.source[this.pos] !== '"') {
      throw new Error(`Unterminated string at line ${this.line}, column ${this.column}`);
    }

    this.advance(); // Skip the end of "

    this.addToken('STRING', value);
  }

  private readIdentifierOrKeyword(): void {
    let value = '';
    const startColumn = this.column;

    while (this.pos < this.source.length && /[a-zA-Z0-9_]/.test(this.source[this.pos])) {
      value += this.source[this.pos];
      this.advance();
    }

    const type = this.keywords.has(value) ? 'KEYWORD' : 'IDENTIFIER';
    this.addToken(type, value);
  }

  private readNumber(): void {
    let value = '';
    const startColumn = this.column;

    while (this.pos < this.source.length && /[0-9]/.test(this.source[this.pos])) {
      value += this.source[this.pos];
      this.advance();
    }

    if (this.pos < this.source.length && this.source[this.pos] === '.') {
      const nextChar = this.peekChar(1);
      if (nextChar && /[0-9]/.test(nextChar)) {
        value += this.source[this.pos];
        this.advance();

        while (this.pos < this.source.length && /[0-9]/.test(this.source[this.pos])) {
          value += this.source[this.pos];
          this.advance();
        }
      }
    }

    this.addToken('NUMBER', value);
  }

  private isOperatorStart(char: string): boolean {
    return /[+\-*/%=!<>&|^~]/.test(char) || char === '<' || char === '>' || char === '\\' || char === '?' || char === ':';
  }

  private readOperator(): void {
    let value = '';
    const startColumn = this.column;

    while (this.pos < this.source.length && this.isOperatorStart(this.source[this.pos])) {
      value += this.source[this.pos];
      this.advance();
    }

    // Try to match the longest operator
    while (value.length > 0 && !this.operators.has(value)) {
      value = value.slice(0, -1);
      this.pos--;
      this.column--;
    }

    if (value.length === 0) {
      throw new Error(`Invalid operator at line ${this.line}, column ${this.column}`);
    }

    this.addToken('OPERATOR', value);
  }

  private isPunctuation(char: string): boolean {
    return /[;{}()[\]:,.]/.test(char);
  }

  private readPunctuation(): void {
    const startColumn = this.column;
    const value = this.source[this.pos];
    this.advance();
    
    this.addToken('PUNCTUATION', value);
  }
}

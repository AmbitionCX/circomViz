export enum ErrorLevel {
  WARNING = 'warning',
  ERROR = 'error',
  INFO = 'info'
}

export interface ParseMessage {
  level: 'warning' | 'error' | 'info';
  file?: string;
  line?: number;
  message: string;
}

export class ErrorCollector {
  private messages: ParseMessage[] = [];

  add(message: ParseMessage): void {
    this.messages.push(message);
  }

  error(message: string, file?: string, line?: number): void {
    this.add({
      level: 'error',
      file,
      line,
      message
    });
  }

  warning(message: string, file?: string, line?: number): void {
    this.add({
      level: 'warning',
      file,
      line,
      message
    });
  }

  info(message: string, file?: string): void {
    this.add({
      level: 'info',
      file,
      message
    });
  }

  getAll(): ParseMessage[] {
    return [...this.messages];
  }

  getErrors(): ParseMessage[] {
    return this.messages.filter(m => m.level === 'error');
  }

  getWarnings(): ParseMessage[] {
    return this.messages.filter(m => m.level === 'warning');
  }

  hasErrors(): boolean {
    return this.messages.some(m => m.level === 'error');
  }

  clear(): void {
    this.messages = [];
  }
}

export class CircomParseError extends Error {
  constructor(
    message: string,
    public file?: string,
    public line?: number,
    public column?: number
  ) {
    super(message);
    this.name = 'CircomParseError';
  }

  toString(): string {
    let result = this.message;
    if (this.file) {
      result = `${this.file}:${this.line || '?'}: ${result}`;
    }
    return result;
  }
}

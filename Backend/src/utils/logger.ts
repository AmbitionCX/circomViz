// 日志工具

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

function configuredLogLevel(): LogLevel {
  const value = process.env.LOG_LEVEL?.trim().toUpperCase();
  if (value && value in LogLevel && typeof LogLevel[value as keyof typeof LogLevel] === 'number') {
    return LogLevel[value as keyof typeof LogLevel] as LogLevel;
  }
  return LogLevel.INFO;
}

export class Logger {
  private level: LogLevel;
  private context: string;

  constructor(context: string, level: LogLevel = configuredLogLevel()) {
    this.context = context;
    this.level = level;
  }

  debug(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(`[${this.context}] DEBUG:`, message, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.info(`[${this.context}] INFO:`, message, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(`[${this.context}] WARN:`, message, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(`[${this.context}] ERROR:`, message, ...args);
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setContext(context: string): void {
    this.context = context;
  }
}

export const logger = new Logger('Backend');

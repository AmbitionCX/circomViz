import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from './logger.js';

const logger = new Logger('CompilationLog');

export interface CompilationLog {
  timestamp: string;
  templateName: string;
  templatePath: string[];
  status: 'success' | 'error';
  constraintCount: number;
  signalCount: number;
  substitutionCount: number;
  executionTimeMs: number;
  error?: string;
}

class CompilationLogger {
  private logDir: string;

  constructor() {
    this.logDir = path.join(process.cwd(), 'logs', 'compilation');
  }

  private async ensureLogDir(): Promise<void> {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      logger.error(`Failed to create log directory: ${error instanceof Error ? error.message : error}`);
    }
  }

  async logCompilation(log: CompilationLog): Promise<void> {
    await this.ensureLogDir();

    const timestamp = new Date(log.timestamp).toISOString().replace(/[:.]/g, '-');
    const safeTemplateName = log.templateName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `compilation_${safeTemplateName}_${timestamp}.json`;
    const filepath = path.join(this.logDir, filename);

    try {
      await fs.writeFile(filepath, JSON.stringify(log, null, 2), 'utf-8');
    } catch (error) {
      logger.error(`Failed to write compilation log: ${error instanceof Error ? error.message : error}`);
    }
  }
}

export const compilationLogger = new CompilationLogger();

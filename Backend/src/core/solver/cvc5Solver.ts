import { spawn, type ChildProcess } from 'child_process';

type SatResult = 'sat' | 'unsat' | 'unknown';

const DEFAULT_TIMEOUT_MS = 6000000;

export class Cvc5Solver {
  private binaryPath = '/opt/cvc5/bin/cvc5';
  private proc: ChildProcess | null = null;
  private timeoutMs: number;

  constructor(timeoutMs?: number) {
    this.timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async executeSMT2(smt2Script: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const proc = spawn(this.binaryPath, ['--lang=smt2', '--produce-models', `--tlimit=${this.timeoutMs}`], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        proc.kill('SIGKILL');
        reject(new Error(`cvc5 timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs + 5000);

      if (proc.stdout) {
        proc.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });
      }

      if (proc.stderr) {
        proc.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
      }

      proc.on('error', (err) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        reject(new Error(`Failed to start cvc5: ${err.message}`));
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        if (code !== 0 && stderr) {
          reject(new Error(`cvc5 exited with code ${code}: ${stderr}`));
        } else {
          resolve(stdout.trim());
        }
      });

      proc.stdin!.write(smt2Script);
      proc.stdin!.end();

      this.proc = proc;
    });
  }

  async executeIncrementalSMT2(commands: string[]): Promise<string> {
    const script = commands.join('\n') + '\n';
    return this.executeSMT2(script);
  }

  async close(): Promise<void> {
    if (this.proc && !this.proc.killed) {
      try {
        this.proc.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    this.proc = null;
  }
}

export type { SatResult };

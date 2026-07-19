import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { logger } from '../../utils/logger.js';

export interface CompileWitnessResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

export async function compileWitness(
  wrapperFilePath: string,
  includePaths: string[],
  outputDir: string
): Promise<CompileWitnessResult> {
  try {
    await fs.mkdir(outputDir, { recursive: true });

    logger.info('Running witness compilation (wasm, sanity_check)...');
    const args = [
      ...includePaths.flatMap((includePath) => ['-l', includePath]),
      wrapperFilePath,
      '--wasm',
      '--sym',
      '--sanity_check',
      '2',
      '--O0',
      '-o',
      outputDir,
    ];
    logger.debug(`Executing: circom ${args.join(' ')}`);

    const result = await runCommand('circom', args, outputDir);

    logger.info(`Witness compilation completed`);

    return {
      success: true,
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error: any) {
    logger.error(`Witness compilation failed: ${error.message}`);
    return {
      success: false,
      stdout: '',
      stderr: error.message
    };
  }
}

function runCommand(command: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `circom exited with code ${code}`));
      }
    });
  });
}

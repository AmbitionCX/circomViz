import { exec } from 'child_process';
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
  includeFlags: string,
  outputDir: string
): Promise<CompileWitnessResult> {
  try {
    await fs.mkdir(outputDir, { recursive: true });

    logger.info('Running witness compilation (wasm, sanity_check)...');
    const cmd = `circom ${includeFlags} "${wrapperFilePath}" --wasm --sym --sanity_check 2 --O0 -o "${outputDir}"`;
    logger.debug(`Executing: ${cmd}`);

    const result = await execPromise(cmd, join(outputDir, '..'));

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

function execPromise(command: string, cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

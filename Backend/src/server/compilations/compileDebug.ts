import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { logger } from '../../utils/logger.js';

export interface CompileDebugResult {
  success: boolean;
  stdout: string;
  stderr: string;
  constraints?: number;
  privateInputs?: string[];
  publicInputs?: string[];
  outputs?: string[];
}

export async function compileDebug(
  wrapperFilePath: string,
  includePaths: string[],
  outputDir: string
): Promise<CompileDebugResult> {
  try {
    await fs.mkdir(outputDir, { recursive: true });

    logger.info('Running debug compilation (O0, inspect)...');
    const args = [
      ...includePaths.flatMap((includePath) => ['-l', includePath]),
      wrapperFilePath,
      '--r1cs',
      '--json',
      '--sym',
      '--inspect',
      '--O0',
      '-o',
      outputDir,
    ];

    logger.debug(`Executing: circom ${args.join(' ')}`);

    const stdoutPath = join(outputDir, 'inspect.stdout');
    const stderrPath = join(outputDir, 'inspect.stderr');

    const result = await runCommand('circom', args, outputDir);

    await fs.writeFile(stdoutPath, result.stdout, 'utf-8');
    await fs.writeFile(stderrPath, result.stderr, 'utf-8');

    logger.info(`Debug compilation completed`);

    try {
      const jsonPath = join(outputDir, 'wrapper_constraints.json');
      const json = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));

      logger.info(`Debug output: ${JSON.stringify({
        constraints: json.constraints?.length || 0,
        privateInputs: Object.keys(json.private_inputs || {}),
        publicInputs: Object.keys(json.public_inputs || {}),
        outputs: Object.keys(json.outputs || {})
      })}`);

      return {
        success: true,
        stdout: result.stdout,
        stderr: result.stderr,
        constraints: json.constraints?.length || 0,
        privateInputs: Object.keys(json.private_inputs || {}),
        publicInputs: Object.keys(json.public_inputs || {}),
        outputs: Object.keys(json.outputs || {})
      };
    } catch (jsonError) {
      logger.warn(`Failed to parse debug JSON: ${jsonError}`);
      return {
        success: true,
        stdout: result.stdout,
        stderr: result.stderr
      };
    }
  } catch (error: any) {
    logger.error(`Debug compilation failed: ${error.message}`);
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

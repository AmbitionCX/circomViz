import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { logger } from '../../utils/logger.js';

export async function compileBasic(wrapperFilePath: string, includePaths: string[], outputDir: string) {
  try {
    await fs.mkdir(outputDir, { recursive: true });
    const args = [...includePaths.flatMap((includePath) => ['-l', includePath]), wrapperFilePath, '--r1cs', '--json', '--sym', '--simplification_substitution', '--O1', '-o', outputDir];
    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn('circom', args, { cwd: outputDir }); let stdout = ''; let stderr = '';
      child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('error', reject);
      child.on('close', (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr || `circom exited with code ${code}`)));
    });
    return { success: true, ...result };
  } catch (error: any) {
    logger.error(`Basic O1 compilation failed: ${error.message}`);
    return { success: false, stdout: '', stderr: error.message };
  }
}

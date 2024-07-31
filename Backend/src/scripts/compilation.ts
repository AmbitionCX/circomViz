// compilation.ts
import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function saveCode(folderName: string, fileName: string, code: string): Promise<void> {
    const folderPath = path.join(__dirname, '..', '..', 'compilations', folderName);
    try {
        await fs.promises.mkdir(folderPath, { recursive: true });
    } catch (error: any) {
        throw new Error(`Failed to create folder: ${error.message}`);
    }

    const filePath = path.join(folderPath, fileName);
    try {
        await fs.promises.writeFile(filePath, code);
    } catch (error: any) {
        throw new Error(`Failed to save file: ${error.message}`);
    }

    await compileCircomCode(folderPath, filePath);
}

async function compileCircomCode(folderPath: string, filePath: string): Promise<void> {
    const libraryPath = path.join(__dirname, '..', '..');

    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execPromise = promisify(exec);

    try {
        const { stdout, stderr } = await execPromise(`circom -l ${libraryPath} -o ${folderPath} ${filePath} --r1cs --sym`);
        console.log(stdout);
        
        if (stderr) {
            throw new Error(stderr);
        }
    } catch (error: any) {
        throw new Error(`Failed to compile Circom code: ${error.message}`);
    }
}
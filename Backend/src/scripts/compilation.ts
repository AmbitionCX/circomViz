// compilation.ts
import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function saveCode(folderName: string, fileName: string, code: string): Promise<void> {
    let folderPath = path.join(__dirname, '..', '..', 'compilations', folderName);
    try {
        await fs.promises.mkdir(folderPath, { recursive: true });
    } catch (error: any) {
        throw new Error(`Failed to create folder: ${error.message}`);
    }

    let filePath = path.join(folderPath, fileName);
    try {
        await fs.promises.writeFile(filePath, code);
    } catch (error: any) {
        throw new Error(`Failed to save file: ${error.message}`);
    }
}
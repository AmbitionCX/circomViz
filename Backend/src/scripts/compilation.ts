// compilation.ts
import { log } from 'console';
import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

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

  await compileCircomCode(folderPath, filePath).then((result) => {
    const { symbolFile, constraintFile } = result
    generateDAG(symbolFile, constraintFile).then((result) => {
      console.log(result);

    })
  })
}

async function compileCircomCode(folderPath: string, filePath: string): Promise<{ symbolFile: string, constraintFile: string }> {
  const libraryPath = path.join(__dirname, '..', '..');

  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execPromise = promisify(exec);

  try {
    const { stdout, stderr } = await execPromise(`circom -l ${libraryPath} -o ${folderPath} ${filePath} --sym --json --O2`);

    const stdoutLines = stdout.split('\n');
    let symbolFile = '';
    let constraintFile = '';

    stdoutLines.forEach(line => {
      if (line.trim().endsWith('.sym')) {
        symbolFile = line.trim().split(' ')[2];
      }
      if (line.trim().endsWith('.json')) {
        constraintFile = line.trim().split(' ')[3];
      }
    });

    if (stderr) {
      throw new Error(stderr);
    }

    return { symbolFile, constraintFile };

  } catch (error: any) {
    throw new Error(`Failed to compile Circom code: ${error.message}`);
  }
}

export const generateDAG = async (symbolFile: string, constraintFile: string): Promise<void> => {
  // sym format: #s, #w, #c, name
  // https://docs.circom.io/circom-language/formats/sym/

  // Read the sym file
  const symFileContent = await fs.promises.readFile(symbolFile, 'utf8');
  const symLines = symFileContent.split('\n');

  interface Symbol {
    signal: string;
    witness: string;
    component: string;
    name: string;
  }
  const symbols: Symbol[] = [];

  symLines.forEach(line => {
    const [signal, witness, component, name] = line.split(',');
    symbols.push({ signal, witness, component, name });
  })

  console.log("symbols", symbols);

  // R1CS json format
  // https://docs.circom.io/circom-language/formats/constraints-json/

  const constraintFileContent = await fs.promises.readFile(constraintFile, 'utf8');
  const constraints = JSON.parse(constraintFileContent).constraints;

  console.log("constraints", constraints);

  
}

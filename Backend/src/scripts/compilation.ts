import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execPromise = promisify(exec);

export async function saveCode(folderName: string, fileName: string, code: string): Promise<any> {
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

  return await compileCircomCode(folderPath, filePath).then(async (result) => {
    const { symbolFilePath, constraintFilePath, substitutionFilePath } = result;

    let circuitData = {
      "symbols": {},
      "constraints": {},
      "substitutions": {}
    };

    // building symbols
    const symbolFile = fs.readFileSync(symbolFilePath, 'utf-8');
    const symbol_lines = symbolFile.split('\n');
    const symbols: any[] = [];

    symbol_lines.forEach((line) => {
      const fields = line.split(',');

      // symbol file format
      // https://docs.circom.io/circom-language/formats/sym/
      if (fields.length >= 2) { // this line really have content
        const obj: any = {};
        fields.forEach((symbol_field, symbol_index) => {
          switch (symbol_index) {
            case 0:
              obj['symbol_id'] = symbol_field.trim();
              break;
            case 1:
              break;
            case 2:
              obj['component'] = symbol_field.trim();
              break;
            case 3:
              obj['name'] = symbol_field.trim();
              break;
            default:
              console.log('Redundant columns in symbol file');
          }
        });
        symbols.push(obj);
      }
    });
    circuitData.symbols = symbols;

    // building constraints
    const constraintFile = fs.readFileSync(constraintFilePath, 'utf-8');
    const constraintJSON = JSON.parse(constraintFile);
    const constraints: any[] = [];

    // JSON constraints format
    // https://docs.circom.io/circom-language/formats/constraints-json/
    for (const constraintList of constraintJSON.constraints) {
      // traversal of all constraint
      let obj = {
        lin_expr_A: [] as string[],
        lin_expr_B: [] as string[],
        lin_expr_C: [] as string[],
      };

      for (const linear_expresion of constraintList) {
        // traversal the linear expresion of each constraint
        let linear_expresion_index = constraintList.indexOf(linear_expresion);
        let keys: any[] = [];

        for (const [key, _] of Object.entries(linear_expresion)) {
          keys.push(key);
        }

        switch (linear_expresion_index) {
          case 0:
            obj.lin_expr_A.push(...keys);
            break;
          case 1:
            obj.lin_expr_B.push(...keys);
            break;
          case 2:
            obj.lin_expr_C.push(...keys);
            break;
          default:
            console.log('Overflow in constraint parsing');
        }
      }
      constraints.push(obj);
    };
    circuitData.constraints = constraints;

    // building substitutions
    const substitutionFile = fs.readFileSync(substitutionFilePath, 'utf-8');
    const substitutions = JSON.parse(substitutionFile);
    circuitData.substitutions = substitutions;

    return circuitData;
  });
}

async function compileCircomCode(folderPath: string, filePath: string): Promise<{ symbolFilePath: string, constraintFilePath: string, substitutionFilePath: string }> {
  const libraryPath = path.join(__dirname, '..', '..');

  try {
    const { stdout, stderr } = await execPromise(`circom -l ${libraryPath} -o ${folderPath} ${filePath} --sym --json --simplification_substitution --O2`);

    const stdoutLines = stdout.split('\n');

    let symbolFilePath = '';
    let constraintFilePath = '';
    let substitutionFilePath = '';

    stdoutLines.forEach(line => {
      if (line.trim().endsWith('.sym')) {
        symbolFilePath = line.trim().split(' ')[2];
      }
      if (line.trim().endsWith('constraints.json')) {
        constraintFilePath = line.trim().split(' ')[3];
      }
      if (line.trim().endsWith('substitutions.json')) {
        substitutionFilePath = line.trim().split(' ')[2];
      }
    });

    if (!symbolFilePath || !constraintFilePath) {
      throw new Error('Symbol file or constraint file not found in the output.');
    }
    if (stderr) {
      throw new Error(stderr);
    }
    return { symbolFilePath, constraintFilePath, substitutionFilePath };
  } catch (error: any) {
    throw new Error(`Failed to compile Circom code: ${error.message}`);
  }
}
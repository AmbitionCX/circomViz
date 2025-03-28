import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as dotenv from "dotenv";

import { buildDAG } from './buildDAG.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execPromise = promisify(exec);

// The arithmetic circuits built using circom operate on signals, which contain field elements in Z/pZ.
// config the dotenv path, read the .env for the prime p
const __rootname = path.dirname(path.dirname(__dirname))
dotenv.config({ path: __rootname + '/.env' });
const Prime = String(process.env.P);
const PrimeNumber = BigInt(Prime);

// turn field element to a more readable method
function elementSimplification(input: string): bigint {
  let big_input = BigInt(input);
  let half = PrimeNumber / BigInt(2);
  let big_output: bigint;

  if (big_input <= half) {
    big_output = big_input;
  } else {
    big_output = big_input - PrimeNumber;
  }
  return big_output;
}

// turn field element to it's modular inverse
function modularInverse(element: string): bigint {
  let input = BigInt(element)
  // Check if the input is valid
  if (input <= BigInt(0) || input >= PrimeNumber) {
      console.error("Invalid input: x must be in the range [1, P-1], and P must be a prime number.");
      return input;
  }

  // x^(P-2) mod P
  let exponent = PrimeNumber - BigInt(2);
  let result = BigInt(1);
  let base = input % PrimeNumber;

  // Exponentiation by Squaring
  while (exponent > BigInt(0)) {
      if (exponent % BigInt(2) === BigInt(1)) {
          result = (result * base) % PrimeNumber;
      }
      base = (base * base) % PrimeNumber;
      exponent = exponent / BigInt(2);
  }

  return elementSimplification(result.toString());
}

/**
 * Returns the absolute value of a BigInt number
 * @param value The BigInt number to get absolute value of
 * @returns The absolute value as BigInt
 */
function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function readable_coefficient(input: string) {
  let simplified = elementSimplification(input);
  let inversed = modularInverse(input);

  const absSimplified = simplified < 0 ? -simplified : simplified;
  const absInversed = inversed < 0 ? -inversed : inversed;
  
  if (absSimplified <= absInversed) {
    return simplified.toString()
  } else {
    return `-1/${absBigInt(inversed).toString()}`
  }
}

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
      // signal number 0 expressing the constant 1
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
        coefficient_A: [] as string[],
        lin_expr_A: [] as string[],
        coefficient_B: [] as string[],
        lin_expr_B: [] as string[],
        coefficient_C: [] as string[],
        lin_expr_C: [] as string[],
      };

      for (const linear_expresion of constraintList) {
        // traversal the linear expresion of each constraint
        let linear_expresion_index = constraintList.indexOf(linear_expresion);
        let keys: string[] = [];
        let values: string[] = [];

        for (const [key, value] of Object.entries(linear_expresion)) {
          keys.push(key);
          values.push(readable_coefficient(String(value)))
        }

        switch (linear_expresion_index) {
          case 0:
            obj.lin_expr_A.push(...keys);
            obj.coefficient_A.push(...values);
            break;
          case 1:
            obj.lin_expr_B.push(...keys);
            obj.coefficient_B.push(...values);
            break;
          case 2:
            obj.lin_expr_C.push(...keys);
            obj.coefficient_C.push(...values);
            break;
          default:
            console.log('Overflow in constraint parsing');
        }
      }
      constraints.push(obj);
    };
    circuitData.constraints = constraints;
    console.log(circuitData.constraints);

    // building substitutions
    const substitutionFile = fs.readFileSync(substitutionFilePath, 'utf-8');
    const substitutions = JSON.parse(substitutionFile);

    // substitutions format
    // Iterate through the entire json file, applying the readable_coefficient function to the values
    const format_sub: any = {};
    for (const sub_key in substitutions) {
      if (substitutions.hasOwnProperty(sub_key)) {
        const innerObj = substitutions[sub_key];
        format_sub[sub_key] = {};

        for (const innerKey in innerObj) {
          if (innerObj.hasOwnProperty(innerKey)) {
            const innerValue = readable_coefficient(String(innerObj[innerKey]))
            format_sub[sub_key][innerKey] = innerValue.toString();
          }
        }
      }
    }
    circuitData.substitutions = substitutions;

    return buildDAG(circuitData);
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

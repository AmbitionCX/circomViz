import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as dotenv from "dotenv";

import { SymbolObject, ConstraintComponent, ConstraintObject, SubstitutionMap, circuitData } from "../types/constraint.js";
import { } from './buildQAP.js';

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
// Using Fermat's Little Theorem: if p is prime and gcd(a,p) = 1, then a^(p-1) ≡ 1 (mod p) 
// Thus a^(p-2) ≡ a^(-1) (mod p)
function modularInverse(element: string): bigint {
  let input = BigInt(element)

  // zero does not have a inverse
  if (input === BigInt(0)) {
    return BigInt(0);
  }

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

function readable_coefficient(input: string) {
  let simplified = elementSimplification(input);
  let inversed = modularInverse(input);

  const absSimplified = simplified < 0 ? -simplified : simplified;
  const absInversed = inversed < 0 ? -inversed : inversed;

  let result: bigint = BigInt(0);
  if (absSimplified <= absInversed) {
    return simplified.toString()
  } else {
    return `-1/${absInversed.toString()}`
  }
}

export async function saveCode(folderName: string, fileName: string, code: string): Promise<circuitData> {
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

    let circuitData: circuitData = {
      symbols: [],
      constraints: [],
      substitutions: {},
    };

    // building symbols
    const symbolFile = fs.readFileSync(symbolFilePath, 'utf-8');
    const symbolLines = symbolFile.trim().split('\n');

    // symbol file format
    // https://docs.circom.io/circom-language/formats/sym/
    // signal number 0 expressing the constant 1
    const symbols: SymbolObject[] = symbolLines
      .filter(line => line.trim().length > 0)
      .map(line => {
        const fields = line.split(',');
        return {
          index: parseInt(fields[0]),
          witness: parseInt(fields[1]),
          component: parseInt(fields[2]),
          name: fields[3].trim(),
        };
      });
    circuitData.symbols = symbols;

    // building constraints
    const constraintFile = fs.readFileSync(constraintFilePath, 'utf-8');
    const constraintJSON = JSON.parse(constraintFile);

    // JSON constraints format
    // https://docs.circom.io/circom-language/formats/constraints-json/
    const constraints: ConstraintObject[] = constraintJSON.constraints.map((triple: any[]): ConstraintObject => {
      return triple.map((component: { [key: string]: string | number }) => {
        const formatted: ConstraintComponent = {};
        for (const [key, val] of Object.entries(component)) {
          formatted[key] = readable_coefficient(String(val));
        }
        return formatted;
      }) as ConstraintObject;
    });
    circuitData.constraints = constraints;

    // building substitutions
    const substitutionFile = fs.readFileSync(substitutionFilePath, 'utf-8');
    const rawSubstitutions = JSON.parse(substitutionFile);

    // substitutions format
    // Iterate through the entire json file, applying the readable_coefficient function to the values
    const substitutions: SubstitutionMap = {};
    for (const [k, v] of Object.entries(rawSubstitutions)) {
      const innerObj = v as { [key: string]: string | number };
      const entry: { [key: string]: string | number } = {};
    
      for (const [innerKey, innerVal] of Object.entries(innerObj)) {
        entry[innerKey] = readable_coefficient(String(innerVal));
      }
    
      substitutions[k] = entry;
    }
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

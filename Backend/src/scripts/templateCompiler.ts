import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import * as dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const __rootname = path.dirname(path.dirname(__dirname));
dotenv.config({ path: __rootname + '/.env' });
const Prime = String(process.env.P);
const PrimeNumber = BigInt(Prime);

export interface SymbolObject {
  index: number;
  witness: number;
  component: number;
  name: string;
}

export interface ConstraintComponent {
  [key: string]: string | number;
}

export interface ConstraintObject {
  [key: number]: ConstraintComponent;
}

export interface SubstitutionMap {
  [key: string]: { [key: string]: string | number };
}

export interface CompilationResult {
  success: boolean;
  constraints: string[];
  signals: Record<string, string>;
  substitutions: Record<string, Record<string, string>>;
  stats: {
    constraintCount: number;
    signalCount: number;
    substitutionCount: number;
  };
  error?: string;
}

export interface TemplateCompileRequest {
  repo: string;
  entry: string;
  templatePath: string[];
  templateName: string;
  templateCode: string;
  dependencyCodes: { [path: string]: string };
}

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

function modularInverse(element: string): bigint {
  let input = BigInt(element);

  if (input === BigInt(0)) {
    return BigInt(0);
  }

  if (input <= BigInt(0) || input >= PrimeNumber) {
    console.error("Invalid input: x must be in the range [1, P-1], and P must be a prime number.");
    return input;
  }

  let exponent = PrimeNumber - BigInt(2);
  let result = BigInt(1);
  let base = input % PrimeNumber;

  while (exponent > BigInt(0)) {
    if (exponent % BigInt(2) === BigInt(1)) {
      result = (result * base) % PrimeNumber;
    }
    base = (base * base) % PrimeNumber;
    exponent = exponent / BigInt(2);
  }

  return elementSimplification(result.toString());
}

function readableCoefficient(input: string): string {
  let simplified = elementSimplification(input);
  let inversed = modularInverse(input);

  const absSimplified = simplified < 0 ? -simplified : simplified;
  const absInversed = inversed < 0 ? -inversed : inversed;

  if (absSimplified <= absInversed) {
    return simplified.toString();
  } else {
    return `-1/${absInversed.toString()}`;
  }
}

async function compileCircomCode(folderPath: string, filePath: string): Promise<{ symbolFilePath: string, constraintFilePath: string, substitutionFilePath: string }> {
  const libraryPath = path.join(__dirname, '..', '..');

  try {
    const args = ['-l', libraryPath, '-o', folderPath, filePath, '--sym', '--json', '--simplification_substitution', '--O2'];
    const { stdout, stderr } = await runCommand('circom', args, folderPath);
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

    return { symbolFilePath, constraintFilePath, substitutionFilePath };
  } catch (error: any) {
    throw new Error(`Failed to compile Circom code: ${error.message}`);
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

function formatConstraint(constraint: ConstraintObject): string {
  const parts: string[] = [];
  
  for (const [signalIdx, component] of Object.entries(constraint)) {
    const entries = Object.entries(component);
    if (entries.length === 0) continue;
    
    const terms = entries
      .filter(([_, value]) => value !== 0 && value !== '0')
      .map(([signal, coeff]) => {
        const strCoeff = String(coeff);
        const coeffNum = BigInt(strCoeff);
        const absCoeff = coeffNum < 0n ? -coeffNum : coeffNum;
        
        if (absCoeff === 1n) {
          return coeffNum < 0n ? `-${signal}` : signal;
        }
        return `${strCoeff}*${signal}`;
      })
      .join(' + ');
    
    if (terms) {
      parts.push(terms);
    }
  }
  
  return parts.join(' = ');
}

export async function compileTemplate(request: TemplateCompileRequest): Promise<CompilationResult> {
  const timestamp = Date.now();
  const safeRepo = request.repo.replace(/[^a-zA-Z0-9_-]/g, '_');
  const folderName = `${safeRepo}_${request.templateName}_${timestamp}`;
  
  const folderPath = path.join(__dirname, '..', '..', 'compilations', folderName);
  
  try {
    await fs.promises.mkdir(folderPath, { recursive: true });
  } catch (error: any) {
    return {
      success: false,
      constraints: [],
      signals: {},
      substitutions: {},
      stats: { constraintCount: 0, signalCount: 0, substitutionCount: 0 },
      error: `Failed to create folder: ${error.message}`
    };
  }

  const mainFilePath = path.join(folderPath, 'main.circom');
  
  try {
    await fs.promises.writeFile(mainFilePath, request.templateCode);
  } catch (error: any) {
    return {
      success: false,
      constraints: [],
      signals: {},
      substitutions: {},
      stats: { constraintCount: 0, signalCount: 0, substitutionCount: 0 },
      error: `Failed to write main file: ${error.message}`
    };
  }

  for (const [depPath, depCode] of Object.entries(request.dependencyCodes)) {
    const depFileName = path.basename(depPath);
    const depFilePath = path.join(folderPath, depFileName);
    
    try {
      await fs.promises.writeFile(depFilePath, depCode);
    } catch (error: any) {
      return {
        success: false,
        constraints: [],
        signals: {},
        substitutions: {},
        stats: { constraintCount: 0, signalCount: 0, substitutionCount: 0 },
        error: `Failed to write dependency file ${depPath}: ${error.message}`
      };
    }
  }

  const startTime = Date.now();
  
  try {
    const result = await compileCircomCode(folderPath, mainFilePath);
    const { symbolFilePath, constraintFilePath, substitutionFilePath } = result;

    const symbolFile = fs.readFileSync(symbolFilePath, 'utf-8');
    const symbolLines = symbolFile.trim().split('\n');

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

    const signals: Record<string, string> = {};
    symbols.forEach(symbol => {
      signals[symbol.name] = elementSimplification(String(symbol.witness)).toString();
    });

    const constraintFile = fs.readFileSync(constraintFilePath, 'utf-8');
    const constraintJSON = JSON.parse(constraintFile);

    const constraintObjects: ConstraintObject[] = constraintJSON.constraints.map((triple: any[]): ConstraintObject => {
      return triple.map((component: { [key: string]: string | number }) => {
        const formatted: ConstraintComponent = {};
        for (const [key, val] of Object.entries(component)) {
          formatted[key] = readableCoefficient(String(val));
        }
        return formatted;
      }) as ConstraintObject;
    });

    const constraints: string[] = constraintObjects.map(formatConstraint);

    const substitutionFile = fs.readFileSync(substitutionFilePath, 'utf-8');
    const rawSubstitutions = JSON.parse(substitutionFile);

    const substitutions: Record<string, Record<string, string>> = {};
    for (const [k, v] of Object.entries(rawSubstitutions)) {
      const innerObj = v as { [key: string]: string | number };
      const entry: Record<string, string> = {};
    
      for (const [innerKey, innerVal] of Object.entries(innerObj)) {
        entry[innerKey] = readableCoefficient(String(innerVal));
      }
    
      substitutions[k] = entry;
    }

    const executionTime = Date.now() - startTime;

    return {
      success: true,
      constraints,
      signals,
      substitutions,
      stats: {
        constraintCount: constraints.length,
        signalCount: symbols.length,
        substitutionCount: Object.keys(substitutions).length,
      }
    };
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    return {
      success: false,
      constraints: [],
      signals: {},
      substitutions: {},
      stats: { constraintCount: 0, signalCount: 0, substitutionCount: 0 },
      error: error.message
    };
  }
}

import { Cvc5Solver } from './cvc5Solver.js';
import { ConstraintTranslator } from './constraintTranslator.js';
import type { ConstraintObject } from '../../types/constraint.js';
import type { SymbolObject } from '../../types/constraint.js';
import type { SatisfiabilityResult, DeterminismResult, CoverageCheckResult } from '../../types/soundnessTypes.js';

function extractAllSignalIndices(constraints: ConstraintObject[], symbols: SymbolObject[]): number[] {
  const indexSet = new Set<number>();
  for (const [a, b, c] of constraints) {
    for (const expr of [a, b, c]) {
      for (const key of Object.keys(expr)) {
        indexSet.add(parseInt(key));
      }
    }
  }
  for (const sym of symbols) {
    if (sym.witness >= 0) {
      indexSet.add(sym.index);
    }
  }
  return Array.from(indexSet).sort((a, b) => a - b);
}

function parseModel(modelOutput: string): Record<string, string> {
  const model: Record<string, string> = {};
  // Match: (define-fun s_1 () Int 0) or (define-fun s_1 () Int (- 5))
  const regex = /\(define-fun\s+s_(\d+)\s+\(\)\s+Int\s+([^\)]+)\)/g;
  let match;
  while ((match = regex.exec(modelOutput)) !== null) {
    let value = match[2].trim();
    // Handle negative numbers: (- N) -> "-N"
    const negMatch = value.match(/^\(\s*-\s+(\d+)\s*\)$/);
    if (negMatch) {
      value = `-${negMatch[1]}`;
    }
    model[match[1]] = value;
  }
  return model;
}

function parseModelWithSuffix(modelOutput: string, suffix: string): Record<string, string> {
  const model: Record<string, string> = {};
  const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\(define-fun\\s+s_(\\d+)${escapedSuffix}\\s+\\(\\)\\s+Int\\s+([^\\)]+)\\)`, 'g');
  let match;
  while ((match = regex.exec(modelOutput)) !== null) {
    let value = match[2].trim();
    const negMatch = value.match(/^\(\s*-\s+(\d+)\s*\)$/);
    if (negMatch) {
      value = `-${negMatch[1]}`;
    }
    model[match[1]] = value;
  }
  return model;
}

function parseFirstLine(output: string): string {
  const lines = output.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'sat' || trimmed === 'unsat' || trimmed === 'unknown') {
      return trimmed;
    }
  }
  return '';
}

function extractModelFromOutput(output: string): string {
  const lines = output.split('\n');
  let depth = 0;
  let modelLines: string[] = [];
  let inModel = false;
  let foundContent = false;

  for (const line of lines) {
    if (line.includes('(model') || line.includes('define-fun')) {
      inModel = true;
    }
    if (inModel) {
      modelLines.push(line);
      for (const ch of line) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
      }
      if (line.includes('define-fun')) foundContent = true;
      if (depth === 0 && modelLines.length > 1 && foundContent) {
        break;
      }
    }
  }
  return modelLines.join('\n');
}

export class VerificationEngine {
  private solver: Cvc5Solver;
  private translator: ConstraintTranslator;

  constructor(primeField: string) {
    this.solver = new Cvc5Solver();
    this.translator = new ConstraintTranslator(primeField);
  }

  async checkSatisfiability(
    constraints: ConstraintObject[],
    symbols: SymbolObject[]
  ): Promise<SatisfiabilityResult> {
    const startTime = performance.now();

    try {
      const allIndices = extractAllSignalIndices(constraints, symbols);
      const smt2 = this.translator.generateSatCheckSMT2(constraints, allIndices);
      const output = await this.solver.executeSMT2(smt2);
      const executionTimeMs = performance.now() - startTime;

      const satResult = parseFirstLine(output);

      if (satResult === 'unsat') {
        return {
          satisfiable: false,
          solverOutput: output,
          executionTimeMs,
        };
      }

      if (satResult === 'sat') {
        const modelStr = extractModelFromOutput(output);
        const model = parseModel(modelStr);
        return {
          satisfiable: true,
          model: Object.keys(model).length > 0 ? model : undefined,
          solverOutput: output,
          executionTimeMs,
        };
      }

      return {
        satisfiable: false,
        solverOutput: output,
        executionTimeMs,
      };
    } finally {
      await this.solver.close();
    }
  }

  async checkDeterminism(
    constraints: ConstraintObject[],
    inputIndices: number[],
    outputIndices: number[],
    symbols: SymbolObject[]
  ): Promise<DeterminismResult> {
    const startTime = performance.now();

    try {
      const allIndices = extractAllSignalIndices(constraints, symbols);
      const smt2 = this.translator.generateDeterminismSMT2(
        constraints,
        inputIndices,
        outputIndices,
        allIndices
      );
      const output = await this.solver.executeSMT2(smt2);
      const executionTimeMs = performance.now() - startTime;

      const satResult = parseFirstLine(output);

      if (satResult === 'unsat') {
        return {
          deterministic: true,
          solverOutput: output,
          executionTimeMs,
        };
      }

      if (satResult === 'sat') {
        const modelStr = extractModelFromOutput(output);
        const model1 = parseModelWithSuffix(modelStr, '_1');
        const model2 = parseModelWithSuffix(modelStr, '_2');

        const indexToName = new Map<number, string>();
        for (const sym of symbols) {
          indexToName.set(sym.index, sym.name);
        }

        const counterexample = {
          input: {} as Record<string, string>,
          output1: {} as Record<string, string>,
          output2: {} as Record<string, string>,
        };

        for (const idx of inputIndices) {
          const name = indexToName.get(idx);
          if (name && model1[String(idx)] !== undefined) {
            counterexample.input[name] = model1[String(idx)];
          }
        }

        for (const idx of outputIndices) {
          const name = indexToName.get(idx);
          if (name) {
            if (model1[String(idx)] !== undefined) {
              counterexample.output1[name] = model1[String(idx)];
            }
            if (model2[String(idx)] !== undefined) {
              counterexample.output2[name] = model2[String(idx)];
            }
          }
        }

        return {
          deterministic: false,
          counterexample,
          solverOutput: output,
          executionTimeMs,
        };
      }

      return {
        deterministic: false,
        solverOutput: output,
        executionTimeMs,
      };
    } finally {
      await this.solver.close();
    }
  }

  async checkCoverage(
    constraints: ConstraintObject[],
    targetSignalIndices: number[],
    fixedInputs: Record<string, string | number>,
    symbols: SymbolObject[]
  ): Promise<CoverageCheckResult> {
    const startTime = performance.now();

    try {
      const allIndices = extractAllSignalIndices(constraints, symbols);
      const smt2 = this.translator.generateCoverageSMT2(
        constraints,
        targetSignalIndices,
        fixedInputs,
        allIndices
      );
      const output = await this.solver.executeSMT2(smt2);
      const executionTimeMs = performance.now() - startTime;

      const satResult = parseFirstLine(output);

      if (satResult === 'unsat') {
        return {
          covered: true,
          solverOutput: output,
          executionTimeMs,
        };
      }

      if (satResult === 'sat') {
        const modelStr = extractModelFromOutput(output);
        const model1 = parseModelWithSuffix(modelStr, '_1');
        const model2 = parseModelWithSuffix(modelStr, '_2');

        const indexToName = new Map<number, string>();
        for (const sym of symbols) {
          indexToName.set(sym.index, sym.name);
        }

        const drifts: Array<{ signalName: string; value1: string; value2: string }> = [];
        for (const idx of targetSignalIndices) {
          const name = indexToName.get(idx);
          if (name) {
            const v1 = model1[String(idx)];
            const v2 = model2[String(idx)];
            if (v1 !== undefined && v2 !== undefined && v1 !== v2) {
              drifts.push({ signalName: name, value1: v1, value2: v2 });
            }
          }
        }

        return {
          covered: false,
          drifts,
          solverOutput: output,
          executionTimeMs,
        };
      }

      return {
        covered: false,
        solverOutput: output,
        executionTimeMs,
      };
    } finally {
      await this.solver.close();
    }
  }
}

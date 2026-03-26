import type { ConstraintComponent, ConstraintObject } from '../../types/constraint.js';

export class ConstraintTranslator {
  private primeField: bigint;

  constructor(primeField: string) {
    this.primeField = BigInt(primeField);
  }

  private normalizeCoefficient(rawVal: string | number): bigint {
    let val = BigInt(rawVal);
    if (val < BigInt(0)) {
      val = ((val % this.primeField) + this.primeField) % this.primeField;
    } else if (val >= this.primeField) {
      val = val % this.primeField;
    }
    // Return the smallest absolute representative: if val > P/2, treat as negative
    const half = this.primeField / BigInt(2);
    if (val > half) {
      return val - this.primeField;
    }
    return val;
  }

  generateSatCheckSMT2(
    constraints: ConstraintObject[],
    allSignalIndices: number[]
  ): string {
    const lines: string[] = [];

    lines.push('(set-logic ALL)');
    lines.push(`(define-const P Int ${this.primeField})`);

    // Declare variables for all signals (index 0 is the constant 1)
    for (const idx of allSignalIndices) {
      if (idx === 0) continue;
      lines.push(`(declare-fun s_${idx} () Int)`);
      // Constrain to [0, P-1]
      lines.push(`(assert (and (>= s_${idx} 0) (< s_${idx} P)))`);
    }

    // Assert each constraint: (mod (* A_expr B_expr) P) = C_expr (mod P)
    for (let i = 0; i < constraints.length; i++) {
      const [a, b, c] = constraints[i];
      const aExpr = this.translateLinearExpression(a);
      const bExpr = this.translateLinearExpression(b);
      const cExpr = this.translateLinearExpression(c);

      lines.push(`(assert (= (mod (* (mod ${aExpr} P) (mod ${bExpr} P)) P) (mod ${cExpr} P)))`);
    }

    lines.push('(check-sat)');
    lines.push('(get-model)');

    return lines.join('\n');
  }

  generateDeterminismSMT2(
    constraints: ConstraintObject[],
    inputIndices: number[],
    outputIndices: number[],
    allSignalIndices: number[]
  ): string {
    const lines: string[] = [];

    lines.push('(set-logic ALL)');
    lines.push(`(define-const P Int ${this.primeField})`);

    // Declare two copies of all signals
    for (const idx of allSignalIndices) {
      if (idx === 0) continue;
      lines.push(`(declare-fun s_${idx}_1 () Int)`);
      lines.push(`(declare-fun s_${idx}_2 () Int)`);
      // Constrain to [0, P-1]
      lines.push(`(assert (and (>= s_${idx}_1 0) (< s_${idx}_1 P)))`);
      lines.push(`(assert (and (>= s_${idx}_2 0) (< s_${idx}_2 P)))`);
    }
    for (const constraint of constraints) {
      lines.push(`(assert ${this.translateConstraintWithSuffix(constraint, '_1')})`);
    }

    // Assert constraints for copy 2
    for (const constraint of constraints) {
      lines.push(`(assert ${this.translateConstraintWithSuffix(constraint, '_2')})`);
    }

    // Assert input equality: X_1 = X_2
    for (const idx of inputIndices) {
      if (idx === 0) continue;
      lines.push(`(assert (= s_${idx}_1 s_${idx}_2))`);
    }

    // Assert at least one output differs: Y_1 != Y_2
    if (outputIndices.length > 0) {
      const outputDiffs = outputIndices
        .filter(idx => idx !== 0)
        .map(idx => `(not (= s_${idx}_1 s_${idx}_2))`);
      lines.push(`(assert (or ${outputDiffs.join(' ')}))`);
    } else {
      // If no output indices specified, check all non-input signals
      const nonInputIndices = allSignalIndices.filter(idx => idx !== 0 && !inputIndices.includes(idx));
      if (nonInputIndices.length > 0) {
        const diffs = nonInputIndices
          .map(idx => `(not (= s_${idx}_1 s_${idx}_2))`);
        lines.push(`(assert (or ${diffs.join(' ')}))`);
      }
    }

    lines.push('(check-sat)');
    lines.push('(get-model)');

    return lines.join('\n');
  }

  generateCoverageSMT2(
    constraints: ConstraintObject[],
    targetSignalIndices: number[],
    fixedInputs: Record<string, string | number>,
    allSignalIndices: number[]
  ): string {
    const lines: string[] = [];

    lines.push('(set-logic ALL)');
    lines.push(`(define-const P Int ${this.primeField})`);

    // Declare two copies of all non-fixed signals
    for (const idx of allSignalIndices) {
      if (idx === 0) continue;
      lines.push(`(declare-fun s_${idx}_1 () Int)`);
      lines.push(`(declare-fun s_${idx}_2 () Int)`);
      // Constrain to [0, P-1]
      lines.push(`(assert (and (>= s_${idx}_1 0) (< s_${idx}_1 P)))`);
      lines.push(`(assert (and (>= s_${idx}_2 0) (< s_${idx}_2 P)))`);
    }

    // Fix input values for both copies
    for (const [idxStr, val] of Object.entries(fixedInputs)) {
      const idx = parseInt(idxStr);
      const intVal = BigInt(val) < BigInt(0)
        ? `(mod (+ ${val} P) P)`
        : String(val);
      lines.push(`(assert (= s_${idx}_1 ${intVal}))`);
      lines.push(`(assert (= s_${idx}_2 ${intVal}))`);
    }

    // Assert constraints for copy 1
    for (const constraint of constraints) {
      lines.push(`(assert ${this.translateConstraintWithSuffix(constraint, '_1')})`);
    }

    // Assert constraints for copy 2
    for (const constraint of constraints) {
      lines.push(`(assert ${this.translateConstraintWithSuffix(constraint, '_2')})`);
    }

    // Assert all target signals equal between copies
    if (targetSignalIndices.length > 0) {
      const equalities = targetSignalIndices
        .filter(idx => idx !== 0)
        .map(idx => `(= s_${idx}_1 s_${idx}_2)`);
      lines.push(`(assert (and ${equalities.join(' ')}))`);
    }

    lines.push('(check-sat)');
    lines.push('(get-model)');

    return lines.join('\n');
  }

  private translateConstraintWithSuffix(constraint: ConstraintObject, suffix: string): string {
    const [a, b, c] = constraint;
    const aExpr = this.translateLinearExpressionWithSuffix(a, suffix);
    const bExpr = this.translateLinearExpressionWithSuffix(b, suffix);
    const cExpr = this.translateLinearExpressionWithSuffix(c, suffix);
    return `(= (mod (* (mod ${aExpr} P) (mod ${bExpr} P)) P) (mod ${cExpr} P))`;
  }

  private translateLinearExpression(expr: ConstraintComponent): string {
    if (!expr || Object.keys(expr).length === 0) return '0';

    const terms: string[] = [];
    let constantTerm: bigint | null = null;

    for (const [key, val] of Object.entries(expr)) {
      const coeff = this.normalizeCoefficient(val);
      if (coeff === BigInt(0)) continue;

      if (key === '0') {
        constantTerm = coeff;
      } else {
        const signalVar = `s_${key}`;
        if (coeff === BigInt(1)) {
          terms.push(signalVar);
        } else if (coeff === BigInt(-1)) {
          terms.push(`(- ${signalVar})`);
        } else {
          terms.push(`(* ${coeff} ${signalVar})`);
        }
      }
    }

    let result: string;

    if (terms.length === 0) {
      result = constantTerm !== null ? String(constantTerm) : '0';
    } else if (terms.length === 1) {
      result = terms[0];
      if (constantTerm !== null && constantTerm !== BigInt(0)) {
        if (constantTerm < BigInt(0)) {
          result = `(- ${result} ${-constantTerm})`;
        } else {
          result = `(+ ${result} ${constantTerm})`;
        }
      }
    } else {
      result = `(+ ${terms.join(' ')})`;
      if (constantTerm !== null && constantTerm !== BigInt(0)) {
        if (constantTerm < BigInt(0)) {
          result = `(- ${result} ${-constantTerm})`;
        } else {
          result = `(+ ${result} ${constantTerm})`;
        }
      }
    }

    return result;
  }

  private translateLinearExpressionWithSuffix(expr: ConstraintComponent, suffix: string): string {
    if (!expr || Object.keys(expr).length === 0) return '0';

    const terms: string[] = [];
    let constantTerm: bigint | null = null;

    for (const [key, val] of Object.entries(expr)) {
      const coeff = this.normalizeCoefficient(val);
      if (coeff === BigInt(0)) continue;

      if (key === '0') {
        constantTerm = coeff;
      } else {
        const signalVar = `s_${key}${suffix}`;
        if (coeff === BigInt(1)) {
          terms.push(signalVar);
        } else if (coeff === BigInt(-1)) {
          terms.push(`(- ${signalVar})`);
        } else {
          terms.push(`(* ${coeff} ${signalVar})`);
        }
      }
    }

    let result: string;

    if (terms.length === 0) {
      result = constantTerm !== null ? String(constantTerm) : '0';
    } else if (terms.length === 1) {
      result = terms[0];
      if (constantTerm !== null && constantTerm !== BigInt(0)) {
        if (constantTerm < BigInt(0)) {
          result = `(- ${result} ${-constantTerm})`;
        } else {
          result = `(+ ${result} ${constantTerm})`;
        }
      }
    } else {
      result = `(+ ${terms.join(' ')})`;
      if (constantTerm !== null && constantTerm !== BigInt(0)) {
        if (constantTerm < BigInt(0)) {
          result = `(- ${result} ${-constantTerm})`;
        } else {
          result = `(+ ${result} ${constantTerm})`;
        }
      }
    }

    return result;
  }
}

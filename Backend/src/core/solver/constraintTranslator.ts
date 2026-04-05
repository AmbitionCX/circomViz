import type { ConstraintComponent, ConstraintObject } from '../../types/constraint.js';

type FieldExpr = Map<number, bigint>;

function feAdd(a: FieldExpr, b: FieldExpr, p: bigint): FieldExpr {
  const r = new Map(a);
  for (const [k, v] of b) {
    r.set(k, ((r.get(k) ?? BigInt(0)) + v) % p);
  }
  return r;
}

function feScale(expr: FieldExpr, scalar: bigint, p: bigint): FieldExpr {
  if (scalar === BigInt(0)) return new Map();
  const r = new Map();
  for (const [k, v] of expr) {
    const nv = (v * scalar) % p;
    if (nv !== BigInt(0)) r.set(k, nv);
  }
  return r;
}

function modInverse(a: bigint, p: bigint): bigint {
  a = ((a % p) + p) % p;
  let [old_r, r] = [a, p];
  let [old_s, s] = [BigInt(1), BigInt(0)];
  while (r !== BigInt(0)) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return ((old_s % p) + p) % p;
}

function evalFieldExpr(
  terms: FieldExpr,
  constant: bigint,
  assignment: Map<number, bigint>,
  p: bigint,
): bigint {
  let val = constant % p;
  for (const [sig, coeff] of terms) {
    val = (val + coeff * (assignment.get(sig) ?? BigInt(0))) % p;
  }
  return val;
}

export class ConstraintTranslator {
  private primeField: bigint;
  private fpStr: string;

  constructor(primeField: string) {
    this.primeField = BigInt(primeField);
    this.fpStr = primeField;
  }

  private toFieldElement(rawVal: string | number): bigint {
    let val = BigInt(rawVal);
    if (val < BigInt(0)) {
      val = ((val % this.primeField) + this.primeField) % this.primeField;
    } else if (val >= this.primeField) {
      val = val % this.primeField;
    }
    return val;
  }

  private parseLinearToFieldExpr(expr: ConstraintComponent): { terms: FieldExpr; constant: bigint } {
    const terms: FieldExpr = new Map();
    let constant = BigInt(0);
    if (!expr) return { terms, constant };
    for (const [key, val] of Object.entries(expr)) {
      const coeff = this.toFieldElement(val);
      if (coeff === BigInt(0)) continue;
      if (key === '0') {
        constant = (constant + coeff) % this.primeField;
      } else {
        terms.set(parseInt(key), coeff);
      }
    }
    return { terms, constant };
  }

  private isEmpty(expr: ConstraintComponent): boolean {
    if (!expr) return true;
    return Object.entries(expr).every(([, val]) => this.toFieldElement(val) === BigInt(0));
  }

  private gaussianEliminate(
    linearConstraints: Array<{ terms: FieldExpr; constant: bigint }>,
    allSignalIndices: number[],
  ): { pivotExprs: Map<number, { terms: FieldExpr; constant: bigint }>; freeSignals: number[] } {
    const p = this.primeField;
    const signalCols = allSignalIndices.filter(i => i !== 0).sort((a, b) => a - b);
    const colIndex = new Map(signalCols.map((s, i) => [s, i]));
    const nCols = signalCols.length;

    const rows: Array<{ coeffs: bigint[]; rhs: bigint; pivotCol: number }> = [];

    for (const lc of linearConstraints) {
      const coeffs = new Array(nCols).fill(BigInt(0));
      for (const [sig, coeff] of lc.terms) {
        const ci = colIndex.get(sig);
        if (ci !== undefined) coeffs[ci] = coeff;
      }
      const rhs = (p - lc.constant) % p;
      rows.push({ coeffs, rhs, pivotCol: -1 });
    }

    let pivotRow = 0;
    for (let col = 0; col < nCols && pivotRow < rows.length; col++) {
      let found = -1;
      for (let r = pivotRow; r < rows.length; r++) {
        if (rows[r].coeffs[col] !== BigInt(0)) { found = r; break; }
      }
      if (found === -1) continue;

      [rows[pivotRow], rows[found]] = [rows[found], rows[pivotRow]];
      const pivotVal = rows[pivotRow].coeffs[col];
      const invPivot = modInverse(pivotVal, p);

      for (let c = 0; c < nCols; c++) {
        rows[pivotRow].coeffs[c] = (rows[pivotRow].coeffs[c] * invPivot) % p;
      }
      rows[pivotRow].rhs = (rows[pivotRow].rhs * invPivot) % p;
      rows[pivotRow].pivotCol = col;

      for (let r = 0; r < rows.length; r++) {
        if (r === pivotRow || rows[r].coeffs[col] === BigInt(0)) continue;
        const factor = rows[r].coeffs[col];
        for (let c = 0; c < nCols; c++) {
          rows[r].coeffs[c] = (rows[r].coeffs[c] - factor * rows[pivotRow].coeffs[c] % p + p) % p;
        }
        rows[r].rhs = (rows[r].rhs - factor * rows[pivotRow].rhs % p + p) % p;
      }

      pivotRow++;
    }

    const pivotCols = new Set<number>();
    for (const row of rows) {
      if (row.pivotCol >= 0) pivotCols.add(row.pivotCol);
    }

    const pivotExprs = new Map<number, { terms: FieldExpr; constant: bigint }>();
    for (const row of rows) {
      if (row.pivotCol < 0) continue;
      const pivotSig = signalCols[row.pivotCol];
      const terms: FieldExpr = new Map();
      for (let c = 0; c < nCols; c++) {
        if (c === row.pivotCol || row.coeffs[c] === BigInt(0)) continue;
        terms.set(signalCols[c], (p - row.coeffs[c]) % p);
      }
      pivotExprs.set(pivotSig, { terms, constant: row.rhs });
    }

    const freeSignals: number[] = [];
    for (let c = 0; c < nCols; c++) {
      if (!pivotCols.has(c)) freeSignals.push(signalCols[c]);
    }

    return { pivotExprs, freeSignals };
  }

  private substituteInLinearExpr(
    terms: FieldExpr,
    constant: bigint,
    pivotExprs: Map<number, { terms: FieldExpr; constant: bigint }>,
  ): { terms: FieldExpr; constant: bigint } {
    const p = this.primeField;
    let result: FieldExpr = new Map(terms);
    let resultConst = constant;

    for (const [sig, expr] of pivotExprs) {
      const coeff = result.get(sig);
      if (coeff === undefined || coeff === BigInt(0)) continue;
      result.delete(sig);

      const scaled = feScale(expr.terms, coeff, p);
      result = feAdd(result, scaled, p);

      const constContrib = (coeff * expr.constant) % p;
      resultConst = (resultConst + constContrib) % p;
    }

    return { terms: result, constant: resultConst };
  }

  private evalLinear(
    terms: FieldExpr,
    constant: bigint,
    assignment: Map<number, bigint>,
  ): bigint {
    let val = constant % this.primeField;
    if (val < BigInt(0)) val += this.primeField;
    for (const [sig, coeff] of terms) {
      val = (val + coeff * (assignment.get(sig) ?? BigInt(0))) % this.primeField;
    }
    if (val < BigInt(0)) val += this.primeField;
    return val;
  }

  private buildFullAssignment(
    freeAssignment: Map<number, bigint>,
    pivotExprs: Map<number, { terms: FieldExpr; constant: bigint }>,
  ): Map<number, bigint> {
    const assignment = new Map(freeAssignment);
    for (const [sig, expr] of pivotExprs) {
      assignment.set(sig, this.evalLinear(expr.terms, expr.constant, assignment));
    }
    return assignment;
  }

  private computeQuadraticValue(
    a: FieldExpr, aConst: bigint,
    b: FieldExpr, bConst: bigint,
    c: FieldExpr, cConst: bigint,
    assignment: Map<number, bigint>,
  ): { aVal: bigint; bVal: bigint; cVal: bigint; satisfied: boolean } {
    const p = this.primeField;
    const aVal = this.evalLinear(a, aConst, assignment);
    const bVal = this.evalLinear(b, bConst, assignment);
    const cVal = this.evalLinear(c, cConst, assignment);
    return { aVal, bVal, cVal, satisfied: (aVal * bVal) % p === cVal };
  }

  solveSATDirect(
    constraints: ConstraintObject[],
    allSignalIndices: number[],
  ): { satisfiable: boolean; model?: Map<number, bigint> } {
    const p = this.primeField;
    const zero = BigInt(0);
    const one = BigInt(1);

    const linear: Array<{ terms: FieldExpr; constant: bigint }> = [];
    const quadratic: Array<{
      a: FieldExpr; b: FieldExpr; c: FieldExpr;
      aConst: bigint; bConst: bigint; cConst: bigint;
    }> = [];

    for (const [a, b, c] of constraints) {
      if (this.isEmpty(a) || this.isEmpty(b)) {
        linear.push(this.parseLinearToFieldExpr(c));
      } else {
        const ap = this.parseLinearToFieldExpr(a);
        const bp = this.parseLinearToFieldExpr(b);
        const cp = this.parseLinearToFieldExpr(c);
        quadratic.push({
          a: ap.terms, b: bp.terms, c: cp.terms,
          aConst: ap.constant, bConst: bp.constant, cConst: cp.constant,
        });
      }
    }

    const { pivotExprs, freeSignals } = this.gaussianEliminate(linear, allSignalIndices);

    const subQ = quadratic.map(qc => ({
      a: this.substituteInLinearExpr(qc.a, qc.aConst, pivotExprs),
      b: this.substituteInLinearExpr(qc.b, qc.bConst, pivotExprs),
      c: this.substituteInLinearExpr(qc.c, qc.cConst, pivotExprs),
    }));

    const freeSet = new Set(freeSignals);
    const freeAssignment = new Map<number, bigint>();
    for (const sig of freeSignals) freeAssignment.set(sig, zero);

    const evalSide = (expr: { terms: FieldExpr; constant: bigint }): bigint =>
      this.evalLinear(expr.terms, expr.constant, freeAssignment);

    const checkQC = (qc: typeof subQ[0]): boolean => {
      const a = evalSide(qc.a);
      const b = evalSide(qc.b);
      const c = evalSide(qc.c);
      return (a * b) % p === c;
    };

    const checkAll = (): boolean => subQ.every(checkQC);

    const mkModel = () => ({
      satisfiable: true as const,
      model: this.buildFullAssignment(freeAssignment, pivotExprs),
    });

    if (checkAll()) return mkModel();

    const countFails = (): number => subQ.reduce((n, qc) => n + (checkQC(qc) ? 0 : 1), 0);

    const tryCandidate = (sig: number, delta: bigint): number => {
      const cur = freeAssignment.get(sig) ?? zero;
      freeAssignment.set(sig, (cur + delta) % p);
      const fails = countFails();
      freeAssignment.set(sig, cur);
      return fails;
    };

    const propagate = (maxIter: number): boolean => {
      for (let iter = 0; iter < maxIter; iter++) {
        const prevFails = countFails();
        if (prevFails === 0) return true;

        let bestSig = -1;
        let bestDelta = 0n;
        let bestFails = prevFails;

        for (const qc of subQ) {
          const aVal = evalSide(qc.a);
          const bVal = evalSide(qc.b);
          const cVal = evalSide(qc.c);
          if ((aVal * bVal) % p === cVal) continue;

          const aInA = new Map<number, bigint>();
          const bInB = new Map<number, bigint>();
          const cInC = new Map<number, bigint>();
          for (const [sig, coeff] of qc.a.terms) if (freeSet.has(sig)) aInA.set(sig, coeff);
          for (const [sig, coeff] of qc.b.terms) if (freeSet.has(sig)) bInB.set(sig, coeff);
          for (const [sig, coeff] of qc.c.terms) if (freeSet.has(sig)) cInC.set(sig, coeff);

          const cands: Array<{ sig: number; delta: bigint }> = [];

          if (bVal !== zero) {
            const needed = cVal * modInverse(bVal, p) % p;
            const diff = (needed - aVal + p) % p;
            for (const [sig, coeff] of aInA) {
              if (bInB.has(sig) || cInC.has(sig)) continue;
              cands.push({ sig, delta: diff * modInverse(coeff, p) % p });
            }
          }

          if (aVal !== zero) {
            const needed = cVal * modInverse(aVal, p) % p;
            const diff = (needed - bVal + p) % p;
            for (const [sig, coeff] of bInB) {
              if (aInA.has(sig) || cInC.has(sig)) continue;
              cands.push({ sig, delta: diff * modInverse(coeff, p) % p });
            }
          }

          if (aVal === zero && cVal !== zero) {
            const diff = (one - aVal + p) % p;
            for (const [sig, coeff] of aInA) {
              if (bInB.has(sig) || cInC.has(sig)) continue;
              cands.push({ sig, delta: diff * modInverse(coeff, p) % p });
            }
          }

          if (bVal === zero && cVal !== zero) {
            const diff = (one - bVal + p) % p;
            for (const [sig, coeff] of bInB) {
              if (aInA.has(sig) || cInC.has(sig)) continue;
              cands.push({ sig, delta: diff * modInverse(coeff, p) % p });
            }
          }

          for (const [sig, coeff] of cInC) {
            if (aInA.has(sig) || bInB.has(sig)) continue;
            const cDiff = ((aVal * bVal - cVal) % p + p) % p;
            if (cDiff === zero) continue;
            cands.push({ sig, delta: cDiff * modInverse(coeff, p) % p });
          }

          for (const [sig, aCoeff] of aInA) {
            if (bInB.has(sig)) continue;
            const cCoeff = cInC.get(sig);
            if (cCoeff === undefined) continue;
            const denom = ((aCoeff * bVal - cCoeff) % p + p) % p;
            if (denom === zero) continue;
            const residual = ((cVal - aVal * bVal) % p + p) % p;
            cands.push({ sig, delta: residual * modInverse(denom, p) % p });
          }

          for (const [sig, bCoeff] of bInB) {
            if (aInA.has(sig)) continue;
            const cCoeff = cInC.get(sig);
            if (cCoeff === undefined) continue;
            const denom = ((aVal * bCoeff - cCoeff) % p + p) % p;
            if (denom === zero) continue;
            const residual = ((cVal - aVal * bVal) % p + p) % p;
            cands.push({ sig, delta: residual * modInverse(denom, p) % p });
          }

          for (const [sig, aCoeff] of aInA) {
            const bCoeff = bInB.get(sig);
            if (bCoeff === undefined || cInC.has(sig)) continue;
            const needed = cVal * modInverse(bVal, p) % p;
            const diff = (needed - aVal + p) % p;
            const denom = ((aCoeff * bVal - bCoeff * aVal) % p + p) % p;
            if (denom === zero) continue;
            cands.push({ sig, delta: diff * modInverse(denom, p) % p });
          }

          for (const { sig, delta } of cands) {
            const fails = tryCandidate(sig, delta);
            if (fails < bestFails) {
              bestFails = fails;
              bestSig = sig;
              bestDelta = delta;
              if (fails === 0) break;
            }
          }

          if (bestFails === 0) break;
        }

        if (bestSig >= 0 && bestFails < prevFails) {
          const cur = freeAssignment.get(bestSig) ?? zero;
          freeAssignment.set(bestSig, (cur + bestDelta) % p);
        } else {
          return false;
        }
      }
      return countFails() === 0;
    };

    if (propagate(500)) return mkModel();

    const problemSignals = new Set<number>();
    for (const qc of subQ) {
      if (!checkQC(qc)) {
        for (const [sig] of qc.a.terms) if (freeSet.has(sig)) problemSignals.add(sig);
        for (const [sig] of qc.b.terms) if (freeSet.has(sig)) problemSignals.add(sig);
      }
    }
    const problemArr = [...problemSignals];
    const savedAssignment = new Map(freeAssignment);

    const candValues = [zero, one, BigInt(2), p - one, p - BigInt(2)];
    const combos = Math.pow(candValues.length, problemArr.length);

    for (let mask = 0; mask < combos; mask++) {
      for (const [k, v] of savedAssignment) freeAssignment.set(k, v);

      let temp = mask;
      for (const sig of problemArr) {
        freeAssignment.set(sig, candValues[temp % candValues.length]);
        temp = Math.floor(temp / candValues.length);
      }

      if (propagate(100)) return mkModel();
    }

    for (const [k, v] of savedAssignment) freeAssignment.set(k, v);

    return { satisfiable: false };
  }

  private fieldExprToSMT2(terms: FieldExpr, constant: bigint, suffix: string): string {
    const termEntries = [...terms.entries()].filter(([, v]) => v !== BigInt(0));

    if (termEntries.length === 0) return constant.toString();

    const termStrs = termEntries.map(
      ([sig, coeff]) => coeff === BigInt(1) ? `s_${sig}${suffix}` : `(* ${coeff} s_${sig}${suffix})`,
    );
    let result = termStrs.length === 1 ? termStrs[0] : `(+ ${termStrs.join(' ')})`;

    if (constant !== BigInt(0)) {
      result = `(+ ${result} ${constant})`;
    }

    return result;
  }

  private buildPivotExprSuffix(
    pivotExprs: Map<number, { terms: FieldExpr; constant: bigint }>,
    suffix: string,
    lines: string[],
  ): void {
    for (const [sig, expr] of pivotExprs) {
      const smt2 = this.fieldExprToSMT2(expr.terms, expr.constant, suffix);
      if (expr.terms.size === 0) {
        lines.push(`(assert (= s_${sig}${suffix} ${expr.constant}))`);
      } else {
        const qName = `q_${sig}${suffix}`;
        lines.push(`(declare-fun ${qName} () Int)`);
        lines.push(`(assert (>= ${qName} 0))`);
        lines.push(`(assert (= s_${sig}${suffix} (+ ${smt2} (* ${qName} FP))))`);
      }
    }
  }

  generateSatCheckSMT2(
    constraints: ConstraintObject[],
    allSignalIndices: number[],
  ): string {
    const p = this.primeField;
    const linear: Array<{ terms: FieldExpr; constant: bigint; origIdx: number }> = [];
    const quadratic: Array<{ a: FieldExpr; b: FieldExpr; c: FieldExpr; aConst: bigint; bConst: bigint; cConst: bigint; origIdx: number }> = [];

    for (let i = 0; i < constraints.length; i++) {
      const [a, b, c] = constraints[i];
      if (this.isEmpty(a) || this.isEmpty(b)) {
        const { terms, constant } = this.parseLinearToFieldExpr(c);
        linear.push({ terms, constant, origIdx: i });
      } else {
        const aParsed = this.parseLinearToFieldExpr(a);
        const bParsed = this.parseLinearToFieldExpr(b);
        const cParsed = this.parseLinearToFieldExpr(c);
        quadratic.push({
          a: aParsed.terms, b: bParsed.terms, c: cParsed.terms,
          aConst: aParsed.constant, bConst: bParsed.constant, cConst: cParsed.constant,
          origIdx: i,
        });
      }
    }

    const { pivotExprs, freeSignals } = this.gaussianEliminate(linear, allSignalIndices);

    const lines: string[] = [
      '(set-logic ALL)',
      `(define-const FP Int ${this.fpStr})`,
    ];

    for (const idx of freeSignals) {
      lines.push(`(declare-fun s_${idx} () Int)`);
      lines.push(`(assert (and (>= s_${idx} 0) (< s_${idx} FP)))`);
    }

    for (const sig of pivotExprs.keys()) {
      lines.push(`(declare-fun s_${sig} () Int)`);
      lines.push(`(assert (and (>= s_${sig} 0) (< s_${sig} FP)))`);
    }

    this.buildPivotExprSuffix(pivotExprs, '', lines);

    for (const qc of quadratic) {
      const subA = this.substituteInLinearExpr(qc.a, qc.aConst, pivotExprs);
      const subB = this.substituteInLinearExpr(qc.b, qc.bConst, pivotExprs);
      const subC = this.substituteInLinearExpr(qc.c, qc.cConst, pivotExprs);

      const aSmt = this.fieldExprToSMT2(subA.terms, subA.constant, '');
      const bSmt = this.fieldExprToSMT2(subB.terms, subB.constant, '');
      const cSmt = this.fieldExprToSMT2(subC.terms, subC.constant, '');

      const kName = `k_${qc.origIdx}`;
      lines.push(`(declare-fun ${kName} () Int)`);
      lines.push(`(assert (>= ${kName} 0))`);
      lines.push(`(assert (= (* ${aSmt} ${bSmt}) (+ ${cSmt} (* ${kName} FP))))`);
    }

    lines.push('(check-sat)');
    lines.push('(get-model)');
    return lines.join('\n');
  }

  generateDeterminismSMT2(
    constraints: ConstraintObject[],
    inputIndices: number[],
    outputIndices: number[],
    allSignalIndices: number[],
  ): string {
    const linear: Array<{ terms: FieldExpr; constant: bigint }> = [];
    const quadratic: ConstraintObject[] = [];

    for (let i = 0; i < constraints.length; i++) {
      const [a, b, c] = constraints[i];
      if (this.isEmpty(a) || this.isEmpty(b)) {
        const { terms, constant } = this.parseLinearToFieldExpr(c);
        linear.push({ terms, constant });
      } else {
        quadratic.push(constraints[i]);
      }
    }

    const { pivotExprs, freeSignals } = this.gaussianEliminate(linear, allSignalIndices);

    const lines: string[] = [
      '(set-logic ALL)',
      `(define-const FP Int ${this.fpStr})`,
    ];

    for (const idx of freeSignals) {
      lines.push(`(declare-fun s_${idx}_1 () Int)`);
      lines.push(`(assert (and (>= s_${idx}_1 0) (< s_${idx}_1 FP)))`);
      lines.push(`(declare-fun s_${idx}_2 () Int)`);
      lines.push(`(assert (and (>= s_${idx}_2 0) (< s_${idx}_2 FP)))`);
    }

    for (const sig of pivotExprs.keys()) {
      lines.push(`(declare-fun s_${sig}_1 () Int)`);
      lines.push(`(assert (and (>= s_${sig}_1 0) (< s_${sig}_1 FP)))`);
      lines.push(`(declare-fun s_${sig}_2 () Int)`);
      lines.push(`(assert (and (>= s_${sig}_2 0) (< s_${sig}_2 FP)))`);
    }

    this.buildPivotExprSuffix(pivotExprs, '_1', lines);
    this.buildPivotExprSuffix(pivotExprs, '_2', lines);

    for (let i = 0; i < quadratic.length; i++) {
      const [a, b, c] = quadratic[i];
      const aParsed = this.parseLinearToFieldExpr(a);
      const bParsed = this.parseLinearToFieldExpr(b);
      const cParsed = this.parseLinearToFieldExpr(c);

      for (const suffix of ['_1', '_2'] as const) {
        const subA = this.substituteInLinearExpr(aParsed.terms, aParsed.constant, pivotExprs);
        const subB = this.substituteInLinearExpr(bParsed.terms, bParsed.constant, pivotExprs);
        const subC = this.substituteInLinearExpr(cParsed.terms, cParsed.constant, pivotExprs);

        const aSmt = this.fieldExprToSMT2(subA.terms, subA.constant, suffix);
        const bSmt = this.fieldExprToSMT2(subB.terms, subB.constant, suffix);
        const cSmt = this.fieldExprToSMT2(subC.terms, subC.constant, suffix);

        const kName = `k_${i}${suffix}`;
        lines.push(`(declare-fun ${kName} () Int)`);
        lines.push(`(assert (>= ${kName} 0))`);
        lines.push(`(assert (= (* ${aSmt} ${bSmt}) (+ ${cSmt} (* ${kName} FP))))`);
      }
    }

    for (const idx of inputIndices) {
      if (idx === 0) continue;
      lines.push(`(assert (= s_${idx}_1 s_${idx}_2))`);
    }

    const outputDiffs = outputIndices
      .filter(idx => idx !== 0)
      .map(idx => `(not (= s_${idx}_1 s_${idx}_2))`);

    if (outputDiffs.length > 0) {
      lines.push(`(assert (or ${outputDiffs.join(' ')}))`);
    } else {
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
    allSignalIndices: number[],
  ): string {
    const linear: Array<{ terms: FieldExpr; constant: bigint }> = [];
    const quadratic: ConstraintObject[] = [];

    for (let i = 0; i < constraints.length; i++) {
      const [a, b, c] = constraints[i];
      if (this.isEmpty(a) || this.isEmpty(b)) {
        const { terms, constant } = this.parseLinearToFieldExpr(c);
        linear.push({ terms, constant });
      } else {
        quadratic.push(constraints[i]);
      }
    }

    const { pivotExprs, freeSignals } = this.gaussianEliminate(linear, allSignalIndices);

    const lines: string[] = [
      '(set-logic ALL)',
      `(define-const FP Int ${this.fpStr})`,
    ];

    for (const idx of freeSignals) {
      lines.push(`(declare-fun s_${idx}_1 () Int)`);
      lines.push(`(assert (and (>= s_${idx}_1 0) (< s_${idx}_1 FP)))`);
      lines.push(`(declare-fun s_${idx}_2 () Int)`);
      lines.push(`(assert (and (>= s_${idx}_2 0) (< s_${idx}_2 FP)))`);
    }

    for (const sig of pivotExprs.keys()) {
      lines.push(`(declare-fun s_${sig}_1 () Int)`);
      lines.push(`(assert (and (>= s_${sig}_1 0) (< s_${sig}_1 FP)))`);
      lines.push(`(declare-fun s_${sig}_2 () Int)`);
      lines.push(`(assert (and (>= s_${sig}_2 0) (< s_${sig}_2 FP)))`);
    }

    this.buildPivotExprSuffix(pivotExprs, '_1', lines);
    this.buildPivotExprSuffix(pivotExprs, '_2', lines);

    for (const [idxStr, val] of Object.entries(fixedInputs)) {
      const fieldVal = this.toFieldElement(val);
      const intVal = fieldVal.toString();
      lines.push(`(assert (= s_${idxStr}_1 ${intVal}))`);
      lines.push(`(assert (= s_${idxStr}_2 ${intVal}))`);
    }

    for (let i = 0; i < quadratic.length; i++) {
      const [a, b, c] = quadratic[i];
      const aParsed = this.parseLinearToFieldExpr(a);
      const bParsed = this.parseLinearToFieldExpr(b);
      const cParsed = this.parseLinearToFieldExpr(c);

      for (const suffix of ['_1', '_2'] as const) {
        const subA = this.substituteInLinearExpr(aParsed.terms, aParsed.constant, pivotExprs);
        const subB = this.substituteInLinearExpr(bParsed.terms, bParsed.constant, pivotExprs);
        const subC = this.substituteInLinearExpr(cParsed.terms, cParsed.constant, pivotExprs);

        const aSmt = this.fieldExprToSMT2(subA.terms, subA.constant, suffix);
        const bSmt = this.fieldExprToSMT2(subB.terms, subB.constant, suffix);
        const cSmt = this.fieldExprToSMT2(subC.terms, subC.constant, suffix);

        const kName = `k_${i}${suffix}`;
        lines.push(`(declare-fun ${kName} () Int)`);
        lines.push(`(assert (>= ${kName} 0))`);
        lines.push(`(assert (= (* ${aSmt} ${bSmt}) (+ ${cSmt} (* ${kName} FP))))`);
      }
    }

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
}

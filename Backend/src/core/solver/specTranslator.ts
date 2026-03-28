import type { SymbolObject } from '../../types/constraint.js';
import type { ConstraintObject, ConstraintComponent } from '../../types/constraint.js';
import type { SpecTranslation } from '../../types/formalConformanceTypes.js';

export class SpecTranslator {
  private primeField: bigint;
  private nameToIndex: Map<string, number> = new Map();
  private indexToName: Map<number, string> = new Map();

  constructor(primeField: string, symbols: SymbolObject[]) {
    this.primeField = BigInt(primeField);
    for (const sym of symbols) {
      this.nameToIndex.set(sym.name, sym.index);
      this.indexToName.set(sym.index, sym.name);
    }
  }

  resolveSignal(name: string): number | null {
    if (this.nameToIndex.has(name)) return this.nameToIndex.get(name)!;
    const mainName = `main.${name}`;
    if (this.nameToIndex.has(mainName)) return this.nameToIndex.get(mainName)!;
    return null;
  }

  private isFpArithmetic(expr: string): boolean {
    const fpOps = ['\\*', '\\+', '-', '/', '\\(', '\\)', '=', ',', '==', '<', '>', '!=', '\\[', '\\]', '\\{', '\\}'];
    for (const op of fpOps) {
      if (new RegExp(op).test(expr)) return true;
    }
    return false;
  }

  private tryExtractBinaryEquality(line: string): { lhs: string; rhs: string } | null {
    const eqMatch = line.match(/^\s*(\S+)\s*(?:===?)\s*(.+)$/);
    if (eqMatch) {
      return { lhs: eqMatch[1].trim(), rhs: eqMatch[2].trim() };
    }
    return null;
  }

  private tryExtractArithmeticExpression(expr: string): { terms: string[]; ops: string[] } | null {
    const tokens = expr.match(/[a-zA-Z_][\w.]*|\d+|[+\-*=(),]/g);
    if (!tokens) return null;
    const terms: string[] = [];
    const ops: string[] = [];
    let i = 0;
    while (i < tokens.length) {
      if (tokens[i] === '(') { i++; continue; }
      if (tokens[i] === ')') { i++; continue; }
      if (['+', '-', '*', '='].includes(tokens[i])) {
        ops.push(tokens[i]);
        i++;
      } else if (/^\d+$/.test(tokens[i])) {
        terms.push(tokens[i]);
        i++;
      } else {
        terms.push(tokens[i]);
        i++;
      }
    }
    if (terms.length === 0) return null;
    return { terms, ops };
  }

  private translateAssumptionBoolean(line: string): SpecTranslation['assumptions'][0] | null {
    const match = line.match(/^\s*(\S+)\s+in\s*\{(\d+)\s*,\s*(\d+)\}/);
    if (match) {
      const signal = match[1].trim();
      const idx = this.resolveSignal(signal);
      if (idx === null) return null;
      const varName = `s_${idx}`;
      const lo = BigInt(match[2]);
      const hi = BigInt(match[3]);
      if (lo === BigInt(0) && hi === BigInt(1)) {
        return {
          raw: line.trim(),
          signal,
          kind: 'boolean',
          params: { low: match[2], high: match[3] },
          smt2Lines: [
            `(assert (or (= ${varName} 0) (= ${varName} 1)))`,
          ],
        };
      }
      return {
        raw: line.trim(),
        signal,
        kind: 'range',
        params: { low: match[2], high: match[3] },
        smt2Lines: [
          `(assert (and (>= ${varName} ${lo}) (<= ${varName} ${hi})))`,
        ],
      };
    }
    return null;
  }

  private translateAssumptionPublic(line: string): SpecTranslation['assumptions'][0] | null {
    const match = line.match(/^\s*(\S+)\s+is\s+(public|private)/);
    if (match) {
      const signal = match[1].trim();
      const idx = this.resolveSignal(signal);
      if (idx === null) return null;
      return {
        raw: line.trim(),
        signal,
        kind: 'constant',
        params: { visibility: match[2] },
        smt2Lines: [
          `; ${signal} is ${match[2]} (informational, no SMT constraint)`,
        ],
      };
    }
    return null;
  }

  private translatePostEquality(line: string): SpecTranslation['posts'][0] | null {
    const eq = this.tryExtractBinaryEquality(line);
    if (!eq) return null;

    const lhsIdx = this.resolveSignal(eq.lhs);
    const rhsIdx = this.resolveSignal(eq.rhs);

    if (lhsIdx !== null && rhsIdx !== null) {
      return {
        raw: line.trim(),
        kind: 'equality',
        lhsSignals: [eq.lhs],
        rhsSignals: [eq.rhs],
        smt2Lines: [
          `(assert (= s_${lhsIdx} s_${rhsIdx}))`,
        ],
        parseable: true,
      };
    }

    if (lhsIdx !== null) {
      const parsed = this.tryExtractArithmeticExpression(eq.rhs);
      if (parsed) {
        const smt2Expr = this.buildSmt2FromTokens(parsed.terms, parsed.ops);
        if (smt2Expr) {
          return {
            raw: line.trim(),
            kind: 'equality',
            lhsSignals: [eq.lhs],
            rhsSignals: parsed.terms.filter(t => !/^\d+$/.test(t)),
            smt2Lines: [
              `(assert (= s_${lhsIdx} ${smt2Expr}))`,
            ],
            parseable: true,
          };
        }
      }
    }

    if (this.isFpArithmetic(eq.rhs)) {
      const allSignals = [...(eq.lhs.match(/[\w.]+/g) || []), ...(eq.rhs.match(/[\w.]+/g) || [])]
        .filter(s => !/^\d+$/.test(s) && s !== '=');
      return {
        raw: line.trim(),
        kind: 'equality',
        lhsSignals: [eq.lhs],
        rhsSignals: allSignals.filter(s => s !== eq.lhs),
        smt2Lines: [
          `; Cannot auto-translate: ${line.trim()}`,
        ],
        parseable: false,
      };
    }

    return null;
  }

  private buildSmt2FromTokens(terms: string[], ops: string[]): string | null {
    let result = '';
    let i = 0;
    let expectOperand = true;
    while (i < terms.length) {
      const term = terms[i];
      if (/^\d+$/.test(term)) {
        result = result ? `${result} ${term}` : term;
        expectOperand = false;
      } else {
        const idx = this.resolveSignal(term);
        if (idx === null) return null;
        const varName = `s_${idx}`;
        if (ops[i - 1] === '*' && !expectOperand && result) {
          result = `(* ${result} ${varName})`;
        } else if (ops[i - 1] === '-' && !expectOperand && result) {
          result = `(- ${result} ${varName})`;
        } else if (ops[i - 1] === '+' && !expectOperand && result) {
          result = `(+ ${result} ${varName})`;
        } else {
          result = result ? `${result} ${varName}` : varName;
        }
        expectOperand = false;
      }
      i++;
    }
    return result || null;
  }

  private translateInvariantBoolean(line: string): SpecTranslation['invariants'][0] | null {
    const match = line.match(/^\s*(\S+)\s+is\s+boolean/);
    if (match) {
      const signal = match[1].trim();
      const idx = this.resolveSignal(signal);
      if (idx === null) return null;
      return {
        raw: line.trim(),
        kind: 'boolean',
        smt2Lines: [
          `(assert (or (= s_${idx} 0) (= s_${idx} 1)))`,
        ],
        parseable: true,
      };
    }
    return null;
  }

  private translateInvariantEquality(line: string): SpecTranslation['invariants'][0] | null {
    const match = line.match(/^\s*(.+?)\s*=\s*(.+)$/);
    if (!match) return null;
    const lhs = match[1].trim();
    const rhs = match[2].trim();

    const lhsTokens = lhs.match(/[\w.]+/g) || [];
    const rhsTokens = rhs.match(/[\w.]+/g) || [];
    const allSignals = [...lhsTokens, ...rhsTokens].filter(s => !/^\d+$/.test(s));

    const lhsParsed = this.tryExtractArithmeticExpression(lhs);
    const rhsParsed = this.tryExtractArithmeticExpression(rhs);
    const lhsSmt2 = lhsParsed ? this.buildSmt2FromTokens(lhsParsed.terms, lhsParsed.ops) : null;
    const rhsSmt2 = rhsParsed ? this.buildSmt2FromTokens(rhsParsed.terms, rhsParsed.ops) : null;

    if (lhsSmt2 && rhsSmt2) {
      return {
        raw: line.trim(),
        kind: 'equality',
        smt2Lines: [
          `(assert (= ${lhsSmt2} ${rhsSmt2}))`,
        ],
        parseable: true,
      };
    }

    return {
      raw: line.trim(),
      kind: 'equality',
      smt2Lines: [
        `; Cannot fully auto-translate: ${line.trim()}`,
      ],
      parseable: false,
    };
  }

  translateSpec(dsl: string): SpecTranslation {
    const result: SpecTranslation = {
      assumptions: [],
      posts: [],
      invariants: [],
      parseErrors: [],
    };

    const lines = dsl.split('\n');
    let section: 'none' | 'assumptions' | 'post' | 'invariants' = 'none';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;

      if (/^assumptions\s*:?\s*$/i.test(trimmed)) {
        section = 'assumptions';
        continue;
      }
      if (/^post\s*:?\s*$/i.test(trimmed)) {
        section = 'post';
        continue;
      }
      if (/^invariants\s*:?\s*$/i.test(trimmed)) {
        section = 'invariants';
        continue;
      }

      if (trimmed.startsWith('- ')) {
        const content = trimmed.slice(2).trim();
        if (!content) continue;

        if (section === 'assumptions') {
          const boolResult = this.translateAssumptionBoolean(content);
          if (boolResult) {
            result.assumptions.push(boolResult);
            continue;
          }
          const pubResult = this.translateAssumptionPublic(content);
          if (pubResult) {
            result.assumptions.push(pubResult);
            continue;
          }
          result.parseErrors.push(`Unparseable assumption: ${content}`);
        } else if (section === 'post') {
          const eqResult = this.translatePostEquality(content);
          if (eqResult) {
            result.posts.push(eqResult);
            continue;
          }
          result.parseErrors.push(`Unparseable post: ${content}`);
        } else if (section === 'invariants') {
          if (content.startsWith('[') && content.endsWith(']')) {
            result.invariants.push({
              raw: content,
              kind: 'unknown',
              smt2Lines: [`; Informational: ${content}`],
              parseable: false,
            });
            continue;
          }
          const boolResult = this.translateInvariantBoolean(content);
          if (boolResult) {
            result.invariants.push(boolResult);
            continue;
          }
          const eqResult = this.translateInvariantEquality(content);
          if (eqResult) {
            result.invariants.push(eqResult);
            continue;
          }
          result.invariants.push({
            raw: content,
            kind: 'unknown',
            smt2Lines: [`; Cannot parse: ${content}`],
            parseable: false,
          });
        }
      }
    }

    return result;
  }

  getTranslateableAssumptionCount(translation: SpecTranslation): number {
    return translation.assumptions.filter(a => a.kind !== 'constant').length;
  }

  getTranslateablePostCount(translation: SpecTranslation): number {
    return translation.posts.filter(p => p.parseable).length;
  }

  getTranslateableInvariantCount(translation: SpecTranslation): number {
    return translation.invariants.filter(inv => inv.parseable).length;
  }

  generateBaseSMT2(constraints: ConstraintObject[], allSignalIndices: number[]): string[] {
    const lines: string[] = [];
    lines.push('(set-logic ALL)');
    lines.push(`(define-const P Int ${this.primeField})`);
    for (const idx of allSignalIndices) {
      if (idx === 0) continue;
      lines.push(`(declare-fun s_${idx} () Int)`);
      lines.push(`(assert (and (>= s_${idx} 0) (< s_${idx} P)))`);
    }
    for (const [a, b, c] of constraints) {
      lines.push(`(assert ${this.translateConstraint(a, b, c)})`);
    }
    return lines;
  }

  private translateConstraint(a: ConstraintComponent, b: ConstraintComponent, c: ConstraintComponent): string {
    const aExpr = this.translateLinearExpression(a);
    const bExpr = this.translateLinearExpression(b);
    const cExpr = this.translateLinearExpression(c);
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
        result = constantTerm < BigInt(0)
          ? `(- ${result} ${-constantTerm})`
          : `(+ ${result} ${constantTerm})`;
      }
    } else {
      result = `(+ ${terms.join(' ')})`;
      if (constantTerm !== null && constantTerm !== BigInt(0)) {
        result = constantTerm < BigInt(0)
          ? `(- ${result} ${-constantTerm})`
          : `(+ ${result} ${constantTerm})`;
      }
    }
    return result;
  }

  private normalizeCoefficient(rawVal: string | number): bigint {
    let val = BigInt(rawVal);
    if (val < BigInt(0)) {
      val = ((val % this.primeField) + this.primeField) % this.primeField;
    } else if (val >= this.primeField) {
      val = val % this.primeField;
    }
    const half = this.primeField / BigInt(2);
    if (val > half) return val - this.primeField;
    return val;
  }

  getIndexToName(): Map<number, string> {
    return this.indexToName;
  }
}

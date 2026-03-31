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

  private stripComments(line: string): string {
    const commentIdx = line.indexOf('//');
    if (commentIdx >= 0) return line.substring(0, commentIdx).trim();
    return line.trim();
  }

  private stripTrailingParens(line: string): string {
    return line.replace(/\s*\([^)]*\)\s*$/g, '').trim();
  }

  private tryExtractBinaryEquality(line: string): { lhs: string; rhs: string } | null {
    const eqMatch = line.match(/^\s*(.+?)\s*(?:={2,3})\s*(.+)$/);
    if (eqMatch) {
      const lhs = eqMatch[1].trim();
      const rhs = eqMatch[2].trim();
      if (lhs && rhs) return { lhs, rhs };
    }
    const singleEqMatch = line.match(/^\s*(.+?)\s*=\s*(.+)$/);
    if (singleEqMatch) {
      const lhs = singleEqMatch[1].trim();
      const rhs = singleEqMatch[2].trim();
      if (lhs && rhs && !/^=/.test(rhs) && !/=$/.test(lhs)) {
        return { lhs, rhs };
      }
    }
    return null;
  }

  private tokenizeArithmetic(expr: string): { tokens: Array<{ type: 'number' | 'signal' | 'op' | 'lparen' | 'rparen'; value: string }> } | null {
    const regex = /(\d+)\s*\*\s*\(([^)]+)\)|(\d+)\s*\*\s*([\w.\[\]]+)|([\w.\[\]]+)\s*\*\s*([\w.\[\]]+)|(\d+)|([\w.\[\]]+)|([+\-*,()])/g;
    const rawTokens: Array<{ type: 'number' | 'signal' | 'op' | 'lparen' | 'rparen'; value: string }> = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(expr)) !== null) {
      if (match[1] !== undefined && match[2] !== undefined) {
        rawTokens.push({ type: 'number', value: match[1] });
        rawTokens.push({ type: 'op', value: '*' });
        const inner = match[2].trim();
        for (const t of inner.split(/(?=[+\-*,])|(?<=[+\-*,])/)) {
          const tt = t.trim();
          if (!tt) continue;
          if (/^\d+$/.test(tt)) rawTokens.push({ type: 'number', value: tt });
          else if (['+', '-', '*', ','].includes(tt)) rawTokens.push({ type: 'op', value: tt });
          else rawTokens.push({ type: 'signal', value: tt });
        }
      } else if (match[3] !== undefined && match[4] !== undefined) {
        rawTokens.push({ type: 'number', value: match[3] });
        rawTokens.push({ type: 'op', value: '*' });
        rawTokens.push({ type: 'signal', value: match[4] });
      } else if (match[5] !== undefined && match[6] !== undefined) {
        rawTokens.push({ type: 'signal', value: match[5] });
        rawTokens.push({ type: 'op', value: '*' });
        rawTokens.push({ type: 'signal', value: match[6] });
      } else if (match[7] !== undefined) {
        rawTokens.push({ type: 'number', value: match[7] });
      } else if (match[8] !== undefined) {
        rawTokens.push({ type: 'signal', value: match[8] });
      } else if (match[9] !== undefined) {
        if (match[9] === '(') rawTokens.push({ type: 'lparen', value: '(' });
        else if (match[9] === ')') rawTokens.push({ type: 'rparen', value: ')' });
        else rawTokens.push({ type: 'op', value: match[9] });
      }
    }
    return rawTokens.length > 0 ? { tokens: rawTokens } : null;
  }

  private buildSmt2Expression(tokens: Array<{ type: 'number' | 'signal' | 'op' | 'lparen' | 'rparen'; value: string }>): string | null {
    const addOps: string[] = [];
    const args: string[] = [];
    let i = 0;

    while (i < tokens.length) {
      const t = tokens[i];
      if (t.type === 'op' && t.value === '+') {
        addOps.push('+');
        i++;
      } else if (t.type === 'op' && t.value === '-') {
        i++;
        if (i < tokens.length && (tokens[i].type === 'signal' || tokens[i].type === 'number')) {
          let val: string;
          if (tokens[i].type === 'signal') {
            const idx = this.resolveSignal(tokens[i].value);
            if (idx === null) return null;
            val = `s_${idx}`;
          } else {
            val = tokens[i].value;
          }
          args.push(`(- ${val})`);
          i++;
        }
      } else if (t.type === 'op' && t.value === '*') {
        i++;
        if (i < tokens.length && (tokens[i].type === 'signal' || tokens[i].type === 'number')) {
          let val: string;
          if (tokens[i].type === 'signal') {
            const idx = this.resolveSignal(tokens[i].value);
            if (idx === null) return null;
            val = `s_${idx}`;
          } else {
            val = tokens[i].value;
          }
          if (args.length === 0) {
            return null;
          }
          const prev = args.pop()!;
          args.push(`(* ${prev} ${val})`);
          i++;
        }
      } else if (t.type === 'lparen' || t.type === 'rparen') {
        i++;
      } else {
        let val: string;
        if (t.type === 'signal') {
          const idx = this.resolveSignal(t.value);
          if (idx === null) return null;
          val = `s_${idx}`;
        } else if (t.type === 'number') {
          val = t.value;
        } else {
          return null;
        }
        args.push(val);
        i++;
      }
    }

    if (args.length === 0) return null;

    if (addOps.length === 0) return args[0];

    let result = args[0];
    for (let j = 1; j < args.length; j++) {
      result = `(+ ${result} ${args[j]})`;
    }
    return result;
  }

  private extractBooleanSignal(line: string): string | null {
    const match = line.match(/^\s*([\w.\[\]]+)\s*\*\s*\1\s*=\s*0\s*$/);
    if (match) return match[1].trim();
    const match2 = line.match(/^\s*([\w.\[\]]+)\s*\*\s*\(1\s*-\s*([\w.\[\]]+)\)\s*=\s*0\s*$/);
    if (match2 && match2[1].trim() === match2[2].trim()) return match2[1].trim();
    return null;
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
    const match = line.match(/^\s*([\w.\[\],\s]+?)\s+are\s+(public|private)/);
    if (match) {
      const signalsStr = match[1].trim();
      const signals = signalsStr.split(',').map(s => s.trim()).filter(Boolean);
      const visibility = match[2];
      for (const sig of signals) {
        this.resolveSignal(sig);
      }
      return {
        raw: line.trim(),
        signal: signals.join(', '),
        kind: 'constant',
        params: { visibility },
        smt2Lines: signals.map(s => `; ${s} is ${visibility} (informational, no SMT constraint)`),
      };
    }
    const singleMatch = line.match(/^\s*(\S+)\s+is\s+(public|private)/);
    if (singleMatch) {
      const signal = singleMatch[1].trim();
      const idx = this.resolveSignal(signal);
      if (idx === null) return null;
      return {
        raw: line.trim(),
        signal,
        kind: 'constant',
        params: { visibility: singleMatch[2] },
        smt2Lines: [
          `; ${signal} is ${singleMatch[2]} (informational, no SMT constraint)`,
        ],
      };
    }
    return null;
  }

  private translateInformational(line: string): SpecTranslation['assumptions'][0] | null {
    const cleaned = this.stripTrailingParens(line);
    const descPatterns = [
      /^\s*([\w.\[\]]+)\s+is\s+a\s+/i,
      /^\s*([\w.\[\]]+(?:\[[^\]]*\])?)\s+are\s+/i,
    ];
    for (const pat of descPatterns) {
      const match = cleaned.match(pat);
      if (match) return { raw: line.trim(), signal: match[1].trim(), kind: 'constant' as const, params: {}, smt2Lines: [`; ${cleaned}`] };
    }
    const broaderPatterns = [
      /^\s*([\w.\[\]]+)\s+is\s+/i,
    ];
    for (const pat of broaderPatterns) {
      const match = cleaned.match(pat);
      if (match) return { raw: line.trim(), signal: match[1].trim(), kind: 'constant' as const, params: {}, smt2Lines: [`; ${cleaned}`] };
    }
    return null;
  }

  private buildSmt2FromExpr(expr: string): string | null {
    const tokenized = this.tokenizeArithmetic(expr);
    if (!tokenized) return null;
    const smt2 = this.buildSmt2Expression(tokenized.tokens);
    return smt2;
  }

  private extractSignalsFromExpr(expr: string): string[] {
    const signals: string[] = [];
    const regex = /[\w.\[\]]+/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(expr)) !== null) {
      const name = match[0];
      if (!/^\d+$/.test(name)) {
        signals.push(name);
      }
    }
    return signals;
  }

  private translatePostEquality(line: string): SpecTranslation['posts'][0] | null {
    const cleanLine = this.stripComments(line).trim();
    const cleanLineNoParens = this.stripTrailingParens(cleanLine);

    const boolSignal = this.extractBooleanSignal(cleanLineNoParens);
    if (boolSignal) {
      const idx = this.resolveSignal(boolSignal);
      if (idx !== null) {
        return {
          raw: line.trim(),
          kind: 'equality',
          lhsSignals: [boolSignal],
          rhsSignals: [],
          smt2Lines: [
            `(assert (or (= s_${idx} 0) (= s_${idx} 1)))`,
          ],
          parseable: true,
        };
      }
    }

    const eq = this.tryExtractBinaryEquality(cleanLineNoParens);
    if (!eq) return null;

    const lhsExpr = this.buildSmt2FromExpr(eq.lhs);
    const rhsExpr = this.buildSmt2FromExpr(eq.rhs);

    if (lhsExpr !== null && rhsExpr !== null) {
      const lhsSignals = this.extractSignalsFromExpr(eq.lhs);
      const rhsSignals = this.extractSignalsFromExpr(eq.rhs);
      return {
        raw: line.trim(),
        kind: 'equality',
        lhsSignals,
        rhsSignals,
        smt2Lines: [
          `(assert (= (mod ${lhsExpr} P) (mod ${rhsExpr} P)))`,
        ],
        parseable: true,
      };
    }

    if (lhsExpr !== null) {
      const lhsSignals = this.extractSignalsFromExpr(eq.lhs);
      return {
        raw: line.trim(),
        kind: 'equality',
        lhsSignals,
        rhsSignals: this.extractSignalsFromExpr(eq.rhs),
        smt2Lines: [
          `; Cannot translate RHS: ${eq.rhs}`,
        ],
        parseable: false,
      };
    }

    const lhsSignals = this.extractSignalsFromExpr(eq.lhs);
    const rhsSignals = this.extractSignalsFromExpr(eq.rhs);
    if (lhsSignals.length > 0 || rhsSignals.length > 0) {
      return {
        raw: line.trim(),
        kind: 'equality',
        lhsSignals,
        rhsSignals,
        smt2Lines: [
          `; Cannot auto-translate: ${line.trim()}`,
        ],
        parseable: false,
      };
    }

    return null;
  }

  private translateInvariantBoolean(line: string): SpecTranslation['invariants'][0] | null {
    const cleanLine = this.stripComments(line).trim();
    const match = cleanLine.match(/^\s*(\S+)\s+is\s+boolean/);
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
    const boolSignal = this.extractBooleanSignal(cleanLine);
    if (boolSignal) {
      const idx = this.resolveSignal(boolSignal);
      if (idx !== null) {
        return {
          raw: line.trim(),
          kind: 'boolean',
          smt2Lines: [
            `(assert (or (= s_${idx} 0) (= s_${idx} 1)))`,
          ],
          parseable: true,
        };
      }
    }
    return null;
  }

  private translateInvariantEquality(line: string): SpecTranslation['invariants'][0] | null {
    const cleanLine = this.stripComments(line).trim();
    const cleanLineNoParens = this.stripTrailingParens(cleanLine);

    const eq = this.tryExtractBinaryEquality(cleanLineNoParens);
    if (!eq) return null;

    const lhsExpr = this.buildSmt2FromExpr(eq.lhs);
    const rhsExpr = this.buildSmt2FromExpr(eq.rhs);

    if (lhsExpr !== null && rhsExpr !== null) {
      return {
        raw: line.trim(),
        kind: 'equality',
        smt2Lines: [
          `(assert (= (mod ${lhsExpr} P) (mod ${rhsExpr} P)))`,
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
      if (!trimmed) continue;
      const noComment = this.stripComments(trimmed);
      if (!noComment) continue;

      if (/^assumptions\s*:?\s*$/i.test(noComment)) {
        section = 'assumptions';
        continue;
      }
      if (/^post\s*:?\s*$/i.test(noComment)) {
        section = 'post';
        continue;
      }
      if (/^invariants\s*:?\s*$/i.test(noComment)) {
        section = 'invariants';
        continue;
      }

      if (trimmed.startsWith('- ')) {
        const content = this.stripComments(trimmed.slice(2).trim());
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
          const infoResult = this.translateInformational(content);
          if (infoResult) {
            result.assumptions.push(infoResult);
            continue;
          }
          result.parseErrors.push(`Unparseable assumption: ${content}`);
        } else if (section === 'post') {
          const eqResult = this.translatePostEquality(content);
          if (eqResult) {
            result.posts.push(eqResult);
            continue;
          }
          const infoResult = this.translateInformational(content);
          if (infoResult) {
            result.posts.push({ ...infoResult, kind: 'equality', lhsSignals: [], rhsSignals: [], parseable: false } as SpecTranslation['posts'][0]);
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

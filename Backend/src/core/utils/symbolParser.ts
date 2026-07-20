import * as fs from 'fs/promises';
import type { ConstraintObject } from '../../types/constraint.js';
import { simplifyFieldElement } from './fieldConstants.js';

export interface SymEntry {
  index: number;
  witness: number;
  component: number;
  name: string;
}

export interface HumanReadableLinearExpression {
  text: string;
  terms: Array<{
    signalIndex: number;
    signal: string;
    coefficient: string;
  }>;
  constant: string;
}

export interface HumanReadableConstraint {
  index: number;
  formula: string;
  a: HumanReadableLinearExpression;
  b: HumanReadableLinearExpression;
  c: HumanReadableLinearExpression;
  signalsUsed: string[];
}

export async function parseSymFile(symPath: string): Promise<SymEntry[]> {
  const content = await fs.readFile(symPath, 'utf-8');
  const lines = content.trim().split('\n');
  return lines
    .filter(line => line.trim().length > 0)
    .map(line => {
      const fields = line.split(',');
      return {
        index: parseInt(fields[0]),
        witness: parseInt(fields[1]),
        component: parseInt(fields[2]),
        name: fields.slice(3).join(',').trim(),
      };
    });
}

export async function parseConstraintsFile(constraintsJsonPath: string): Promise<ConstraintObject[]> {
  const content = await fs.readFile(constraintsJsonPath, 'utf-8');
  const json = JSON.parse(content);
  return json.constraints.map(
    (triple: Array<Record<string, string | number>>) => triple as ConstraintObject
  );
}

function buildSignalNameMap(symEntries: SymEntry[]): Map<number, string> {
  const indexToName = new Map<number, string>();
  for (const entry of symEntries) {
    indexToName.set(entry.index, entry.name);
  }
  return indexToName;
}

function getSignalName(signalIdx: number, indexToName: Map<number, string>): string {
  return indexToName.get(signalIdx) || `s_${signalIdx}`;
}

function formatSignedTerm(coeff: bigint, term: string, isFirst: boolean): string {
  const absCoeff = coeff < 0n ? -coeff : coeff;
  const body = absCoeff === 1n ? term : `${absCoeff} * ${term}`;

  if (isFirst) {
    return coeff < 0n ? `-${body}` : body;
  }

  return coeff < 0n ? ` - ${body}` : ` + ${body}`;
}

function formatLinearExpression(
  linExpr: Record<string, string | number>,
  indexToName: Map<number, string>
): HumanReadableLinearExpression {
  const terms: HumanReadableLinearExpression['terms'] = [];
  let constant = 0n;

  const entries = Object.entries(linExpr)
    .map(([key, val]) => [parseInt(key, 10), key, val] as const)
    .sort(([left], [right]) => left - right);

  for (const [signalIdx, key, val] of entries) {
    const coeff = simplifyFieldElement(val);
    if (coeff === 0n) continue;

    if (key === '0') {
      constant += coeff;
      continue;
    }

    terms.push({
      signalIndex: signalIdx,
      signal: getSignalName(signalIdx, indexToName),
      coefficient: String(coeff),
    });
  }

  let text = '';
  for (const term of terms) {
    text += formatSignedTerm(BigInt(term.coefficient), term.signal, text.length === 0);
  }

  if (constant !== 0n) {
    if (text.length === 0) {
      text = String(constant);
    } else if (constant < 0n) {
      text += ` - ${-constant}`;
    } else {
      text += ` + ${constant}`;
    }
  }

  if (text.length === 0) {
    text = '0';
  }

  return {
    text,
    terms,
    constant: String(constant),
  };
}

function formatFactor(expr: HumanReadableLinearExpression): string {
  const hasMultipleTerms = expr.terms.length + (expr.constant !== '0' ? 1 : 0) > 1;
  return hasMultipleTerms ? `(${expr.text})` : expr.text;
}

export function humanizeConstraint(
  constraint: ConstraintObject,
  symEntries: SymEntry[],
  index = 0
): HumanReadableConstraint {
  const indexToName = buildSignalNameMap(symEntries);
  const [a, b, c] = constraint;
  const readableA = formatLinearExpression(a, indexToName);
  const readableB = formatLinearExpression(b, indexToName);
  const readableC = formatLinearExpression(c, indexToName);
  const signalsUsed = new Map<number, string>();

  for (const expr of [readableA, readableB, readableC]) {
    for (const term of expr.terms) {
      signalsUsed.set(term.signalIndex, term.signal);
    }
  }

  return {
    index,
    formula: `${formatFactor(readableA)} * ${formatFactor(readableB)} = ${readableC.text}`,
    a: readableA,
    b: readableB,
    c: readableC,
    signalsUsed: Array.from(signalsUsed.entries())
      .sort(([left], [right]) => left - right)
      .map(([, name]) => name),
  };
}

export function formatConstraintWithNames(
  constraint: ConstraintObject,
  symEntries: SymEntry[]
): string {
  return humanizeConstraint(constraint, symEntries).formula;
}

export interface ResolvedConstraint {
  index: number;
  formula: string;
  signalsUsed: string[];
}

export function resolveConstraintsWithNames(
  constraints: ConstraintObject[],
  symEntries: SymEntry[]
): ResolvedConstraint[] {
  return constraints.map((constraint, idx) => {
    const readable = humanizeConstraint(constraint, symEntries, idx);

    return {
      index: idx,
      formula: readable.formula,
      signalsUsed: readable.signalsUsed,
    };
  });
}

export function humanizeConstraintSystem(
  constraints: ConstraintObject[],
  symEntries: SymEntry[]
): HumanReadableConstraint[] {
  return constraints.map((constraint, idx) => humanizeConstraint(constraint, symEntries, idx));
}

export function formatConstraintSystemWithNames(
  constraints: ConstraintObject[],
  symEntries: SymEntry[]
): string {
  const readable = humanizeConstraintSystem(constraints, symEntries);
  const lines = [`R1CS constraint system (${readable.length} constraints)`];

  for (const constraint of readable) {
    lines.push(`#${constraint.index}: ${constraint.formula}`);
  }

  return lines.join('\n');
}

export function resolveConstraintTrees(
  constraints: ConstraintObject[],
  symEntries: SymEntry[]
): Array<{ index: number; kind: string; description: string; a: any; b: any; c: any }> {
  const indexToName = buildSignalNameMap(symEntries);

  return constraints.map((constraint, idx) => {
    const [rawA, rawB, rawC] = constraint;
    const parseExpr = (expr: Record<string, string | number>) => {
      const terms: Array<{ signal: string; signalIndex: number; coefficient: string }> = [];
      let constant = '0';
      for (const [key, val] of Object.entries(expr)) {
        if (key === '0') {
          constant = String(simplifyFieldElement(val));
          continue;
        }
        const signalIdx = parseInt(key);
        const signalName = getSignalName(signalIdx, indexToName);
        const coeff = simplifyFieldElement(val);
        if (coeff !== 0n) {
          terms.push({ signal: signalName, signalIndex: signalIdx, coefficient: String(coeff) });
        }
      }
      return { terms, constant };
    };
    return {
      index: idx,
      kind: 'unknown',
      description: '',
      a: parseExpr(rawA),
      b: parseExpr(rawB),
      c: parseExpr(rawC),
    };
  });
}

import * as fs from 'fs/promises';
import type { ConstraintObject } from '../../types/constraint.js';

export interface SymEntry {
  index: number;
  witness: number;
  component: number;
  name: string;
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

const GROTH16_PRIME = "21888242871839275222246405745257275088548364400416034343698204186575808495617";
const P = BigInt(GROTH16_PRIME);

function simplifyFieldElement(rawVal: string | number): bigint {
  let val = BigInt(rawVal);
  if (val < 0n) {
    val = ((val % P) + P) % P;
  } else if (val >= P) {
    val = val % P;
  }
  const half = P / 2n;
  if (val > half) {
    return val - P;
  }
  return val;
}

export function formatConstraintWithNames(
  constraint: ConstraintObject,
  symEntries: SymEntry[]
): string {
  const indexToName = new Map<number, string>();
  for (const entry of symEntries) {
    indexToName.set(entry.index, entry.name);
  }

  const [a, b, c] = constraint;
  const parts: string[] = [];

  for (const linExpr of [a, b, c]) {
    const terms: string[] = [];
    let constantTerm: bigint | null = null;

    for (const [key, val] of Object.entries(linExpr)) {
      const coeff = simplifyFieldElement(val);
      if (coeff === 0n) continue;

      if (key === '0' || key === '1') {
        constantTerm = coeff;
      } else {
        const signalIdx = parseInt(key);
        const signalName = indexToName.get(signalIdx) || `s_${signalIdx}`;

        if (coeff === 1n) {
          terms.push(signalName);
        } else if (coeff === -1n) {
          terms.push(`(-${signalName})`);
        } else {
          terms.push(`${coeff} * ${signalName}`);
        }
      }
    }

    let exprStr: string;
    if (terms.length === 0) {
      exprStr = constantTerm !== null ? String(constantTerm) : '0';
    } else {
      exprStr = terms.join(' + ');
      if (constantTerm !== null && constantTerm !== 0n) {
        if (constantTerm < 0n) {
          exprStr += ` - ${-constantTerm}`;
        } else {
          exprStr += ` + ${constantTerm}`;
        }
      }
    }

    parts.push(exprStr);
  }

  return `${parts[0]} * ${parts[1]} = ${parts[2]}`;
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
  const indexToName = new Map<number, string>();
  for (const entry of symEntries) {
    indexToName.set(entry.index, entry.name);
  }

  return constraints.map((constraint, idx) => {
    const signalsUsed = new Set<string>();
    for (const linExpr of constraint) {
      for (const key of Object.keys(linExpr)) {
        if (key === '0' || key === '1') continue;
        const signalIdx = parseInt(key);
        signalsUsed.add(indexToName.get(signalIdx) || `s_${signalIdx}`);
      }
    }

    return {
      index: idx,
      formula: formatConstraintWithNames(constraint, symEntries),
      signalsUsed: Array.from(signalsUsed),
    };
  });
}

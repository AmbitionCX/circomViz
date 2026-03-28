import type { ConstraintObject } from '../../types/constraint.js';
import type { SymEntry } from './symbolParser.js';

const GROTH16_PRIME = "21888242871839275222246405745257275088548364400416034343698204186575808495617";
const P = BigInt(GROTH16_PRIME);

function simplifyFieldElement(rawVal: string | number): bigint {
  let val = BigInt(rawVal);
  if (val < 0n) val = ((val % P) + P) % P;
  else if (val >= P) val = val % P;
  const half = P / 2n;
  return val > half ? val - P : val;
}

interface LinearExprParsed {
  terms: Map<number, bigint>;
  constant: bigint;
}

function parseLinearExpr(expr: Record<string, string | number>): LinearExprParsed {
  const terms = new Map<number, bigint>();
  let constant = 0n;
  for (const [key, val] of Object.entries(expr)) {
    const coeff = simplifyFieldElement(val);
    if (coeff === 0n) continue;
    if (key === '0' || key === '1') {
      constant = coeff;
    } else {
      const idx = parseInt(key);
      terms.set(idx, coeff);
    }
  }
  return { terms, constant };
}

export type InvariantKind =
  | 'boolean'
  | 'range_check'
  | 'multiplication'
  | 'addition'
  | 'linear_equality'
  | 'selector_gate'
  | 'decomposition'
  | 'constant_constraint'
  | 'complex'
  | 'zero_constraint';

export interface NormalizedInvariant {
  kind: InvariantKind;
  description: string;
  signals: string[];
  rawFormula: string;
}

function signalName(idx: number, indexToName: Map<number, string>): string {
  return indexToName.get(idx) || `s_${idx}`;
}

function classifyConstraint(
  constraint: ConstraintObject,
  indexToName: Map<number, string>
): NormalizedInvariant {
  const [rawA, rawB, rawC] = constraint;
  const a = parseLinearExpr(rawA);
  const b = parseLinearExpr(rawB);
  const c = parseLinearExpr(rawC);

  const allSignals = new Set<number>();
  for (const idx of [...a.terms.keys(), ...b.terms.keys(), ...c.terms.keys()]) {
    allSignals.add(idx);
  }
  const sigNames = Array.from(allSignals).map(i => signalName(i, indexToName));

  const A = a.terms;
  const B = b.terms;
  const C = c.terms;
  const aConst = a.constant;
  const bConst = b.constant;
  const cConst = c.constant;

  function termStr(idx: number, coeff: bigint): string {
    const name = signalName(idx, indexToName);
    if (coeff === 1n) return name;
    if (coeff === -1n) return `(-${name})`;
    return `${coeff} * ${name}`;
  }

  function linExprStr(terms: Map<number, bigint>, constant: bigint): string {
    const parts: string[] = [];
    for (const [idx, coeff] of terms) {
      parts.push(termStr(idx, coeff));
    }
    let s = parts.join(' + ');
    if (constant !== 0n) {
      if (s.length === 0) s = String(constant);
      else if (constant > 0n) s += ` + ${constant}`;
      else s += ` - ${-constant}`;
    }
    return s.length === 0 ? '0' : s;
  }

  const rawFormula = `${linExprStr(A, aConst)} * ${linExprStr(B, bConst)} = ${linExprStr(C, cConst)}`;

  const aSize = A.size;
  const bSize = B.size;
  const cSize = C.size;

  const isATrivial = aSize === 0 && aConst === 1n;
  const isBTrivial = bSize === 0 && bConst === 1n;
  const isCTrivial = cSize === 0 && cConst === 0n;

  if (isATrivial && isBTrivial && isCTrivial) {
    return { kind: 'zero_constraint', description: '0 = 0 (trivial)', signals: [], rawFormula };
  }

  if (isATrivial && isBTrivial) {
    const cParts: string[] = [];
    for (const [idx, coeff] of C) cParts.push(termStr(idx, coeff));
    let desc = cParts.join(' + ');
    if (cConst !== 0n) desc += (desc.length ? ` + ${cConst}` : String(cConst));
    if (desc.length === 0) desc = '0';
    return { kind: 'linear_equality', description: `${desc} = 0`, signals: sigNames, rawFormula };
  }

  if (isATrivial && aSize === 0) {
    return { kind: 'constant_constraint', description: rawFormula, signals: sigNames, rawFormula };
  }

  if (aSize === 1 && coeffA_is1(A)) {
    const [xA, coeffA] = [...A.entries()][0];
    const xName = signalName(xA, indexToName);

    if (bSize === 0 && bConst === 0n && cSize === 0 && cConst === 0n) {
      return { kind: 'constant_constraint', description: `${xName} * 0 = 0`, signals: sigNames, rawFormula };
    }

    if (bSize === 0 && bConst === -1n && cSize === 0 && cConst === 0n) {
      return { kind: 'boolean', description: `${xName} is boolean (${xName} * (-1) = 0)`, signals: sigNames, rawFormula };
    }

    if (bSize === 0 && bConst === -1n && cSize === 1 && cConst === 1n) {
      const [xC, coeffC] = [...C.entries()][0];
      if (coeffC === 1n && xA === xC) {
        return { kind: 'boolean', description: `${xName} is boolean (${xName} - ${xName} = 0)`, signals: sigNames, rawFormula };
      }
    }

    if (bSize === 1 && bConst === 0n) {
      const [xB, coeffB] = [...B.entries()][0];
      const bName = signalName(xB, indexToName);
      if (cSize === 0 && cConst === 0n) {
        if (coeffB === 1n) {
          return { kind: 'boolean', description: `${xName} * ${bName} = 0 (both cannot be simultaneously non-zero)`, signals: sigNames, rawFormula };
        }
      }
      if (cSize === 1 && cConst === 0n) {
        const [xC, coeffC] = [...C.entries()][0];
        if (coeffA === 1n && coeffB === 1n && coeffC === 1n && xA === xB && xB === xC) {
          return { kind: 'boolean', description: `${xName} is boolean (${xName}^2 = ${xName})`, signals: sigNames, rawFormula };
        }
        if (xC === xA && coeffC === coeffA && xB !== xA) {
          return { kind: 'selector_gate', description: `${bName} gates ${xName} (selector pattern)`, signals: sigNames, rawFormula };
        }
        if (xC === xB && coeffC === coeffB && xA !== xB) {
          return { kind: 'selector_gate', description: `${xName} gates ${bName} (selector pattern)`, signals: sigNames, rawFormula };
        }
      }
    }

    if (bSize === 1 && cConst === 0n && cSize <= 1) {
      return { kind: 'multiplication', description: `${xName} * (linear_expr) = (linear_expr)`, signals: sigNames, rawFormula };
    }
  }

  if (aSize === 0 && bSize === 1 && cSize === 0) {
    const [xB, coeffB] = [...B.entries()][0];
    if (coeffB === 1n && aConst === 0n && cConst === 0n) {
      return { kind: 'boolean', description: `${signalName(xB, indexToName)} is boolean`, signals: sigNames, rawFormula };
    }
  }

  if (aSize === 0 && aConst !== 0n && bSize === 1 && cSize === 1) {
    const [xB, coeffB] = [...B.entries()][0];
    const [xC, coeffC] = [...C.entries()][0];
    const bName = signalName(xB, indexToName);
    const cName = signalName(xC, indexToName);
    if (coeffB === 1n) {
      return { kind: 'multiplication', description: `${aConst} * ${bName} = ${coeffC === 1n ? cName : `${coeffC} * ${cName}`}`, signals: sigNames, rawFormula };
    }
  }

  if ((isATrivial || (aSize === 0 && aConst === 1n)) && bSize <= 1 && cSize >= 1) {
    const bStr = bSize === 0 ? String(bConst) : bSize === 1 ? (() => {
      const [idx, coeff] = [...B.entries()][0];
      return coeff === 1n ? signalName(idx, indexToName) : `${coeff} * ${signalName(idx, indexToName)}`;
    })() : '...';
    const cStr = linExprStr(C, cConst);
    if (bSize === 0) {
      return { kind: 'linear_equality', description: `${cStr} = 0`, signals: sigNames, rawFormula };
    }
  }

  if (aSize <= 2 && bSize <= 2 && cSize <= 2) {
    const desc = rawFormula;
    if (aSize === 1 && bSize === 1 && cSize <= 1) {
      return { kind: 'multiplication', description: desc, signals: sigNames, rawFormula };
    }
    if (bSize === 0 && bConst === 1n) {
      return { kind: 'linear_equality', description: desc, signals: sigNames, rawFormula };
    }
  }

  return { kind: 'complex', description: rawFormula, signals: sigNames, rawFormula };
}

function coeffA_is1(terms: Map<number, bigint>): boolean {
  if (terms.size !== 1) return false;
  const [, coeff] = [...terms.entries()][0];
  return coeff === 1n;
}

export function normalizeConstraints(
  constraints: ConstraintObject[],
  symEntries: SymEntry[]
): { invariants: NormalizedInvariant[]; indexToName: Map<number, string> } {
  const indexToName = new Map<number, string>();
  for (const entry of symEntries) {
    indexToName.set(entry.index, entry.name);
  }

  const invariants = constraints.map(c => classifyConstraint(c, indexToName));
  return { invariants, indexToName };
}

export interface SubcomponentCluster {
  prefix: string;
  signals: Array<{ name: string; index: number; witness: number }>;
  publicSignals: string[];
  privateSignals: string[];
  constraintCount: number;
}

export function clusterSignalsByComponentPath(
  symEntries: SymEntry[],
  constraints: ConstraintObject[]
): SubcomponentCluster[] {
  const prefixMap = new Map<string, Array<{ name: string; index: number; witness: number }>>();
  const constrainedIds = new Set<number>();

  for (const constraint of constraints) {
    for (const linExpr of constraint) {
      for (const key of Object.keys(linExpr)) {
        if (key !== '0' && key !== '1') {
          constrainedIds.add(parseInt(key));
        }
      }
    }
  }

  for (const entry of symEntries) {
    if (entry.index === 0) continue;
    const parts = entry.name.split('.');
    let bestPrefix = 'main';
    for (let i = 2; i <= parts.length; i++) {
      const prefix = parts.slice(0, i).join('.');
      if (!prefixMap.has(prefix)) {
        prefixMap.set(prefix, []);
      }
      bestPrefix = prefix;
    }
    if (!prefixMap.has(bestPrefix)) {
      prefixMap.set(bestPrefix, []);
    }
    prefixMap.get(bestPrefix)!.push({
      name: entry.name,
      index: entry.index,
      witness: entry.witness,
    });
  }

  const clusters: SubcomponentCluster[] = [];
  for (const [prefix, signals] of prefixMap) {
    if (prefix === 'main' && prefixMap.size > 1) continue;

    const constrainedSignals = signals.filter(s => constrainedIds.has(s.index));
    const constraintCount = constrainedSignals.length;

    const publicSignals = signals
      .filter(s => s.witness >= 0)
      .map(s => s.name);
    const privateSignals = signals
      .filter(s => s.witness === -1)
      .map(s => s.name);

    clusters.push({
      prefix,
      signals,
      publicSignals,
      privateSignals,
      constraintCount,
    });
  }

  return clusters.sort((a, b) => a.prefix.localeCompare(b.prefix));
}

export interface InterfaceSummary {
  templateName: string;
  inputs: Array<{ name: string; kind: string }>;
  outputs: Array<{ name: string; kind: string }>;
  publicSignals: string[];
  privateSignals: string[];
  likelyBooleanFlags: string[];
  likelyCommitments: string[];
  likelyHashes: string[];
}

export function buildInterfaceSummary(
  symEntries: SymEntry[],
  astSignals: Array<{ name: string; kind: string }>,
  invariants: NormalizedInvariant[]
): InterfaceSummary {
  const nameToEntry = new Map<string, { name: string; index: number; witness: number }>();
  for (const entry of symEntries) {
    if (entry.index === 0) continue;
    nameToEntry.set(entry.name, entry);
  }

  const inputs: Array<{ name: string; kind: string }> = [];
  const outputs: Array<{ name: string; kind: string }> = [];

  for (const sig of astSignals) {
    const entry = nameToEntry.get(sig.name);
    inputs.push({ name: sig.name, kind: sig.kind });
    if (sig.kind === 'output') {
      outputs.push({ name: sig.name, kind: 'output' });
    }
  }

  const publicSignals = symEntries
    .filter(e => e.index !== 0 && e.witness >= 0)
    .map(e => e.name);
  const privateSignals = symEntries
    .filter(e => e.index !== 0 && e.witness === -1)
    .map(e => e.name);

  const booleanSignals = new Set<string>();
  for (const inv of invariants) {
    if (inv.kind === 'boolean') {
      for (const s of inv.signals) {
        const shortName = s.includes('.') ? s.split('.').pop()! : s;
        booleanSignals.add(shortName);
        booleanSignals.add(s);
      }
    }
  }

  const likelyBooleanFlags = Array.from(booleanSignals);

  const likelyCommitments: string[] = [];
  const likelyHashes: string[] = [];
  for (const name of [...publicSignals, ...privateSignals]) {
    const lower = name.toLowerCase();
    if (lower.includes('commit') || lower.includes('nullifier')) {
      likelyCommitments.push(name);
    }
    if (lower.includes('hash') || lower.includes('digest') || lower.includes('h_')) {
      likelyHashes.push(name);
    }
  }

  return {
    templateName: '',
    inputs,
    outputs,
    publicSignals,
    privateSignals,
    likelyBooleanFlags,
    likelyCommitments,
    likelyHashes,
  };
}

export function getRepresentativeInvariants(
  invariants: NormalizedInvariant[],
  maxPerKind: number = 3
): NormalizedInvariant[] {
  const kindOrder: InvariantKind[] = [
    'boolean', 'selector_gate', 'multiplication', 'addition',
    'linear_equality', 'range_check', 'decomposition',
    'constant_constraint', 'complex', 'zero_constraint',
  ];

  const buckets = new Map<InvariantKind, NormalizedInvariant[]>();
  for (const inv of invariants) {
    if (!buckets.has(inv.kind)) buckets.set(inv.kind, []);
    buckets.get(inv.kind)!.push(inv);
  }

  const representatives: NormalizedInvariant[] = [];
  for (const kind of kindOrder) {
    const bucket = buckets.get(kind);
    if (bucket) {
      representatives.push(...bucket.slice(0, maxPerKind));
    }
  }

  return representatives;
}

export function summarizeInvariants(invariants: NormalizedInvariant[]): string {
  const counts = new Map<InvariantKind, number>();
  for (const inv of invariants) {
    counts.set(inv.kind, (counts.get(inv.kind) || 0) + 1);
  }

  const kindLabel: Record<InvariantKind, string> = {
    boolean: 'Boolean constraint (x*(x-1)=0)',
    selector_gate: 'Selector/gate constraint',
    multiplication: 'Multiplication',
    addition: 'Addition/linear combination',
    linear_equality: 'Linear equality',
    range_check: 'Range check',
    decomposition: 'Bit/field decomposition',
    constant_constraint: 'Constant constraint',
    complex: 'Complex constraint',
    zero_constraint: 'Trivial constraint',
  };

  const lines: string[] = [`Total: ${invariants.length} constraints`];
  for (const [kind, count] of counts) {
    lines.push(`  ${kindLabel[kind] || kind}: ${count}`);
  }

  return lines.join('\n');
}

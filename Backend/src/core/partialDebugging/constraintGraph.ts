import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { parseSymFile } from '../utils/symbolParser.js';
import type { ConstraintGraphDto, ConstraintNodeDto, LinearCombination, OptimizationLevel } from '../../types/partialDebugging.js';

export const CIRCOM_BN254_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const canonical = (value: string | number) => {
  const result = BigInt(value) % CIRCOM_BN254_PRIME;
  return result < 0n ? result + CIRCOM_BN254_PRIME : result;
};
const display = (value: bigint) => String(value > CIRCOM_BN254_PRIME / 2n ? value - CIRCOM_BN254_PRIME : value);
const linearCombination = (raw: Record<string, string | number>): LinearCombination => ({
  terms: Object.entries(raw)
    .map(([signalId, coefficient]) => ({ signalId: Number(signalId), value: canonical(coefficient) }))
    .filter((term) => term.value !== 0n)
    .sort((left, right) => left.signalId - right.signalId)
    .map((term) => ({ signalId: term.signalId, coefficient: String(term.value), displayCoefficient: display(term.value) })),
});
const serialize = (lc: LinearCombination) => lc.terms.map((term) => `${term.signalId}:${term.coefficient}`).join(',');
const fingerprint = (A: LinearCombination, B: LinearCombination, C: LinearCombination) => {
  const factors = [serialize(A), serialize(B)].sort();
  return createHash('sha256').update(`${factors[0]}*${factors[1]}=${serialize(C)}`).digest('hex');
};

export async function buildConstraintGraph(level: OptimizationLevel, symPath: string, constraintsJsonPath: string, substitutionsJsonPath?: string): Promise<ConstraintGraphDto> {
  const [symEntries, constraintDocument] = await Promise.all([
    parseSymFile(symPath),
    fs.readFile(constraintsJsonPath, 'utf-8').then((content) => JSON.parse(content)),
  ]);
  let substitutions: Record<string, Record<string, string | number>> = {};
  if (substitutionsJsonPath) {
    try { substitutions = JSON.parse(await fs.readFile(substitutionsJsonPath, 'utf-8')); } catch { substitutions = {}; }
  }
  const nameById = new Map(symEntries.map((entry) => [entry.index, entry.name]));
  const constraints: ConstraintNodeDto[] = [];
  const edges: ConstraintGraphDto['edges'] = [];
  const participation = new Map<number, number>();
  for (const [index, triple] of constraintDocument.constraints.entries()) {
    const [rawA, rawB, rawC] = triple as Array<Record<string, string | number>>;
    const A = linearCombination(rawA); const B = linearCombination(rawB); const C = linearCombination(rawC);
    const aCount = A.terms.filter((term) => term.signalId !== 0).length;
    const bCount = B.terms.filter((term) => term.signalId !== 0).length;
    const cCount = C.terms.filter((term) => term.signalId !== 0).length;
    const isLinear = aCount === 0 || bCount === 0;
    const constraint: ConstraintNodeDto = {
      id: `constraint:${level}:${index}`, kind: 'constraint', optimization: level, index, A, B, C,
      canonicalFingerprint: fingerprint(A, B, C),
      complexity: isLinear ? 'linear' : aCount === 1 && bCount === 1 && cCount <= 1 ? 'simple-mul' : 'general-r1cs',
    };
    constraints.push(constraint);
    for (const [port, lc] of [['A', A], ['B', B], ['C', C]] as const) {
      for (const term of lc.terms) {
        if (term.signalId === 0) continue;
        participation.set(term.signalId, (participation.get(term.signalId) ?? 0) + 1);
        edges.push({
          id: `constraint-edge:${level}:${index}:${port}:${term.signalId}`,
          signalNodeId: `signal:${nameById.get(term.signalId) ?? `s_${term.signalId}`}`,
          constraintNodeId: constraint.id, port, coefficient: term.coefficient, displayCoefficient: term.displayCoefficient,
        });
      }
    }
  }
  const signals = symEntries.map((entry) => {
    const substitution = substitutions[String(entry.index)] ? linearCombination(substitutions[String(entry.index)]) : undefined;
    const status = participation.has(entry.index) || entry.witness >= 0 ? 'surviving' as const : substitution ? 'substituted' as const : 'unused-or-unconstrained' as const;
    return { id: `signal:${entry.name}`, kind: 'signal' as const, signalId: entry.index, witnessIndex: entry.witness, componentId: entry.component, qualifiedName: entry.name, status, substitution };
  });
  const adjacency: Record<string, string[]> = {};
  for (const edge of edges) {
    (adjacency[edge.signalNodeId] ??= []).push(edge.constraintNodeId);
    (adjacency[edge.constraintNodeId] ??= []).push(edge.signalNodeId);
  }
  return { level, signals, constraints, edges, adjacency };
}

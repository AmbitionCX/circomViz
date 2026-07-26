import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { parseSymFile } from '../utils/symbolParser.js';
import type {
  ConstraintEquationDto,
  ConstraintExpressionDto,
  ConstraintGraphDto,
  ConstraintNodeDto,
  LinearCombination,
  OptimizationLevel,
} from '../../types/partialDebugging.js';

export const CIRCOM_BN254_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const canonical = (value: string | number | bigint) => {
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

const coefficientMap = (lc: LinearCombination) => new Map(lc.terms.map((term) => [term.signalId, canonical(term.coefficient)]));
const addCoefficient = (target: Map<number, bigint>, signalId: number, coefficient: bigint) => {
  const next = canonical((target.get(signalId) ?? 0n) + coefficient);
  if (next === 0n) target.delete(signalId);
  else target.set(signalId, next);
};
const addScaledCombination = (target: Map<number, bigint>, lc: LinearCombination, scale: bigint) => {
  for (const term of lc.terms) addCoefficient(target, term.signalId, canonical(term.coefficient) * scale);
};
const constantFactor = (lc: LinearCombination): bigint | null => {
  if (lc.terms.some((term) => term.signalId !== 0)) return null;
  return coefficientMap(lc).get(0) ?? 0n;
};
const expressionForTerm = (signalId: number, coefficient: bigint): ConstraintExpressionDto => {
  if (signalId === 0) return { kind: 'constant', value: display(coefficient) };
  const signal: ConstraintExpressionDto = { kind: 'signal', signalId };
  if (coefficient === 1n) return signal;
  return { kind: 'mul', operands: [{ kind: 'constant', value: display(coefficient) }, signal] };
};
const expressionForCoefficients = (coefficients: Map<number, bigint>): ConstraintExpressionDto => {
  const operands = [...coefficients.entries()]
    .filter(([, coefficient]) => coefficient !== 0n)
    .sort(([left], [right]) => left - right)
    .map(([signalId, coefficient]) => expressionForTerm(signalId, coefficient));
  if (operands.length === 0) return { kind: 'constant', value: '0' };
  if (operands.length === 1) return operands[0];
  return { kind: 'add', operands };
};
const expressionForCombination = (lc: LinearCombination) => expressionForCoefficients(coefficientMap(lc));

export const simplifyConstraintEquation = (A: LinearCombination, B: LinearCombination, C: LinearCombination): ConstraintEquationDto => {
  const aConstant = constantFactor(A);
  const bConstant = constantFactor(B);
  if (aConstant === null && bConstant === null) {
    return {
      left: { kind: 'mul', operands: [expressionForCombination(A), expressionForCombination(B)] },
      right: expressionForCombination(C),
    };
  }

  // For a linear R1CS relation, normalize A * B = C into one expression equal to zero.
  const relation = new Map<number, bigint>();
  if (aConstant !== null) addScaledCombination(relation, B, aConstant);
  else addScaledCombination(relation, A, bConstant ?? 0n);
  addScaledCombination(relation, C, -1n);

  const unitCandidates = [...relation.entries()]
    .filter(([signalId, coefficient]) => signalId !== 0 && (coefficient === 1n || coefficient === CIRCOM_BN254_PRIME - 1n))
    .map(([signalId]) => signalId);
  const preferredFromC = C.terms
    .filter((term) => term.signalId !== 0 && (canonical(term.coefficient) === 1n || canonical(term.coefficient) === CIRCOM_BN254_PRIME - 1n))
    .map((term) => term.signalId);
  const targetSignalId = [...preferredFromC, ...unitCandidates].find((signalId, index, values) =>
    values.indexOf(signalId) === index && unitCandidates.includes(signalId));

  if (targetSignalId === undefined) {
    return { left: expressionForCoefficients(relation), right: { kind: 'constant', value: '0' } };
  }

  const targetCoefficient = relation.get(targetSignalId)!;
  const rightScale = targetCoefficient === 1n ? -1n : 1n;
  const right = new Map<number, bigint>();
  for (const [signalId, coefficient] of relation) {
    if (signalId !== targetSignalId) addCoefficient(right, signalId, coefficient * rightScale);
  }
  return {
    left: { kind: 'signal', signalId: targetSignalId },
    right: expressionForCoefficients(right),
    isolatedSignalId: targetSignalId,
  };
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
      equation: simplifyConstraintEquation(A, B, C),
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

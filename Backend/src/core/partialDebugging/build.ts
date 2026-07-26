import { randomUUID } from 'crypto';
import type { ParsedFile, TemplateDefinitionNode } from '../parser/ast.js';
import { buildSourceGraph } from './sourceGraph.js';
import { buildConstraintGraph, CIRCOM_BN254_PRIME } from './constraintGraph.js';
import type { ConstraintGraphDto, GraphDiagnostic, OptimizationLevel, OptimizationLink, PartialDebuggingGraphBundle, ProvenanceLink } from '../../types/partialDebugging.js';

export interface GraphArtifactSet { symPath: string; constraintsJsonPath: string; substitutionsJsonPath?: string }
const matchSignals = (from: ConstraintGraphDto, to: ConstraintGraphDto): OptimizationLink[] => {
  const targetNames = new Set(to.signals.map((signal) => signal.qualifiedName));
  return from.signals.map((signal) => ({ fromNodeId: signal.id, toNodeIds: targetNames.has(signal.qualifiedName) ? [signal.id] : [], confidence: targetNames.has(signal.qualifiedName) ? 'exact' : 'low' }));
};

export async function buildPartialDebuggingBundle(options: {
  parsedFiles: Map<string, ParsedFile>; rootTemplate: TemplateDefinitionNode; params: Array<{ name: string; value: number }>;
  selectedComponentPath: string; mockedTemplateNames: string[]; boundaryInputs: Array<{ instance: string; signal: string; isArray: boolean }>;
  artifacts: Record<OptimizationLevel, GraphArtifactSet>;
}): Promise<PartialDebuggingGraphBundle> {
  const sourceGraph = buildSourceGraph(options.parsedFiles, options.rootTemplate, options.params, options.mockedTemplateNames);
  const [O0, O1, O2] = await Promise.all((['O0', 'O1', 'O2'] as const).map((level) => {
    const artifact = options.artifacts[level]; return buildConstraintGraph(level, artifact.symPath, artifact.constraintsJsonPath, artifact.substitutionsJsonPath);
  }));
  const constraintGraphs = { O0, O1, O2 };
  const sourceToO0: ProvenanceLink[] = sourceGraph.nodes.filter((node) => node.generatesConstraint).map((node) => {
    const signalNames = (sourceGraph.adjacency[node.id] ?? []).filter((id) => id.startsWith('signal:'));
    const candidates = O0.constraints.filter((constraint) => signalNames.some((signal) => O0.adjacency[constraint.id]?.includes(signal)));
    return { sourceNodeId: node.id, constraintNodeIds: candidates.map((candidate) => candidate.id), confidence: candidates.length === 1 ? 'high' : candidates.length ? 'medium' : 'low', evidence: candidates.length ? ['same-signal-footprint'] : [] };
  });
  const diagnostics: GraphDiagnostic[] = [];
  for (const node of sourceGraph.nodes.filter((candidate) => candidate.kind === 'assignment' && candidate.dangerLevel === 'review')) {
    const signals = (sourceGraph.adjacency[node.id] ?? []).filter((id) => id.startsWith('signal:'));
    if (!signals.some((id) => O0.adjacency[id]?.length)) diagnostics.push({ id: `diagnostic:witness:${node.id}`, type: 'WITNESS_ONLY_UNVERIFIED', severity: 'high', message: 'Witness-only assignment has no related O0 constraint.', nodeIds: [node.id, ...signals] });
  }
  for (const link of sourceToO0.filter((candidate) => !candidate.constraintNodeIds.length)) diagnostics.push({ id: `diagnostic:mapping:${link.sourceNodeId}`, type: 'SOURCE_CONSTRAINT_UNMATCHED', severity: 'medium', message: 'No O0 constraint candidate was found for this source relation.', nodeIds: [link.sourceNodeId] });
  for (const signal of O0.signals.filter((candidate) => candidate.status === 'unused-or-unconstrained')) diagnostics.push({ id: `diagnostic:unused:${signal.signalId}`, type: 'UNUSED_OR_UNCONSTRAINED', severity: 'medium', message: `${signal.qualifiedName} has no constraint participation or substitution.`, nodeIds: [signal.id] });
  const levels: OptimizationLevel[] = ['O0', 'O1', 'O2'];
  const count = (fn: (graph: ConstraintGraphDto) => number) => Object.fromEntries(levels.map((level) => [level, fn(constraintGraphs[level])])) as Record<OptimizationLevel, number>;
  return {
    summary: {
      buildId: randomUUID(), compiler: { version: 'circom 2.2.x', prime: String(CIRCOM_BN254_PRIME) }, selectedComponentPath: options.selectedComponentPath || 'main',
      mockManifest: { selectedRoot: options.selectedComponentPath || 'main', mockedComponents: options.mockedTemplateNames.map((templateName) => ({ originalComponentPath: templateName, templateName, replacementInputs: options.boundaryInputs.map((input) => `${input.instance}.${input.signal}`), preservedOutputs: [], allowedChanges: ['remove-internal-constraints', 'replace-output-with-mock-input', 'preserve-parent-wiring'] })) },
      stats: { sourceSignals: sourceGraph.nodes.filter((node) => node.kind === 'signal').length, sourceOperations: sourceGraph.nodes.filter((node) => node.kind === 'operation').length, constraints: count((graph) => graph.constraints.length), survivingSignals: count((graph) => graph.signals.filter((signal) => signal.status === 'surviving').length), substitutedSignals: count((graph) => graph.signals.filter((signal) => signal.status === 'substituted').length) }, diagnostics,
    },
    sourceGraph, constraintGraphs, mappings: { sourceToO0, O0ToO1: matchSignals(O0, O1), O1ToO2: matchSignals(O1, O2) },
  };
}

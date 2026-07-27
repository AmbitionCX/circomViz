import { randomUUID } from 'crypto';
import type { ParsedFile, TemplateDefinitionNode } from '../parser/ast.js';
import { buildSourceGraph } from './sourceGraph.js';
import { buildConstraintGraph, CIRCOM_BN254_PRIME } from './constraintGraph.js';
import type { GraphDiagnostic, PartialDebuggingGraphBundle, ProvenanceLink } from '../../types/partialDebugging.js';

export interface GraphArtifactSet { symPath: string; constraintsJsonPath: string; substitutionsJsonPath?: string }

export async function buildPartialDebuggingBundle(options: {
  parsedFiles: Map<string, ParsedFile>; rootTemplate: TemplateDefinitionNode; params: Array<{ name: string; value: number }>;
  selectedComponentPath: string; mockedTemplateNames: string[]; mockedChildren?: string[]; boundaryInputs: Array<{ instance: string; signal: string; isArray: boolean }>;
  artifacts: { O0: GraphArtifactSet };
}): Promise<PartialDebuggingGraphBundle> {
  const sourceGraph = buildSourceGraph(options.parsedFiles, options.rootTemplate, options.params, options.mockedTemplateNames);
  const artifact = options.artifacts.O0;
  const constraintGraph = await buildConstraintGraph('O0', artifact.symPath, artifact.constraintsJsonPath, artifact.substitutionsJsonPath);
  const sourceToO0: ProvenanceLink[] = sourceGraph.nodes.filter((node) => node.generatesConstraint).map((node) => {
    const signalNames = (sourceGraph.adjacency[node.id] ?? []).filter((id) => id.startsWith('signal:'));
    const candidates = constraintGraph.constraints.filter((constraint) => signalNames.some((signal) => constraintGraph.adjacency[constraint.id]?.includes(signal)));
    return { sourceNodeId: node.id, constraintNodeIds: candidates.map((candidate) => candidate.id), confidence: candidates.length === 1 ? 'high' : candidates.length ? 'medium' : 'low', evidence: candidates.length ? ['same-signal-footprint'] : [] };
  });
  const diagnostics: GraphDiagnostic[] = [];
  for (const node of sourceGraph.nodes.filter((candidate) => candidate.kind === 'assignment' && candidate.dangerLevel === 'review')) {
    const signals = (sourceGraph.adjacency[node.id] ?? []).filter((id) => id.startsWith('signal:'));
    if (!signals.some((id) => constraintGraph.adjacency[id]?.length)) diagnostics.push({ id: `diagnostic:witness:${node.id}`, type: 'WITNESS_ONLY_UNVERIFIED', severity: 'high', message: 'Witness-only assignment has no related O0 constraint.', nodeIds: [node.id, ...signals] });
  }
  for (const link of sourceToO0.filter((candidate) => !candidate.constraintNodeIds.length)) diagnostics.push({ id: `diagnostic:mapping:${link.sourceNodeId}`, type: 'SOURCE_CONSTRAINT_UNMATCHED', severity: 'medium', message: 'No O0 constraint candidate was found for this source relation.', nodeIds: [link.sourceNodeId] });
  for (const signal of constraintGraph.signals.filter((candidate) => candidate.status === 'unused-or-unconstrained')) diagnostics.push({ id: `diagnostic:unused:${signal.signalId}`, type: 'UNUSED_OR_UNCONSTRAINED', severity: 'medium', message: `${signal.qualifiedName} has no constraint participation or substitution.`, nodeIds: [signal.id] });
  return {
    summary: {
      buildId: randomUUID(), compiler: { version: 'circom 2.2.x', prime: String(CIRCOM_BN254_PRIME), actualOptimization: 'O0' }, selectedComponentPath: options.selectedComponentPath || 'main',
      mockManifest: { selectedRoot: options.selectedComponentPath || 'main', mockedComponents: (options.mockedChildren ?? options.mockedTemplateNames).map((originalName, index) => ({ originalComponentPath: originalName, templateName: options.mockedTemplateNames[index] ?? `${originalName}_mocked`, replacementInputs: options.boundaryInputs.map((input) => input.signal), preservedOutputs: ['original-input-ports', 'original-output-ports', 'parent-component-wiring'], allowedChanges: ['remove-child-internal-signals', 'remove-child-internal-components', 'remove-child-internal-witness-calculations', 'remove-child-internal-business-constraints', 'add-synthetic-output-inputs', 'add-synthetic-output-bindings'] })) },
      stats: {
        sourceSignals: sourceGraph.nodes.filter((node) => node.kind === 'signal').length,
        sourceOperations: sourceGraph.nodes.filter((node) => node.kind === 'operation').length,
        constraints: { O0: constraintGraph.constraints.length },
        survivingSignals: { O0: constraintGraph.signals.filter((signal) => signal.status === 'surviving').length },
        substitutedSignals: { O0: constraintGraph.signals.filter((signal) => signal.status === 'substituted').length },
      },
      diagnostics,
    },
    sourceGraph,
    constraintGraph,
    mappings: { sourceToO0 },
  };
}

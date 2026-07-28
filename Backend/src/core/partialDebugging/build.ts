import { randomUUID } from 'crypto';
import type { ParsedFile, TemplateDefinitionNode } from '../parser/ast.js';
import { buildSourceGraph } from './sourceGraph.js';
import { buildConstraintGraph, CIRCOM_BN254_PRIME } from './constraintGraph.js';
import { projectMockConstraints } from './mockProjection.js';
import type { ConstraintGraphDto, GraphDiagnostic, MockManifest, PartialDebuggingGraphBundle, ProvenanceLink } from '../../types/partialDebugging.js';

export interface GraphArtifactSet { symPath: string; constraintsJsonPath: string; substitutionsJsonPath?: string }

type SignalRole = 'input' | 'output' | 'intermediate';

function collectCompiledSignalRoles(parsedFiles: Map<string, ParsedFile>, rootTemplate: TemplateDefinitionNode): Map<string, SignalRole> {
  const templates = new Map<string, TemplateDefinitionNode>();
  for (const parsedFile of parsedFiles.values()) {
    for (const template of parsedFile.templates) templates.set(template.name, template);
  }

  const roles = new Map<string, SignalRole>();
  const visit = (template: TemplateDefinitionNode, instancePath: string, ancestors: Set<string>) => {
    for (const signal of template.signals) roles.set(`${instancePath}.${signal.name}`, signal.kind);
    if (ancestors.has(template.name)) return;
    const nextAncestors = new Set(ancestors).add(template.name);
    for (const component of template.components) {
      if (!('templateName' in component) || !component.templateName) continue;
      const child = templates.get(component.templateName);
      if (child) visit(child, `${instancePath}.${component.name}`, nextAncestors);
    }
  };

  visit(rootTemplate, 'main', new Set());
  return roles;
}

function roleForSignal(qualifiedName: string, roles: Map<string, SignalRole>): SignalRole {
  const exact = roles.get(qualifiedName);
  if (exact) return exact;
  for (const [declarationPath, role] of roles) {
    if (qualifiedName.startsWith(`${declarationPath}[`)) return role;
  }
  return 'intermediate';
}

function applyDeclaredSignalRoles(graph: ConstraintGraphDto, roles: Map<string, SignalRole>, manifest: MockManifest): ConstraintGraphDto {
  const syntheticPaths = new Set(manifest.mocks.flatMap((mock) => mock.syntheticSignals.map((signal) => signal.path)));
  return {
    ...graph,
    signals: graph.signals.map((signal) => ({
      ...signal,
      role: syntheticPaths.has(signal.qualifiedName) ? 'synthetic' : roleForSignal(signal.qualifiedName, roles),
    })),
  };
}

export async function buildPartialDebuggingBundle(options: {
  parsedFiles: Map<string, ParsedFile>; rootTemplate: TemplateDefinitionNode; compiledRootTemplate: TemplateDefinitionNode;
  params: Array<{ name: string; value: number }>; selectedComponentPath: string; mockedTemplateNames: string[];
  mockedChildren?: string[]; boundaryInputs: Array<{ instance: string; signal: string; isArray: boolean }>;
  mockManifest: MockManifest; artifacts: { O0: GraphArtifactSet };
}): Promise<PartialDebuggingGraphBundle> {
  const sourceGraph = buildSourceGraph(options.parsedFiles, options.rootTemplate, options.params, options.mockedTemplateNames);
  const artifact = options.artifacts.O0;
  const rawConstraintGraph = await buildConstraintGraph('O0', artifact.symPath, artifact.constraintsJsonPath, artifact.substitutionsJsonPath);
  const compiledRoles = collectCompiledSignalRoles(options.parsedFiles, options.compiledRootTemplate);
  const typedConstraintGraph = applyDeclaredSignalRoles(rawConstraintGraph, compiledRoles, options.mockManifest);
  const projection = projectMockConstraints(typedConstraintGraph, options.mockManifest);
  const constraintGraph = projection.graph;

  const sourceToO0: ProvenanceLink[] = sourceGraph.nodes.filter((node) => node.generatesConstraint).map((node) => {
    const signalNames = (sourceGraph.adjacency[node.id] ?? []).filter((id) => id.startsWith('signal:'));
    const candidates = constraintGraph.constraints.filter((constraint) => signalNames.some((signal) => constraintGraph.adjacency[constraint.id]?.includes(signal)));
    return { sourceNodeId: node.id, constraintNodeIds: candidates.map((candidate) => candidate.id), confidence: candidates.length === 1 ? 'high' : candidates.length ? 'medium' : 'low', evidence: candidates.length ? ['same-signal-footprint'] : [] };
  });
  const diagnostics: GraphDiagnostic[] = [...projection.diagnostics];
  for (const node of sourceGraph.nodes.filter((candidate) => candidate.kind === 'assignment' && candidate.dangerLevel === 'review')) {
    const signals = (sourceGraph.adjacency[node.id] ?? []).filter((id) => id.startsWith('signal:'));
    if (!signals.some((id) => constraintGraph.adjacency[id]?.length)) diagnostics.push({ id: `diagnostic:witness:${node.id}`, type: 'WITNESS_ONLY_UNVERIFIED', severity: 'high', message: 'Witness-only assignment has no related O0 constraint.', nodeIds: [node.id, ...signals] });
  }
  for (const link of sourceToO0.filter((candidate) => !candidate.constraintNodeIds.length)) diagnostics.push({ id: `diagnostic:mapping:${link.sourceNodeId}`, type: 'SOURCE_CONSTRAINT_UNMATCHED', severity: 'medium', message: 'No O0 constraint candidate was found for this source relation.', nodeIds: [link.sourceNodeId] });
  for (const signal of constraintGraph.signals.filter((candidate) => candidate.status === 'unused-or-unconstrained')) diagnostics.push({ id: `diagnostic:unused:${signal.signalId}`, type: 'UNUSED_OR_UNCONSTRAINED', severity: 'medium', message: `${signal.qualifiedName} has no constraint participation or substitution.`, nodeIds: [signal.id] });
  return {
    summary: {
      buildId: randomUUID(), compiler: { version: 'circom 2.2.x', prime: String(CIRCOM_BN254_PRIME), actualOptimization: 'O0' }, selectedComponentPath: options.selectedComponentPath || 'main',
      mockManifest: options.mockManifest,
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

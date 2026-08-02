import { createHash } from 'crypto';
import { callLLMStructured, getLLMConfiguration } from './llmClient.js';
import type {
  GraphDiagnostic,
  IssueAnchor,
  IssueCard,
  PartialDebuggingGraphBundle,
  SourceGraphEdge,
  TemplateAttentionAnalysisResponse,
} from '../../types/partialDebugging.js';

interface AnchorCatalog {
  sourceNodeIds: Set<string>;
  sourceEdgeIds: Set<string>;
  r1csNodeIds: Set<string>;
  sourceNodes: Array<Record<string, unknown>>;
  sourceEdges: Array<Record<string, unknown>>;
  r1csNodes: Array<Record<string, unknown>>;
}

interface RawAnalysis {
  summary?: unknown;
  issues?: unknown;
}

const MAX_SOURCE_CHARS = 50_000;
const MAX_CATALOG_ITEMS = 600;

const text = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value.trim().slice(0, 2_000) : fallback;

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

const oneOf = <T extends string>(value: unknown, values: readonly T[], fallback: T): T =>
  typeof value === 'string' && values.includes(value as T) ? value as T : fallback;

function displaySourceEdges(
  bundle: PartialDebuggingGraphBundle,
): Array<SourceGraphEdge & { relatedNodeIds: string[] }> {
  const graph = bundle.sourceGraph;
  const collapsedIds = new Set(
    graph.nodes
      .filter((node) => node.kind === 'assignment' || node.kind === 'source-constraint')
      .map((node) => node.id),
  );
  const edges: Array<SourceGraphEdge & { relatedNodeIds: string[] }> = graph.edges
    .filter((edge) => !collapsedIds.has(edge.source) && !collapsedIds.has(edge.target))
    .map((edge) => ({ ...edge, relatedNodeIds: [edge.source, edge.target] }));

  for (const assignment of graph.nodes.filter((node) => node.kind === 'assignment')) {
    const incoming = graph.edges.filter((edge) => edge.target === assignment.id);
    const outgoing = graph.edges.find((edge) => edge.source === assignment.id);
    if (!outgoing) continue;
    incoming.forEach((input, index) => edges.push({
      id: 'collapsed:' + assignment.id + ':' + index,
      source: input.source,
      target: outgoing.target,
      kind: assignment.generatesConstraint ? 'constraint-relation' : 'assignment',
      operator: assignment.operator,
      label: assignment.operator,
      relatedNodeIds: [input.source, outgoing.target],
    }));
  }

  for (const relation of graph.nodes.filter((node) => node.kind === 'source-constraint')) {
    const operands = graph.edges.filter((edge) => edge.target === relation.id).map((edge) => edge.source);
    if (operands.length < 2) continue;
    edges.push({
      id: 'collapsed:' + relation.id,
      source: operands[0],
      target: operands[1],
      kind: 'constraint-relation',
      operator: '===',
      label: '===',
      relatedNodeIds: operands,
    });
  }
  return edges;
}

function createAnchorCatalog(bundle: PartialDebuggingGraphBundle): AnchorCatalog {
  const visibleSourceNodes = bundle.sourceGraph.nodes.filter((node) =>
    node.kind !== 'assignment'
      && node.kind !== 'source-constraint'
      && !(node.kind === 'component-group' && node.componentPath === 'main')
      && !(node.loopId && node.statePhase !== 'final'));
  const sourceNodes = [
    ...visibleSourceNodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      label: node.label,
      role: node.role,
      line: node.sourceSpan?.startLine,
      file: node.sourceSpan?.file,
    })),
    ...bundle.sourceGraph.loops.map((loop) => ({
      id: loop.id,
      kind: 'family',
      label: loop.header,
      line: loop.sourceSpan.startLine,
      file: loop.sourceSpan.file,
    })),
    ...bundle.sourceGraph.statements.map((statement) => ({
      id: statement.id,
      kind: 'statement',
      label: statement.label,
      line: statement.sourceSpan.startLine,
      file: statement.sourceSpan.file,
    })),
  ];
  const sourceNodeIds = new Set(sourceNodes.map((node) => String(node.id)));
  const nodeLabels = new Map(bundle.sourceGraph.nodes.map((node) => [node.id, node.label]));
  const sourceEdges = displaySourceEdges(bundle)
    .filter((edge) => sourceNodeIds.has(edge.source) && sourceNodeIds.has(edge.target))
    .map((edge) => ({
      id: edge.id,
      kind: edge.kind,
      source: edge.source,
      target: edge.target,
      from: nodeLabels.get(edge.source) ?? edge.source,
      to: nodeLabels.get(edge.target) ?? edge.target,
      operator: edge.label ?? edge.operator,
      relatedNodeIds: edge.relatedNodeIds,
    }));
  const sourceEdgeIds = new Set(sourceEdges.map((edge) => String(edge.id)));
  const constraintGraph = bundle.constraintGraph;
  const signalById = new Map(constraintGraph.signals.map((signal) => [signal.signalId, signal]));
  const groupBySignalId = new Map(
    constraintGraph.signalGroups.flatMap((group) =>
      group.memberSignalIds.map((signalId) => [signalId, group] as const)),
  );
  const clusterByConstraintId = new Map(
    constraintGraph.loopClusters.flatMap((cluster) =>
      cluster.constraintNodeIds.map((constraintId) => [constraintId, cluster.id] as const)),
  );
  type Expression = (typeof constraintGraph.constraints)[number]['equation']['left'];
  const expressionPattern = (expression: Expression): string => {
    if (expression.kind === 'constant') return 'constant:' + expression.value;
    if (expression.kind === 'signal') {
      const group = groupBySignalId.get(expression.signalId);
      if (group) return 'group:' + group.id;
      const signalName = signalById.get(expression.signalId)?.qualifiedName ?? 's' + expression.signalId;
      return 'signal:' + signalName.replace(/\[\d+\]/g, '[n]');
    }
    return expression.kind + '(' + expression.operands.map(expressionPattern).sort().join(',') + ')';
  };
  const patternGroups = new Map<string, typeof constraintGraph.constraints>();
  for (const constraint of constraintGraph.constraints) {
    const clusterId = clusterByConstraintId.get(constraint.id);
    const equationPattern = [
      expressionPattern(constraint.equation.left),
      expressionPattern(constraint.equation.right),
    ].sort().join('=');
    const key = clusterId ? clusterId + ':' + equationPattern : constraint.id;
    const group = patternGroups.get(key) ?? [];
    group.push(constraint);
    patternGroups.set(key, group);
  }
  const representativeConstraints = [...patternGroups.values()].map((constraints) => constraints[0]);
  const visibleSignalReferenceIds = new Set<string>();
  const collectSignalReferences = (expression: Expression) => {
    if (expression.kind === 'signal') {
      const group = groupBySignalId.get(expression.signalId);
      const signal = signalById.get(expression.signalId);
      if (group) visibleSignalReferenceIds.add(group.id);
      else if (signal) visibleSignalReferenceIds.add(signal.id);
      return;
    }
    if (expression.kind !== 'constant') expression.operands.forEach(collectSignalReferences);
  };
  representativeConstraints.forEach((constraint) => {
    collectSignalReferences(constraint.equation.left);
    collectSignalReferences(constraint.equation.right);
  });

  const r1csNodes = [
    ...representativeConstraints.map((constraint) => ({
      id: constraint.id,
      kind: 'constraint',
      index: constraint.index,
      complexity: constraint.complexity,
      signals: (constraintGraph.adjacency[constraint.id] ?? []).slice(0, 16),
    })),
    ...constraintGraph.signals
      .filter((signal) => visibleSignalReferenceIds.has(signal.id))
      .map((signal) => ({
        id: signal.id,
        kind: 'signal',
        label: signal.qualifiedName,
        status: signal.status,
        role: signal.role,
        mockSupplied: signal.mockSupplied,
      })),
    ...constraintGraph.signalGroups
      .filter((group) => visibleSignalReferenceIds.has(group.id))
      .map((group) => ({
        id: group.id,
        kind: 'signal-family',
        label: group.displayQualifiedName,
        status: group.status,
        role: group.role,
      })),
    ...constraintGraph.loopClusters.map((cluster) => ({
      id: cluster.id,
      kind: 'constraint-family',
      label: cluster.label,
      confidence: cluster.confidence,
    })),
  ];
  const r1csNodeIds = new Set(r1csNodes.map((node) => String(node.id)));

  return {
    sourceNodeIds,
    sourceEdgeIds,
    r1csNodeIds,
    sourceNodes: sourceNodes.slice(0, MAX_CATALOG_ITEMS),
    sourceEdges: sourceEdges.slice(0, MAX_CATALOG_ITEMS),
    r1csNodes: r1csNodes.slice(0, MAX_CATALOG_ITEMS),
  };
}

function normalizeAnchor(value: unknown, catalog: AnchorCatalog): IssueAnchor | undefined {
  const candidate = record(value);
  if (!candidate) return undefined;
  const view = oneOf(candidate.view, ['source', 'r1cs'] as const, 'source');
  const type = oneOf(candidate.type, ['node', 'edge', 'family', 'ghost'] as const, 'node');
  const id = text(candidate.id);
  const allowedNodes = view === 'source' ? catalog.sourceNodeIds : catalog.r1csNodeIds;
  const relatedNodeIds = Array.isArray(candidate.relatedNodeIds)
    ? candidate.relatedNodeIds
      .map((nodeId) => text(nodeId))
      .filter((nodeId) => allowedNodes.has(nodeId))
    : [];

  if (type === 'edge') {
    if (view !== 'source' || !catalog.sourceEdgeIds.has(id)) return undefined;
  } else if (type === 'ghost') {
    if (!id.startsWith('ghost:') || relatedNodeIds.length === 0) return undefined;
  } else if (!allowedNodes.has(id)) {
    return undefined;
  }

  return {
    view,
    type,
    id,
    ...(relatedNodeIds.length ? { relatedNodeIds: [...new Set(relatedNodeIds)] } : {}),
  };
}

export function normalizeLlmIssues(
  value: unknown,
  catalog: AnchorCatalog,
  allowedEvidenceIds: Set<string>,
): IssueCard[] {
  const container = record(value);
  if (!container || !Array.isArray(container.issues)) return [];

  return container.issues.slice(0, 8).flatMap((rawIssue, index) => {
    const issue = record(rawIssue);
    if (!issue || !Array.isArray(issue.anchors)) return [];
    const anchors = issue.anchors
      .map((anchor) => normalizeAnchor(anchor, catalog))
      .filter((anchor): anchor is IssueAnchor => Boolean(anchor));
    const evidenceIds = Array.isArray(issue.evidenceIds)
      ? [...new Set(issue.evidenceIds.map((id) => text(id)).filter((id) => allowedEvidenceIds.has(id)))]
      : [];
    const sourceAnchors = anchors.filter((anchor) => anchor.view === 'source');
    if (!sourceAnchors.length || !evidenceIds.length) return [];

    const orderedAnchors = [
      ...sourceAnchors,
      ...anchors.filter((anchor) => anchor.view !== 'source'),
    ];

    const primary = orderedAnchors[0];
    const digest = createHash('sha256')
      .update(primary.view + ':' + primary.type + ':' + primary.id)
      .digest('hex')
      .slice(0, 10);
    const normalized: IssueCard = {
      id: 'issue:llm:' + digest + ':' + index,
      kind: text(issue.kind, 'IntentMismatch'),
      title: text(issue.title, 'Template behavior needs attention'),
      explanation: text(issue.explanation, 'The available evidence may not match the stated intent.'),
      severity: oneOf(issue.severity, ['high', 'medium', 'low'] as const, 'medium'),
      confidence: oneOf(issue.confidence, ['high', 'medium', 'low'] as const, 'low'),
      anchors: orderedAnchors,
      observed: text(issue.observed, 'See the highlighted graph element.'),
      expected: text(issue.expected, 'Confirm the intended behavior.'),
      evidenceIds,
      followUpQuestion: text(issue.followUpQuestion) || undefined,
      resolution: 'open',
      source: 'llm',
    };
    return [normalized];
  });
}

function diagnosticAnchor(
  diagnostic: GraphDiagnostic,
  bundle: PartialDebuggingGraphBundle,
  catalog: AnchorCatalog,
): IssueAnchor | undefined {
  const sourceNodes = new Map(bundle.sourceGraph.nodes.map((node) => [node.id, node]));
  for (const nodeId of diagnostic.nodeIds) {
    const constraintSignal = bundle.constraintGraph.signals.find((signal) => signal.id === nodeId);
    if (constraintSignal) {
      const normalizedName = constraintSignal.qualifiedName.replace(/\[[^\]]+\]/g, '');
      const sourceSignal = bundle.sourceGraph.nodes.find((candidate) =>
        candidate.kind === 'signal'
          && [candidate.qualifiedName, candidate.arrayBaseQualifiedName]
            .filter((name): name is string => Boolean(name))
            .some((name) => name.replace(/\[[^\]]+\]/g, '') === normalizedName));
      if (sourceSignal && catalog.sourceNodeIds.has(sourceSignal.id)) {
        return { view: 'source', type: 'node', id: sourceSignal.id };
      }
      const signalGroup = bundle.constraintGraph.signalGroups.find((group) =>
        group.memberSignalNodeIds.includes(constraintSignal.id));
      if (signalGroup && catalog.r1csNodeIds.has(signalGroup.id)) {
        return { view: 'r1cs', type: 'family', id: signalGroup.id };
      }
    }
    const node = sourceNodes.get(nodeId);
    if (node?.kind === 'assignment' || node?.kind === 'source-constraint') {
      const edgeId = node.kind === 'assignment' ? 'collapsed:' + node.id + ':0' : 'collapsed:' + node.id;
      const edge = displaySourceEdges(bundle).find((candidate) => candidate.id === edgeId);
      if (edge && catalog.sourceEdgeIds.has(edgeId)) {
        return { view: 'source', type: 'edge', id: edgeId, relatedNodeIds: edge.relatedNodeIds };
      }
    }
    if (node?.statementId && catalog.sourceNodeIds.has(node.statementId)) {
      return { view: 'source', type: 'node', id: node.statementId };
    }
    if (catalog.sourceNodeIds.has(nodeId)) return { view: 'source', type: 'node', id: nodeId };
    if (catalog.r1csNodeIds.has(nodeId)) return { view: 'r1cs', type: 'node', id: nodeId };
  }
  return undefined;
}

interface OriginDiagnosticEvidence {
  diagnostic: GraphDiagnostic;
  anchor: IssueAnchor;
}

function originalTemplateDiagnostics(
  bundle: PartialDebuggingGraphBundle,
  catalog: AnchorCatalog,
): OriginDiagnosticEvidence[] {
  return bundle.summary.diagnostics.flatMap((diagnostic) => {
    if (diagnostic.type === 'MOCK_LEAKAGE') return [];
    const anchor = diagnosticAnchor(diagnostic, bundle, catalog);
    if (!anchor || anchor.view !== 'source') return [];
    return [{ diagnostic, anchor }];
  });
}

function deterministicIssues(evidence: OriginDiagnosticEvidence[]): IssueCard[] {
  const titles: Partial<Record<GraphDiagnostic['type'], string>> = {
    WITNESS_ONLY_UNVERIFIED: 'Witness assignment is not constrained',
    SOURCE_CONSTRAINT_UNMATCHED: 'Expected enforcement was not found',
    UNUSED_OR_UNCONSTRAINED: 'Signal has no R1CS participation',
  };
  const expected: Partial<Record<GraphDiagnostic['type'], string>> = {
    WITNESS_ONLY_UNVERIFIED: 'A witness-time value that affects the result should be constrained.',
    SOURCE_CONSTRAINT_UNMATCHED: 'The source relation should map to local O0 enforcement or an explicit boundary assumption.',
    UNUSED_OR_UNCONSTRAINED: 'The signal should participate in enforcement or be documented as intentionally unused.',
  };

  return evidence.flatMap(({ diagnostic, anchor }, index) => {
    const issue: IssueCard = {
      id: 'issue:detector:' + index + ':' + diagnostic.id,
      kind: 'CoverageGap',
      title: titles[diagnostic.type] ?? 'Original template behavior needs attention',
      explanation: diagnostic.message,
      severity: diagnostic.severity,
      confidence: 'deterministic',
      anchors: [anchor],
      observed: diagnostic.message,
      expected: expected[diagnostic.type] ?? 'The original template should enforce the stated intent.',
      evidenceIds: [diagnostic.id],
      resolution: 'open',
      source: 'detector',
    };
    return [issue];
  });
}

function mergeIssues(detected: IssueCard[], triaged: IssueCard[]): IssueCard[] {
  const merged = new Map<string, IssueCard>();
  for (const issue of detected) {
    const anchor = issue.anchors[0];
    merged.set(anchor.view + ':' + anchor.type + ':' + anchor.id, issue);
  }
  for (const issue of triaged) {
    const anchor = issue.anchors[0];
    const key = anchor.view + ':' + anchor.type + ':' + anchor.id;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, issue);
      continue;
    }
    merged.set(key, {
      ...existing,
      kind: issue.kind,
      title: issue.title,
      explanation: issue.explanation,
      observed: issue.observed,
      expected: issue.expected,
      evidenceIds: [...new Set([...existing.evidenceIds, ...issue.evidenceIds])],
      followUpQuestion: issue.followUpQuestion,
      source: 'detector+llm',
    });
  }
  return [...merged.values()].sort((left, right) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[left.severity] - rank[right.severity];
  });
}

function promptPayload(
  intent: string,
  bundle: PartialDebuggingGraphBundle,
  catalog: AnchorCatalog,
  diagnosticEvidence: OriginDiagnosticEvidence[],
) {
  return {
    intent,
    template: bundle.analysisContext.templateName,
    interpretationRules: {
      origin: 'User-authored semantics and bindings.',
      mocked: 'Evidence lens for finding concerns in the original template; never an independent issue target.',
      issueScope: 'Every issue must describe a potential defect or ambiguity in the original template. Ignore generated mocking artifacts.',
      intentAuthority: 'Treat the prose as user-stated intent, but phrase findings as hypotheses until the user confirms them.',
    },
    originTemplate: bundle.analysisContext.originCode.slice(0, MAX_SOURCE_CHARS),
    mockedTemplate: bundle.analysisContext.mockedCode.slice(0, MAX_SOURCE_CHARS),
    mockBoundaries: bundle.summary.mockManifest.mocks.map((mock) => ({
      instancePath: mock.instancePath,
      originalTemplate: mock.originalTemplate,
      boundaryInputs: mock.boundaryInputs,
      boundaryOutputs: mock.boundaryOutputs,
    })),
    deterministicEvidence: diagnosticEvidence.map(({ diagnostic }) => ({
      id: diagnostic.id,
      classification: diagnostic.type,
      severity: diagnostic.severity,
      message: diagnostic.message,
      nodeIds: diagnostic.nodeIds,
    })),
    allowedAnchors: {
      sourceNodes: catalog.sourceNodes,
      sourceEdges: catalog.sourceEdges,
      r1csNodes: catalog.r1csNodes,
    },
    responseSchema: {
      summary: 'short string',
      issues: [{
        kind: 'RoleMismatch | DependencyGap | CoverageGap | IndexAnomaly | ConstantAnomaly | IdiomDiff',
        title: 'short string',
        explanation: 'evidence-grounded explanation',
        severity: 'high | medium | low',
        confidence: 'high | medium | low',
        anchors: [{ view: 'source first; optional r1cs evidence after it', type: 'node | edge | family', id: 'exact allowed id', relatedNodeIds: [] }],
        observed: 'what the code/enforcement does',
        expected: 'what the user intent suggests',
        evidenceIds: ['one or more exact diagnostic or anchor ids'],
        followUpQuestion: 'optional intent clarification',
      }],
    },
  };
}

const SYSTEM_PROMPT = [
  'You are the evidence-grounded semantic triage layer for CircomVis.',
  'Report only potential issues in the original, user-authored template.',
  'Use the APC-generated mocked source and its R1CS only as supporting evidence for judging the original template.',
  'Never create an issue for a generated mock, synthetic signal, mocking-algorithm artifact, or difference caused only by removed child internals.',
  'Every issue must have an original source node or edge as its first anchor; R1CS anchors may only be supplementary evidence.',
  'Return JSON only, with at most 8 localized issue hypotheses.',
  'Use only exact IDs from allowedAnchors. Every issue must cite at least one exact evidence ID from deterministicEvidence or allowedAnchors.',
  'Never invent a signal, source location, constraint, node, edge, or contract.',
  'Do not call a majority pattern or an LLM inference verified.',
  'A missing dependency behind a mock boundary is insufficient evidence; omit it rather than reporting a mock-boundary issue.',
  'Treat synthetic mock values as boundary assumptions, never user-authored semantics.',
  'Prefer the smallest causal node or edge and explain expected versus observed behavior.',
].join('\n');

export async function analyzeTemplateAttention(
  intent: string,
  bundle: PartialDebuggingGraphBundle,
): Promise<TemplateAttentionAnalysisResponse> {
  const catalog = createAnchorCatalog(bundle);
  const diagnosticEvidence = originalTemplateDiagnostics(bundle, catalog);
  const detected = deterministicIssues(diagnosticEvidence);
  const allowedEvidenceIds = new Set<string>([
    ...diagnosticEvidence.map(({ diagnostic }) => diagnostic.id),
    ...catalog.sourceNodeIds,
    ...catalog.sourceEdgeIds,
    ...catalog.r1csNodeIds,
  ]);
  const configuration = getLLMConfiguration();
  const result = await callLLMStructured<RawAnalysis>(
    SYSTEM_PROMPT,
    JSON.stringify(promptPayload(intent, bundle, catalog, diagnosticEvidence)),
  );

  if (!result.success) {
    return {
      intent,
      summary: detected.length
        ? 'Deterministic analysis found ' + detected.length + ' item(s); DeepSeek triage was unavailable.'
        : 'DeepSeek triage was unavailable and deterministic analysis found no anchored issues.',
      issues: detected,
      provider: configuration.provider,
      model: configuration.model,
      warning: result.error,
    };
  }

  const triaged = normalizeLlmIssues(result.data, catalog, allowedEvidenceIds);
  const merged = mergeIssues(detected, triaged);
  return {
    intent,
    summary: text(result.data.summary)
      || (merged.length
        ? 'Found ' + merged.length + ' original-template area(s) that may require attention.'
        : 'No evidence-grounded attention points were returned for this intent.'),
    issues: merged,
    provider: configuration.provider,
    model: configuration.model,
    ...(triaged.length === 0 && Array.isArray(result.data.issues) && result.data.issues.length
      ? { warning: 'DeepSeek returned issues, but they were rejected because they lacked valid evidence or an original-source anchor.' }
      : {}),
  };
}


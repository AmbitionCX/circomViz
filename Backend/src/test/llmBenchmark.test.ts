import assert from 'node:assert/strict';
import test from 'node:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { IssueCard } from '../types/partialDebugging.js';
import type {
  BenchmarkGold,
  AnnotationInput,
  BenchmarkPrediction,
  BuiltBundleCase,
  PendingBenchmarkCase,
  ReadyBenchmarkCase,
} from '../evaluation/llmBenchmark/types.js';
import { BENCHMARK_SCHEMA_VERSION, NEUTRAL_INTENT } from '../evaluation/llmBenchmark/types.js';
import { buildTrackPayload, deserializeCatalog, loadBenchmarkPrompt } from '../evaluation/llmBenchmark/runner.js';
import {
  callConfiguredModel,
  effectiveRequestConfig,
  parseStructuredOutput,
} from '../evaluation/llmBenchmark/modelClient.js';
import { scoreBenchmark } from '../evaluation/llmBenchmark/scorer.js';
import { writeJsonl } from '../evaluation/llmBenchmark/io.js';
import { buildBenchmarkBundles, evaluateConstantExpression } from '../evaluation/llmBenchmark/bundleBuilder.js';
import { prepareCasesFromBundles } from '../evaluation/llmBenchmark/caseBuilder.js';
import {
  freezeGold,
  normalizeAnnotation,
  validateAnnotation,
} from '../evaluation/llmBenchmark/annotator.js';
import type { ReviewRow } from '../evaluation/llmBenchmark/annotator.js';
import { refineAnnotations } from '../evaluation/llmBenchmark/refiner.js';
import { modelConfigHash } from '../evaluation/llmBenchmark/runner.js';
import { conservativelyEstimateTokens } from '../evaluation/llmBenchmark/preflight.js';
import {
  normalizeOutcomeOnlyIntent,
  validateOutcomeOnlyIntent,
} from '../evaluation/llmBenchmark/intentSanitizer.js';
import {
  createProjection,
  filterAnnotationInputByProjection,
  prioritizeR1csCandidateIds,
  validateProjection,
} from '../evaluation/llmBenchmark/projection.js';

const sourceNode = { id: 'signal:main.out', kind: 'signal', label: 'out', line: 8 };
const sourceEdge = { id: 'collapsed:assignment:8:0', kind: 'assignment', source: 'signal:main.in', target: 'signal:main.out' };
const issue = (anchorId: string): IssueCard => ({
  id: 'issue:' + anchorId,
  kind: 'CoverageGap',
  title: 'Check enforcement',
  explanation: 'The selected relation needs attention.',
  severity: 'high',
  confidence: 'high',
  anchors: [{ view: 'source', type: 'node', id: anchorId }],
  observed: 'Observed behavior',
  expected: 'Expected behavior',
  evidenceIds: [anchorId],
  resolution: 'open',
  source: 'llm',
});

function readyCase(): ReadyBenchmarkCase {
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    status: 'ready',
    caseId: 'case-1',
    project: 'project-a',
    projectCommit: 'abc123',
    bugFamily: 'Under-Constrained',
    vulnerableFile: 'circuit.circom',
    vulnerableLines: '8-9',
    selectedTemplate: 'Example',
    split: 'test',
    canonicalIntent: 'Check whether the claimed output is fully enforced.',
    directContext: {
      templateName: 'Example',
      originCode: 'template Example() { signal output out; }',
      candidates: { sourceNodes: [sourceNode], sourceEdges: [sourceEdge], r1csNodes: [] },
    },
    systemContext: {
      templateName: 'Example',
      promptPayload: { intent: 'old', allowedAnchors: { sourceNodes: [sourceNode] } },
      candidates: { sourceNodes: [sourceNode], sourceEdges: [sourceEdge], r1csNodes: [{ id: 'constraint:0' }] },
      detectorIssues: [],
    },
    bundleHash: 'bundle-hash',
  };
}

test('builds the four benchmark payloads without leaking intent across neutral tracks', () => {
  const benchmarkCase = readyCase();
  const directNeutral = buildTrackPayload(benchmarkCase, 'direct-neutral');
  const directIntent = buildTrackPayload(benchmarkCase, 'direct-intent');
  const systemNeutral = buildTrackPayload(benchmarkCase, 'system-neutral');
  const systemIntent = buildTrackPayload(benchmarkCase, 'system-intent');

  assert.equal(directNeutral.intent, NEUTRAL_INTENT);
  assert.equal(systemNeutral.intent, NEUTRAL_INTENT);
  assert.equal(directIntent.intent, benchmarkCase.canonicalIntent);
  assert.equal(systemIntent.intent, benchmarkCase.canonicalIntent);
  assert.equal('deterministicEvidence' in directIntent, false);
  assert.equal((directIntent.allowedAnchors as any).r1csNodes, undefined);
  assert.deepEqual(
    { ...directNeutral, intent: 'normalized' },
    { ...directIntent, intent: 'normalized' },
  );
  assert.deepEqual(
    { ...systemNeutral, intent: 'normalized' },
    { ...systemIntent, intent: 'normalized' },
  );
  assert.deepEqual(
    (directIntent.allowedAnchors as any).sourceNodes,
    benchmarkCase.systemContext.candidates.sourceNodes,
  );
  assert.deepEqual(
    (directIntent.allowedAnchors as any).sourceEdges,
    benchmarkCase.systemContext.candidates.sourceEdges,
  );
  for (const payload of [directNeutral, directIntent, systemNeutral, systemIntent]) {
    for (const forbidden of ['bugFamily', 'vulnerableLines', 'fixDiff', 'rootCauseAnchors', 'diagnosticAnchors']) {
      assert.equal(forbidden in payload, false);
    }
  }
});

test('uses one prompt within each intent ablation pair', async () => {
  const promptDir = path.resolve(process.cwd(), '../llm-evaluation/prompts');
  assert.equal(
    await loadBenchmarkPrompt(promptDir, 'direct-neutral'),
    await loadBenchmarkPrompt(promptDir, 'direct-intent'),
  );
  assert.equal(
    await loadBenchmarkPrompt(promptDir, 'system-neutral'),
    await loadBenchmarkPrompt(promptDir, 'system-intent'),
  );
});

test('rejects answer-bearing intents while accepting outcome-only goals', () => {
  const input: AnnotationInput = {
    caseId: 'case-1',
    vulnerabilityDescription: 'Known issue',
    vulnerableSource: 'signal input amount;',
    candidates: readyCase().directContext.candidates,
    forbiddenIntentTerms: ['Example'],
  };
  assert.deepEqual(
    validateOutcomeOnlyIntent(input, 'Verify that every valid transaction preserves the intended balance relationship.'),
    [],
  );
  assert.deepEqual(
    validateOutcomeOnlyIntent(input, 'Verify that the payout accurately includes all earned components.'),
    [],
  );
  assert.ok(validateOutcomeOnlyIntent(
    input,
    'Verify that the component produces the expected output.',
  ).some((error) => error.startsWith('implementation-mechanism:')));
  assert.ok(validateOutcomeOnlyIntent(
    input,
    'Check whether the comparator input has a missing range check that allows overflow.',
  ).some((error) => error.startsWith('range-mechanism:')));
  assert.ok(validateOutcomeOnlyIntent(
    input,
    'Verify that Example behaves correctly.',
  ).some((error) => error.startsWith('identifier-leak:')));
  assert.ok(validateOutcomeOnlyIntent(
    input,
    'Verify that every output is deterministically derived from the internal state transition.',
  ).some((error) => error.startsWith('underconstraint-clue:')));
  assert.ok(validateOutcomeOnlyIntent(
    input,
    'Verify that the process produces a valid and consistent output.',
  ).some((error) => error.startsWith('underconstraint-clue:')));
  assert.ok(validateOutcomeOnlyIntent(
    input,
    'Verify that the process produces a unique and correct result.',
  ).some((error) => error.startsWith('underconstraint-clue:')));
  assert.ok(validateOutcomeOnlyIntent(
    input,
    'Verify that inputs outside the expected range are rejected.',
  ).some((error) => error.startsWith('numeric-edge-clue:')));
  assert.ok(validateOutcomeOnlyIntent(
    input,
    'Verify that every invalid path selection is rejected.',
  ).some((error) => error.startsWith('input-shape-clue:')));
  assert.ok(validateOutcomeOnlyIntent(
    input,
    'Verify that the circuit produces a single, valid result for every input length.',
  ).some((error) => error.startsWith('implementation-mechanism:')));
  assert.equal(
    normalizeOutcomeOnlyIntent(
      'Verify that the operation has one valid result, ensuring no state remains unconstrained for identical inputs.',
    ),
    'Verify that the operation has one valid result.',
  );
  assert.equal(
    normalizeOutcomeOnlyIntent(
      'Verify that transfers follow the configured policy, regardless of the transaction routing mechanism used.',
    ),
    'Verify that transfers follow the configured policy.',
  );
  assert.equal(
    normalizeOutcomeOnlyIntent(
      'Verify that extraction returns only the data within the declared length.',
    ),
    'Verify that extraction returns the intended content.',
  );
  assert.equal(
    normalizeOutcomeOnlyIntent(
      'Verify that conversion returns a valid, well-defined result.',
    ),
    'Verify that conversion returns a correct result.',
  );
});

test('does not treat generic operator labels as leaked prose identifiers', () => {
  const input: AnnotationInput = {
    caseId: 'case-operator',
    vulnerabilityDescription: 'Known issue',
    vulnerableSource: 'signal input amount;',
    candidates: {
      ...readyCase().directContext.candidates,
      sourceNodes: [
        ...readyCase().directContext.candidates.sourceNodes,
        { id: 'operation:main:1', kind: 'operation', label: 'AND' },
      ],
    },
  };
  assert.deepEqual(
    validateOutcomeOnlyIntent(input, 'Verify that valid requests are accepted and invalid requests are rejected.'),
    [],
  );
});

test('reconstructs candidate allow-lists and parses fenced JSON output', () => {
  const catalog = deserializeCatalog(readyCase().systemContext.candidates);
  assert.equal(catalog.sourceNodeIds.has('signal:main.out'), true);
  assert.equal(catalog.sourceEdgeIds.has('collapsed:assignment:8:0'), true);
  assert.equal(catalog.r1csNodeIds.has('constraint:0'), true);
  assert.deepEqual(parseStructuredOutput('```json\n{"issues": []}\n```'), { issues: [] });
  assert.deepEqual(parseStructuredOutput('```json\n{"issues": []}'), { issues: [] });
});

test('disables Qwen thinking through vLLM chat template kwargs', async () => {
  const originalFetch = globalThis.fetch;
  let request: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    request = init;
    return new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { content: '{"ok":true}' },
      }],
      usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const config = {
      id: 'local',
      provider: 'vllm-local',
      model: './local-model',
      apiStyle: 'openai-chat-completions' as const,
      apiUrl: 'http://localhost:8001/v1/chat/completions',
      maxTokens: 4096,
      temperature: 0.3,
      thinking: 'disabled' as const,
      thinkingTransport: 'qwen-chat-template' as const,
      maxRetries: 0,
    };
    const response = await callConfiguredModel({
      config,
      systemPrompt: 'Return JSON.',
      userMessage: 'Return {"ok":true}.',
    });
    assert.equal(response.success, true);
    assert.equal(response.reasoningObserved, false);
    assert.equal(response.reasoningChars, 0);
    assert.equal(response.attempts.length, 1);
    assert.equal((request?.headers as Record<string, string>).Authorization, undefined);
    const body = JSON.parse(String(request?.body));
    assert.equal(body.max_tokens, 4096);
    assert.equal(body.temperature, 0.3);
    assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
    assert.equal(body.thinking, undefined);
    assert.deepEqual(effectiveRequestConfig(config), {
      temperature: 0.3,
      maxTokens: 4096,
      thinking: 'disabled',
      thinkingTransport: 'qwen-chat-template',
    });
    assert.notEqual(modelConfigHash(config), modelConfigHash({ ...config, maxTokens: 2048 }));
    assert.notEqual(
      modelConfigHash(config),
      modelConfigHash({ ...config, thinkingTransport: 'thinking-object' }),
    );
    assert.equal(conservativelyEstimateTokens('abc'), 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses the generic thinking object for compatible gateways', async () => {
  const originalFetch = globalThis.fetch;
  let request: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    request = init;
    return new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const response = await callConfiguredModel({
      config: {
        id: 'deepseek',
        provider: 'deepseek',
        model: 'deepseek',
        apiStyle: 'openai-chat-completions',
        apiUrl: 'https://example.invalid/v1/chat/completions',
        thinking: 'disabled',
        maxRetries: 0,
      },
      systemPrompt: 'Return JSON.',
      userMessage: 'Return {"ok":true}.',
    });
    assert.equal(response.success, true);
    const body = JSON.parse(String(request?.body));
    assert.deepEqual(body.thinking, { type: 'disabled' });
    assert.equal(body.chat_template_kwargs, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('retries empty and malformed structured completions while retaining attempt metadata', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    const content = calls === 1 ? '' : calls === 2 ? '{"ok":' : '{"ok":true}';
    return new Response(JSON.stringify({
      choices: [{
        finish_reason: calls < 3 ? 'length' : 'stop',
        message: { content },
      }],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const response = await callConfiguredModel({
      config: {
        id: 'retry-model',
        provider: 'test',
        model: 'test',
        apiStyle: 'openai-chat-completions',
        apiUrl: 'https://example.invalid/v1/chat/completions',
        maxRetries: 2,
      },
      systemPrompt: 'Return JSON.',
      userMessage: 'Return {"ok":true}.',
    });
    assert.equal(response.success, true);
    assert.equal(calls, 3);
    assert.equal(response.attempts.length, 3);
    assert.match(response.attempts[0].error ?? '', /empty or malformed/);
    assert.equal(response.attempts[0].usage?.completionTokens, 4);
    assert.match(response.attempts[1].error ?? '', /Failed to parse/);
    assert.equal(response.attempts[2].success, true);
    assert.equal(response.finishReason, 'stop');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('normalizes Qwen annotation evidence and includes roots in the diagnostic region', () => {
  const input: AnnotationInput = {
    caseId: 'case-1',
    vulnerabilityDescription: 'The output uses a witness-only assignment.',
    vulnerableSource: 'out <-- in;',
    candidates: {
      sourceNodes: [sourceNode],
      sourceEdges: [sourceEdge],
      r1csNodes: [],
    },
  };
  const gold = normalizeAnnotation(input, {
    case_id: 'case-1',
    root_cause_candidates: [sourceEdge.id],
    diagnostic_candidates: [sourceNode.id],
    acceptable_issue_kinds: ['missing-constraint'],
    evidence: [{
      candidate_id: sourceEdge.id,
      source_evidence: 'The assignment uses the witness-only operator.',
      fix_evidence: 'The fix replaces it with a constrained assignment.',
    }],
    canonical_intent: 'Check whether the claimed output is fully enforced.',
    needs_human_review: false,
  });

  assert.deepEqual(gold.diagnosticAnchors, [sourceEdge.id, sourceNode.id]);
  assert.match(gold.evidence[0].justification, /Source evidence:/);
  assert.match(gold.evidence[0].justification, /Fix evidence:/);
  assert.deepEqual(validateAnnotation(input, gold), []);
});

test('normalizes evidence objects keyed by candidate ID', () => {
  const input: AnnotationInput = {
    caseId: 'case-1',
    vulnerabilityDescription: 'The output uses a witness-only assignment.',
    vulnerableSource: 'out <-- in;',
    candidates: {
      sourceNodes: [sourceNode],
      sourceEdges: [sourceEdge],
      r1csNodes: [],
    },
  };
  const gold = normalizeAnnotation(input, {
    root_cause_candidates: [sourceEdge.id],
    diagnostic_candidates: [],
    evidence: {
      [sourceEdge.id]: {
        source: 'The assignment does not generate a constraint.',
        fix: 'The fix adds the missing constraint.',
      },
    },
    canonical_intent: 'Check whether the claimed output is fully enforced.',
  });

  assert.equal(gold.evidence[0].candidateId, sourceEdge.id);
  assert.equal(gold.evidence[0].justification.length > 0, true);
  assert.deepEqual(validateAnnotation(input, gold), []);
});

test('rejects claimed fix lines when no fix diff was supplied', () => {
  const input: AnnotationInput = {
    caseId: 'case-1',
    vulnerabilityDescription: 'The output uses a witness-only assignment.',
    vulnerableSource: 'out <-- in;',
    candidates: {
      sourceNodes: [sourceNode],
      sourceEdges: [sourceEdge],
      r1csNodes: [],
    },
  };
  const gold = normalizeAnnotation(input, {
    root_cause_candidates: [sourceEdge.id],
    diagnostic_candidates: [sourceNode.id],
    evidence: [{
      candidate_id: sourceEdge.id,
      source_lines: 'out <-- in;',
      fix_lines: 'out <== in;',
      justification: 'The assignment does not create a constraint.',
    }],
    canonical_intent: 'Check whether the claimed output is fully enforced.',
  });
  assert.deepEqual(validateAnnotation(input, gold), [
    `fix-evidence-without-fix-diff:${sourceEdge.id}`,
  ]);
  assert.deepEqual(validateAnnotation({ ...input, fixDiff: '+ out <== in;' }, gold), []);
});

test('refines rejected annotations, preserves wrapper review, and resumes from history', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'circomvis-llm-refine-'));
  const inputsPath = path.join(tempRoot, 'inputs.jsonl');
  const projectionsPath = path.join(tempRoot, 'projections.jsonl');
  const draftsPath = path.join(tempRoot, 'drafts.jsonl');
  const reviewsPath = path.join(tempRoot, 'reviews.jsonl');
  const configPath = path.join(tempRoot, 'models.json');
  const promptDir = path.join(tempRoot, 'prompts');
  const goldOutputPath = path.join(tempRoot, 'gold.refined.jsonl');
  const reviewOutputPath = path.join(tempRoot, 'review.refined.jsonl');
  const historyPath = path.join(tempRoot, 'history.jsonl');
  await fs.mkdir(promptDir, { recursive: true });
  await fs.writeFile(path.join(promptDir, 'annotation-revision-v1.txt'), 'Revise the annotation. Return JSON only.');
  await fs.writeFile(path.join(promptDir, 'critic-v1.txt'), 'Review the annotation. Return JSON only.');

  const caseIds = ['case-accepted', 'case-wrapper', 'case-exhausted'];
  const inputs: AnnotationInput[] = caseIds.map((caseId, index) => ({
    caseId,
    vulnerabilityDescription: 'The output relation is not fully enforced.',
    vulnerableSource: 'out <-- in;',
    mappingReviewRequired: index === 1,
    candidates: {
      sourceNodes: [sourceNode],
      sourceEdges: [sourceEdge],
      r1csNodes: [],
    },
  }));
  const projections = caseIds.map((caseId) => createProjection({
    caseId,
    bundleHash: `bundle-${caseId}`,
    maxInputTokens: 44_032,
    originalR1csCount: 0,
    retainedR1csIds: [],
    hardExcluded: false,
    tokenCounts: { annotation: 100 },
  }));
  const draftFor = (caseId: string): BenchmarkGold => ({
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    caseId,
    rootCauseAnchors: [sourceEdge.id],
    diagnosticAnchors: [sourceEdge.id, sourceNode.id],
    canonicalIntent: 'Verify that the output relation is enforced.',
    evidence: [{ candidateId: sourceEdge.id, justification: 'The assignment does not create a constraint.' }],
    annotationStatus: 'review-required',
    needsHumanReview: true,
  });
  const reviewFor = (caseId: string, wrapper: boolean): ReviewRow => ({
    caseId,
    annotatorModel: 'annotator',
    criticModel: 'critic',
    annotatorRaw: '{"old":true}',
    criticRaw: wrapper
      ? '{"verdict":"accept","reasons":[]}'
      : '{"verdict":"reject","reasons":["Use the direct assignment edge."]}',
    criticVerdict: wrapper ? 'accept' : 'reject',
    validationErrors: wrapper ? ['wrapper-mapping-review-required'] : [],
    needsHumanReview: true,
  });
  await writeJsonl(inputsPath, inputs);
  await writeJsonl(projectionsPath, projections);
  await writeJsonl(draftsPath, caseIds.map(draftFor));
  await writeJsonl(reviewsPath, caseIds.map((caseId, index) => reviewFor(caseId, index === 1)));
  await fs.writeFile(configPath, JSON.stringify({
    models: [
      {
        id: 'annotator',
        provider: 'local',
        model: 'annotator-model',
        apiStyle: 'openai-chat-completions',
        apiUrl: 'https://annotator.invalid/v1/chat/completions',
        maxRetries: 0,
      },
      {
        id: 'critic',
        provider: 'remote',
        model: 'critic-model',
        apiStyle: 'openai-chat-completions',
        apiUrl: 'https://critic.invalid/v1/chat/completions',
        maxRetries: 0,
      },
    ],
  }));

  const annotation = (fixLines = '') => JSON.stringify({
    case_id: 'ignored-by-normalizer',
    root_cause_candidates: [sourceEdge.id],
    diagnostic_candidates: [sourceEdge.id, sourceNode.id],
    acceptable_issue_kinds: ['missing-constraint'],
    evidence: [{
      candidate_id: sourceEdge.id,
      source_lines: 'out <-- in;',
      fix_lines: fixLines,
      justification: 'The witness-only assignment does not enforce the output relation.',
    }],
    canonical_intent: 'Verify that the claimed output is fully enforced.',
    needs_human_review: false,
  });
  const responses = [
    annotation(),
    '{"verdict":"accept","reasons":[]}',
    annotation('out <== in;'),
    '{"verdict":"accept","reasons":[]}',
    annotation(),
    '{"verdict":"reject","reasons":["The root mapping is still not supported."]}',
  ];
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ finish_reason: 'stop', message: { content: responses[calls++] } }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const options = {
      inputsPath,
      projectionPath: projectionsPath,
      draftPath: draftsPath,
      reviewPath: reviewsPath,
      configPath,
      promptDir,
      annotatorId: 'annotator',
      criticId: 'critic',
      rounds: 2,
      goldOutputPath,
      reviewOutputPath,
      historyPath,
    };
    const result = await refineAnnotations(options);
    assert.equal(result.revisedCases, 2);
    assert.equal(result.acceptedAfterRevision, 1);
    assert.equal(result.reviewRequired, 2);
    assert.equal(calls, 6);
    const refinedById = new Map(result.gold.map((gold) => [gold.caseId, gold]));
    assert.equal(refinedById.get('case-accepted')?.needsHumanReview, false);
    assert.equal(refinedById.get('case-wrapper')?.needsHumanReview, true);
    assert.equal(refinedById.get('case-exhausted')?.needsHumanReview, true);
    const history = (await fs.readFile(historyPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(history.length, 3);
    assert.deepEqual(history.map((row) => row.status), ['accepted', 'continue', 'exhausted']);

    const resumed = await refineAnnotations(options);
    assert.equal(resumed.reviewRequired, 2);
    assert.equal(calls, 6);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('applies and validates a deterministic R1CS projection', () => {
  const projection = createProjection({
    caseId: 'case-1',
    bundleHash: 'bundle-hash',
    maxInputTokens: 44_032,
    originalR1csCount: 2,
    retainedR1csIds: ['constraint:2'],
    hardExcluded: false,
    tokenCounts: { 'system-intent': 12_000, annotation: 13_000 },
  });
  validateProjection(projection, 'case-1', 'bundle-hash');
  assert.throws(() => validateProjection({ ...projection, retainedR1csIds: [] }, 'case-1', 'bundle-hash'));
  const input: AnnotationInput = {
    caseId: 'case-1',
    vulnerabilityDescription: 'Known issue.',
    vulnerableSource: 'signal output out;',
    candidates: {
      sourceNodes: [sourceNode],
      sourceEdges: [sourceEdge],
      r1csNodes: [{ id: 'constraint:1' }, { id: 'constraint:2' }],
    },
  };
  const projected = filterAnnotationInputByProjection(input, projection);
  assert.deepEqual(projected.candidates.r1csNodes, [{ id: 'constraint:2' }]);
  assert.equal(projected.projectionHash, projection.projectionHash);
  assert.throws(() => filterAnnotationInputByProjection({
    ...input,
    candidates: { ...input.candidates, r1csNodes: [] },
  }, projection), /not projection-aligned/);

  const ordered = prioritizeR1csCandidateIds({
    summary: { diagnostics: [{ nodeIds: ['constraint:3'] }] },
    mappings: { sourceToO0: [{ confidence: 'high', constraintNodeIds: ['constraint:2'] }] },
  } as any, {
    sourceNodeIds: new Set(),
    sourceEdgeIds: new Set(),
    r1csNodeIds: new Set(['constraint:1', 'constraint:2', 'constraint:3', 'family:1']),
    sourceNodes: [],
    sourceEdges: [],
    r1csNodes: [
      { id: 'constraint:1', kind: 'constraint', index: 1 },
      { id: 'constraint:2', kind: 'constraint', index: 2 },
      { id: 'constraint:3', kind: 'constraint', index: 3 },
      { id: 'family:1', kind: 'constraint-family' },
    ],
  });
  assert.deepEqual(ordered.slice(0, 3), ['constraint:3', 'family:1', 'constraint:2']);
});

test('evaluates only constant Circom template arguments', () => {
  assert.equal(evaluateConstantExpression({
    type: 'BinaryOp',
    operator: '+',
    left: { type: 'Literal', value: 2, line: 1 },
    right: { type: 'Literal', value: 3, line: 1 },
    line: 1,
  }), 5);
  assert.equal(evaluateConstantExpression({ type: 'Identifier', name: 'n', line: 1 }), null);
});

test('freezes bundle anchors before joining the canonical intent into safe cases', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'circomvis-llm-freeze-'));
  const bundlesPath = path.join(tempRoot, 'bundle-inputs.jsonl');
  const draftPath = path.join(tempRoot, 'gold.draft.jsonl');
  const goldPath = path.join(tempRoot, 'gold.jsonl');
  const casesPath = path.join(tempRoot, 'cases.jsonl');
  const bundleCase: BuiltBundleCase = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    caseId: 'case-1',
    project: 'project-a',
    projectCommit: 'abc123',
    bugFamily: 'Under-Constrained',
    vulnerableFile: 'circuit.circom',
    vulnerableLines: '8',
    selectedTemplate: 'Example',
    directEntrypoint: 'circuit.circom',
    codebasePath: 'codebase',
    configPath: 'config.json',
    viewTemplate: 'Example',
    mappingMode: 'direct-vulnerable-template',
    mappingReviewRequired: false,
    bundle: {
      summary: {
        buildId: 'build-1',
        compiler: { version: 'circom 2.2.3', prime: '1', actualOptimization: 'O0' },
        selectedComponentPath: 'main',
        mockManifest: { selectedRoot: 'main', mocks: [] },
        stats: {
          sourceSignals: 1,
          sourceOperations: 0,
          constraints: { O0: 0 },
          survivingSignals: { O0: 0 },
          substitutedSignals: { O0: 0 },
        },
        diagnostics: [],
      },
      sourceGraph: {
        nodes: [{ id: 'signal:main.out', kind: 'signal', label: 'out', qualifiedName: 'main.out', role: 'output' }],
        edges: [],
        adjacency: { 'signal:main.out': [] },
        loops: [],
        statements: [],
      },
      constraintGraph: {
        level: 'O0',
        signals: [],
        constraints: [],
        edges: [],
        adjacency: {},
        signalGroups: [],
        loopClusters: [],
        mockBoundaries: [],
      },
      mappings: { sourceToO0: [] },
      analysisContext: {
        templateName: 'Example',
        originCode: 'template Example() { signal output out; }',
        mockedCode: 'template Example() { signal output out; } component main = Example();',
      },
    },
  };
  const draft: BenchmarkGold = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    caseId: 'case-1',
    rootCauseAnchors: ['signal:main.out'],
    diagnosticAnchors: ['signal:main.out'],
    canonicalIntent: 'Check whether the claimed output is fully enforced.',
    evidence: [{ candidateId: 'signal:main.out', justification: 'Known fix supports this mapping.' }],
    annotationStatus: 'draft',
    needsHumanReview: false,
  };
  await writeJsonl(bundlesPath, [bundleCase]);
  await writeJsonl(draftPath, [draft]);
  const frozen = await freezeGold({ casesPath: bundlesPath, draftPath, outputPath: goldPath });
  assert.deepEqual(frozen.unresolved, []);
  assert.equal(frozen.frozen[0].annotationStatus, 'frozen');
  const prepared = await prepareCasesFromBundles({ inputPath: bundlesPath, goldPath, outputPath: casesPath });
  assert.equal(prepared[0].canonicalIntent, draft.canonicalIntent);
  assert.equal(prepared[0].status, 'ready');
});

test('builds a production-shaped bundle from a pinned direct wrapper', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'circomvis-llm-build-'));
  const zkbugsRoot = path.join(tempRoot, 'zkbugs');
  const caseDir = path.join(zkbugsRoot, 'dataset', 'circom', 'org', 'repo', 'bug');
  const codebaseDir = path.join(zkbugsRoot, 'dataset', 'codebases', 'circom', 'org', 'repo', 'abc');
  await fs.mkdir(caseDir, { recursive: true });
  await fs.mkdir(codebaseDir, { recursive: true });
  await fs.writeFile(path.join(caseDir, 'circuit.circom'), [
    'pragma circom 2.2.3;',
    'include "support.circom";',
    'include "vulnerable.circom";',
    'component main = Vulnerable();',
  ].join('\n'));
  await fs.writeFile(path.join(codebaseDir, 'support.circom'), [
    'pragma circom 2.2.3;',
    'function twice(value) {',
    '  return value * 2;',
    '}',
  ].join('\n'));
  await fs.writeFile(path.join(codebaseDir, 'vulnerable.circom'), [
    'pragma circom 2.2.3;',
    'template Vulnerable() {',
    '  signal input in;',
    '  signal output out;',
    '  out <-- twice(in);',
    '}',
  ].join('\n'));
  await fs.writeFile(path.join(caseDir, 'zkbugs_config.json'), JSON.stringify({
    Bug: {
      Id: 'org/repo/bug',
      Project: 'org/repo',
      Commit: 'abc',
      Codebase: 'dataset/codebases/circom/org/repo/abc',
      'Direct Entrypoint': 'circuit.circom',
      Vulnerability: 'Under-Constrained',
      'Short Description of the Vulnerability': 'The output is computed without an enforcing constraint.',
      Location: { Path: 'vulnerable.circom', Function: 'Vulnerable', Line: '5' },
      Source: { Report: { 'Bug ID': 'TEST-1' } },
    },
  }));
  const pending: PendingBenchmarkCase = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    status: 'pending-bundle',
    caseId: 'org/repo/bug',
    project: 'org/repo',
    projectCommit: 'abc',
    bugFamily: 'Under-Constrained',
    vulnerableFile: 'vulnerable.circom',
    vulnerableLines: '5',
    selectedTemplate: 'Vulnerable',
    directEntrypoint: 'circuit.circom',
    codebasePath: 'dataset/codebases/circom/org/repo/abc',
    configPath: 'dataset/circom/org/repo/bug/zkbugs_config.json',
    inventorySelection: 'metadata-selected',
    selectionPriority: 0,
    pendingReason: 'partial-debugging-bundle-not-generated',
  };
  const pendingPath = path.join(tempRoot, 'cases.pending.jsonl');
  await writeJsonl(pendingPath, [pending]);
  const result = await buildBenchmarkBundles({
    casesPath: pendingPath,
    zkbugsRoot,
    workDir: path.join(tempRoot, 'work'),
    bundleOutputPath: path.join(tempRoot, 'bundle-inputs.jsonl'),
    annotationOutputPath: path.join(tempRoot, 'annotation-inputs.jsonl'),
    statusOutputPath: path.join(tempRoot, 'build-status.csv'),
    splitsOutputPath: path.join(tempRoot, 'splits.json'),
    target: 1,
  });
  assert.equal(result.bundles.length, 1);
  assert.equal(result.statuses[0].status, 'built');
  assert.equal(result.bundles[0].mappingMode, 'direct-vulnerable-template');
  assert.equal(result.annotationInputs[0].caseId, pending.caseId);
  assert.equal(result.annotationInputs[0].candidates.sourceNodes.length > 0, true);
});

test('scores frozen gold deterministically and ignores draft labels', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'circomvis-llm-score-'));
  const casesPath = path.join(tempRoot, 'cases.jsonl');
  const goldPath = path.join(tempRoot, 'gold.jsonl');
  const predictionsRoot = path.join(tempRoot, 'runs', 'model-a');
  const outputDir = path.join(tempRoot, 'results');
  const benchmarkCase = readyCase();
  const frozenGold: BenchmarkGold = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    caseId: benchmarkCase.caseId,
    rootCauseAnchors: ['signal:main.out'],
    diagnosticAnchors: ['signal:main.out', 'collapsed:assignment:8:0'],
    canonicalIntent: benchmarkCase.canonicalIntent,
    evidence: [{ candidateId: 'signal:main.out', justification: 'The fix constrains this output.' }],
    annotationStatus: 'frozen',
    needsHumanReview: false,
  };
  const draftGold: BenchmarkGold = { ...frozenGold, caseId: 'draft-case', annotationStatus: 'draft' };
  const prediction: BenchmarkPrediction = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    predictionId: 'prediction-1',
    caseId: benchmarkCase.caseId,
    project: benchmarkCase.project,
    bugFamily: benchmarkCase.bugFamily,
    modelId: 'model-a',
    provider: 'test',
    model: 'test-model',
    experimentId: 'test-experiment',
    modelConfigHash: 'model-config',
    requestConfig: { temperature: 0.3, maxTokens: 4096 },
    track: 'direct-intent',
    attempt: 1,
    promptHash: 'prompt',
    payloadHash: 'payload',
    startedAt: '2026-01-01T00:00:00.000Z',
    durationMs: 25,
    success: true,
    parsedOutput: { issues: [{ anchors: [{ id: 'signal:main.out' }] }] },
    normalizedIssues: [issue('signal:main.out')],
    detectorIssues: [],
    mergedIssues: [issue('signal:main.out')],
  };

  await writeJsonl(casesPath, [benchmarkCase]);
  await writeJsonl(goldPath, [frozenGold, draftGold]);
  await writeJsonl(path.join(predictionsRoot, 'direct-intent', 'predictions.jsonl'), [prediction]);
  const result = await scoreBenchmark({ casesPath, goldPath, predictionsRoot, outputDir });

  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].diagnosticCoverageAt3, 1);
  assert.equal(result.rows[0].rootHitAt1, 1);
  assert.equal(result.rows[0].validCandidateRate, 1);
});

test('reports a paired project bootstrap interval for the full system gain', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'circomvis-llm-paired-score-'));
  const casesPath = path.join(tempRoot, 'cases.jsonl');
  const goldPath = path.join(tempRoot, 'gold.jsonl');
  const predictionsRoot = path.join(tempRoot, 'runs');
  const outputDir = path.join(tempRoot, 'results');
  const benchmarkCase = readyCase();
  const frozenGold: BenchmarkGold = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    caseId: benchmarkCase.caseId,
    rootCauseAnchors: ['signal:main.out'],
    diagnosticAnchors: ['signal:main.out'],
    canonicalIntent: benchmarkCase.canonicalIntent,
    evidence: [{ candidateId: 'signal:main.out', justification: 'Known fix.' }],
    annotationStatus: 'frozen',
    needsHumanReview: false,
  };
  const base: BenchmarkPrediction = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    predictionId: 'direct',
    experimentId: 'formal-v1',
    modelConfigHash: 'config',
    requestConfig: { temperature: 0.3, maxTokens: 4096 },
    caseId: benchmarkCase.caseId,
    project: benchmarkCase.project,
    bugFamily: benchmarkCase.bugFamily,
    modelId: 'model-a',
    provider: 'test',
    model: 'test-model',
    track: 'direct-neutral',
    attempt: 1,
    promptHash: 'prompt',
    payloadHash: 'payload',
    startedAt: '2026-01-01T00:00:00.000Z',
    durationMs: 25,
    success: true,
    parsedOutput: { issues: [] },
    normalizedIssues: [],
    detectorIssues: [],
    mergedIssues: [],
  };
  const system: BenchmarkPrediction = {
    ...base,
    predictionId: 'system',
    track: 'system-intent',
    normalizedIssues: [issue('signal:main.out')],
    mergedIssues: [issue('signal:main.out')],
  };
  await writeJsonl(casesPath, [benchmarkCase]);
  await writeJsonl(goldPath, [frozenGold]);
  await writeJsonl(path.join(predictionsRoot, 'predictions.jsonl'), [base, system]);
  await scoreBenchmark({
    casesPath,
    goldPath,
    predictionsRoot,
    outputDir,
    experimentId: 'formal-v1',
    split: 'test',
  });
  const summary = JSON.parse(await fs.readFile(path.join(outputDir, 'summary.json'), 'utf8'));
  const comparison = summary.comparisons['model-a/end-to-end'];
  assert.equal(comparison.fullSystemGain, 1);
  assert.equal(comparison.pairedProjectDeltas.fullSystemGain.mean, 1);
  assert.deepEqual(comparison.pairedProjectDeltas.fullSystemGain.projectBootstrap95, [1, 1]);
  assert.equal(summary.comparisonsByScope.test['model-a/end-to-end'].fullSystemGain, 1);
  assert.equal(summary.comparisonsByScope.development['model-a/end-to-end'].fullSystemGain, null);
});

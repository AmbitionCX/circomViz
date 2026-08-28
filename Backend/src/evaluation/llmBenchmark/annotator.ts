import { promises as fs } from 'fs';
import path from 'path';
import type {
  AnnotationInput,
  BenchmarkCase,
  BenchmarkConfigFile,
  BenchmarkGold,
  BuiltBundleCase,
  BenchmarkProjection,
  BenchmarkModelConfig,
  ReadyBenchmarkCase,
} from './types.js';
import { BENCHMARK_SCHEMA_VERSION } from './types.js';
import { callConfiguredModel } from './modelClient.js';
import type { BenchmarkModelResponse } from './modelClient.js';
import { prepareTemplateAttentionRequest } from '../../core/llm/templateAttentionAnalyzer.js';
import { NEUTRAL_INTENT } from './types.js';
import { appendJsonl, readJsonFile, readJsonl, sha256, writeJsonl } from './io.js';
import { modelConfigHash } from './runner.js';
import { filterAnnotationInputByProjection } from './projection.js';

type UnknownRecord = Record<string, unknown>;

export interface ReviewRow {
  caseId: string;
  annotatorModel: string;
  criticModel: string;
  annotatorRaw?: string;
  criticRaw?: string;
  annotatorResponse?: ReviewCallMetadata;
  criticResponse?: ReviewCallMetadata;
  criticVerdict: 'accept' | 'revise' | 'reject' | 'invalid';
  validationErrors: string[];
  needsHumanReview: boolean;
  inputHash?: string;
  annotationPromptHash?: string;
  criticPromptHash?: string;
  annotatorConfigHash?: string;
  criticConfigHash?: string;
  projectionHash?: string;
  revisionCount?: number;
  sourceReviewHash?: string;
}

export interface ReviewCallMetadata {
  success: boolean;
  durationMs: number;
  usage?: BenchmarkModelResponse['usage'];
  error?: string;
  finishReason?: string;
  reasoningObserved?: boolean;
  reasoningChars?: number;
  attempts: BenchmarkModelResponse['attempts'];
}

export function reviewCallMetadata(response: BenchmarkModelResponse): ReviewCallMetadata {
  return {
    success: response.success,
    durationMs: response.durationMs,
    usage: response.usage,
    error: response.error,
    finishReason: response.finishReason,
    reasoningObserved: response.reasoningObserved,
    reasoningChars: response.reasoningChars,
    attempts: response.attempts,
  };
}

export function buildCriticPayload(input: AnnotationInput, gold: BenchmarkGold): Record<string, unknown> {
  return {
    knownVulnerability: input.vulnerabilityDescription,
    vulnerableSource: input.vulnerableSource,
    fixDiff: input.fixDiff,
    auditEvidence: input.auditEvidence,
    candidates: input.candidates,
    proposedAnnotation: gold,
  };
}

export async function createReviewSample(options: {
  draftPath: string;
  reviewPath: string;
  outputPath: string;
  acceptedSampleRate?: number;
}): Promise<{ mandatory: number; spotChecks: number; total: number }> {
  const drafts = await readJsonl<BenchmarkGold>(options.draftPath);
  const reviewByCase = new Map((await readJsonl<ReviewRow>(options.reviewPath))
    .map((review) => [review.caseId, review]));
  const mandatory = drafts.filter((draft) =>
    draft.needsHumanReview || reviewByCase.get(draft.caseId)?.needsHumanReview);
  const accepted = drafts.filter((draft) =>
    !draft.needsHumanReview && !reviewByCase.get(draft.caseId)?.needsHumanReview);
  const rate = Math.max(0, Math.min(1, options.acceptedSampleRate ?? 0.1));
  const sampleSize = accepted.length ? Math.max(1, Math.ceil(accepted.length * rate)) : 0;
  const spotChecks = [...accepted]
    .sort((left, right) => sha256(`spot-check:${left.caseId}`).localeCompare(sha256(`spot-check:${right.caseId}`)))
    .slice(0, sampleSize);
  const mandatoryIds = new Set(mandatory.map((draft) => draft.caseId));
  const rows = [...mandatory, ...spotChecks].map((draft) => ({
    caseId: draft.caseId,
    reviewReason: mandatoryIds.has(draft.caseId) ? 'mandatory' : 'deterministic-spot-check',
    proposedGold: draft,
    criticReview: reviewByCase.get(draft.caseId),
  }));
  await writeJsonl(options.outputPath, rows);
  return { mandatory: mandatory.length, spotChecks: spotChecks.length, total: rows.length };
}

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean))]
    : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function candidateIds(input: AnnotationInput): Set<string> {
  return new Set([
    ...input.candidates.sourceNodes,
    ...input.candidates.sourceEdges,
    ...input.candidates.r1csNodes,
  ].map((candidate) => String(candidate.id ?? '')).filter(Boolean));
}

function scoringCandidateIds(input: AnnotationInput): Set<string> {
  return new Set([
    ...input.candidates.sourceNodes,
    ...input.candidates.sourceEdges,
  ].map((candidate) => String(candidate.id ?? '')).filter(Boolean));
}

function candidateLabels(input: AnnotationInput): string[] {
  return [
    ...input.candidates.sourceNodes,
    ...input.candidates.sourceEdges,
    ...input.candidates.r1csNodes,
  ].flatMap((candidate) => [candidate.label, candidate.qualifiedName, candidate.from, candidate.to])
    .filter((value): value is string => typeof value === 'string' && value.trim().length >= 3);
}

function normalizedEvidence(value: unknown): BenchmarkGold['evidence'] {
  const rawEntries = Array.isArray(value)
    ? value.map((entry) => ({ fallbackCandidateId: '', item: record(entry) }))
    : Object.entries(record(value)).map(([candidateId, entry]) => ({
      fallbackCandidateId: candidateId,
      item: record(entry),
    }));
  const evidenceByCandidate = new Map<string, BenchmarkGold['evidence'][number]>();
  for (const { fallbackCandidateId, item } of rawEntries) {
    const candidateId = text(item.candidate_id ?? item.candidateId) || fallbackCandidateId;
    if (!candidateId) continue;
    const sourceEvidence = text(item.source_evidence ?? item.sourceEvidence ?? item.source);
    const fixEvidence = text(item.fix_evidence ?? item.fixEvidence ?? item.fix);
    const justification = text(item.justification) || [
      sourceEvidence ? `Source evidence: ${sourceEvidence}` : '',
      fixEvidence ? `Fix evidence: ${fixEvidence}` : '',
    ].filter(Boolean).join(' ');
    evidenceByCandidate.set(candidateId, {
      candidateId,
      sourceLines: text(item.source_lines ?? item.sourceLines) || undefined,
      fixLines: text(item.fix_lines ?? item.fixLines) || undefined,
      justification,
    });
  }
  return [...evidenceByCandidate.values()];
}

export function normalizeAnnotation(input: AnnotationInput, parsed: unknown): BenchmarkGold {
  const value = record(parsed);
  const rootCauseAnchors = strings(value.root_cause_candidates ?? value.rootCauseAnchors);
  const diagnosticAnchors = [
    ...new Set([
      ...rootCauseAnchors,
      ...strings(value.diagnostic_candidates ?? value.diagnosticAnchors),
    ]),
  ];
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    caseId: input.caseId,
    rootCauseAnchors,
    diagnosticAnchors,
    acceptableIssueKinds: strings(value.acceptable_issue_kinds ?? value.acceptableIssueKinds),
    canonicalIntent: text(value.canonical_intent ?? value.canonicalIntent),
    evidence: normalizedEvidence(value.evidence),
    annotationStatus: 'draft',
    needsHumanReview: value.needs_human_review === true || value.needsHumanReview === true,
  };
}

export function validateAnnotation(input: AnnotationInput, gold: BenchmarkGold): string[] {
  const errors: string[] = [];
  const allowed = candidateIds(input);
  const scoringAllowed = scoringCandidateIds(input);
  if (!gold.rootCauseAnchors.length) errors.push('missing-root-cause-anchor');
  if (!gold.diagnosticAnchors.length) errors.push('missing-diagnostic-anchor');
  for (const id of [...gold.rootCauseAnchors, ...gold.diagnosticAnchors]) {
    if (!allowed.has(id)) errors.push(`unknown-candidate:${id}`);
    else if (!scoringAllowed.has(id)) errors.push(`scoring-target-must-be-source-anchor:${id}`);
  }
  for (const id of gold.rootCauseAnchors) {
    if (!gold.diagnosticAnchors.includes(id)) errors.push(`root-not-in-diagnostic-region:${id}`);
  }
  if (!gold.canonicalIntent) errors.push('missing-canonical-intent');
  const intent = gold.canonicalIntent.toLowerCase();
  const forbidden = [...candidateLabels(input), ...(input.forbiddenIntentTerms ?? [])]
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length >= 3);
  const containsTerm = (term: string) => {
    if (!/^[a-z0-9_.\[\]-]+$/i.test(term)) return intent.includes(term);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9_])${escaped}($|[^a-z0-9_])`, 'i').test(intent);
  };
  for (const term of forbidden) {
    if (containsTerm(term)) errors.push(`intent-leak:${term}`);
  }
  for (const evidence of gold.evidence) {
    if (!allowed.has(evidence.candidateId)) errors.push(`evidence-unknown-candidate:${evidence.candidateId}`);
    if (!evidence.justification) errors.push(`evidence-missing-justification:${evidence.candidateId}`);
    if (!input.fixDiff?.trim() && evidence.fixLines?.trim()) {
      errors.push(`fix-evidence-without-fix-diff:${evidence.candidateId}`);
    }
  }
  const justifiedEvidenceIds = new Set(
    gold.evidence.filter((entry) => entry.justification).map((entry) => entry.candidateId),
  );
  for (const id of gold.rootCauseAnchors) {
    if (!justifiedEvidenceIds.has(id)) errors.push(`root-evidence-missing:${id}`);
  }
  return [...new Set(errors)];
}

function model(config: BenchmarkConfigFile, id: string): BenchmarkModelConfig {
  const found = config.models.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown model id: ${id}`);
  return found;
}

async function annotateOne(options: {
  input: AnnotationInput;
  annotator: BenchmarkModelConfig;
  critic: BenchmarkModelConfig;
  annotationPrompt: string;
  criticPrompt: string;
}): Promise<{ gold: BenchmarkGold; review: ReviewRow }> {
  const annotationResponse = await callConfiguredModel({
    config: options.annotator,
    systemPrompt: options.annotationPrompt,
    userMessage: JSON.stringify(options.input),
  });
  if (!annotationResponse.success) {
    const gold: BenchmarkGold = {
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      caseId: options.input.caseId,
      rootCauseAnchors: [],
      diagnosticAnchors: [],
      canonicalIntent: '',
      evidence: [],
      annotationStatus: 'review-required',
      needsHumanReview: true,
    };
    return {
      gold,
      review: {
        caseId: options.input.caseId,
        annotatorModel: options.annotator.id,
        criticModel: options.critic.id,
        annotatorRaw: annotationResponse.raw,
        annotatorResponse: reviewCallMetadata(annotationResponse),
        criticVerdict: 'invalid',
        validationErrors: [annotationResponse.error ?? 'annotation-call-failed'],
        needsHumanReview: true,
      },
    };
  }

  const gold = normalizeAnnotation(options.input, annotationResponse.parsed);
  const validationErrors = validateAnnotation(options.input, gold);
  const criticResponse = await callConfiguredModel({
    config: options.critic,
    systemPrompt: options.criticPrompt,
    userMessage: JSON.stringify(buildCriticPayload(options.input, gold)),
  });
  const criticValue = record(criticResponse.parsed);
  const verdictText = text(criticValue.verdict).toLowerCase();
  const criticVerdict = criticResponse.success && ['accept', 'revise', 'reject'].includes(verdictText)
    ? verdictText as 'accept' | 'revise' | 'reject'
    : 'invalid';
  const needsHumanReview = gold.needsHumanReview
    || options.input.mappingReviewRequired === true
    || validationErrors.length > 0
    || criticVerdict !== 'accept';
  gold.annotationStatus = needsHumanReview ? 'review-required' : 'draft';
  gold.needsHumanReview = needsHumanReview;
  return {
    gold,
    review: {
      caseId: options.input.caseId,
      annotatorModel: options.annotator.id,
      criticModel: options.critic.id,
      annotatorRaw: annotationResponse.raw,
      criticRaw: criticResponse.raw,
      annotatorResponse: reviewCallMetadata(annotationResponse),
      criticResponse: reviewCallMetadata(criticResponse),
      criticVerdict,
      validationErrors: [
        ...validationErrors,
        ...(options.input.mappingReviewRequired ? ['wrapper-mapping-review-required'] : []),
        ...(!criticResponse.success ? [criticResponse.error ?? 'critic-call-failed'] : []),
      ],
      needsHumanReview,
    },
  };
}

export async function generateDraftGold(options: {
  inputsPath: string;
  configPath: string;
  annotatorId: string;
  criticId: string;
  promptDir: string;
  goldOutputPath: string;
  reviewOutputPath: string;
  projectionPath?: string;
}): Promise<{ gold: BenchmarkGold[]; reviews: ReviewRow[] }> {
  if (options.annotatorId === options.criticId) throw new Error('Annotator and critic must use different model configurations');
  const rawInputs = await readJsonl<AnnotationInput>(options.inputsPath);
  const projections = options.projectionPath
    ? new Map((await readJsonl<BenchmarkProjection>(options.projectionPath))
      .map((projection) => [projection.caseId, projection]))
    : undefined;
  const inputs = rawInputs.map((input) => {
    const projection = projections?.get(input.caseId);
    if (projections && !projection) throw new Error(`Missing projection for annotation case ${input.caseId}`);
    if (projection?.hardExcluded) {
      throw new Error(`Hard-excluded case remains in annotation inputs: ${input.caseId}; rebuild the common dataset first`);
    }
    return filterAnnotationInputByProjection(input, projection);
  });
  const config = await readJsonFile<BenchmarkConfigFile>(options.configPath);
  const annotator = model(config, options.annotatorId);
  const critic = model(config, options.criticId);
  if (annotator.provider === critic.provider && annotator.model === critic.model) {
    throw new Error('Annotator and critic must use different underlying models');
  }
  const annotationPrompt = (await fs.readFile(path.join(options.promptDir, 'annotation-v1.txt'), 'utf8')).trim();
  const criticPrompt = (await fs.readFile(path.join(options.promptDir, 'critic-v1.txt'), 'utf8')).trim();
  const annotationPromptHash = sha256(annotationPrompt);
  const criticPromptHash = sha256(criticPrompt);
  const annotatorConfigHash = modelConfigHash(annotator);
  const criticConfigHash = modelConfigHash(critic);
  const existingGold = new Map((await readJsonl<BenchmarkGold>(options.goldOutputPath)).map((entry) => [entry.caseId, entry]));
  const existingReviews = new Map((await readJsonl<ReviewRow>(options.reviewOutputPath)).map((entry) => [entry.caseId, entry]));
  const gold: BenchmarkGold[] = [];
  const reviews: ReviewRow[] = [];
  const pending: AnnotationInput[] = [];
  for (const input of inputs) {
    const review = existingReviews.get(input.caseId);
    const previousGold = existingGold.get(input.caseId);
    const reusable = previousGold
      && review?.inputHash === sha256(input)
      && review.annotationPromptHash === annotationPromptHash
      && review.criticPromptHash === criticPromptHash
      && review.annotatorConfigHash === annotatorConfigHash
      && review.criticConfigHash === criticConfigHash
      && review.projectionHash === input.projectionHash
      && review.annotatorModel === annotator.id
      && review.criticModel === critic.id
      && review.criticVerdict !== 'invalid'
      && Boolean(review.annotatorRaw)
      && Boolean(review.criticRaw)
      && review.annotatorResponse?.success === true
      && review.criticResponse?.success === true;
    if (reusable) {
      gold.push(previousGold);
      reviews.push(review);
    } else {
      pending.push(input);
    }
  }
  await writeJsonl(options.goldOutputPath, gold);
  await writeJsonl(options.reviewOutputPath, reviews);

  let cursor = 0;
  const concurrency = Math.max(1, Math.min(
    annotator.concurrency ?? 1,
    critic.concurrency ?? 1,
    pending.length || 1,
  ));
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < pending.length) {
      const index = cursor;
      cursor += 1;
      const input = pending[index];
      const result = await annotateOne({ input, annotator, critic, annotationPrompt, criticPrompt });
      const review: ReviewRow = {
        ...result.review,
        inputHash: sha256(input),
        annotationPromptHash,
        criticPromptHash,
        annotatorConfigHash,
        criticConfigHash,
        projectionHash: input.projectionHash,
      };
      gold.push(result.gold);
      reviews.push(review);
      await appendJsonl(options.goldOutputPath, result.gold);
      await appendJsonl(options.reviewOutputPath, review);
    }
  }));
  return { gold, reviews };
}

interface HumanDecision {
  caseId: string;
  action: 'accept' | 'replace' | 'exclude';
  replacement?: BenchmarkGold;
  note?: string;
}

function readyCandidateIds(benchmarkCase: ReadyBenchmarkCase): Set<string> {
  return new Set([
    ...benchmarkCase.systemContext.candidates.sourceNodes,
    ...benchmarkCase.systemContext.candidates.sourceEdges,
    ...benchmarkCase.systemContext.candidates.r1csNodes,
  ].map((candidate) => String(candidate.id ?? '')).filter(Boolean));
}

function bundleCandidateIds(benchmarkCase: BuiltBundleCase): Set<string> {
  const catalog = prepareTemplateAttentionRequest(NEUTRAL_INTENT, benchmarkCase.bundle).catalog;
  return new Set([
    ...catalog.sourceNodes,
    ...catalog.sourceEdges,
    ...catalog.r1csNodes,
  ].map((candidate) => String(candidate.id ?? '')).filter(Boolean));
}

export async function freezeGold(options: {
  casesPath: string;
  draftPath: string;
  decisionsPath?: string;
  outputPath: string;
}): Promise<{ frozen: BenchmarkGold[]; unresolved: string[] }> {
  const caseRows = await readJsonl<BenchmarkCase | BuiltBundleCase>(options.casesPath);
  const cases = new Map(caseRows.flatMap((candidate) => {
    if ('status' in candidate && candidate.status === 'ready') {
      return [[candidate.caseId, readyCandidateIds(candidate)] as const];
    }
    if ('bundle' in candidate) {
      return [[candidate.caseId, bundleCandidateIds(candidate)] as const];
    }
    return [];
  }));
  const drafts = await readJsonl<BenchmarkGold>(options.draftPath);
  const decisions = new Map((options.decisionsPath
    ? await readJsonl<HumanDecision>(options.decisionsPath)
    : []).map((decision) => [decision.caseId, decision]));
  const frozen: BenchmarkGold[] = [];
  const unresolved: string[] = [];

  for (const draft of drafts) {
    const benchmarkCase = cases.get(draft.caseId);
    if (!benchmarkCase) {
      unresolved.push(`${draft.caseId}:missing-ready-case`);
      continue;
    }
    const decision = decisions.get(draft.caseId);
    if (decision?.action === 'exclude') continue;
    let selected = decision?.action === 'replace' ? decision.replacement : draft;
    if (!selected) {
      unresolved.push(`${draft.caseId}:missing-replacement`);
      continue;
    }
    const automaticallyAccepted = draft.annotationStatus === 'draft' && !draft.needsHumanReview;
    if (!automaticallyAccepted && decision?.action !== 'accept' && decision?.action !== 'replace') {
      unresolved.push(`${draft.caseId}:human-decision-required`);
      continue;
    }
    const allowed = benchmarkCase;
    const invalid = [...selected.rootCauseAnchors, ...selected.diagnosticAnchors]
      .filter((id) => !allowed.has(id));
    if (!selected.rootCauseAnchors.length || !selected.diagnosticAnchors.length || invalid.length) {
      unresolved.push(`${draft.caseId}:invalid-frozen-anchors${invalid.length ? ':' + invalid.join(';') : ''}`);
      continue;
    }
    selected = {
      ...selected,
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      caseId: draft.caseId,
      annotationStatus: 'frozen',
      needsHumanReview: false,
    };
    frozen.push(selected);
  }
  await writeJsonl(options.outputPath, frozen);
  return { frozen, unresolved };
}

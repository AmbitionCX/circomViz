import { promises as fs } from 'fs';
import path from 'path';
import type {
  AnnotationInput,
  BenchmarkConfigFile,
  BenchmarkGold,
  BenchmarkModelConfig,
  BenchmarkProjection,
} from './types.js';
import { BENCHMARK_SCHEMA_VERSION } from './types.js';
import {
  buildCriticPayload,
  normalizeAnnotation,
  reviewCallMetadata,
  validateAnnotation,
} from './annotator.js';
import type { ReviewRow } from './annotator.js';
import { callConfiguredModel, parseStructuredOutput } from './modelClient.js';
import { appendJsonl, readJsonFile, readJsonl, sha256, writeJsonl } from './io.js';
import { modelConfigHash } from './runner.js';
import { filterAnnotationInputByProjection } from './projection.js';

type UnknownRecord = Record<string, unknown>;

export interface AnnotationRevisionHistoryRow {
  schemaVersion: number;
  caseId: string;
  round: number;
  revisionHash: string;
  sourceReviewHash: string;
  inputHash: string;
  projectionHash?: string;
  revisionPromptHash: string;
  criticPromptHash: string;
  annotatorConfigHash: string;
  criticConfigHash: string;
  feedback: {
    criticVerdict: ReviewRow['criticVerdict'];
    criticReasons: string[];
    validationErrors: string[];
  };
  annotatorRaw?: string;
  criticRaw?: string;
  annotatorResponse: ReviewRow['annotatorResponse'];
  criticResponse?: ReviewRow['criticResponse'];
  gold: BenchmarkGold;
  review: ReviewRow;
  status: 'accepted' | 'wrapper-review' | 'continue' | 'exhausted' | 'call-failed';
  completed: boolean;
}

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean)
    : [];
}

function criticReasons(review: ReviewRow): string[] {
  if (!review.criticRaw) return [];
  try {
    return strings(record(parseStructuredOutput(review.criticRaw)).reasons);
  } catch {
    return [];
  }
}

function fixableErrors(errors: string[]): string[] {
  return errors.filter((error) => error !== 'wrapper-mapping-review-required');
}

function requiresRevision(review: ReviewRow): boolean {
  return review.criticVerdict !== 'accept' || fixableErrors(review.validationErrors).length > 0;
}

function selectedModel(config: BenchmarkConfigFile, id: string): BenchmarkModelConfig {
  const selected = config.models.find((candidate) => candidate.id === id);
  if (!selected) throw new Error(`Unknown model id: ${id}`);
  return selected;
}

function criticVerdict(response: Awaited<ReturnType<typeof callConfiguredModel>>): ReviewRow['criticVerdict'] {
  const verdict = String(record(response.parsed).verdict ?? '').trim().toLowerCase();
  return response.success && ['accept', 'revise', 'reject'].includes(verdict)
    ? verdict as 'accept' | 'revise' | 'reject'
    : 'invalid';
}

function revisionFeedback(review: ReviewRow): AnnotationRevisionHistoryRow['feedback'] {
  return {
    criticVerdict: review.criticVerdict,
    criticReasons: criticReasons(review),
    validationErrors: fixableErrors(review.validationErrors),
  };
}

function revisionPayload(
  input: AnnotationInput,
  gold: BenchmarkGold,
  feedback: AnnotationRevisionHistoryRow['feedback'],
): Record<string, unknown> {
  return {
    caseId: input.caseId,
    knownVulnerability: input.vulnerabilityDescription,
    vulnerableSource: input.vulnerableSource,
    fixDiff: input.fixDiff,
    auditEvidence: input.auditEvidence,
    candidates: {
      sourceNodes: input.candidates.sourceNodes,
      sourceEdges: input.candidates.sourceEdges,
      r1csNodes: [],
    },
    proposedAnnotation: gold,
    criticFeedback: {
      verdict: feedback.criticVerdict,
      reasons: feedback.criticReasons,
    },
    deterministicValidationErrors: feedback.validationErrors,
  };
}

function finalReview(options: {
  input: AnnotationInput;
  gold: BenchmarkGold;
  annotator: BenchmarkModelConfig;
  critic: BenchmarkModelConfig;
  annotatorResponse: Awaited<ReturnType<typeof callConfiguredModel>>;
  criticResponse?: Awaited<ReturnType<typeof callConfiguredModel>>;
  verdict: ReviewRow['criticVerdict'];
  validationErrors: string[];
  revisionPromptHash: string;
  criticPromptHash: string;
  revisionCount: number;
  sourceReviewHash: string;
}): ReviewRow {
  const errors = [
    ...options.validationErrors,
    ...(options.input.mappingReviewRequired ? ['wrapper-mapping-review-required'] : []),
    ...(!options.annotatorResponse.success
      ? [options.annotatorResponse.error ?? 'revision-annotation-call-failed']
      : []),
    ...(options.criticResponse && !options.criticResponse.success
      ? [options.criticResponse.error ?? 'revision-critic-call-failed']
      : []),
  ];
  const needsHumanReview = options.gold.needsHumanReview
    || errors.length > 0
    || options.verdict !== 'accept';
  return {
    caseId: options.input.caseId,
    annotatorModel: options.annotator.id,
    criticModel: options.critic.id,
    annotatorRaw: options.annotatorResponse.raw,
    criticRaw: options.criticResponse?.raw,
    annotatorResponse: reviewCallMetadata(options.annotatorResponse),
    criticResponse: options.criticResponse ? reviewCallMetadata(options.criticResponse) : undefined,
    criticVerdict: options.verdict,
    validationErrors: [...new Set(errors)],
    needsHumanReview,
    inputHash: sha256(options.input),
    annotationPromptHash: options.revisionPromptHash,
    criticPromptHash: options.criticPromptHash,
    annotatorConfigHash: modelConfigHash(options.annotator),
    criticConfigHash: modelConfigHash(options.critic),
    projectionHash: options.input.projectionHash,
    revisionCount: options.revisionCount,
    sourceReviewHash: options.sourceReviewHash,
  };
}

function revisedGold(gold: BenchmarkGold, review: ReviewRow): BenchmarkGold {
  return {
    ...gold,
    annotationStatus: review.needsHumanReview ? 'review-required' : 'draft',
    needsHumanReview: review.needsHumanReview,
  };
}

export async function refineAnnotations(options: {
  inputsPath: string;
  projectionPath: string;
  draftPath: string;
  reviewPath: string;
  configPath: string;
  promptDir: string;
  annotatorId: string;
  criticId: string;
  rounds: number;
  goldOutputPath: string;
  reviewOutputPath: string;
  historyPath: string;
}): Promise<{
  gold: BenchmarkGold[];
  reviews: ReviewRow[];
  revisedCases: number;
  acceptedAfterRevision: number;
  reviewRequired: number;
}> {
  const rounds = Math.max(1, Math.floor(options.rounds));
  const rawInputs = await readJsonl<AnnotationInput>(options.inputsPath);
  const projections = new Map((await readJsonl<BenchmarkProjection>(options.projectionPath))
    .map((projection) => [projection.caseId, projection]));
  const inputs = rawInputs.map((input) => {
    const projection = projections.get(input.caseId);
    if (!projection) throw new Error(`Missing projection for refinement case ${input.caseId}`);
    if (projection.hardExcluded) throw new Error(`Hard-excluded case remains in refinement input: ${input.caseId}`);
    return filterAnnotationInputByProjection(input, projection);
  });
  const drafts = new Map((await readJsonl<BenchmarkGold>(options.draftPath)).map((draft) => [draft.caseId, draft]));
  const baseReviews = new Map((await readJsonl<ReviewRow>(options.reviewPath)).map((review) => [review.caseId, review]));
  if (drafts.size !== inputs.length || baseReviews.size !== inputs.length) {
    throw new Error(`Refinement inputs are incomplete: inputs=${inputs.length}, drafts=${drafts.size}, reviews=${baseReviews.size}`);
  }

  const config = await readJsonFile<BenchmarkConfigFile>(options.configPath);
  const annotator = selectedModel(config, options.annotatorId);
  const critic = selectedModel(config, options.criticId);
  if (annotator.id === critic.id || (annotator.provider === critic.provider && annotator.model === critic.model)) {
    throw new Error('Refinement annotator and critic must use different underlying models');
  }
  const revisionPrompt = (await fs.readFile(path.join(options.promptDir, 'annotation-revision-v1.txt'), 'utf8')).trim();
  const criticPrompt = (await fs.readFile(path.join(options.promptDir, 'critic-v1.txt'), 'utf8')).trim();
  const revisionPromptHash = sha256(revisionPrompt);
  const criticPromptHash = sha256(criticPrompt);
  const annotatorConfigHash = modelConfigHash(annotator);
  const criticConfigHash = modelConfigHash(critic);
  const history = await readJsonl<AnnotationRevisionHistoryRow>(options.historyPath);
  const reusableHistory = new Map(history
    .filter((row) => row.completed)
    .map((row) => [`${row.caseId}\u0000${row.round}\u0000${row.revisionHash}`, row]));

  const unchangedGold: BenchmarkGold[] = [];
  const unchangedReviews: ReviewRow[] = [];
  const pending: AnnotationInput[] = [];
  for (const input of inputs) {
    const draft = drafts.get(input.caseId);
    const review = baseReviews.get(input.caseId);
    if (!draft || !review) throw new Error(`Missing draft or review for ${input.caseId}`);
    if (requiresRevision(review)) pending.push(input);
    else {
      unchangedGold.push(draft);
      unchangedReviews.push(review);
    }
  }
  await writeJsonl(options.goldOutputPath, unchangedGold);
  await writeJsonl(options.reviewOutputPath, unchangedReviews);

  const finalGold = [...unchangedGold];
  const finalReviews = [...unchangedReviews];
  let acceptedAfterRevision = 0;
  for (const input of pending) {
    let currentGold = drafts.get(input.caseId)!;
    let currentReview = baseReviews.get(input.caseId)!;
    const sourceReviewHash = sha256(currentReview);
    for (let round = 1; round <= rounds; round += 1) {
      const feedback = revisionFeedback(currentReview);
      const revisionHash = sha256({
        caseId: input.caseId,
        round,
        inputHash: sha256(input),
        projectionHash: input.projectionHash,
        currentGold,
        feedback,
        revisionPromptHash,
        criticPromptHash,
        annotatorConfigHash,
        criticConfigHash,
      });
      const cached = reusableHistory.get(`${input.caseId}\u0000${round}\u0000${revisionHash}`);
      if (cached) {
        currentGold = cached.gold;
        currentReview = cached.review;
        if (cached.status !== 'continue') break;
        continue;
      }

      const annotationResponse = await callConfiguredModel({
        config: annotator,
        systemPrompt: revisionPrompt,
        userMessage: JSON.stringify(revisionPayload(input, currentGold, feedback)),
      });
      if (!annotationResponse.success) {
        currentReview = finalReview({
          input,
          gold: currentGold,
          annotator,
          critic,
          annotatorResponse: annotationResponse,
          verdict: 'invalid',
          validationErrors: feedback.validationErrors,
          revisionPromptHash,
          criticPromptHash,
          revisionCount: round,
          sourceReviewHash,
        });
        currentGold = revisedGold(currentGold, currentReview);
        await appendJsonl(options.historyPath, {
          schemaVersion: BENCHMARK_SCHEMA_VERSION,
          caseId: input.caseId,
          round,
          revisionHash,
          sourceReviewHash,
          inputHash: sha256(input),
          projectionHash: input.projectionHash,
          revisionPromptHash,
          criticPromptHash,
          annotatorConfigHash,
          criticConfigHash,
          feedback,
          annotatorRaw: annotationResponse.raw,
          annotatorResponse: reviewCallMetadata(annotationResponse),
          gold: currentGold,
          review: currentReview,
          status: 'call-failed',
          completed: false,
        } satisfies AnnotationRevisionHistoryRow);
        break;
      }

      let proposedGold = normalizeAnnotation(input, annotationResponse.parsed);
      const validationErrors = validateAnnotation(input, proposedGold);
      const criticResponse = await callConfiguredModel({
        config: critic,
        systemPrompt: criticPrompt,
        userMessage: JSON.stringify(buildCriticPayload(input, proposedGold)),
      });
      const verdict = criticVerdict(criticResponse);
      currentReview = finalReview({
        input,
        gold: proposedGold,
        annotator,
        critic,
        annotatorResponse: annotationResponse,
        criticResponse,
        verdict,
        validationErrors,
        revisionPromptHash,
        criticPromptHash,
        revisionCount: round,
        sourceReviewHash,
      });
      proposedGold = revisedGold(proposedGold, currentReview);
      currentGold = proposedGold;
      const semanticAccepted = verdict === 'accept' && fixableErrors(currentReview.validationErrors).length === 0;
      const status: AnnotationRevisionHistoryRow['status'] = !criticResponse.success
        ? 'call-failed'
        : semanticAccepted
          ? currentReview.validationErrors.includes('wrapper-mapping-review-required') || currentGold.needsHumanReview
            ? 'wrapper-review'
            : 'accepted'
          : round === rounds ? 'exhausted' : 'continue';
      await appendJsonl(options.historyPath, {
        schemaVersion: BENCHMARK_SCHEMA_VERSION,
        caseId: input.caseId,
        round,
        revisionHash,
        sourceReviewHash,
        inputHash: sha256(input),
        projectionHash: input.projectionHash,
        revisionPromptHash,
        criticPromptHash,
        annotatorConfigHash,
        criticConfigHash,
        feedback,
        annotatorRaw: annotationResponse.raw,
        criticRaw: criticResponse.raw,
        annotatorResponse: reviewCallMetadata(annotationResponse),
        criticResponse: reviewCallMetadata(criticResponse),
        gold: currentGold,
        review: currentReview,
        status,
        completed: annotationResponse.success && criticResponse.success,
      } satisfies AnnotationRevisionHistoryRow);
      if (status !== 'continue') break;
    }
    if (!currentGold.needsHumanReview) acceptedAfterRevision += 1;
    finalGold.push(currentGold);
    finalReviews.push(currentReview);
    await appendJsonl(options.goldOutputPath, currentGold);
    await appendJsonl(options.reviewOutputPath, currentReview);
  }
  return {
    gold: finalGold,
    reviews: finalReviews,
    revisedCases: pending.length,
    acceptedAfterRevision,
    reviewRequired: finalGold.filter((gold) => gold.needsHumanReview).length,
  };
}

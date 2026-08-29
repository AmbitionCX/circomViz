import { promises as fs } from 'fs';
import path from 'path';
import type {
  AnnotationInput,
  BenchmarkCase,
  BenchmarkConfigFile,
  BenchmarkGold,
  BenchmarkModelConfig,
} from './types.js';
import { callConfiguredModel } from './modelClient.js';
import { appendJsonl, readJsonFile, readJsonl, sha256, writeJsonl } from './io.js';
import { modelConfigHash } from './runner.js';
import { reviewCallMetadata } from './annotator.js';
import type { ReviewCallMetadata } from './annotator.js';

type UnknownRecord = Record<string, unknown>;

export interface IntentRewriteRow {
  caseId: string;
  previousIntent: string;
  proposedIntent: string;
  annotatorModel: string;
  criticModel: string;
  annotatorRaw?: string;
  criticRaw?: string;
  annotatorResponse: ReviewCallMetadata;
  criticResponse: ReviewCallMetadata;
  criticVerdict: 'accept' | 'reject' | 'invalid';
  leakedPhrases: string[];
  leakTypes: string[];
  validationErrors: string[];
  accepted: boolean;
  rewriteHash: string;
}

const MECHANISM_PATTERNS: Array<[string, RegExp]> = [
  ['constraint-mechanism', /\b(?:constraint|constraints|constrained|constraining|under[- ]?constrained|unconstrained)\b/i],
  ['range-mechanism', /\b(?:range[- ]?check(?:ed|ing)?|bit[- ]?length|bit[- ]?width|out[- ]?of[- ]?range|overflow|underflow|alias(?:ing)?)\b/i],
  ['boolean-mechanism', /\b(?:binary representation|bit decomposition|booleanity|non[- ]?binary)\b/i],
  ['division-mechanism', /\b(?:division by zero|zero divisor|non[- ]?zero divisor|remainder|modulus|modular reduction)\b/i],
  ['implementation-mechanism', /\b(?:witness|prover|signal|signals|wire|wires|circuit|module|modules|(?:(?:the|this|a|an|circuit|affected|target)\s+components?|components?\s+(?:enforces?|produces?|computes?|validates?|accepts?|rejects?|returns?|outputs?))|template|templates|num2bits|bits2num|less[- ]?than comparator|comparator input|auxiliary variable|auxiliary variables|degrees? of freedom|internal assignment|internal assignments|alternative assignment|alternative assignments)\b/i],
  ['representation-mechanism', /\b(?:field element|field elements|field modulus|scalar field|coordinate limb|coordinate limbs|multi[- ]?limb|packing operation|packing operations)\b/i],
  ['fix-mechanism', /\b(?:add(?:ed|ing)? (?:a |the )?constraint|introduc(?:e|ed|ing) (?:a |the )?check|known fix|fix diff|patched by)\b/i],
  ['attack-mechanism', /\b(?:replay attack|bypass(?:ing)? (?:the )?check|fake proof|forg(?:e|ed|ing) (?:a )?proof)\b/i],
  ['underconstraint-clue', /\b(?:deterministic(?:ally)?|uniquely? (?:determined|derived|bound)|arbitrary|unverified values?|strictly bound|internal state transitions?|single,? (?:[a-z]+,?\s+){0,2}(?:result|output)|(?:unique|unambiguous|well[- ]defined)(?: and [a-z]+)? (?:result|output|representation)|consistent(?:ly)?(?: and (?:valid|correct|reliable|well[- ]defined))? (?:normalized )?(?:output|outputs|result|results|values|digest)|(?:valid|correct|reliable|well[- ]defined|accurate) and consistent (?:normalized )?(?:output|outputs|result|results|values|digest))\b/i],
  ['numeric-edge-clue', /\b(?:range validation|numerical bounds?|numeric(?:al)? boundary|boundary conditions?|value boundaries|value limits|outside (?:the )?expected range|exceeds? (?:the )?(?:declared|intended|maximum|specified) (?:boundary|depth|limit)|maximum allowed depth|input lengths?|declared length|out[- ]of[- ]domain|expected cryptographic domain|non[- ]identity inputs?|non[- ]negative|non[- ]zero)\b/i],
  ['representation-clue', /\b(?:scalar decomposition|arithmetic transformation|constituent parts?|underlying data (?:is )?encoded|lookup table values?)\b/i],
  ['input-shape-clue', /\b(?:structurally valid|structural and numerical validity|invalid path selections?)\b/i],
  ['attack-clue', /\b(?:trivially bypass(?:ing)?|core arithmetic operations?|state corruption|fund lockouts?)\b/i],
];

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim()).filter(Boolean))]
    : [];
}

export function normalizeOutcomeOnlyIntent(intentValue: string): string {
  const intent = intentValue.trim();
  return intent
    .replace(/(?:only\s+)?the data within the declared length/gi, 'the intended content')
    .replace(/\bsingle,?\s+(?:[a-z]+,?\s+){0,2}(result|output)\b/gi, 'correct $1')
    .replace(/\b(?:valid,\s*)?(?:unique|unambiguous|well[- ]defined)(?: and [a-z]+)?\s+(result|output)\b/gi, 'correct $1')
    .replace(/,\s*(?:ensuring|preventing|without|so that|regardless of|regardless how)\b[^.!?]*[.!?]?$/i, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function model(config: BenchmarkConfigFile, id: string): BenchmarkModelConfig {
  const found = config.models.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown model id: ${id}`);
  return found;
}

function candidateTerms(input: AnnotationInput): string[] {
  const proseStopWords = new Set([
    'and', 'or', 'not', 'add', 'sub', 'mul', 'div', 'input', 'output', 'value', 'result',
    'state', 'data', 'key', 'hash', 'root', 'left', 'right', 'main',
  ]);
  const explicit = (input.forbiddenIntentTerms ?? []).map((value) => value.trim());
  const candidateValues = [
    ...input.candidates.sourceNodes.flatMap((candidate) => [candidate.id, candidate.label]),
    ...input.candidates.sourceEdges.flatMap((candidate) => [candidate.id, candidate.label]),
  ].filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length >= 3 && !proseStopWords.has(value.toLowerCase()) && (
      /[.:/\[\]$]/.test(value)
      || /[a-z][A-Z]/.test(value)
      || /^[A-Z][A-Za-z0-9_]+$/.test(value)
    ));
  return [...new Set([...explicit, ...candidateValues]
    .filter((value) => value.length >= 3 && /[a-z]/i.test(value)))];
}

function containsTerm(intent: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9_])${escaped}($|[^a-z0-9_])`, 'i').test(intent);
}

export function validateOutcomeOnlyIntent(input: AnnotationInput, intentValue: string): string[] {
  const intent = intentValue.trim();
  const errors: string[] = [];
  if (!intent) return ['missing-intent'];
  if (intent.length > 280) errors.push('intent-too-long');
  if (intent.split(/[.!?]+/).filter((part) => part.trim()).length > 2) errors.push('intent-too-many-sentences');
  if (/\b(?:line|lines)\s+\d+\b|:\d+(?::\d+)?\b/i.test(intent)) errors.push('source-line-reference');
  for (const [kind, pattern] of MECHANISM_PATTERNS) {
    const match = intent.match(pattern);
    if (match) errors.push(`${kind}:${match[0].toLowerCase()}`);
  }
  for (const term of candidateTerms(input)) {
    if (containsTerm(intent, term)) errors.push(`identifier-leak:${term}`);
  }
  return [...new Set(errors)];
}

async function rewriteOne(options: {
  input: AnnotationInput;
  previousIntent: string;
  annotator: BenchmarkModelConfig;
  critic: BenchmarkModelConfig;
  rewritePrompt: string;
  criticPrompt: string;
  rewriteHash: string;
  retryFeedback?: IntentRewriteRow;
}): Promise<IntentRewriteRow> {
  const candidateIdentifiers = candidateTerms(options.input);
  let annotatorResponse: Awaited<ReturnType<typeof callConfiguredModel>> | undefined;
  let proposedIntent = '';
  let validationErrors: string[] = [];
  let rejectedProposal = options.retryFeedback?.proposedIntent;
  let rejectionErrors = options.retryFeedback?.validationErrors ?? [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    annotatorResponse = await callConfiguredModel({
      config: options.annotator,
      systemPrompt: options.rewritePrompt,
      userMessage: JSON.stringify({
        caseId: options.input.caseId,
        knownVulnerability: options.input.vulnerabilityDescription,
        vulnerableSource: options.input.vulnerableSource,
        fixDiff: options.input.fixDiff,
        auditEvidence: options.input.auditEvidence,
        previousIntent: options.previousIntent,
        forbiddenIdentifiers: candidateIdentifiers,
        previousRejectedProposal: rejectedProposal,
        previousRejectionFeedback: rejectedProposal ? {
          deterministicErrors: rejectionErrors,
          leakedPhrases: attempt === 0 ? options.retryFeedback?.leakedPhrases : [],
          leakTypes: attempt === 0 ? options.retryFeedback?.leakTypes : [],
        } : undefined,
        bannedPhrases: rejectionErrors
          .map((error) => error.includes(':') ? error.slice(error.indexOf(':') + 1) : error)
          .filter(Boolean),
        retryInstruction: rejectedProposal
          ? 'The previous proposal was rejected. Do not reuse it or any banned phrase. Replace it with a substantially more abstract stakeholder-visible outcome. Do not describe arithmetic, representation, internal computation, determinism, constraints, numerical bounds, input length, fields, witnesses, or the triggering edge case.'
          : undefined,
      }),
    });
    proposedIntent = normalizeOutcomeOnlyIntent(
      text(record(annotatorResponse.parsed).canonical_intent),
    );
    validationErrors = validateOutcomeOnlyIntent(options.input, proposedIntent);
    if (!annotatorResponse.success || validationErrors.length === 0) break;
    rejectedProposal = proposedIntent;
    rejectionErrors = validationErrors;
  }
  if (!annotatorResponse) throw new Error(`Intent annotator did not run for ${options.input.caseId}`);
  const criticResponse = await callConfiguredModel({
    config: options.critic,
    systemPrompt: options.criticPrompt,
    userMessage: JSON.stringify({
      caseId: options.input.caseId,
      knownVulnerability: options.input.vulnerabilityDescription,
      vulnerableSource: options.input.vulnerableSource,
      fixDiff: options.input.fixDiff,
      candidateIdentifiers,
      proposedIntent,
      deterministicValidationErrors: validationErrors,
    }),
  });
  const criticValue = record(criticResponse.parsed);
  const verdict = text(criticValue.verdict).toLowerCase();
  const criticVerdict = criticResponse.success && (verdict === 'accept' || verdict === 'reject')
    ? verdict as 'accept' | 'reject'
    : 'invalid';
  const leakedPhrases = strings(criticValue.leaked_phrases);
  const leakTypes = strings(criticValue.leak_types);
  const accepted = annotatorResponse.success
    && criticResponse.success
    && criticVerdict === 'accept'
    && validationErrors.length === 0
    && leakedPhrases.length === 0
    && leakTypes.length === 0;
  return {
    caseId: options.input.caseId,
    previousIntent: options.previousIntent,
    proposedIntent,
    annotatorModel: options.annotator.id,
    criticModel: options.critic.id,
    annotatorRaw: annotatorResponse.raw,
    criticRaw: criticResponse.raw,
    annotatorResponse: reviewCallMetadata(annotatorResponse),
    criticResponse: reviewCallMetadata(criticResponse),
    criticVerdict,
    leakedPhrases,
    leakTypes,
    validationErrors: [
      ...validationErrors,
      ...(!annotatorResponse.success ? [annotatorResponse.error ?? 'annotator-call-failed'] : []),
      ...(!criticResponse.success ? [criticResponse.error ?? 'critic-call-failed'] : []),
    ],
    accepted,
    rewriteHash: options.rewriteHash,
  };
}

export async function sanitizeBenchmarkIntents(options: {
  inputsPath: string;
  goldPath: string;
  casesPath: string;
  configPath: string;
  promptDir: string;
  annotatorId: string;
  criticId: string;
  outputPath: string;
  apply: boolean;
}): Promise<{ accepted: number; rejected: number; applied: boolean }> {
  if (options.annotatorId === options.criticId) throw new Error('Intent annotator and critic must differ');
  const [inputs, goldRows, caseRows, config] = await Promise.all([
    readJsonl<AnnotationInput>(options.inputsPath),
    readJsonl<BenchmarkGold>(options.goldPath),
    readJsonl<BenchmarkCase>(options.casesPath),
    readJsonFile<BenchmarkConfigFile>(options.configPath),
  ]);
  const goldByCase = new Map(goldRows.map((entry) => [entry.caseId, entry]));
  const annotator = model(config, options.annotatorId);
  const critic = model(config, options.criticId);
  if (annotator.provider === critic.provider && annotator.model === critic.model) {
    throw new Error('Intent annotator and critic must use different underlying models');
  }
  const [rewritePrompt, criticPrompt] = await Promise.all([
    fs.readFile(path.join(options.promptDir, 'intent-rewrite-v1.txt'), 'utf8'),
    fs.readFile(path.join(options.promptDir, 'intent-critic-v1.txt'), 'utf8'),
  ]);
  const annotatorHash = modelConfigHash(annotator);
  const criticHash = modelConfigHash(critic);
  const existing = new Map((await readJsonl<IntentRewriteRow>(options.outputPath))
    .map((entry) => [entry.caseId, entry]));
  const rows: IntentRewriteRow[] = [];
  const pending: Array<{
    input: AnnotationInput;
    previousIntent: string;
    rewriteHash: string;
    retryFeedback?: IntentRewriteRow;
  }> = [];
  for (const input of inputs) {
    const previousIntent = goldByCase.get(input.caseId)?.canonicalIntent;
    if (!previousIntent) throw new Error(`Missing frozen gold intent for ${input.caseId}`);
    const rewriteHash = sha256({
      input,
      previousIntent,
      rewritePrompt,
      criticPrompt,
      annotatorHash,
      criticHash,
    });
    const prior = existing.get(input.caseId);
    const normalizedPrior = prior ? {
      ...prior,
      proposedIntent: normalizeOutcomeOnlyIntent(prior.proposedIntent),
    } : undefined;
    const normalizedErrors = normalizedPrior
      ? validateOutcomeOnlyIntent(input, normalizedPrior.proposedIntent)
      : ['missing-prior'];
    if (normalizedPrior?.accepted
      && normalizedPrior.rewriteHash === rewriteHash
      && normalizedErrors.length === 0) {
      rows.push({ ...normalizedPrior, validationErrors: [] });
    } else {
      pending.push({ input, previousIntent, rewriteHash, retryFeedback: prior });
    }
  }
  await writeJsonl(options.outputPath, rows);
  for (const item of pending) {
    const row = await rewriteOne({
      ...item,
      annotator,
      critic,
      rewritePrompt: rewritePrompt.trim(),
      criticPrompt: criticPrompt.trim(),
    });
    rows.push(row);
    await appendJsonl(options.outputPath, row);
  }
  const acceptedRows = rows.filter((row) => row.accepted);
  const rejected = rows.length - acceptedRows.length;
  if (options.apply) {
    if (rows.length !== inputs.length || rejected) {
      throw new Error(`Intent rewrite is not fully accepted: accepted=${acceptedRows.length}, rejected=${rejected}`);
    }
    const intents = new Map(acceptedRows.map((row) => [row.caseId, row.proposedIntent]));
    if (goldRows.some((entry) => !intents.has(entry.caseId)) || caseRows.some((entry) => !intents.has(entry.caseId))) {
      throw new Error('Intent rewrite does not cover every frozen gold and ready case row');
    }
    await writeJsonl(options.goldPath, goldRows.map((entry) => ({
      ...entry,
      canonicalIntent: intents.get(entry.caseId)!,
    })));
    await writeJsonl(options.casesPath, caseRows.map((entry) => entry.status === 'ready' ? ({
      ...entry,
      canonicalIntent: intents.get(entry.caseId)!,
    }) : entry));
  }
  return { accepted: acceptedRows.length, rejected, applied: options.apply && rejected === 0 };
}

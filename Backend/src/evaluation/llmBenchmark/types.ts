import type { IssueCard } from '../../types/partialDebugging.js';

export const BENCHMARK_SCHEMA_VERSION = 2;

export type BenchmarkTrack =
  | 'direct-neutral'
  | 'direct-intent'
  | 'system-neutral'
  | 'system-intent';

export const BENCHMARK_TRACKS: BenchmarkTrack[] = [
  'direct-neutral',
  'direct-intent',
  'system-neutral',
  'system-intent',
];

export const NEUTRAL_INTENT = 'Identify localized behavior that may not be sufficiently enforced.';

export interface SerializedAnchorCatalog {
  sourceNodes: Array<Record<string, unknown>>;
  sourceEdges: Array<Record<string, unknown>>;
  r1csNodes: Array<Record<string, unknown>>;
}

export interface BenchmarkCaseMetadata {
  schemaVersion: number;
  caseId: string;
  project: string;
  projectCommit: string;
  bugFamily: string;
  vulnerableFile: string;
  vulnerableLines: string;
  selectedTemplate: string;
  split?: 'development' | 'test';
  dedupGroupId?: string;
}

export interface PendingBenchmarkCase extends BenchmarkCaseMetadata {
  status: 'pending-bundle';
  directEntrypoint: string;
  codebasePath: string;
  configPath: string;
  inventorySelection: 'metadata-selected' | 'reserve';
  selectionPriority: number;
  pendingReason: string;
}

export interface ReadyBenchmarkCase extends BenchmarkCaseMetadata {
  status: 'ready';
  canonicalIntent: string;
  directContext: {
    templateName: string;
    originCode: string;
    parentInterface?: string;
    candidates: SerializedAnchorCatalog;
  };
  systemContext: {
    templateName: string;
    promptPayload: Record<string, unknown>;
    candidates: SerializedAnchorCatalog;
    detectorIssues: IssueCard[];
  };
  bundleHash: string;
  projectionHash?: string;
}

export type BenchmarkCase = PendingBenchmarkCase | ReadyBenchmarkCase;

export interface BenchmarkGold {
  schemaVersion: number;
  caseId: string;
  rootCauseAnchors: string[];
  diagnosticAnchors: string[];
  acceptableIssueKinds?: string[];
  canonicalIntent: string;
  evidence: Array<{
    candidateId: string;
    sourceLines?: string;
    fixLines?: string;
    justification: string;
  }>;
  annotationStatus: 'draft' | 'review-required' | 'frozen';
  needsHumanReview: boolean;
}

export interface AnnotationInput {
  caseId: string;
  vulnerabilityDescription: string;
  vulnerableSource: string;
  fixDiff?: string;
  auditEvidence?: string;
  candidates: SerializedAnchorCatalog;
  forbiddenIntentTerms?: string[];
  mappingReviewRequired?: boolean;
  projectionHash?: string;
}

export interface BenchmarkProjection {
  schemaVersion: number;
  projectionVersion: 'r1cs-token-budget-v2';
  caseId: string;
  bundleHash: string;
  maxInputTokens: number;
  originalR1csCount: number;
  retainedR1csIds: string[];
  hardExcluded: boolean;
  hardExclusionReason?: 'direct-context-overflow' | 'fixed-system-context-overflow';
  tokenCounts: Partial<Record<BenchmarkTrack | 'annotation', number>>;
  projectionHash: string;
}

export interface BuiltBundleCase extends BenchmarkCaseMetadata {
  directEntrypoint: string;
  codebasePath: string;
  configPath: string;
  viewTemplate: string;
  mappingMode: 'direct-vulnerable-template' | 'located-vulnerable-template' | 'isolated-direct-wrapper';
  mappingReviewRequired: boolean;
  parentInterface?: string;
  bundle: import('../../types/partialDebugging.js').PartialDebuggingGraphBundle;
}

export interface BenchmarkModelConfig {
  id: string;
  benchmark?: boolean;
  provider: string;
  model: string;
  apiStyle: 'openai-chat-completions';
  apiUrl: string;
  apiKeyEnv?: string;
  temperature?: number;
  maxTokens?: number;
  thinking?: 'enabled' | 'disabled';
  thinkingTransport?: 'thinking-object' | 'qwen-chat-template';
  timeoutMs?: number;
  maxRetries?: number;
  concurrency?: number;
  contextWindowTokens?: number;
  contextSafetyTokens?: number;
  tokenizerApiUrl?: string;
}

export interface BenchmarkConfigFile {
  models: BenchmarkModelConfig[];
}

export interface BenchmarkPrediction {
  schemaVersion: number;
  predictionId: string;
  caseId: string;
  project: string;
  bugFamily: string;
  modelId: string;
  provider: string;
  model: string;
  experimentId: string;
  modelConfigHash: string;
  projectionHash?: string;
  requestConfig: {
    temperature: number;
    maxTokens: number;
    thinking?: 'enabled' | 'disabled';
    thinkingTransport?: 'thinking-object' | 'qwen-chat-template';
  };
  track: BenchmarkTrack;
  attempt: number;
  promptHash: string;
  payloadHash: string;
  startedAt: string;
  durationMs: number;
  success: boolean;
  rawOutput?: string;
  parsedOutput?: unknown;
  normalizedIssues: IssueCard[];
  detectorIssues: IssueCard[];
  mergedIssues: IssueCard[];
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  error?: string;
  finishReason?: string;
  reasoningObserved?: boolean;
  reasoningChars?: number;
  apiAttempts?: Array<{
    attempt: number;
    durationMs: number;
    success: boolean;
    httpStatus?: number;
    finishReason?: string;
    reasoningObserved?: boolean;
    reasoningChars?: number;
    contentChars?: number;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    error?: string;
  }>;
}

export interface PerPredictionScore {
  predictionId: string;
  experimentId: string;
  caseId: string;
  project: string;
  bugFamily: string;
  modelId: string;
  track: BenchmarkTrack;
  evaluationLayer: 'llm-only' | 'end-to-end';
  split: 'development' | 'test' | 'unspecified';
  attempt: number;
  success: boolean;
  validCandidateRate: number;
  hallucinatedCandidateRate: number;
  emptyResponse: number;
  rootHitAt1: number;
  rootHitAt3: number;
  rootHitAt8: number;
  diagnosticCoverageAt1: number;
  diagnosticCoverageAt3: number;
  diagnosticCoverageAt8: number;
  diagnosticPrecisionAt3: number;
  diagnosticRecallAt3: number;
  diagnosticF1At3: number;
  durationMs: number;
  totalTokens: number;
}

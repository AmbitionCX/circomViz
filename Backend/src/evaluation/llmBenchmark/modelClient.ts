import type { BenchmarkModelConfig } from './types.js';

export interface BenchmarkApiAttempt {
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
}

export interface BenchmarkModelResponse {
  success: boolean;
  raw?: string;
  parsed?: unknown;
  durationMs: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  error?: string;
  finishReason?: string;
  reasoningObserved?: boolean;
  reasoningChars?: number;
  attempts: BenchmarkApiAttempt[];
}

export const DEFAULT_MAX_TOKENS = 4_096;

export function effectiveRequestConfig(config: BenchmarkModelConfig): {
  temperature: number;
  maxTokens: number;
  thinking?: 'enabled' | 'disabled';
  thinkingTransport?: 'thinking-object' | 'qwen-chat-template';
} {
  return {
    temperature: config.temperature ?? 0.3,
    maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    ...(config.thinking ? { thinking: config.thinking } : {}),
    ...(config.thinking ? {
      thinkingTransport: config.thinkingTransport ?? 'thinking-object' as const,
    } : {}),
  };
}

export function parseStructuredOutput(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse((fenced ? fenced[1] : raw).trim());
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function retryDelay(attempt: number): Promise<void> {
  const delayMs = Math.min(4_000, 500 * 2 ** attempt);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function tokenUsage(body: any): BenchmarkModelResponse['usage'] {
  return body?.usage ? {
    promptTokens: body.usage.prompt_tokens,
    completionTokens: body.usage.completion_tokens,
    totalTokens: body.usage.total_tokens,
  } : undefined;
}

function reasoningMetadata(message: any): { reasoningObserved: boolean; reasoningChars: number } {
  const reasoning = message?.reasoning ?? message?.reasoning_content;
  if (reasoning === undefined || reasoning === null) return { reasoningObserved: false, reasoningChars: 0 };
  const serialized = typeof reasoning === 'string' ? reasoning : JSON.stringify(reasoning);
  return { reasoningObserved: Boolean(serialized.trim()), reasoningChars: serialized.length };
}

function thinkingPayload(config: BenchmarkModelConfig): Record<string, unknown> {
  if (!config.thinking) return {};
  if (config.thinkingTransport === 'qwen-chat-template') {
    return { chat_template_kwargs: { enable_thinking: config.thinking === 'enabled' } };
  }
  return { thinking: { type: config.thinking } };
}

export async function callConfiguredModel(options: {
  config: BenchmarkModelConfig;
  systemPrompt: string;
  userMessage: string;
}): Promise<BenchmarkModelResponse> {
  const { config } = options;
  const apiKey = config.apiKeyEnv ? process.env[config.apiKeyEnv] : undefined;
  if (config.apiKeyEnv && !apiKey) {
    return {
      success: false,
      durationMs: 0,
      error: `Missing API key environment variable: ${config.apiKeyEnv}`,
      attempts: [],
    };
  }

  const maxRetries = Math.max(0, config.maxRetries ?? 2);
  const requestConfig = effectiveRequestConfig(config);
  let lastError = 'Model request failed';
  let totalDuration = 0;
  const attempts: BenchmarkApiAttempt[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const startedAt = Date.now();
    let accountedDuration = 0;
    try {
      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: options.systemPrompt },
            { role: 'user', content: options.userMessage },
          ],
          stream: false,
          temperature: requestConfig.temperature,
          max_tokens: requestConfig.maxTokens,
          response_format: { type: 'json_object' },
          ...thinkingPayload(config),
        }),
        signal: AbortSignal.timeout(config.timeoutMs ?? 120_000),
      });
      const duration = Date.now() - startedAt;
      accountedDuration = duration;
      totalDuration += duration;
      if (!response.ok) {
        const errorText = (await response.text()).slice(0, 1_000);
        lastError = `LLM API returned ${response.status}: ${errorText}`;
        attempts.push({
          attempt: attempt + 1,
          durationMs: duration,
          success: false,
          httpStatus: response.status,
          error: lastError,
        });
        if (attempt < maxRetries && retryableStatus(response.status)) {
          await retryDelay(attempt);
          continue;
        }
        return { success: false, durationMs: totalDuration, error: lastError, attempts };
      }

      const body = await response.json() as any;
      const choice = body?.choices?.[0];
      const message = choice?.message;
      const raw = message?.content;
      const usage = tokenUsage(body);
      const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined;
      const reasoning = reasoningMetadata(message);
      if (config.thinking === 'disabled' && reasoning.reasoningObserved) {
        lastError = 'Thinking was configured as disabled, but the model returned reasoning content';
        attempts.push({
          attempt: attempt + 1,
          durationMs: duration,
          success: false,
          httpStatus: response.status,
          finishReason,
          ...reasoning,
          contentChars: typeof raw === 'string' ? raw.length : 0,
          usage,
          error: lastError,
        });
        if (attempt < maxRetries) {
          await retryDelay(attempt);
          continue;
        }
        return {
          success: false,
          raw: typeof raw === 'string' ? raw : undefined,
          durationMs: totalDuration,
          usage,
          error: lastError,
          finishReason,
          ...reasoning,
          attempts,
        };
      }
      if (typeof raw !== 'string' || !raw.trim()) {
        lastError = 'LLM API returned an empty or malformed completion';
        attempts.push({
          attempt: attempt + 1,
          durationMs: duration,
          success: false,
          httpStatus: response.status,
          finishReason,
          ...reasoning,
          contentChars: typeof raw === 'string' ? raw.length : 0,
          usage,
          error: lastError,
        });
        if (attempt < maxRetries) {
          await retryDelay(attempt);
          continue;
        }
        return {
          success: false,
          durationMs: totalDuration,
          usage,
          error: lastError,
          finishReason,
          ...reasoning,
          attempts,
        };
      }

      try {
        const parsed = parseStructuredOutput(raw);
        attempts.push({
          attempt: attempt + 1,
          durationMs: duration,
          success: true,
          httpStatus: response.status,
          finishReason,
          ...reasoning,
          contentChars: raw.length,
          usage,
        });
        return {
          success: true,
          raw,
          parsed,
          durationMs: totalDuration,
          usage,
          finishReason,
          ...reasoning,
          attempts,
        };
      } catch (error: any) {
        lastError = `Failed to parse model response as JSON: ${error.message}`;
        attempts.push({
          attempt: attempt + 1,
          durationMs: duration,
          success: false,
          httpStatus: response.status,
          finishReason,
          ...reasoning,
          contentChars: raw.length,
          usage,
          error: lastError,
        });
        if (attempt < maxRetries) {
          await retryDelay(attempt);
          continue;
        }
        return {
          success: false,
          raw,
          durationMs: totalDuration,
          usage,
          error: lastError,
          finishReason,
          ...reasoning,
          attempts,
        };
      }
    } catch (error: any) {
      const duration = Date.now() - startedAt;
      totalDuration += Math.max(0, duration - accountedDuration);
      lastError = `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`;
      attempts.push({
        attempt: attempt + 1,
        durationMs: duration,
        success: false,
        error: lastError,
      });
      if (attempt < maxRetries) {
        await retryDelay(attempt);
        continue;
      }
    }
  }

  return { success: false, durationMs: totalDuration, error: lastError, attempts };
}

import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const __rootname = path.dirname(path.dirname(path.dirname(__dirname)));
dotenv.config({ path: __rootname + '/.env' });

const LLM_API_URL = process.env.LLM_API_URL || '';
const LLM_API_TOKEN = process.env.LLM_API_TOKEN || '';
const LLM_MODEL = process.env.LLM_MODEL || 'glm-5-turbo';
const logger = new Logger('LLM');

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMSuccessResponse {
  success: true;
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface LLMErrorResponse {
  success: false;
  error: string;
}

export type LLMResult = LLMSuccessResponse | LLMErrorResponse;

export async function callLLM(systemPrompt: string, userMessage: string): Promise<LLMResult> {
  if (!LLM_API_URL) {
    return { success: false, error: 'LLM_API_URL is not configured in .env' };
  }
  if (!LLM_API_TOKEN || LLM_API_TOKEN === 'your_token_here') {
    return { success: false, error: 'LLM_API_TOKEN is not configured in .env' };
  }

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const payload = {
    model: LLM_MODEL,
    messages,
    stream: false,
    temperature: 0.3,
  };

  const startTime = Date.now();
  logger.info(`Request started: model=${LLM_MODEL}`);

  try {
    const response = await fetch(LLM_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LLM_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });

    const elapsed = Date.now() - startTime;
    logger.debug(`Response received: status=${response.status}, durationMs=${elapsed}`);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Request failed: status=${response.status}, durationMs=${elapsed}`);
      return {
        success: false,
        error: `LLM API returned ${response.status}: ${errorText}`,
      };
    }

    const data = await response.json() as any;

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      logger.error(`Malformed response: model=${LLM_MODEL}, durationMs=${elapsed}`);
      return {
        success: false,
        error: 'LLM API returned empty or malformed response',
      };
    }

    logger.info(`Request completed: model=${LLM_MODEL}, durationMs=${elapsed}, tokens=${data.usage?.total_tokens ?? 'unknown'}`);
    return {
      success: true,
      content,
      usage: data.usage
        ? {
            prompt_tokens: data.usage.prompt_tokens,
            completion_tokens: data.usage.completion_tokens,
            total_tokens: data.usage.total_tokens,
          }
        : undefined,
    };
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    logger.error(`Request failed: durationMs=${elapsed}, error=${error.name}: ${error.message}`);
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return { success: false, error: 'LLM request timed out (120s)' };
    }
    return { success: false, error: `LLM request failed: ${error.message}` };
  }
}

export async function callLLMStructured<T>(
  systemPrompt: string,
  userMessage: string
): Promise<{ success: true; data: T; raw: string } | { success: false; error: string; raw?: string }> {
  const result = await callLLM(systemPrompt, userMessage);
  if (!result.success) return result;

  const raw = result.content;

  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim();

  try {
    const data = JSON.parse(jsonStr) as T;
    return { success: true, data, raw };
  } catch {
    return {
      success: false,
      error: `Failed to parse LLM response as JSON: ${jsonStr.substring(0, 200)}...`,
      raw,
    };
  }
}

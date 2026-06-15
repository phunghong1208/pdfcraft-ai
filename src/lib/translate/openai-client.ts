import type { TokenUsage } from '@/lib/translate/types';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const DEFAULT_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || '120000');
const DEFAULT_MODEL =
  process.env.TRANSLATE_MODEL ||
  process.env.TRANSLATE_DOCS_MODEL ||
  'gpt-4.1-nano';

let cachedApiKey: string | null = null;

export function getOpenAiApiKey(): string {
  if (cachedApiKey) return cachedApiKey;
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error('Thiếu OPENAI_API_KEY trong biến môi trường.');
  }
  cachedApiKey = key;
  return key;
}

export function getDefaultTranslateModel(): string {
  return DEFAULT_MODEL;
}

function isReasoningModel(model: string): boolean {
  const m = model.toLowerCase();
  if (m.includes('nano') || m.includes('mini')) return false;
  return (
    m.startsWith('o1') ||
    m.startsWith('o3') ||
    m.startsWith('o4') ||
    m.includes('gpt-5')
  );
}

function parseUsage(raw: unknown): TokenUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const u = raw as Record<string, number>;
  const prompt = u.prompt_tokens ?? 0;
  const completion = u.completion_tokens ?? 0;
  const total = u.total_tokens ?? prompt + completion;
  return { prompt, completion, total };
}

export async function chatCompletion(options: {
  messages: ChatMessage[];
  model?: string;
  maxCompletionTokens?: number;
  timeoutMs?: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
}): Promise<{ content: string; usage?: TokenUsage }> {
  const model = options.model || getDefaultTranslateModel();
  const apiKey = getOpenAiApiKey();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const body: Record<string, unknown> = {
    model,
    messages: options.messages,
  };

  if (options.maxCompletionTokens) {
    body.max_completion_tokens = options.maxCompletionTokens;
  }

  if (isReasoningModel(model)) {
    const effort = options.reasoningEffort ?? (process.env.TRANSLATE_REASONING_EFFORT as 'low' | 'medium' | 'high' | undefined);
    if (effort) body.reasoning_effort = effort;
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const rawText = await res.text();
  if (!res.ok) {
    let detail = rawText.slice(0, 400);
    try {
      const json = JSON.parse(rawText) as { error?: { message?: string } };
      detail = json.error?.message || detail;
    } catch {
      // keep raw slice
    }
    throw new Error(`OpenAI API lỗi (${res.status}): ${detail}`);
  }

  let json: {
    choices?: { message?: { content?: string | null } }[];
    usage?: unknown;
  };
  try {
    json = JSON.parse(rawText) as typeof json;
  } catch {
    throw new Error('OpenAI trả JSON không hợp lệ.');
  }

  const content = (json.choices?.[0]?.message?.content ?? '').trim();
  if (!content) {
    throw new Error('OpenAI trả nội dung rỗng.');
  }

  return { content, usage: parseUsage(json.usage) };
}

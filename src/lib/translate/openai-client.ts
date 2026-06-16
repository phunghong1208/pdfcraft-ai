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
  // GPT-5 family (kể cả gpt-5-nano/mini) hỗ trợ reasoning_effort, gồm cả 'minimal'.
  if (m.includes('gpt-5')) return true;
  // gpt-4.1 nano/mini KHÔNG hỗ trợ reasoning_effort.
  if (m.includes('nano') || m.includes('mini')) return false;
  return m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4');
}

function parseUsage(raw: unknown): TokenUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const u = raw as Record<string, number>;
  const prompt = u.prompt_tokens ?? 0;
  const completion = u.completion_tokens ?? 0;
  const total = u.total_tokens ?? prompt + completion;
  return { prompt, completion, total };
}

// Tỉ giá USD→VND (override bằng env USD_VND_RATE).
const USD_TO_VND = Number(process.env.USD_VND_RATE || '26000');

// Giá USD trên 1 TRIỆU token (input / cached input / output).
const MODEL_PRICING: {
  match: (m: string) => boolean;
  input: number;
  cachedInput: number;
  output: number;
}[] = [
  { match: (m) => m.includes('gpt-5-nano'), input: 0.05, cachedInput: 0.005, output: 0.4 },
  { match: (m) => m.includes('gpt-5-mini'), input: 0.25, cachedInput: 0.025, output: 2.0 },
  { match: (m) => m.includes('gpt-5'), input: 1.25, cachedInput: 0.125, output: 10.0 },
  { match: (m) => m.includes('gpt-4.1-nano'), input: 0.1, cachedInput: 0.025, output: 0.4 },
  { match: (m) => m.includes('gpt-4.1-mini'), input: 0.4, cachedInput: 0.1, output: 1.6 },
];

function cachedPromptTokens(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0;
  const details = (raw as Record<string, unknown>).prompt_tokens_details;
  if (!details || typeof details !== 'object') return 0;
  const c = (details as Record<string, number>).cached_tokens;
  return typeof c === 'number' ? c : 0;
}

function fmtVnd(v: number): string {
  return v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

/** Tính chi phí 1 lượt gọi (USD + VND). cached = số token input được cache. */
export function computeCallCost(
  model: string,
  prompt: number,
  completion: number,
  cached = 0,
): { inUsd: number; outUsd: number; totalUsd: number; vnd: number } | null {
  const pricing = MODEL_PRICING.find((p) => p.match(model.toLowerCase()));
  if (!pricing) return null;
  const c = Math.min(Math.max(0, cached), prompt);
  const nonCached = Math.max(0, prompt - c);
  const inUsd = (nonCached * pricing.input + c * pricing.cachedInput) / 1_000_000;
  const outUsd = (completion * pricing.output) / 1_000_000;
  const totalUsd = inUsd + outUsd;
  return { inUsd, outUsd, totalUsd, vnd: totalUsd * USD_TO_VND };
}

function logCallCost(model: string, usageRaw: unknown, usage?: TokenUsage): void {
  if (!usage) return;
  const cached = cachedPromptTokens(usageRaw);
  const cost = computeCallCost(model, usage.prompt, usage.completion, cached);
  if (!cost) {
    console.log(`[translate cost] model=${model} (chưa có bảng giá) in=${usage.prompt} out=${usage.completion}`);
    return;
  }
  console.log(
    `[translate cost] model=${model} | input=${usage.prompt} (cached ${Math.min(cached, usage.prompt)}) ` +
      `output=${usage.completion} | in=$${cost.inUsd.toFixed(6)} out=$${cost.outUsd.toFixed(6)} ` +
      `total=$${cost.totalUsd.toFixed(6)} ≈ ${fmtVnd(cost.vnd)}đ`,
  );
}

/** In dòng TỔNG chi phí cho cả tài liệu (cộng dồn nhiều lượt gọi). */
export function logTotalCost(model: string, usage: TokenUsage, calls: number): void {
  const cost = computeCallCost(model, usage.prompt, usage.completion, 0);
  if (!cost) return;
  console.log(
    `[translate cost TỔNG] model=${model} | ${calls} lượt gọi | ` +
      `input=${usage.prompt} output=${usage.completion} total=${usage.total} tokens | ` +
      `total=$${cost.totalUsd.toFixed(6)} ≈ ${fmtVnd(cost.vnd)}đ`,
  );
}

export async function chatCompletion(options: {
  messages: ChatMessage[];
  model?: string;
  maxCompletionTokens?: number;
  timeoutMs?: number;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  responseFormat?: Record<string, unknown>;
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

  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

  if (isReasoningModel(model)) {
    const effort =
      (process.env.TRANSLATE_REASONING_EFFORT as
        | 'minimal'
        | 'low'
        | 'medium'
        | 'high'
        | undefined) ?? options.reasoningEffort;
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

  const usage = parseUsage(json.usage);
  logCallCost(model, json.usage, usage);

  return { content, usage };
}

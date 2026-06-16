import { chatCompletion, getDefaultTranslateModel, logTotalCost } from '@/lib/translate/openai-client';
import { languageDisplayName } from '@/lib/translate/language';
import type { TokenUsage } from '@/lib/translate/types';
import { buildSegmentBatches, runSegmentBatches } from '@/lib/translate/segment-batches';

const MAX_RETRIES = 2;

function emptyUsage(): TokenUsage {
  return { prompt: 0, completion: 0, total: 0 };
}

function mergeUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    prompt: a.prompt + b.prompt,
    completion: a.completion + b.completion,
    total: a.total + b.total,
  };
}

type TranslatedItem = { text: string; status: string };

const TRANSLATION_SCHEMA: Record<string, unknown> = {
  type: 'json_schema',
  json_schema: {
    name: 'translations',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        translations: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'integer' },
              text: { type: 'string' },
              status: {
                type: 'string',
                enum: ['translated', 'unchanged', 'uncertain'],
              },
            },
            required: ['id', 'text', 'status'],
          },
        },
      },
      required: ['translations'],
    },
  },
};

function buildSystemPrompt(targetLang: string): string {
  const target = languageDisplayName(targetLang);
  return [
    'You are a multilingual document translator.',
    `TARGET LANGUAGE: ${target}`,
    'Input is a JSON array of text segments from one document page. Use the full page as context.',
    'Translate every translatable text into the target language.',
    'Rules:',
    '- Return one result for every input item.',
    '- Preserve id, order and item count. Never omit, duplicate, merge or split items.',
    '- Do not summarize, explain or invent content.',
    '- Fix obvious extraction errors only when confident.',
    '- Preserve numbers, URLs, emails, paths, codes, formulas, tags and placeholders.',
    '- Keep text already in the target language unchanged with status "unchanged".',
    '- If text is unreadable or ambiguous, keep it unchanged with status "uncertain".',
    '- Otherwise set status "translated".',
    '- Return JSON only.',
    'Output: {"translations":[{"id":1,"text":"...","status":"translated"}]}',
  ].join('\n');
}

/** Chuẩn hoá để so sánh output có giống input không (NFKC + gộp khoảng trắng). */
function normalizeText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

const URL_RE = /^(https?:\/\/|www\.)\S+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Item không cần dịch (URL/email/số/mã) → giống input là bình thường, đừng retry. */
function looksUntranslatable(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (URL_RE.test(t) || EMAIL_RE.test(t)) return true;
  // Không có chữ cái nào (chỉ số/dấu) → number/code/punct
  if (!/\p{L}/u.test(t)) return true;
  // Mã ngắn kiểu A1B2/ID toàn HOA + số, không khoảng trắng
  if (t.length <= 12 && /^[A-Z0-9][A-Z0-9._/-]*$/.test(t)) return true;
  return false;
}

function parseTranslationItems(
  content: string,
  expectedCount: number,
): TranslatedItem[] {
  const trimmed = content.trim();
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  const objStart = trimmed.indexOf('{');
  // Ưu tiên object {translations:[...]}, fallback mảng [...]
  let jsonText = trimmed;
  if (objStart >= 0 && (objStart < start || start < 0)) {
    jsonText = trimmed.slice(objStart, trimmed.lastIndexOf('}') + 1);
  } else if (start >= 0 && end > start) {
    jsonText = trimmed.slice(start, end + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    const repaired = jsonText.replace(/[\x00-\x1f]/g, (c) =>
      c === '\n' ? '\\n' : c === '\t' ? '\\t' : c === '\r' ? '\\r' : ' ',
    );
    parsed = JSON.parse(repaired);
  }

  let arr: unknown[];
  if (Array.isArray(parsed)) {
    arr = parsed;
  } else {
    const obj = parsed as { translations?: unknown };
    if (!Array.isArray(obj.translations)) {
      throw new Error('[translate] response is not an array');
    }
    arr = obj.translations;
  }

  const result: TranslatedItem[] = Array.from({ length: expectedCount }, () => ({
    text: '',
    status: '',
  }));
  arr.forEach((item, i) => {
    if (typeof item === 'string') {
      if (i < expectedCount) result[i] = { text: item.trim(), status: 'translated' };
      return;
    }
    if (item && typeof item === 'object') {
      const obj = item as { id?: unknown; text?: unknown; status?: unknown };
      const idx = typeof obj.id === 'number' ? obj.id - 1 : i;
      if (idx >= 0 && idx < expectedCount) {
        result[idx] = {
          text: typeof obj.text === 'string' ? obj.text.trim() : '',
          status: typeof obj.status === 'string' ? obj.status : 'translated',
        };
      }
    }
  });
  return result;
}

async function translateBatch(
  segments: string[],
  targetLang: string,
  model: string,
  _depth = 0,
): Promise<{ translations: TranslatedItem[]; usage: TokenUsage }> {
  const idPayload = segments.map((text, i) => ({ id: i + 1, text }));
  const payload = JSON.stringify(idPayload);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const { content, usage } = await chatCompletion({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt(targetLang) },
          { role: 'user', content: payload },
        ],
        maxCompletionTokens: Math.min(16384, 512 + segments.join('').length * 6),
        reasoningEffort: 'low',
        responseFormat: TRANSLATION_SCHEMA,
      });

      const translations = parseTranslationItems(content, segments.length);
      return { translations, usage: usage ?? emptyUsage() };
    } catch (err) {
      console.error(
        `[translate] batch fail (attempt ${attempt + 1}/${MAX_RETRIES + 1}, ${segments.length} segs):`,
        err instanceof Error ? err.message : err,
      );
      if (attempt >= MAX_RETRIES) break;
    }
  }

  if (_depth === 0 && segments.length > 1) {
    console.warn(`[translate] splitting failed batch of ${segments.length} into smaller chunks`);
    const chunkSize = Math.max(1, Math.ceil(segments.length / 4));
    const chunks: string[][] = [];
    for (let i = 0; i < segments.length; i += chunkSize) {
      chunks.push(segments.slice(i, i + chunkSize));
    }
    const results = await Promise.all(
      chunks.map((chunk) => translateBatch(chunk, targetLang, model, 1)),
    );
    return {
      translations: results.flatMap((r) => r.translations),
      usage: results.reduce((acc, r) => mergeUsage(acc, r.usage), emptyUsage()),
    };
  }

  console.warn(
    `[translate] ${segments.length} segment(s) untranslatable, skipping`,
  );
  return { translations: segments.map(() => ({ text: '', status: '' })), usage: emptyUsage() };
}

export async function translateSegmentsLightweight(options: {
  segments: string[];
  sourceLang: string;
  targetLang: string;
  model?: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ translations: string[]; tokenUsage: TokenUsage }> {
  const { segments, targetLang, onProgress } = options;
  const model = options.model || getDefaultTranslateModel();

  if (!segments.length) {
    return { translations: [], tokenUsage: emptyUsage() };
  }

  const results = new Array<string>(segments.length).fill('');
  const statuses = new Array<string>(segments.length).fill('');
  let tokenUsage = emptyUsage();
  let callCount = 0;
  let doneCount = 0;
  const batches = buildSegmentBatches(segments);

  // Pass 1: dịch toàn bộ
  const batchResults = await runSegmentBatches(batches, async ({ offset, segments: batch }) => {
    const { translations, usage } = await translateBatch(batch, targetLang, model);
    for (let j = 0; j < batch.length; j += 1) {
      results[offset + j] = translations[j]?.text?.trim() || '';
      statuses[offset + j] = translations[j]?.status || '';
    }
    doneCount += batch.length;
    onProgress?.(doneCount, segments.length);
    return usage;
  });
  for (const usage of batchResults) {
    tokenUsage = mergeUsage(tokenUsage, usage);
  }
  callCount += batchResults.length;

  // Validator: output trùng input + status không phải "unchanged" + có thể dịch → nghi miss
  const suspectIdx: number[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const src = segments[i];
    const out = results[i];
    if (!src.trim()) continue;
    const missing = !out;
    const identical = !!out && normalizeText(out) === normalizeText(src);
    const intentional = statuses[i] === 'unchanged';
    if ((missing || (identical && !intentional)) && !looksUntranslatable(src)) {
      suspectIdx.push(i);
    }
  }

  // Pass 2: retry riêng các segment nghi miss (một lượt)
  if (suspectIdx.length) {
    console.warn(`[translate] retrying ${suspectIdx.length} possibly-missed segment(s)`);
    const subSegments = suspectIdx.map((i) => segments[i]);
    const subBatches = buildSegmentBatches(subSegments);
    const retryUsages = await runSegmentBatches(subBatches, async ({ offset, segments: batch }) => {
      const { translations, usage } = await translateBatch(batch, targetLang, model);
      for (let j = 0; j < batch.length; j += 1) {
        const gi = suspectIdx[offset + j];
        const t = translations[j]?.text?.trim() || '';
        // Chỉ thay khi có kết quả mới khác input (tránh ghi đè bằng output trùng)
        if (t && normalizeText(t) !== normalizeText(segments[gi])) {
          results[gi] = t;
          statuses[gi] = translations[j]?.status || statuses[gi];
        } else if (t && !results[gi]) {
          results[gi] = t;
        }
      }
      return usage;
    });
    for (const usage of retryUsages) {
      tokenUsage = mergeUsage(tokenUsage, usage);
    }
    callCount += retryUsages.length;
  }

  logTotalCost(model, tokenUsage, callCount);

  return { translations: results, tokenUsage };
}

const PLAIN_TEXT_CHUNK_CHARS = 3500;

export async function translatePlainText(options: {
  text: string;
  sourceLang: string;
  targetLang: string;
  model?: string;
}): Promise<{ translatedText: string; tokenUsage: TokenUsage }> {
  const text = options.text.trim();
  if (!text) {
    return { translatedText: '', tokenUsage: emptyUsage() };
  }

  if (text.length <= PLAIN_TEXT_CHUNK_CHARS) {
    const source = languageDisplayName(options.sourceLang);
    const target = languageDisplayName(options.targetLang);
    const model = options.model || getDefaultTranslateModel();

    const { content, usage } = await chatCompletion({
      model,
      messages: [
        {
          role: 'system',
          content: `Translate the user text from ${source} to ${target}. Return only the translated text.`,
        },
        { role: 'user', content: text },
      ],
      maxCompletionTokens: Math.min(16384, 512 + text.length * 2),
      reasoningEffort: 'low',
    });

    return { translatedText: content, tokenUsage: usage ?? emptyUsage() };
  }

  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  const { translations, tokenUsage } = await translateSegmentsLightweight({
    segments: paragraphs.length ? paragraphs : [text],
    sourceLang: options.sourceLang,
    targetLang: options.targetLang,
    model: options.model,
  });

  return { translatedText: translations.join('\n\n'), tokenUsage };
}

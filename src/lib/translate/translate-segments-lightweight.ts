import { chatCompletion, getDefaultTranslateModel } from '@/lib/translate/openai-client';
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

function buildSystemPrompt(sourceLang: string, targetLang: string): string {
  const source = languageDisplayName(sourceLang);
  const target = languageDisplayName(targetLang);
  return [
    `You are a professional translator (${source} → ${target}).`,
    'Translate each input segment independently.',
    'Preserve numbers, punctuation, line breaks, placeholders, and leading list markers (e.g. 3., 4.). Keep URLs, email addresses, domain names, and file paths exactly as-is — do not transliterate or translate them.',
    'Do not merge, split, or reorder segments.',
    'Return ONLY valid JSON: {"translations":["..."]}',
    'The translations array MUST have exactly the same length as the input segments array.',
  ].join(' ');
}

function alignTranslations(
  out: string[],
  expectedCount: number,
  fallback: string[],
): string[] {
  const result: string[] = [];
  for (let i = 0; i < expectedCount; i += 1) {
    const translated = out[i]?.trim();
    result.push(translated || '');
  }
  return result;
}

function parseTranslationsJson(
  content: string,
  expectedCount: number,
  fallback: string[],
): string[] {
  const trimmed = content.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : trimmed;
  const parsed = JSON.parse(jsonText) as { translations?: unknown };

  if (!Array.isArray(parsed.translations)) {
    throw new Error('JSON thiếu mảng translations.');
  }

  const out = parsed.translations.map((value) =>
    typeof value === 'string' ? value : String(value ?? ''),
  );
  return alignTranslations(out, expectedCount, fallback);
}

async function translateBatch(
  segments: string[],
  sourceLang: string,
  targetLang: string,
  model: string,
  _depth = 0,
): Promise<{ translations: string[]; usage: TokenUsage }> {
  const payload = JSON.stringify({ segments });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const { content, usage } = await chatCompletion({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt(sourceLang, targetLang) },
          { role: 'user', content: payload },
        ],
        maxCompletionTokens: Math.min(16384, 512 + segments.join('').length * 6),
        reasoningEffort: 'low',
      });

      const translations = parseTranslationsJson(content, segments.length, segments);
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
      chunks.map((chunk) => translateBatch(chunk, sourceLang, targetLang, model, 1)),
    );
    return {
      translations: results.flatMap((r) => r.translations),
      usage: results.reduce((acc, r) => mergeUsage(acc, r.usage), emptyUsage()),
    };
  }

  console.warn(
    `[translate] ${segments.length} segment(s) untranslatable, skipping`,
  );
  return { translations: segments.map(() => ''), usage: emptyUsage() };
}

export async function translateSegmentsLightweight(options: {
  segments: string[];
  sourceLang: string;
  targetLang: string;
  model?: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ translations: string[]; tokenUsage: TokenUsage }> {
  const { segments, sourceLang, targetLang, onProgress } = options;
  const model = options.model || getDefaultTranslateModel();

  if (!segments.length) {
    return { translations: [], tokenUsage: emptyUsage() };
  }

  const results = new Array<string>(segments.length).fill('');
  let tokenUsage = emptyUsage();
  let doneCount = 0;
  const batches = buildSegmentBatches(segments);

  const batchResults = await runSegmentBatches(batches, async ({ offset, segments: batch }) => {
    const { translations, usage } = await translateBatch(batch, sourceLang, targetLang, model);
    for (let j = 0; j < batch.length; j += 1) {
      results[offset + j] = translations[j]?.trim() || '';
    }
    doneCount += batch.length;
    onProgress?.(doneCount, segments.length);
    return usage;
  });

  for (const usage of batchResults) {
    tokenUsage = mergeUsage(tokenUsage, usage);
  }

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

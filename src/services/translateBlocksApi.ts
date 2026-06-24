const TRANSLATE_TEXT_PATH = '/api/translate/text';

/** Một request HTTP mang nhiều block — server batch + gọi OpenAI song song bên trong. */
const SEGMENTS_PER_HTTP = Number(process.env.NEXT_PUBLIC_TRANSLATE_HTTP_CHUNK || '120');

type TranslateTextApiResponse = {
  translations?: string[];
  detail?: string;
};

async function translateChunk(
  segments: string[],
  sourceLang: string,
  targetLang: string,
): Promise<string[]> {
  const res = await fetch(TRANSLATE_TEXT_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceLang,
      targetLang,
      segments,
    }),
  });

  const body = (await res.json()) as TranslateTextApiResponse;
  if (!res.ok) {
    throw new Error(body.detail || `Dịch block thất bại (${res.status}).`);
  }

  const translations = body.translations;
  if (!Array.isArray(translations)) {
    throw new Error('API dịch không trả mảng translations.');
  }

  return segments.map((_seg, j) => translations[j]?.trim() || segments[j]);
}

export async function translateBlockTexts(
  texts: string[],
  sourceLang: string,
  targetLang: string,
  onProgress?: (done: number, total: number) => void,
  translatable?: boolean[],
): Promise<string[]> {
  if (!texts.length) return [];

  const flags = translatable ?? texts.map(() => true);
  const results = [...texts];
  const pending: { index: number; text: string }[] = [];
  for (let i = 0; i < texts.length; i += 1) {
    if (flags[i]) pending.push({ index: i, text: texts[i] });
  }

  const httpChunks: { items: { index: number; text: string }[] }[] = [];
  for (let i = 0; i < pending.length; i += SEGMENTS_PER_HTTP) {
    httpChunks.push({ items: pending.slice(i, i + SEGMENTS_PER_HTTP) });
  }

  let doneCount = 0;
  for (const chunk of httpChunks) {
    const segments = chunk.items.map((item) => item.text);
    try {
      const translations = await translateChunk(segments, sourceLang, targetLang);
      for (let j = 0; j < chunk.items.length; j += 1) {
        results[chunk.items[j].index] = translations[j];
      }
    } catch (err) {
      console.error('[translateBlockTexts] chunk failed, keeping originals:', err);
      for (const item of chunk.items) {
        results[item.index] = item.text;
      }
    }
    doneCount += chunk.items.length;
    onProgress?.(doneCount, pending.length);
  }

  return results;
}

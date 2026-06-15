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

  return segments.map((_seg, j) => translations[j]?.trim() || '');
}

export async function translateBlockTexts(
  texts: string[],
  sourceLang: string,
  targetLang: string,
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  if (!texts.length) return [];

  const results = new Array<string>(texts.length).fill('');
  const httpChunks: { offset: number; segments: string[] }[] = [];

  for (let i = 0; i < texts.length; i += SEGMENTS_PER_HTTP) {
    httpChunks.push({
      offset: i,
      segments: texts.slice(i, i + SEGMENTS_PER_HTTP),
    });
  }

  let doneCount = 0;
  for (const chunk of httpChunks) {
    try {
      const translations = await translateChunk(chunk.segments, sourceLang, targetLang);
      for (let j = 0; j < chunk.segments.length; j += 1) {
        results[chunk.offset + j] = translations[j];
      }
    } catch (err) {
      console.error('[translateBlockTexts] chunk failed, leaving empty:', err);
    }
    doneCount += chunk.segments.length;
    onProgress?.(doneCount, texts.length);
  }

  return results;
}

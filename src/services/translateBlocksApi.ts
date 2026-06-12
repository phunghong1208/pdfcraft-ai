import {
  buildSegmentBatches,
  runSegmentBatches,
} from '@/lib/translate/segment-batches';

const TRANSLATE_TEXT_PATH = '/api/translate/text';

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

  return segments.map((seg, j) => translations[j]?.trim() || seg);
}

export async function translateBlockTexts(
  texts: string[],
  sourceLang: string,
  targetLang: string,
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  if (!texts.length) return [];

  const results = new Array<string>(texts.length).fill('');
  const batches = buildSegmentBatches(texts);
  let doneCount = 0;

  await runSegmentBatches(batches, async ({ offset, segments }) => {
    const translations = await translateChunk(segments, sourceLang, targetLang);
    for (let j = 0; j < segments.length; j += 1) {
      results[offset + j] = translations[j];
    }
    doneCount += segments.length;
    onProgress?.(doneCount, texts.length);
  });

  return results;
}

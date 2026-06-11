const CHUNK_SIZE = 12;
const TRANSLATE_TEXT_PATH = '/api/translate/text';

type TranslateTextApiResponse = {
  translations?: string[];
  detail?: string;
};

export async function translateBlockTexts(
  texts: string[],
  sourceLang: string,
  targetLang: string,
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  if (!texts.length) return [];

  const results = new Array<string>(texts.length).fill('');

  for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
    const chunk = texts.slice(i, i + CHUNK_SIZE);
    const res = await fetch(TRANSLATE_TEXT_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceLang,
        targetLang,
        segments: chunk,
      }),
    });

    const body = (await res.json()) as TranslateTextApiResponse;
    if (!res.ok) {
      throw new Error(body.detail || `Dịch block thất bại (${res.status}).`);
    }

    const translations = body.translations;
    if (!Array.isArray(translations) || translations.length !== chunk.length) {
      throw new Error('API dịch không trả đủ số segment.');
    }

    for (let j = 0; j < chunk.length; j += 1) {
      results[i + j] = translations[j]?.trim() || chunk[j];
    }

    onProgress?.(Math.min(i + CHUNK_SIZE, texts.length), texts.length);
  }

  return results;
}

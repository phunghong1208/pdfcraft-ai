import { locales, localeConfig, type Locale } from '@/lib/i18n/config';

export type TranslateOutputType = 'keep_layout' | 'text_only';

export type TranslateLanguageOption = {
  code: string;
  nativeName: string;
  englishName: string;
};

/** Ngôn ngữ hỗ trợ — mã ISO gửi lên API dịch (source_lang, target_lang). */
export const TRANSLATE_LANGUAGE_OPTIONS: TranslateLanguageOption[] = locales.map((loc) => ({
  code: loc === 'zh-TW' ? 'zh-TW' : loc,
  nativeName: localeConfig[loc].nativeName,
  englishName: localeConfig[loc].name,
}));

export type TranslateDocumentOptions = {
  sourceLang: string;
  targetLang: string;
  outputType: TranslateOutputType;
  model?: string;
};

export type TranslateDocumentResult =
  | { kind: 'pdf'; blob: Blob; fileName: string; contentType: string }
  | { kind: 'text'; text: string };

const TRANSLATE_PROXY_PATH = '/api/translate-docs';

function parseFileNameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      // fall through
    }
  }
  const plain = header.match(/filename="?([^";\n]+)"?/i);
  return plain?.[1]?.trim() || fallback;
}

function buildTranslatedFileName(originalName: string, targetLang: string, ext = 'pdf'): string {
  const base = originalName.replace(/\.[^.]+$/, '') || 'document';
  return `${base}-translated-${targetLang}.${ext}`;
}

function extractTranslatedText(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const record = json as Record<string, unknown>;
  const candidates = [record.translated_text, record.translatedText, record.text, record.result];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

export function getDefaultTranslateLanguagePair(pageLocale: string): { source: string; target: string } {
  const loc = pageLocale as Locale;
  if (loc === 'vi') return { source: 'vi', target: 'en' };
  return { source: 'en', target: loc in localeConfig ? loc : 'vi' };
}

async function parseJsonTranslatedText(res: Response): Promise<string | null> {
  try {
    const json = await res.json();
    return extractTranslatedText(json);
  } catch {
    return null;
  }
}

export async function translateDocument(
  file: File,
  opts: TranslateDocumentOptions,
): Promise<TranslateDocumentResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('source_lang', opts.sourceLang);
  form.append('target_lang', opts.targetLang);
  form.append('output_type', opts.outputType);
  if (opts.model) form.append('model', opts.model);

  const res = await fetch(TRANSLATE_PROXY_PATH, {
    method: 'POST',
    body: form,
  });

  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    let detail = `Dịch thất bại (${res.status})`;
    try {
      if (contentType.includes('application/json')) {
        const json = (await res.json()) as { detail?: string; message?: string; error?: string };
        detail = json.detail || json.message || json.error || detail;
      } else {
        const text = await res.text();
        if (text.trim()) detail = text.slice(0, 400);
      }
    } catch {
      // keep default
    }
    throw new Error(detail);
  }

  if (opts.outputType === 'text_only' || contentType.includes('application/json')) {
    const text = await parseJsonTranslatedText(res);
    if (text) return { kind: 'text', text };
    if (opts.outputType === 'text_only') {
      throw new Error('Server không trả translated_text.');
    }
  }

  if (contentType.includes('application/pdf') || contentType.includes('application/octet-stream')) {
    const blob = await res.blob();
    const fileName = parseFileNameFromDisposition(
      res.headers.get('content-disposition'),
      buildTranslatedFileName(file.name, opts.targetLang),
    );
    return { kind: 'pdf', blob, fileName, contentType: blob.type || 'application/pdf' };
  }

  const rawText = await res.text();
  if (!rawText.trim()) throw new Error('Server không trả dữ liệu dịch.');

  try {
    const parsed = extractTranslatedText(JSON.parse(rawText) as unknown);
    if (parsed) return { kind: 'text', text: parsed };
  } catch {
    // not JSON — fall through
  }

  throw new Error('Định dạng phản hồi dịch không được hỗ trợ.');
}

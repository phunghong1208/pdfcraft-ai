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

function isPdfBytes(buf: ArrayBuffer): boolean {
  const head = new Uint8Array(buf, 0, Math.min(5, buf.byteLength));
  return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
}

function parseErrorDetail(body: string, contentType: string, fallback: string): string {
  if (!body.trim()) return fallback;
  if (contentType.includes('application/json')) {
    try {
      const json = JSON.parse(body) as { detail?: string; message?: string; error?: string };
      return json.detail || json.message || json.error || body.slice(0, 400);
    } catch {
      // fall through
    }
  }
  return body.slice(0, 400);
}

function parseJsonBody(body: ArrayBuffer): unknown {
  return JSON.parse(new TextDecoder().decode(body));
}

function toPdfResult(
  body: ArrayBuffer,
  res: Response,
  file: File,
  targetLang: string,
): TranslateDocumentResult {
  const blob = new Blob([body], { type: 'application/pdf' });
  const fileName = parseFileNameFromDisposition(
    res.headers.get('content-disposition'),
    buildTranslatedFileName(file.name, targetLang),
  );
  return { kind: 'pdf', blob, fileName, contentType: blob.type || 'application/pdf' };
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
  const body = await res.arrayBuffer();

  if (!res.ok) {
    const detail = parseErrorDetail(
      new TextDecoder().decode(body),
      contentType,
      `Dịch thất bại (${res.status})`,
    );
    throw new Error(detail);
  }

  const looksLikePdf =
    contentType.includes('application/pdf') ||
    contentType.includes('application/octet-stream') ||
    isPdfBytes(body);

  if (opts.outputType === 'keep_layout') {
    if (looksLikePdf) {
      return toPdfResult(body, res, file, opts.targetLang);
    }

    if (contentType.includes('application/json')) {
      const json = parseJsonBody(body);
      const text = extractTranslatedText(json);
      if (text) return { kind: 'text', text };
      const record = json as { detail?: string; message?: string; error?: string };
      throw new Error(
        record.detail || record.message || record.error || 'Server không trả PDF giữ bố cục.',
      );
    }

    throw new Error('Server không trả PDF giữ bố cục.');
  }

  if (contentType.includes('application/json')) {
    const text = extractTranslatedText(parseJsonBody(body));
    if (text) return { kind: 'text', text };
    throw new Error('Server không trả translated_text.');
  }

  const rawText = new TextDecoder().decode(body);
  if (!rawText.trim()) throw new Error('Server không trả dữ liệu dịch.');

  try {
    const parsed = extractTranslatedText(JSON.parse(rawText) as unknown);
    if (parsed) return { kind: 'text', text: parsed };
  } catch {
    // not JSON — fall through
  }

  if (looksLikePdf) {
    return toPdfResult(body, res, file, opts.targetLang);
  }

  throw new Error('Định dạng phản hồi dịch không được hỗ trợ.');
}

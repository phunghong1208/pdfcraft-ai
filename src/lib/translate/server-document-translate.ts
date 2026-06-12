import { extractTextFromPdfFile } from '@/lib/pdf/extract-pdf-text';
import type { LayoutTextBlock } from '@/lib/pdf/layout-blocks';
import { pdfServerUpstream } from '@/lib/pdf-server-upstream';
import {
  translatePlainText,
  translateSegmentsLightweight,
} from '@/lib/translate/translate-segments-lightweight';

const LAYOUT_UPSTREAM = pdfServerUpstream();
const RENDER_TIMEOUT_MS = Number(process.env.RENDER_PROXY_TIMEOUT_MS || '300000');

function isLayoutBlock(value: unknown): value is LayoutTextBlock {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.pageNumber === 'number' &&
    typeof v.text === 'string' &&
    typeof v.pdfX === 'number' &&
    typeof v.pdfY === 'number' &&
    typeof v.pdfWidth === 'number' &&
    typeof v.pdfHeight === 'number'
  );
}

type WipeLine = {
  pageNumber: number;
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  fontSize: number;
};

function isWipeLine(value: unknown): value is WipeLine {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.pageNumber === 'number' &&
    typeof v.pdfX === 'number' &&
    typeof v.pdfY === 'number' &&
    typeof v.pdfWidth === 'number' &&
    typeof v.pdfHeight === 'number' &&
    typeof v.fontSize === 'number'
  );
}

type LayoutExtractPayload = {
  blocks: LayoutTextBlock[];
  wipeLines: WipeLine[];
};

async function extractFromLayoutService(
  file: File,
  sourceLang: string,
): Promise<LayoutExtractPayload | null> {
  const form = new FormData();
  form.append('file', file);
  form.append('lang', sourceLang);

  try {
    const res = await fetch(`${LAYOUT_UPSTREAM}/extract`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(Number(process.env.LAYOUT_PROXY_TIMEOUT_MS || '600000')),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { blocks?: unknown[]; wipeLines?: unknown[] };
    const blocks = (json.blocks ?? []).filter(isLayoutBlock);
    if (!blocks.length) return null;

    const wipeLines = (json.wipeLines ?? []).filter(isWipeLine);
    return { blocks, wipeLines };
  } catch {
    return null;
  }
}

async function renderOnServer(
  file: File,
  blocks: LayoutTextBlock[],
  translations: string[],
  targetLang: string,
  wipeLines: WipeLine[],
): Promise<Uint8Array> {
  const form = new FormData();
  form.append('file', file);
  form.append('blocks_json', JSON.stringify(blocks));
  form.append('translations_json', JSON.stringify(translations));
  form.append('target_lang', targetLang);
  if (wipeLines.length > 0) {
    form.append('wipe_lines_json', JSON.stringify(wipeLines));
  }

  const res = await fetch(`${LAYOUT_UPSTREAM}/render`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Render failed (${res.status}): ${text}`);
  }

  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export async function translatePdfTextOnly(
  file: File,
  sourceLang: string,
  targetLang: string,
  model?: string,
): Promise<{ translatedText: string }> {
  const raw = (await extractTextFromPdfFile(file)).trim();
  if (!raw) {
    throw new Error('PDF không có văn bản để dịch.');
  }

  const { translatedText } = await translatePlainText({
    text: raw,
    sourceLang,
    targetLang,
    model,
  });

  return { translatedText };
}

export async function translatePdfKeepLayout(
  file: File,
  sourceLang: string,
  targetLang: string,
  model?: string,
  passthrough = false,
): Promise<Uint8Array> {
  const payload = await extractFromLayoutService(file, sourceLang);
  if (!payload || !payload.blocks.length) {
    throw new Error('Không trích được block văn bản từ PDF.');
  }

  const translations = passthrough
    ? payload.blocks.map((b) => b.text)
    : (
        await translateSegmentsLightweight({
          segments: payload.blocks.map((b) => b.text),
          sourceLang,
          targetLang,
          model,
        })
      ).translations;

  return renderOnServer(file, payload.blocks, translations, targetLang, payload.wipeLines);
}

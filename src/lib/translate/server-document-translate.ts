import { applyBlockTranslations } from '@/lib/pdf/apply-block-translations';
import { extractLayoutBlocks } from '@/lib/pdf/extract-layout-blocks';
import { extractTextFromPdfFile } from '@/lib/pdf/extract-pdf-text';
import type { LayoutTextBlock } from '@/lib/pdf/layout-blocks';
import {
  translatePlainText,
  translateSegmentsLightweight,
} from '@/lib/translate/translate-segments-lightweight';

const LAYOUT_UPSTREAM = (process.env.LAYOUT_SERVER_UPSTREAM || 'http://localhost:8101').replace(/\/$/, '');

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

async function extractBlocksFromLayoutService(file: File): Promise<LayoutTextBlock[] | null> {
  const form = new FormData();
  form.append('file', file);

  try {
    const res = await fetch(`${LAYOUT_UPSTREAM}/extract`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(Number(process.env.LAYOUT_PROXY_TIMEOUT_MS || '600000')),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { blocks?: unknown[] };
    const blocks = (json.blocks ?? []).filter(isLayoutBlock);
    return blocks.length ? blocks : null;
  } catch {
    return null;
  }
}

async function extractDocumentBlocks(file: File): Promise<LayoutTextBlock[]> {
  const fromService = await extractBlocksFromLayoutService(file);
  if (fromService?.length) return fromService;
  return extractLayoutBlocks(file);
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
): Promise<Uint8Array> {
  const blocks = await extractDocumentBlocks(file);
  if (!blocks.length) {
    throw new Error('Không trích được block văn bản từ PDF.');
  }

  const { translations } = await translateSegmentsLightweight({
    segments: blocks.map((b) => b.text),
    sourceLang,
    targetLang,
    model,
  });

  const pdfBytes = await file.arrayBuffer();
  return applyBlockTranslations(pdfBytes, blocks, translations, targetLang);
}

import { applyBlockTranslations } from '@/lib/pdf/apply-block-translations';
import { extractLayoutBlocks, type TextLineRect } from '@/lib/pdf/extract-layout-blocks';
import { extractTextFromPdfFile } from '@/lib/pdf/extract-pdf-text';
import type { LayoutTextBlock } from '@/lib/pdf/layout-blocks';
import { pdfServerUpstream } from '@/lib/pdf-server-upstream';
import {
  translatePlainText,
  translateSegmentsLightweight,
} from '@/lib/translate/translate-segments-lightweight';

const LAYOUT_UPSTREAM = pdfServerUpstream();

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

function isWipeLine(value: unknown): value is TextLineRect & { pageNumber: number } {
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

function groupWipeLinesByPage(
  lines: Array<TextLineRect & { pageNumber: number }>,
): Map<number, TextLineRect[]> {
  const byPage = new Map<number, TextLineRect[]>();
  for (const line of lines) {
    const bucket = byPage.get(line.pageNumber) ?? [];
    bucket.push({
      pdfX: line.pdfX,
      pdfY: line.pdfY,
      pdfWidth: line.pdfWidth,
      pdfHeight: line.pdfHeight,
      fontSize: line.fontSize,
    });
    byPage.set(line.pageNumber, bucket);
  }
  return byPage;
}

type LayoutExtractPayload = {
  blocks: LayoutTextBlock[];
  wipeLinesByPage: Map<number, TextLineRect[]>;
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
    return {
      blocks,
      wipeLinesByPage: groupWipeLinesByPage(wipeLines),
    };
  } catch {
    return null;
  }
}

async function extractDocumentLayout(file: File, sourceLang: string): Promise<LayoutExtractPayload> {
  const fromService = await extractFromLayoutService(file, sourceLang);
  if (fromService) return fromService;

  const blocks = await extractLayoutBlocks(file);
  return { blocks, wipeLinesByPage: new Map() };
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
  const { blocks, wipeLinesByPage } = await extractDocumentLayout(file, sourceLang);
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
  return applyBlockTranslations(pdfBytes, blocks, translations, targetLang, {
    wipeLinesByPage,
  });
}

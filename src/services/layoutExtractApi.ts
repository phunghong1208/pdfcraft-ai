import type { TextLineRect } from '@/lib/pdf/extract-layout-blocks';
import type { LayoutTextBlock } from '@/lib/pdf/layout-blocks';

export type LayoutEngine = 'fitz' | 'pdfplumber' | 'pdfjs';

export type LayoutExtractResult = {
  blocks: LayoutTextBlock[];
  engine: LayoutEngine;
  wipeLinesByPage: Map<number, TextLineRect[]>;
};

const LAYOUT_API =
  process.env.NEXT_PUBLIC_PDF_API_URL ||
  process.env.NEXT_PUBLIC_LAYOUT_API_URL ||
  '/api/layout-extract';

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

const VALID_ENGINES: Set<string> = new Set(['fitz', 'pdfplumber', 'pdfjs']);

export async function extractDocumentLayoutBlocks(
  file: File,
  sourceLang = 'en',
): Promise<LayoutExtractResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('lang', sourceLang);

  const url = LAYOUT_API.startsWith('/')
    ? LAYOUT_API
    : `${LAYOUT_API.replace(/\/$/, '')}/extract`;
  const res = await fetch(url, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const text = await res.text();
    let detail: string;
    try {
      detail = JSON.parse(text).detail;
    } catch {
      detail = text;
    }
    throw new Error(`Layout extract thất bại (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as {
    blocks?: LayoutTextBlock[];
    engine?: string;
    wipeLines?: unknown[];
  };

  if (!Array.isArray(data.blocks) || data.blocks.length === 0) {
    throw new Error('Layout server trả về 0 block. PDF có thể cần OCR trước.');
  }

  const wipeLines = (data.wipeLines ?? []).filter(isWipeLine);
  const engine: LayoutEngine = VALID_ENGINES.has(data.engine ?? '')
    ? (data.engine as LayoutEngine)
    : 'pdfplumber';

  return {
    blocks: data.blocks,
    engine,
    wipeLinesByPage: groupWipeLinesByPage(wipeLines),
  };
}

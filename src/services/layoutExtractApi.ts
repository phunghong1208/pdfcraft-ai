import type { LayoutTextBlock } from '@/lib/pdf/layout-blocks';
import { extractLayoutBlocks } from '@/lib/pdf/extract-layout-blocks';

const LAYOUT_PROXY_PATH = '/api/layout-extract';

export type LayoutExtractResult = {
  blocks: LayoutTextBlock[];
  engine: 'docling' | 'pdfjs';
};

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

/** Docling layout extraction — fallback PDF.js nếu service không chạy. */
export async function extractDocumentLayoutBlocks(file: File): Promise<LayoutExtractResult> {
  const form = new FormData();
  form.append('file', file);

  try {
    const res = await fetch(LAYOUT_PROXY_PATH, { method: 'POST', body: form });
    if (res.ok) {
      const json = (await res.json()) as { blocks?: unknown[]; engine?: string };
      const blocks = (json.blocks ?? []).filter(isLayoutBlock);
      if (blocks.length) {
        return { blocks, engine: 'docling' };
      }
    }
  } catch {
    // fallback below
  }

  const blocks = await extractLayoutBlocks(file);
  return { blocks, engine: 'pdfjs' };
}

import type { LayoutTextBlock } from '@/lib/pdf/layout-blocks';
import { extractLayoutBlocks } from '@/lib/pdf/extract-layout-blocks';

export type LayoutExtractResult = {
  blocks: LayoutTextBlock[];
  engine: 'pdfjs';
};

export async function extractDocumentLayoutBlocks(file: File): Promise<LayoutExtractResult> {
  const blocks = await extractLayoutBlocks(file);
  return { blocks, engine: 'pdfjs' };
}

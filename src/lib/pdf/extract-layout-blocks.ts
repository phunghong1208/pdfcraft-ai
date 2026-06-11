import { loadPdfjs } from '@/lib/pdf/loader';
import type { LayoutTextBlock } from '@/lib/pdf/layout-blocks';

export type { LayoutTextBlock } from '@/lib/pdf/layout-blocks';

const MAX_PAGES = 80;
const MAX_BLOCKS = 500;

type TextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
};

type TextLine = {
  y: number;
  items: TextItem[];
};

function groupIntoLines(items: TextItem[], tolerance = 4): TextLine[] {
  const lines: TextLine[] = [];
  for (const item of items) {
    const y = item.transform[5];
    let line = lines.find((l) => Math.abs(l.y - y) <= tolerance);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  }
  lines.sort((a, b) => b.y - a.y);
  for (const line of lines) {
    line.items.sort((a, b) => a.transform[4] - b.transform[4]);
  }
  return lines;
}

function itemWidth(item: TextItem): number {
  if (item.width > 0) return item.width;
  const scale = Math.abs(item.transform[0]) || Math.abs(item.transform[3]) || 8;
  return item.str.length * scale;
}

function itemFontSize(item: TextItem): number {
  return Math.abs(item.height) || Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 12;
}

function lineTextFromItems(items: TextItem[]): string {
  if (!items.length) return '';

  let result = '';
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const str = item.str;
    if (!str) continue;

    if (i > 0) {
      const prev = items[i - 1];
      const prevEnd = prev.transform[4] + itemWidth(prev);
      const gap = item.transform[4] - prevEnd;
      const fontSize = Math.max(itemFontSize(prev), itemFontSize(item));
      if (gap > fontSize * 0.35) {
        result += ' ';
      }
    }
    result += str;
  }

  return result.replace(/\s+/g, ' ').trim();
}

function lineBounds(items: TextItem[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let fontSize = 12;
  let fontFamily = 'Helvetica';

  for (const item of items) {
    const x = item.transform[4];
    const y = item.transform[5];
    const h = itemFontSize(item);
    const w = itemWidth(item);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + w);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + h);
    fontSize = Math.max(fontSize, h);
    if (item.fontName) fontFamily = item.fontName;
  }

  return {
    pdfX: Number.isFinite(minX) ? minX : 0,
    pdfY: Number.isFinite(minY) ? minY : 0,
    pdfWidth: Math.max(8, maxX - minX),
    pdfHeight: Math.max(6, maxY - minY),
    fontSize: Math.min(72, Math.max(6, fontSize)),
    fontFamily,
  };
}

function mergeLineBounds(a: ReturnType<typeof lineBounds>, b: ReturnType<typeof lineBounds>) {
  const minX = Math.min(a.pdfX, b.pdfX);
  const minY = Math.min(a.pdfY, b.pdfY);
  const maxX = Math.max(a.pdfX + a.pdfWidth, b.pdfX + b.pdfWidth);
  const maxY = Math.max(a.pdfY + a.pdfHeight, b.pdfY + b.pdfHeight);
  return {
    pdfX: minX,
    pdfY: minY,
    pdfWidth: Math.max(8, maxX - minX),
    pdfHeight: Math.max(6, maxY - minY),
    fontSize: Math.max(a.fontSize, b.fontSize),
    fontFamily: a.fontFamily || b.fontFamily,
  };
}

/** Trích các block văn bản có tọa độ PDF (giữ ảnh/bảng nguyên gốc khi render lại). */
export async function extractLayoutBlocks(file: File): Promise<LayoutTextBlock[]> {
  const pdfjsLib = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  const blocks: LayoutTextBlock[] = [];
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const rawItems: TextItem[] = [];
    for (const raw of textContent.items) {
      if (!('str' in raw) || typeof raw.str !== 'string' || !raw.str.trim()) continue;
      const item = raw as TextItem;
      if (!item.transform) continue;
      rawItems.push(item);
    }

    const lines = groupIntoLines(rawItems);
    if (!lines.length) continue;

    let currentLines: TextLine[] = [];
    let currentBounds: ReturnType<typeof lineBounds> | null = null;
    let blockIndex = 0;

    const flushBlock = () => {
      if (!currentLines.length || !currentBounds) return;
      const text = currentLines.map((l) => lineTextFromItems(l.items)).filter(Boolean).join('\n').trim();
      if (!text || text.length < 2) {
        currentLines = [];
        currentBounds = null;
        return;
      }
      blocks.push({
        id: `p${pageNum}-b${blockIndex}`,
        pageNumber: pageNum,
        text,
        ...currentBounds,
      });
      blockIndex += 1;
      currentLines = [];
      currentBounds = null;
    };

    for (let li = 0; li < lines.length; li += 1) {
      const line = lines[li];
      const lineText = lineTextFromItems(line.items);
      if (!lineText) continue;

      const bounds = lineBounds(line.items);
      if (!currentLines.length) {
        currentLines = [line];
        currentBounds = bounds;
        continue;
      }

      const prevLine = currentLines[currentLines.length - 1];
      const verticalGap = prevLine.y - line.y;
      const gapThreshold = Math.max(currentBounds!.fontSize, bounds.fontSize) * 1.35;

      if (verticalGap > gapThreshold) {
        flushBlock();
        currentLines = [line];
        currentBounds = bounds;
      } else {
        currentLines.push(line);
        currentBounds = mergeLineBounds(currentBounds!, bounds);
      }

      if (blocks.length >= MAX_BLOCKS) break;
    }

    flushBlock();
    if (blocks.length >= MAX_BLOCKS) break;
  }

  return blocks.filter((b) => b.text.trim().length >= 2);
}

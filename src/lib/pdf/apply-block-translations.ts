import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import {
  extractTextLineRectsByPage,
  type TextLineRect,
} from '@/lib/pdf/extract-layout-blocks';
import type { LayoutTextBlock } from '@/lib/pdf/layout-blocks';
import { AVAILABLE_FONTS, type FontId } from '@/lib/pdf/processors/text-to-pdf';

const FONT_BY_LANG: Record<string, FontId> = {
  vi: 'noto-sans',
  ja: 'noto-sans-jp',
  ko: 'noto-sans-kr',
  zh: 'noto-sans-sc',
  'zh-TW': 'noto-sans-tc',
  ar: 'noto-sans-arabic',
};

const fontBytesCache = new Map<string, ArrayBuffer>();

async function loadNotoFont(fontId: FontId): Promise<ArrayBuffer> {
  const cached = fontBytesCache.get(fontId);
  if (cached) return cached;

  const config = AVAILABLE_FONTS.find((f) => f.id === fontId);
  if (!config || config.type !== 'noto' || !('url' in config)) {
    throw new Error(`Font ${fontId} không khả dụng.`);
  }

  const res = await fetch(config.url);
  if (!res.ok) throw new Error(`Không tải được font ${fontId}.`);
  const bytes = await res.arrayBuffer();
  fontBytesCache.set(fontId, bytes);
  return bytes;
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  return lines.length ? lines : [''];
}

type FittedLayout = {
  fontSize: number;
  lines: string[];
  lineHeight: number;
  renderWidth: number;
  renderHeight: number;
};

function measureLayout(
  text: string,
  font: PDFFont,
  fontSize: number,
  innerWidth: number,
): FittedLayout {
  const lines = wrapText(text, font, fontSize, innerWidth);
  const lineHeight = fontSize * 1.2;
  const renderWidth = Math.max(
    ...lines.map((line) => (line ? font.widthOfTextAtSize(line, fontSize) : 0)),
    0,
  );
  const renderHeight = lineHeight * Math.max(1, lines.length);
  return { fontSize, lines, lineHeight, renderWidth, renderHeight };
}

function fitTextInBlock(
  text: string,
  font: PDFFont,
  block: LayoutTextBlock,
  innerWidth: number,
): FittedLayout {
  const maxSize = Math.max(6, Math.min(block.fontSize, 72));
  const minSize = 5;
  const heightBudget = block.pdfHeight * 1.15;
  const widthBudget = innerWidth;

  let size = maxSize;
  while (size >= minSize) {
    const layout = measureLayout(text, font, size, widthBudget);
    const widthOk = layout.renderWidth <= widthBudget * 1.03 || layout.lines.length > 1;
    const heightOk = layout.renderHeight <= heightBudget;
    if (widthOk && heightOk) return layout;
    size -= 0.5;
  }

  return measureLayout(text, font, minSize, widthBudget);
}

type WipeRect = { x: number; y: number; width: number; height: number };

type TextBounds = Pick<LayoutTextBlock, 'pdfX' | 'pdfY' | 'pdfWidth' | 'pdfHeight'>;

function boundsOverlap(a: TextBounds, b: TextBounds, minGap = 2): boolean {
  const aTop = a.pdfY + a.pdfHeight;
  const bTop = b.pdfY + b.pdfHeight;
  const overlapY = Math.min(aTop, bTop) - Math.max(a.pdfY, b.pdfY);
  const overlapX =
    Math.min(a.pdfX + a.pdfWidth, b.pdfX + b.pdfWidth) - Math.max(a.pdfX, b.pdfX);
  return overlapY > minGap && overlapX > minGap;
}

/** Che sát từng dòng — không mở rộng full-width để giữ kẻ bảng / ảnh. */
function expandLineTight(line: TextLineRect): WipeRect {
  const padY = Math.max(3, line.fontSize * 0.32);
  const padX = Math.max(2, line.fontSize * 0.12);
  return {
    x: line.pdfX - padX,
    y: line.pdfY - padY,
    width: Math.max(4, line.pdfWidth + padX * 2),
    height: Math.max(4, line.pdfHeight + padY * 2),
  };
}

/** Fallback khi không khớp dòng — chỉ bbox block, không tràn sang vùng khác. */
function expandBlockTight(block: LayoutTextBlock): WipeRect {
  const padY = Math.max(4, block.fontSize * 0.35);
  const padX = Math.max(3, block.fontSize * 0.15);
  return {
    x: block.pdfX - padX,
    y: block.pdfY - padY,
    width: Math.max(6, block.pdfWidth + padX * 2),
    height: Math.max(5, block.pdfHeight + padY * 2),
  };
}

function mergeAdjacentWipeRects(rects: WipeRect[]): WipeRect[] {
  let pool = [...rects];
  let changed = true;

  while (changed) {
    changed = false;
    const next: WipeRect[] = [];
    const used = new Set<number>();

    for (let i = 0; i < pool.length; i++) {
      if (used.has(i)) continue;
      let merged = pool[i];

      for (let j = i + 1; j < pool.length; j++) {
        if (used.has(j)) continue;
        const other = pool[j];
        const vertGap = Math.min(
          Math.abs(merged.y - (other.y + other.height)),
          Math.abs(other.y - (merged.y + merged.height)),
        );
        const horizOverlap =
          Math.min(merged.x + merged.width, other.x + other.width) -
            Math.max(merged.x, other.x) >
          0;

        if (vertGap > 6 || !horizOverlap) continue;

        const x0 = Math.min(merged.x, other.x);
        const y0 = Math.min(merged.y, other.y);
        const x1 = Math.max(merged.x + merged.width, other.x + other.width);
        const y1 = Math.max(merged.y + merged.height, other.y + other.height);
        merged = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
        used.add(j);
        changed = true;
      }

      next.push(merged);
    }

    pool = next;
  }

  return pool;
}

function buildWipeRectsForBlock(
  block: LayoutTextBlock,
  pageLines: TextLineRect[],
): WipeRect[] {
  const matched = pageLines.filter((line) => boundsOverlap(line, block));
  if (matched.length > 0) {
    return mergeAdjacentWipeRects(matched.map(expandLineTight));
  }
  return [expandBlockTight(block)];
}

function drawTextWipe(page: PDFPage, rect: WipeRect): void {
  page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    color: rgb(1, 1, 1),
    opacity: 1,
    borderWidth: 0,
  });
}

type DrawBlock = {
  block: LayoutTextBlock;
  layout: FittedLayout;
  page: PDFPage;
  vPad: number;
};

export type ApplyBlockTranslationsOptions = {
  wipeLinesByPage?: Map<number, TextLineRect[]>;
};

function collectPageLines(fitzLines: TextLineRect[], pdfjsLines: TextLineRect[]): TextLineRect[] {
  const seen = new Set<string>();
  const out: TextLineRect[] = [];

  for (const line of [...fitzLines, ...pdfjsLines]) {
    const key = `${line.pdfX.toFixed(1)}:${line.pdfY.toFixed(1)}:${line.pdfWidth.toFixed(1)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }

  return out;
}

export async function applyBlockTranslations(
  pdfBytes: ArrayBuffer | Uint8Array,
  blocks: LayoutTextBlock[],
  translations: string[],
  targetLang: string,
  options?: ApplyBlockTranslationsOptions,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const fontId = FONT_BY_LANG[targetLang] ?? 'noto-sans';

  const fontkit = await import('@pdf-lib/fontkit');
  pdfDoc.registerFontkit(fontkit.default || fontkit);
  const fontBytes = await loadNotoFont(fontId);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });

  const translatedBlocks: Array<{ block: LayoutTextBlock; text: string; index: number }> = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const newText = (translations[i] ?? block.text).trim();
    if (!newText || newText === block.text.trim()) continue;
    translatedBlocks.push({ block, text: newText, index: i });
  }

  if (translatedBlocks.length === 0) {
    return pdfDoc.save();
  }

  const pdfjsLineRectsByPage = await extractTextLineRectsByPage(pdfBytes);
  const toDraw: DrawBlock[] = [];

  for (const { block, text } of translatedBlocks) {
    const pageIndex = block.pageNumber - 1;
    if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) continue;

    const page = pdfDoc.getPage(pageIndex);
    const fitzLines = options?.wipeLinesByPage?.get(block.pageNumber) ?? [];
    const pdfjsLines = pdfjsLineRectsByPage.get(block.pageNumber) ?? [];
    const pageLines = collectPageLines(fitzLines, pdfjsLines);

    const wipeRects = buildWipeRectsForBlock(block, pageLines);
    for (const rect of wipeRects) {
      drawTextWipe(page, rect);
    }

    const vPad = Math.max(4, block.fontSize * 0.35);
    const hPad = Math.max(3, block.fontSize * 0.15);
    const innerWidth = Math.max(8, block.pdfWidth - hPad * 2);
    const layout = fitTextInBlock(text, font, block, innerWidth);

    toDraw.push({ block, layout, page, vPad });
  }

  for (const { block, layout, page, vPad } of toDraw) {
    let lineY = block.pdfY + block.pdfHeight - layout.fontSize;
    const minY = block.pdfY - vPad;

    for (const line of layout.lines) {
      if (lineY < minY) break;
      if (!line) {
        lineY -= layout.lineHeight;
        continue;
      }
      page.drawText(line, {
        x: block.pdfX,
        y: lineY,
        size: layout.fontSize,
        font,
        color: rgb(0, 0, 0),
      });
      lineY -= layout.lineHeight;
    }
  }

  return pdfDoc.save();
}

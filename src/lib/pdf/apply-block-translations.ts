import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
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
  const heightBudget = block.pdfHeight * 1.02;
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

const PAD = 3;

type PreparedBlock = {
  block: LayoutTextBlock;
  layout: FittedLayout;
  page: PDFPage;
};

export async function applyBlockTranslations(
  pdfBytes: ArrayBuffer | Uint8Array,
  blocks: LayoutTextBlock[],
  translations: string[],
  targetLang: string,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const fontId = FONT_BY_LANG[targetLang] ?? 'noto-sans';

  const fontkit = await import('@pdf-lib/fontkit');
  pdfDoc.registerFontkit(fontkit.default || fontkit);
  const fontBytes = await loadNotoFont(fontId);
  const font = await pdfDoc.embedFont(fontBytes, { subset: false });

  const prepared: PreparedBlock[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const newText = (translations[i] ?? block.text).trim();
    if (!newText || newText === block.text) continue;

    const pageIndex = block.pageNumber - 1;
    if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) continue;

    const innerWidth = Math.max(8, block.pdfWidth - PAD);
    const layout = fitTextInBlock(newText, font, block, innerWidth);
    prepared.push({ block, layout, page: pdfDoc.getPage(pageIndex) });
  }

  // Pass 1: draw ALL white rects first — cover all original text
  for (const { block, page } of prepared) {
    page.drawRectangle({
      x: block.pdfX - PAD,
      y: block.pdfY - PAD,
      width: block.pdfWidth + PAD * 2,
      height: block.pdfHeight + PAD * 2,
      color: rgb(1, 1, 1),
      borderWidth: 0,
    });
  }

  // Pass 2: draw ALL translated text on top — no white rect can cover it
  for (const { block, layout, page } of prepared) {
    let lineY = block.pdfY + block.pdfHeight - layout.fontSize;
    const minY = block.pdfY - PAD;

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

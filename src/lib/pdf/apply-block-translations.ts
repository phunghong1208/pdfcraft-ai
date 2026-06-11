import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
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

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const newText = (translations[i] ?? block.text).trim();
    if (!newText || newText === block.text) continue;

    const pageIndex = block.pageNumber - 1;
    if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) continue;
    const page = pdfDoc.getPage(pageIndex);

    const fontSize = Math.max(6, Math.min(block.fontSize, 72));
    const padding = 2;
    const topPad = fontSize * 0.35;
    const innerWidth = Math.max(12, block.pdfWidth - padding);

    page.drawRectangle({
      x: block.pdfX - padding,
      y: block.pdfY - padding,
      width: block.pdfWidth + padding * 2,
      height: block.pdfHeight + padding * 2 + topPad,
      color: rgb(1, 1, 1),
      borderWidth: 0,
    });

    const lines = wrapText(newText, font, fontSize, innerWidth);
    const lineHeight = fontSize * 1.2;
    const blockHeight = Math.max(block.pdfHeight, lineHeight * lines.length);
    let lineY = block.pdfY + blockHeight - fontSize;

    for (const line of lines) {
      if (!line) {
        lineY -= lineHeight;
        continue;
      }
      page.drawText(line, {
        x: block.pdfX,
        y: lineY,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
      lineY -= lineHeight;
    }
  }

  return pdfDoc.save();
}

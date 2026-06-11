import { PDFDocument, rgb, StandardFonts, type PDFFont, type RGB } from 'pdf-lib';

export interface TextEdit {
  pageNumber: number;
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  fontSize: number;
  fontFamily: string;
  fontWeight?: string;
  fontStyle?: string;
  color?: string;
  textDecoration?: string;
  originalText: string;
  newText: string;
}

function parseFontNameFlags(name: string): { bold: boolean; italic: boolean } {
  const n = name.toLowerCase();
  let italic = /italic|oblique|ital|slanted|inclined|-itmt|-oblmt/.test(n);
  let bold = /bold|black|heavy|semibold|demi|extrabold|ultrabold|-bdmt|-boldmt/.test(n);
  if (/bolditalic|bold-italic|bold_oblique|boldoblique|bolditmt|bolditalicmt/.test(n)) {
    bold = true;
    italic = true;
  }
  return { bold, italic };
}

function isBold(weight?: string, family?: string): boolean {
  if (family) {
    const flags = parseFontNameFlags(family);
    if (flags.bold) return true;
  }
  if (!weight) return false;
  const w = weight.toLowerCase();
  return w === 'bold' || w === 'bolder' || (Number.parseInt(w, 10) || 0) >= 600;
}

function isItalic(style?: string, family?: string): boolean {
  if (family) {
    const flags = parseFontNameFlags(family);
    if (flags.italic) return true;
  }
  if (!style) return false;
  const s = style.toLowerCase();
  return s === 'italic' || s === 'oblique';
}

function resolveStandardFont(family: string, weight?: string, style?: string): StandardFonts {
  const bold = isBold(weight, family);
  const italic = isItalic(style, family);
  const serif = /times|serif|minion|utopia|georgia|roman/i.test(family);

  if (serif) {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
    if (bold) return StandardFonts.TimesRomanBold;
    if (italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }

  if (bold && italic) return StandardFonts.HelveticaBoldOblique;
  if (bold) return StandardFonts.HelveticaBold;
  if (italic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

function parseTextColor(color?: string): RGB {
  if (!color) return rgb(0, 0, 0);
  const match = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (match) {
    return rgb(Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255);
  }
  return rgb(0, 0, 0);
}

function isTextEdit(value: unknown): value is TextEdit {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.pageNumber === 'number' &&
    typeof v.pdfX === 'number' &&
    typeof v.pdfY === 'number' &&
    typeof v.pdfWidth === 'number' &&
    typeof v.pdfHeight === 'number' &&
    typeof v.fontSize === 'number' &&
    typeof v.fontFamily === 'string' &&
    typeof v.originalText === 'string' &&
    typeof v.newText === 'string'
  );
}

/** Validate text edits posted from the PDF.js iframe script. */
export function parseTextEdits(edits: unknown): TextEdit[] {
  if (!Array.isArray(edits)) return [];
  return edits.filter(isTextEdit);
}

export async function applyTextEdits(
  pdfBytes: ArrayBuffer | Uint8Array,
  edits: TextEdit[],
): Promise<Uint8Array> {
  if (!edits.length) return new Uint8Array(pdfBytes);

  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const fontCache = new Map<StandardFonts, PDFFont>();

  for (const edit of edits) {
    const pageIndex = edit.pageNumber - 1;
    if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) continue;
    const page = pdfDoc.getPage(pageIndex);

    const clampedSize = Math.max(6, Math.min(edit.fontSize, 72));
    const padding = 2;
    const topPad = clampedSize * 0.35;
    page.drawRectangle({
      x: edit.pdfX - padding,
      y: edit.pdfY - padding - topPad,
      width: edit.pdfWidth + padding * 2,
      height: edit.pdfHeight + padding * 2 + topPad,
      color: rgb(1, 1, 1),
      borderWidth: 0,
    });
    const fontKey = resolveStandardFont(edit.fontFamily, edit.fontWeight, edit.fontStyle);
    let font = fontCache.get(fontKey);
    if (!font) {
      font = await pdfDoc.embedFont(fontKey);
      fontCache.set(fontKey, font);
    }
    const textColor = parseTextColor(edit.color);

    const lineHeight = clampedSize * 1.25;
    const lines = edit.newText.split('\n');
    const blockHeight = Math.max(edit.pdfHeight, lineHeight * lines.length);
    let lineY = edit.pdfY + blockHeight - clampedSize;

    const underline = (edit.textDecoration ?? '').includes('underline');

    for (const line of lines) {
      const lineWidth = font.widthOfTextAtSize(line, clampedSize);
      page.drawText(line, {
        x: edit.pdfX,
        y: lineY,
        size: clampedSize,
        font,
        color: textColor,
      });
      if (underline && line.length > 0) {
        const underlineY = lineY - clampedSize * 0.12;
        page.drawLine({
          start: { x: edit.pdfX, y: underlineY },
          end: { x: edit.pdfX + lineWidth, y: underlineY },
          thickness: Math.max(0.5, clampedSize * 0.06),
          color: textColor,
        });
      }
      lineY -= lineHeight;
    }
  }

  return pdfDoc.save();
}

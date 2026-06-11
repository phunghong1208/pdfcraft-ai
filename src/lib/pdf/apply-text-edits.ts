import { PDFDocument, rgb, StandardFonts, type PDFFont, type RGB } from 'pdf-lib';

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fontSizeRatio?: number;
  fontFamily?: string;
  lineBreak?: boolean;
}

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
  scaleX?: number;
  textAlign?: string;
  richHtml?: string;
  richRuns?: TextRun[];
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

function isBold(weight?: string, family?: string, runBold?: boolean): boolean {
  if (runBold) return true;
  if (family) {
    const flags = parseFontNameFlags(family);
    if (flags.bold) return true;
  }
  if (!weight) return false;
  const w = weight.toLowerCase();
  return w === 'bold' || w === 'bolder' || (Number.parseInt(w, 10) || 0) >= 600;
}

function isItalic(style?: string, family?: string, runItalic?: boolean): boolean {
  if (runItalic) return true;
  if (family) {
    const flags = parseFontNameFlags(family);
    if (flags.italic) return true;
  }
  if (!style) return false;
  const s = style.toLowerCase();
  return s === 'italic' || s === 'oblique';
}

function resolveStandardFont(
  family: string,
  weight?: string,
  style?: string,
  runBold?: boolean,
  runItalic?: boolean,
): StandardFonts {
  const bold = isBold(weight, family, runBold);
  const italic = isItalic(style, family, runItalic);
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

function isTextRun(value: unknown): value is TextRun {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.text === 'string';
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

function runsToLines(runs: TextRun[]): TextRun[][] {
  const lines: TextRun[][] = [[]];
  for (const run of runs) {
    if (run.lineBreak || run.text === '\n') {
      lines.push([]);
      continue;
    }
    if (!run.text) continue;
    const parts = run.text.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) lines.push([]);
      if (parts[i]) lines[lines.length - 1].push({ ...run, text: parts[i] });
    }
  }
  return lines.filter((line) => line.length > 0);
}

async function drawRichTextEdit(
  page: ReturnType<PDFDocument['getPage']>,
  edit: TextEdit,
  fontCache: Map<string, PDFFont>,
  pdfDoc: PDFDocument,
): Promise<void> {
  const runs = (edit.richRuns ?? []).filter(isTextRun);
  if (!runs.length) return;

  const baseSize = Math.max(6, Math.min(edit.fontSize, 72));
  const scaleX = edit.scaleX && edit.scaleX > 0 ? edit.scaleX : 1;
  const lineHeight = baseSize * 1.25;
  const lines = runsToLines(runs);
  const blockHeight = Math.max(edit.pdfHeight, lineHeight * lines.length);

  const getFont = async (run: TextRun): Promise<PDFFont> => {
    const family = run.fontFamily || edit.fontFamily;
    const key = resolveStandardFont(family, edit.fontWeight, edit.fontStyle, run.bold, run.italic);
    const cacheKey = String(key);
    let font = fontCache.get(cacheKey);
    if (!font) {
      font = await pdfDoc.embedFont(key);
      fontCache.set(cacheKey, font);
    }
    return font;
  };

  let lineY = edit.pdfY + blockHeight - baseSize;

  for (const line of lines) {
    let lineWidth = 0;
    const segments: { run: TextRun; font: PDFFont; size: number; width: number }[] = [];
    for (const run of line) {
      const ratio = run.fontSizeRatio && run.fontSizeRatio > 0 ? run.fontSizeRatio : 1;
      const size = Math.max(6, Math.min(baseSize * ratio, 72));
      const font = await getFont(run);
      const width = font.widthOfTextAtSize(run.text, size) * scaleX;
      segments.push({ run, font, size, width });
      lineWidth += width;
    }

    const align = edit.textAlign || 'left';
    let cursorX = edit.pdfX;
    if (align === 'center') cursorX = edit.pdfX + Math.max(0, (edit.pdfWidth - lineWidth) / 2);
    else if (align === 'right') cursorX = edit.pdfX + Math.max(0, edit.pdfWidth - lineWidth);

    for (const seg of segments) {
      const color = parseTextColor(seg.run.color || edit.color);
      page.drawText(seg.run.text, {
        x: cursorX,
        y: lineY,
        size: seg.size,
        font: seg.font,
        color,
      });
      if (seg.run.underline) {
        const underlineY = lineY - seg.size * 0.12;
        page.drawLine({
          start: { x: cursorX, y: underlineY },
          end: { x: cursorX + seg.width, y: underlineY },
          thickness: Math.max(0.5, seg.size * 0.06),
          color,
        });
      }
      cursorX += seg.width;
    }
    lineY -= lineHeight;
  }
}

export async function applyTextEdits(
  pdfBytes: ArrayBuffer | Uint8Array,
  edits: TextEdit[],
): Promise<Uint8Array> {
  if (!edits.length) return new Uint8Array(pdfBytes);

  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const fontCache = new Map<string, PDFFont>();

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

    const hasRichRuns = Array.isArray(edit.richRuns) && edit.richRuns.some((r) => isTextRun(r) && r.text);
    if (hasRichRuns) {
      await drawRichTextEdit(page, edit, fontCache, pdfDoc);
      continue;
    }

    const fontKey = resolveStandardFont(edit.fontFamily, edit.fontWeight, edit.fontStyle);
    const cacheKey = String(fontKey);
    let font = fontCache.get(cacheKey);
    if (!font) {
      font = await pdfDoc.embedFont(fontKey);
      fontCache.set(cacheKey, font);
    }
    const textColor = parseTextColor(edit.color);
    const scaleX = edit.scaleX && edit.scaleX > 0 ? edit.scaleX : 1;

    const lineHeight = clampedSize * 1.25;
    const lines = edit.newText.split('\n');
    const blockHeight = Math.max(edit.pdfHeight, lineHeight * lines.length);
    let lineY = edit.pdfY + blockHeight - clampedSize;

    const underline = (edit.textDecoration ?? '').includes('underline');

    for (const line of lines) {
      const lineWidth = font.widthOfTextAtSize(line, clampedSize) * scaleX;
      const align = edit.textAlign || 'left';
      let lineX = edit.pdfX;
      if (align === 'center') lineX = edit.pdfX + Math.max(0, (edit.pdfWidth - lineWidth) / 2);
      else if (align === 'right') lineX = edit.pdfX + Math.max(0, edit.pdfWidth - lineWidth);

      page.drawText(line, {
        x: lineX,
        y: lineY,
        size: clampedSize,
        font,
        color: textColor,
      });
      if (underline && line.length > 0) {
        const underlineY = lineY - clampedSize * 0.12;
        page.drawLine({
          start: { x: lineX, y: underlineY },
          end: { x: lineX + lineWidth, y: underlineY },
          thickness: Math.max(0.5, clampedSize * 0.06),
          color: textColor,
        });
      }
      lineY -= lineHeight;
    }
  }

  return pdfDoc.save();
}

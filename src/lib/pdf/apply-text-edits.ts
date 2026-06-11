import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface TextEdit {
  pageNumber: number;
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  fontSize: number;
  fontFamily: string;
  originalText: string;
  newText: string;
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
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const edit of edits) {
    const pageIndex = edit.pageNumber - 1;
    if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) continue;
    const page = pdfDoc.getPage(pageIndex);

    const padding = 2;
    page.drawRectangle({
      x: edit.pdfX - padding,
      y: edit.pdfY - padding,
      width: edit.pdfWidth + padding * 2,
      height: edit.pdfHeight + padding * 2,
      color: rgb(1, 1, 1),
      borderWidth: 0,
    });

    const clampedSize = Math.max(6, Math.min(edit.fontSize, 72));
    const lineHeight = clampedSize * 1.25;
    const lines = edit.newText.split('\n');
    const blockHeight = Math.max(edit.pdfHeight, lineHeight * lines.length);
    let lineY = edit.pdfY + blockHeight - clampedSize;

    for (const line of lines) {
      page.drawText(line, {
        x: edit.pdfX,
        y: lineY,
        size: clampedSize,
        font,
        color: rgb(0, 0, 0),
      });
      lineY -= lineHeight;
    }
  }

  return pdfDoc.save();
}

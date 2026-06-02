import { loadPdfjs } from '@/lib/pdf/loader';

const MAX_PAGES = 80;
const MAX_CHARS = 80_000;

export type PdfSpeechSegment = {
  pageNumber: number;
  charStart: number;
  charEnd: number;
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
};

export type PdfSpeechIndex = {
  text: string;
  segments: PdfSpeechSegment[];
};

type TextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
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

/** Ghép item trên cùng dòng — PDF hay tách từng ký tự, không được chèn space giữa chúng. */
function lineTextFromItems(items: TextItem[]): string {
  if (!items.length) return '';

  const tokenCodePointLen = (s: string) => Array.from(s).length;
  const mergeSingleCharTokensIfNeeded = (s: string) => {
    // Trường hợp PDF tách từng ký tự và chèn space: "Q u y" => "Quy".
    const tokens = s.split(' ').filter(Boolean);
    if (tokens.length < 4) return s;
    if (tokens.every((tok) => tokenCodePointLen(tok) === 1)) {
      return tokens.join('');
    }
    return s;
  };

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

  const collapsed = result.replace(/\s+/g, ' ').trim();
  return mergeSingleCharTokensIfNeeded(collapsed);
}

function segmentForLine(
  pageNum: number,
  items: TextItem[],
  charStart: number,
  charEnd: number,
): PdfSpeechSegment {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const item of items) {
    const x = item.transform[4];
    const y = item.transform[5];
    const h = Math.abs(item.height) || Math.abs(item.transform[3]) || 12;
    const w = item.width || item.str.trim().length * (Math.abs(item.transform[0]) || 8);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + w);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + h);
  }

  return {
    pageNumber: pageNum,
    charStart,
    charEnd,
    pdfX: Number.isFinite(minX) ? minX : 0,
    pdfY: Number.isFinite(maxY) ? maxY : 0,
    pdfWidth: Math.max(4, maxX - minX),
    pdfHeight: Math.max(4, maxY - minY),
  };
}

/** Trích text theo dòng; mỗi segment = một dòng (highlight read-along khớp TTS). */
export async function buildPdfSpeechIndex(file: File): Promise<PdfSpeechIndex> {
  const pdfjsLib = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  const segments: PdfSpeechSegment[] = [];
  const pageTexts: string[] = [];
  let globalOffset = 0;
  let totalChars = 0;
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
    const lineStrings: string[] = [];

    if (pageTexts.length > 0) {
      globalOffset += 2;
    }

    for (let li = 0; li < lines.length; li += 1) {
      const line = lines[li];
      const lineText = lineTextFromItems(line.items);
      if (!lineText) continue;

      const charStart = globalOffset;
      const charEnd = charStart + lineText.length;
      segments.push(segmentForLine(pageNum, line.items, charStart, charEnd));

      lineStrings.push(lineText);
      globalOffset = charEnd;
      totalChars += lineText.length;

      if (li < lines.length - 1) {
        globalOffset += 1;
      }
    }

    const pageText = lineStrings.join('\n').trim();
    if (!pageText) continue;

    pageTexts.push(pageText);
    if (totalChars >= MAX_CHARS) break;
  }

  const text = pageTexts.join('\n\n').slice(0, MAX_CHARS).trim();
  return {
    text,
    segments: segments.filter((s) => s.charStart < text.length && s.charEnd > s.charStart),
  };
}

export async function extractTextFromPdfFile(file: File): Promise<string> {
  const { text } = await buildPdfSpeechIndex(file);
  return text;
}

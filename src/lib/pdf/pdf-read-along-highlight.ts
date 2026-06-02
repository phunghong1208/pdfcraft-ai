import type { PdfSpeechSegment } from '@/lib/pdf/pdf-speech-index';

type PdfViewerApp = {
  pdfViewer?: unknown;
  page?: number;
};

function getApp(iframe: HTMLIFrameElement | null): PdfViewerApp | null {
  const win = iframe?.contentWindow as (Window & { PDFViewerApplication?: PdfViewerApp }) | null;
  return win?.PDFViewerApplication ?? null;
}

function findSegmentsInRange(
  segments: PdfSpeechSegment[],
  charIndex: number,
  charLength: number,
): PdfSpeechSegment[] {
  const end = charIndex + Math.max(charLength, 1);
  return segments.filter((s) => s.charEnd > charIndex && s.charStart < end);
}

function scrollPageIntoView(doc: Document, pageEl: HTMLElement): void {
  const container = doc.getElementById('viewerContainer');
  if (!container) {
    pageEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  const pageTop = pageEl.offsetTop;
  const target = pageTop - container.clientHeight / 2 + pageEl.clientHeight / 2;
  container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
}

/** Xóa overlay read-along cũ (legacy). */
export function clearReadAlongHighlight(iframe: HTMLIFrameElement | null): void {
  const doc = iframe?.contentDocument;
  if (!doc) return;
  doc.querySelectorAll('.pdfcraft-read-along-layer').forEach((el) => el.remove());
}

/**
 * Read-along: chỉ cuộn tới trang/dòng — không tự vẽ highlight.
 * Highlight có sẵn trong PDF do AnnotationLayer của PDF.js render.
 */
export function applyReadAlongHighlight(
  iframe: HTMLIFrameElement | null,
  segments: PdfSpeechSegment[],
  charIndex: number,
  charLength = 1,
  retry = 0,
): void {
  const doc = iframe?.contentDocument;
  const app = getApp(iframe);
  if (!doc || !segments.length) return;

  if (!app) {
    if (retry < 12) {
      window.setTimeout(
        () => applyReadAlongHighlight(iframe, segments, charIndex, charLength, retry + 1),
        300,
      );
    }
    return;
  }

  const active = findSegmentsInRange(segments, charIndex, charLength);
  if (!active.length) return;

  clearReadAlongHighlight(iframe);

  const primaryPage = active[0].pageNumber;
  if (typeof app.page === 'number' && app.page !== primaryPage) {
    app.page = primaryPage;
  }

  const pageEl = doc.querySelector(
    `.page[data-page-number="${primaryPage}"]`,
  ) as HTMLElement | null;
  if (pageEl) scrollPageIntoView(doc, pageEl);
}

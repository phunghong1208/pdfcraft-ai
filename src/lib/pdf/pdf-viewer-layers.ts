/** Điều khiển layer PDF.js trong iframe — không tự vẽ highlight. */

export type PdfViewerLayerSettings = {
  original: boolean;
  textLayer: boolean;
  annotationLayer: boolean;
  ocrLayer: boolean;
};

export const PDF_VIEWER_LAYER_STORAGE_KEY = 'pdfcraft-viewer-layers';

export const DEFAULT_PDF_VIEWER_LAYERS: PdfViewerLayerSettings = {
  original: true,
  textLayer: false,
  annotationLayer: true,
  ocrLayer: false,
};

export function loadPdfViewerLayerSettings(): PdfViewerLayerSettings {
  if (typeof window === 'undefined') return DEFAULT_PDF_VIEWER_LAYERS;
  try {
    const raw = localStorage.getItem(PDF_VIEWER_LAYER_STORAGE_KEY);
    if (!raw) return DEFAULT_PDF_VIEWER_LAYERS;
    const parsed = JSON.parse(raw) as Partial<PdfViewerLayerSettings>;
    return { ...DEFAULT_PDF_VIEWER_LAYERS, ...parsed };
  } catch {
    return DEFAULT_PDF_VIEWER_LAYERS;
  }
}

export function savePdfViewerLayerSettings(settings: PdfViewerLayerSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PDF_VIEWER_LAYER_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

/** PDF scan thường có canvas ảnh + text layer dày (OCR). */
export function detectScanLikePdf(doc: Document): boolean {
  const pages = doc.querySelectorAll('.pdfViewer .page');
  if (!pages.length) return false;

  let scanPages = 0;
  pages.forEach((page) => {
    const canvas = page.querySelector('.canvasWrapper canvas');
    const spanCount = page.querySelectorAll('.textLayer span').length;
    if (canvas && spanCount > 40) scanPages += 1;
  });

  return scanPages >= Math.max(1, Math.ceil(pages.length * 0.5));
}

export function applyPdfViewerLayers(
  doc: Document | null | undefined,
  settings: PdfViewerLayerSettings,
  options?: { isScanLike?: boolean },
): void {
  if (!doc?.documentElement) return;

  const root = doc.documentElement;
  root.dataset.pdfcraftOriginal = settings.original ? '1' : '0';
  root.dataset.pdfcraftText = settings.textLayer ? '1' : '0';
  root.dataset.pdfcraftAnnotation = settings.annotationLayer ? '1' : '0';
  root.dataset.pdfcraftOcr = settings.ocrLayer ? '1' : '0';
  root.dataset.pdfcraftScan = options?.isScanLike ? '1' : '0';

  doc.querySelectorAll('.pdfcraft-read-along-layer').forEach((el) => el.remove());
}

export function applyPdfViewerLayersToIframe(
  iframe: HTMLIFrameElement | null,
  settings: PdfViewerLayerSettings,
): void {
  const doc = iframe?.contentDocument;
  if (!doc) return;
  const isScanLike = detectScanLikePdf(doc);
  applyPdfViewerLayers(doc, settings, { isScanLike });
}

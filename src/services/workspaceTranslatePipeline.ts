import { extractTextFromPdfFile } from '@/lib/pdf/extract-pdf-text';
import type { LayoutTextBlock } from '@/lib/pdf/layout-blocks';
import {
  parseOcrLanguageCodes,
  runSmartOcr,
  type OCRLanguage,
} from '@/lib/pdf/processors/ocr';
import { APP_TO_TESSERACT } from '@/lib/pdf/product-tesseract-langs';
import {
  extractDocumentLayoutBlocks,
  type LayoutEngine,
} from '@/services/layoutExtractApi';
import { translateBlockTexts } from '@/services/translateBlocksApi';

export type TranslatePipelineStage = 'check' | 'ocr' | 'blocks' | 'translate' | 'pdf' | 'done';

export type TranslatePipelineProgress = {
  stage: TranslatePipelineStage;
  percent: number;
  message: string;
};

export type RunWorkspaceTranslateOptions = {
  file: File;
  sourceLang: string;
  targetLang: string;
  onProgress?: (progress: TranslatePipelineProgress) => void;
  /** Skip AI translation — use original block text as-is. For render testing. */
  passthroughTranslation?: boolean;
};

export type WorkspaceTranslateResult = {
  translatedText: string;
  pdfBlob: Blob;
  pdfFileName: string;
  ocrApplied: boolean;
  ocrMethod?: string;
  blockCount?: number;
  layoutEngine?: LayoutEngine;
  outputFormat?: 'pdf' | 'docx';
};

const MIN_EXTRACTABLE_CHARS = 64;
const RENDER_TIMEOUT_MS = 300_000;

const OCR_LANG_MAP: Record<string, OCRLanguage> = APP_TO_TESSERACT;

function emit(
  onProgress: RunWorkspaceTranslateOptions['onProgress'],
  stage: TranslatePipelineStage,
  percent: number,
  message: string,
) {
  onProgress?.({ stage, percent, message });
}

function ocrLanguagesForSource(sourceLang: string): OCRLanguage[] {
  // 'auto' (UI chỉ chọn đích): không biết nguồn → OCR phủ tiếng Việt + Anh.
  if (sourceLang === 'auto') {
    return parseOcrLanguageCodes('vie+eng');
  }
  const primary = OCR_LANG_MAP[sourceLang] ?? 'eng';
  const langs = primary === 'eng' ? ['eng'] : [primary, 'eng'];
  return parseOcrLanguageCodes(langs.join('+'));
}

function buildTranslatedPdfName(originalName: string, targetLang: string): string {
  const base = originalName.replace(/\.[^.]+$/, '') || 'document';
  return `${base}-translated-${targetLang}.pdf`;
}

async function ensureTextLayerPdf(
  file: File,
  sourceLang: string,
  onProgress?: RunWorkspaceTranslateOptions['onProgress'],
): Promise<{ file: File; ocrApplied: boolean; ocrMethod?: string }> {
  emit(onProgress, 'check', 8, 'Đang kiểm tra lớp văn bản…');
  let extracted = '';
  try {
    extracted = (await extractTextFromPdfFile(file)).trim();
  } catch {
    extracted = '';
  }

  if (extracted.length >= MIN_EXTRACTABLE_CHARS) {
    emit(onProgress, 'check', 18, 'PDF đã có văn bản — bỏ qua OCR.');
    return { file, ocrApplied: false };
  }

  emit(onProgress, 'ocr', 22, 'Đang OCR (RapidOCR)…');
  const ocrOut = await runSmartOcr(
    file,
    {
      languages: ocrLanguagesForSource(sourceLang),
      outputFormat: 'pdf',
      forceOcr: false,
    },
    (pct) => {
      const mapped = 22 + Math.round((pct / 100) * 38);
      emit(onProgress, 'ocr', mapped, 'Đang OCR…');
    },
  );

  if (!ocrOut.success || !ocrOut.result) {
    throw new Error(ocrOut.error?.message || 'OCR thất bại.');
  }

  const blob = ocrOut.result as Blob;
  const ocrFile = new File(
    [blob],
    file.name.replace(/\.pdf$/i, '') + '-ocr.pdf',
    { type: 'application/pdf' },
  );
  const method =
    typeof ocrOut.metadata?.ocrMethod === 'string' ? ocrOut.metadata.ocrMethod : undefined;

  emit(onProgress, 'ocr', 62, method === 'extract' ? 'Đã trích text nhanh.' : 'OCR xong rồi! Kiên nhẫn nhé, sắp dịch xong…');
  return { file: ocrFile, ocrApplied: true, ocrMethod: method };
}

function serializeWipeLines(
  wipeLinesByPage: Map<number, { pdfX: number; pdfY: number; pdfWidth: number; pdfHeight: number; fontSize: number }[]>,
): string {
  const arr: Array<Record<string, number>> = [];
  wipeLinesByPage.forEach((lines, pageNumber) => {
    for (const l of lines) {
      arr.push({
        pageNumber,
        pdfX: l.pdfX,
        pdfY: l.pdfY,
        pdfWidth: l.pdfWidth,
        pdfHeight: l.pdfHeight,
        fontSize: l.fontSize,
      });
    }
  });
  return JSON.stringify(arr);
}

async function renderOnServer(
  pdfFile: File,
  blocks: LayoutTextBlock[],
  translatedTexts: string[],
  targetLang: string,
  wipeLinesByPage: Map<number, { pdfX: number; pdfY: number; pdfWidth: number; pdfHeight: number; fontSize: number }[]>,
  debugOcr = false,
): Promise<Blob> {
  const form = new FormData();
  form.append('file', pdfFile);
  form.append('blocks_json', JSON.stringify(blocks));
  form.append('translations_json', JSON.stringify(translatedTexts));
  form.append('target_lang', targetLang);
  if (wipeLinesByPage.size > 0) {
    form.append('wipe_lines_json', serializeWipeLines(wipeLinesByPage));
  }
  if (debugOcr) {
    form.append('debug_ocr', '1');
  }

  const res = await fetch('/api/render-pdf', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
  });

  if (!res.ok) {
    let detail = 'Render PDF thất bại.';
    try {
      const json = await res.json();
      detail = json.detail || detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }

  return res.blob();
}

export async function runWorkspaceTranslatePipeline(
  opts: RunWorkspaceTranslateOptions,
): Promise<WorkspaceTranslateResult> {
  const { file, sourceLang, targetLang, onProgress, passthroughTranslation } = opts;

  emit(onProgress, 'blocks', 10, 'Đang trích block (pdfplumber)…');
  const layoutResult = await extractDocumentLayoutBlocks(file, sourceLang);

  let pdfFile: File;
  let ocrApplied = false;
  let ocrMethod: string | undefined;
  let blocks = layoutResult.blocks;
  let wipeLinesByPage = layoutResult.wipeLinesByPage;
  let layoutEngine: LayoutEngine = layoutResult.engine;

  const blockChars = blocks.reduce((sum, b) => sum + b.text.trim().length, 0);
  const layoutReady =
    (layoutResult.engine === 'fitz' || layoutResult.engine === 'pdfplumber') &&
    blocks.length >= 6 &&
    blockChars >= 96;

  if (layoutReady) {
    emit(onProgress, 'blocks', 62, `Trích xong! Kiên nhẫn nhé, đang dịch cho bạn…`);
    pdfFile = file;
  } else {
    const prepared = await ensureTextLayerPdf(file, sourceLang, onProgress);
    pdfFile = prepared.file;
    ocrApplied = prepared.ocrApplied;
    ocrMethod = prepared.ocrMethod;

    emit(onProgress, 'blocks', 64, 'Đang trích block lại sau OCR…');
    const fallback = await extractDocumentLayoutBlocks(pdfFile, sourceLang);
    blocks = fallback.blocks;
    wipeLinesByPage = fallback.wipeLinesByPage;
    layoutEngine = fallback.engine;

    emit(onProgress, 'blocks', 65, 'OCR xong rồi! Kiên nhẫn nhé, sắp dịch xong…');
  }

  if (!blocks.length) {
    throw new Error('Không trích được block văn bản từ PDF.');
  }

  let translatedTexts: string[];
  if (passthroughTranslation) {
    emit(onProgress, 'translate', 88, `Passthrough — dùng text gốc (${blocks.length} block)…`);
    translatedTexts = blocks.map((b) => b.text);
  } else {
    emit(
      onProgress,
      'translate',
      70,
      `Đang dịch ${blocks.length} block (${layoutEngine})…`,
    );
    translatedTexts = await translateBlockTexts(
      blocks.map((b) => b.text),
      sourceLang,
      targetLang,
      (done, total) => {
        const pct = 70 + Math.round((done / total) * 18);
        emit(onProgress, 'translate', pct, `Đang dịch block ${done}/${total}…`);
      },
    );
  }

  emit(onProgress, 'pdf', 90, 'ReportLab — render bản dịch…');
  const pdfBlob = await renderOnServer(pdfFile, blocks, translatedTexts, targetLang, wipeLinesByPage, passthroughTranslation);
  const pdfFileName = buildTranslatedPdfName(file.name, targetLang);

  const translatedText = translatedTexts.filter(Boolean).join('\n\n').trim();

  emit(onProgress, 'done', 100, 'Hoàn tất.');

  return {
    translatedText,
    pdfBlob,
    pdfFileName,
    ocrApplied,
    ocrMethod,
    blockCount: blocks.length,
    layoutEngine,
  };
}


// ---------------------------------------------------------------------------
// DOCX-based translation pipeline: PDF → DOCX → translate → DOCX
// ---------------------------------------------------------------------------

function buildTranslatedDocxName(originalName: string, targetLang: string): string {
  const base = originalName.replace(/\.[^.]+$/, '') || 'document';
  return `${base}-translated-${targetLang}.docx`;
}

export async function runWorkspaceTranslateDocxPipeline(
  opts: RunWorkspaceTranslateOptions,
): Promise<WorkspaceTranslateResult> {
  const { file, sourceLang, targetLang, onProgress, passthroughTranslation } = opts;

  emit(onProgress, 'blocks', 10, 'Đang chuyển PDF sang DOCX…');

  const extractForm = new FormData();
  extractForm.append('file', file);
  extractForm.append('mode', 'auto');

  const extractRes = await fetch('/api/docx-extract-texts', {
    method: 'POST',
    body: extractForm,
    signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
  });

  if (!extractRes.ok) {
    let detail = 'Chuyển đổi DOCX thất bại.';
    try {
      const j = await extractRes.json();
      detail = j.detail || detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }

  const { docx_id, texts } = (await extractRes.json()) as {
    docx_id: string;
    texts: { id: number; text: string; translatable?: boolean }[];
  };

  emit(onProgress, 'blocks', 40, `Trích xong ${texts.length} đoạn từ DOCX.`);

  if (!texts.length) {
    throw new Error('Không trích được text từ DOCX.');
  }

  const translatableFlags = texts.map((t) => t.translatable !== false);
  const translatableCount = translatableFlags.filter(Boolean).length;

  let translatedTexts: string[];
  if (passthroughTranslation) {
    translatedTexts = texts.map((t) => t.text);
  } else {
    emit(onProgress, 'translate', 45, `Đang dịch ${translatableCount} đoạn…`);
    translatedTexts = await translateBlockTexts(
      texts.map((t) => t.text),
      sourceLang,
      targetLang,
      (done, total) => {
        const pct = 45 + Math.round((done / total) * 40);
        emit(onProgress, 'translate', pct, `Đang dịch ${done}/${total}…`);
      },
      translatableFlags,
    );
  }

  emit(onProgress, 'pdf', 88, 'Đang áp dụng bản dịch vào DOCX…');

  const translations = texts.map((t, i) => ({
    id: t.id,
    translated: translatedTexts[i] || t.text,
  }));

  const applyForm = new FormData();
  applyForm.append('docx_id', docx_id);
  applyForm.append('translations_json', JSON.stringify(translations));
  applyForm.append('filename', buildTranslatedDocxName(file.name, targetLang));

  const applyRes = await fetch('/api/docx-apply-translations', {
    method: 'POST',
    body: applyForm,
    signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
  });

  if (!applyRes.ok) {
    let detail = 'Áp dụng bản dịch DOCX thất bại.';
    try {
      const j = await applyRes.json();
      detail = j.detail || detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }

  const docxBlob = await applyRes.blob();
  const translatedText = translatedTexts.filter(Boolean).join('\n\n').trim();

  emit(onProgress, 'done', 100, 'Hoàn tất.');

  return {
    translatedText,
    pdfBlob: docxBlob,
    pdfFileName: buildTranslatedDocxName(file.name, targetLang),
    ocrApplied: false,
    blockCount: texts.length,
    outputFormat: 'docx',
  };
}

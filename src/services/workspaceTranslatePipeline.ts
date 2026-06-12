import { applyBlockTranslations } from '@/lib/pdf/apply-block-translations';
import { extractTextFromPdfFile } from '@/lib/pdf/extract-pdf-text';
import {
  parseOcrLanguageCodes,
  runSmartOcr,
  type OCRLanguage,
} from '@/lib/pdf/processors/ocr';
import { extractDocumentLayoutBlocks } from '@/services/layoutExtractApi';
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
};

export type WorkspaceTranslateResult = {
  translatedText: string;
  pdfBlob: Blob;
  pdfFileName: string;
  ocrApplied: boolean;
  ocrMethod?: string;
  blockCount?: number;
  layoutEngine?: 'pdfjs';
};

const MIN_EXTRACTABLE_CHARS = 64;

const OCR_LANG_MAP: Record<string, OCRLanguage> = {
  vi: 'vie',
  en: 'eng',
  ja: 'jpn',
  ko: 'kor',
  zh: 'chi_sim',
  'zh-TW': 'chi_tra',
  es: 'spa',
  fr: 'fra',
  de: 'deu',
  pt: 'por',
  ar: 'ara',
  it: 'ita',
  id: 'ind',
  ro: 'ron',
};

function emit(
  onProgress: RunWorkspaceTranslateOptions['onProgress'],
  stage: TranslatePipelineStage,
  percent: number,
  message: string,
) {
  onProgress?.({ stage, percent, message });
}

function ocrLanguagesForSource(sourceLang: string): OCRLanguage[] {
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

  emit(onProgress, 'ocr', 22, 'Đang OCR (OCRmyPDF)…');
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

  emit(onProgress, 'ocr', 62, method === 'extract' ? 'Đã trích text nhanh.' : 'OCR xong.');
  return { file: ocrFile, ocrApplied: true, ocrMethod: method };
}

export async function runWorkspaceTranslatePipeline(
  opts: RunWorkspaceTranslateOptions,
): Promise<WorkspaceTranslateResult> {
  const { file, sourceLang, targetLang, onProgress } = opts;

  const prepared = await ensureTextLayerPdf(file, sourceLang, onProgress);

  emit(onProgress, 'blocks', 64, 'Đang trích block + bbox…');
  const layout = await extractDocumentLayoutBlocks(prepared.file);
  const { blocks, engine: layoutEngine } = layout;

  if (!blocks.length) {
    throw new Error('Không trích được block văn bản từ PDF.');
  }

  emit(
    onProgress,
    'translate',
    70,
    `GPT dịch ${blocks.length} block (${layoutEngine})…`,
  );
  const translatedTexts = await translateBlockTexts(
    blocks.map((b) => b.text),
    sourceLang,
    targetLang,
    (done, total) => {
      const pct = 70 + Math.round((done / total) * 18);
      emit(onProgress, 'translate', pct, `Đang dịch block ${done}/${total}…`);
    },
  );

  emit(onProgress, 'pdf', 90, 'pdf-lib — render lại đúng tọa độ…');
  const pdfBytes = await prepared.file.arrayBuffer();
  const outputBytes = await applyBlockTranslations(pdfBytes, blocks, translatedTexts, targetLang);
  const pdfBlob = new Blob([new Uint8Array(outputBytes)], { type: 'application/pdf' });
  const pdfFileName = buildTranslatedPdfName(file.name, targetLang);

  const translatedText = translatedTexts.filter(Boolean).join('\n\n').trim();

  emit(onProgress, 'done', 100, 'Hoàn tất.');

  return {
    translatedText,
    pdfBlob,
    pdfFileName,
    ocrApplied: prepared.ocrApplied,
    ocrMethod: prepared.ocrMethod,
    blockCount: blocks.length,
    layoutEngine,
  };
}

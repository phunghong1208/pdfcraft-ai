import { extractTextFromPdfFile } from '@/lib/pdf/extract-pdf-text';
import {
  parseOcrLanguageCodes,
  runSmartOcr,
  type OCRLanguage,
} from '@/lib/pdf/processors/ocr';
import { translateDocument } from '@/services/translateDocsApi';

export type TranslatePipelineStage = 'check' | 'ocr' | 'translate' | 'pdf' | 'done';

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

  emit(onProgress, 'ocr', 22, 'Đang OCR (trích văn bản từ PDF scan)…');
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

  emit(onProgress, 'translate', 68, 'Đang dịch bằng AI (giữ bố cục)…');
  const translated = await translateDocument(prepared.file, {
    sourceLang,
    targetLang,
    outputType: 'keep_layout',
  });

  if (translated.kind !== 'pdf') {
    throw new Error('Server dịch không trả PDF giữ bố cục.');
  }

  const pdfBlob = translated.blob;
  const pdfFileName = translated.fileName || buildTranslatedPdfName(file.name, targetLang);

  emit(onProgress, 'pdf', 88, 'Đang trích văn bản xem trước…');

  let translatedText = '';
  try {
    const previewFile = new File([pdfBlob], pdfFileName, { type: 'application/pdf' });
    translatedText = (await extractTextFromPdfFile(previewFile)).trim();
  } catch {
    translatedText = '';
  }

  emit(onProgress, 'done', 100, 'Hoàn tất.');

  return {
    translatedText,
    pdfBlob,
    pdfFileName,
    ocrApplied: prepared.ocrApplied,
    ocrMethod: prepared.ocrMethod,
  };
}

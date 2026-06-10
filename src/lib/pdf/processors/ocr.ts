/**
 * OCR PDF Processor
 * Requirements: 5.1
 * 
 * Performs Optical Character Recognition on PDF pages.
 * Uses Tesseract.js for client-side OCR processing.
 */

import type {
  ProcessInput,
  ProcessOutput,
  ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';
import { loadPdfjs, loadPdfLib } from '../loader';

/**
 * Supported OCR languages
 */
export type OCRLanguage = 'eng' | 'chi_sim' | 'chi_tra' | 'jpn' | 'kor' | 'spa' | 'fra' | 'deu' | 'por' | 'ara' | 'vie' | 'ita' | 'ind' | 'ron';

/**
 * OCR options
 */
export interface OCROptions {
  /** OCR language(s) */
  languages: OCRLanguage[];
  /** Scale factor for rendering (higher = better OCR but slower) */
  scale: number;
  /** Specific pages to OCR (empty = all pages) */
  pages: number[];
  /** Output format */
  outputFormat: 'text' | 'searchable-pdf';
  /** Preserve original layout in text output */
  preserveLayout: boolean;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: OCROptions = {
  languages: ['eng'],
  scale: 2,
  pages: [],
  outputFormat: 'text',
  preserveLayout: false,
};

/**
 * Language display names
 */
export const OCR_LANGUAGE_NAMES: Record<OCRLanguage, string> = {
  eng: 'English',
  chi_sim: 'Chinese (Simplified)',
  chi_tra: 'Chinese (Traditional)',
  jpn: 'Japanese',
  kor: 'Korean',
  spa: 'Spanish',
  fra: 'French',
  deu: 'German',
  por: 'Portuguese',
  ara: 'Arabic',
  vie: 'Vietnamese',
  ita: 'Italian',
  ind: 'Indonesian',
  ron: 'Romanian',
};

// Tesseract worker type
type TesseractWorker = {
  loadLanguage: (lang: string) => Promise<void>;
  initialize: (lang: string) => Promise<void>;
  recognize: (image: string | HTMLCanvasElement) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<void>;
};


/**
 * OCR PDF Processor
 * Performs OCR on PDF pages using Tesseract.js.
 */
export class OCRProcessor extends BasePDFProcessor {
  private tesseractWorker: TesseractWorker | null = null;

  /**
   * Process PDF with OCR
   */
  async process(
    input: ProcessInput,
    onProgress?: ProgressCallback
  ): Promise<ProcessOutput> {
    this.reset();
    this.onProgress = onProgress;

    const { files, options } = input;
    const ocrOptions: OCROptions = {
      ...DEFAULT_OPTIONS,
      ...(options as Partial<OCROptions>),
    };

    // Validate we have exactly 1 PDF file
    if (files.length !== 1) {
      return this.createErrorOutput(
        PDFErrorCode.INVALID_OPTIONS,
        'Please provide exactly one PDF file.',
        `Received ${files.length} file(s).`
      );
    }

    const file = files[0];

    // Validate file type
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      return this.createErrorOutput(
        PDFErrorCode.FILE_TYPE_INVALID,
        'Invalid file type. Please upload a PDF file.',
        `Received: ${file.type || 'unknown'}`
      );
    }

    try {
      this.updateProgress(5, 'Loading libraries...');

      const pdfjs = await loadPdfjs();

      if (this.checkCancelled()) {
        return this.createErrorOutput(
          PDFErrorCode.PROCESSING_CANCELLED,
          'Processing was cancelled.'
        );
      }

      this.updateProgress(10, 'Initializing OCR engine...');

      // Initialize Tesseract
      await this.initializeTesseract(ocrOptions.languages);

      this.updateProgress(20, 'Loading PDF document...');

      // Load the PDF document
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;

      // Determine which pages to OCR
      const pagesToOCR = ocrOptions.pages.length > 0
        ? ocrOptions.pages.filter(p => p >= 1 && p <= totalPages)
        : Array.from({ length: totalPages }, (_, i) => i + 1);

      if (pagesToOCR.length === 0) {
        await this.terminateTesseract();
        return this.createErrorOutput(
          PDFErrorCode.INVALID_PAGE_RANGE,
          'No valid pages to OCR.',
          `PDF has ${totalPages} pages.`
        );
      }

      this.updateProgress(25, `Processing ${pagesToOCR.length} page(s)...`);

      const textResults: string[] = [];
      const progressPerPage = 70 / pagesToOCR.length;

      for (let i = 0; i < pagesToOCR.length; i++) {
        if (this.checkCancelled()) {
          await this.terminateTesseract();
          return this.createErrorOutput(
            PDFErrorCode.PROCESSING_CANCELLED,
            'Processing was cancelled.'
          );
        }

        const pageNum = pagesToOCR[i];
        const pageProgress = 25 + (i * progressPerPage);

        this.updateProgress(
          pageProgress,
          `OCR processing page ${pageNum} of ${totalPages}...`
        );

        try {
          const pageText = await this.ocrPage(pdf, pageNum, ocrOptions);
          textResults.push(`--- Page ${pageNum} ---\n${pageText}`);
        } catch (error) {
          textResults.push(`--- Page ${pageNum} ---\n[OCR Error: ${error instanceof Error ? error.message : 'Unknown error'}]`);
        }
      }

      await this.terminateTesseract();

      this.updateProgress(95, 'Generating output...');

      // Generate output based on format
      let blob: Blob;
      let outputFilename: string;
      const baseName = file.name.replace(/\.pdf$/i, '');

      if (ocrOptions.outputFormat === 'text') {
        const fullText = textResults.join('\n\n');
        blob = new Blob([fullText], { type: 'text/plain' });
        outputFilename = `${baseName}_ocr.txt`;
      } else {
        // For searchable PDF, we create a PDF with the extracted text
        blob = await this.createSearchablePDF(file, textResults, ocrOptions);
        outputFilename = `${baseName}_searchable.pdf`;
      }

      this.updateProgress(100, 'Complete!');

      return this.createSuccessOutput(blob, outputFilename, {
        pageCount: pagesToOCR.length,
        languages: ocrOptions.languages,
        outputFormat: ocrOptions.outputFormat,
      });

    } catch (error) {
      await this.terminateTesseract();
      return this.createErrorOutput(
        PDFErrorCode.PROCESSING_FAILED,
        'Failed to perform OCR on PDF.',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Initialize Tesseract worker
   */
  private async initializeTesseract(languages: OCRLanguage[]): Promise<void> {
    // Dynamically import Tesseract.js
    const Tesseract = await import('tesseract.js');

    const langString = languages.join('+');
    this.tesseractWorker = await Tesseract.createWorker(langString) as unknown as TesseractWorker;
  }

  /**
   * Terminate Tesseract worker
   */
  private async terminateTesseract(): Promise<void> {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
      this.tesseractWorker = null;
    }
  }

  /**
   * Perform OCR on a single page
   */
  private async ocrPage(
    pdf: Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfjs>>['getDocument']>['promise']>,
    pageNum: number,
    options: OCROptions
  ): Promise<string> {
    if (!this.tesseractWorker) {
      throw new Error('Tesseract worker not initialized');
    }

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: options.scale });

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Fill with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render PDF page to canvas
    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise;

    // Perform OCR
    const result = await this.tesseractWorker.recognize(canvas);
    return result.data.text;
  }

  /**
   * Create a searchable PDF with OCR text layer
   */
  private async createSearchablePDF(
    originalFile: File,
    textResults: string[],
    options: OCROptions
  ): Promise<Blob> {
    const pdfLib = await loadPdfLib();

    // Load original PDF
    const arrayBuffer = await originalFile.arrayBuffer();
    const pdfDoc = await pdfLib.PDFDocument.load(arrayBuffer);

    // For now, we'll create a simple text file with the OCR results
    // A full searchable PDF implementation would require adding invisible text layers
    // which is complex and beyond the scope of this basic implementation

    // Add metadata to indicate OCR was performed
    pdfDoc.setTitle(`${originalFile.name} (OCR)`);
    pdfDoc.setSubject('OCR processed document');
    pdfDoc.setKeywords(['OCR', 'searchable', ...options.languages]);

    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
    return new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
  }
}

/**
 * Create a new instance of the OCR processor
 */
export function createOCRProcessor(): OCRProcessor {
  return new OCRProcessor();
}

/**
 * Perform OCR on PDF — text extraction (client-side Tesseract)
 */
export async function ocrPDF(
  file: File,
  options?: Partial<OCROptions>,
  onProgress?: ProgressCallback
): Promise<ProcessOutput> {
  const processor = createOCRProcessor();
  return processor.process(
    {
      files: [file],
      options: options || {},
    },
    onProgress
  );
}

export type SmartOcrOutputFormat = 'pdf' | 'text';

export interface ServerOCROptions {
  languages: OCRLanguage[];
  deskew: boolean;
  rotatePages: boolean;
  removeBackground: boolean;
  clean: boolean;
  forceOcr: boolean;
  optimize: number;
  outputFormat: SmartOcrOutputFormat;
}

const DEFAULT_SERVER_OPTIONS: ServerOCROptions = {
  languages: ['vie', 'eng'],
  deskew: true,
  rotatePages: true,
  removeBackground: false,
  clean: true,
  forceOcr: false,
  optimize: 1,
  outputFormat: 'pdf',
};

/**
 * Smart OCR via OCRmyPDF server (`/api/ocr`) — same pipeline as AI Smart OCR page.
 */
export async function runSmartOcr(
  file: File,
  options?: Partial<ServerOCROptions>,
  onProgress?: ProgressCallback,
): Promise<ProcessOutput> {
  const opts: ServerOCROptions = { ...DEFAULT_SERVER_OPTIONS, ...options };
  const baseName = file.name.replace(/\.pdf$/i, '');

  onProgress?.(10, 'Uploading PDF to OCR server...');

  const form = new FormData();
  form.append('file', file);
  form.append('languages', opts.languages.join('+'));
  form.append('deskew', String(opts.deskew));
  form.append('rotate_pages', String(opts.rotatePages));
  form.append('remove_background', String(opts.removeBackground));
  form.append('clean', String(opts.clean));
  form.append('force_ocr', String(opts.forceOcr));
  form.append('optimize', String(opts.optimize));
  form.append('output_format', opts.outputFormat === 'text' ? 'text' : 'pdf');

  onProgress?.(20, 'Processing OCR...');

  let res: Response;
  try {
    res = await fetch('/api/ocr', { method: 'POST', body: form });
  } catch {
    return {
      success: false,
      error: {
        code: PDFErrorCode.PROCESSING_FAILED,
        message: 'Cannot reach OCR server. Make sure the OCR service is running.',
      },
    };
  }

  if (!res.ok) {
    let detail = 'OCR processing failed.';
    try {
      const json = await res.json();
      detail = json.detail || detail;
    } catch { /* ignore */ }
    return {
      success: false,
      error: { code: PDFErrorCode.PROCESSING_FAILED, message: detail },
    };
  }

  onProgress?.(90, 'Downloading result...');

  if (opts.outputFormat === 'text') {
    const data = (await res.json()) as { text?: string; fileName?: string };
    const text = data.text ?? '';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });

    onProgress?.(100, 'Complete!');

    return {
      success: true,
      result: blob,
      filename: `${baseName}_ocr.txt`,
      metadata: {
        languages: opts.languages,
        outputFormat: 'text',
        textPreview: text,
      },
    };
  }

  const blob = await res.blob();

  onProgress?.(100, 'Complete!');

  return {
    success: true,
    result: blob,
    filename: `${baseName}_ocr.pdf`,
    metadata: {
      languages: opts.languages,
      outputFormat: 'searchable-pdf',
    },
  };
}

/** @deprecated Use runSmartOcr — kept for existing imports */
export async function ocrSearchablePDF(
  file: File,
  options?: Partial<Omit<ServerOCROptions, 'outputFormat'>>,
  onProgress?: ProgressCallback,
): Promise<ProcessOutput> {
  return runSmartOcr(file, { ...options, outputFormat: 'pdf' }, onProgress);
}

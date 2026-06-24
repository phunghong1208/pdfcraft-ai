/**
 * PDF to DOCX — server: pdfplumber + python-docx (MIT/BSD).
 * Fallback browser WASM vẫn dùng pdf2docx (chưa migrate).
 */

import type {
  ProcessInput,
  ProcessOutput,
  ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';

export interface PDFToDocxOptions {
  /** auto | editable | fixed_layout | preserve_layout (ảnh — chỉ khi cần snapshot) */
  mode?: 'auto' | 'editable' | 'fixed_layout' | 'preserve_layout';
  /** DPI raster cho preserve_layout (150–250) */
  dpi?: number;
}

const PDF_TO_DOCX_API = '/api/pdf-to-docx';

async function convertViaServer(
  file: File,
  options?: PDFToDocxOptions,
): Promise<{ blob: Blob; engine?: string; mode?: string }> {
  const form = new FormData();
  form.append('file', file);
  form.append('mode', options?.mode ?? 'auto');
  if (options?.dpi) {
    form.append('dpi', String(options.dpi));
  }
  const res = await fetch(PDF_TO_DOCX_API, { method: 'POST', body: form });
  if (!res.ok) {
    let detail = `Server convert lỗi (${res.status})`;
    try {
      const json = (await res.json()) as { detail?: string };
      if (json.detail) detail = json.detail;
    } catch {
      // keep default
    }
    throw new Error(detail);
  }
  return {
    blob: await res.blob(),
    engine: res.headers.get('X-Engine') ?? undefined,
    mode: res.headers.get('X-Docx-Mode') ?? undefined,
  };
}

export class PDFToDocxProcessor extends BasePDFProcessor {
  cancel(): void {
    super.cancel();
  }

  async process(
    input: ProcessInput,
    onProgress?: ProgressCallback,
  ): Promise<ProcessOutput> {
    this.reset();
    this.onProgress = onProgress;

    const { files, options } = input;

    if (files.length !== 1) {
      return this.createErrorOutput(
        PDFErrorCode.INVALID_OPTIONS,
        'Please provide exactly one PDF file.',
        `Received ${files.length} file(s).`,
      );
    }

    const file = files[0];

    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      return this.createErrorOutput(
        PDFErrorCode.FILE_TYPE_INVALID,
        'Invalid file type. Please upload a PDF file.',
        `Received: ${file.type || 'unknown'}`,
      );
    }

    try {
      let docxBlob: Blob;
      let engineUsed = 'pdfplumber-docx';
      const docxOptions = (options || {}) as PDFToDocxOptions;

      this.updateProgress(10, 'Converting on server (auto mode)...');
      try {
        const server = await convertViaServer(file, docxOptions);
        docxBlob = server.blob;
        engineUsed = server.engine ?? engineUsed;
        if (server.mode === 'fixed_layout') {
          this.updateProgress(90, 'Used fixed-layout (positioned text)');
        } else if (server.mode === 'preserve_layout') {
          this.updateProgress(90, 'Used preserve-layout (page images)');
        }
      } catch (serverErr) {
        throw serverErr;
      }

      if (this.checkCancelled()) {
        return this.createErrorOutput(
          PDFErrorCode.PROCESSING_CANCELLED,
          'Processing was cancelled.',
        );
      }

      this.updateProgress(100, 'Conversion complete!');

      const baseName = file.name.replace(/\.pdf$/i, '');
      return this.createSuccessOutput(docxBlob, `${baseName}.docx`, {
        format: 'docx',
        engine: engineUsed,
        docxMode: docxOptions.mode ?? 'auto',
      });
    } catch (error) {
      console.error('Conversion error:', error);

      if (this.checkCancelled()) {
        return this.createErrorOutput(
          PDFErrorCode.PROCESSING_CANCELLED,
          'Processing was cancelled.',
        );
      }

      const msg = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorOutput(
        PDFErrorCode.PROCESSING_FAILED,
        'Server PDF to DOCX không sẵn sàng. Hãy chạy dịch vụ `pdf` rồi thử lại.',
        msg,
      );
    }
  }
}

export function createPDFToDocxProcessor(): PDFToDocxProcessor {
  return new PDFToDocxProcessor();
}

export async function pdfToDocx(
  file: File,
  options?: Partial<PDFToDocxOptions>,
  onProgress?: ProgressCallback,
): Promise<ProcessOutput> {
  const processor = createPDFToDocxProcessor();
  return processor.process({ files: [file], options: options || {} }, onProgress);
}

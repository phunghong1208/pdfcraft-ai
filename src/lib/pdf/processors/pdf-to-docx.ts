/**
 * PDF to DOCX Processor
 *
 * Primary: pdf2docx (giữ layout, ảnh, font).
 * Fallback: PyMuPDF table extractor chỉ khi pdf2docx lỗi.
 */

import type {
  ProcessInput,
  ProcessOutput,
  ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';

export interface PDFToDocxOptions {
  /** Reserved for future options */
}

type WorkerEngine = 'auto' | 'pymupdf' | 'pdf2docx';

let sharedWorker: Worker | null = null;
let sharedWorkerReady: Promise<void> | null = null;

async function ensureWorker(onStatus?: (message: string) => void): Promise<Worker> {
  if (sharedWorker && sharedWorkerReady) {
    await sharedWorkerReady;
    return sharedWorker;
  }

  sharedWorker = new Worker('/workers/pdf-to-docx.worker.js', { type: 'module' });

  sharedWorkerReady = new Promise<void>((resolve, reject) => {
    const handleMessage = (event: MessageEvent) => {
      const { type, error, message } = event.data;
      if (type === 'init-complete') {
        sharedWorker?.removeEventListener('message', handleMessage);
        resolve();
      } else if (type === 'status') {
        onStatus?.(message);
      } else if (type === 'error') {
        sharedWorker?.removeEventListener('message', handleMessage);
        reject(new Error(error || 'Worker initialization failed'));
      }
    };

    sharedWorker!.addEventListener('message', handleMessage);
    sharedWorker!.addEventListener('error', () => {
      sharedWorker?.removeEventListener('message', handleMessage);
      reject(new Error('Worker connection failed'));
    });

    sharedWorker!.postMessage({
      type: 'init',
      id: 'init-' + Date.now(),
      data: {},
    });
  });

  try {
    await sharedWorkerReady;
    return sharedWorker;
  } catch (err) {
    sharedWorker?.terminate();
    sharedWorker = null;
    sharedWorkerReady = null;
    throw err;
  }
}

function terminateSharedWorker(): void {
  sharedWorker?.terminate();
  sharedWorker = null;
  sharedWorkerReady = null;
}

function workerRequest<T>(
  worker: Worker,
  type: string,
  data: Record<string, unknown>,
  onProgress?: (message: string, percent?: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const msgId = `${type}-${Date.now()}`;

    const handleMessage = (event: MessageEvent) => {
      const { type: msgType, id, error, message, percent, ...rest } = event.data;

      if (msgType === 'status' || msgType === 'progress') {
        onProgress?.(message, typeof percent === 'number' ? percent : undefined);
        return;
      }

      if (id !== msgId) return;

      if (msgType === 'error') {
        cleanup();
        reject(new Error(error || 'Worker request failed'));
        return;
      }

      cleanup();
      resolve(rest as T);
    };

    const handleError = (ev: ErrorEvent) => {
      cleanup();
      reject(new Error('Worker error: ' + ev.message));
    };

    const cleanup = () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    worker.postMessage({ type, id: msgId, data });
  });
}

export class PDFToDocxProcessor extends BasePDFProcessor {
  private activeMsgId: string | null = null;

  cancel(): void {
    super.cancel();
    this.activeMsgId = null;
  }

  protected reset(): void {
    super.reset();
    this.activeMsgId = null;
  }

  private async convertWithWorker(
    worker: Worker,
    file: File,
    engine: WorkerEngine,
  ): Promise<Blob> {
    const result = await workerRequest<{ result: Blob }>(
      worker,
      'convert',
      { file, engine },
      (message, percent) => {
        if (this.checkCancelled()) return;
        const value = typeof percent === 'number' ? percent : this.progress;
        this.updateProgress(value, message);
      },
    );

    return result.result;
  }

  async process(
    input: ProcessInput,
    onProgress?: ProgressCallback,
  ): Promise<ProcessOutput> {
    this.reset();
    this.onProgress = onProgress;

    const { files } = input;

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
      this.updateProgress(8, 'Initializing converter...');

      let worker: Worker;
      try {
        worker = await ensureWorker((message) => {
          if (!this.checkCancelled()) {
            this.updateProgress(this.progress, message);
          }
        });
      } catch (err) {
        console.error('Failed to initialize worker:', err);
        return this.createErrorOutput(
          PDFErrorCode.WORKER_FAILED,
          'Failed to initialize conversion worker.',
          err instanceof Error ? err.message : String(err),
        );
      }

      if (this.checkCancelled()) {
        return this.createErrorOutput(
          PDFErrorCode.PROCESSING_CANCELLED,
          'Processing was cancelled.',
        );
      }

      let docxBlob: Blob;
      let engineUsed = 'pdf2docx';

      this.updateProgress(20, 'Converting with pdf2docx...');
      try {
        docxBlob = await this.convertWithWorker(worker, file, 'pdf2docx');
      } catch (pdf2docxError) {
        console.warn('[PDF→DOCX] pdf2docx failed, falling back to PyMuPDF tables:', pdf2docxError);
        this.updateProgress(25, 'pdf2docx failed — extracting tables with PyMuPDF...');
        docxBlob = await this.convertWithWorker(worker, file, 'pymupdf');
        engineUsed = 'pymupdf-tables';
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
      });
    } catch (error) {
      console.error('Conversion error:', error);

      const isFatalCrash =
        error instanceof Error &&
        (error.message.includes('Worker error:') ||
          error.message.includes('Worker connection failed'));

      if (isFatalCrash) {
        terminateSharedWorker();
      }

      if (this.checkCancelled()) {
        return this.createErrorOutput(
          PDFErrorCode.PROCESSING_CANCELLED,
          'Processing was cancelled.',
        );
      }

      return this.createErrorOutput(
        PDFErrorCode.PROCESSING_FAILED,
        'Failed to convert PDF to DOCX.',
        error instanceof Error ? error.message : 'Unknown error',
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

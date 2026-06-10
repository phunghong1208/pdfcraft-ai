/**
 * PDF to DOCX Processor
 *
 * Converts PDF files to Word documents (DOCX).
 * Uses Pyodide + pdf2docx via a Web Worker (client-side).
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

/** Shared worker — reuse across conversions to avoid reloading Pyodide wheels */
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
      this.updateProgress(10, 'Initializing converter...');

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

      this.updateProgress(30, 'Converting with pdf2docx...');

      const docxBlob = await new Promise<Blob>((resolve, reject) => {
        const msgId = 'convert-' + Date.now();
        this.activeMsgId = msgId;

        const handleMessage = (event: MessageEvent) => {
          const { type, id, result, error, message, percent } = event.data;

          if (type === 'status' || type === 'progress') {
            if (this.checkCancelled()) return;
            const progressValue = typeof percent === 'number' ? percent : this.progress;
            this.updateProgress(progressValue, message);
            return;
          }

          if (id !== msgId) return;

          if (type === 'convert-complete') {
            cleanup();
            resolve(result);
          } else if (type === 'error') {
            cleanup();
            reject(new Error(error || 'Conversion failed'));
          }
        };

        const handleError = (error: ErrorEvent) => {
          cleanup();
          reject(new Error('Worker error: ' + error.message));
        };

        const cleanup = () => {
          this.activeMsgId = null;
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
        };

        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleError);

        worker.postMessage({
          type: 'convert',
          id: msgId,
          data: { file },
        });
      });

      if (this.checkCancelled()) {
        return this.createErrorOutput(
          PDFErrorCode.PROCESSING_CANCELLED,
          'Processing was cancelled.',
        );
      }

      this.updateProgress(100, 'Conversion complete!');

      const baseName = file.name.replace(/\.pdf$/i, '');
      return this.createSuccessOutput(docxBlob, `${baseName}.docx`, { format: 'docx' });
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

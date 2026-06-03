/**
 * PDF Background Color Processor
 * Renders with pdf.js, replaces near-white paper pixels with the chosen color, embeds as PNG.
 */

import type { ProcessInput, ProcessOutput, ProgressCallback } from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';
import { loadPdfLib, loadPdfjs } from '../loader';

export interface BackgroundColorOptions {
  color: { r: number; g: number; b: number };
  pages?: number[] | 'all';
  opacity?: number;
  scale?: number;
}

const DEFAULT_SCALE = 2;
const MAX_CANVAS_DIMENSION = 8192;

function rgbToCss({ r, g, b }: { r: number; g: number; b: number }) {
  const toByte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return `rgb(${toByte(r)}, ${toByte(g)}, ${toByte(b)})`;
}

function replacePaperBackground(
  imageData: ImageData,
  bg: { r: number; g: number; b: number },
  opacity: number,
) {
  const tr = Math.round(bg.r * 255);
  const tg = Math.round(bg.g * 255);
  const tb = Math.round(bg.b * 255);
  const data = imageData.data;
  const lumMin = 185;
  const maxSat = 0.28;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a < 20) {
      data[i] = tr;
      data[i + 1] = tg;
      data[i + 2] = tb;
      data[i + 3] = 255;
      continue;
    }

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = max === 0 ? 0 : (max - min) / max;

    if (lum >= lumMin && sat <= maxSat) {
      const paperness = Math.min(1, (lum - lumMin) / (255 - lumMin));
      const blend = paperness * opacity;
      data[i] = Math.round(r + (tr - r) * blend);
      data[i + 1] = Math.round(g + (tg - g) * blend);
      data[i + 2] = Math.round(b + (tb - b) * blend);
    }
  }
}

function resolveRenderViewport(
  page: { getViewport: (options: { scale: number }) => ReturnType<import('pdfjs-dist').PDFPageProxy['getViewport']> },
  scale: number,
) {
  let renderScale = scale;
  let viewport = page.getViewport({ scale: renderScale });
  while (
    (viewport.width > MAX_CANVAS_DIMENSION || viewport.height > MAX_CANVAS_DIMENSION) &&
    renderScale > 0.35
  ) {
    renderScale *= 0.75;
    viewport = page.getViewport({ scale: renderScale });
  }
  return viewport;
}

export class BackgroundColorProcessor extends BasePDFProcessor {
  async process(input: ProcessInput, onProgress?: ProgressCallback): Promise<ProcessOutput> {
    this.reset();
    this.onProgress = onProgress;

    const { files, options } = input;
    const inputOptions = options as Partial<BackgroundColorOptions>;
    const bgOptions: BackgroundColorOptions = {
      color: inputOptions.color ?? { r: 1, g: 1, b: 0.9 },
      pages: inputOptions.pages ?? 'all',
      opacity: inputOptions.opacity ?? 1,
      scale: inputOptions.scale ?? DEFAULT_SCALE,
    };

    if (files.length !== 1) {
      return this.createErrorOutput(PDFErrorCode.INVALID_OPTIONS, 'Exactly 1 PDF file is required.');
    }

    if (typeof document === 'undefined') {
      return this.createErrorOutput(
        PDFErrorCode.PROCESSING_FAILED,
        'Background color requires a browser environment.',
      );
    }

    try {
      this.updateProgress(5, 'Loading PDF libraries...');
      const [pdfLib, pdfjs] = await Promise.all([loadPdfLib(), loadPdfjs()]);

      this.updateProgress(10, 'Loading PDF...');
      const file = files[0];
      const pdfBytes = (await file.arrayBuffer()).slice(0);
      const sourcePdf = await pdfjs.getDocument({ data: pdfBytes }).promise;
      const totalPages = sourcePdf.numPages;

      const pagesToProcess = bgOptions.pages === 'all'
        ? Array.from({ length: totalPages }, (_, i) => i)
        : (bgOptions.pages as number[]).map((p) => p - 1);

      const newPdf = await pdfLib.PDFDocument.create();
      const opacity = Math.max(0, Math.min(1, bgOptions.opacity ?? 1));
      const bgCss = rgbToCss(bgOptions.color);
      const baseScale = bgOptions.scale ?? DEFAULT_SCALE;

      this.updateProgress(15, 'Applying background color...');

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        if (this.checkCancelled()) {
          return this.createErrorOutput(PDFErrorCode.PROCESSING_CANCELLED, 'Processing was cancelled.');
        }

        const pageIndex = pageNum - 1;
        const page = await sourcePdf.getPage(pageNum);
        const originalViewport = page.getViewport({ scale: 1 });
        const pageWidth = originalViewport.width;
        const pageHeight = originalViewport.height;
        const renderViewport = resolveRenderViewport(page, baseScale);
        const applyTint = pagesToProcess.includes(pageIndex);

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        const ctx = canvas.getContext('2d', { willReadFrequently: applyTint });
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }

        ctx.fillStyle = applyTint ? bgCss : '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: ctx,
          viewport: renderViewport,
        }).promise;

        if (applyTint) {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          replacePaperBackground(imageData, bgOptions.color, opacity);
          ctx.putImageData(imageData, 0, 0);
        }

        const pngBytes = await this.canvasToPngBytes(canvas);
        const image = await newPdf.embedPng(pngBytes);
        const newPage = newPdf.addPage([pageWidth, pageHeight]);
        newPage.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });

        this.updateProgress(15 + (80 * pageNum) / totalPages, `Page ${pageNum} of ${totalPages}...`);
      }

      this.updateProgress(95, 'Saving PDF...');
      const outBytes = await newPdf.save({ useObjectStreams: true });
      const blob = new Blob([new Uint8Array(outBytes)], { type: 'application/pdf' });

      this.updateProgress(100, 'Complete!');
      return this.createSuccessOutput(blob, file.name.replace('.pdf', '_background.pdf'), { pageCount: totalPages });
    } catch (error) {
      return this.createErrorOutput(
        PDFErrorCode.PROCESSING_FAILED,
        'Failed to add background color.',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  private canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to convert canvas to blob'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.onerror = () => reject(new Error('Failed to read blob'));
        reader.readAsArrayBuffer(blob);
      }, 'image/png');
    });
  }

  protected getAcceptedTypes(): string[] {
    return ['application/pdf'];
  }
}

export function createBackgroundColorProcessor(): BackgroundColorProcessor {
  return new BackgroundColorProcessor();
}

export async function addBackgroundColor(
  file: File,
  options: BackgroundColorOptions,
  onProgress?: ProgressCallback,
): Promise<ProcessOutput> {
  const processor = createBackgroundColorProcessor();
  return processor.process({ files: [file], options: options as unknown as Record<string, unknown> }, onProgress);
}

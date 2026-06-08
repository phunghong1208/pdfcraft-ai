'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { addWatermark, WatermarkOptions } from '@/lib/pdf/processors/watermark';
import { parsePageSelection, extractPages } from '@/lib/pdf/processors/extract';
import { loadPdfLib } from '@/lib/pdf/loader';
import type { ProcessOutput } from '@/types/pdf';
import {
  workspaceInlineActionBtnSize,
  workspaceInlineContrastBoostClass,
  workspaceInlineErrorClass,
  workspaceInlineFieldLabelClass,
  workspaceInlineHintClass,
  workspaceInlineInputClass,
  workspaceInlineRadioLabelClass,
  workspaceInlineRootClass,
  workspaceInlineSectionTitleClass,
  workspaceInlineSuccessClass,
} from '@/lib/workspace-inline-tool-ui';

let pdfjsModule: typeof import('pdfjs-dist') | null = null;

const loadPdfjsLib = async () => {
  if (pdfjsModule) return pdfjsModule;
  const pdfjsLib = await import('pdfjs-dist');
  const { configurePdfjsWorker } = await import('@/lib/pdf/loader');
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    configurePdfjsWorker(pdfjsLib);
  }
  pdfjsModule = pdfjsLib;
  return pdfjsLib;
};

const isRenderCancelledError = (err: unknown): boolean =>
  err instanceof Error && /Rendering cancelled|cancelled/i.test(err.message);

export interface WatermarkToolProps {
  className?: string;
  initialFile?: File | null;
  lockToInitialFile?: boolean;
  onFileUpdated?: (file: File) => void;
}

/**
 * Convert any image file to PNG format using Canvas
 * This ensures compatibility with pdf-lib which doesn't support
 * progressive JPEG, CMYK color space, and some other formats
 */
async function convertImageToPng(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      try {
        // Create canvas with image dimensions
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        // Draw image to canvas
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0);

        // Convert to PNG blob
        canvas.toBlob((blob) => {
          if (blob) {
            blob.arrayBuffer().then(resolve).catch(reject);
          } else {
            reject(new Error('Failed to convert image to PNG'));
          }
        }, 'image/png');
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

type WatermarkType = 'text' | 'image';

export function WatermarkTool({
  className = '',
  initialFile = null,
  lockToInitialFile = false,
  onFileUpdated,
}: WatermarkToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools.watermark');

  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const settingsUpToRangeRef = useRef<HTMLDivElement>(null);
  const [previewBoxWidth, setPreviewBoxWidth] = useState(0);
  const [previewBoxHeight, setPreviewBoxHeight] = useState(0);
  const [settingsColHeight, setSettingsColHeight] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPreviewPage, setCurrentPreviewPage] = useState(1);

  // Watermark type
  const [watermarkType, setWatermarkType] = useState<WatermarkType>('text');

  // Text watermark options
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(72);
  const [textColor, setTextColor] = useState('#888888');
  const [textOpacity, setTextOpacity] = useState(0.3);
  const [textAngle, setTextAngle] = useState(-45);

  // Image watermark options
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageOpacity, setImageOpacity] = useState(0.3);
  const [imageAngle, setImageAngle] = useState(0);

  // Repeat/tile watermark options
  const [repeatWatermark, setRepeatWatermark] = useState(false);
  const [staggerWatermark, setStaggerWatermark] = useState(true);
  const [repeatSpacingX, setRepeatSpacingX] = useState(200);
  const [repeatSpacingY, setRepeatSpacingY] = useState(150);

  // Page range options
  const [pageMode, setPageMode] = useState<'all' | 'odd' | 'even' | 'custom'>('all');
  const [customPageRange, setCustomPageRange] = useState('');

  const cancelledRef = useRef(false);

  const handleFilesSelected = useCallback(async (files: File[]) => {
    if (files.length > 0) {
      const selectedFile = files[0];
      setFile(selectedFile);
      setError(null);
      setResult(null);

      // Get total pages
      try {
        const pdfLib = await loadPdfLib();
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdf = await pdfLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        setTotalPages(pdf.getPageCount());
        setCurrentPreviewPage(1);
      } catch (err) {
        console.error('Failed to load PDF to get page count:', err);
      }
    }
  }, []);

  React.useEffect(() => {
    if (!initialFile) return;
    void handleFilesSelected([initialFile]);
  }, [initialFile, handleFilesSelected]);

  const handleImageSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type === 'image/png' || selectedFile.type === 'image/jpeg') {
        setImageFile(selectedFile);
        setError(null);
      } else {
        setError(tTools('unsupportedImage'));
      }
    }
  }, [tTools]);

  const handleClearFile = useCallback(() => {
    setFile(null);
    setResult(null);
    setError(null);
    setStatus('idle');
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [previewUrl]);

  const handleProcess = useCallback(async () => {
    if (!file) return;
    if (watermarkType === 'text' && !watermarkText.trim()) {
      setError(tTools('enterText'));
      return;
    }
    if (watermarkType === 'image' && !imageFile) {
      setError(tTools('selectImage'));
      return;
    }

    if (pageMode === 'custom' && !customPageRange.trim()) {
      setError(tTools('rangePlaceholder'));
      return;
    }

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      const hexToRgb = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return { r, g, b };
      };

      let options: WatermarkOptions;

      if (watermarkType === 'text') {
        options = {
          type: 'text',
          text: watermarkText,
          fontSize,
          color: hexToRgb(textColor),
          opacity: textOpacity,
          rotation: textAngle,
          pages: 'all',
          repeat: repeatWatermark,
          stagger: staggerWatermark,
          repeatSpacingX,
          repeatSpacingY,
        };
      } else {
        const imageData = await convertImageToPng(imageFile!);
        options = {
          type: 'image',
          imageData,
          imageType: 'png',
          opacity: imageOpacity,
          rotation: imageAngle,
          pages: 'all',
          repeat: repeatWatermark,
          stagger: staggerWatermark,
          repeatSpacingX,
          repeatSpacingY,
        };
      }

      // Prepare pages option
      let pages: WatermarkOptions['pages'] = 'all';
      if (pageMode === 'odd') pages = 'odd';
      else if (pageMode === 'even') pages = 'even';
      else if (pageMode === 'custom') {
        pages = parsePageSelection(customPageRange, totalPages);
      }
      options.pages = pages;

      const output: ProcessOutput = await addWatermark(file, options, (prog, message) => {
        if (!cancelledRef.current) {
          setProgress(prog);
          setProgressMessage(message || '');
        }
      });

      if (cancelledRef.current) {
        setStatus('idle');
        return;
      }

      if (output.success && output.result) {
        const resultBlob = output.result as Blob;
        setResult(resultBlob);
        setStatus('complete');
        if (lockToInitialFile && onFileUpdated && file) {
          const updatedFile = new File([resultBlob], file.name, { type: 'application/pdf' });
          onFileUpdated(updatedFile);
        }
      } else {
        setError(output.error?.message || tTools('failed'));
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : tTools('failed'));
        setStatus('error');
      }
    }
  }, [file, watermarkType, watermarkText, fontSize, textColor, textOpacity, textAngle, imageFile, imageOpacity, imageAngle, repeatWatermark, staggerWatermark, repeatSpacingX, repeatSpacingY, pageMode, customPageRange, totalPages, tTools]);

  const handleGeneratePreview = useCallback(async () => {
    if (!file) return;
    if (watermarkType === 'text' && !watermarkText.trim()) return;
    if (watermarkType === 'image' && !imageFile) return;

    setIsPreviewing(true);
    try {
      const hexToRgb = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return { r, g, b };
      };

      let options: WatermarkOptions;
      if (watermarkType === 'text') {
        options = {
          type: 'text',
          text: watermarkText,
          fontSize,
          color: hexToRgb(textColor),
          opacity: textOpacity,
          rotation: textAngle,
          pages: [1], // Only first page for preview
          repeat: repeatWatermark,
          stagger: staggerWatermark,
          repeatSpacingX,
          repeatSpacingY,
        };
      } else {
        const imageData = await convertImageToPng(imageFile!);
        options = {
          type: 'image',
          imageData,
          imageType: 'png',
          opacity: imageOpacity,
          rotation: imageAngle,
          pages: [1], // Only first page for preview
          repeat: repeatWatermark,
          stagger: staggerWatermark,
          repeatSpacingX,
          repeatSpacingY,
        };
      }

      // Preview page is user-selected page (rendered as a single extracted page for performance).
      const previewPage = Math.min(Math.max(1, currentPreviewPage), Math.max(1, totalPages));
      options.pages = [1]; // The extracted file will only have 1 page

      // Extract only the page we want to preview to keep the preview PDF small and clear
      const extractOutput = await extractPages(file, [previewPage]);
      if (!extractOutput.success || !extractOutput.result) return;

      const previewSinglePageFile = new File([extractOutput.result as Blob], 'preview.pdf', { type: 'application/pdf' });
      const output = await addWatermark(previewSinglePageFile, options);
      if (output.success && output.result) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const url = URL.createObjectURL(output.result as Blob);
        setPreviewUrl(url);
      }
    } catch (err) {
      console.error('Preview failed:', err);
    } finally {
      setIsPreviewing(false);
    }
  }, [file, watermarkType, watermarkText, fontSize, textColor, textOpacity, textAngle, imageFile, imageOpacity, imageAngle, repeatWatermark, staggerWatermark, repeatSpacingX, repeatSpacingY, pageMode, customPageRange, totalPages, currentPreviewPage, previewUrl]);

  // Debounced preview generation
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (file) {
        handleGeneratePreview();
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [file, watermarkType, watermarkText, fontSize, textColor, textOpacity, textAngle, imageFile, imageOpacity, imageAngle, repeatWatermark, staggerWatermark, repeatSpacingX, repeatSpacingY, pageMode, customPageRange, totalPages, currentPreviewPage]);

  // Cleanup preview URL on unmount
  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Track preview container width so the page fills available space.
  React.useEffect(() => {
    const box = previewBoxRef.current;
    if (!box) return;
    const updateSize = () => {
      setPreviewBoxWidth(Math.floor(box.clientWidth));
      setPreviewBoxHeight(Math.floor(box.clientHeight));
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(box);
    return () => ro.disconnect();
  }, [file, previewUrl, settingsColHeight]);

  // Match preview height to settings stack ending at "Phạm vi trang".
  React.useEffect(() => {
    const el = settingsUpToRangeRef.current;
    if (!el || !lockToInitialFile) return;
    const updateHeight = () => setSettingsColHeight(el.offsetHeight);
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, [
    file,
    lockToInitialFile,
    watermarkType,
    pageMode,
    customPageRange,
    repeatWatermark,
    staggerWatermark,
    status,
    result,
  ]);

  // Render preview PDF (single page) to canvas with Header/Footer-like style.
  React.useEffect(() => {
    if (!previewUrl || !previewCanvasRef.current) return;
    let cancelled = false;
    const canvas = previewCanvasRef.current;
    const render = async () => {
      try {
        const pdfjsLib = await loadPdfjsLib();
        const loadingTask = pdfjsLib.getDocument(previewUrl);
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        if (cancelled) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const box = previewBoxRef.current;
        let targetWidth = Math.max(box?.clientWidth ?? previewBoxWidth, 0);
        if (targetWidth < 120 && previewBoxWidth > 0) targetWidth = previewBoxWidth;

        let scale = 0.72;
        if (lockToInitialFile) {
          const targetHeight = Math.max(box?.clientHeight ?? previewBoxHeight, 0);
          if (targetWidth > 0 && targetHeight > 0) {
            const byWidth = targetWidth / baseViewport.width;
            const byHeight = targetHeight / baseViewport.height;
            scale = Math.min(byWidth, byHeight) * 0.99;
            scale = Math.max(scale, 0.55);
          } else if (targetWidth > 0) {
            scale = targetWidth / baseViewport.width;
            scale = Math.max(scale, 0.55);
          } else {
            scale = 0.85;
          }
        }
        const dpr = lockToInitialFile ? Math.min(window.devicePixelRatio || 1, 2) : 1;
        const viewport = page.getViewport({ scale: scale * dpr });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        if (lockToInitialFile && targetWidth > 0) {
          canvas.style.width = `${Math.round(viewport.width / dpr)}px`;
          canvas.style.height = `${Math.round(viewport.height / dpr)}px`;
        } else {
          canvas.style.width = `${Math.round(viewport.width / dpr)}px`;
          canvas.style.height = `${Math.round(viewport.height / dpr)}px`;
        }
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (err) {
      if (isRenderCancelledError(err)) return;
      console.error('Failed to render watermark preview canvas:', err);
      }
    };
    void render();
    return () => {
      cancelled = true;
    };
  }, [previewUrl, lockToInitialFile, previewBoxWidth, previewBoxHeight]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isProcessing = status === 'processing';
  const embedded = lockToInitialFile;
  const contrastBoostClass = embedded ? workspaceInlineContrastBoostClass : [
    '[&_h3]:text-[hsl(var(--color-foreground))]',
    '[&_label]:text-[hsl(var(--color-foreground))]',
    '[&_label]:font-medium',
    '[&_p]:text-[hsl(var(--color-muted-foreground))]',
    '[&_span]:text-[hsl(var(--color-foreground))]',
    '[&_input]:text-[hsl(var(--color-foreground))]',
    '[&_input]:border-[hsl(var(--color-border))]',
    '[&_input]:bg-[hsl(var(--color-background))]',
    '[&_textarea]:text-[hsl(var(--color-foreground))]',
    '[&_textarea]:border-[hsl(var(--color-border))]',
    '[&_textarea]:bg-[hsl(var(--color-background))]',
  ].join(' ');

  const cardSize = embedded ? 'md' : 'lg';
  const sectionTitleClass = embedded
    ? workspaceInlineSectionTitleClass
    : 'text-lg font-medium text-gray-900 dark:text-gray-100';
  const fieldLabelClass = embedded
    ? workspaceInlineFieldLabelClass
    : 'block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300';
  const inputClass = embedded
    ? workspaceInlineInputClass
    : 'w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100';
  const actionBtnSize = embedded ? workspaceInlineActionBtnSize : 'lg';
  const radioLabelClass = embedded
    ? workspaceInlineRadioLabelClass
    : 'text-sm font-medium text-gray-700 dark:text-gray-300';
  const toggleTrackClass = embedded ? 'w-9 h-5' : 'w-11 h-6';
  const toggleKnobClass = embedded
    ? 'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform'
    : 'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform';
  const toggleKnobOnClass = embedded ? 'translate-x-4' : 'translate-x-5';
  const rangeClass = 'pdfcraft-range w-full';
  const sliderValueClass = embedded
    ? `${workspaceInlineHintClass} tabular-nums shrink-0`
    : 'text-[11px] tabular-nums text-gray-500 dark:text-gray-400 shrink-0';

  return (
    <div className={`${workspaceInlineRootClass(embedded)} ${contrastBoostClass} ${className}`.trim()}>
      {!file && !lockToInitialFile && (
        <FileUploader
          accept={['application/pdf', '.pdf']}
          multiple={false}
          maxFiles={1}
          onFilesSelected={handleFilesSelected}
          onError={setError}
          disabled={isProcessing}
          label={tTools('uploadLabel')}
          description={tTools('uploadDescription')}
        />
      )}

      {error && (
        <div className={embedded ? workspaceInlineErrorClass : 'p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'}>
          <p className={embedded ? undefined : 'text-sm'}>{error}</p>
        </div>
      )}

      {file && (
        <div className={`grid grid-cols-1 ${embedded ? 'xl:grid-cols-[minmax(0,4fr)_minmax(0,6fr)] xl:gap-5 xl:items-start gap-4 w-full' : 'lg:grid-cols-[570px_1fr] gap-6'}`}>
          <div className={embedded ? 'space-y-3 min-w-0' : 'space-y-6'}>
            <div ref={settingsUpToRangeRef} className={embedded ? 'space-y-3' : 'space-y-6'}>
            <Card variant="outlined" size={cardSize}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <svg className={`${embedded ? 'w-8 h-8' : 'w-10 h-10'} shrink-0 text-red-500`} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                  </svg>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
                    <p className={`text-gray-500 dark:text-gray-400 ${embedded ? workspaceInlineHintClass : 'text-sm'}`}>{formatSize(file.size)}</p>
                  </div>
                </div>
                {!lockToInitialFile ? (
                  <Button variant="ghost" size="sm" onClick={handleClearFile} disabled={isProcessing}>
                    {t('buttons.remove')}
                  </Button>
                ) : null}
              </div>
            </Card>

            <Card variant="outlined" size={cardSize}>
              <h3 className={`${sectionTitleClass} ${embedded ? 'mb-3' : 'mb-4'}`}>
                {tTools('optionsTitle')}
              </h3>

              {/* Watermark Type Selection */}
              <div className={`flex ${embedded ? 'gap-4 mb-4' : 'gap-6 mb-6'}`}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="watermark-type"
                    value="text"
                    checked={watermarkType === 'text'}
                    onChange={() => setWatermarkType('text')}
                    className={`${embedded ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-blue-600`}
                    disabled={isProcessing}
                  />
                  <span className={radioLabelClass}>
                    {tTools('textWatermark')}
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="watermark-type"
                    value="image"
                    checked={watermarkType === 'image'}
                    onChange={() => setWatermarkType('image')}
                    className={`${embedded ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-blue-600`}
                    disabled={isProcessing}
                  />
                  <span className={radioLabelClass}>
                    {tTools('imageWatermark')}
                  </span>
                </label>
              </div>

              {/* Text Watermark Options */}
              {watermarkType === 'text' && (
                <div className={embedded ? 'space-y-3' : 'space-y-4'}>
                  <div>
                    <label className={fieldLabelClass}>
                      {tTools('watermarkText')}
                    </label>
                    <input
                      type="text"
                      value={watermarkText}
                      onChange={(e) => setWatermarkText(e.target.value)}
                      placeholder={tTools('textPlaceholder')}
                      className={inputClass}
                      disabled={isProcessing}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={fieldLabelClass}>
                        {tTools('fontSize')}
                      </label>
                      <input
                        type="number"
                        value={fontSize}
                        onChange={(e) => setFontSize(parseInt(e.target.value) || 72)}
                        min={10}
                        max={200}
                        className={inputClass}
                        disabled={isProcessing}
                      />
                    </div>
                    <div>
                      <label className={fieldLabelClass}>
                        {tTools('color')}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={textColor}
                          onChange={(e) => setTextColor(e.target.value)}
                          className={`${embedded ? 'w-8 h-8' : 'w-10 h-10'} p-0.5 cursor-pointer rounded border border-gray-300 dark:border-gray-600`}
                          disabled={isProcessing}
                        />
                        <input
                          type="text"
                          value={textColor}
                          onChange={(e) => setTextColor(e.target.value)}
                          className={`${inputClass} text-sm`}
                          disabled={isProcessing}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className={`${fieldLabelClass} mb-0`}>{tTools('opacity')}</label>
                        <span className={sliderValueClass}>{Math.round(textOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        value={textOpacity}
                        onChange={(e) => setTextOpacity(parseFloat(e.target.value))}
                        min={0.1}
                        max={1}
                        step={0.1}
                        className={rangeClass}
                        disabled={isProcessing}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className={`${fieldLabelClass} mb-0`}>{tTools('angle')}</label>
                        <span className={sliderValueClass}>{textAngle}°</span>
                      </div>
                      <input
                        type="range"
                        value={textAngle}
                        onChange={(e) => setTextAngle(parseInt(e.target.value))}
                        min={-90}
                        max={90}
                        step={5}
                        className={rangeClass}
                        disabled={isProcessing}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Image Watermark Options */}
              {watermarkType === 'image' && (
                <div className={embedded ? 'space-y-3' : 'space-y-4'}>
                  <div>
                    <label className={fieldLabelClass}>
                      {tTools('watermarkImage')}
                    </label>
                    <input
                      type="file"
                      accept="image/png, image/jpeg"
                      onChange={handleImageSelected}
                      className={`${inputClass} file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700`}
                      disabled={isProcessing}
                    />
                    {imageFile && (
                      <p className={`text-gray-500 dark:text-gray-400 mt-1 ${embedded ? workspaceInlineHintClass : 'text-sm'}`}>
                        {imageFile.name} ({formatSize(imageFile.size)})
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className={`${fieldLabelClass} mb-0`}>{tTools('opacity')}</label>
                        <span className={sliderValueClass}>{Math.round(imageOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        value={imageOpacity}
                        onChange={(e) => setImageOpacity(parseFloat(e.target.value))}
                        min={0.1}
                        max={1}
                        step={0.1}
                        className={rangeClass}
                        disabled={isProcessing}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className={`${fieldLabelClass} mb-0`}>{tTools('angle')}</label>
                        <span className={sliderValueClass}>{imageAngle}°</span>
                      </div>
                      <input
                        type="range"
                        value={imageAngle}
                        onChange={(e) => setImageAngle(parseInt(e.target.value))}
                        min={-90}
                        max={90}
                        step={5}
                        className={rangeClass}
                        disabled={isProcessing}
                      />
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {/* Repeat Watermark Options */}
            <Card variant="outlined" size={cardSize}>
              <div className={`flex items-center justify-between gap-3 ${embedded ? 'mb-3' : 'mb-4'}`}>
                <h3 className={sectionTitleClass}>
                  {tTools('repeatTitle')}
                </h3>
                <label className="flex shrink-0 items-center gap-2 cursor-pointer select-none">
                  <div className="relative inline-flex">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={repeatWatermark}
                      onChange={(e) => setRepeatWatermark(e.target.checked)}
                      disabled={isProcessing}
                    />
                    <div className={`${toggleTrackClass} rounded-full transition-colors ${repeatWatermark ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`} />
                    <div className={`${toggleKnobClass} ${repeatWatermark ? toggleKnobOnClass : 'translate-x-0'
                      }`} />
                  </div>
                  {!embedded ? (
                    <span className={radioLabelClass}>
                      {tTools('repeatEnable')}
                    </span>
                  ) : null}
                </label>
              </div>
              {embedded ? (
                <p className={`${workspaceInlineHintClass} mb-3 -mt-1`}>{tTools('repeatEnable')}</p>
              ) : null}

              {repeatWatermark && (
                <div className={embedded ? 'space-y-4' : 'space-y-6'}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className={`${fieldLabelClass} mb-0`}>{tTools('repeatSpacingX')}</label>
                        <span className={sliderValueClass}>{repeatSpacingX}pt</span>
                      </div>
                      <input
                        type="range"
                        value={repeatSpacingX}
                        onChange={(e) => setRepeatSpacingX(parseInt(e.target.value))}
                        min={20}
                        max={600}
                        step={10}
                        className={rangeClass}
                        disabled={isProcessing}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className={`${fieldLabelClass} mb-0`}>{tTools('repeatSpacingY')}</label>
                        <span className={sliderValueClass}>{repeatSpacingY}pt</span>
                      </div>
                      <input
                        type="range"
                        value={repeatSpacingY}
                        onChange={(e) => setRepeatSpacingY(parseInt(e.target.value))}
                        min={20}
                        max={600}
                        step={10}
                        className={rangeClass}
                        disabled={isProcessing}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                    <div className="min-w-0">
                      <p className={radioLabelClass}>
                        {tTools('staggerTitle')}
                      </p>
                      <p className={workspaceInlineHintClass}>
                        {tTools('staggerDescription')}
                      </p>
                    </div>
                    <label className="flex shrink-0 items-center cursor-pointer select-none">
                      <div className="relative inline-flex">
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={staggerWatermark}
                          onChange={(e) => setStaggerWatermark(e.target.checked)}
                          disabled={isProcessing}
                        />
                        <div className={`${toggleTrackClass} rounded-full transition-colors ${staggerWatermark ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                          }`} />
                        <div className={`${toggleKnobClass} ${staggerWatermark ? toggleKnobOnClass : 'translate-x-0'
                          }`} />
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </Card>

            {/* Page Range Selection */}
            <Card variant="outlined" size={cardSize}>
              <h3 className={`${sectionTitleClass} ${embedded ? 'mb-3' : 'mb-4'}`}>
                {tTools('rangeTitle')}
              </h3>

              <div className={embedded ? 'space-y-3' : 'space-y-4'}>
                <div className={`grid ${embedded ? 'grid-cols-2 gap-2' : 'flex flex-wrap gap-4'}`}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="page-mode"
                      value="all"
                      checked={pageMode === 'all'}
                      onChange={() => setPageMode('all')}
                      className={`${embedded ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-blue-600`}
                      disabled={isProcessing}
                    />
                    <span className={radioLabelClass}>
                      {tTools('rangeAll')}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="page-mode"
                      value="odd"
                      checked={pageMode === 'odd'}
                      onChange={() => setPageMode('odd')}
                      className={`${embedded ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-blue-600`}
                      disabled={isProcessing}
                    />
                    <span className={radioLabelClass}>
                      {tTools('rangeOdd')}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="page-mode"
                      value="even"
                      checked={pageMode === 'even'}
                      onChange={() => setPageMode('even')}
                      className={`${embedded ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-blue-600`}
                      disabled={isProcessing}
                    />
                    <span className={radioLabelClass}>
                      {tTools('rangeEven')}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="page-mode"
                      value="custom"
                      checked={pageMode === 'custom'}
                      onChange={() => setPageMode('custom')}
                      className={`${embedded ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-blue-600`}
                      disabled={isProcessing}
                    />
                    <span className={radioLabelClass}>
                      {tTools('rangeCustom')}
                    </span>
                  </label>
                </div>

                {pageMode === 'custom' && (
                  <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                    <input
                      type="text"
                      value={customPageRange}
                      onChange={(e) => setCustomPageRange(e.target.value)}
                      placeholder={tTools('rangePlaceholder')}
                      className={inputClass}
                      disabled={isProcessing}
                    />
                  </div>
                )}
              </div>
            </Card>
            </div>

            <div className={`flex flex-wrap items-center ${embedded ? 'gap-2' : 'gap-4'}`}>
              <Button
                variant="primary"
                size={actionBtnSize}
                onClick={handleProcess}
                disabled={!file || isProcessing || (watermarkType === 'text' && !watermarkText.trim()) || (watermarkType === 'image' && !imageFile)}
                loading={isProcessing}
              >
                {isProcessing ? t('status.processing') : tTools('addButton')}
              </Button>
              {result && (
                <DownloadButton
                  file={result}
                  filename={file.name.replace('.pdf', '_watermarked.pdf')}
                  variant="secondary"
                  size={actionBtnSize}
                  showFileSize
                />
              )}
            </div>

            {isProcessing && (
              <ProcessingProgress
                progress={progress}
                status={status}
                message={progressMessage}
                onCancel={() => { cancelledRef.current = true; setStatus('idle'); }}
                showPercentage
              />
            )}

            {status === 'complete' && result && (
              <p className={embedded ? workspaceInlineSuccessClass : 'text-sm font-medium text-green-700 dark:text-green-400'} role="status">
                {tTools('successMessage')}
              </p>
            )}
          </div>

          {/* Preview Section (Header/Footer-like) */}
          <div className={embedded ? 'min-w-0 w-full' : 'space-y-4'}>
            <Card
              variant="outlined"
              size={cardSize}
              className={embedded ? '!p-3 flex flex-col' : undefined}
              style={embedded && settingsColHeight > 0 ? { height: settingsColHeight } : undefined}
            >
              <div className={`flex items-center justify-between gap-2 shrink-0 ${embedded ? 'mb-3' : 'mb-4'}`}>
                <h3 className={sectionTitleClass}>
                  {tTools('previewTitle')}
                </h3>
                <div className="flex items-center gap-0.5 rounded-md border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] px-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 px-0 text-xs"
                    onClick={() => setCurrentPreviewPage((p) => Math.max(1, p - 1))}
                    disabled={currentPreviewPage <= 1 || totalPages <= 1}
                    aria-label={t('buttons.previous')}
                  >
                    ←
                  </Button>
                  <span className={`whitespace-nowrap px-1 text-gray-600 dark:text-gray-300 ${embedded ? workspaceInlineHintClass : 'text-sm'}`}>
                    {tTools('previewPageOf', { current: currentPreviewPage, total: Math.max(1, totalPages) })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 px-0 text-xs"
                    onClick={() => setCurrentPreviewPage((p) => Math.min(Math.max(1, totalPages), p + 1))}
                    disabled={currentPreviewPage >= totalPages || totalPages <= 1}
                    aria-label={t('buttons.next')}
                  >
                    →
                  </Button>
                </div>
              </div>

              <div
                ref={previewBoxRef}
                className={`w-full ${embedded ? 'p-0 flex-1 min-h-0 overflow-hidden flex items-center justify-center rounded-md border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.12)]' : 'flex justify-center items-start overflow-hidden rounded-md border border-[hsl(var(--color-border))] bg-gray-100 p-4 min-h-[520px]'}`}
              >
                {previewUrl ? (
                  <canvas
                    ref={previewCanvasRef}
                    className={`bg-white block w-full h-auto ${embedded ? 'shadow-sm rounded-sm' : 'shadow-sm rounded-sm'}`}
                  />
                ) : (
                  <div className={`w-full text-[hsl(var(--color-muted-foreground))] text-center ${embedded ? 'py-10 px-2 rounded-md border border-dashed border-[hsl(var(--color-border))]' : 'p-8'}`}>
                    <svg className={`mx-auto mb-2 opacity-20 ${embedded ? 'w-8 h-8' : 'w-12 h-12'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <p className={embedded ? workspaceInlineHintClass : undefined}>{tTools('previewTitle')}</p>
                  </div>
                )}
              </div>

              <div className={`text-center shrink-0 ${embedded ? 'mt-3' : 'mt-3'}`}>
                {isPreviewing ? (
                  <span className={`inline-flex items-center gap-1 text-[hsl(var(--color-muted-foreground))] ${embedded ? workspaceInlineHintClass : 'text-sm'}`}>
                    <svg className="animate-spin h-3.5 w-3.5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {tTools('previewGenerating')}
                  </span>
                ) : (
                  <span className={`inline-flex items-center gap-1 text-green-600 ${embedded ? workspaceInlineHintClass : 'text-sm'}`}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {tTools('previewNote')}
                  </span>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};


export default WatermarkTool;

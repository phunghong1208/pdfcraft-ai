'use client';

import React, { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { addPageNumbers, PageNumberOptions } from '@/lib/pdf/processors/page-numbers';
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

// Store pdfjs module reference
let pdfjsModule: typeof import('pdfjs-dist') | null = null;

export interface PageNumbersToolProps {
  className?: string;
  initialFile?: File | null;
  lockToInitialFile?: boolean;
  onFileUpdated?: (file: File) => void;
}

type Position = 'bottom-center' | 'bottom-left' | 'bottom-right' | 'top-center' | 'top-left' | 'top-right';
type Format = 'number' | 'roman' | 'page-of-total' | 'custom';

export function PageNumbersTool({
  className = '',
  initialFile = null,
  lockToInitialFile = false,
  onFileUpdated,
}: PageNumbersToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');

  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Options
  const [position, setPosition] = useState<Position>('bottom-center');
  const [format, setFormat] = useState<Format>('number');
  const [customFormat, setCustomFormat] = useState('Page {page} of {total}');
  const [startNumber, setStartNumber] = useState(1);
  const [fontSize, setFontSize] = useState(12);
  const [fontColor, setFontColor] = useState('#000000');
  const [margin, setMargin] = useState(30);
  const [skipFirstPage, setSkipFirstPage] = useState(false);
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  // Odd/Even page settings
  const [pageMode, setPageMode] = useState<'all' | 'odd-only' | 'even-only' | 'odd-even-different'>('all');
  const [oddPosition, setOddPosition] = useState<Position>('bottom-right');
  const [evenPosition, setEvenPosition] = useState<Position>('bottom-left');

  // Preview state
  const [totalPages, setTotalPages] = useState(0);
  const [currentPreviewPage, setCurrentPreviewPage] = useState(1);
  const [previewScale, setPreviewScale] = useState(0.9);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const settingsUpToRangeRef = useRef<HTMLDivElement>(null);
  const [settingsColHeight, setSettingsColHeight] = useState(0);
  const [previewBoxWidth, setPreviewBoxWidth] = useState(0);
  const [previewBoxHeight, setPreviewBoxHeight] = useState(0);
  const cancelledRef = useRef(false);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const renderGenerationRef = useRef(0);
  const renderQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Load pdfjs module dynamically
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

  // Load PDF preview
  const loadPdfPreview = useCallback(async (pdfFile: File) => {
    try {
      const pdfjsLib = await loadPdfjsLib();
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setTotalPages(pdf.numPages);
      setCurrentPreviewPage(1);
    } catch (err) {
      console.error('Failed to load PDF:', err);
    }
  }, []);

  // Render page with page number overlay
  const computePreviewScale = useCallback(
    (pageWidth: number, pageHeight: number) => {
      const box = previewBoxRef.current;
      let targetWidth = Math.max(box?.clientWidth ?? previewBoxWidth, 0);
      let targetHeight = Math.max(box?.clientHeight ?? previewBoxHeight, 0);

      if (lockToInitialFile && targetWidth > 0 && targetHeight > 0) {
        const byWidth = targetWidth / pageWidth;
        const byHeight = targetHeight / pageHeight;
        return Math.max(Math.min(byWidth, byHeight) * 0.99, 0.55);
      }
      if (lockToInitialFile && targetWidth > 0) {
        return Math.max((targetWidth / pageWidth) * 0.99, 0.55);
      }
      if (!lockToInitialFile) {
        return Math.max(0.6, Math.min(2, previewScale)) * 1.2;
      }
      return 0.85;
    },
    [lockToInitialFile, previewBoxWidth, previewBoxHeight, previewScale],
  );

  const renderPagePreview = async (pdf: { numPages: number; getPage: (n: number) => Promise<unknown> }, pageNum: number) => {
    if (!previewCanvasRef.current) return;
    const generation = ++renderGenerationRef.current;

    // Cancel any ongoing render task
    if (renderTaskRef.current) {
      const activeTask = renderTaskRef.current as { cancel: () => void; promise?: Promise<unknown> };
      try {
        activeTask.cancel();
        await activeTask.promise?.catch(() => undefined);
      } catch {
        // Ignore cancel errors
      }
      renderTaskRef.current = null;
    }

    try {
      const page = (await pdf.getPage(pageNum)) as {
        rotate: number;
        getViewport: (opts: { scale: number; rotation?: number }) => { width: number; height: number };
        render: (opts: {
          canvasContext: CanvasRenderingContext2D;
          viewport: { width: number; height: number };
          transform?: number[] | null;
        }) => { promise: Promise<void>; cancel: () => void };
      };
      const pageRotation = page.rotate ?? 0;
      const baseViewport = page.getViewport({ scale: 1, rotation: pageRotation });
      const renderScale = computePreviewScale(baseViewport.width, baseViewport.height);
      const viewport = page.getViewport({ scale: renderScale, rotation: pageRotation });
      const dpr = lockToInitialFile ? Math.min(window.devicePixelRatio || 1, 2) : 1;

      const canvas = previewCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null;
      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
        ...(transform ? { transform } : {}),
      });
      renderTaskRef.current = renderTask;

      await renderTask.promise;
      if (generation !== renderGenerationRef.current) return;
      renderTaskRef.current = null;

      const isOddPage = pageNum % 2 === 1;
      let shouldDraw = true;
      if (skipFirstPage && pageNum === 1) shouldDraw = false;
      else if (pageMode === 'odd-only' && !isOddPage) shouldDraw = false;
      else if (pageMode === 'even-only' && isOddPage) shouldDraw = false;

      if (shouldDraw) {
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawPageNumberOverlay(ctx, viewport.width, viewport.height, pageNum, pdf.numPages, renderScale, isOddPage);
        ctx.restore();
      }

    } catch (err) {
      // Ignore cancelled render errors
      if (err instanceof Error && err.message.includes('cancelled')) {
        return;
      }
      console.error('Failed to render page:', err);
    }
  };

  // Format page number based on options
  const formatPageNumber = (page: number, total: number): string => {
    const adjustedPage = page - 1 + startNumber;
    let text = '';

    switch (format) {
      case 'number':
        text = String(adjustedPage);
        break;
      case 'roman':
        text = toRoman(adjustedPage);
        break;
      case 'page-of-total':
        text = `Page ${adjustedPage} of ${total - 1 + startNumber}`;
        break;
      case 'custom':
        text = customFormat
          .replace(/{page}/g, String(adjustedPage))
          .replace(/{total}/g, String(total - 1 + startNumber));
        break;
    }

    return `${prefix}${text}${suffix}`;
  };

  // Convert number to Roman numeral
  const toRoman = (num: number): string => {
    const romanNumerals: [number, string][] = [
      [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
      [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
      [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
    ];
    let result = '';
    let n = num;
    for (const [value, symbol] of romanNumerals) {
      while (n >= value) {
        result += symbol;
        n -= value;
      }
    }
    return result;
  };

  // Draw page number on canvas
  const drawPageNumberOverlay = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    page: number,
    total: number,
    renderScale: number = 1,
    isOddPage: boolean = true
  ) => {
    const text = formatPageNumber(page, total);
    // Scale font size and margin according to render scale
    const scaledFontSize = fontSize * renderScale;
    const scaledMargin = margin * renderScale;

    ctx.font = `${scaledFontSize}px Arial`;
    ctx.fillStyle = fontColor;

    // Determine effective position based on page mode
    let effectivePosition: Position = position;
    if (pageMode === 'odd-even-different') {
      effectivePosition = isOddPage ? oddPosition : evenPosition;
    }

    // Calculate position
    let x = 0;
    let y = 0;

    switch (effectivePosition) {
      case 'bottom-center':
        ctx.textAlign = 'center';
        x = width / 2;
        y = height - scaledMargin;
        break;
      case 'bottom-left':
        ctx.textAlign = 'left';
        x = scaledMargin;
        y = height - scaledMargin;
        break;
      case 'bottom-right':
        ctx.textAlign = 'right';
        x = width - scaledMargin;
        y = height - scaledMargin;
        break;
      case 'top-center':
        ctx.textAlign = 'center';
        x = width / 2;
        y = scaledMargin + scaledFontSize;
        break;
      case 'top-left':
        ctx.textAlign = 'left';
        x = scaledMargin;
        y = scaledMargin + scaledFontSize;
        break;
      case 'top-right':
        ctx.textAlign = 'right';
        x = width - scaledMargin;
        y = scaledMargin + scaledFontSize;
        break;
    }

    // Draw background for visibility
    const metrics = ctx.measureText(text);
    const padding = 4 * renderScale;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(
      x - (ctx.textAlign === 'center' ? metrics.width / 2 : ctx.textAlign === 'right' ? metrics.width : 0) - padding,
      y - scaledFontSize,
      metrics.width + padding * 2,
      scaledFontSize + padding
    );

    // Draw text
    ctx.fillStyle = fontColor;
    ctx.fillText(text, x, y);
  };

  // Re-render preview when options change
  useEffect(() => {
    if (!file || totalPages <= 0) return;

    const requestId = ++renderGenerationRef.current;
    renderQueueRef.current = renderQueueRef.current
      .then(async () => {
        if (requestId !== renderGenerationRef.current) return;
        const pdfjsLib = await loadPdfjsLib();
        const arrayBuffer = await file.arrayBuffer();
        if (requestId !== renderGenerationRef.current) return;
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (requestId !== renderGenerationRef.current) return;
        await renderPagePreview(pdf, currentPreviewPage);
      })
      .catch((err) => {
        console.error('Preview render queue failed:', err);
      });
  }, [file, position, format, customFormat, startNumber, fontSize, fontColor, margin, skipFirstPage, prefix, suffix, currentPreviewPage, totalPages, pageMode, oddPosition, evenPosition, previewScale, previewBoxWidth, previewBoxHeight, computePreviewScale]);

  useEffect(() => {
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
  }, [file, settingsColHeight]);

  useLayoutEffect(() => {
    if (!lockToInitialFile || settingsColHeight <= 0) return;
    const box = previewBoxRef.current;
    if (!box) return;
    const w = Math.floor(box.clientWidth);
    const h = Math.floor(box.clientHeight);
    if (w > 0 && h > 0 && (w !== previewBoxWidth || h !== previewBoxHeight)) {
      setPreviewBoxWidth(w);
      setPreviewBoxHeight(h);
    }
  }, [lockToInitialFile, settingsColHeight, previewBoxWidth, previewBoxHeight]);

  useEffect(() => {
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
    position,
    format,
    customFormat,
    pageMode,
    oddPosition,
    evenPosition,
    skipFirstPage,
    status,
  ]);

  const handleFilesSelected = useCallback((files: File[]) => {
    if (files.length > 0) {
      setFile(files[0]);
      setError(null);
      setResult(null);
      loadPdfPreview(files[0]);
    }
  }, [loadPdfPreview]);

  useEffect(() => {
    if (!initialFile) return;
    handleFilesSelected([initialFile]);
  }, [initialFile, handleFilesSelected]);

  const handleClearFile = useCallback(() => {
    setFile(null);
    setResult(null);
    setError(null);
    setStatus('idle');
    setTotalPages(0);
    setCurrentPreviewPage(1);
  }, []);

  const handleProcess = useCallback(async () => {
    if (!file) return;

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      const options: PageNumberOptions = {
        position,
        format: format as PageNumberOptions['format'],
        startNumber,
        fontSize,
        fontColor,
        margin,
        skipFirstPage,
        prefix,
        suffix,
        customFormat: format === 'custom' ? customFormat : undefined,
        pageMode,
        oddPosition,
        evenPosition,
      };

      const output: ProcessOutput = await addPageNumbers(file, options, (prog, message) => {
        if (!cancelledRef.current) {
          setProgress(prog);
          setProgressMessage(message || '');
        }
      });

      if (output.success && output.result) {
        const resultBlob = output.result as Blob;
        setResult(resultBlob);
        setStatus('complete');
        if (lockToInitialFile && onFileUpdated && file) {
          const updatedFile = new File([resultBlob], file.name, { type: 'application/pdf' });
          onFileUpdated(updatedFile);
        }
      } else {
        setError(output.error?.message || 'Failed to add page numbers.');
        setStatus('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setStatus('error');
    }
  }, [file, position, format, customFormat, startNumber, fontSize, fontColor, margin, skipFirstPage, prefix, suffix, pageMode, oddPosition, evenPosition]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isProcessing = status === 'processing';
  const embedded = lockToInitialFile;
  const cardSize = embedded ? 'md' : 'lg';
  const sectionTitleClass = embedded
    ? `${workspaceInlineSectionTitleClass} mb-3`
    : 'text-lg font-medium mb-4';
  const fieldLabelClass = embedded
    ? workspaceInlineFieldLabelClass
    : 'block text-sm font-medium mb-1 text-[hsl(var(--color-foreground))]';
  const inputClass = embedded
    ? workspaceInlineInputClass
    : 'w-full px-3 py-2 text-sm border rounded-md border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))]';
  const inputUniformClass = `${inputClass} h-10 min-w-0`;
  const fieldGridClass = 'grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2';
  const fieldCellClass = 'min-w-0';
  const actionBtnSize = embedded ? workspaceInlineActionBtnSize : 'lg';
  const contrastBoostClass = embedded ? workspaceInlineContrastBoostClass : '';

  const positionOptions: { value: Position; labelKey: string; icon: string }[] = [
    { value: 'top-left', labelKey: 'posTopLeft', icon: '↖' },
    { value: 'top-center', labelKey: 'posTopCenter', icon: '↑' },
    { value: 'top-right', labelKey: 'posTopRight', icon: '↗' },
    { value: 'bottom-left', labelKey: 'posBottomLeft', icon: '↙' },
    { value: 'bottom-center', labelKey: 'posBottomCenter', icon: '↓' },
    { value: 'bottom-right', labelKey: 'posBottomRight', icon: '↘' },
  ];

  const positionBtnClass = (active: boolean) =>
    `rounded-md border p-2 text-center transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
      active
        ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary)/0.12)] text-[hsl(var(--color-foreground))]'
        : 'border-[hsl(var(--color-border))] text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted)/0.35)]'
    }`;

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
          label={tTools('pageNumbers.uploadLabel')}
          description={tTools('pageNumbers.uploadDescription')}
        />
      )}

      {error && (
        <div className={embedded ? workspaceInlineErrorClass : 'p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700'}>
          <p className={embedded ? undefined : 'text-sm'}>{error}</p>
        </div>
      )}

      {file && (
        <div
          className={`grid w-full grid-cols-1 gap-4 ${
            embedded
              ? 'xl:grid-cols-[minmax(0,4fr)_minmax(0,6fr)] xl:items-start xl:gap-5'
              : 'lg:grid-cols-2 lg:gap-6 lg:items-start'
          }`}
        >
          <div className={`min-w-0 ${embedded ? 'space-y-3' : 'space-y-6'}`}>
            <div ref={settingsUpToRangeRef} className={embedded ? 'space-y-3' : 'space-y-4'}>
              <Card variant="outlined" size={cardSize}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <svg className="h-8 w-8 shrink-0 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                    </svg>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{file.name}</p>
                      <p className={workspaceInlineHintClass}>
                        {tTools('pageNumbers.fileMeta', { size: formatSize(file.size), pages: totalPages })}
                      </p>
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
                <h3 className={sectionTitleClass}>{tTools('pageNumbers.positionTitle')}</h3>
                <div className="grid grid-cols-3 gap-2">
                  {positionOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPosition(opt.value)}
                      disabled={isProcessing}
                      className={positionBtnClass(position === opt.value)}
                    >
                      <span className="text-base leading-none">{opt.icon}</span>
                      <span className={`mt-1 block ${workspaceInlineHintClass}`}>
                        {tTools(`pageNumbers.${opt.labelKey}`)}
                      </span>
                    </button>
                  ))}
                </div>
              </Card>

              <Card variant="outlined" size={cardSize}>
                <h3 className={sectionTitleClass}>{tTools('pageNumbers.formatTitle')}</h3>
                <div className={fieldGridClass}>
                  <div className={fieldCellClass}>
                    <label className={fieldLabelClass}>{tTools('pageNumbers.style')}</label>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value as Format)}
                      className={inputUniformClass}
                      disabled={isProcessing}
                    >
                      <option value="number">1, 2, 3...</option>
                      <option value="roman">I, II, III...</option>
                      <option value="page-of-total">{tTools('pageNumbers.formatPageOfTotal')}</option>
                      <option value="custom">{tTools('pageNumbers.customFormat')}</option>
                    </select>
                  </div>
                  <div className={fieldCellClass}>
                    <label className={fieldLabelClass}>{tTools('pageNumbers.startNumber')}</label>
                    <input
                      type="number"
                      value={startNumber}
                      onChange={(e) => setStartNumber(parseInt(e.target.value) || 1)}
                      min={1}
                      className={inputUniformClass}
                      disabled={isProcessing}
                    />
                  </div>
                </div>

                {format === 'custom' && (
                  <div className="mt-3">
                    <label className={fieldLabelClass}>{tTools('pageNumbers.customFormat')}</label>
                    <input
                      type="text"
                      value={customFormat}
                      onChange={(e) => setCustomFormat(e.target.value)}
                      placeholder="Page {page} of {total}"
                      className={inputUniformClass}
                      disabled={isProcessing}
                    />
                    <p className={`${workspaceInlineHintClass} mt-1.5`}>
                      {tTools('pageNumbers.customFormatHint', { page: '{page}', total: '{total}' })}
                    </p>
                  </div>
                )}

                <div className={`${fieldGridClass} mt-3`}>
                  <div className={fieldCellClass}>
                    <label className={fieldLabelClass}>{tTools('pageNumbers.prefix')}</label>
                    <input
                      type="text"
                      value={prefix}
                      onChange={(e) => setPrefix(e.target.value)}
                      placeholder={tTools('pageNumbers.prefixPlaceholder')}
                      className={inputUniformClass}
                      disabled={isProcessing}
                    />
                  </div>
                  <div className={fieldCellClass}>
                    <label className={fieldLabelClass}>{tTools('pageNumbers.suffix')}</label>
                    <input
                      type="text"
                      value={suffix}
                      onChange={(e) => setSuffix(e.target.value)}
                      placeholder={tTools('pageNumbers.suffixPlaceholder')}
                      className={inputUniformClass}
                      disabled={isProcessing}
                    />
                  </div>
                </div>
              </Card>

              <Card variant="outlined" size={cardSize}>
                <h3 className={sectionTitleClass}>{tTools('pageNumbers.appearanceTitle')}</h3>
                <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2">
                  <div className={fieldCellClass}>
                    <label className={fieldLabelClass}>{tTools('pageNumbers.fontSize')}</label>
                    <input
                      type="number"
                      value={fontSize}
                      onChange={(e) => setFontSize(parseInt(e.target.value) || 12)}
                      min={6}
                      max={72}
                      className={inputUniformClass}
                      disabled={isProcessing}
                    />
                  </div>
                  <div className={fieldCellClass}>
                    <label className={fieldLabelClass}>{tTools('pageNumbers.margin')}</label>
                    <input
                      type="number"
                      value={margin}
                      onChange={(e) => setMargin(parseInt(e.target.value) || 30)}
                      min={10}
                      max={100}
                      className={inputUniformClass}
                      disabled={isProcessing}
                    />
                  </div>
                  <div className={fieldCellClass}>
                    <label className={fieldLabelClass}>{tTools('pageNumbers.color')}</label>
                    <div className="flex h-10 items-center gap-1.5">
                      <input
                        type="color"
                        value={fontColor}
                        onChange={(e) => setFontColor(e.target.value)}
                        className="h-10 w-10 shrink-0 cursor-pointer rounded-md border border-[hsl(var(--color-border))] bg-transparent p-0.5"
                        disabled={isProcessing}
                      />
                      <input
                        type="text"
                        value={fontColor}
                        onChange={(e) => setFontColor(e.target.value)}
                        className={`${inputUniformClass} min-w-0 flex-1 font-mono`}
                        disabled={isProcessing}
                      />
                    </div>
                  </div>
                </div>

                <label className="mt-4 flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={skipFirstPage}
                    onChange={(e) => setSkipFirstPage(e.target.checked)}
                    className="h-4 w-4 rounded border-[hsl(var(--color-border))]"
                    disabled={isProcessing}
                  />
                  <span className={embedded ? workspaceInlineRadioLabelClass : 'text-sm'}>
                    {tTools('pageNumbers.skipFirstPage')}
                  </span>
                </label>
              </Card>

              <Card variant="outlined" size={cardSize}>
                <h3 className={sectionTitleClass}>{tTools('pageNumbers.oddEvenTitle')}</h3>
                <label className={fieldLabelClass}>{tTools('pageNumbers.pageMode')}</label>
                <select
                  value={pageMode}
                  onChange={(e) => setPageMode(e.target.value as typeof pageMode)}
                  className={`${inputUniformClass} mb-3`}
                  disabled={isProcessing}
                >
                  <option value="all">{tTools('pageNumbers.modeAll')}</option>
                  <option value="odd-only">{tTools('pageNumbers.modeOddOnly')}</option>
                  <option value="even-only">{tTools('pageNumbers.modeEvenOnly')}</option>
                  <option value="odd-even-different">{tTools('pageNumbers.modeDifferent')}</option>
                </select>

                {pageMode === 'odd-even-different' && (
                  <div className={fieldGridClass}>
                    <div className={fieldCellClass}>
                      <label className={fieldLabelClass}>{tTools('pageNumbers.oddPosition')}</label>
                      <select
                        value={oddPosition}
                        onChange={(e) => setOddPosition(e.target.value as Position)}
                        className={inputUniformClass}
                        disabled={isProcessing}
                      >
                        <option value="bottom-left">{tTools('pageNumbers.posBottomLeft')}</option>
                        <option value="bottom-center">{tTools('pageNumbers.posBottomCenter')}</option>
                        <option value="bottom-right">{tTools('pageNumbers.posBottomRight')}</option>
                        <option value="top-left">{tTools('pageNumbers.posTopLeft')}</option>
                        <option value="top-center">{tTools('pageNumbers.posTopCenter')}</option>
                        <option value="top-right">{tTools('pageNumbers.posTopRight')}</option>
                      </select>
                      <p className={`${workspaceInlineHintClass} mt-1`}>{tTools('pageNumbers.oddPositionHint')}</p>
                    </div>
                    <div className={fieldCellClass}>
                      <label className={fieldLabelClass}>{tTools('pageNumbers.evenPosition')}</label>
                      <select
                        value={evenPosition}
                        onChange={(e) => setEvenPosition(e.target.value as Position)}
                        className={inputUniformClass}
                        disabled={isProcessing}
                      >
                        <option value="bottom-left">{tTools('pageNumbers.posBottomLeft')}</option>
                        <option value="bottom-center">{tTools('pageNumbers.posBottomCenter')}</option>
                        <option value="bottom-right">{tTools('pageNumbers.posBottomRight')}</option>
                        <option value="top-left">{tTools('pageNumbers.posTopLeft')}</option>
                        <option value="top-center">{tTools('pageNumbers.posTopCenter')}</option>
                        <option value="top-right">{tTools('pageNumbers.posTopRight')}</option>
                      </select>
                      <p className={`${workspaceInlineHintClass} mt-1`}>{tTools('pageNumbers.evenPositionHint')}</p>
                    </div>
                  </div>
                )}

                {pageMode === 'odd-even-different' && (
                  <p className={`${workspaceInlineHintClass} mt-2 rounded-md border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.2)] px-3 py-2`}>
                    {tTools('pageNumbers.differentModeHint')}
                  </p>
                )}
              </Card>
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

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                size={actionBtnSize}
                onClick={handleProcess}
                disabled={!file || isProcessing}
                loading={isProcessing}
                className={embedded ? 'w-full' : undefined}
              >
                {isProcessing ? t('status.processing') : tTools('pageNumbers.addButton')}
              </Button>
              {result && !embedded && (
                <DownloadButton
                  file={result}
                  filename={file.name.replace('.pdf', '_numbered.pdf')}
                  variant="secondary"
                  size={actionBtnSize}
                  showFileSize
                />
              )}
            </div>

            {status === 'complete' && result && (
              <p className={workspaceInlineSuccessClass} role="status">
                {tTools('pageNumbers.successMessage')}
              </p>
            )}
          </div>

          <div className={`min-w-0 ${embedded ? 'self-start' : ''}`}>
            <Card
              variant="outlined"
              size={cardSize}
              className={embedded ? '!p-3 flex min-h-0 flex-col' : undefined}
              style={embedded && settingsColHeight > 0 ? { height: settingsColHeight } : undefined}
            >
              <div className={`flex shrink-0 items-center justify-between gap-2 ${embedded ? 'mb-2' : 'mb-4'}`}>
                <div className="min-w-0">
                  <h3 className={embedded ? workspaceInlineSectionTitleClass : 'text-lg font-medium'}>
                    {tTools('pageNumbers.preview')}
                  </h3>
                  {embedded ? (
                    <p className={`mt-0.5 truncate ${workspaceInlineHintClass}`}>
                      {skipFirstPage && currentPreviewPage === 1
                        ? tTools('pageNumbers.firstPageSkipped')
                        : tTools('pageNumbers.previewText', { text: formatPageNumber(currentPreviewPage, totalPages) })}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] px-0.5">
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
                  <span className={`whitespace-nowrap px-1 ${workspaceInlineHintClass}`}>
                    {tTools('pageNumbers.previewPageOf', {
                      current: currentPreviewPage,
                      total: Math.max(1, totalPages),
                    })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 px-0 text-xs"
                    onClick={() => setCurrentPreviewPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPreviewPage >= totalPages || totalPages <= 1}
                    aria-label={t('buttons.next')}
                  >
                    →
                  </Button>
                </div>
              </div>

              {!embedded && (
                <div className="mb-4 flex items-center justify-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewScale((s) => Math.max(0.6, s - 0.2))}
                    disabled={previewScale <= 0.6}
                    title={tTools('pageNumbers.zoomOut')}
                  >
                    −
                  </Button>
                  <span className={`min-w-[52px] text-center ${workspaceInlineHintClass}`}>
                    {Math.round(previewScale * 100)}%
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewScale((s) => Math.min(2, s + 0.2))}
                    disabled={previewScale >= 2}
                    title={tTools('pageNumbers.zoomIn')}
                  >
                    +
                  </Button>
                </div>
              )}

              <div
                ref={previewBoxRef}
                className={`flex w-full items-center justify-center overflow-hidden rounded-md border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.12)] ${
                  embedded ? 'min-h-0 flex-1 p-1' : 'min-h-[420px] p-4'
                }`}
              >
                <canvas ref={previewCanvasRef} className="block max-h-full max-w-full rounded-sm bg-white shadow-sm" />
              </div>

              {!embedded ? (
                <p className={`shrink-0 text-center mt-4 ${workspaceInlineHintClass}`}>
                  {skipFirstPage && currentPreviewPage === 1
                    ? tTools('pageNumbers.firstPageSkipped')
                    : tTools('pageNumbers.previewText', { text: formatPageNumber(currentPreviewPage, totalPages) })}
                </p>
              ) : null}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

export default PageNumbersTool;

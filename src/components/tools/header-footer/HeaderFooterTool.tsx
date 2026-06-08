'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { addHeaderFooter, HeaderFooterOptions } from '@/lib/pdf/processors/header-footer';
import type { ProcessOutput } from '@/types/pdf';
import {
  workspaceInlineActionBtnSize,
  workspaceInlineContrastBoostClass,
  workspaceInlineErrorClass,
  workspaceInlineFieldLabelClass,
  workspaceInlineHintClass,
  workspaceInlineInputClass,
  workspaceInlineRootClass,
  workspaceInlineRadioLabelClass,
  workspaceInlineSectionTitleClass,
  workspaceInlineSuccessClass,
} from '@/lib/workspace-inline-tool-ui';

// Store pdfjs module reference
let pdfjsModule: typeof import('pdfjs-dist') | null = null;

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

const isRenderCancelledError = (err: unknown): boolean =>
  err instanceof Error && /Rendering cancelled|cancelled/i.test(err.message);

export interface HeaderFooterToolProps {
  className?: string;
  initialFile?: File | null;
  lockToInitialFile?: boolean;
  onFileUpdated?: (file: File) => void;
}

export function HeaderFooterTool({
  className = '',
  initialFile = null,
  lockToInitialFile = false,
  onFileUpdated,
}: HeaderFooterToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');

  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Header/Footer options
  const [headerLeft, setHeaderLeft] = useState('');
  const [headerCenter, setHeaderCenter] = useState('');
  const [headerRight, setHeaderRight] = useState('');
  const [footerLeft, setFooterLeft] = useState('');
  const [footerCenter, setFooterCenter] = useState('Page {page} of {total}');
  const [footerRight, setFooterRight] = useState('{date}');
  const [fontSize, setFontSize] = useState(10);
  const [fontColor, setFontColor] = useState('#000000');
  const [margin, setMargin] = useState(30);
  const [skipFirstPage, setSkipFirstPage] = useState(false);
  const [pageRange, setPageRange] = useState('all');

  // Preview state
  const [totalPages, setTotalPages] = useState(0);
  const [currentPreviewPage, setCurrentPreviewPage] = useState(1);

  const cancelledRef = useRef(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const settingsUpToRangeRef = useRef<HTMLDivElement>(null);
  const [settingsColHeight, setSettingsColHeight] = useState(0);
  const [previewBoxWidth, setPreviewBoxWidth] = useState(0);
  const [previewBoxHeight, setPreviewBoxHeight] = useState(0);
  const renderTaskRef = useRef<{ cancel: () => void; promise?: Promise<unknown> } | null>(null);
  const renderGenerationRef = useRef(0);
  const renderQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Load PDF and generate preview
  const loadPdfPreview = useCallback(async (pdfFile: File) => {
    try {
      const pdfjsLib = await loadPdfjsLib();
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setTotalPages(pdf.numPages);
      renderPagePreview(pdf, 1);
    } catch (err) {
      console.error('Failed to load PDF preview:', err);
    }
  }, []);

  // Render page preview with header/footer overlay
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
      if (targetWidth > 0) {
        return Math.max((targetWidth / pageWidth) * 0.99, 0.55);
      }
      return 0.85;
    },
    [lockToInitialFile, previewBoxWidth, previewBoxHeight],
  );

  const renderPagePreview = async (pdf: { numPages: number; getPage: (n: number) => Promise<unknown> }, pageNum: number) => {
    if (!previewCanvasRef.current) return;
    const generation = ++renderGenerationRef.current;

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
        await renderTaskRef.current.promise?.catch(() => undefined);
      } catch {
        // ignore cancellation errors
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
        }) => {
          promise: Promise<void>;
        };
      };
      const pageRotation = page.rotate ?? 0;
      const baseViewport = page.getViewport({ scale: 1, rotation: pageRotation });
      const renderScale = computePreviewScale(baseViewport.width, baseViewport.height);
      const viewport = page.getViewport({ scale: renderScale, rotation: pageRotation });
      const dpr = lockToInitialFile ? Math.min(window.devicePixelRatio || 1, 2) : 1;

      const canvas = previewCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // HiDPI: keep viewport at renderScale, pass DPR via transform (matches PDF.js viewer).
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
      renderTaskRef.current = renderTask as { cancel: () => void; promise?: Promise<unknown> };
      await renderTask.promise;
      if (generation !== renderGenerationRef.current) return;
      renderTaskRef.current = null;

      // Check if page should show header/footer
      const shouldShowContent = isPageInRange(pageNum) && !(skipFirstPage && pageNum === 1);
      if (shouldShowContent) {
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawHeaderFooterOverlay(ctx, viewport.width, viewport.height, pageNum, pdf.numPages, renderScale);
        ctx.restore();
      }

    } catch (err) {
      if (isRenderCancelledError(err)) return;
      console.error('Failed to render page:', err);
    }
  };

  // Check if page is in range
  const isPageInRange = (pageNum: number): boolean => {
    if (!pageRange || pageRange.toLowerCase() === 'all' || pageRange.trim() === '') {
      return true;
    }
    const ranges = pageRange.split(',').map(s => s.trim());
    for (const range of ranges) {
      if (range.includes('-')) {
        const [start, end] = range.split('-').map(s => parseInt(s.trim()));
        if (!isNaN(start) && !isNaN(end) && pageNum >= start && pageNum <= end) {
          return true;
        }
      } else {
        const page = parseInt(range);
        if (!isNaN(page) && pageNum === page) {
          return true;
        }
      }
    }
    return false;
  };

  // Draw header and footer text on canvas
  const drawHeaderFooterOverlay = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    page: number,
    total: number,
    pixelScale: number,
  ) => {
    const scaledMargin = margin * pixelScale;
    const scaledFontSize = fontSize * pixelScale;

    ctx.font = `${scaledFontSize}px Arial`;
    ctx.fillStyle = fontColor;

    const today = new Date().toLocaleDateString();

    const replaceVars = (text: string) => {
      return text
        .replace(/{page}/g, String(page))
        .replace(/{total}/g, String(total))
        .replace(/{date}/g, today);
    };

    // Draw header
    if (headerLeft) {
      ctx.textAlign = 'left';
      ctx.fillText(replaceVars(headerLeft), scaledMargin, scaledMargin + scaledFontSize);
    }
    if (headerCenter) {
      ctx.textAlign = 'center';
      ctx.fillText(replaceVars(headerCenter), width / 2, scaledMargin + scaledFontSize);
    }
    if (headerRight) {
      ctx.textAlign = 'right';
      ctx.fillText(replaceVars(headerRight), width - scaledMargin, scaledMargin + scaledFontSize);
    }

    // Draw footer
    if (footerLeft) {
      ctx.textAlign = 'left';
      ctx.fillText(replaceVars(footerLeft), scaledMargin, height - scaledMargin);
    }
    if (footerCenter) {
      ctx.textAlign = 'center';
      ctx.fillText(replaceVars(footerCenter), width / 2, height - scaledMargin);
    }
    if (footerRight) {
      ctx.textAlign = 'right';
      ctx.fillText(replaceVars(footerRight), width - scaledMargin, height - scaledMargin);
    }
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
        console.error('Header/Footer preview queue failed:', err);
      });
  }, [file, headerLeft, headerCenter, headerRight, footerLeft, footerCenter, footerRight, fontSize, fontColor, margin, skipFirstPage, pageRange, currentPreviewPage, totalPages, previewBoxWidth, previewBoxHeight, computePreviewScale]);

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
    headerLeft,
    headerCenter,
    headerRight,
    footerLeft,
    footerCenter,
    footerRight,
    fontSize,
    fontColor,
    margin,
    skipFirstPage,
    pageRange,
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
      const options: HeaderFooterOptions = {
        header: { left: headerLeft, center: headerCenter, right: headerRight },
        footer: { left: footerLeft, center: footerCenter, right: footerRight },
        fontSize,
        fontColor,
        margin,
        skipFirstPage,
        pageRange: pageRange === 'all' ? undefined : pageRange,
      };

      const output: ProcessOutput = await addHeaderFooter(file, options, (prog, message) => {
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
        setError(output.error?.message || 'Failed to add header/footer.');
        setStatus('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      setStatus('error');
    }
  }, [file, headerLeft, headerCenter, headerRight, footerLeft, footerCenter, footerRight, fontSize, fontColor, margin, skipFirstPage, pageRange]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isProcessing = status === 'processing';
  const hasContent = headerLeft || headerCenter || headerRight || footerLeft || footerCenter || footerRight;
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
  const actionBtnSize = embedded ? workspaceInlineActionBtnSize : 'lg';
  const fieldGridClass = 'grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2';
  const fieldCellClass = 'min-w-0';
  const inputUniformClass = `${inputClass} h-10 min-w-0`;
  const contrastBoostClass = embedded
    ? workspaceInlineContrastBoostClass
    : '';

  const posLeft = tTools('headerFooter.positionLeft');
  const posCenter = tTools('headerFooter.positionCenter');
  const posRight = tTools('headerFooter.positionRight');

  // Quick insert buttons
  const quickInserts = [
    { label: '{page}', desc: 'Page number' },
    { label: '{total}', desc: 'Total pages' },
    { label: '{date}', desc: 'Current date' },
  ];

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
          label={tTools('headerFooter.uploadLabel') || 'Upload PDF File'}
          description={tTools('headerFooter.uploadDescription') || 'Drag and drop a PDF file here.'}
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
              : 'lg:grid-cols-2 lg:gap-6'
          }`}
        >
          {/* Settings */}
          <div className={`min-w-0 ${embedded ? 'space-y-3' : 'space-y-6'}`}>
            <div ref={settingsUpToRangeRef} className={embedded ? 'space-y-3' : 'space-y-4'}>
              <Card variant="outlined" size={cardSize}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <svg
                      className={`${embedded ? 'h-8 w-8' : 'h-10 w-10'} shrink-0 text-red-500`}
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                    </svg>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{file.name}</p>
                      <p className={workspaceInlineHintClass}>
                        {tTools('headerFooter.fileMeta', {
                          size: formatSize(file.size),
                          pages: totalPages,
                        })}
                      </p>
                    </div>
                  </div>
                  {!lockToInitialFile ? (
                    <Button variant="ghost" size="sm" onClick={handleClearFile} disabled={isProcessing}>
                      {t('buttons.remove') || 'Remove'}
                    </Button>
                  ) : null}
                </div>
              </Card>

              <Card variant="outlined" size={cardSize}>
                <h3 className={sectionTitleClass}>{tTools('headerFooter.headerTitle') || 'Header'}</h3>
                <div className={fieldGridClass}>
                  <div className={fieldCellClass}>
                    <label className={fieldLabelClass}>{posLeft}</label>
                    <input
                      type="text"
                      value={headerLeft}
                      onChange={(e) => setHeaderLeft(e.target.value)}
                      placeholder={tTools('headerFooter.headerLeftPlaceholder')}
                      className={inputUniformClass}
                      disabled={isProcessing}
                    />
                  </div>
                  <div className={fieldCellClass}>
                    <label className={fieldLabelClass}>{posCenter}</label>
                    <input
                      type="text"
                      value={headerCenter}
                      onChange={(e) => setHeaderCenter(e.target.value)}
                      placeholder={tTools('headerFooter.headerCenterPlaceholder')}
                      className={inputUniformClass}
                      disabled={isProcessing}
                    />
                  </div>
                  <div className={fieldCellClass}>
                    <label className={fieldLabelClass}>{posRight}</label>
                    <input
                      type="text"
                      value={headerRight}
                      onChange={(e) => setHeaderRight(e.target.value)}
                      placeholder={tTools('headerFooter.headerRightPlaceholder')}
                      className={inputUniformClass}
                      disabled={isProcessing}
                    />
                  </div>
                </div>

                <div
                  className={`${embedded ? 'my-3' : 'my-5'} rounded-md border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.2)] px-3 py-2.5`}
                >
                  <p className={`${workspaceInlineHintClass} mb-2`}>
                    {tTools('headerFooter.quickInsertTitle')}
                  </p>
                  <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-1.5">
                    {quickInserts.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => navigator.clipboard.writeText(item.label)}
                        className="workspace-inline-keep-xs w-full rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] px-2 py-1.5 text-center text-xs text-[hsl(var(--color-foreground))] transition-colors hover:bg-[hsl(var(--color-muted)/0.55)]"
                        title={item.desc}
                      >
                        <code>{item.label}</code>
                      </button>
                    ))}
                  </div>
                  <p className={`${workspaceInlineHintClass} mt-1.5`}>
                    {tTools('headerFooter.quickInsertHint')}
                  </p>
                </div>

                <h3 className={sectionTitleClass}>{tTools('headerFooter.footerTitle') || 'Footer'}</h3>
                <div className={fieldGridClass}>
                  <div className={fieldCellClass}>
                    <label className={fieldLabelClass}>{posLeft}</label>
                    <input
                      type="text"
                      value={footerLeft}
                      onChange={(e) => setFooterLeft(e.target.value)}
                      placeholder={tTools('headerFooter.footerLeftPlaceholder')}
                      className={inputUniformClass}
                      disabled={isProcessing}
                    />
                  </div>
                  <div className={fieldCellClass}>
                    <label className={fieldLabelClass}>{posCenter}</label>
                    <input
                      type="text"
                      value={footerCenter}
                      onChange={(e) => setFooterCenter(e.target.value)}
                      placeholder={tTools('headerFooter.footerCenterPlaceholder')}
                      className={inputUniformClass}
                      disabled={isProcessing}
                    />
                  </div>
                  <div className={fieldCellClass}>
                    <label className={fieldLabelClass}>{posRight}</label>
                    <input
                      type="text"
                      value={footerRight}
                      onChange={(e) => setFooterRight(e.target.value)}
                      placeholder={tTools('headerFooter.footerRightPlaceholder')}
                      className={inputUniformClass}
                      disabled={isProcessing}
                    />
                  </div>
                </div>
              </Card>

              <Card variant="outlined" size={cardSize}>
                <h3 className={sectionTitleClass}>{tTools('headerFooter.styleTitle') || 'Style'}</h3>
                <div className={fieldGridClass}>
                  <div className={fieldCellClass}>
                    <label className={fieldLabelClass}>{tTools('headerFooter.fontSize')}</label>
                    <input
                      type="number"
                      value={fontSize}
                      onChange={(e) => setFontSize(parseInt(e.target.value) || 10)}
                      min={6}
                      max={24}
                      className={inputUniformClass}
                      disabled={isProcessing}
                    />
                  </div>
                  <div className={fieldCellClass}>
                    <label className={fieldLabelClass}>{tTools('headerFooter.margin')}</label>
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
                    <label className={fieldLabelClass}>{tTools('headerFooter.fontColor')}</label>
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

                <div className="mt-4 border-t border-[hsl(var(--color-border))] pt-4">
                  <label className={fieldLabelClass}>{tTools('headerFooter.pageRange')}</label>
                  <input
                    type="text"
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                    placeholder={tTools('headerFooter.pageRangePlaceholder')}
                    className={inputUniformClass}
                    disabled={isProcessing}
                  />
                  <p className={`${workspaceInlineHintClass} mt-1.5`}>
                    {tTools('headerFooter.pageRangeHint')}
                  </p>
                </div>

                <label className="mt-4 flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={skipFirstPage}
                    onChange={(e) => setSkipFirstPage(e.target.checked)}
                    className="h-4 w-4 rounded border-[hsl(var(--color-border))]"
                    disabled={isProcessing}
                  />
                  <span className={embedded ? workspaceInlineRadioLabelClass : 'text-sm text-[hsl(var(--color-foreground))]'}>
                    {tTools('headerFooter.skipFirstPage')}
                  </span>
                </label>
              </Card>
            </div>

            {isProcessing && (
              <ProcessingProgress
                progress={progress}
                status={status}
                message={progressMessage}
                onCancel={() => {
                  cancelledRef.current = true;
                  setStatus('idle');
                }}
                showPercentage
              />
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                size={actionBtnSize}
                onClick={handleProcess}
                disabled={!file || !hasContent || isProcessing}
                loading={isProcessing}
              >
                {isProcessing ? t('status.processing') : tTools('headerFooter.addButton')}
              </Button>
              {result && !embedded && (
                <DownloadButton
                  file={result}
                  filename={file.name.replace('.pdf', '_headerfooter.pdf')}
                  variant="secondary"
                  size={actionBtnSize}
                  showFileSize
                />
              )}
            </div>

            {status === 'complete' && result && (
              <p className={workspaceInlineSuccessClass} role="status">
                {tTools('headerFooter.successMessage')}
              </p>
            )}
          </div>

          {/* Preview */}
          <div className="min-w-0">
            <Card
              variant="outlined"
              size={cardSize}
              className={embedded ? '!p-3 flex flex-col' : undefined}
              style={embedded && settingsColHeight > 0 ? { height: settingsColHeight } : undefined}
            >
              <div className={`flex shrink-0 items-center justify-between gap-2 ${embedded ? 'mb-3' : 'mb-4'}`}>
                <h3 className={embedded ? workspaceInlineSectionTitleClass : 'text-lg font-medium'}>
                  {tTools('headerFooter.preview') || 'Preview'}
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
                  <span className={`whitespace-nowrap px-1 text-[hsl(var(--color-muted-foreground))] ${workspaceInlineHintClass}`}>
                    {tTools('headerFooter.previewPageOf', {
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

              <div
                ref={previewBoxRef}
                className={`flex w-full items-center justify-center overflow-hidden rounded-md border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.12)] ${
                  embedded ? 'min-h-0 flex-1 p-1' : 'p-4 min-h-[420px]'
                }`}
              >
                <canvas
                  ref={previewCanvasRef}
                  className="block max-h-full max-w-full rounded-sm bg-white shadow-sm"
                />
              </div>

              <div className={`shrink-0 text-center ${embedded ? 'mt-3' : 'mt-4'}`}>
                {isPageInRange(currentPreviewPage) && !(skipFirstPage && currentPreviewPage === 1) ? (
                  <span className={`inline-flex items-center gap-1 text-[hsl(142_45%_38%)] dark:text-[hsl(142_50%_55%)] ${workspaceInlineHintClass}`}>
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {tTools('headerFooter.pageApplied')}
                  </span>
                ) : (
                  <span className={`inline-flex items-center gap-1 text-[hsl(var(--color-muted-foreground))] ${workspaceInlineHintClass}`}>
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {tTools('headerFooter.pageSkipped')}
                  </span>
                )}
                {!hasContent && (
                  <p className={`${workspaceInlineHintClass} mt-2`}>
                    {tTools('headerFooter.previewHint')}
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

export default HeaderFooterTool;

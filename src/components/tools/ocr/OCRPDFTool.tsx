'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  runSmartOcr,
  type OCROptions,
  type OCRLanguage,
  OCR_LANGUAGE_NAMES,
  type ServerOCROptions,
} from '@/lib/pdf/processors/ocr';
import { PRODUCT_TESSERACT_LANGS } from '@/lib/pdf/product-tesseract-langs';
import { Select } from '@/components/ui/FormField';
import type { UploadedFile, ProcessOutput } from '@/types/pdf';

/**
 * Generate a unique ID for files
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface OCRPDFToolProps {
  /** Custom class name */
  className?: string;
  /** Pre-load a file when opened from workspace ribbon */
  initialFile?: File | null;
  /** Lock tool to initialFile when used inside workspace */
  lockToInitialFile?: boolean;
  /** Replace workspace document after searchable PDF OCR */
  onFileUpdated?: (file: File, options?: { keepDialogOpen?: boolean }) => void;
}

/**
 * OCRPDFTool Component
 * Requirements: 5.1, 5.2
 * 
 * Performs OCR on PDF pages to extract text.
 */
export function OCRPDFTool({
  className = '',
  initialFile = null,
  lockToInitialFile = false,
  onFileUpdated,
}: OCRPDFToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');
  
  // State
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Options state
  const [languages, setLanguages] = useState<OCRLanguage[]>(['vie', 'eng']);
  const [outputFormat, setOutputFormat] = useState<OCROptions['outputFormat']>('searchable-pdf');
  const [deskew, setDeskew] = useState(true);
  const [rotatePages, setRotatePages] = useState(true);
  const [removeBackground, setRemoveBackground] = useState(false);
  const [clean, setClean] = useState(false);
  const [forceOcr, setForceOcr] = useState(false);
  const [optimize, setOptimize] = useState(1);
  
  // Ref for cancellation
  const cancelledRef = useRef(false);

  /**
   * Handle file selected from uploader
   */
  const handleFilesSelected = useCallback((newFiles: File[]) => {
    if (newFiles.length > 0) {
      const uploadedFile: UploadedFile = {
        id: generateId(),
        file: newFiles[0],
        status: 'pending' as const,
      };
      setFile(uploadedFile);
      setError(null);
      setResult(null);
      setTextPreview(null);
    }
  }, []);

  const initialFileSeededRef = useRef(false);
  useEffect(() => {
    if (!initialFile || initialFileSeededRef.current) return;
    initialFileSeededRef.current = true;
    handleFilesSelected([initialFile]);
  }, [initialFile, handleFilesSelected]);

  /**
   * Handle file upload error
   */
  const handleUploadError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  /**
   * Remove the file
   */
  const handleRemoveFile = useCallback(() => {
    setFile(null);
    setResult(null);
    setTextPreview(null);
    setError(null);
    setStatus('idle');
    setProgress(0);
  }, []);

  /**
   * Toggle language selection
   */
  const toggleLanguage = useCallback((lang: OCRLanguage) => {
    setLanguages(prev => {
      if (prev.includes(lang)) {
        // Don't allow removing the last language
        if (prev.length === 1) return prev;
        return prev.filter(l => l !== lang);
      }
      return [...prev, lang];
    });
  }, []);

  /**
   * Handle OCR operation
   */
  const handleOCR = useCallback(async () => {
    if (!file) {
      setError('Please upload a PDF file.');
      return;
    }

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);
    setTextPreview(null);

    const progressCb = (prog: number, message?: string) => {
      if (!cancelledRef.current) {
        setProgress(prog);
        setProgressMessage(message || '');
      }
    };

    try {
      const serverOpts: Partial<ServerOCROptions> = {
        languages,
        deskew,
        rotatePages,
        removeBackground,
        clean,
        forceOcr,
        optimize,
        outputFormat: outputFormat === 'text' ? 'text' : 'pdf',
      };
      const output = await runSmartOcr(file.file, serverOpts, progressCb);

      if (cancelledRef.current) {
        setStatus('idle');
        return;
      }

      if (output.success && output.result) {
        const blob = output.result as Blob;
        setResult(blob);

        if (outputFormat === 'text') {
          const text =
            typeof output.metadata?.textPreview === 'string'
              ? output.metadata.textPreview
              : await blob.text();
          setTextPreview(text.length > 5000 ? `${text.substring(0, 5000)}\n...(truncated)` : text);
        }

        if (
          outputFormat === 'searchable-pdf' &&
          lockToInitialFile &&
          onFileUpdated &&
          file
        ) {
          const updatedFile = new File([blob], file.file.name, { type: 'application/pdf' });
          onFileUpdated(updatedFile, { keepDialogOpen: true });
        }

        setStatus('complete');
      } else {
        setError(output.error?.message || 'Failed to perform OCR on PDF.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        setStatus('error');
      }
    }
  }, [
    file,
    languages,
    outputFormat,
    deskew,
    rotatePages,
    removeBackground,
    clean,
    forceOcr,
    optimize,
    lockToInitialFile,
    onFileUpdated,
  ]);

  /**
   * Handle cancel operation
   */
  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setStatus('idle');
    setProgress(0);
  }, []);

  /**
   * Format file size
   */
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isProcessing = status === 'processing' || status === 'uploading';
  const canProcess = file && !isProcessing;

  const availableLanguages: OCRLanguage[] = [...PRODUCT_TESSERACT_LANGS];

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {/* File Upload Area */}
      {!lockToInitialFile && (
        <FileUploader
          accept={['application/pdf', '.pdf']}
          multiple={false}
          maxFiles={1}
          onFilesSelected={handleFilesSelected}
          onError={handleUploadError}
          disabled={isProcessing}
          label={tTools('ocrPdf.uploadLabel') || 'Upload PDF'}
          description={tTools('ocrPdf.uploadDescription') || 'Drag and drop a scanned PDF file here, or click to browse.'}
        />
      )}

      {/* Error Message */}
      {error && (
        <div 
          className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700"
          role="alert"
        >
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* File Info */}
      {file && (
        <Card variant="outlined" size="lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[hsl(var(--color-primary)/0.1)] flex items-center justify-center">
                <svg className="w-5 h-5 text-[hsl(var(--color-primary))]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-[hsl(var(--color-foreground))]">{file.file.name}</p>
                <p className="text-sm text-[hsl(var(--color-muted-foreground))]">{formatSize(file.file.size)}</p>
              </div>
            </div>
            {!lockToInitialFile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveFile}
                disabled={isProcessing}
              >
                {t('buttons.remove') || 'Remove'}
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Options Panel */}
      {file && (
        <Card variant="outlined">
          <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
            {tTools('ocrPdf.optionsTitle') || 'OCR Options'}
          </h3>
          
          <div className="space-y-4">
            {/* Language Selection */}
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                {tTools('ocrPdf.languages') || 'Languages'}
              </label>
              <div className="flex flex-wrap gap-2">
                {availableLanguages.map(lang => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggleLanguage(lang)}
                    disabled={isProcessing}
                    className={`
                      px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                      ${languages.includes(lang)
                        ? 'bg-[hsl(var(--color-primary))] text-[hsl(var(--color-primary-foreground))]'
                        : 'bg-[hsl(var(--color-muted)/0.5)] text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))]'
                      }
                      disabled:opacity-50 disabled:cursor-not-allowed
                    `}
                  >
                    {OCR_LANGUAGE_NAMES[lang]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-2">
                {tTools('ocrPdf.languagesHint') || 'Select one or more languages for better accuracy'}
              </p>
            </div>

            {/* Output Format */}
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                {tTools('ocrPdf.outputFormat') || 'Output Format'}
              </label>
              <Select
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value as OCROptions['outputFormat'])}
                disabled={isProcessing}
              >
                <option value="searchable-pdf">{tTools('ocrPdf.formatPdf') || 'Searchable PDF'}</option>
                <option value="text">{tTools('ocrPdf.formatText') || 'Text File (.txt)'}</option>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                  {tTools('ocrPdf.optimize') || 'Optimization'}
                </label>
                <Select
                  value={optimize}
                  onChange={(e) => setOptimize(Number(e.target.value))}
                  disabled={isProcessing}
                >
                  <option value="0">{tTools('ocrPdf.optimizeNone') || 'None'}</option>
                  <option value="1">{tTools('ocrPdf.optimizeDefault') || 'Default'}</option>
                  <option value="2">{tTools('ocrPdf.optimizeAggressive') || 'Aggressive (smaller file)'}</option>
                </Select>
              </div>

              <div className="space-y-3 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deskew}
                    onChange={(e) => setDeskew(e.target.checked)}
                    disabled={isProcessing}
                    className="rounded border-[hsl(var(--color-border))]"
                  />
                  <span className="text-sm text-[hsl(var(--color-foreground))]">
                    {tTools('ocrPdf.deskew') || 'Deskew (straighten pages)'}
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rotatePages}
                    onChange={(e) => setRotatePages(e.target.checked)}
                    disabled={isProcessing}
                    className="rounded border-[hsl(var(--color-border))]"
                  />
                  <span className="text-sm text-[hsl(var(--color-foreground))]">
                    {tTools('ocrPdf.rotatePages') || 'Auto-rotate pages'}
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clean}
                    onChange={(e) => setClean(e.target.checked)}
                    disabled={isProcessing}
                    className="rounded border-[hsl(var(--color-border))]"
                  />
                  <span className="text-sm text-[hsl(var(--color-foreground))]">
                    {tTools('ocrPdf.clean') || 'Clean pages before OCR'}
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={removeBackground}
                    onChange={(e) => setRemoveBackground(e.target.checked)}
                    disabled={isProcessing}
                    className="rounded border-[hsl(var(--color-border))]"
                  />
                  <span className="text-sm text-[hsl(var(--color-foreground))]">
                    {tTools('ocrPdf.removeBackground') || 'Remove background'}
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forceOcr}
                    onChange={(e) => setForceOcr(e.target.checked)}
                    disabled={isProcessing}
                    className="rounded border-[hsl(var(--color-border))]"
                  />
                  <span className="text-sm text-[hsl(var(--color-foreground))]">
                    {tTools('ocrPdf.forceOcr') || 'Force OCR (re-OCR even if text exists)'}
                  </span>
                </label>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Processing Progress */}
      {isProcessing && (
        <ProcessingProgress
          progress={progress}
          status={status}
          message={progressMessage}
          onCancel={handleCancel}
          showPercentage
        />
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-4">
        <Button
          variant="primary"
          size="lg"
          onClick={handleOCR}
          disabled={!canProcess}
          loading={isProcessing}
        >
          {isProcessing 
            ? (t('status.processing') || 'Processing...') 
            : (tTools('ocrPdf.processButton') || 'Start OCR')
          }
        </Button>

        {result && (
          <DownloadButton
            file={result}
            filename={`${file?.file.name.replace(/\.pdf$/i, '')}_ocr.${outputFormat === 'text' ? 'txt' : 'pdf'}`}
            variant="secondary"
            size="lg"
            showFileSize
          />
        )}
      </div>

      {/* Text Preview */}
      {textPreview && (
        <Card variant="outlined" size="lg">
          <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
            {tTools('ocrPdf.previewTitle') || 'Extracted Text Preview'}
          </h3>
          <pre className="p-4 bg-[hsl(var(--color-muted)/0.3)] rounded-[var(--radius-md)] overflow-auto max-h-96 text-sm font-mono text-[hsl(var(--color-foreground))] whitespace-pre-wrap">
            {textPreview}
          </pre>
        </Card>
      )}

      {/* Success Message */}
      {status === 'complete' && result && (
        <div 
          className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700"
          role="status"
        >
          <p className="text-sm font-medium">
            {tTools('ocrPdf.successMessage') || 'OCR completed successfully! Click the download button to save your file.'}
          </p>
        </div>
      )}

      {/* Info Note */}
      <Card variant="outlined" className="bg-blue-50 border-blue-200">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          <div className="text-sm text-blue-700">
            <p className="font-medium mb-1">{tTools('ocrPdf.infoTitle') || 'About OCR'}</p>
            <p>{tTools('ocrPdf.infoText') || 'OCR (Optical Character Recognition) extracts text from scanned documents and images. For best results, use high-quality scans and select the correct language(s).'}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default OCRPDFTool;

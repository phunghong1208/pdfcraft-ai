'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { flattenPDF, type FlattenPDFOptions } from '@/lib/pdf/processors/flatten';
import type { ProcessOutput } from '@/types/pdf';

export interface FlattenPDFToolProps {
  /** Custom class name */
  className?: string;
  initialFile?: File | null;
  lockToInitialFile?: boolean;
  onFileUpdated?: (file: File, options?: { keepDialogOpen?: boolean }) => void;
}

/**
 * FlattenPDFTool Component
 * Requirements: 5.1
 * 
 * Provides the UI for flattening PDF files.
 * Converts interactive elements into static page content.
 */
export function FlattenPDFTool({
  className = '',
  initialFile = null,
  lockToInitialFile = false,
  onFileUpdated,
}: FlattenPDFToolProps) {
  const t = useTranslations('common');
  const tFlatten = useTranslations('tools.flattenPdf');
  
  // State
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flattenedItems, setFlattenedItems] = useState<string[]>([]);
  
  // Options
  const [options, setOptions] = useState<FlattenPDFOptions>({
    flattenForms: true,
    flattenAnnotations: true,
    flattenLayers: true,
  });
  
  // Ref for cancellation
  const cancelledRef = useRef(false);

  const handleFilesSelected = useCallback((files: File[]) => {
    if (files.length > 0) {
      setFile(files[0]);
      setError(null);
      setResult(null);
      setFlattenedItems([]);
    }
  }, []);

  useEffect(() => {
    if (initialFile) handleFilesSelected([initialFile]);
  }, [initialFile, handleFilesSelected]);

  const handleUploadError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  const handleClear = useCallback(() => {
    setFile(null);
    setResult(null);
    setError(null);
    setStatus('idle');
    setProgress(0);
    setFlattenedItems([]);
  }, []);

  const handleOptionChange = useCallback((key: keyof FlattenPDFOptions) => {
    setOptions(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const handleFlatten = useCallback(async () => {
    if (!file) {
      setError('Please select a PDF file to flatten.');
      return;
    }

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);
    setFlattenedItems([]);

    try {
      const output: ProcessOutput = await flattenPDF(
        file,
        options,
        (prog, message) => {
          if (!cancelledRef.current) {
            setProgress(prog);
            setProgressMessage(message || '');
          }
        }
      );

      if (cancelledRef.current) {
        setStatus('idle');
        return;
      }

      if (output.success && output.result) {
        const blob = output.result as Blob;
        setResult(blob);
        setStatus('complete');
        if (output.metadata?.flattenedItems) {
          setFlattenedItems(output.metadata.flattenedItems as string[]);
        }
        if (onFileUpdated && file) {
          const base = file.name.replace(/\.pdf$/i, '') || 'document';
          onFileUpdated(new File([blob], `${base}_flattened.pdf`, { type: 'application/pdf' }));
        }
      } else {
        setError(output.error?.message || 'Failed to flatten PDF file.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        setStatus('error');
      }
    }
  }, [file, options, onFileUpdated]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setStatus('idle');
    setProgress(0);
  }, []);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const isProcessing = status === 'processing';
  const canFlatten = file && !isProcessing;

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {!file && (
      <FileUploader
        accept={['application/pdf', '.pdf']}
        multiple={false}
        maxFiles={1}
        onFilesSelected={handleFilesSelected}
        onError={handleUploadError}
        disabled={isProcessing}
        label={tFlatten('uploadLabel') || 'Upload PDF File'}
        description={tFlatten('uploadDescription') || 'Drag and drop a PDF file here, or click to browse.'}
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

      {/* Selected File */}
      {file && (
        <Card variant="outlined" size="lg">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <FileText className="h-10 w-10 shrink-0 text-[hsl(var(--color-primary))]" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[hsl(var(--color-foreground))]">
                  {file.name}
                </p>
                <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                  {formatSize(file.size)}
                </p>
              </div>
            </div>
            {!lockToInitialFile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={isProcessing}
            >
              {t('buttons.remove') || 'Remove'}
            </Button>
            )}
          </div>
        </Card>
      )}

      {/* Flatten Options */}
      {file && (
        <Card variant="outlined">
          <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
            {tFlatten('optionsTitle') || 'Flatten Options'}
          </h3>
          
          <div className="space-y-4">
            {/* Info */}
            <div className="p-3 rounded-[var(--radius-sm)] bg-blue-50 border border-blue-200">
              <p className="text-sm text-blue-700">
                {tFlatten('info') || 'Flattening converts interactive elements (forms, annotations) into static page content. This makes the PDF non-editable but ensures consistent appearance across all viewers.'}
              </p>
            </div>

            {/* Options */}
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.flattenForms}
                  onChange={() => handleOptionChange('flattenForms')}
                  disabled={isProcessing}
                  className="w-4 h-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-primary))]"
                />
                <div>
                  <span className="text-sm text-[hsl(var(--color-foreground))]">
                    {tFlatten('flattenForms') || 'Flatten Form Fields'}
                  </span>
                  <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                    {tFlatten('flattenFormsDesc') || 'Convert fillable form fields to static text'}
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.flattenAnnotations}
                  onChange={() => handleOptionChange('flattenAnnotations')}
                  disabled={isProcessing}
                  className="w-4 h-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-primary))]"
                />
                <div>
                  <span className="text-sm text-[hsl(var(--color-foreground))]">
                    {tFlatten('flattenAnnotations') || 'Flatten Annotations'}
                  </span>
                  <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                    {tFlatten('flattenAnnotationsDesc') || 'Merge comments, highlights, and stamps into page content'}
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.flattenLayers}
                  onChange={() => handleOptionChange('flattenLayers')}
                  disabled={isProcessing}
                  className="w-4 h-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-primary))]"
                />
                <div>
                  <span className="text-sm text-[hsl(var(--color-foreground))]">
                    {tFlatten('flattenLayers') || 'Flatten Layers'}
                  </span>
                  <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                    {tFlatten('flattenLayersDesc') || 'Merge all visible layers into a single layer'}
                  </p>
                </div>
              </label>
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
          onClick={handleFlatten}
          disabled={!canFlatten}
          loading={isProcessing}
        >
          {isProcessing 
            ? (t('status.processing') || 'Processing...') 
            : (tFlatten('flattenButton') || 'Flatten PDF')
          }
        </Button>

        {result && (
          <DownloadButton
            file={result}
            filename={file ? `${file.name.replace('.pdf', '')}_flattened.pdf` : 'flattened.pdf'}
            variant="secondary"
            size="lg"
            showFileSize
          />
        )}
      </div>

      {/* Success Message */}
      {status === 'complete' && result && (
        <div 
          className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700"
          role="status"
        >
          <p className="text-sm font-medium">
            {tFlatten('successMessage') || 'PDF flattened successfully!'}
          </p>
          {flattenedItems.length > 0 && (
            <p className="text-xs mt-1 text-green-600">
              {tFlatten('flattenedItems') || 'Flattened:'} {flattenedItems.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default FlattenPDFTool;

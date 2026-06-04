'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { repairPDF } from '@/lib/pdf/processors/repair';
import type { ProcessOutput } from '@/types/pdf';

export interface RepairPDFToolProps {
  className?: string;
  initialFile?: File | null;
  lockToInitialFile?: boolean;
  onFileUpdated?: (file: File, options?: { keepDialogOpen?: boolean }) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function RepairPDFTool({
  className = '',
  initialFile = null,
  lockToInitialFile = false,
  onFileUpdated,
}: RepairPDFToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');

  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const handleFilesSelected = useCallback((selectedFiles: File[]) => {
    setFiles((prev) => (lockToInitialFile ? selectedFiles : [...prev, ...selectedFiles]));
    setError(null);
    setResult(null);
  }, [lockToInitialFile]);

  const initialFileSeededRef = useRef(false);
  useEffect(() => {
    if (!initialFile || initialFileSeededRef.current) return;
    initialFileSeededRef.current = true;
    setFiles([initialFile]);
    setError(null);
    setResult(null);
  }, [initialFile]);

  const handleProcess = useCallback(async () => {
    if (files.length === 0) return;

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      const output: ProcessOutput = await repairPDF(
        files[0],
        {},
        (prog) => {
          if (!cancelledRef.current) setProgress(prog);
        },
      );

      if (output.success && output.result) {
        const blob = output.result as Blob;
        setResult(blob);
        setStatus('complete');
        if (onFileUpdated && files[0]) {
          const baseName = files[0].name.replace(/\.pdf$/i, '') || 'document';
          const repaired = new File([blob], `${baseName}_repaired.pdf`, {
            type: 'application/pdf',
          });
          onFileUpdated(repaired);
        }
      } else {
        setError(output.error?.message || 'Failed to repair PDF.');
        setStatus('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStatus('error');
    }
  }, [files, onFileUpdated]);

  const handleRemoveFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleClear = useCallback(() => {
    setFiles([]);
    setResult(null);
    setError(null);
    setStatus('idle');
  }, []);

  const isProcessing = status === 'processing';
  const embeddedSingle = lockToInitialFile && files.length === 1;

  return (
    <div className={`space-y-5 ${className}`.trim()}>
      {files.length === 0 && (
        <FileUploader
          accept={['application/pdf', '.pdf']}
          multiple={!lockToInitialFile}
          maxFiles={lockToInitialFile ? 1 : 10}
          onFilesSelected={handleFilesSelected}
          onError={setError}
          disabled={isProcessing}
          label={tTools('repairPdf.uploadLabel')}
          description={tTools('repairPdf.uploadDescription')}
        />
      )}

      {error && (
        <div
          className="p-4 rounded-[var(--radius-md)] bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300"
          role="alert"
        >
          <p className="text-sm">{error}</p>
        </div>
      )}

      {files.length > 0 && (
        <>
          {embeddedSingle ? (
            <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.4)] p-4">
              <FileText className="h-10 w-10 shrink-0 text-[hsl(var(--color-primary))]" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[hsl(var(--color-foreground))]">
                  {files[0].name}
                </p>
                <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                  {formatFileSize(files[0].size)}
                </p>
              </div>
            </div>
          ) : (
            <Card variant="outlined">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className="font-medium text-[hsl(var(--color-foreground))]">
                  {tTools('repairPdf.filesTitle')} ({files.length})
                </h3>
                <Button variant="ghost" size="sm" onClick={handleClear} disabled={isProcessing}>
                  {t('buttons.clearAll')}
                </Button>
              </div>
              <ul className="max-h-60 space-y-2 overflow-y-auto" role="list">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.35)] p-3"
                  >
                    <span className="min-w-0 truncate text-sm text-[hsl(var(--color-foreground))]">
                      {file.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveFile(index)}
                      disabled={isProcessing}
                      aria-label={t('buttons.remove')}
                    >
                      ×
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {!embeddedSingle && (
            <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
              {tTools('repairPdf.uploadDescription')}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              variant="primary"
              size="lg"
              onClick={handleProcess}
              disabled={files.length === 0 || isProcessing}
              loading={isProcessing}
            >
              {isProcessing ? t('status.processing') : tTools('repairPdf.repairButton')}
            </Button>
          </div>
        </>
      )}

      {isProcessing && (
        <ProcessingProgress
          progress={progress}
          status={status}
          onCancel={() => {
            cancelledRef.current = true;
            setStatus('idle');
          }}
          showPercentage
        />
      )}

      {status === 'complete' && result && (
        <div className="rounded-[var(--radius-md)] border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="font-medium text-emerald-800 dark:text-emerald-200">
              {tTools('repairPdf.successMessage')}
            </p>
            {onFileUpdated ? (
              <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
                {t('status.complete')}
              </p>
            ) : (
              <DownloadButton
                file={result}
                filename={
                  files.length === 1 ? `repaired_${files[0].name}` : 'repaired_pdfs.zip'
                }
                variant="primary"
                size="lg"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default RepairPDFTool;

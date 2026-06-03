'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { addBackgroundColor } from '@/lib/pdf/processors/background-color';
import type { ProcessOutput } from '@/types/pdf';

export interface BackgroundColorToolProps {
  className?: string;
  initialFile?: File | null;
  /** PDF bytes used for processing (e.g. pristine upload). Falls back to initialFile. */
  processSourceFile?: File | null;
  lockToInitialFile?: boolean;
  onFileUpdated?: (file: File) => void;
  /** When true, keep the inline dialog open after apply (workspace). */
  keepDialogOpenOnApply?: boolean;
}

function hexToRgb(hex: string) {
  const normalized = hex.trim().replace(/^#/, '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(expanded);
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      }
    : { r: 1, g: 1, b: 0.9 };
}

function normalizeHex(hex: string) {
  const rgb = hexToRgb(hex);
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

export function BackgroundColorTool({
  className = '',
  initialFile = null,
  processSourceFile = null,
  lockToInitialFile = false,
  onFileUpdated,
  keepDialogOpenOnApply = false,
}: BackgroundColorToolProps) {
  const tTools = useTranslations('tools.backgroundColor');
  const [file, setFile] = useState<File | null>(initialFile);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState('#fffde7');
  const cancelledRef = useRef(false);
  /** Frozen PDF bytes from when the dialog opened — every apply uses this, not the tinted viewer file. */
  const sourceSnapshotRef = useRef<ArrayBuffer | null>(null);
  const sourceNameRef = useRef('document.pdf');
  const snapshotReadyRef = useRef(false);

  useEffect(() => {
    if (!initialFile && !processSourceFile) return;
    if (initialFile) setFile(initialFile);
    if (snapshotReadyRef.current) return;

    const source = processSourceFile ?? initialFile;
    if (!source) return;

    let cancelled = false;
    void (async () => {
      try {
        const buffer = await source.arrayBuffer();
        if (cancelled) return;
        sourceSnapshotRef.current = buffer.slice(0);
        sourceNameRef.current = source.name;
        snapshotReadyRef.current = true;
      } catch {
        if (!cancelled) {
          setError('Failed to read PDF for background color.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialFile, processSourceFile]);

  const buildSourceFile = useCallback(() => {
    const buffer = sourceSnapshotRef.current;
    if (!buffer) return null;
    return new File([buffer], sourceNameRef.current, {
      type: 'application/pdf',
      lastModified: Date.now(),
    });
  }, []);

  const handleProcess = useCallback(async () => {
    if (!snapshotReadyRef.current) {
      setError('PDF is still loading. Please wait a moment.');
      return;
    }
    const sourceFile = buildSourceFile();
    if (!sourceFile) return;

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      const output: ProcessOutput = await addBackgroundColor(
        sourceFile,
        { color: hexToRgb(color), pages: 'all', opacity: 1 },
        (prog) => {
          if (!cancelledRef.current) setProgress(prog);
        },
      );
      if (cancelledRef.current) {
        setStatus('idle');
        return;
      }
      if (output.success && output.result) {
        const nextBlob = output.result as Blob;
        setResult(nextBlob);
        setStatus('complete');
        if (lockToInitialFile && onFileUpdated) {
          const nextFile = new File([nextBlob], sourceNameRef.current, {
            type: 'application/pdf',
            lastModified: Date.now(),
          });
          onFileUpdated(nextFile);
          if (!keepDialogOpenOnApply) return;
        }
      } else {
        setError(output.error?.message || 'Failed to apply background color.');
        setStatus('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply background color.');
      setStatus('error');
    }
  }, [buildSourceFile, color, lockToInitialFile, onFileUpdated, keepDialogOpenOnApply]);

  const isProcessing = status === 'processing';
  const pickerColor = normalizeHex(color);

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {!file && !lockToInitialFile && (
        <FileUploader
          accept={['application/pdf', '.pdf']}
          multiple={false}
          maxFiles={1}
          onFilesSelected={(files) => {
            if (files.length > 0) {
              const picked = files[0];
              void picked.arrayBuffer().then((buffer) => {
                sourceSnapshotRef.current = buffer.slice(0);
                sourceNameRef.current = picked.name;
                snapshotReadyRef.current = true;
                setFile(picked);
                setError(null);
                setResult(null);
              });
            }
          }}
          onError={setError}
          disabled={isProcessing}
          label={tTools('uploadLabel')}
          description={tTools('uploadDescription')}
        />
      )}
      {error && (
        <div className="p-4 rounded bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-500/30 dark:text-red-200">
          <p className="text-sm">{error}</p>
        </div>
      )}
      {file && (
        <>
          <Card variant="outlined">
            <div className="flex items-center justify-between">
              <p className="font-medium">{file.name}</p>
              {!lockToInitialFile && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    sourceSnapshotRef.current = null;
                    snapshotReadyRef.current = false;
                    setFile(null);
                    setResult(null);
                  }}
                  disabled={isProcessing}
                >
                  Remove
                </Button>
              )}
            </div>
          </Card>
          <Card variant="outlined" size="lg">
            <label className="block text-sm font-medium mb-2">{tTools('colorLabel')}</label>
            <div className="flex items-center gap-4">
              <input
                type="color"
                value={pickerColor}
                onChange={(e) => setColor(e.target.value)}
                className="w-16 h-10 border rounded cursor-pointer"
                disabled={isProcessing}
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                onBlur={() => setColor(normalizeHex(color))}
                className="px-3 py-2 border rounded w-32 font-mono text-sm"
                disabled={isProcessing}
              />
              <span
                className="h-10 w-14 shrink-0 rounded border border-[hsl(var(--color-border))]"
                style={{ backgroundColor: pickerColor }}
                title={pickerColor}
                aria-hidden
              />
            </div>
            {lockToInitialFile && (
              <p className="mt-2 text-[11px] text-[hsl(var(--color-muted-foreground))]">
                {tTools('reapplyHint')}
              </p>
            )}
          </Card>
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
      {file && (
        <div className="flex flex-wrap items-center gap-4">
          <Button
            variant="primary"
            size="lg"
            onClick={handleProcess}
            disabled={!file || isProcessing || !snapshotReadyRef.current}
            loading={isProcessing}
          >
            {isProcessing ? '…' : tTools('applyButton')}
          </Button>
          {result && !lockToInitialFile && (
            <DownloadButton
              file={result}
              filename={file.name.replace('.pdf', '_background.pdf')}
              variant="secondary"
              size="lg"
              showFileSize
            />
          )}
        </div>
      )}
      {status === 'complete' && result && (
        <div className="p-4 rounded bg-green-50 border border-green-200 text-green-700 dark:bg-green-950/40 dark:border-green-500/30 dark:text-green-200">
          <p className="text-sm font-medium">{tTools('successMessage')}</p>
        </div>
      )}
    </div>
  );
}

export default BackgroundColorTool;

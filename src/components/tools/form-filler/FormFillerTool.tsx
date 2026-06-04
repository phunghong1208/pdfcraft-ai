'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { fillForm, getFormFields, FormFieldValue } from '@/lib/pdf/processors/form-filler';
import type { ProcessOutput } from '@/types/pdf';

export interface FormFillerToolProps {
  className?: string;
  initialFile?: File | null;
  lockToInitialFile?: boolean;
  onFileUpdated?: (file: File, options?: { keepDialogOpen?: boolean }) => void;
}

export function FormFillerTool({
  className = '',
  initialFile = null,
  lockToInitialFile = false,
  onFileUpdated,
}: FormFillerToolProps) {
  const t = useTranslations('common');
  const tForm = useTranslations('tools.formFiller');

  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<{ name: string; type: string; value: string }[]>([]);
  const [flatten, setFlatten] = useState(false);
  const cancelledRef = useRef(false);
  const initialFileSeededRef = useRef<File | null>(null);

  const handleFilesSelected = useCallback(async (files: File[]) => {
    if (files.length > 0) {
      const selectedFile = files[0];
      setFile(selectedFile);
      setError(null);
      setResult(null);
      try {
        const formFields = await getFormFields(selectedFile);
        setFields(formFields.map((f) => ({ ...f, value: '' })));
      } catch {
        setError(tForm('readError'));
        setFields([]);
      }
    }
  }, [tForm]);

  useEffect(() => {
    if (!initialFile) return;
    if (initialFileSeededRef.current === initialFile) return;
    initialFileSeededRef.current = initialFile;
    void handleFilesSelected([initialFile]);
  }, [initialFile, handleFilesSelected]);

  const handleFieldChange = useCallback((index: number, value: string) => {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, value } : f)));
  }, []);

  const handleProcess = useCallback(async () => {
    if (!file) return;
    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);
    try {
      const fieldValues: FormFieldValue[] = fields
        .filter((f) => f.value)
        .map((f) => ({ fieldName: f.name, value: f.value }));
      const output: ProcessOutput = await fillForm(
        file,
        { fields: fieldValues, flatten },
        (prog) => {
          if (!cancelledRef.current) setProgress(prog);
        },
      );
      if (output.success && output.result) {
        const blob = output.result as Blob;
        setResult(blob);
        setStatus('complete');
        if (onFileUpdated) {
          const updated = new File([blob], file.name, {
            type: 'application/pdf',
            lastModified: Date.now(),
          });
          onFileUpdated(updated);
        }
      } else {
        setError(output.error?.message || tForm('processError'));
        setStatus('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : tForm('processError'));
      setStatus('error');
    }
  }, [file, fields, flatten, onFileUpdated, tForm]);

  const isProcessing = status === 'processing';

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {!file && !lockToInitialFile && (
        <FileUploader
          accept={['application/pdf', '.pdf']}
          multiple={false}
          maxFiles={1}
          onFilesSelected={handleFilesSelected}
          onError={setError}
          disabled={isProcessing}
          label={tForm('uploadLabel')}
          description={tForm('uploadDescription')}
        />
      )}
      {error && (
        <div className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700" role="alert">
          <p className="text-sm">{error}</p>
        </div>
      )}
      {file && (
        <>
          {lockToInitialFile ? (
            <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.35)] p-4">
              <FileText className="h-10 w-10 shrink-0 text-[hsl(var(--color-primary))]" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
              </div>
            </div>
          ) : (
            <Card variant="outlined">
              <div className="flex items-center justify-between">
                <p className="font-medium">{file.name}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFile(null);
                    setResult(null);
                    setFields([]);
                  }}
                  disabled={isProcessing}
                >
                  {t('buttons.remove')}
                </Button>
              </div>
            </Card>
          )}
          {fields.length > 0 ? (
            <Card variant="outlined" size="lg">
              <h3 className="text-lg font-medium mb-4">
                {tForm('fieldsTitle', { count: fields.length })}
              </h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {fields.map((field, idx) => (
                  <div key={idx} className="flex items-center gap-4">
                    <label className="w-1/3 text-sm font-medium truncate" title={field.name}>
                      {field.name}
                    </label>
                    <input
                      type="text"
                      value={field.value}
                      onChange={(e) => handleFieldChange(idx, e.target.value)}
                      placeholder={tForm('fieldPlaceholder', { type: field.type })}
                      className="flex-1 px-3 py-2 border border-[hsl(var(--color-border))] rounded-[var(--radius-md)]"
                      disabled={isProcessing}
                    />
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 mt-4">
                <input
                  type="checkbox"
                  checked={flatten}
                  onChange={(e) => setFlatten(e.target.checked)}
                  disabled={isProcessing}
                  className="w-4 h-4"
                />
                <span className="text-sm">{tForm('flattenOption')}</span>
              </label>
            </Card>
          ) : (
            <Card variant="outlined">
              <p className="text-sm text-[hsl(var(--color-muted-foreground))]">{tForm('noFields')}</p>
            </Card>
          )}
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
      {file && fields.length > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          <Button
            variant="primary"
            size="lg"
            onClick={handleProcess}
            disabled={!file || isProcessing}
            loading={isProcessing}
          >
            {isProcessing ? t('status.processing') : tForm('fillButton')}
          </Button>
          {result && !onFileUpdated && (
            <DownloadButton
              file={result}
              filename={file.name.replace(/\.pdf$/i, '_filled.pdf')}
              variant="secondary"
              size="lg"
              showFileSize
            />
          )}
        </div>
      )}
      {status === 'complete' && result && (
        <div className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700" role="status">
          <p className="text-sm font-medium">{tForm('successMessage')}</p>
        </div>
      )}
    </div>
  );
}

export default FormFillerTool;

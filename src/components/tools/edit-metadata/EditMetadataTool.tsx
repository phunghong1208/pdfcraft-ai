'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { FileText } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { editPDFMetadata, EditableMetadata } from '@/lib/pdf/processors/edit-metadata';
import { configurePdfjsWorker } from '@/lib/pdf/loader';

/**
 * Current PDF metadata for display and editing
 */
interface CurrentMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
}

/**
 * Props for MetadataField component
 */
interface MetadataFieldProps {
  label: string;
  field: keyof CurrentMetadata;
  value: string;
  onChange: (field: keyof CurrentMetadata, value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
}

/**
 * Metadata input field component - defined outside to prevent re-creation on parent render
 */
function MetadataField({
  label,
  field,
  value,
  onChange,
  placeholder,
  multiline = false,
  disabled = false,
}: MetadataFieldProps) {
  const InputComponent = multiline ? 'textarea' : 'input';

  return (
    <div className="space-y-1">
      <label
        htmlFor={`metadata-${field}`}
        className="block text-sm font-medium text-[hsl(var(--color-foreground))]"
      >
        {label}
      </label>
      <InputComponent
        id={`metadata-${field}`}
        type={multiline ? undefined : 'text'}
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] 
          bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))]
          placeholder:text-[hsl(var(--color-muted-foreground))]
          focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))] focus:border-transparent
          disabled:opacity-50 disabled:cursor-not-allowed
          ${multiline ? 'min-h-[80px] resize-y' : ''}`}
      />
    </div>
  );
}

export interface EditMetadataToolProps {
  /** Custom class name */
  className?: string;
  initialFile?: File | null;
  lockToInitialFile?: boolean;
  onFileUpdated?: (
    file: File,
    options?: { keepDialogOpen?: boolean; markDirty?: boolean },
  ) => void;
}

function readXmpField(
  meta: { get?: (key: string) => string | undefined } | null | undefined,
  key: string,
): string {
  if (!meta?.get) return '';
  try {
    const value = meta.get(key);
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

const META_TEXT_FALLBACKS = {
  whatIsThis: {
    vi: 'Chỉ sửa thông tin mô tả file (tiêu đề, tác giả, từ khóa…), không sửa chữ hay hình ảnh trên các trang PDF.',
    en: 'This edits document properties only (title, author, keywords, etc.). It does not change visible text or images on the PDF pages.',
  },
  whereToSee: {
    vi: 'Sau khi lưu, mở lại công cụ này để kiểm tra, hoặc xem Thuộc tính file trong Finder/Acrobat. Nội dung trang PDF vẫn giữ nguyên — đó là đúng.',
    en: 'After saving, check here again or open the file in Properties. Page content will look the same.',
  },
  workspaceSuccessMessage: {
    vi: 'Đã lưu siêu dữ liệu vào tài liệu đang mở.',
    en: 'Metadata saved to the open document.',
  },
  workspaceSuccessHint: {
    vi: 'Trang PDF trông không đổi là bình thường. Mở lại Metadata để kiểm tra, hoặc bấm Lưu trên ribbon để ghi file ra đĩa.',
    en: 'The pages look unchanged — that is normal. Reopen this tool to verify, or use Save on the toolbar to write to disk.',
  },
} as const;

/**
 * EditMetadataTool Component
 * Requirements: 5.1
 * 
 * Provides the UI for editing PDF document metadata including
 * title, author, subject, and keywords.
 */
export function EditMetadataTool({
  className = '',
  initialFile = null,
  lockToInitialFile = false,
  onFileUpdated,
}: EditMetadataToolProps) {
  const t = useTranslations('common');
  const locale = useLocale();
  const tMeta = useTranslations('tools.editMetadata');
  const metaText = useCallback(
    (key: keyof typeof META_TEXT_FALLBACKS) => {
      const value = tMeta(key);
      if (value.includes('editMetadata.') || value.startsWith('tools.')) {
        return locale === 'vi' ? META_TEXT_FALLBACKS[key].vi : META_TEXT_FALLBACKS[key].en;
      }
      return value;
    },
    [locale, tMeta],
  );
  
  // State
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultFilename, setResultFilename] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  // Metadata form state
  const [metadata, setMetadata] = useState<CurrentMetadata>({
    title: '',
    author: '',
    subject: '',
    keywords: '',
    creator: '',
    producer: '',
  });
  const [originalMetadata, setOriginalMetadata] = useState<CurrentMetadata | null>(null);
  
  // Ref for cancellation
  const cancelledRef = useRef(false);

  /**
   * Extract current metadata from PDF
   */
  const extractMetadata = useCallback(async (pdfFile: File) => {
    try {
      const pdfjsLib = await import('pdfjs-dist');
      configurePdfjsWorker(pdfjsLib);
      
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const metadataResult = await pdf.getMetadata();
      
      const info = metadataResult.info as Record<string, unknown> | null;
      const xmp = metadataResult.metadata as { get?: (key: string) => string | undefined } | null;

      const extracted: CurrentMetadata = {
        title: (info?.Title as string) || readXmpField(xmp, 'dc:title') || '',
        author: (info?.Author as string) || readXmpField(xmp, 'dc:creator') || '',
        subject: (info?.Subject as string) || readXmpField(xmp, 'dc:description') || '',
        keywords: (info?.Keywords as string) || readXmpField(xmp, 'pdf:Keywords') || '',
        creator: (info?.Creator as string) || readXmpField(xmp, 'xmp:CreatorTool') || '',
        producer: (info?.Producer as string) || readXmpField(xmp, 'pdf:Producer') || '',
      };
      
      setMetadata(extracted);
      setOriginalMetadata(extracted);
    } catch (err) {
      console.error('Failed to extract metadata:', err);
      // Set empty metadata if extraction fails
      const empty: CurrentMetadata = {
        title: '',
        author: '',
        subject: '',
        keywords: '',
        creator: '',
        producer: '',
      };
      setMetadata(empty);
      setOriginalMetadata(empty);
    }
  }, []);

  /**
   * Handle file selected from uploader
   */
  const handleFilesSelected = useCallback((files: File[]) => {
    if (files.length > 0) {
      const selectedFile = files[0];
      setFile(selectedFile);
      setError(null);
      setResultBlob(null);
      setStatus('idle');
      extractMetadata(selectedFile);
    }
  }, [extractMetadata]);

  const initialFileSeededRef = useRef<File | null>(null);
  useEffect(() => {
    if (!initialFile) return;
    if (initialFileSeededRef.current === initialFile) return;
    initialFileSeededRef.current = initialFile;
    handleFilesSelected([initialFile]);
  }, [initialFile, handleFilesSelected]);

  /**
   * Handle file upload error
   */
  const handleUploadError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  /**
   * Clear file and reset state
   */
  const handleClearFile = useCallback(() => {
    setFile(null);
    setMetadata({
      title: '',
      author: '',
      subject: '',
      keywords: '',
      creator: '',
      producer: '',
    });
    setOriginalMetadata(null);
    setResultBlob(null);
    setError(null);
    setStatus('idle');
    setProgress(0);
  }, []);

  /**
   * Handle metadata field change
   */
  const handleMetadataChange = useCallback((field: keyof CurrentMetadata, value: string) => {
    setMetadata(prev => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  /**
   * Reset metadata to original values
   */
  const handleResetMetadata = useCallback(() => {
    if (originalMetadata) {
      setMetadata(originalMetadata);
    }
  }, [originalMetadata]);

  /**
   * Handle progress updates
   */
  const handleProgress = useCallback((prog: number, message?: string) => {
    setProgress(prog);
    if (message) {
      setProgressMessage(message);
    }
  }, []);

  /**
   * Handle cancel operation
   */
  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setStatus('idle');
    setProgress(0);
  }, []);

  /**
   * Process the PDF with updated metadata
   */
  const handleSaveMetadata = useCallback(async () => {
    if (!file) return;

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResultBlob(null);

    try {
      // Convert keywords string to array
      const keywordsArray = metadata.keywords
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

      const editableMetadata: EditableMetadata = {
        title: metadata.title,
        author: metadata.author,
        subject: metadata.subject,
        keywords: keywordsArray,
        creator: metadata.creator,
        producer: metadata.producer,
      };

      const result = await editPDFMetadata(
        file,
        editableMetadata,
        { updateModificationDate: true },
        handleProgress
      );

      if (cancelledRef.current) {
        setStatus('idle');
        return;
      }

      if (result.success && result.result) {
        const blob = result.result as Blob;
        setResultBlob(blob);
        setResultFilename(result.filename || 'edited.pdf');
        setStatus('complete');
        if (onFileUpdated && file) {
          const updated = new File([blob], file.name, {
            type: 'application/pdf',
            lastModified: Date.now(),
          });
          setFile(updated);
          setOriginalMetadata({ ...metadata });
          await extractMetadata(updated);
          onFileUpdated(updated, { markDirty: false });
        }
      } else {
        setError(result.error?.message || 'Failed to edit metadata.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        console.error('Failed to edit metadata:', err);
        setError(err instanceof Error ? err.message : 'Failed to edit metadata.');
        setStatus('error');
      }
    }
  }, [file, metadata, handleProgress, onFileUpdated]);

  /**
   * Check if metadata has changed
   */
  const hasChanges = originalMetadata && (
    metadata.title !== originalMetadata.title ||
    metadata.author !== originalMetadata.author ||
    metadata.subject !== originalMetadata.subject ||
    metadata.keywords !== originalMetadata.keywords ||
    metadata.creator !== originalMetadata.creator ||
    metadata.producer !== originalMetadata.producer
  );

  /**
   * Format file size
   */
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const isProcessing = status === 'processing' || status === 'uploading';

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {/* File Upload Area */}
      {!file && (
        <FileUploader
          accept={['application/pdf', '.pdf']}
          multiple={false}
          maxFiles={1}
          onFilesSelected={handleFilesSelected}
          onError={handleUploadError}
          disabled={isProcessing}
          label={tMeta('uploadLabel')}
          description={tMeta('uploadDescription')}
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
        lockToInitialFile ? (
          <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.35)] p-4">
            <FileText className="h-10 w-10 shrink-0 text-[hsl(var(--color-primary))]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[hsl(var(--color-foreground))]">{file.name}</p>
              <p className="text-xs text-[hsl(var(--color-muted-foreground))]">{formatSize(file.size)}</p>
            </div>
          </div>
        ) : (
          <Card variant="outlined">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-10 h-10 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                  <path d="M14 2v6h6" fill="white" />
                </svg>
                <div>
                  <p className="font-medium text-[hsl(var(--color-foreground))]">{file.name}</p>
                  <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
                    {formatSize(file.size)}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFile}
                disabled={isProcessing}
              >
                {t('buttons.remove') || 'Remove'}
              </Button>
            </div>
          </Card>
        )
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

      {file && !isProcessing && status !== 'complete' && (
        <div className="rounded-[var(--radius-md)] border border-blue-200 bg-blue-50/90 p-4 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
          <p className="font-medium">{metaText('whatIsThis')}</p>
          <p className="mt-2 text-blue-800/90 dark:text-blue-100/80">{metaText('whereToSee')}</p>
        </div>
      )}

      {/* Metadata Edit Form */}
      {file && !isProcessing && status !== 'complete' && (
        <Card variant="outlined" size="lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))]">
              {tMeta('editTitle')}
            </h3>
            {hasChanges && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetMetadata}
              >
                {tMeta('resetButton')}
              </Button>
            )}
          </div>
          
          <div className="space-y-4">
            <MetadataField 
              label={tMeta('title') || 'Title'} 
              field="title"
              value={metadata.title}
              onChange={handleMetadataChange}
              placeholder={tMeta('titlePlaceholder') || 'Enter document title'}
              disabled={isProcessing}
            />
            <MetadataField 
              label={tMeta('author') || 'Author'} 
              field="author"
              value={metadata.author}
              onChange={handleMetadataChange}
              placeholder={tMeta('authorPlaceholder') || 'Enter author name'}
              disabled={isProcessing}
            />
            <MetadataField 
              label={tMeta('subject') || 'Subject'} 
              field="subject"
              value={metadata.subject}
              onChange={handleMetadataChange}
              placeholder={tMeta('subjectPlaceholder') || 'Enter document subject'}
              disabled={isProcessing}
            />
            <MetadataField 
              label={tMeta('keywords') || 'Keywords'} 
              field="keywords"
              value={metadata.keywords}
              onChange={handleMetadataChange}
              placeholder={tMeta('keywordsPlaceholder') || 'Enter keywords separated by commas'}
              disabled={isProcessing}
            />
            <MetadataField 
              label={tMeta('creator') || 'Creator Application'} 
              field="creator"
              value={metadata.creator}
              onChange={handleMetadataChange}
              placeholder={tMeta('creatorPlaceholder') || 'Enter creator application'}
              disabled={isProcessing}
            />
            <MetadataField 
              label={tMeta('producer') || 'PDF Producer'} 
              field="producer"
              value={metadata.producer}
              onChange={handleMetadataChange}
              placeholder={tMeta('producerPlaceholder') || 'Enter PDF producer'}
              disabled={isProcessing}
            />
          </div>

          <div className="mt-6 pt-4 border-t border-[hsl(var(--color-border))]">
            <p className="text-sm text-[hsl(var(--color-muted-foreground))] mb-4">
              {tMeta('modificationNote') || 'The modification date will be updated automatically when you save.'}
            </p>
            <Button
              variant="primary"
              size="lg"
              onClick={handleSaveMetadata}
              disabled={!file || !hasChanges}
              className="w-full sm:w-auto"
            >
              {tMeta('saveButton') || 'Save Metadata'}
            </Button>
          </div>
        </Card>
      )}

      {status === 'complete' && resultBlob && (
        <div
          className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-200"
          role="status"
        >
          <p className="text-sm font-medium">
            {onFileUpdated && lockToInitialFile
              ? metaText('workspaceSuccessMessage')
              : tMeta('successMessage')}
          </p>
          {onFileUpdated && lockToInitialFile && (
            <p className="mt-2 text-sm opacity-90">{metaText('workspaceSuccessHint')}</p>
          )}
          {!onFileUpdated && (
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <DownloadButton
                file={resultBlob}
                filename={resultFilename}
                variant="primary"
                size="lg"
              />
              <Button variant="secondary" size="lg" onClick={handleClearFile}>
                {tMeta('editAnother')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EditMetadataTool;

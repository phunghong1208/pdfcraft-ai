'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { injectPdfViewerChrome, attachKonvaSeamGuard } from '@/lib/pdf-viewer-chrome';

export interface StampsToolProps {
  className?: string;
  initialFile?: File | null;
  lockToInitialFile?: boolean;
  /** Reuse an existing blob URL (e.g. workspace preview) — avoids revoke races */
  sourcePdfUrl?: string | null;
  theme?: 'light' | 'dark';
}

interface StampState {
  file: File | null;
  blobUrl: string | null;
  viewerReady: boolean;
}

function buildViewerSrc(pdfUrl: string): string {
  return `/pdfjs-annotation-viewer/web/viewer.html?file=${encodeURIComponent(pdfUrl)}&embedded=1#pagemode=none&zoom=page-width`;
}

export function StampsTool({
  className = '',
  initialFile = null,
  lockToInitialFile = false,
  sourcePdfUrl = null,
  theme = 'light',
}: StampsToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools.stamps');

  const [stampState, setStampState] = useState<StampState>({
    file: null,
    blobUrl: null,
    viewerReady: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const ownedBlobRef = useRef<string | null>(null);

  const activeUrl = sourcePdfUrl ?? stampState.blobUrl;

  const revokeOwnedBlob = useCallback(() => {
    if (ownedBlobRef.current) {
      URL.revokeObjectURL(ownedBlobRef.current);
      ownedBlobRef.current = null;
    }
  }, []);

  useEffect(() => () => revokeOwnedBlob(), [revokeOwnedBlob]);

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      if (sourcePdfUrl || files.length === 0) return;
      const file = files[0];
      revokeOwnedBlob();
      const blobUrl = URL.createObjectURL(file);
      ownedBlobRef.current = blobUrl;
      setStampState({ file, blobUrl, viewerReady: false });
      setError(null);
    },
    [revokeOwnedBlob, sourcePdfUrl],
  );

  useEffect(() => {
    if (!initialFile) return;
    setStampState((prev) => ({
      file: initialFile,
      blobUrl: sourcePdfUrl ?? prev.blobUrl,
      viewerReady: false,
    }));
    if (!sourcePdfUrl) handleFilesSelected([initialFile]);
  }, [initialFile, sourcePdfUrl, handleFilesSelected]);

  useEffect(() => {
    if (!activeUrl) return;
    setStampState((prev) => ({ ...prev, viewerReady: false }));
    const fallback = window.setTimeout(
      () => setStampState((prev) => ({ ...prev, viewerReady: true })),
      5000,
    );
    return () => window.clearTimeout(fallback);
  }, [activeUrl]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'pdfcraft-pages-ready') {
        setStampState((prev) => ({ ...prev, viewerReady: true }));
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const handleUploadError = useCallback((msg: string) => setError(msg), []);

  const activateStampTool = useCallback((doc: Document) => {
    const win = doc.defaultView as (Window & { pdfcraftSetAnnotationTool?: (t: string) => void }) | null;
    const tryActivate = (attempt: number) => {
      try {
        if (typeof win?.pdfcraftSetAnnotationTool === 'function') {
          win.pdfcraftSetAnnotationTool('stamp');
          return;
        }
      } catch {
        // ignore
      }
      try {
        win?.postMessage?.({ type: 'pdfcraft-set-annotation-tool', tool: 'stamp' }, '*');
      } catch {
        // ignore
      }
      if (attempt < 30) window.setTimeout(() => tryActivate(attempt + 1), 200);
    };
    tryActivate(0);
  }, []);

  const handleIframeLoad = useCallback(() => {
    try {
      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!doc) return;
      injectPdfViewerChrome(doc, 'pdfcraft-viewer-chrome', theme);
      attachKonvaSeamGuard(doc);
      activateStampTool(doc);
    } catch {
      // ignore cross-origin edge cases
    }
  }, [activateStampTool, theme]);

  const handleSave = useCallback(async () => {
    if (!stampState.viewerReady || !iframeRef.current) {
      setError(tTools('viewerNotReady') || 'Viewer not ready.');
      return;
    }
    try {
      setIsProcessing(true);
      const win = iframeRef.current.contentWindow as Window & {
        PDFViewerApplication?: { pdfDocument?: { saveDocument: () => Promise<Uint8Array> } };
      };
      const app = win?.PDFViewerApplication;

      if (app?.pdfDocument) {
        const data = await app.pdfDocument.saveDocument();
        const blob = new Blob([data as BlobPart], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `stamped_${stampState.file?.name || 'document.pdf'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        setError(tTools('saveFailed') || 'PDF not loaded.');
      }
      setIsProcessing(false);
    } catch (err) {
      console.error('Save failed:', err);
      setError(tTools('saveFailed') || 'Failed to save.');
      setIsProcessing(false);
    }
  }, [stampState.viewerReady, stampState.file, tTools]);

  const handleClear = useCallback(() => {
    revokeOwnedBlob();
    setStampState({ file: null, blobUrl: null, viewerReady: false });
    setError(null);
  }, [revokeOwnedBlob]);

  const activeFile = stampState.file ?? initialFile;
  const viewerSrc = activeUrl ? buildViewerSrc(activeUrl) : null;

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {!activeFile && (
        <FileUploader
          accept={['application/pdf', '.pdf']}
          multiple={false}
          maxFiles={1}
          onFilesSelected={handleFilesSelected}
          onError={handleUploadError}
          disabled={isProcessing}
          label={tTools('uploadLabel') || 'Upload PDF File'}
          description={tTools('uploadDescription') || 'Drag and drop a PDF file here.'}
        />
      )}

      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700" role="alert">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {activeFile && viewerSrc && (
        <>
          <Card variant="outlined">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                  <path d="M14 2v6h6" fill="white" />
                </svg>
                <div>
                  <p className="text-sm font-medium">{activeFile.name}</p>
                  <p className="text-xs text-gray-500">
                    {(activeFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              {!lockToInitialFile && (
                <Button variant="ghost" size="sm" onClick={handleClear} disabled={isProcessing}>
                  {t('buttons.remove') || 'Remove'}
                </Button>
              )}
            </div>
          </Card>

          <Card variant="outlined" className="bg-blue-50 border-blue-200">
            <div className="flex gap-3">
              <svg
                className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-1">{tTools('instructionsTitle') || 'How to Add Stamps'}</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-600">
                  <li>{tTools('instruction1') || 'Click the Stamp tool in the toolbar'}</li>
                  <li>{tTools('instruction2') || 'Click Add image to upload your stamp'}</li>
                  <li>{tTools('instruction3') || 'Click on the PDF to place the stamp'}</li>
                  <li>{tTools('instruction4') || 'Drag to resize or reposition'}</li>
                  <li>{tTools('instruction5') || 'Click Save Stamped PDF when done'}</li>
                </ol>
              </div>
            </div>
          </Card>

          <div
            className={`relative overflow-hidden border rounded-lg ${
              theme === 'dark' ? 'bg-[#16181d]' : 'bg-gray-100'
            }`}
          >
            <iframe
              ref={iframeRef}
              src={viewerSrc}
              onLoad={handleIframeLoad}
              className={`w-full border-0 transition-opacity duration-200 h-[700px] ${
                stampState.viewerReady ? 'opacity-100' : 'opacity-0'
              }`}
              title="PDF Stamp Editor"
            />
            {!stampState.viewerReady && (
              <div
                className={`absolute inset-0 z-10 flex items-center justify-center pointer-events-none ${
                  theme === 'dark' ? 'bg-[#16181d]' : 'bg-[#f8fafc]'
                }`}
              >
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-3" />
                  <p className={`text-sm ${theme === 'dark' ? 'text-white/50' : 'text-slate-500'}`}>
                    {t('status.loading') || 'Loading document...'}
                  </p>
                </div>
              </div>
            )}
          </div>

          <Card variant="outlined">
            <Button
              variant="primary"
              size="lg"
              onClick={handleSave}
              disabled={!stampState.viewerReady || isProcessing}
              loading={isProcessing}
            >
              {isProcessing
                ? t('status.processing') || 'Processing...'
                : tTools('saveButton') || 'Save Stamped PDF'}
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}

export default StampsTool;

'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { peekUploadedPdf } from '@/lib/document-session';
import { injectPdfViewerChrome, attachKonvaSeamGuard } from '@/lib/pdf-viewer-chrome';


export interface EditPDFToolProps {
  className?: string;
  immersive?: boolean;
  onIframeRef?: (iframe: HTMLIFrameElement | null) => void;
  /** Khi dùng trong workspace — tránh load lại / màn đen do peek session chậm */
  sourceFile?: File | null;
  sourcePdfUrl?: string | null;
}


/**
 * EditPDFTool Component
 * 
 * Provides PDF editing capabilities using PDF.js viewer with annotation support.
 * Users can add text, draw, highlight, and add images to PDFs.
 * The PDF.js viewer has built-in save functionality (export button in toolbar).
 */
export function EditPDFTool({
  className = '',
  immersive = false,
  onIframeRef,
  sourceFile = null,
  sourcePdfUrl = null,
}: EditPDFToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools.editPdf');
  
  const [file, setFile] = useState<File | null>(sourceFile);
  const [pdfUrl, setPdfUrl] = useState<string | null>(sourcePdfUrl);
  const [error, setError] = useState<string | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadedUrlRef = useRef<string | null>(null);
  const activeFile = sourceFile ?? file;
  const activeUrl = sourcePdfUrl ?? pdfUrl;

  const handleFilesSelected = useCallback((files: File[]) => {
    if (files.length > 0) {
      const selectedFile = files[0];
      setFile(selectedFile);
      setError(null);
      setPdfUrl(URL.createObjectURL(selectedFile));
    }
  }, []);

  const handleUploadError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  useEffect(() => {
    if (sourceFile && sourcePdfUrl) {
      setFile(sourceFile);
      setPdfUrl(sourcePdfUrl);
      return;
    }
    const sessionFile = peekUploadedPdf();
    if (!sessionFile) return;

    setFile(sessionFile);
    setError(null);
    setPdfUrl((prev) => {
      if (prev && prev !== sourcePdfUrl) URL.revokeObjectURL(prev);
      return URL.createObjectURL(sessionFile);
    });
  }, [sourceFile, sourcePdfUrl]);

  useEffect(() => {
    return () => {
      if (pdfUrl && pdfUrl !== sourcePdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl, sourcePdfUrl]);

  useEffect(() => {
    return () => onIframeRef?.(null);
  }, [onIframeRef]);

  useEffect(() => {
    if (!activeUrl) {
      loadedUrlRef.current = null;
      return;
    }
    if (loadedUrlRef.current === activeUrl) return;
    loadedUrlRef.current = activeUrl;
  }, [activeUrl]);

  useEffect(() => {
    if (!activeUrl) return;
    setViewerReady(false);
    const fallback = window.setTimeout(() => setViewerReady(true), 5000);
    return () => window.clearTimeout(fallback);
  }, [activeUrl]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'pdfcraft-pages-ready') {
        setViewerReady(true);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const handleIframeLoad = useCallback(() => {
    onIframeRef?.(iframeRef.current);
    loadedUrlRef.current = activeUrl;

    try {
      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!doc) return;

      if (immersive) {
        injectPdfViewerChrome(doc);
        attachKonvaSeamGuard(doc);
      }

      // Page change notifier for parent workspace
      const notifierScript = doc.createElement('script');
      notifierScript.textContent = `(function(){
        var last=-1,ready=false;
        setInterval(function(){
          try{
            var app=window.PDFViewerApplication;
            if(app&&app.page){
              if(!ready){ready=true;window.parent.postMessage({type:'pdfcraft-pages-ready'},'*');}
              if(app.page!==last){last=app.page;window.parent.postMessage({type:'pdfcraft-page-change',page:app.page},'*');}
            }
          }catch(e){}
        },800);
        window.pdfcraftUndo=function(){};
        window.pdfcraftRedo=function(){};
      })();`;
      doc.body.appendChild(notifierScript);

      // Tool switching API (no iframe reload): parent can select annotation tools via postMessage.
      const toolScript = doc.createElement('script');
      toolScript.textContent = `(function(){
        var TOOL_ORDER = [
          'select',
          'highlight',
          'strikeout',
          'underline',
          'rectangle',
          'circle',
          'freehand',
          'freeHighlight',
          'freeText',
          'signature',
          'stamp',
          'note',
          'arrow',
          'cloud'
        ];

        function tryClickTool(toolName){
          var idx = TOOL_ORDER.indexOf(toolName);
          if(idx < 0) return false;
          var toolbar = document.querySelector('.CustomToolbar');
          if(!toolbar) return false;
          var items = toolbar.querySelectorAll('.buttons > li');
          var el = items && items[idx];
          if(!el) return false;
          el.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, view:window }));
          return true;
        }

        function setAnnotating(on){
          document.documentElement.classList.toggle('pdfcraft-annotating', !!on);
          try { window.dispatchEvent(new Event('pdfcraft-edge-sync')); } catch(e){}
        }

        var dirtyNotifyTimer = null;
        function notifyDirty(){
          if(dirtyNotifyTimer) return;
          dirtyNotifyTimer = setTimeout(function(){
            dirtyNotifyTimer = null;
            try{ window.parent.postMessage({ type:'pdfcraft-dirty-change' }, '*'); }catch(e){}
          }, 180);
        }

        function setTool(toolName){
          try{
            if(!toolName) return;
            var ext = window.pdfjsAnnotationExtensionInstance;
            var cur = ext && ext.activeAnnotation && ext.activeAnnotation.name;
            var next = (cur === toolName) ? 'select' : toolName;
            setAnnotating(next !== 'select');
            tryClickTool(next);
          }catch(e){}
        }

        function invokeToolbarAction(action){
          try{
            var toolbar = document.querySelector('.CustomToolbar');
            if(!toolbar) return false;
            var map = {
              addPage: [
                'addpage','add-page','insertpage','insert-page','newpage','new-page',
                'add blank page','insert blank page','thêm trang','them trang',
                '添加页','新增页面','增加页面'
              ],
              deletePage: [
                'deletepage','delete-page','removepage','remove-page',
                'delete current page','xóa trang','xoa trang',
                '删除页','删除页面'
              ]
            };
            var keywords = map[action];
            if(!keywords) return false;
            var nodes = toolbar.querySelectorAll('li,button,[data-action],[class]');
            for(var i=0;i<nodes.length;i++){
              var el = nodes[i];
              var hay = [
                el.getAttribute('data-action') || '',
                el.getAttribute('title') || '',
                el.getAttribute('aria-label') || '',
                el.className || '',
                el.textContent || ''
              ].join(' ').toLowerCase();
              for(var j=0;j<keywords.length;j++){
                if(hay.indexOf(keywords[j]) !== -1){
                  el.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, view:window }));
                  notifyDirty();
                  return true;
                }
              }
            }
            return false;
          }catch(e){
            return false;
          }
        }

        window.pdfcraftSetAnnotationTool = setTool;
        window.pdfcraftInvokeToolbarAction = invokeToolbarAction;
        window.pdfcraftExportEditedPdf = async function(){
          try{
            var app = window.PDFViewerApplication;
            var doc = app && (app.pdfDocument || (app.pdfViewer && app.pdfViewer.pdfDocument));
            if(doc && typeof doc.saveDocument === 'function'){
              return await doc.saveDocument();
            }
          }catch(e){}
          return null;
        };
        document.addEventListener('pointerup', function(){
          if(document.documentElement.classList.contains('pdfcraft-annotating')) notifyDirty();
        }, true);
        document.addEventListener('keydown', function(evt){
          if(!document.documentElement.classList.contains('pdfcraft-annotating')) return;
          if(evt.key === 'Backspace' || evt.key === 'Delete' || evt.key.length === 1 || evt.ctrlKey || evt.metaKey){
            notifyDirty();
          }
        }, true);
        window.addEventListener('message', function(evt){
          var data = evt && evt.data;
          if(!data || data.type !== 'pdfcraft-set-annotation-tool') return;
          if(typeof data.tool !== 'string') return;
          setTool(data.tool);
        });
      })();`;
      doc.body.appendChild(toolScript);
    } catch (e) {
      console.warn('Could not access iframe content', e);
    }
  }, [activeUrl, immersive, onIframeRef]);

  const handleClear = useCallback(() => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setFile(null);
    setPdfUrl(null);
    setError(null);
  }, [pdfUrl]);

  return (
    <div className={`${immersive ? 'absolute inset-0 h-full w-full' : 'space-y-6'} ${className}`.trim()}>
      {!activeUrl && (
        <div className={immersive ? 'h-full flex items-center justify-center' : ''}>
          <FileUploader
            accept={['application/pdf', '.pdf']}
            multiple={false}
            maxFiles={1}
            onFilesSelected={handleFilesSelected}
            onError={handleUploadError}
            label={tTools('uploadLabel')}
            description={tTools('uploadDescription')}
          />
        </div>
      )}

      {error && (
        <div className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700" role="alert">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {activeUrl && (
        <div className={immersive ? 'h-full w-full' : 'space-y-4'}>
          {!immersive && (
            <Card variant="outlined" size="sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                    <path d="M14 2v6h6" fill="white" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-[hsl(var(--color-foreground))]">{activeFile?.name}</p>
                    <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                      {activeFile ? `${(activeFile.size / (1024 * 1024)).toFixed(2)} MB` : ''}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleClear}>
                  {t('buttons.clear') || 'Clear'}
                </Button>
              </div>
            </Card>
          )}

          {/* PDF Viewer iframe */}
          <div className={`relative overflow-hidden ${immersive ? 'h-full bg-[#16181d]' : 'border border-[hsl(var(--color-border))] rounded-[var(--radius-md)] bg-gray-100'}`}>
            <iframe
              ref={iframeRef}
              src={`/pdfjs-annotation-viewer/web/viewer.html?file=${encodeURIComponent(activeUrl)}&embedded=1#pagemode=none&zoom=page-width`}
              className={`w-full border-0 transition-opacity duration-200 ${immersive ? 'h-full' : 'h-[700px]'} ${viewerReady ? 'opacity-100' : 'opacity-0'}`}
              title="PDF Editor"
              onLoad={handleIframeLoad}
            />
            {!viewerReady && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center bg-[#16181d] pointer-events-none"
            >
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-3" />
                <p className="text-sm text-white/50">Loading document...</p>
              </div>
            </div>
            )}
            {viewerReady && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center bg-[#16181d] pointer-events-none"
              style={{ animation: 'pdfcraft-overlay-fade 1.2s ease-in forwards' }}
            >
              <style>{`@keyframes pdfcraft-overlay-fade { 0%,40% { opacity:1 } 100% { opacity:0 } }`}</style>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default EditPDFTool;

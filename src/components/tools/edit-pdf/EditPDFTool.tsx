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
  theme?: 'light' | 'dark';
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
  theme = 'light',
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
    loadedUrlRef.current = activeUrl;

    try {
      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!doc) return;

      if (immersive) {
        injectPdfViewerChrome(doc, 'pdfcraft-viewer-chrome', theme);
        attachKonvaSeamGuard(doc);
      }

      onIframeRef?.(iframeRef.current);

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
        window.pdfcraftUndo=function(){
          try{
            var ext=window.pdfjsAnnotationExtensionInstance;
            if(ext&&ext.painter&&typeof ext.painter.undo==='function'){ext.painter.undo();return;}
          }catch(e){}
          document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',ctrlKey:true,bubbles:true}));
        };
        window.pdfcraftRedo=function(){
          try{
            var ext=window.pdfjsAnnotationExtensionInstance;
            if(ext&&ext.painter&&typeof ext.painter.redo==='function'){ext.painter.redo();return;}
          }catch(e){}
          document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',ctrlKey:true,shiftKey:true,bubbles:true}));
        };
      })();`;
      doc.body.appendChild(notifierScript);

      // Tool switching API (no iframe reload): parent can select annotation tools via postMessage.
      const toolScript = doc.createElement('script');
      toolScript.textContent = `(function(){
        var TOOL_ORDER = [
          'select','highlight','strikeout','underline',
          'rectangle','circle','note','arrow','cloud',
          'freehand','freeHighlight','freeText','signature','stamp'
        ];
        var TOOL_SET = {};
        TOOL_ORDER.forEach(function(n){ TOOL_SET[n] = true; });

        var TEXT_MARKUP = { highlight:1, underline:1, strikeout:1 };
        window.__pdfcraftActiveTool = 'select';

        // pdfjsEditorType: NONE=0, HIGHLIGHT=9, STAMP=13, INK=15
        // pdfjsAnnotationType: NONE=0, TEXT=1, FREETEXT=3, LINE=4, SQUARE=5, CIRCLE=6, POLYLINE=8, HIGHLIGHT=9, UNDERLINE=10, STRIKEOUT=12, STAMP=13, INK=15
        var TOOL_CONFIGS = {
          select:{name:'select',type:0,pdfjsEditorType:0,pdfjsAnnotationType:0,isOnce:false,resizable:false,draggable:false},
          highlight:{name:'highlight',type:1,pdfjsEditorType:9,pdfjsAnnotationType:9,subtype:'Highlight',isOnce:false,resizable:false,draggable:false,style:{color:'#ffff00'},styleEditable:{color:true,strokeWidth:false,opacity:false}},
          strikeout:{name:'strikeout',type:2,pdfjsEditorType:9,pdfjsAnnotationType:12,subtype:'StrikeOut',isOnce:false,resizable:false,draggable:false,style:{color:'#ff0000'},styleEditable:{color:true,opacity:false,strokeWidth:false}},
          underline:{name:'underline',type:3,pdfjsEditorType:9,pdfjsAnnotationType:10,subtype:'Underline',isOnce:false,resizable:false,draggable:false,style:{color:'#0080ff'},styleEditable:{color:true,opacity:false,strokeWidth:false}},
          rectangle:{name:'rectangle',type:5,pdfjsEditorType:15,pdfjsAnnotationType:5,subtype:'Square',isOnce:true,resizable:true,draggable:true,style:{color:'#ff0000',strokeWidth:2,opacity:1},styleEditable:{color:true,opacity:true,strokeWidth:true}},
          circle:{name:'circle',type:6,pdfjsEditorType:15,pdfjsAnnotationType:6,subtype:'Circle',isOnce:true,resizable:true,draggable:true,style:{color:'#ff0000',strokeWidth:2,opacity:1},styleEditable:{color:true,opacity:true,strokeWidth:true}},
          note:{name:'note',type:11,pdfjsEditorType:15,pdfjsAnnotationType:1,subtype:'Text',isOnce:true,resizable:false,draggable:true},
          arrow:{name:'arrow',type:12,pdfjsEditorType:15,pdfjsAnnotationType:4,subtype:'Arrow',isOnce:true,resizable:true,draggable:true,style:{color:'#ff0000',strokeWidth:2,opacity:1},styleEditable:{color:true,opacity:true,strokeWidth:true}},
          cloud:{name:'cloud',type:13,pdfjsEditorType:15,pdfjsAnnotationType:8,subtype:'PolyLine',isOnce:true,resizable:true,draggable:true,style:{color:'#ff0000',strokeWidth:2,opacity:1},styleEditable:{color:true,opacity:true,strokeWidth:true}},
          freehand:{name:'freehand',type:7,pdfjsEditorType:15,pdfjsAnnotationType:15,subtype:'Ink',isOnce:true,resizable:true,draggable:true,style:{color:'#ff0000',strokeWidth:2,opacity:1},styleEditable:{color:true,opacity:true,strokeWidth:true}},
          freeHighlight:{name:'freeHighlight',type:8,pdfjsEditorType:15,pdfjsAnnotationType:15,subtype:'Highlight',isOnce:true,resizable:true,draggable:true,style:{color:'#ffff00',strokeWidth:10,opacity:0.5},styleEditable:{color:true,opacity:true,strokeWidth:false}},
          freeText:{name:'freeText',type:4,pdfjsEditorType:13,pdfjsAnnotationType:3,subtype:'FreeText',isOnce:true,resizable:true,draggable:true,style:{color:'#ff0000',fontSize:14},styleEditable:{color:true,opacity:true,strokeWidth:false}},
          signature:{name:'signature',type:9,pdfjsEditorType:13,pdfjsAnnotationType:13,subtype:'Caret',isOnce:true,resizable:true,draggable:true},
          stamp:{name:'stamp',type:10,pdfjsEditorType:13,pdfjsAnnotationType:13,subtype:'Stamp',isOnce:true,resizable:true,draggable:true}
        };

        function getExtension(){
          return window.pdfjsAnnotationExtensionInstance || null;
        }

        function getPainterAnnotationConfig(toolName){
          var ext = getExtension();
          if(!ext || !ext.painter) return null;
          var ann = ext.painter.currentAnnotation;
          if(ann && ann.name === toolName) return ann;
          return null;
        }

        function updateMarkupToolbarSelection(activeName){
          var items = getFirstToolbarItems();
          if(!items) return;
          ['highlight','strikeout','underline'].forEach(function(name){
            var idx = TOOL_ORDER.indexOf(name);
            if(idx < 0) return;
            var li = items[idx];
            if(li) li.classList.toggle('selected', name === activeName);
          });
        }

        function activateMarkupTool(toolName){
          var ext = getExtension();
          if(!ext || !ext.painter) return false;
          var cfg = TOOL_CONFIGS[toolName];
          if(!cfg) return false;
          try{
            if(ext.customToolbarRef && ext.customToolbarRef.current && typeof ext.customToolbarRef.current.activeAnnotation === 'function'){
              ext.customToolbarRef.current.activeAnnotation(cfg);
            }
            ext.painter.activate(cfg, null);
            return true;
          }catch(e){
            return false;
          }
        }

        function syncMarkupTool(toolName){
          if(!TEXT_MARKUP[toolName]) return null;
          if(!activateMarkupTool(toolName)) return null;
          return getPainterAnnotationConfig(toolName) || TOOL_CONFIGS[toolName];
        }

        function setAnnotating(on){
          document.documentElement.classList.toggle('pdfcraft-annotating', !!on);
          try { window.dispatchEvent(new Event('pdfcraft-edge-sync')); } catch(e){}
        }

        function setTextMarkupMode(on){
          document.documentElement.classList.toggle('pdfcraft-text-markup', !!on);
        }

        var dirtyNotifyTimer = null;
        function notifyDirty(){
          if(dirtyNotifyTimer) return;
          dirtyNotifyTimer = setTimeout(function(){
            dirtyNotifyTimer = null;
            try{ window.parent.postMessage({ type:'pdfcraft-dirty-change' }, '*'); }catch(e){}
          }, 180);
        }

        function getToolLi(toolName){
          var idx = TOOL_ORDER.indexOf(toolName);
          if(idx < 0) return null;
          var ul = document.querySelector('.CustomToolbar ul.buttons');
          if(!ul) return null;
          var items = ul.querySelectorAll(':scope > li');
          if(items.length < TOOL_ORDER.length) return null;
          return items[idx];
        }

        function getFirstToolbarItems(){
          var ul = document.querySelector('.CustomToolbar ul.buttons');
          if(!ul) return null;
          var items = ul.querySelectorAll(':scope > li');
          if(items.length < TOOL_ORDER.length) return null;
          return items;
        }

        function tryClickTool(toolName){
          var el = getToolLi(toolName);
          if(!el || el.classList.contains('disabled')) return false;
          if(typeof el.click === 'function') el.click();
          else el.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, view:window }));
          return true;
        }

        function activateExtensionTool(toolName){
          var ext = getExtension();
          if(!ext || !ext.painter) return false;
          var cfg = TOOL_CONFIGS[toolName];
          if(!cfg) return false;
          try{
            if(ext.customToolbarRef && ext.customToolbarRef.current && typeof ext.customToolbarRef.current.activeAnnotation === 'function'){
              ext.customToolbarRef.current.activeAnnotation(cfg);
            } else {
              ext.painter.activate(cfg, null);
            }
            return true;
          }catch(e){
            return false;
          }
        }

        function activateTool(toolName){
          if(TEXT_MARKUP[toolName]) return activateMarkupTool(toolName);
          if(activateExtensionTool(toolName)) return true;
          return tryClickTool(toolName);
        }

        function activateEditorMode(mode){
          try{
            var app = window.PDFViewerApplication;
            if(!app) return;
            if(app.pdfViewer && typeof app.pdfViewer.annotationEditorMode !== 'undefined'){
              app.pdfViewer.annotationEditorMode = { mode: mode };
            }
            if(app.eventBus){
              app.eventBus.dispatch('switchannotationeditormode', { source: app, mode: mode });
            }
          }catch(e){}
        }

        function setTool(toolName){
          try{
            if(!toolName || !TOOL_SET[toolName]) return false;
            setAnnotating(toolName !== 'select');
            setTextMarkupMode(!!TEXT_MARKUP[toolName]);
            if(toolName === 'select') activateEditorMode(0);
            if(!activateTool(toolName)) return false;
            window.__pdfcraftActiveTool = toolName;
            if(TEXT_MARKUP[toolName]) updateMarkupToolbarSelection(toolName);
            return true;
          }catch(e){
            return false;
          }
        }

        function setToolWithRetry(toolName){
          if(setTool(toolName)) return;
          var tries = 0;
          var timer = setInterval(function(){
            tries += 1;
            if(setTool(toolName) || tries >= 80) clearInterval(timer);
          }, 200);
        }

        function invokeToolbarAction(action){
          try{
            var toolbar = document.querySelector('.CustomToolbar');
            if(!toolbar) return false;
            var map = {
              addPage: ['addpage','add-page','insertpage','insert-page','newpage','new-page','thêm trang','them trang'],
              deletePage: ['deletepage','delete-page','removepage','remove-page','xóa trang','xoa trang']
            };
            var keywords = map[action];
            if(!keywords) return false;
            var nodes = toolbar.querySelectorAll('li,button,[data-action],[class]');
            for(var i=0;i<nodes.length;i++){
              var el = nodes[i];
              var hay = [el.getAttribute('data-action')||'',el.getAttribute('title')||'',el.className||'',el.textContent||''].join(' ').toLowerCase();
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

        function closePopbar(){
          var ext = getExtension();
          try{
            if(ext && ext.customPopbarRef && ext.customPopbarRef.current && typeof ext.customPopbarRef.current.close === 'function'){
              ext.customPopbarRef.current.close();
            }
          }catch(e){}
        }

        function annotationList(){
          var ext = getExtension();
          if(!ext || !ext.painter || typeof ext.painter.getData !== 'function') return [];
          var data = ext.painter.getData();
          if(Array.isArray(data)) return data;
          if(data && typeof data === 'object') return Object.values(data);
          return [];
        }

        function openAnnotationMenuForNewest(){
          var ext = getExtension();
          if(!ext || !ext.painter) return;
          var items = annotationList();
          if(!items.length) return;
          var newest = items[items.length - 1];
          if(!newest || !newest.id) return;
          if(typeof ext.painter.selectAnnotation === 'function'){
            ext.painter.selectAnnotation(newest.id);
            return;
          }
          if(ext.customerAnnotationMenuRef && ext.customerAnnotationMenuRef.current && typeof ext.customerAnnotationMenuRef.current.open === 'function'){
            ext.customerAnnotationMenuRef.current.open(newest, null);
          }
        }

        function applyTextMarkupFromSelection(){
          var tool = window.__pdfcraftActiveTool;
          if(!TEXT_MARKUP[tool]) return false;
          var ext = getExtension();
          if(!ext || !ext.painter) return false;
          var sel = window.getSelection();
          if(!sel || sel.isCollapsed || !sel.rangeCount) return false;
          var range = sel.getRangeAt(0);
          if(!range) return false;
          if(range.startContainer.nodeType !== 3 && range.endContainer.nodeType !== 3) return false;
          var cfg = syncMarkupTool(tool);
          if(!cfg || cfg.type === undefined) return false;
          closePopbar();
          try{
            ext.painter.highlightRange(range, cfg);
            notifyDirty();
            setTimeout(function(){
              openAnnotationMenuForNewest();
              try{ sel.removeAllRanges(); }catch(e){}
            }, 120);
            return true;
          }catch(e){
            return false;
          }
        }

        window.pdfcraftSetAnnotationTool = setToolWithRetry;
        window.pdfcraftInvokeToolbarAction = invokeToolbarAction;
        window.pdfcraftExportEditedPdf = async function(){
          try{
            var app = window.PDFViewerApplication;
            var doc = app && (app.pdfDocument || (app.pdfViewer && app.pdfViewer.pdfDocument));
            if(doc && typeof doc.saveDocument === 'function') return await doc.saveDocument();
          }catch(e){}
          return null;
        };
        document.addEventListener('pointerup', function(){
          if(document.documentElement.classList.contains('pdfcraft-annotating')) notifyDirty();
        }, true);
        document.addEventListener('keydown', function(evt){
          if(!document.documentElement.classList.contains('pdfcraft-annotating')) return;
          if(evt.key === 'Backspace' || evt.key === 'Delete' || evt.key.length === 1 || evt.ctrlKey || evt.metaKey) notifyDirty();
        }, true);
        window.addEventListener('message', function(evt){
          var data = evt && evt.data;
          if(!data || data.type !== 'pdfcraft-set-annotation-tool') return;
          if(typeof data.tool !== 'string') return;
          setToolWithRetry(data.tool);
        });

        var lastMarkupKey = '';
        document.addEventListener('mouseup', function(){
          if(!document.documentElement.classList.contains('pdfcraft-text-markup')) return;
          setTimeout(function(){
            var sel = window.getSelection();
            if(!sel || sel.isCollapsed || !sel.rangeCount) return;
            var key = window.__pdfcraftActiveTool + '|' + sel.toString().slice(0,120);
            if(key === lastMarkupKey) return;
            lastMarkupKey = key;
            if(applyTextMarkupFromSelection()){
              setTimeout(function(){ lastMarkupKey = ''; }, 500);
            }
          }, 50);
        }, true);

        document.addEventListener('click', function(evt){
          if(!document.documentElement.classList.contains('pdfcraft-text-markup')) return;
          var li = evt.target && evt.target.closest && evt.target.closest('.CustomToolbar ul.buttons > li');
          if(!li) return;
          var items = getFirstToolbarItems();
          if(!items) return;
          for(var i=0;i<TOOL_ORDER.length;i++){
            if(items[i] !== li) continue;
            var name = TOOL_ORDER[i] || 'select';
            if(!TEXT_MARKUP[name]) return;
            evt.preventDefault();
            evt.stopPropagation();
            setTool(name);
            try{ window.parent.postMessage({ type:'pdfcraft-tool-changed', tool:name }, '*'); }catch(e){}
            return;
          }
        }, true);
      })();`;
      doc.body.appendChild(toolScript);
    } catch (e) {
      console.warn('Could not access iframe content', e);
    }
  }, [activeUrl, immersive, onIframeRef, theme]);

  useEffect(() => {
    if (!immersive || !activeUrl) return;
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    injectPdfViewerChrome(doc, 'pdfcraft-viewer-chrome', theme);
    onIframeRef?.(iframeRef.current);
  }, [activeUrl, immersive, onIframeRef, theme]);

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
          <div className={`relative overflow-hidden ${immersive ? `h-full ${theme === 'dark' ? 'bg-[#16181d]' : 'bg-[#f8fafc]'}` : 'border border-[hsl(var(--color-border))] rounded-[var(--radius-md)] bg-gray-100'}`}>
            <iframe
              ref={iframeRef}
              src={`/pdfjs-annotation-viewer/web/viewer.html?file=${encodeURIComponent(activeUrl)}&embedded=1#pagemode=none&zoom=page-width`}
              className={`w-full border-0 transition-opacity duration-200 ${immersive ? 'h-full' : 'h-[700px]'} ${viewerReady ? 'opacity-100' : 'opacity-0'}`}
              title="PDF Editor"
              onLoad={handleIframeLoad}
            />
            {!viewerReady && (
            <div
              className={`absolute inset-0 z-10 flex items-center justify-center pointer-events-none ${theme === 'dark' ? 'bg-[#16181d]' : 'bg-[#f8fafc]'}`}
            >
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-3" />
                <p className={`text-sm ${theme === 'dark' ? 'text-white/50' : 'text-slate-500'}`}>Loading document...</p>
              </div>
            </div>
            )}
            {viewerReady && (
            <div
              className={`absolute inset-0 z-10 flex items-center justify-center pointer-events-none ${theme === 'dark' ? 'bg-[#16181d]' : 'bg-[#f8fafc]'}`}
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

'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { peekUploadedPdf } from '@/lib/document-session';
import { injectPdfViewerChrome, attachKonvaSeamGuard } from '@/lib/pdf-viewer-chrome';
import { buildStampUrlGuardScript } from '@/lib/pdf/stamp-url-guard';


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
      const prevToolScript = doc.getElementById('pdfcraft-tool-script');
      if (prevToolScript) prevToolScript.remove();

      const toolScript = doc.createElement('script');
      toolScript.id = 'pdfcraft-tool-script';
      toolScript.textContent = `(function(){
        ${buildStampUrlGuardScript()}
        patchInvalidMediaUrls();
        var TOOL_ORDER = [
          'select','highlight','strikeout','underline',
          'rectangle','circle','note','arrow','cloud',
          'freehand','freeHighlight','freeText','signature','stamp'
        ];
        var TOOL_SET = {};
        TOOL_ORDER.forEach(function(n){ TOOL_SET[n] = true; });

        var TEXT_MARKUP = { highlight:1, underline:1, strikeout:1 };
        var EXTENSION_CLICK_TOOLS = { note:1, stamp:1, signature:1 };
        var STAMP_TYPE = 10;
        var SIGNATURE_TYPE = 9;
        var FREETEXT_TYPE = 4;
        var NOTE_PDFJS_TYPE = 1;
        var FREE_TEXT_COLORS_EXTRA = ['#000000','#6b7280','#ffffff','#f97316','#ec4899'];
        var FREE_TEXT_FONT_SIZES = [10,12,14,16,18,20,22,24,28,32];
        var FREE_TEXT_FONTS = [
          { label:'Arial', value:'Arial' },
          { label:'Times New Roman', value:'Times New Roman' },
          { label:'Georgia', value:'Georgia' },
          { label:'Verdana', value:'Verdana' },
          { label:'Tahoma', value:'Tahoma, Geneva, sans-serif' },
          { label:'Courier New', value:'"Courier New", Courier, monospace' }
        ];
        window.__pdfcraftActiveTool = 'select';
        window.__pdfcraftFreeTextStyle = { color:'#1677ff', fontSize:14, fontFamily:'Arial' };

        // pdfjsEditorType: NONE=0, HIGHLIGHT=9, STAMP=13, INK=15
        // pdfjsAnnotationType: NONE=0, TEXT=1, FREETEXT=3, LINE=4, SQUARE=5, CIRCLE=6, POLYLINE=8, HIGHLIGHT=9, UNDERLINE=10, STRIKEOUT=12, STAMP=13, INK=15
        var TOOL_CONFIGS = {
          select:{name:'select',type:0,pdfjsEditorType:0,pdfjsAnnotationType:0,isOnce:false,resizable:false,draggable:false},
          highlight:{name:'highlight',type:1,pdfjsEditorType:9,pdfjsAnnotationType:9,subtype:'Highlight',isOnce:false,resizable:false,draggable:false,style:{color:'#ffff00'},styleEditable:{color:true,strokeWidth:false,opacity:false}},
          strikeout:{name:'strikeout',type:2,pdfjsEditorType:9,pdfjsAnnotationType:12,subtype:'StrikeOut',isOnce:false,resizable:false,draggable:false,style:{color:'#ff0000'},styleEditable:{color:true,opacity:false,strokeWidth:false}},
          underline:{name:'underline',type:3,pdfjsEditorType:9,pdfjsAnnotationType:10,subtype:'Underline',isOnce:false,resizable:false,draggable:false,style:{color:'#0080ff'},styleEditable:{color:true,opacity:false,strokeWidth:false}},
          rectangle:{name:'rectangle',type:5,pdfjsEditorType:15,pdfjsAnnotationType:5,subtype:'Square',isOnce:true,resizable:true,draggable:true,style:{color:'#ff0000',strokeWidth:2,opacity:1},styleEditable:{color:true,opacity:true,strokeWidth:true}},
          circle:{name:'circle',type:6,pdfjsEditorType:15,pdfjsAnnotationType:6,subtype:'Circle',isOnce:true,resizable:true,draggable:true,style:{color:'#ff0000',strokeWidth:2,opacity:1},styleEditable:{color:true,opacity:true,strokeWidth:true}},
          note:{name:'note',type:11,pdfjsEditorType:15,pdfjsAnnotationType:1,subtype:'Text',isOnce:false,resizable:false,draggable:true},
          arrow:{name:'arrow',type:12,pdfjsEditorType:15,pdfjsAnnotationType:4,subtype:'Arrow',isOnce:true,resizable:true,draggable:true,style:{color:'#ff0000',strokeWidth:2,opacity:1},styleEditable:{color:true,opacity:true,strokeWidth:true}},
          cloud:{name:'cloud',type:13,pdfjsEditorType:15,pdfjsAnnotationType:8,subtype:'PolyLine',isOnce:true,resizable:true,draggable:true,style:{color:'#ff0000',strokeWidth:2,opacity:1},styleEditable:{color:true,opacity:true,strokeWidth:true}},
          freehand:{name:'freehand',type:7,pdfjsEditorType:15,pdfjsAnnotationType:15,subtype:'Ink',isOnce:true,resizable:true,draggable:true,style:{color:'#ff0000',strokeWidth:2,opacity:1},styleEditable:{color:true,opacity:true,strokeWidth:true}},
          freeHighlight:{name:'freeHighlight',type:8,pdfjsEditorType:15,pdfjsAnnotationType:15,subtype:'Highlight',isOnce:true,resizable:true,draggable:true,style:{color:'#ffff00',strokeWidth:10,opacity:0.5},styleEditable:{color:true,opacity:true,strokeWidth:false}},
          freeText:{name:'freeText',type:4,pdfjsEditorType:13,pdfjsAnnotationType:3,subtype:'FreeText',isOnce:false,resizable:true,draggable:true,style:{color:'#1677ff',fontSize:14,fontFamily:'Arial'},styleEditable:{color:true,opacity:true,strokeWidth:false}},
          signature:{name:'signature',type:9,pdfjsEditorType:13,pdfjsAnnotationType:13,subtype:'Caret',isOnce:true,resizable:true,draggable:true},
          stamp:{name:'stamp',type:10,pdfjsEditorType:13,pdfjsAnnotationType:13,subtype:'Stamp',isOnce:true,resizable:true,draggable:true}
        };

        function getExtension(){
          return window.pdfjsAnnotationExtensionInstance || null;
        }

        function mergeFreeTextConfig(base){
          var cfg = Object.assign({}, base || TOOL_CONFIGS.freeText);
          var st = window.__pdfcraftFreeTextStyle || {};
          cfg.style = Object.assign({}, cfg.style || {}, {
            color: st.color || cfg.style.color,
            fontSize: st.fontSize || cfg.style.fontSize || 14,
            fontFamily: st.fontFamily || cfg.style.fontFamily || 'Arial'
          });
          cfg.isOnce = false;
          return cfg;
        }

        function mergeNoteConfig(base){
          var cfg = Object.assign({}, base || TOOL_CONFIGS.note);
          cfg.isOnce = false;
          return cfg;
        }

        function setNotePanelVisible(on){
          document.documentElement.classList.toggle('pdfcraft-note-panel', !!on);
          if(!on) hidePdfcraftNoteEditor();
        }

        function findAnnotationById(id){
          var items = annotationList();
          for(var i=0;i<items.length;i++){
            if(items[i] && items[i].id === id) return items[i];
          }
          return null;
        }

        function ensurePdfcraftNoteEditor(){
          var root = document.getElementById('pdfcraft-note-editor');
          if(root) return root;
          root = document.createElement('div');
          root.id = 'pdfcraft-note-editor';
          root.className = 'pdfcraft-note-editor';
          root.innerHTML = '<p class="pdfcraft-note-editor-title">Ghi chú</p>' +
            '<textarea placeholder="Nhập nội dung ghi chú..." rows="5"></textarea>' +
            '<div class="pdfcraft-note-editor-actions">' +
            '<button type="button" class="pdfcraft-note-close">Đóng</button>' +
            '<button type="button" class="pdfcraft-note-save">Lưu</button>' +
            '</div>';
          var ta = root.querySelector('textarea');
          var saveBtn = root.querySelector('.pdfcraft-note-save');
          var closeBtn = root.querySelector('.pdfcraft-note-close');
          function commit(){
            var id = root.getAttribute('data-ann-id');
            if(!id) return;
            var ann = findAnnotationById(id);
            if(!ann) return;
            savePdfcraftNoteText(ann, ta ? ta.value : '');
          }
          if(saveBtn) saveBtn.addEventListener('click', commit);
          if(closeBtn) closeBtn.addEventListener('click', function(){ hidePdfcraftNoteEditor(); });
          if(ta){
            ta.addEventListener('keydown', function(evt){
              if(evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey)){ evt.preventDefault(); commit(); }
            });
          }
          document.body.appendChild(root);
          return root;
        }

        function hidePdfcraftNoteEditor(){
          var root = document.getElementById('pdfcraft-note-editor');
          if(root) root.removeAttribute('data-ann-id');
        }

        function savePdfcraftNoteText(ann, text){
          var ext = getExtension();
          if(!ext || !ann || !ann.id) return;
          var contentsObj = Object.assign({}, ann.contentsObj || {}, { text: String(text || '') });
          var updated = Object.assign({}, ann, { contentsObj: contentsObj });
          try{
            if(ext.customCommentRef && ext.customCommentRef.current && typeof ext.customCommentRef.current.updateAnnotation === 'function'){
              ext.customCommentRef.current.updateAnnotation(updated);
            }
          }catch(e){}
          try{
            if(ext.painter && typeof ext.painter.update === 'function'){
              ext.painter.update(ann.id, { contentsObj: contentsObj });
            }
          }catch(e){}
          notifyDirty();
        }

        function showPdfcraftNoteEditor(ann){
          if(!ann || !ann.id) return;
          setNotePanelVisible(true);
          var root = ensurePdfcraftNoteEditor();
          root.setAttribute('data-ann-id', ann.id);
          var ta = root.querySelector('textarea');
          if(ta){
            ta.value = (ann.contentsObj && ann.contentsObj.text) ? ann.contentsObj.text : '';
            setTimeout(function(){ try{ ta.focus(); ta.select(); }catch(e){} }, 50);
          }
          try{
            var ext = getExtension();
            if(ext && ext.customCommentRef && ext.customCommentRef.current && typeof ext.customCommentRef.current.selectedAnnotation === 'function'){
              ext.customCommentRef.current.selectedAnnotation(ann, false);
            }
          }catch(e){}
        }

        function openNoteEditorForId(id){
          var ann = findAnnotationById(id);
          if(!ann) return;
          showPdfcraftNoteEditor(ann);
        }

        var STAMP_PRESETS_URL = '/pdfjs-annotation-viewer/web/stamp-presets.json';
        var STAMP_UPLOAD_MAX = 5242880;
        var STAMP_UPLOAD_ACCEPT = 'image/png,image/jpeg,image/jpg,image/bmp,.png,.jpg,.jpeg,.bmp';

        function getCustomStamps(){
          if(!window.__pdfcraftCustomStamps) window.__pdfcraftCustomStamps = [];
          return window.__pdfcraftCustomStamps;
        }

        function addCustomStamp(dataUrl){
          if(!isValidStampUrl(dataUrl)) return false;
          var list = getCustomStamps();
          if(list.indexOf(dataUrl) < 0) list.unshift(dataUrl);
          if(list.length > 24) list.length = 24;
          return true;
        }

        function hideStampPop(){
          hidePdfcraftStampPicker();
          var pops = document.querySelectorAll('.ant-popover.StampPop, .ant-dropdown:has(.StampPop-Container)');
          for(var i=0;i<pops.length;i++){ if(pops[i].style) pops[i].style.display = 'none'; }
        }

        function hidePdfcraftStampPicker(){
          document.documentElement.classList.remove('pdfcraft-stamp-active');
          var el = document.getElementById('pdfcraft-stamp-picker');
          if(el) el.remove();
        }

        function loadStampPresets(cb){
          if(window.__pdfcraftStampPresets) return cb(window.__pdfcraftStampPresets);
          fetch(STAMP_PRESETS_URL)
            .then(function(r){ return r.ok ? r.json() : []; })
            .then(function(data){
              window.__pdfcraftStampPresets = Array.isArray(data) ? data : [];
              cb(window.__pdfcraftStampPresets);
            })
            .catch(function(){ cb([]); });
        }

        function isPdfcraftStampPickerOpen(){
          return !!document.getElementById('pdfcraft-stamp-picker');
        }

        function appendStampTile(grid, url, onPick){
          if(!grid || !isValidStampUrl(url)) return;
          var li = document.createElement('li');
          li.className = 'pdfcraft-stamp-tile';
          var img = document.createElement('img');
          img.src = url;
          img.alt = 'Stamp';
          li.appendChild(img);
          li.addEventListener('click', function(evt){
            evt.preventDefault();
            evt.stopPropagation();
            if(onPick(url)) hidePdfcraftStampPicker();
          });
          grid.appendChild(li);
        }

        function renderStampGrid(grid, urls, onPick){
          if(!grid) return;
          grid.innerHTML = '';
          if(!urls || !urls.length){
            var empty = document.createElement('li');
            empty.className = 'pdfcraft-stamp-empty';
            empty.textContent = 'Chưa có mẫu nào.';
            grid.appendChild(empty);
            return;
          }
          for(var i=0;i<urls.length;i++) appendStampTile(grid, urls[i], onPick);
        }

        function bindStampFileInput(input, customGrid){
          if(!input || input.__pdfcraftBound) return;
          input.__pdfcraftBound = true;
          input.addEventListener('change', function(){
            var file = input.files && input.files[0];
            input.value = '';
            if(!file) return;
            if(file.size > STAMP_UPLOAD_MAX){
              alert('Ảnh quá lớn. Tối đa 5 MB.');
              return;
            }
            var reader = new FileReader();
            reader.onload = function(ev){
              var dataUrl = ev.target && ev.target.result;
              if(!addCustomStamp(dataUrl)) return;
              renderStampGrid(customGrid, getCustomStamps(), applyStampImage);
              var panel = document.querySelector('#pdfcraft-stamp-picker .pdfcraft-stamp-picker-panel');
              var customTab = panel && panel.querySelector('[data-stamp-tab="custom"]');
              if(customTab) customTab.click();
            };
            reader.readAsDataURL(file);
          });
        }

        function showPdfcraftStampPicker(){
          if(isPdfcraftStampPickerOpen()) return;
          document.documentElement.classList.add('pdfcraft-stamp-active');
          var root = document.createElement('div');
          root.id = 'pdfcraft-stamp-picker';
          root.className = 'pdfcraft-stamp-picker';
          root.innerHTML =
            '<div class="pdfcraft-stamp-picker-panel" role="dialog" aria-label="Chọn stamp">' +
              '<div class="pdfcraft-stamp-picker-header">' +
                '<h3 class="pdfcraft-stamp-picker-title">Stamp</h3>' +
                '<button type="button" class="pdfcraft-stamp-close" aria-label="Đóng">×</button>' +
              '</div>' +
              '<div class="pdfcraft-stamp-tabs">' +
                '<button type="button" class="pdfcraft-stamp-tab active" data-stamp-tab="preset">Mẫu có sẵn</button>' +
                '<button type="button" class="pdfcraft-stamp-tab" data-stamp-tab="custom">Tùy chỉnh</button>' +
              '</div>' +
              '<div class="pdfcraft-stamp-body">' +
                '<section class="pdfcraft-stamp-section active" data-stamp-panel="preset">' +
                  '<p class="pdfcraft-stamp-section-label">Preset</p>' +
                  '<p class="pdfcraft-stamp-picker-loading">Đang tải mẫu…</p>' +
                  '<ul class="pdfcraft-stamp-grid pdfcraft-stamp-grid-preset"></ul>' +
                '</section>' +
                '<section class="pdfcraft-stamp-section" data-stamp-panel="custom">' +
                  '<button type="button" class="pdfcraft-stamp-upload-btn">' +
                    '<span class="pdfcraft-stamp-upload-icon">+</span>' +
                    '<span class="pdfcraft-stamp-upload-text">Tải ảnh con dấu</span>' +
                    '<span class="pdfcraft-stamp-upload-hint">PNG, JPG, BMP · tối đa 5 MB</span>' +
                  '</button>' +
                  '<input type="file" class="pdfcraft-stamp-file-input" accept="' + STAMP_UPLOAD_ACCEPT + '" />' +
                  '<p class="pdfcraft-stamp-section-label">Ảnh đã tải</p>' +
                  '<ul class="pdfcraft-stamp-grid pdfcraft-stamp-grid-custom"></ul>' +
                '</section>' +
              '</div>' +
            '</div>';
          root.addEventListener('click', function(evt){
            if(evt.target === root) hidePdfcraftStampPicker();
          });
          document.body.appendChild(root);

          var panel = root.querySelector('.pdfcraft-stamp-picker-panel');
          var closeBtn = root.querySelector('.pdfcraft-stamp-close');
          var presetGrid = root.querySelector('.pdfcraft-stamp-grid-preset');
          var customGrid = root.querySelector('.pdfcraft-stamp-grid-custom');
          var fileInput = root.querySelector('.pdfcraft-stamp-file-input');
          var uploadBtn = root.querySelector('.pdfcraft-stamp-upload-btn');
          var loading = root.querySelector('.pdfcraft-stamp-picker-loading');
          var tabBtns = root.querySelectorAll('.pdfcraft-stamp-tab');
          var tabPanels = root.querySelectorAll('.pdfcraft-stamp-section');

          if(closeBtn) closeBtn.addEventListener('click', function(evt){
            evt.stopPropagation();
            hidePdfcraftStampPicker();
          });
          if(panel) panel.addEventListener('click', function(evt){ evt.stopPropagation(); });
          if(uploadBtn && fileInput) uploadBtn.addEventListener('click', function(){
            fileInput.click();
          });
          bindStampFileInput(fileInput, customGrid);
          renderStampGrid(customGrid, getCustomStamps(), applyStampImage);

          for(var t=0;t<tabBtns.length;t++){
            tabBtns[t].addEventListener('click', function(evt){
              var btn = evt.currentTarget;
              var tab = btn.getAttribute('data-stamp-tab');
              for(var i=0;i<tabBtns.length;i++) tabBtns[i].classList.toggle('active', tabBtns[i] === btn);
              for(var j=0;j<tabPanels.length;j++){
                tabPanels[j].classList.toggle('active', tabPanels[j].getAttribute('data-stamp-panel') === tab);
              }
            });
          }

          loadStampPresets(function(presets){
            if(loading) loading.remove();
            renderStampGrid(presetGrid, presets.filter(isValidStampUrl), applyStampImage);
          });
        }

        function sanitizeStampPopImages(){
          var imgs = document.querySelectorAll('.StampPop-Container img, .StampPop img');
          for(var i=0;i<imgs.length;i++){
            var img = imgs[i];
            var src = img.getAttribute('src') || img.currentSrc || img.src || '';
            if(isValidStampUrl(src)) continue;
            img.removeAttribute('src');
            var li = img.closest('li');
            if(li) li.style.display = 'none';
          }
        }

        function pickDefaultStampImage(){
          sanitizeStampPopImages();
          var imgs = document.querySelectorAll('.StampPop-Container img, .StampPop img');
          for(var i=0;i<imgs.length;i++){
            var src = imgs[i].getAttribute('src') || imgs[i].currentSrc || imgs[i].src || '';
            if(isValidStampUrl(src)) return src;
          }
          return null;
        }

        function applyStampImage(stampUrl){
          if(!isValidStampUrl(stampUrl)) return false;
          var ext = getExtension();
          if(!ext || !ext.painter) return false;
          var cfg = resolveToolConfig('stamp');
          var p = ext.painter;
          window.__pdfcraftActiveTool = 'stamp';
          try{
            p.activate(cfg, stampUrl);
            hideStampPop();
            return true;
          }catch(e){ return false; }
        }

        function bindStampPopPicker(){
          if(window.__pdfcraftStampPopBound) return;
          window.__pdfcraftStampPopBound = true;
          document.addEventListener('click', function(evt){
            if(window.__pdfcraftActiveTool !== 'stamp') return;
            var t = evt.target;
            if(!t || !t.closest) return;
            var li = t.closest('.StampPop-Container li, .StampPop li');
            if(!li || li.style.display === 'none') return;
            var img = li.querySelector('img');
            if(!img) return;
            var stampUrl = img.getAttribute('src') || img.currentSrc || img.src || '';
            if(!isValidStampUrl(stampUrl)) return;
            evt.preventDefault();
            evt.stopPropagation();
            applyStampImage(stampUrl);
          }, true);
        }

        function repositionStampPop(){
          sanitizeStampPopImages();
          var wrapper = document.querySelector('.ant-popover.StampPop') ||
            document.querySelector('.ant-dropdown:has(.StampPop-Container)');
          if(!wrapper){
            var pop = document.querySelector('.StampPop-Container, .StampPop');
            if(pop) wrapper = pop.closest('.ant-popover') || pop.closest('.ant-dropdown') || pop.parentElement;
          }
          if(wrapper && wrapper !== document.body && wrapper !== document.documentElement){
            wrapper.style.position = 'fixed';
            wrapper.style.top = '50%';
            wrapper.style.left = '50%';
            wrapper.style.transform = 'translate(-50%,-50%)';
            wrapper.style.zIndex = '10050';
            return true;
          }
          return false;
        }

        function releaseStampPlacement(){
          if(window.__pdfcraftStampReleasing) return;
          window.__pdfcraftStampReleasing = true;
          hidePdfcraftStampPicker();
          window.__pdfcraftActiveTool = 'select';
          var ext = getExtension();
          if(ext && ext.painter){
            var p = ext.painter;
            try{
              if(typeof p.clearTempDataTransfer === 'function') p.clearTempDataTransfer();
              else p.tempDataTransfer = null;
            }catch(e){}
            try{
              if(typeof p.__pdfcraftOrigDefault === 'function') p.__pdfcraftOrigDefault();
            }catch(e){}
          }
          try{ window.parent.postMessage({ type:'pdfcraft-tool-changed', tool:'select' }, '*'); }catch(e){}
          setTimeout(function(){ window.__pdfcraftStampReleasing = false; }, 300);
        }

        function activateStampPlacement(){
          if(window.__pdfcraftStampOpening && Date.now() - window.__pdfcraftStampOpening < 400) return true;
          window.__pdfcraftStampOpening = Date.now();
          var ext = getExtension();
          if(!ext || !ext.painter) return false;
          bindStampPopPicker();
          window.__pdfcraftActiveTool = 'stamp';
          try{
            if(typeof ext.painter.clearTempDataTransfer === 'function') ext.painter.clearTempDataTransfer();
            else ext.painter.tempDataTransfer = null;
          }catch(e){}
          if(!isPdfcraftStampPickerOpen()) showPdfcraftStampPicker();
          try{ window.parent.postMessage({ type:'pdfcraft-tool-changed', tool:'stamp' }, '*'); }catch(e){}
          return true;
        }

        function applyFreeTextStyleToPainter(){
          var ext = getExtension();
          if(!ext || !ext.painter) return;
          var ann = ext.painter.currentAnnotation;
          if(!ann || ann.name !== 'freeText') return;
          var st = window.__pdfcraftFreeTextStyle || {};
          ann.style = ann.style || {};
          if(st.color) ann.style.color = st.color;
          if(st.fontSize) ann.style.fontSize = st.fontSize;
          if(st.fontFamily) ann.style.fontFamily = st.fontFamily;
        }

        function patchFreeTextEditorInput(editor){
          if(!editor || editor.__pdfcraftInputPatched) return;
          editor.__pdfcraftInputPatched = true;
          var origDone = editor.inputDoneHandler;
          if(typeof origDone !== 'function') return;
          editor.inputDoneHandler = function(){
            var args = arguments;
            var textValue = args[0];
            var done = origDone.apply(this, args);
            var applyFont = function(){
              try{
                var family = (window.__pdfcraftFreeTextStyle && window.__pdfcraftFreeTextStyle.fontFamily) || 'Arial';
                var nodes = editor.getNodesByClassName && editor.getNodesByClassName('Text');
                if(nodes && nodes.length){
                  for(var i=0;i<nodes.length;i++){ nodes[i].fontFamily(family); }
                  if(editor.konvaStage && editor.konvaStage.batchDraw) editor.konvaStage.batchDraw();
                }
              }catch(e){}
              if(textValue && String(textValue).trim()){
                window.__pdfcraftSkipFreeTextReactivate = true;
                window.setTimeout(releaseFreeTextTool, 100);
              }
            };
            if(done && typeof done.then === 'function') done.then(applyFont);
            else applyFont();
            return done;
          };
        }

        function patchFreeTextEditors(painter){
          if(!painter || painter.__pdfcraftEditorsPatched) return;
          painter.__pdfcraftEditorsPatched = true;
          var origEnable = painter.enableEditor;
          if(typeof origEnable !== 'function') return;
          painter.enableEditor = function(ctx){
            origEnable.call(painter, ctx);
            try{
              if(!ctx || !ctx.annotation || ctx.annotation.type !== FREETEXT_TYPE) return;
              var editor = painter.findEditor(ctx.pageNumber, FREETEXT_TYPE);
              patchFreeTextEditorInput(editor);
            }catch(e){}
          };
        }

        function hookExtensionPainter(){
          var ext = getExtension();
          if(!ext || !ext.painter || ext.painter.__pdfcraftHooked) return !!ext;
          var p = ext.painter;
          p.__pdfcraftHooked = true;
          var origSelect = p.selectAnnotation.bind(p);
          p.selectAnnotation = function(id){
            if(window.__pdfcraftActiveTool === 'freeText') return;
            origSelect(id);
            var ann = findAnnotationById(id);
            var isNote = ann && (ann.pdfjsType === NOTE_PDFJS_TYPE || ann.type === NOTE_PDFJS_TYPE || ann.subtype === 'Text');
            if(isNote){
              setTimeout(function(){ showPdfcraftNoteEditor(ann); }, 60);
            }
          };
          var origDefault = p.setDefaultMode.bind(p);
          p.__pdfcraftOrigDefault = origDefault;
          p.setDefaultMode = function(){
            if(window.__pdfcraftActiveTool === 'freeText' && !window.__pdfcraftSkipFreeTextReactivate){
              setTimeout(function(){ activateTool('freeText'); }, 40);
              return;
            }
            if(window.__pdfcraftActiveTool === 'note' && !window.__pdfcraftSkipNoteReactivate){
              setTimeout(function(){ activateTool('note'); }, 40);
              return;
            }
            if(window.__pdfcraftActiveTool === 'stamp' || window.__pdfcraftActiveTool === 'signature'){
              releaseStampPlacement();
              return;
            }
            window.__pdfcraftActiveTool = 'select';
            origDefault();
            try{ window.parent.postMessage({ type:'pdfcraft-tool-changed', tool:'select' }, '*'); }catch(e){}
          };
          if(!p.__pdfcraftSavePatched){
            p.__pdfcraftSavePatched = true;
            var origSave = p.saveToStore.bind(p);
            p.saveToStore = function(ann, silent){
              var isStampPlaced = ann && (
                ann.type === STAMP_TYPE || ann.subtype === 'Stamp' || ann.name === 'stamp' ||
                ann.type === SIGNATURE_TYPE || ann.subtype === 'Caret' || ann.name === 'signature'
              );
              if(isStampPlaced && window.__pdfcraftStampPlacedAt && Date.now() - window.__pdfcraftStampPlacedAt < 400){
                return;
              }
              if(isStampPlaced && (window.__pdfcraftActiveTool === 'stamp' || window.__pdfcraftActiveTool === 'signature')){
                window.__pdfcraftStampPlacedAt = Date.now();
              }
              var ret = origSave(ann, silent);
              try{
                if(window.__pdfcraftActiveTool === 'note' && ann && ann.id && (ann.pdfjsType === NOTE_PDFJS_TYPE || ann.type === NOTE_PDFJS_TYPE)){
                  setTimeout(function(){
                    setNotePanelVisible(true);
                    openNoteEditorForId(ann.id);
                  }, 80);
                }
                if(isStampPlaced && (window.__pdfcraftActiveTool === 'stamp' || window.__pdfcraftActiveTool === 'signature')){
                  setTimeout(releaseStampPlacement, 50);
                }
              }catch(e){}
              return ret;
            };
          }
          patchFreeTextEditors(p);
          if(!p.__pdfcraftStampPatched){
            p.__pdfcraftStampPatched = true;
            var origActivate = p.activate.bind(p);
            p.activate = function(cfg, url){
              if(url !== undefined && isInvalidMediaUrl(url)){
                if(typeof p.clearTempDataTransfer === 'function') p.clearTempDataTransfer();
                return origActivate(cfg);
              }
              var stampKey = (cfg && cfg.type) + '|' + String(url || '');
              var now = Date.now();
              if(stampKey && p.__pdfcraftLastActivateKey === stampKey && now - (p.__pdfcraftLastActivateAt || 0) < 250){
                return;
              }
              p.__pdfcraftLastActivateKey = stampKey;
              p.__pdfcraftLastActivateAt = now;
              return origActivate(cfg, url);
            };
            if(typeof p.saveTempDataTransfer === 'function'){
              var origSaveTemp = p.saveTempDataTransfer.bind(p);
              p.saveTempDataTransfer = function(url){
                if(isInvalidMediaUrl(url)){
                  if(typeof p.clearTempDataTransfer === 'function') return p.clearTempDataTransfer();
                  p.tempDataTransfer = null;
                  return null;
                }
                return origSaveTemp(url);
              };
            }
          }
          if(!p.__pdfcraftEnablePatched){
            p.__pdfcraftEnablePatched = true;
            var origEnableEditor = p.enableEditor.bind(p);
            p.enableEditor = function(ctx){
              if(ctx && ctx.annotation && isInvalidMediaUrl(p.tempDataTransfer)){
                if(ctx.annotation.type === STAMP_TYPE){
                  bindStampPopPicker();
                  if(!isPdfcraftStampPickerOpen()) showPdfcraftStampPicker();
                  return;
                }
                if(ctx.annotation.type === SIGNATURE_TYPE){
                  clickToolLi('signature');
                  return;
                }
              }
              return origEnableEditor(ctx);
            };
          }
          return true;
        }

        function startStampPopObserver(){
          if(window.__pdfcraftStampObs) return;
          window.__pdfcraftStampObs = new MutationObserver(function(){ sanitizeStampPopImages(); });
          window.__pdfcraftStampObs.observe(document.documentElement, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['src']
          });
        }
        startStampPopObserver();

        var hookTimer = setInterval(function(){
          if(hookExtensionPainter()) clearInterval(hookTimer);
        }, 250);

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

        function resolveToolConfig(toolName){
          if(toolName === 'freeText') return mergeFreeTextConfig(TOOL_CONFIGS.freeText);
          if(toolName === 'note') return mergeNoteConfig(TOOL_CONFIGS.note);
          return TOOL_CONFIGS[toolName];
        }

        function activateMarkupTool(toolName){
          var ext = getExtension();
          if(!ext || !ext.painter) return false;
          var cfg = resolveToolConfig(toolName);
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

        function isToolbarColorPickerLi(li){
          if(!li) return false;
          return !!(
            li.querySelector('.ant-color-picker') ||
            li.querySelector('[class*="colorPicker"]') ||
            li.classList.contains('disabled') && li.querySelector('.icon [class*="Color"]')
          );
        }

        var TOOL_LABEL_MAP = {
          highlight:'highlight', underline:'underline', strikeout:'strikeout',
          freehand:'freehand', rectangle:'rectangle', circle:'circle',
          freeText:'text', note:'note', stamp:'stamp', signature:'signature',
          select:'select', freeHighlight:'free highlight', arrow:'arrow', cloud:'cloud'
        };

        function getToolLi(toolName){
          var idx = TOOL_ORDER.indexOf(toolName);
          var ul = document.querySelector('.CustomToolbar ul.buttons');
          if(ul && idx >= 0){
            var byIdx = ul.querySelectorAll(':scope > li')[idx];
            if(byIdx) return byIdx;
          }
          var label = TOOL_LABEL_MAP[toolName];
          if(!label || !ul) return null;
          var items = ul.querySelectorAll(':scope > li');
          for(var i=0;i<items.length;i++){
            var txt = (items[i].textContent||'').trim().toLowerCase();
            if(txt === label || txt.indexOf(label) !== -1) return items[i];
          }
          return null;
        }

        function getFirstToolbarItems(){
          var ul = document.querySelector('.CustomToolbar ul.buttons');
          if(!ul) return null;
          return ul.querySelectorAll(':scope > li');
        }

        function clickToolLi(toolName){
          var li = getToolLi(toolName);
          if(!li || li.classList.contains('disabled')) return false;
          if(typeof li.click === 'function') li.click();
          else li.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, view:window }));
          return true;
        }

        function tryClickTool(toolName){
          return clickToolLi(toolName);
        }

        function activateViaToolbarRef(toolName){
          var ext = getExtension();
          if(!ext || !ext.customToolbarRef || !ext.customToolbarRef.current) return false;
          var cfg = resolveToolConfig(toolName);
          if(!cfg) return false;
          try{
            ext.customToolbarRef.current.activeAnnotation(cfg);
            return true;
          }catch(e){
            return false;
          }
        }

        function openStampSignatureCreator(toolName){
          if(toolName === 'stamp') return activateStampPlacement();
          return clickToolLi(toolName);
        }

        function activateNoteStampSignature(toolName){
          hookExtensionPainter();
          var ext = getExtension();
          var cfg = resolveToolConfig(toolName);
          if(!cfg) return false;
          var viaRef = activateViaToolbarRef(toolName);
          if(toolName === 'note'){
            setNotePanelVisible(true);
            var clicked = clickToolLi('note');
            if(ext && ext.painter){
              try{ ext.painter.activate(cfg, null); }catch(e){}
            }
            return !!(ext && ext.painter) || clicked || viaRef;
          }
          if(toolName === 'stamp'){
            return activateStampPlacement();
          }
          if(toolName === 'signature'){
            if(ext && ext.painter){
              try{ ext.painter.activate(cfg, null); }catch(e){}
            }
            return clickToolLi('signature') || viaRef;
          }
          return false;
        }

        function syncFreeTextStyleFromModal(){
          var st = window.__pdfcraftFreeTextStyle || {};
          var root = document.querySelector('.EditorFreeText-Modal');
          if(!root) return;
          var row = root.querySelector('.pdfcraft-ft-style-row');
          if(row){
            var fontSel = row.querySelector('[data-pdfcraft-font]');
            var sizeSel = row.querySelector('[data-pdfcraft-size]');
            if(fontSel && fontSel.value) st.fontFamily = fontSel.value;
            if(sizeSel && sizeSel.value) st.fontSize = Number(sizeSel.value);
          }
          var activeCell = root.querySelector('.colorPalette .cell.active span');
          if(activeCell && activeCell.style && activeCell.style.backgroundColor){
            st.color = activeCell.style.backgroundColor;
          }
          window.__pdfcraftFreeTextStyle = st;
          applyFreeTextStyleToPainter();
        }

        function releaseFreeTextTool(){
          window.__pdfcraftSkipFreeTextReactivate = true;
          window.__pdfcraftActiveTool = 'select';
          setTool('select');
          try{ window.parent.postMessage({ type:'pdfcraft-tool-changed', tool:'select' }, '*'); }catch(e){}
          window.setTimeout(function(){ window.__pdfcraftSkipFreeTextReactivate = false; }, 400);
        }

        function layoutFreeTextToolbar(toolbar){
          if(!toolbar) return;
          var children = toolbar.children;
          for(var i=0;i<children.length;i++){
            var ch = children[i];
            if(ch.classList && (ch.classList.contains('pdfcraft-ft-style-row') || ch.classList.contains('colorPalette'))) continue;
            ch.style.display = 'none';
          }
          var palette = toolbar.querySelector('.colorPalette');
          if(palette){
            palette.style.margin = '0 auto';
            palette.style.flexWrap = 'nowrap';
            palette.style.gap = '6px';
            palette.style.justifyContent = 'center';
          }
        }

        function applyFreeTextModalLayout(confirmEl){
          if(!confirmEl) return;
          confirmEl.classList.add('pdfcraft-freetext-dialog');
          var content = confirmEl.querySelector('.ant-modal-content');
          var btns = confirmEl.querySelector('.ant-modal-confirm-btns');
          var input = confirmEl.querySelector('textarea, .ant-input');
          if(content){
            content.style.setProperty('display', 'flex', 'important');
            content.style.setProperty('flex-direction', 'column', 'important');
            content.style.setProperty('box-sizing', 'border-box', 'important');
            content.style.setProperty('padding', '20px', 'important');
          }
          if(btns){
            btns.style.setProperty('display', 'flex', 'important');
            btns.style.setProperty('justify-content', 'flex-end', 'important');
            btns.style.setProperty('align-items', 'center', 'important');
            btns.style.setProperty('width', '100%', 'important');
            btns.style.setProperty('max-width', '100%', 'important');
            btns.style.setProperty('margin', '16px 0 0 0', 'important');
            btns.style.setProperty('padding', '0', 'important');
            btns.style.setProperty('box-sizing', 'border-box', 'important');
            btns.style.setProperty('float', 'none', 'important');
            var btnEls = btns.querySelectorAll('.ant-btn, button');
            for(var b=0;b<btnEls.length;b++){
              btnEls[b].style.setProperty('margin', '0', 'important');
              btnEls[b].style.setProperty('float', 'none', 'important');
            }
          }
          if(input){
            input.style.setProperty('width', '100%', 'important');
            input.style.setProperty('max-width', '100%', 'important');
            input.style.setProperty('box-sizing', 'border-box', 'important');
          }
        }

        function enhanceFreeTextModal(){
          var root = document.querySelector('.EditorFreeText-Modal');
          if(!root || root.getAttribute('data-pdfcraft-enhanced')) return;
          root.setAttribute('data-pdfcraft-enhanced', '1');
          var toolbar = root.querySelector('.EditorFreeText-Modal-Toolbar');
          if(!toolbar) return;
          if(toolbar.querySelector('.pdfcraft-ft-style-row')) return;

          var st = window.__pdfcraftFreeTextStyle || {};
          var row = document.createElement('div');
          row.className = 'pdfcraft-ft-style-row';

          var fontSel = document.createElement('select');
          fontSel.setAttribute('data-pdfcraft-font', '1');
          FREE_TEXT_FONTS.forEach(function(f){
            var opt = document.createElement('option');
            opt.value = f.value;
            opt.textContent = f.label;
            if((st.fontFamily || 'Arial') === f.value) opt.selected = true;
            fontSel.appendChild(opt);
          });
          fontSel.addEventListener('change', function(){
            window.__pdfcraftFreeTextStyle = window.__pdfcraftFreeTextStyle || {};
            window.__pdfcraftFreeTextStyle.fontFamily = fontSel.value;
            applyFreeTextStyleToPainter();
          });

          var sizeSel = document.createElement('select');
          sizeSel.setAttribute('data-pdfcraft-size', '1');
          FREE_TEXT_FONT_SIZES.forEach(function(sz){
            var opt = document.createElement('option');
            opt.value = String(sz);
            opt.textContent = String(sz);
            if(Number(st.fontSize || 14) === sz) opt.selected = true;
            sizeSel.appendChild(opt);
          });
          sizeSel.addEventListener('change', function(){
            window.__pdfcraftFreeTextStyle = window.__pdfcraftFreeTextStyle || {};
            window.__pdfcraftFreeTextStyle.fontSize = Number(sizeSel.value);
            applyFreeTextStyleToPainter();
            var title = document.querySelector('.ant-modal-confirm-title, .ant-modal-title');
            if(title) title.textContent = 'Text-' + sizeSel.value + 'px';
          });

          row.appendChild(fontSel);
          row.appendChild(sizeSel);
          toolbar.insertBefore(row, toolbar.firstChild);

          var palette = toolbar.querySelector('.colorPalette');
          if(palette){
            FREE_TEXT_COLORS_EXTRA.forEach(function(hex){
              var cell = document.createElement('div');
              cell.className = 'cell';
              cell.innerHTML = '<span style="background-color:' + hex + '"></span>';
              cell.addEventListener('click', function(){
                palette.querySelectorAll('.cell').forEach(function(c){ c.classList.remove('active'); });
                cell.classList.add('active');
                window.__pdfcraftFreeTextStyle = window.__pdfcraftFreeTextStyle || {};
                window.__pdfcraftFreeTextStyle.color = hex;
                applyFreeTextStyleToPainter();
              });
              palette.appendChild(cell);
            });
          }

          layoutFreeTextToolbar(toolbar);

          var confirmRoot = root.closest('.ant-modal-confirm') || root.closest('.ant-modal');
          applyFreeTextModalLayout(confirmRoot);

          var modal = confirmRoot || root.closest('.ant-modal');
          if(modal){
            var okBtn = modal.querySelector('.ant-btn-primary');
            if(okBtn && !okBtn.getAttribute('data-pdfcraft-ok')){
              okBtn.setAttribute('data-pdfcraft-ok', '1');
              okBtn.addEventListener('click', function(){
                syncFreeTextStyleFromModal();
                window.__pdfcraftSkipFreeTextReactivate = true;
                window.setTimeout(releaseFreeTextTool, 120);
              }, true);
            }
          }
        }

        var freeTextModalObserver = new MutationObserver(function(){
          enhanceFreeTextModal();
          var ftRoot = document.querySelector('.EditorFreeText-Modal');
          if(ftRoot){
            var cr = ftRoot.closest('.ant-modal-confirm') || ftRoot.closest('.ant-modal');
            applyFreeTextModalLayout(cr);
          }
        });
        freeTextModalObserver.observe(document.documentElement, { childList:true, subtree:true });

        function activateExtensionTool(toolName){
          var ext = getExtension();
          if(!ext || !ext.painter) return false;
          var cfg = resolveToolConfig(toolName);
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
          hookExtensionPainter();
          if(EXTENSION_CLICK_TOOLS[toolName]) return activateNoteStampSignature(toolName);
          var ext = getExtension();
          if(!ext || !ext.painter) return tryClickTool(toolName);
          var cfg = resolveToolConfig(toolName);
          if(!cfg) return false;
          try{
            if(toolName === 'freeText') applyFreeTextStyleToPainter();
            if(ext.customToolbarRef && ext.customToolbarRef.current && typeof ext.customToolbarRef.current.activeAnnotation === 'function'){
              ext.customToolbarRef.current.activeAnnotation(cfg);
            }
            ext.painter.activate(cfg, null);
            if(toolName === 'freeText'){
              try{
                var page = ext.painter.pdfViewerApplication && ext.painter.pdfViewerApplication.page;
                var editor = ext.painter.findEditor(page, FREETEXT_TYPE);
                patchFreeTextEditorInput(editor);
              }catch(e){}
            }
            return true;
          }catch(e){
            return tryClickTool(toolName);
          }
        }

        function clearAllAnnotations(){
          var ext = getExtension();
          if(!ext || !ext.painter) return false;
          var p = ext.painter;
          var idMap = {};
          try{
            var data = p.getData();
            var list = Array.isArray(data) ? data : Object.values(data || {});
            for(var i=0;i<list.length;i++){
              if(list[i] && list[i].id) idMap[list[i].id] = true;
            }
          }catch(e){}
          try{
            if(p.store && p.store.annotationStore && typeof p.store.annotationStore.forEach === 'function'){
              p.store.annotationStore.forEach(function(ann, id){
                if(id) idMap[id] = true;
                else if(ann && ann.id) idMap[ann.id] = true;
              });
            }
          }catch(e){}
          var ids = Object.keys(idMap);
          for(var j=0;j<ids.length;j++){
            try{ p.deleteAnnotation(ids[j], true); }catch(e){}
          }
          try{
            if(ext.customCommentRef && ext.customCommentRef.current){
              if(typeof ext.customCommentRef.current.clearAll === 'function'){
                ext.customCommentRef.current.clearAll();
              } else if(typeof ext.customCommentRef.current.reset === 'function'){
                ext.customCommentRef.current.reset();
              }
            }
          }catch(e){}
          window.__pdfcraftActiveTool = 'select';
          try{
            if(typeof p.setDefaultMode === 'function') p.setDefaultMode();
          }catch(e){}
          try{
            if(p.konvaCanvasStore && typeof p.konvaCanvasStore.forEach === 'function'){
              p.konvaCanvasStore.forEach(function(canvas){
                if(canvas && canvas.pageNumber && typeof p.reDrawAnnotation === 'function'){
                  p.reDrawAnnotation(canvas.pageNumber);
                }
              });
            }
          }catch(e){}
          notifyDirty();
          return true;
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
            var isSelect = toolName === 'select';
            var isMarkup = !!TEXT_MARKUP[toolName];
            setTextMarkupMode(isMarkup);
            if(isSelect){
              hidePdfcraftStampPicker();
              setAnnotating(document.documentElement.classList.contains('pdfcraft-annotations-visible'));
              activateEditorMode(0);
              updateMarkupToolbarSelection('');
              setNotePanelVisible(false);
            } else {
              if(toolName !== 'select') document.documentElement.classList.add('pdfcraft-annotations-visible');
              setAnnotating(true);
              setNotePanelVisible(toolName === 'note');
            }
            if(!activateTool(toolName)) return false;
            window.__pdfcraftActiveTool = toolName;
            if(isMarkup) updateMarkupToolbarSelection(toolName);
            return true;
          }catch(e){
            return false;
          }
        }

        function setToolWithRetry(toolName){
          if(toolName === 'stamp' && isPdfcraftStampPickerOpen() && window.__pdfcraftActiveTool === 'stamp') return;
          if(setTool(toolName)) return;
          var tries = 0;
          var timer = setInterval(function(){
            tries += 1;
            if(toolName === 'stamp' && isPdfcraftStampPickerOpen()) { clearInterval(timer); return; }
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
        window.pdfcraftClearAllAnnotations = clearAllAnnotations;
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
          if(!data) return;
          if(data.type === 'pdfcraft-set-freetext-style' && data.style && typeof data.style === 'object'){
            window.__pdfcraftFreeTextStyle = Object.assign({}, window.__pdfcraftFreeTextStyle || {}, data.style);
            applyFreeTextStyleToPainter();
            if(window.__pdfcraftActiveTool === 'freeText') activateTool('freeText');
            return;
          }
          if(data.type === 'pdfcraft-clear-annotations'){
            clearAllAnnotations();
            setTool('select');
            try{ window.parent.postMessage({ type:'pdfcraft-tool-changed', tool:'select' }, '*'); }catch(e){}
            return;
          }
          if(data.type !== 'pdfcraft-set-annotation-tool') return;
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

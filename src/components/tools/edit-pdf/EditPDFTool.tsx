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
          'rectangle','circle','arrow','cloud',
          'freehand','freeHighlight','freeText','signature','stamp'
        ];
        var EXTENSION_TOOL_ORDER = [
          'select','highlight','strikeout','underline',
          'rectangle','circle','note','arrow','cloud',
          'freehand','freeHighlight','freeText','signature','stamp'
        ];
        var TOOL_SET = {};
        TOOL_ORDER.forEach(function(n){ TOOL_SET[n] = true; });

        var TEXT_MARKUP = { highlight:1, underline:1, strikeout:1 };
        var EXTENSION_CLICK_TOOLS = { stamp:1, signature:1 };
        var STAMP_TYPE = 10;
        var SIGNATURE_TYPE = 9;
        var FREETEXT_TYPE = 4;
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
          if(window.__pdfcraftStampReleaseTimer){
            clearTimeout(window.__pdfcraftStampReleaseTimer);
            window.__pdfcraftStampReleaseTimer = null;
          }
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

        function isPlacementAnnotation(ann){
          if(!ann) return false;
          return ann.type === STAMP_TYPE || ann.type === SIGNATURE_TYPE ||
            ann.subtype === 'Stamp' || ann.subtype === 'Caret' ||
            ann.name === 'stamp' || ann.name === 'signature';
        }

        function deactivatePlacementEditors(p){
          if(!p) return;
          try{
            if(typeof p.disablePainting === 'function') p.disablePainting();
            else if(typeof p.clearTempDataTransfer === 'function') p.clearTempDataTransfer();
            else p.tempDataTransfer = null;
          }catch(e){}
          try{
            if(p.editorStore && typeof p.editorStore.forEach === 'function'){
              p.editorStore.forEach(function(editor){
                try{
                  if(typeof editor.disableEditMode === 'function') editor.disableEditMode();
                  if('stampUrl' in editor) editor.stampUrl = null;
                  if('signatureUrl' in editor) editor.signatureUrl = null;
                }catch(e){}
              });
            }
          }catch(e){}
        }

        function finishReleaseStampPlacement(){
          hidePdfcraftStampPicker();
          window.__pdfcraftActiveTool = 'select';
          var ext = getExtension();
          if(ext && ext.painter){
            var p = ext.painter;
            deactivatePlacementEditors(p);
            try{ p.__pdfcraftLastActivateKey = null; p.__pdfcraftLastActivateAt = 0; }catch(e){}
            try{
              var selectCfg = resolveToolConfig('select');
              if(selectCfg) p.activate(selectCfg, null);
            }catch(e){}
          }
          try{
            setAnnotating(document.documentElement.classList.contains('pdfcraft-annotations-visible'));
            setTextMarkupMode(false);
            activateEditorMode(0);
          }catch(e){}
          try{ window.parent.postMessage({ type:'pdfcraft-tool-changed', tool:'select' }, '*'); }catch(e){}
        }

        function scheduleReleaseStampPlacement(){
          if(window.__pdfcraftStampReleaseTimer) clearTimeout(window.__pdfcraftStampReleaseTimer);
          window.__pdfcraftStampReleaseTimer = setTimeout(function(){
            window.__pdfcraftStampReleaseTimer = null;
            finishReleaseStampPlacement();
          }, 50);
        }

        function releaseStampPlacement(){
          scheduleReleaseStampPlacement();
        }

        function activateStampPlacement(){
          if(window.__pdfcraftStampReleaseTimer){
            clearTimeout(window.__pdfcraftStampReleaseTimer);
            window.__pdfcraftStampReleaseTimer = null;
          }
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

        function hideSignaturePop(){
          var pops = document.querySelectorAll('.ant-popover.SignaturePop, .SignaturePop');
          for(var i=0;i<pops.length;i++){
            try{ pops[i].style.display = 'none'; }catch(e){}
          }
        }

        function repositionSignaturePop(){
          var wrapper = document.querySelector('.ant-popover.SignaturePop');
          if(!wrapper){
            var inner = document.querySelector('.SignaturePop-Container');
            if(inner) wrapper = inner.closest('.ant-popover') || inner.closest('.ant-dropdown');
          }
          if(wrapper){
            wrapper.style.position = 'fixed';
            wrapper.style.top = '50%';
            wrapper.style.left = '50%';
            wrapper.style.transform = 'translate(-50%,-50%)';
            wrapper.style.zIndex = '10050';
            wrapper.style.display = '';
            wrapper.style.pointerEvents = 'auto';
            return true;
          }
          return false;
        }

        function openSignatureToolbarPopover(){
          var li = getToolLi('signature');
          if(!li) return false;
          var trigger = li.querySelector('.icon') || li.querySelector('.name') || li;
          if(trigger && typeof trigger.click === 'function'){
            trigger.click();
            return true;
          }
          return false;
        }

        function applySignatureImage(sigUrl){
          if(!isValidStampUrl(sigUrl)) return false;
          var ext = getExtension();
          if(!ext || !ext.painter) return false;
          var cfg = resolveToolConfig('signature');
          window.__pdfcraftActiveTool = 'signature';
          try{
            ext.painter.activate(cfg, sigUrl);
            hideSignaturePop();
            return true;
          }catch(e){ return false; }
        }

        function bindSignaturePopPicker(){
          if(window.__pdfcraftSignaturePopBound) return;
          window.__pdfcraftSignaturePopBound = true;
          document.addEventListener('click', function(evt){
            if(window.__pdfcraftActiveTool !== 'signature') return;
            var t = evt.target;
            if(!t || !t.closest) return;
            var img = t.closest('.SignaturePop-Container img') || (t.tagName === 'IMG' && t.closest('.SignaturePop') ? t : null);
            if(!img) return;
            var sigUrl = img.getAttribute('src') || img.currentSrc || img.src || '';
            if(!isValidStampUrl(sigUrl)) return;
            evt.preventDefault();
            evt.stopPropagation();
            applySignatureImage(sigUrl);
          }, true);
        }

        function finishReleaseSignaturePlacement(){
          hideSignaturePop();
          window.__pdfcraftActiveTool = 'select';
          var ext = getExtension();
          if(ext && ext.painter){
            deactivatePlacementEditors(ext.painter);
            try{
              var selectCfg = resolveToolConfig('select');
              if(selectCfg) ext.painter.activate(selectCfg, null);
            }catch(e){}
          }
          try{
            setAnnotating(document.documentElement.classList.contains('pdfcraft-annotations-visible'));
            setTextMarkupMode(false);
            activateEditorMode(0);
          }catch(e){}
          try{ window.parent.postMessage({ type:'pdfcraft-tool-changed', tool:'select' }, '*'); }catch(e){}
        }

        function scheduleReleaseSignaturePlacement(){
          if(window.__pdfcraftSignatureReleaseTimer) clearTimeout(window.__pdfcraftSignatureReleaseTimer);
          window.__pdfcraftSignatureReleaseTimer = setTimeout(function(){
            window.__pdfcraftSignatureReleaseTimer = null;
            finishReleaseSignaturePlacement();
          }, 50);
        }

        function releaseSignaturePlacement(){
          scheduleReleaseSignaturePlacement();
        }

        function activateSignaturePlacement(){
          hookExtensionPainter();
          var ext = getExtension();
          if(!ext || !ext.painter) return false;
          bindSignaturePopPicker();
          window.__pdfcraftActiveTool = 'signature';
          document.documentElement.classList.add('pdfcraft-annotations-visible');
          setAnnotating(true);
          try{
            if(typeof ext.painter.clearTempDataTransfer === 'function') ext.painter.clearTempDataTransfer();
            else ext.painter.tempDataTransfer = null;
          }catch(e){}
          if(!openSignatureToolbarPopover()) activateViaToolbarRef('signature');
          var tries = 0;
          var timer = setInterval(function(){
            tries += 1;
            if(repositionSignaturePop() || tries >= 24) clearInterval(timer);
          }, 100);
          try{ window.parent.postMessage({ type:'pdfcraft-tool-changed', tool:'signature' }, '*'); }catch(e){}
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

        function ensureWebSelection(){
          var ext = getExtension();
          if(!ext || !ext.painter) return;
          var ws = ext.painter.webSelection;
          if(!ws || ws.highlighterObj) return;
          var root = ext.$PDFJS_viewerContainer || document.getElementById('viewer');
          if(root && typeof ext.painter.initWebSelection === 'function'){
            ext.painter.initWebSelection(root);
          }
        }

        function hookExtensionPainter(){
          var ext = getExtension();
          if(!ext || !ext.painter || ext.painter.__pdfcraftHooked) return !!ext;
          var p = ext.painter;
          p.__pdfcraftHooked = true;
          ensureWebSelection();
          var origSelect = p.selectAnnotation.bind(p);
          p.selectAnnotation = function(id){
            if(window.__pdfcraftActiveTool === 'freeText') return;
            origSelect(id);
          };
          var origDefault = p.setDefaultMode.bind(p);
          p.__pdfcraftOrigDefault = origDefault;
          p.setDefaultMode = function(){
            if(window.__pdfcraftActiveTool === 'freeText' && !window.__pdfcraftSkipFreeTextReactivate){
              setTimeout(function(){ activateTool('freeText'); }, 40);
              return;
            }
            if(window.__pdfcraftActiveTool === 'stamp'){
              scheduleReleaseStampPlacement();
              return;
            }
            if(window.__pdfcraftActiveTool === 'signature'){
              scheduleReleaseSignaturePlacement();
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
                ann.type === STAMP_TYPE || ann.subtype === 'Stamp' || ann.name === 'stamp'
              );
              var isSignaturePlaced = ann && (
                ann.type === SIGNATURE_TYPE || ann.subtype === 'Caret' || ann.name === 'signature'
              );
              if(isStampPlaced && ann.id && window.__pdfcraftStampSaveId === ann.id && Date.now() - (window.__pdfcraftStampSaveAt || 0) < 400){
                return;
              }
              if(isSignaturePlaced && ann.id && window.__pdfcraftSignatureSaveId === ann.id && Date.now() - (window.__pdfcraftSignatureSaveAt || 0) < 450){
                return;
              }
              var ret = origSave(ann, silent);
              try{
                if(isStampPlaced){
                  if(ann.id){
                    window.__pdfcraftStampSaveId = ann.id;
                    window.__pdfcraftStampSaveAt = Date.now();
                  }
                  deactivatePlacementEditors(p);
                  scheduleReleaseStampPlacement();
                }
                if(isSignaturePlaced){
                  if(ann.id){
                    window.__pdfcraftSignatureSaveId = ann.id;
                    window.__pdfcraftSignatureSaveAt = Date.now();
                  }
                  deactivatePlacementEditors(p);
                  scheduleReleaseSignaturePlacement();
                }
              }catch(e){}
              scheduleHistoryPush();
              return ret;
            };
          }
          if(!p.__pdfcraftUpdatePatched && typeof p.updateStore === 'function'){
            p.__pdfcraftUpdatePatched = true;
            var origUpdateStore = p.updateStore.bind(p);
            p.updateStore = function(id, data){
              var ret = origUpdateStore(id, data);
              scheduleHistoryPush();
              return ret;
            };
          }
          if(!p.__pdfcraftDeletePatched && typeof p.deleteAnnotation === 'function'){
            p.__pdfcraftDeletePatched = true;
            var origDeleteAnnotation = p.deleteAnnotation.bind(p);
            p.deleteAnnotation = function(id, silent){
              var ret = origDeleteAnnotation(id, silent);
              scheduleHistoryPush();
              return ret;
            };
          }
          ensureAnnotationHistoryBaseline();
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
              var ret = origActivate(cfg, url);
              if(cfg && cfg.name === 'signature' && url && isValidStampUrl(url)){
                hideSignaturePop();
                window.__pdfcraftActiveTool = 'signature';
              }
              return ret;
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
              if(ctx && ctx.annotation && isPlacementAnnotation(ctx.annotation)){
                if(window.__pdfcraftActiveTool !== 'stamp' && window.__pdfcraftActiveTool !== 'signature'){
                  return;
                }
              }
              if(ctx && ctx.annotation && isInvalidMediaUrl(p.tempDataTransfer)){
                if(ctx.annotation.type === STAMP_TYPE){
                  bindStampPopPicker();
                  if(!isPdfcraftStampPickerOpen()) showPdfcraftStampPicker();
                  return;
                }
                if(ctx.annotation.type === SIGNATURE_TYPE){
                  activateSignaturePlacement();
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
          return TOOL_CONFIGS[toolName];
        }

        function activateMarkupTool(toolName){
          var ext = getExtension();
          if(!ext || !ext.painter) return false;
          ensureWebSelection();
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
          freeText:'text', stamp:'stamp', signature:'signature',
          select:'select', freeHighlight:'free highlight', arrow:'arrow', cloud:'cloud'
        };

        function getToolLi(toolName){
          var idx = EXTENSION_TOOL_ORDER.indexOf(toolName);
          if(idx < 0) idx = TOOL_ORDER.indexOf(toolName);
          var ul = document.querySelector('.CustomToolbar ul.buttons');
          if(ul && idx >= 0){
            var byIdx = ul.querySelectorAll(':scope > li')[idx];
            if(byIdx) return byIdx;
          }
          if(ul && toolName === 'signature'){
            var sigItems = ul.querySelectorAll(':scope > li');
            for(var s=0;s<sigItems.length;s++){
              if(sigItems[s].querySelector('.SignaturePop-Container, .SignaturePop, .SignatureTool')) return sigItems[s];
            }
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
          if(toolName === 'signature') return activateSignaturePlacement();
          return clickToolLi(toolName);
        }

        function activateStampSignature(toolName){
          hookExtensionPainter();
          if(toolName === 'stamp'){
            return activateStampPlacement();
          }
          if(toolName === 'signature'){
            return activateSignaturePlacement();
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
          if(EXTENSION_CLICK_TOOLS[toolName]) return activateStampSignature(toolName);
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

        /* ── Edit Text Mode ── */
        if(!window.__pdfcraftTextEdits) window.__pdfcraftTextEdits = [];
        var editTextActive = false;
        var textEditHistory = [];
        var textEditRedoStack = [];
        var pendingTextFinalizers = [];
        var pageTextCache = {};

        function prefetchPageText(pageNum){
          if(pageTextCache[pageNum] && pageTextCache[pageNum].promise) return pageTextCache[pageNum].promise;
          var entry = { ready: false, items: null, styles: null, fontMeta: {}, spanMap: null, promise: null };
          pageTextCache[pageNum] = entry;
          entry.promise = new Promise(function(resolve){
            try{
              var app = window.PDFViewerApplication;
              var doc = app && app.pdfDocument;
              if(!doc){ resolve(); return; }
              doc.getPage(pageNum).then(function(page){
                page.getTextContent().then(function(tc){
                  entry.items = tc.items || [];
                  entry.styles = tc.styles || {};
                  entry.ready = true;
                  entry.spanMap = null;
                  var names = {};
                  for(var i = 0; i < entry.items.length; i++){
                    var fn = entry.items[i] && entry.items[i].fontName;
                    if(fn) names[fn] = true;
                  }
                  var keys = Object.keys(names);
                  if(!keys.length){ resolve(); return; }
                  function storeFontMeta(fontName, obj){
                    if(!obj) return;
                    var nameFlags = parseFontNameFlags(obj.name || obj.loadedName || fontName || '');
                    var isBold = !!(obj.bold || obj.black || nameFlags.bold);
                    var isItalic = !!(obj.italic || nameFlags.italic);
                    if(obj.cssFontInfo && obj.cssFontInfo.fontWeight){
                      var cssW = parseInt(obj.cssFontInfo.fontWeight, 10);
                      if(cssW >= 600) isBold = true;
                    }
                    if(obj.cssFontInfo && obj.cssFontInfo.italicAngle && Math.abs(obj.cssFontInfo.italicAngle) > 0) isItalic = true;
                    entry.fontMeta[fontName] = {
                      bold: isBold,
                      italic: isItalic,
                      fontWeight: isBold ? 'bold' : 'normal',
                      fontStyle: isItalic ? 'italic' : 'normal',
                      fontFamily: obj.cssFontInfo ? obj.cssFontInfo.fontFamily : (obj.name || obj.loadedName || '')
                    };
                  }
                  var pending = keys.length;
                  for(var j = 0; j < keys.length; j++){
                    (function(fontName){
                      var handled = false;
                      function done(obj){
                        if(handled) return;
                        handled = true;
                        storeFontMeta(fontName, obj);
                        pending--;
                        if(pending <= 0) resolve();
                      }
                      function fail(){
                        if(handled) return;
                        handled = true;
                        pending--;
                        if(pending <= 0) resolve();
                      }
                      try{
                        var result = page.commonObjs.get(fontName, done);
                        if(result && typeof result.then === 'function'){
                          result.then(done).catch(fail);
                        } else if(result && typeof result === 'object' && !result.then){
                          done(result);
                        }
                      }catch(e){
                        fail();
                      }
                    })(keys[j]);
                  }
                  setTimeout(function(){ if(pending > 0){ pending = 0; resolve(); } }, 2000);
                }).catch(function(){ resolve(); });
              }).catch(function(){ resolve(); });
            }catch(e){ resolve(); }
          });
          return entry.promise;
        }

        function prefetchAllPageText(){
          try{
            var app = window.PDFViewerApplication;
            var doc = app && app.pdfDocument;
            if(!doc) return;
            for(var p = 1; p <= doc.numPages; p++) prefetchPageText(p);
          }catch(e){}
        }

        function buildSpanItemMap(textLayer, items){
          var map = new WeakMap();
          if(!textLayer || !items) return map;
          var allSpans = textLayer.querySelectorAll('span[role="presentation"]');
          var itemIdx = 0;
          for(var i = 0; i < allSpans.length && itemIdx < items.length; i++){
            map.set(allSpans[i], itemIdx);
            itemIdx++;
          }
          return map;
        }

        function getPdfFontInfoForSpan(span, pageNum){
          var entry = pageTextCache[pageNum];
          if(!entry || !entry.ready || !entry.items) return null;
          var textLayer = span.closest('.textLayer');
          if(!textLayer) return null;
          if(!entry.spanMap) entry.spanMap = buildSpanItemMap(textLayer, entry.items);
          var itemIdx = entry.spanMap.get(span);
          if(itemIdx == null || itemIdx < 0 || itemIdx >= entry.items.length) return null;
          var item = entry.items[itemIdx];
          if(!item || !item.fontName) return null;
          var meta = entry.fontMeta[item.fontName];
          if(meta) return meta;
          var st = entry.styles[item.fontName];
          var ff = st && st.fontFamily || '';
          var flags = parseFontNameFlags(ff);
          var nameFlags = parseFontNameFlags(item.fontName || '');
          var isBold = flags.bold || nameFlags.bold;
          var isItalic = flags.italic || nameFlags.italic;
          return {
            bold: isBold,
            italic: isItalic,
            fontWeight: isBold ? 'bold' : 'normal',
            fontStyle: isItalic ? 'italic' : 'normal',
            fontFamily: ff
          };
        }

        function mergePdfFontInfo(fi, pdfInfo){
          if(!pdfInfo) return fi;
          if(pdfInfo.bold) fi.fontWeight = 'bold';
          if(pdfInfo.italic) fi.fontStyle = 'italic';
          if(pdfInfo.fontWeight) fi.pdfFontWeight = pdfInfo.fontWeight;
          if(pdfInfo.fontStyle) fi.pdfFontStyle = pdfInfo.fontStyle;
          var flags = parseFontNameFlags(fi.fontFamily);
          if(pdfInfo.bold && !flags.bold) fi.useSyntheticBold = true;
          if(pdfInfo.italic && !flags.italic) fi.useSyntheticItalic = true;
          return fi;
        }

        function notifyUndoRedoState(){
          try{ window.parent.postMessage({ type:'pdfcraft-undo-redo-state', canUndo: textEditHistory.length > 0, canRedo: textEditRedoStack.length > 0 }, '*'); }catch(e){}
        }
        function commitPendingTextEdits(){
          var pending = pendingTextFinalizers.slice();
          for(var i = 0; i < pending.length; i++){
            try{ pending[i](); }catch(e){}
          }
        }

        function injectEditTextStyles(){
          var s = document.getElementById('pdfcraft-edit-text-style');
          if(!s){
            s = document.createElement('style');
            s.id = 'pdfcraft-edit-text-style';
            document.head.appendChild(s);
          }
          s.textContent = [
            '.pdfcraft-edit-text .textLayer { pointer-events: auto !important; z-index: 5 !important; overflow: visible !important; }',
            '.pdfcraft-edit-text .textLayer span { pointer-events: auto !important; cursor: text !important; }',
            '.pdfcraft-edit-text .textLayer span[role="presentation"] { border-radius: 2px; transition: background 0.1s; }',
            '.pdfcraft-edit-text .textLayer span[role="presentation"]:hover { background: rgba(22,119,255,0.12) !important; }',
            '.pdfcraft-edit-text .textLayer span { user-select: none !important; -webkit-user-select: none !important; }',
            '.pdfcraft-edit-text .CustomToolbar { display: none !important; visibility: hidden !important; pointer-events: none !important; }',
            '.pdfcraft-edit-text .popbar, .pdfcraft-edit-text .annotation-popbar, .pdfcraft-edit-text [class*="popbar"], .pdfcraft-edit-text [class*="Popbar"] { display: none !important; visibility: hidden !important; }',
            '.pdfcraft-text-editor { position: absolute; z-index: 10; outline: none; padding: 1px 2px; box-sizing: border-box; overflow: visible; white-space: pre-wrap; word-break: break-word; border: 2px solid #1677ff; background: #fff; user-select: text !important; -webkit-user-select: text !important; }',
            '.pdfcraft-text-editor:focus { box-shadow: 0 0 0 2px rgba(22,119,255,0.18); }',
            '.pdfcraft-edit-text .pdfcraft-text-editor.finalized { border: 1px dashed rgba(22,119,255,0.35); cursor: text; }',
            '.pdfcraft-text-editor.finalized { border: none; box-shadow: none; background: transparent; cursor: default; }',
            '.pdfcraft-text-cover { position: absolute; background: #fff; z-index: 6; pointer-events: none; }',
            '.textLayer span.pdfcraft-span-hidden { visibility: hidden !important; opacity: 0 !important; }',
            '.pdfcraft-text-toolbar { position: absolute; z-index: 14; display: flex; align-items: center; gap: 2px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 3px 5px; box-shadow: 0 4px 16px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.06); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; font-size: 12px; white-space: nowrap; }',
            '.pdfcraft-text-toolbar .pdfcraft-tb-group { display: flex; align-items: center; gap: 1px; background: #f8fafc; border-radius: 5px; padding: 1px; }',
            '.pdfcraft-text-toolbar button { width: 28px; height: 28px; border: none; border-radius: 4px; background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 13px; color: #475569; padding: 0; line-height: 1; transition: all 0.1s; }',
            '.pdfcraft-text-toolbar button:hover { background: #e2e8f0; color: #1e293b; }',
            '.pdfcraft-text-toolbar button.active { background: #3b82f6; color: #fff; box-shadow: 0 1px 2px rgba(59,130,246,0.3); }',
            '.pdfcraft-text-toolbar select { height: 28px; border: 1px solid #e2e8f0; border-radius: 5px; background: #f8fafc; font-size: 11px; padding: 0 4px; cursor: pointer; color: #334155; outline: none; transition: border-color 0.15s; -webkit-appearance: none; appearance: none; }',
            '.pdfcraft-text-toolbar select:hover { border-color: #94a3b8; }',
            '.pdfcraft-text-toolbar select:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }',
            '.pdfcraft-text-toolbar .pdfcraft-tb-fontfamily { min-width: 80px; max-width: 110px; }',
            '.pdfcraft-text-toolbar .pdfcraft-tb-fontsize { width: 48px; height: 28px; text-align: center; border: 1px solid #e2e8f0; border-radius: 5px; background: #f8fafc; font-size: 12px; color: #334155; outline: none; padding: 0 2px; -moz-appearance: textfield; }',
            '.pdfcraft-text-toolbar .pdfcraft-tb-fontsize::-webkit-inner-spin-button, .pdfcraft-text-toolbar .pdfcraft-tb-fontsize::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }',
            '.pdfcraft-text-toolbar .pdfcraft-tb-fontsize:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }',
            '.pdfcraft-text-toolbar .pdfcraft-tb-sep { width: 1px; height: 20px; background: #e2e8f0; margin: 0 3px; flex-shrink: 0; }',
            '.pdfcraft-text-toolbar .pdfcraft-tb-color { position: relative; width: 28px; height: 28px; border-radius: 4px; overflow: hidden; cursor: pointer; border: 1px solid #e2e8f0; }',
            '.pdfcraft-text-toolbar .pdfcraft-tb-color input[type="color"] { position: absolute; inset: -4px; width: 36px; height: 36px; border: none; padding: 0; cursor: pointer; opacity: 0; }',
            '.pdfcraft-text-toolbar .pdfcraft-tb-color-preview { width: 100%; height: 100%; border-radius: 3px; }',
            '.pdfcraft-text-resize-frame { position: absolute; z-index: 11; pointer-events: none; border: 1px dashed #1677ff; box-sizing: border-box; }',
            '.pdfcraft-text-resize-handle { position: absolute; width: 8px; height: 8px; background: #1677ff; border: 1px solid #fff; border-radius: 50%; pointer-events: auto; box-shadow: 0 0 0 1px rgba(22,119,255,0.35); z-index: 12; }',
            '.pdfcraft-resize-nw { top: -4px; left: -4px; cursor: nwse-resize; }',
            '.pdfcraft-resize-n, .pdfcraft-resize-s { display: none; }',
            '.pdfcraft-resize-n { top: -4px; left: 50%; margin-left: -4px; cursor: ns-resize; }',
            '.pdfcraft-resize-ne { top: -4px; right: -4px; cursor: nesw-resize; }',
            '.pdfcraft-resize-e { top: 50%; right: -4px; margin-top: -4px; cursor: ew-resize; }',
            '.pdfcraft-resize-se { bottom: -4px; right: -4px; cursor: nwse-resize; }',
            '.pdfcraft-resize-s { bottom: -4px; left: 50%; margin-left: -4px; cursor: ns-resize; display: none; }',
            '.pdfcraft-resize-sw { bottom: -4px; left: -4px; cursor: nesw-resize; }',
            '.pdfcraft-resize-w { top: 50%; left: -4px; margin-top: -4px; cursor: ew-resize; }',
            '.pdfcraft-text-toolbar .pdfcraft-tb-align svg { width: 14px; height: 14px; display: block; }',
          ].join('\\n');
        }

        function setEditTextMode(on){
          editTextActive = !!on;
          document.documentElement.classList.toggle('pdfcraft-edit-text', editTextActive);
          if(!on){
            commitPendingTextEdits();
          }
          if(editTextActive){
            injectEditTextStyles();
            prefetchAllPageText();
            try{ closePopbar(); }catch(e){}
          }
          notifyUndoRedoState();
        }

        function getPageNumberFromEl(el){
          var page = el.closest('.page');
          if(!page) return -1;
          return parseInt(page.getAttribute('data-page-number') || '0', 10);
        }

        function getTextLayerSpans(textLayer){
          var spans = textLayer.querySelectorAll('span[role="presentation"]');
          if(spans.length) return spans;
          return textLayer.querySelectorAll(':scope > span:not(.markedContent)');
        }

        function collectLineSpans(clickedSpan){
          var textLayer = clickedSpan.closest('.textLayer');
          if(!textLayer) return [clickedSpan];
          var allSpans = getTextLayerSpans(textLayer);
          if(!allSpans.length) return [clickedSpan];
          var clickedRect = clickedSpan.getBoundingClientRect();
          var cy = clickedRect.top + clickedRect.height / 2;
          var threshold = Math.max(3, clickedRect.height * 0.35);
          var lineSpans = [];
          for(var i = 0; i < allSpans.length; i++){
            var sp = allSpans[i];
            if(sp.__pdfcraftEditing) continue;
            var r = sp.getBoundingClientRect();
            if(r.width < 1 || r.height < 1) continue;
            var spMid = r.top + r.height / 2;
            if(Math.abs(spMid - cy) < threshold){
              lineSpans.push(sp);
            }
          }
          if(!lineSpans.length) return [clickedSpan];
          lineSpans.sort(function(a,b){ return a.getBoundingClientRect().left - b.getBoundingClientRect().left; });
          return lineSpans;
        }

        function hideTextSpans(spans){
          for(var i = 0; i < spans.length; i++){
            spans[i].__pdfcraftEditing = true;
            spans[i].classList.add('pdfcraft-span-hidden');
          }
        }

        function showTextSpans(spans){
          for(var i = 0; i < spans.length; i++){
            spans[i].__pdfcraftEditing = false;
            spans[i].classList.remove('pdfcraft-span-hidden');
          }
        }

        function detectCanvasUnderline(span){
          try{
            var pg = span.closest('.page');
            var canvas = pg && pg.querySelector('canvas');
            if(!canvas) return false;
            var ctx = canvas.getContext('2d');
            var cr = canvas.getBoundingClientRect();
            var sr = span.getBoundingClientRect();
            var scX = canvas.width / cr.width;
            var scY = canvas.height / cr.height;
            var rowY = Math.round((sr.bottom - cr.top + 1) * scY);
            if(rowY < 0 || rowY >= canvas.height) return false;
            var dark = 0, total = 0;
            for(var dx = 0; dx < sr.width; dx += Math.max(1, Math.floor(sr.width / 24))){
              var px = Math.round((sr.left - cr.left + dx) * scX);
              if(px < 0 || px >= canvas.width) continue;
              total++;
              var p = ctx.getImageData(px, rowY, 1, 1).data;
              var lum = p[0] * 0.299 + p[1] * 0.587 + p[2] * 0.114;
              if(lum < 80) dark++;
            }
            return total > 0 && dark / total > 0.35;
          }catch(e){}
          return false;
        }

        function sampleCanvasColor(span){
          try{
            var pg = span.closest('.page');
            if(!pg) return null;
            var canvas = pg.querySelector('canvas');
            if(!canvas) return null;
            var ctx = canvas.getContext('2d');
            var cr = canvas.getBoundingClientRect();
            var sr = span.getBoundingClientRect();
            var scX = canvas.width / cr.width;
            var scY = canvas.height / cr.height;
            var best = null;
            var bestLum = 999;
            var probes = [];
            for(var pct = 0.15; pct <= 0.85; pct += 0.1){
              probes.push([Math.max(2, sr.width * pct), Math.max(1, sr.height * 0.35)]);
              probes.push([Math.max(2, sr.width * pct), Math.max(1, sr.height * 0.5)]);
              probes.push([Math.max(2, sr.width * pct), Math.max(1, sr.height * 0.65)]);
            }
            probes.push([5, 1], [12, 2], [3, Math.max(1, sr.height * 0.5)]);
            for(var pi = 0; pi < probes.length; pi++){
              var dx = probes[pi][0];
              var dy = probes[pi][1];
              var px = Math.round((sr.left - cr.left + dx) * scX);
              var py = Math.round((sr.top - cr.top + dy) * scY);
              if(px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
              var p = ctx.getImageData(px, py, 1, 1).data;
              var lum = p[0] * 0.299 + p[1] * 0.587 + p[2] * 0.114;
              if(lum < bestLum && lum < 240){
                bestLum = lum;
                best = [p[0], p[1], p[2]];
              }
            }
            if(best) return 'rgb(' + best[0] + ',' + best[1] + ',' + best[2] + ')';
          }catch(e){}
          return null;
        }

        function parseFontNameFlags(name){
          var n = (name || '').toLowerCase();
          var italic = /italic|oblique|ital|slanted|inclined|-itmt|-oblmt/.test(n);
          var bold = /bold|black|heavy|semibold|demi|extrabold|ultrabold|-bdmt|-boldmt/.test(n);
          if(/bolditalic|bold-italic|bold_oblique|boldoblique|bolditmt|bolditalicmt/.test(n)){
            bold = true;
            italic = true;
          }
          return { bold: bold, italic: italic };
        }

        function normalizeFontFamily(raw){
          return (raw || '').replace(/^["']+|["']+$/g, '').trim();
        }

        function readSpanFontFamily(span){
          var inline = normalizeFontFamily(span.style.fontFamily);
          if(inline) return inline;
          var cs = window.getComputedStyle(span);
          return normalizeFontFamily(cs.fontFamily) || 'sans-serif';
        }

        function applyEditorStyles(editor, refSpan, fi){
          if(refSpan.style.fontFamily) editor.style.fontFamily = refSpan.style.fontFamily;
          else editor.style.fontFamily = fi.fontFamily;
          if(refSpan.style.fontSize) editor.style.fontSize = refSpan.style.fontSize;
          else editor.style.fontSize = fi.fontSize + 'px';
          editor.style.color = fi.color;
          editor.style.lineHeight = '1.15';
          editor.style.letterSpacing = refSpan.style.letterSpacing || '0px';
          editor.style.transform = '';
          editor.style.fontWeight = (fi.fontWeight === 'bold') ? (fi.pdfFontWeight || 'bold') : 'normal';
          editor.style.fontStyle = (fi.fontStyle === 'italic') ? (fi.pdfFontStyle || 'italic') : 'normal';
          editor.style.textDecoration = (fi.textDecoration && fi.textDecoration.indexOf('underline') >= 0) ? 'underline' : 'none';
        }

        function getSpanFontInfo(span){
          var cs = window.getComputedStyle(span);
          var fontSize = parseFloat(cs.fontSize) || 14;
          var fontFamily = readSpanFontFamily(span);
          var transform = span.style.transform || cs.transform || '';
          var scaleMatch = transform.match(/scaleX\\(([\\d.]+)\\)/);
          var scaleX = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
          var canvasColor = sampleCanvasColor(span);
          var color = canvasColor || (cs.color && cs.color !== 'rgba(0, 0, 0, 0)' ? cs.color : '#000');
          var textDecoration = cs.textDecorationLine || cs.textDecoration || 'none';
          if(textDecoration === 'none' && cs.webkitTextDecorationsInEffect){
            textDecoration = cs.webkitTextDecorationsInEffect;
          }
          if(textDecoration === 'none' && detectCanvasUnderline(span)){
            textDecoration = 'underline';
          }
          var flags = parseFontNameFlags(fontFamily);
          var useSyntheticBold = !flags.bold && (parseInt(cs.fontWeight, 10) >= 600 || span.style.fontWeight === 'bold');
          var useSyntheticItalic = !flags.italic && (cs.fontStyle === 'italic' || cs.fontStyle === 'oblique' || span.style.fontStyle === 'italic');
          if(!useSyntheticItalic){
            var tf = cs.transform || transform || '';
            var skew = tf.match(/skewX\\((-?[\\d.]+)deg\\)/);
            if(skew && Math.abs(parseFloat(skew[1])) > 4) useSyntheticItalic = true;
            var mm = tf.match(/matrix\\(([^)]+)\\)/);
            if(mm){
              var parts = mm[1].split(',').map(function(v){ return parseFloat(v.trim()); });
              if(parts.length >= 4 && (Math.abs(parts[1]) > 0.02 || Math.abs(parts[2]) > 0.02)) useSyntheticItalic = true;
            }
          }
          return {
            fontSize: fontSize,
            fontFamily: fontFamily,
            scaleX: scaleX,
            color: color,
            fontWeight: (flags.bold || useSyntheticBold) ? 'bold' : 'normal',
            fontStyle: (flags.italic || useSyntheticItalic) ? 'italic' : 'normal',
            useSyntheticBold: useSyntheticBold,
            useSyntheticItalic: useSyntheticItalic,
            textDecoration: textDecoration
          };
        }

        function colorLum(c){
          if(!c) return 999;
          var m = c.match(/rgb\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)/);
          if(!m) return (c === '#000' || c === '#000000') ? 0 : 999;
          return Number(m[1]) * 0.299 + Number(m[2]) * 0.587 + Number(m[3]) * 0.114;
        }

        function getLineFontInfo(lineSpans, pageNum){
          var info = getSpanFontInfo(lineSpans[0]);
          mergePdfFontInfo(info, pageNum > 0 ? getPdfFontInfoForSpan(lineSpans[0], pageNum) : null);
          var bold = info.fontWeight === 'bold';
          var italic = info.fontStyle === 'italic';
          var bestColor = info.color;
          var bestColorLum = colorLum(bestColor);
          for(var i = 1; i < lineSpans.length; i++){
            var fi = getSpanFontInfo(lineSpans[i]);
            mergePdfFontInfo(fi, pageNum > 0 ? getPdfFontInfoForSpan(lineSpans[i], pageNum) : null);
            if(fi.fontWeight === 'bold') bold = true;
            if(fi.fontStyle === 'italic') italic = true;
            var fiLum = colorLum(fi.color);
            if(fiLum < bestColorLum){
              bestColorLum = fiLum;
              bestColor = fi.color;
            }
          }
          info.color = bestColor;
          info.fontWeight = bold ? 'bold' : 'normal';
          info.fontStyle = italic ? 'italic' : 'normal';
          if(bold){
            var bFlags = parseFontNameFlags(info.fontFamily);
            info.useSyntheticBold = !bFlags.bold;
          }
          if(italic){
            var iFlags = parseFontNameFlags(info.fontFamily);
            info.useSyntheticItalic = !iFlags.italic;
          }
          for(var j = 0; j < lineSpans.length; j++){
            var deco = getSpanFontInfo(lineSpans[j]).textDecoration;
            if(deco && deco !== 'none' && deco.indexOf('underline') >= 0){
              info.textDecoration = 'underline';
              break;
            }
          }
          return info;
        }

        function editorHasSelection(editor){
          try{
            var sel = window.getSelection();
            if(!sel || !sel.rangeCount || sel.isCollapsed) return false;
            return editor.contains(sel.anchorNode) && editor.contains(sel.focusNode);
          }catch(e){ return false; }
        }

        function saveSelection(){
          try{
            var sel = window.getSelection();
            if(!sel || !sel.rangeCount) return null;
            return sel.getRangeAt(0).cloneRange();
          }catch(e){ return null; }
        }

        function restoreSelection(range){
          if(!range) return;
          try{
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }catch(e){}
        }

        function applyFormatToSelection(editor, savedRange, fn){
          if(!savedRange || savedRange.collapsed) return false;
          restoreSelection(savedRange);
          editor.focus();
          try{ fn(); }catch(e){ return false; }
          return true;
        }

        function wrapSelectionStyle(editor, savedRange, styleObj){
          return applyFormatToSelection(editor, savedRange, function(){
            var sel = window.getSelection();
            if(!sel || !sel.rangeCount) return;
            var range = sel.getRangeAt(0);
            var span = document.createElement('span');
            for(var k in styleObj){ if(styleObj[k]) span.style[k] = styleObj[k]; }
            try{
              range.surroundContents(span);
            }catch(e){
              var frag = range.extractContents();
              span.appendChild(frag);
              range.insertNode(span);
              sel.removeAllRanges();
              var nr = document.createRange();
              nr.selectNodeContents(span);
              sel.addRange(nr);
            }
          });
        }

        function serializeEditorRuns(editor, baseStyle){
          var runs = [];
          function inheritStyle(parent){
            return {
              bold: !!parent.bold,
              italic: !!parent.italic,
              underline: !!parent.underline,
              color: parent.color || baseStyle.color || null,
              fontSize: parent.fontSize || baseStyle.fontSize || null,
              fontFamily: parent.fontFamily || baseStyle.fontFamily || null
            };
          }
          function walk(node, parentStyle){
            if(!node) return;
            if(node.nodeType === 3){
              var txt = node.textContent || '';
              if(!txt) return;
              var parts = txt.split('\\n');
              for(var pi = 0; pi < parts.length; pi++){
                if(pi > 0) runs.push({ text: '\\n', lineBreak: true });
                if(parts[pi]) runs.push({
                  text: parts[pi],
                  bold: parentStyle.bold,
                  italic: parentStyle.italic,
                  underline: parentStyle.underline,
                  color: parentStyle.color,
                  fontSizeRatio: parentStyle.fontSize && baseStyle.fontSize ? (parentStyle.fontSize / baseStyle.fontSize) : 1,
                  fontFamily: parentStyle.fontFamily
                });
              }
              return;
            }
            if(node.nodeType !== 1) return;
            var tag = (node.tagName || '').toUpperCase();
            if(tag === 'BR'){ runs.push({ text: '\\n', lineBreak: true }); return; }
            var ns = inheritStyle(parentStyle);
            if(tag === 'B' || tag === 'STRONG') ns.bold = true;
            if(tag === 'I' || tag === 'EM') ns.italic = true;
            if(tag === 'U') ns.underline = true;
            try{
              if(node.style){
                if(node.style.color) ns.color = node.style.color;
                if(node.style.fontSize) ns.fontSize = parseFloat(node.style.fontSize) || ns.fontSize;
                if(node.style.fontFamily) ns.fontFamily = node.style.fontFamily;
                if(node.style.fontWeight === 'bold' || parseInt(node.style.fontWeight, 10) >= 600) ns.bold = true;
                if(node.style.fontStyle === 'italic' || node.style.fontStyle === 'oblique') ns.italic = true;
                if((node.style.textDecoration || '').indexOf('underline') >= 0) ns.underline = true;
              }
            }catch(e){}
            for(var ci = 0; ci < node.childNodes.length; ci++) walk(node.childNodes[ci], ns);
          }
          walk(editor, { color: baseStyle.color, fontSize: baseStyle.fontSize, fontFamily: baseStyle.fontFamily });
          return runs;
        }

        function syncToolbarFromEditor(editor, btnB, btnI, btnU, btnAlignL, btnAlignC, btnAlignR, sizeInput, colorInput, colorPreview, fontSel){
          if(!editor || !editor.isConnected) return;
          try{
            btnB.classList.toggle('active', document.queryCommandState('bold'));
            btnI.classList.toggle('active', document.queryCommandState('italic'));
            btnU.classList.toggle('active', document.queryCommandState('underline'));
          }catch(e){}
          var ta = editor.style.textAlign || 'left';
          if(btnAlignL) btnAlignL.classList.toggle('active', ta === 'left' || ta === '' || ta === 'start');
          if(btnAlignC) btnAlignC.classList.toggle('active', ta === 'center');
          if(btnAlignR) btnAlignR.classList.toggle('active', ta === 'right' || ta === 'end');
          try{
            var cs = window.getComputedStyle(editor);
            var fs = parseFloat(cs.fontSize) || 14;
            sizeInput.value = String(Math.round(fs));
            var col = cs.color;
            if(col && col !== 'rgba(0, 0, 0, 0)'){
              colorPreview.style.background = col;
              var m = col.match(/rgb\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)/);
              if(m) colorInput.value = '#' + ((1<<24)|(Number(m[1])<<16)|(Number(m[2])<<8)|Number(m[3])).toString(16).slice(1);
            }
          }catch(e){}
        }

        function createLineEditor(lineSpans, clickedSpan){
          if(!editTextActive || !lineSpans.length) return;
          commitPendingTextEdits();
          var page = clickedSpan.closest('.page');
          var textLayer = clickedSpan.closest('.textLayer');
          if(!page || !textLayer) return;
          var pageNum = getPageNumberFromEl(clickedSpan);
          if(pageNum < 1) return;
          prefetchPageText(pageNum);
          var layerRect = textLayer.getBoundingClientRect();
          var firstRect = lineSpans[0].getBoundingClientRect();
          var lastRect = lineSpans[lineSpans.length - 1].getBoundingClientRect();
          var x = firstRect.left - layerRect.left;
          var y = firstRect.top - layerRect.top;
          var right = lastRect.right - layerRect.left;
          var maxH = 0;
          var parts = [];
          for(var i = 0; i < lineSpans.length; i++){
            var sp = lineSpans[i];
            var r = sp.getBoundingClientRect();
            var spY = r.top - layerRect.top;
            if(spY < y) y = spY;
            if(r.right - layerRect.left > right) right = r.right - layerRect.left;
            if(r.height > maxH) maxH = r.height;
            parts.push(sp.textContent || '');
          }
          var w = right - x;
          var pageX = x;
          var pageY = y;
          var originalText = parts.join('');
          if(!originalText.trim()) return;

          var refSpan = clickedSpan;
          var fi = getLineFontInfo(lineSpans, pageNum);
          var fontSize = fi.fontSize;
          var fontFamily = fi.fontFamily;
          var h = Math.max(maxH, fontSize * 1.15);
          var pad = 2;
          var vPadTop = Math.max(2, Math.ceil(fontSize * 0.2));
          var vPadBottom = 1;

          hideTextSpans(lineSpans);

          var cover = document.createElement('div');
          cover.className = 'pdfcraft-text-cover';
          cover.style.left = (pageX - pad) + 'px';
          cover.style.top = (pageY - vPadTop) + 'px';
          cover.style.height = (h + vPadTop + vPadBottom) + 'px';
          textLayer.appendChild(cover);

          var editor = document.createElement('div');
          editor.contentEditable = 'true';
          editor.className = 'pdfcraft-text-editor';
          editor.textContent = originalText;
          editor.style.left = pageX + 'px';
          editor.style.top = pageY + 'px';
          editor.style.minHeight = h + 'px';
          editor.style.whiteSpace = 'pre-wrap';
          editor.style.wordBreak = 'break-word';
          var maxEditorW = Math.max(200, layerRect.width - pageX - 4);
          editor.style.maxWidth = maxEditorW + 'px';
          applyEditorStyles(editor, refSpan, fi);
          textLayer.appendChild(editor);
          var curPageX = pageX;
          var initW = Math.min(Math.max(editor.scrollWidth + 20, fontSize * 4), maxEditorW);
          editor.style.width = initW + 'px';

          var resizeFrame = document.createElement('div');
          resizeFrame.className = 'pdfcraft-text-resize-frame';
          var handlePos = ['nw','n','ne','e','se','s','sw','w'];
          for(var hp = 0; hp < handlePos.length; hp++){
            var handleEl = document.createElement('div');
            handleEl.className = 'pdfcraft-text-resize-handle pdfcraft-resize-' + handlePos[hp];
            handleEl.dataset.handle = handlePos[hp];
            resizeFrame.appendChild(handleEl);
          }
          textLayer.appendChild(resizeFrame);

          var userModifiedStyle = false;
          var finalized = false;

          var toolbar = document.createElement('div');
          toolbar.className = 'pdfcraft-text-toolbar';
          var tbTop = pageY - 38;
          if(tbTop < 2) tbTop = pageY + h + 4;
          toolbar.style.left = pageX + 'px';
          toolbar.style.top = tbTop + 'px';
          var toolbarSavedRange = null;
          toolbar.addEventListener('mousedown', function(e){
            var tag = e.target && e.target.tagName;
            if(tag === 'SELECT' || tag === 'INPUT' || tag === 'OPTION') return;
            toolbarSavedRange = saveSelection();
            e.preventDefault();
          });

          function rgbToHex(c){
            try{
              var m = (c||'').match(/rgb\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)/);
              if(m) return '#' + ((1<<24)|(Number(m[1])<<16)|(Number(m[2])<<8)|Number(m[3])).toString(16).slice(1);
            }catch(e){}
            return '#000000';
          }

          var WEB_FONTS = [
            { label:'Arial', value:'Arial, Helvetica, sans-serif' },
            { label:'Times New Roman', value:'"Times New Roman", Times, serif' },
            { label:'Georgia', value:'Georgia, serif' },
            { label:'Verdana', value:'Verdana, Geneva, sans-serif' },
            { label:'Tahoma', value:'Tahoma, Geneva, sans-serif' },
            { label:'Courier New', value:'"Courier New", Courier, monospace' },
            { label:'Trebuchet MS', value:'"Trebuchet MS", sans-serif' }
          ];

          function detectFontGroup(ff){
            var lo = (ff||'').toLowerCase();
            if(/times|roman|serif|minion|georgia|garamond|palatino/i.test(lo) && !/sans/i.test(lo)) return 1;
            if(/courier|mono|consolas/i.test(lo)) return 5;
            if(/georgia/i.test(lo)) return 2;
            if(/verdana/i.test(lo)) return 3;
            if(/tahoma/i.test(lo)) return 4;
            if(/trebuchet/i.test(lo)) return 6;
            return 0;
          }

          var fontSel = document.createElement('select');
          fontSel.className = 'pdfcraft-tb-fontfamily';
          fontSel.title = 'Font';
          var detectedGroup = detectFontGroup(fi.fontFamily);
          for(var fi2 = 0; fi2 < WEB_FONTS.length; fi2++){
            var fOpt = document.createElement('option');
            fOpt.value = WEB_FONTS[fi2].value;
            fOpt.textContent = WEB_FONTS[fi2].label;
            fOpt.style.fontFamily = WEB_FONTS[fi2].value;
            if(fi2 === detectedGroup) fOpt.selected = true;
            fontSel.appendChild(fOpt);
          }
          fontSel.addEventListener('change', function(){
            userModifiedStyle = true;
            var ff = fontSel.value;
            if(toolbarSavedRange && !toolbarSavedRange.collapsed){
              applyFormatToSelection(editor, toolbarSavedRange, function(){ document.execCommand('fontName', false, ff); });
              toolbarSavedRange = saveSelection();
            } else {
              fi.fontFamily = ff;
              fontFamily = ff;
              editor.style.fontFamily = ff;
            }
            syncEditorSize();
          });

          var grpFormat = document.createElement('div');
          grpFormat.className = 'pdfcraft-tb-group';
          var btnB = document.createElement('button');
          btnB.type = 'button';
          btnB.innerHTML = '<b>B</b>';
          btnB.title = 'In đậm (bôi đen trước)';
          if(fi.fontWeight === 'bold') btnB.classList.add('active');
          btnB.addEventListener('click', function(e){
            e.preventDefault();
            if(!toolbarSavedRange || toolbarSavedRange.collapsed) return;
            userModifiedStyle = true;
            applyFormatToSelection(editor, toolbarSavedRange, function(){ document.execCommand('bold'); });
            toolbarSavedRange = saveSelection();
            syncToolbarFromEditor(editor, btnB, btnI, btnU, btnAlignL, btnAlignC, btnAlignR, sizeInput, colorInput, colorPreview, fontSel);
            syncEditorSize();
          });
          grpFormat.appendChild(btnB);

          var btnI = document.createElement('button');
          btnI.type = 'button';
          btnI.innerHTML = '<i>I</i>';
          btnI.title = 'Nghiêng (bôi đen trước)';
          if(fi.fontStyle === 'italic') btnI.classList.add('active');
          btnI.addEventListener('click', function(e){
            e.preventDefault();
            if(!toolbarSavedRange || toolbarSavedRange.collapsed) return;
            userModifiedStyle = true;
            applyFormatToSelection(editor, toolbarSavedRange, function(){ document.execCommand('italic'); });
            toolbarSavedRange = saveSelection();
            syncToolbarFromEditor(editor, btnB, btnI, btnU, btnAlignL, btnAlignC, btnAlignR, sizeInput, colorInput, colorPreview, fontSel);
            syncEditorSize();
          });
          grpFormat.appendChild(btnI);

          var btnU = document.createElement('button');
          btnU.type = 'button';
          btnU.innerHTML = '<u>U</u>';
          btnU.title = 'Gạch chân (bôi đen trước)';
          if(fi.textDecoration && fi.textDecoration.indexOf('underline') >= 0) btnU.classList.add('active');
          btnU.addEventListener('click', function(e){
            e.preventDefault();
            if(!toolbarSavedRange || toolbarSavedRange.collapsed) return;
            userModifiedStyle = true;
            applyFormatToSelection(editor, toolbarSavedRange, function(){ document.execCommand('underline'); });
            toolbarSavedRange = saveSelection();
            syncToolbarFromEditor(editor, btnB, btnI, btnU, btnAlignL, btnAlignC, btnAlignR, sizeInput, colorInput, colorPreview, fontSel);
            syncEditorSize();
          });
          grpFormat.appendChild(btnU);

          var grpAlign = document.createElement('div');
          grpAlign.className = 'pdfcraft-tb-group';
          var alignSvgL = '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2" rx="0.5"/><rect x="1" y="6" width="10" height="2" rx="0.5"/><rect x="1" y="10" width="12" height="2" rx="0.5"/></svg>';
          var alignSvgC = '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2" rx="0.5"/><rect x="3" y="6" width="10" height="2" rx="0.5"/><rect x="2" y="10" width="12" height="2" rx="0.5"/></svg>';
          var alignSvgR = '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2" rx="0.5"/><rect x="5" y="6" width="10" height="2" rx="0.5"/><rect x="3" y="10" width="12" height="2" rx="0.5"/></svg>';
          var btnAlignL = document.createElement('button');
          btnAlignL.className = 'pdfcraft-tb-align';
          btnAlignL.innerHTML = alignSvgL;
          btnAlignL.title = 'Căn trái';
          btnAlignL.classList.add('active');
          var btnAlignC = document.createElement('button');
          btnAlignC.className = 'pdfcraft-tb-align';
          btnAlignC.innerHTML = alignSvgC;
          btnAlignC.title = 'Căn giữa';
          var btnAlignR = document.createElement('button');
          btnAlignR.className = 'pdfcraft-tb-align';
          btnAlignR.innerHTML = alignSvgR;
          btnAlignR.title = 'Căn phải';
          function setTextAlign(align){
            userModifiedStyle = true;
            editor.style.textAlign = align;
            btnAlignL.classList.toggle('active', align === 'left');
            btnAlignC.classList.toggle('active', align === 'center');
            btnAlignR.classList.toggle('active', align === 'right');
          }
          btnAlignL.addEventListener('click', function(){ setTextAlign('left'); });
          btnAlignC.addEventListener('click', function(){ setTextAlign('center'); });
          btnAlignR.addEventListener('click', function(){ setTextAlign('right'); });
          grpAlign.appendChild(btnAlignL);
          grpAlign.appendChild(btnAlignC);
          grpAlign.appendChild(btnAlignR);

          var sizeInput = document.createElement('input');
          sizeInput.type = 'number';
          sizeInput.className = 'pdfcraft-tb-fontsize';
          sizeInput.title = 'Font size';
          sizeInput.min = '6';
          sizeInput.max = '200';
          sizeInput.step = '1';
          sizeInput.value = String(Math.round(fontSize));
          sizeInput.addEventListener('change', function(){
            userModifiedStyle = true;
            var v = Math.max(6, Math.min(200, Number(sizeInput.value) || fontSize));
            sizeInput.value = String(Math.round(v));
            if(toolbarSavedRange && !toolbarSavedRange.collapsed){
              wrapSelectionStyle(editor, toolbarSavedRange, { fontSize: v + 'px' });
              toolbarSavedRange = saveSelection();
            } else {
              fontSize = v;
              fi.fontSize = fontSize;
              editor.style.fontSize = fontSize + 'px';
            }
            syncEditorSize();
          });
          sizeInput.addEventListener('keydown', function(e){
            e.stopPropagation();
          });

          var colorWrap = document.createElement('div');
          colorWrap.className = 'pdfcraft-tb-color';
          colorWrap.title = 'Color';
          var colorPreview = document.createElement('div');
          colorPreview.className = 'pdfcraft-tb-color-preview';
          colorPreview.style.background = fi.color || '#000';
          var colorInput = document.createElement('input');
          colorInput.type = 'color';
          colorInput.value = rgbToHex(fi.color);
          colorInput.addEventListener('input', function(){
            userModifiedStyle = true;
            var hex = colorInput.value;
            if(toolbarSavedRange && !toolbarSavedRange.collapsed){
              applyFormatToSelection(editor, toolbarSavedRange, function(){ document.execCommand('foreColor', false, hex); });
              toolbarSavedRange = saveSelection();
            } else {
              var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
              fi.color = 'rgb(' + r + ',' + g + ',' + b + ')';
              editor.style.color = fi.color;
            }
            colorPreview.style.background = hex;
          });
          colorWrap.appendChild(colorPreview);
          colorWrap.appendChild(colorInput);

          toolbar.appendChild(fontSel);
          toolbar.appendChild(document.createElement('div')).className = 'pdfcraft-tb-sep';
          toolbar.appendChild(sizeInput);
          toolbar.appendChild(document.createElement('div')).className = 'pdfcraft-tb-sep';
          toolbar.appendChild(grpFormat);
          toolbar.appendChild(document.createElement('div')).className = 'pdfcraft-tb-sep';
          toolbar.appendChild(grpAlign);
          toolbar.appendChild(document.createElement('div')).className = 'pdfcraft-tb-sep';
          toolbar.appendChild(colorWrap);

          textLayer.appendChild(toolbar);

          prefetchPageText(pageNum).then(function(){
            if(!editor.isConnected || userModifiedStyle) return;
            fi = getLineFontInfo(lineSpans, pageNum);
            applyEditorStyles(editor, refSpan, fi);
            btnB.classList.toggle('active', fi.fontWeight === 'bold');
            btnI.classList.toggle('active', fi.fontStyle === 'italic');
            btnU.classList.toggle('active', !!(fi.textDecoration && fi.textDecoration.indexOf('underline') >= 0));
            colorInput.value = rgbToHex(fi.color);
            colorPreview.style.background = fi.color || '#000';
            var newDetected = detectFontGroup(fi.fontFamily);
            if(newDetected !== detectedGroup) fontSel.selectedIndex = newDetected;
            var newSize = Math.round(fi.fontSize);
            if(newSize !== Math.round(fontSize)){
              fontSize = fi.fontSize;
              sizeInput.value = String(newSize);
            }
          });
          editor.focus();
          try{
            var rng = document.createRange();
            rng.selectNodeContents(editor);
            rng.collapse(false);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(rng);
          }catch(e){}

          function syncResizeFrame(){
            if(!resizeFrame.isConnected) return;
            var edL = parseFloat(editor.style.left) || curPageX;
            var edT = parseFloat(editor.style.top) || pageY;
            var edW = editor.offsetWidth;
            var edH = editor.offsetHeight;
            resizeFrame.style.left = edL + 'px';
            resizeFrame.style.top = edT + 'px';
            resizeFrame.style.width = edW + 'px';
            resizeFrame.style.height = edH + 'px';
          }

          function syncEditorSize(){
            editor.style.height = 'auto';
            var sh = editor.scrollHeight;
            var edW = editor.offsetWidth || initW;
            var edH = Math.max(h, sh);
            editor.style.height = edH + 'px';
            cover.style.left = (curPageX - pad) + 'px';
            cover.style.width = (edW + pad * 2) + 'px';
            cover.style.height = (edH + vPadTop + vPadBottom) + 'px';
            syncResizeFrame();
            return { edW: edW, edH: edH };
          }

          function startResizeDrag(handle, startEvt){
            startEvt.preventDefault();
            startEvt.stopPropagation();
            var startX = startEvt.clientX;
            var startW = editor.offsetWidth;
            var startPageX = curPageX;
            userModifiedStyle = true;
            function onMove(ev){
              var dx = ev.clientX - startX;
              var newW;
              if(handle === 'e' || handle === 'ne' || handle === 'se'){
                newW = Math.max(40, Math.min(maxEditorW, startW + dx));
                editor.style.width = newW + 'px';
              } else if(handle === 'w' || handle === 'nw' || handle === 'sw'){
                newW = Math.max(40, Math.min(maxEditorW, startW - dx));
                curPageX = startPageX + (startW - newW);
                editor.style.left = curPageX + 'px';
                editor.style.width = newW + 'px';
              }
              syncEditorSize();
            }
            function onUp(){
              document.removeEventListener('mousemove', onMove);
              document.removeEventListener('mouseup', onUp);
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
          }

          resizeFrame.addEventListener('mousedown', function(e){
            var hEl = e.target && e.target.closest && e.target.closest('.pdfcraft-text-resize-handle');
            if(!hEl || !hEl.dataset.handle) return;
            startResizeDrag(hEl.dataset.handle, e);
          });

          editor.addEventListener('input', function(){ syncEditorSize(); });
          editor.addEventListener('mouseup', function(){ toolbarSavedRange = saveSelection(); });
          editor.addEventListener('keyup', function(){ toolbarSavedRange = saveSelection(); });
          document.addEventListener('selectionchange', function onSelChange(){
            if(!editor.isConnected || finalized) return;
            if(editorHasSelection(editor)){
              toolbarSavedRange = saveSelection();
              syncToolbarFromEditor(editor, btnB, btnI, btnU, btnAlignL, btnAlignC, btnAlignR, sizeInput, colorInput, colorPreview, fontSel);
            }
          });
          syncResizeFrame();

          function finalize(){
            if(finalized) return;
            finalized = true;
            var pendingIdx = pendingTextFinalizers.indexOf(finalize);
            if(pendingIdx >= 0) pendingTextFinalizers.splice(pendingIdx, 1);
            var newText = (editor.innerText || '').replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');
            if(newText.trim() && (newText !== originalText || userModifiedStyle)){
              editor.contentEditable = 'false';
              editor.classList.add('finalized');
              toolbar.remove();
              if(resizeFrame && resizeFrame.parentNode) resizeFrame.remove();
              var size = syncEditorSize();
              var edW = size.edW;
              var edH = size.edH;

              var pw = page.clientWidth;
              var ph = page.clientHeight;
              var pdfW = 595, pdfH = 842;
              try{
                var app = window.PDFViewerApplication;
                var pv = app && app.pdfViewer && app.pdfViewer.getPageView(pageNum - 1);
                if(pv && pv.viewport && pv.viewport.viewBox){
                  pdfW = pv.viewport.viewBox[2] || pdfW;
                  pdfH = pv.viewport.viewBox[3] || pdfH;
                }
              }catch(e){}

              applyEditorStyles(editor, refSpan, fi);

              var richHtml = editor.innerHTML;
              var textAlign = editor.style.textAlign || 'left';
              var richRuns = serializeEditorRuns(editor, { color: fi.color, fontSize: fontSize, fontFamily: fontFamily });
              window.__pdfcraftTextEdits.push({
                pageNumber: pageNum,
                pdfX: (curPageX / pw) * pdfW,
                pdfY: pdfH - ((pageY + edH) / ph) * pdfH,
                pdfWidth: (edW / pw) * pdfW,
                pdfHeight: (edH / ph) * pdfH,
                fontSize: (fontSize / ph) * pdfH,
                fontFamily: fontFamily,
                fontWeight: fi.fontWeight,
                fontStyle: fi.fontStyle,
                color: fi.color,
                textDecoration: fi.textDecoration,
                scaleX: 1,
                textAlign: textAlign,
                richHtml: richHtml,
                richRuns: richRuns,
                originalText: originalText,
                newText: newText
              });

              editor.addEventListener('dblclick', function(){
                finalized = false;
                pendingTextFinalizers.push(finalize);
                editor.contentEditable = 'true';
                editor.classList.remove('finalized');
                textLayer.appendChild(toolbar);
                if(!resizeFrame.isConnected) textLayer.appendChild(resizeFrame);
                syncResizeFrame();
                editor.focus();
              });
              var editData = window.__pdfcraftTextEdits[window.__pdfcraftTextEdits.length - 1];
              textEditHistory.push({ editor: editor, cover: cover, toolbar: toolbar, resizeFrame: resizeFrame, spans: lineSpans, originalText: originalText, newText: newText, editData: editData });
              textEditRedoStack.length = 0;
              notifyUndoRedoState();
              notifyDirty();
            } else {
              toolbar.remove();
              if(resizeFrame && resizeFrame.parentNode) resizeFrame.remove();
              cover.remove();
              editor.remove();
              showTextSpans(lineSpans);
            }
          }

          editor.addEventListener('blur', function(){
            setTimeout(function(){
              if(toolbar.contains(document.activeElement)) return;
              if(resizeFrame && resizeFrame.querySelector(':hover')) return;
              finalize();
            }, 100);
          });
          editor.addEventListener('keydown', function(ev){
            if(ev.key === 'Escape'){
              finalized = true;
              var escIdx = pendingTextFinalizers.indexOf(finalize);
              if(escIdx >= 0) pendingTextFinalizers.splice(escIdx, 1);
              toolbar.remove();
              if(resizeFrame && resizeFrame.parentNode) resizeFrame.remove();
              cover.remove();
              editor.remove();
              showTextSpans(lineSpans);
              return;
            }
            if(ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)){
              ev.preventDefault();
              finalize();
            }
          });

          pendingTextFinalizers.push(finalize);
        }

        document.addEventListener('click', function(evt){
          if(!editTextActive) return;
          if(evt.target.closest && (evt.target.closest('.pdfcraft-text-editor') || evt.target.closest('.pdfcraft-text-toolbar') || evt.target.closest('.pdfcraft-text-resize-frame'))) return;
          var span = evt.target && evt.target.closest && (
            evt.target.closest('span[role="presentation"]') ||
            evt.target.closest('.textLayer > span:not(.markedContent)')
          );
          if(!span || !span.closest('.textLayer')) return;
          if(span.__pdfcraftEditing) return;
          evt.preventDefault();
          evt.stopPropagation();
          var lineSpans = collectLineSpans(span);
          createLineEditor(lineSpans, span);
          try{ closePopbar(); }catch(e){}
        }, true);

        document.addEventListener('dblclick', function(evt){
          if(!editTextActive) return;
          if(evt.target && evt.target.closest && evt.target.closest('.pdfcraft-text-editor')) return;
          evt.preventDefault();
          evt.stopPropagation();
          try{ closePopbar(); }catch(e){}
        }, true);

        document.addEventListener('mouseup', function(evt){
          if(!editTextActive) return;
          try{
            var sel = window.getSelection();
            if(sel && !sel.isCollapsed && !(evt.target && evt.target.closest && (
              evt.target.closest('.pdfcraft-text-editor') ||
              evt.target.closest('.pdfcraft-text-toolbar')
            ))){
              sel.removeAllRanges();
            }
          }catch(e){}
          try{ closePopbar(); }catch(e){}
        }, true);

        function setTool(toolName){
          try{
            if(toolName === 'editText'){
              setTextMarkupMode(false);
              setAnnotating(false);
              setEditTextMode(true);
              window.__pdfcraftActiveTool = 'editText';
              try{ window.parent.postMessage({ type:'pdfcraft-tool-changed', tool:'editText' }, '*'); }catch(e){}
              return true;
            }
            if(editTextActive) setEditTextMode(false);
            if(!toolName || !TOOL_SET[toolName]) return false;
            var isSelect = toolName === 'select';
            var isMarkup = !!TEXT_MARKUP[toolName];
            setTextMarkupMode(isMarkup);
            if(isSelect){
              hidePdfcraftStampPicker();
              setAnnotating(document.documentElement.classList.contains('pdfcraft-annotations-visible'));
              activateEditorMode(0);
              updateMarkupToolbarSelection('');
            } else {
              if(toolName !== 'select') document.documentElement.classList.add('pdfcraft-annotations-visible');
              setAnnotating(true);
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
          if(toolName === 'editText'){ setTool('editText'); return; }
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

        var UNDO_MAX = 40;
        var undoStack = [];
        var redoStack = [];
        var historyLock = false;
        var historyTimer = null;

        function cloneAnnotationList(){
          try { return JSON.parse(JSON.stringify(annotationList())); }
          catch(e){ return []; }
        }

        function snapshotsEqual(a, b){
          try { return JSON.stringify(a) === JSON.stringify(b); }
          catch(e){ return false; }
        }

        function commitHistoryNow(){
          if(historyLock) return;
          var snap = cloneAnnotationList();
          var top = undoStack[undoStack.length - 1];
          if(top && snapshotsEqual(top, snap)) return;
          undoStack.push(snap);
          if(undoStack.length > UNDO_MAX) undoStack.shift();
          redoStack.length = 0;
        }

        function scheduleHistoryPush(){
          if(historyLock) return;
          if(historyTimer) clearTimeout(historyTimer);
          historyTimer = setTimeout(function(){
            historyTimer = null;
            commitHistoryNow();
          }, 150);
        }

        function ensureAnnotationHistoryBaseline(){
          if(window.__pdfcraftHistoryInited || !getExtension()) return;
          window.__pdfcraftHistoryInited = true;
          undoStack = [cloneAnnotationList()];
        }

        function restoreAnnotationSnapshot(snap){
          historyLock = true;
          try{
            clearAllAnnotations();
            var ext = getExtension();
            var p = ext && ext.painter;
            if(!p) return;
            var pages = {};
            for(var i=0;i<snap.length;i++){
              try{
                p.saveToStore(snap[i], true);
                if(snap[i] && snap[i].pageNumber) pages[snap[i].pageNumber] = true;
              }catch(e){}
            }
            Object.keys(pages).forEach(function(pg){
              try{ p.reDrawAnnotation(Number(pg)); }catch(e){}
            });
            try{
              var cr = ext.customCommentRef && ext.customCommentRef.current;
              if(cr){
                if(typeof cr.clearAll === 'function') cr.clearAll();
                else if(typeof cr.reset === 'function') cr.reset();
                for(var j=0;j<snap.length;j++){
                  try{ cr.addAnnotation(snap[j]); }catch(e){}
                }
              }
            }catch(e){}
            hidePdfcraftStampPicker();
            setTextMarkupMode(false);
            setTool('select');
            try{ window.parent.postMessage({ type:'pdfcraft-tool-changed', tool:'select' }, '*'); }catch(e){}
            notifyDirty();
          } finally {
            historyLock = false;
          }
        }

        function performUndo(){
          ensureAnnotationHistoryBaseline();
          if(undoStack.length < 2) return false;
          var current = undoStack.pop();
          redoStack.push(current);
          restoreAnnotationSnapshot(undoStack[undoStack.length - 1]);
          return true;
        }

        function performRedo(){
          ensureAnnotationHistoryBaseline();
          if(!redoStack.length) return false;
          var next = redoStack.pop();
          undoStack.push(next);
          restoreAnnotationSnapshot(next);
          return true;
        }

        function dispatchEditorUndoRedo(isRedo){
          try{
            var app = window.PDFViewerApplication;
            var ui = app && (app._annotationEditorUIManager || (app.pdfViewer && app.pdfViewer._annotationEditorUIManager));
            if(ui){
              if(isRedo && typeof ui.redo === 'function'){ ui.redo(); return true; }
              if(!isRedo && typeof ui.undo === 'function'){ ui.undo(); return true; }
            }
          }catch(e){}
          document.dispatchEvent(new KeyboardEvent('keydown',{
            key:'z', code:'KeyZ', ctrlKey:true, shiftKey:!!isRedo, bubbles:true, cancelable:true
          }));
          return false;
        }

        function undoTextEdit(){
          if(!textEditHistory.length) return false;
          var entry = textEditHistory.pop();
          entry.editor.remove();
          entry.cover.remove();
          if(entry.resizeFrame) try{ entry.resizeFrame.remove(); }catch(e){}
          if(entry.toolbar) try{ entry.toolbar.remove(); }catch(e){}
          showTextSpans(entry.spans);
          var edits = window.__pdfcraftTextEdits;
          for(var j = edits.length - 1; j >= 0; j--){
            if(edits[j].originalText === entry.originalText && edits[j].newText === entry.newText){ edits.splice(j, 1); break; }
          }
          textEditRedoStack.push(entry);
          notifyUndoRedoState();
          return true;
        }

        function redoTextEdit(){
          if(!textEditRedoStack.length) return false;
          var entry = textEditRedoStack.pop();
          var page = entry.spans[0] && entry.spans[0].closest('.page');
          if(!page) return false;
          hideTextSpans(entry.spans);
          page.appendChild(entry.cover);
          page.appendChild(entry.editor);
          if(entry.resizeFrame) page.appendChild(entry.resizeFrame);
          if(entry.editData) window.__pdfcraftTextEdits.push(entry.editData);
          textEditHistory.push(entry);
          notifyUndoRedoState();
          return true;
        }

        window.pdfcraftUndo = function(){
          commitPendingTextEdits();
          if(undoTextEdit()) return;
          if(performUndo()) return;
          dispatchEditorUndoRedo(false);
        };
        window.pdfcraftRedo = function(){
          commitPendingTextEdits();
          if(redoTextEdit()) return;
          if(performRedo()) return;
          dispatchEditorUndoRedo(true);
        };

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
            try{ sel.removeAllRanges(); }catch(e){}
            return true;
          }catch(e){
            return false;
          }
        }

        window.pdfcraftSetAnnotationTool = setToolWithRetry;
        window.pdfcraftClearAllAnnotations = clearAllAnnotations;
        window.pdfcraftInvokeToolbarAction = invokeToolbarAction;
        function annotationDataList(ext){
          if(!ext || !ext.painter || typeof ext.painter.getData !== 'function') return [];
          var data = ext.painter.getData();
          if(Array.isArray(data)) return data;
          if(data && typeof data === 'object') return Object.values(data);
          return [];
        }

        async function exportViaExtension(ext){
          if(!ext || typeof ext.exportPdf !== 'function') return null;
          var captured = null;
          var origCreate = URL.createObjectURL;
          URL.createObjectURL = function(obj){
            var url = origCreate.call(URL, obj);
            if(obj instanceof Blob && obj.type === 'application/pdf') captured = obj;
            return url;
          };
          try{
            await ext.exportPdf();
            for(var attempt=0; attempt<40 && !captured; attempt++){
              await new Promise(function(resolve){ setTimeout(resolve, 100); });
            }
            try{
              document.querySelectorAll('.ant-modal-root, .ant-message-notice-wrapper').forEach(function(el){ el.remove(); });
            }catch(e){}
          } finally {
            URL.createObjectURL = origCreate;
          }
          if(!captured) return null;
          return await captured.arrayBuffer();
        }

        window.pdfcraftExportEditedPdf = async function(){
          try{
            var app = window.PDFViewerApplication;
            if(!app) return null;
            var ext = window.pdfjsAnnotationExtensionInstance;
            var annots = annotationDataList(ext);
            if(annots.length > 0){
              var merged = await exportViaExtension(ext);
              if(merged) return merged;
            }
            var doc = app.pdfDocument || (app.pdfViewer && app.pdfViewer.pdfDocument);
            if(!doc) return null;
            if(doc.annotationStorage && doc.annotationStorage.size > 0 && typeof doc.saveDocument === 'function'){
              var saved = await doc.saveDocument();
              if(saved) return saved;
            }
            if(typeof doc.getData === 'function') return await doc.getData();
          }catch(e){
            console.error('pdfcraftExportEditedPdf', e);
          }
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

        function selectMarkupAnnotation(ann){
          setTextMarkupMode(false);
          setTool('select');
          try{ window.parent.postMessage({ type:'pdfcraft-tool-changed', tool:'select' }, '*'); }catch(e){}
          var ext = getExtension();
          if(!ext) return;
          setTimeout(function(){
            if(ext.customerAnnotationMenuRef && ext.customerAnnotationMenuRef.current && typeof ext.customerAnnotationMenuRef.current.open === 'function'){
              ext.customerAnnotationMenuRef.current.open(ann, null);
            }
          }, 30);
        }

        var markupClickDownPos = null;
        document.addEventListener('pointerdown', function(evt){
          if(!document.documentElement.classList.contains('pdfcraft-text-markup')) return;
          markupClickDownPos = { x: evt.clientX, y: evt.clientY };
        }, true);
        document.addEventListener('click', function(evt){
          if(!document.documentElement.classList.contains('pdfcraft-text-markup')) return;
          if(!markupClickDownPos) return;
          var dx = evt.clientX - markupClickDownPos.x;
          var dy = evt.clientY - markupClickDownPos.y;
          markupClickDownPos = null;
          if(dx*dx + dy*dy > 25) return;
          var sel = window.getSelection();
          if(sel && !sel.isCollapsed) return;
          if(evt.target && evt.target.closest && evt.target.closest('.CustomToolbar')) return;
          if(evt.target && evt.target.closest && evt.target.closest('.CustomAnnotationMenu')) return;
          var mark = evt.target && evt.target.closest && evt.target.closest('mark[data-highlight-id]');
          if(mark){
            var hid = mark.getAttribute('data-highlight-id');
            if(hid){
              var items = annotationList();
              for(var i=0;i<items.length;i++){
                if(items[i] && items[i].id === hid){
                  selectMarkupAnnotation(items[i]);
                  return;
                }
              }
            }
          }
          var clickX = evt.clientX;
          var clickY = evt.clientY;
          var items2 = annotationList();
          for(var j=0;j<items2.length;j++){
            var ann = items2[j];
            if(!ann || !ann.konvaClientRect || !ann.pageNumber) continue;
            if(!TEXT_MARKUP[ann.name]) continue;
            var pageEl = document.querySelector('.pdfViewer .page[data-page-number="' + ann.pageNumber + '"] .konvajs-content') ||
              document.querySelector('[id$="_page_' + ann.pageNumber + '"] .konvajs-content');
            if(!pageEl) continue;
            var pr = pageEl.getBoundingClientRect();
            var ax = pr.left + ann.konvaClientRect.x;
            var ay = pr.top + ann.konvaClientRect.y;
            var aw = ann.konvaClientRect.width;
            var ah = ann.konvaClientRect.height;
            if(clickX >= ax && clickX <= ax + aw && clickY >= ay && clickY <= ay + ah){
              selectMarkupAnnotation(ann);
              return;
            }
          }
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
              src={`/pdfjs-annotation-viewer/web/viewer.html?file=${encodeURIComponent(activeUrl)}&embedded=1#pagemode=none&zoom=page-width&ae_username=${encodeURIComponent('Bạn')}`}
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

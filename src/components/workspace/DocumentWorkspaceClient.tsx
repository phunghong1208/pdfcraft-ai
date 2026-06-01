'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload, Bot, ScanText, ZoomIn, ZoomOut, Maximize2, Minimize2,
  Eye, Highlighter, ArrowLeft, Save, Share2, FileDown,
  Type, FileText, FileSpreadsheet,
  Image, FileType, Plus, Trash2, RotateCw, Crop, LayoutGrid,
  ArrowLeftRight, Lock, Unlock, EyeOff, Pen, ShieldCheck,
  Languages, Layers, Scissors, Wrench,
  ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight,
  PanelRightOpen, PanelRightClose, X,
  Underline, Strikethrough, StickyNote, Square, Circle,
  PenTool, Stamp, Table, FileImage,
  Undo2, Redo2, Printer, Settings,
  FileCheck, PenSquare, MessageCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EditPDFTool } from '@/components/tools/edit-pdf/EditPDFTool';
import { PageThumbnails } from '@/components/workspace/PageThumbnails';
import { type Locale } from '@/lib/i18n/config';
import { peekUploadedPdf, setUploadedPdf } from '@/lib/document-session';
import {
  coverPageCanvasSeams,
  injectPdfViewerChrome,
  lockPdfViewerSidebar,
  attachKonvaSeamGuard,
  snapPdfViewerScale,
  stripPdfViewerSeams,
} from '@/lib/pdf-viewer-chrome';

interface DocumentWorkspaceClientProps {
  locale: Locale;
}

type RibbonTabKey = 'home' | 'edit' | 'page' | 'comment' | 'convert' | 'tool' | 'fillsign' | 'protect' | 'ai';

type RibbonToolDef = {
  icon: LucideIcon;
  label: string;
  href?: string;
  action?: string;
};

type RibbonGroupDef = {
  label: string;
  tools: RibbonToolDef[];
};

function getRibbonGroups(tab: RibbonTabKey, locale: string): RibbonGroupDef[] {
  const TOOL_SLUG_ALIAS: Record<string, string> = {
    compress: 'compress-pdf',
    ocr: 'ocr-pdf',
    merge: 'merge-pdf',
    split: 'split-pdf',
    crop: 'crop-pdf',
    rotate: 'rotate-pdf',
    delete: 'delete-pages',
    extract: 'extract-pages',
    organize: 'organize-pdf',
    reverse: 'reverse-pages',
    watermark: 'add-watermark',
    stamps: 'add-stamps',
    repair: 'repair-pdf',
    flatten: 'flatten-pdf',
    encrypt: 'encrypt-pdf',
    decrypt: 'decrypt-pdf',
  };
  const t = (slug: string) => `/${locale}/tools/${TOOL_SLUG_ALIAS[slug] ?? slug}`;

  switch (tab) {
    case 'home':
      return [
        {
          label: 'View',
          tools: [
            { icon: ZoomIn, label: 'Zoom In', action: 'zoomIn' },
            { icon: ZoomOut, label: 'Zoom Out', action: 'zoomOut' },
            { icon: Maximize2, label: 'Fit Page', action: 'fitPage' },
          ],
        },
        {
          label: 'Edit',
          tools: [
            { icon: PenSquare, label: 'Edit PDF', action: 'switchToEdit' },
            { icon: Minimize2, label: 'Compress', href: t('compress') },
            { icon: ScanText, label: 'OCR', href: t('ocr') },
          ],
        },
        {
          label: 'Organize',
          tools: [
            { icon: Layers, label: 'Merge', href: t('merge') },
            { icon: Scissors, label: 'Split', href: t('split') },
          ],
        },
        {
          label: 'Output',
          tools: [
            { icon: Printer, label: 'Print', action: 'print' },
            { icon: Save, label: 'Save', action: 'save' },
            { icon: FileDown, label: 'Export', action: 'export' },
          ],
        },
      ];

    case 'edit':
      return [
        {
          label: 'History',
          tools: [
            { icon: Undo2, label: 'Undo', action: 'undo' },
            { icon: Redo2, label: 'Redo', action: 'redo' },
          ],
        },
        {
          label: 'Page',
          tools: [
            { icon: Crop, label: 'Crop Pages', href: t('crop') },
            { icon: RotateCw, label: 'Rotate', href: t('rotate') },
            { icon: Plus, label: 'Add Page', href: t('add-blank-page') },
            { icon: Trash2, label: 'Delete Page', href: t('delete') },
          ],
        },
        {
          label: 'Insert',
          tools: [
            { icon: Eye, label: 'Watermark', href: t('watermark') },
            { icon: Type, label: 'Header/Footer', href: t('header-footer') },
            { icon: FileType, label: 'Page Numbers', href: t('page-numbers') },
            { icon: Image, label: 'Background', href: t('background-color') },
          ],
        },
        {
          label: 'Save',
          tools: [
            { icon: Save, label: 'Save', action: 'save' },
            { icon: FileDown, label: 'Export', action: 'export' },
          ],
        },
      ];

    case 'page':
      return [
        {
          label: 'Pages',
          tools: [
            { icon: Plus, label: 'Add Page', href: t('add-blank-page') },
            { icon: Trash2, label: 'Delete', href: t('delete') },
            { icon: FileDown, label: 'Extract', href: t('extract') },
            { icon: LayoutGrid, label: 'Organize', href: t('organize') },
          ],
        },
        {
          label: 'Transform',
          tools: [
            { icon: RotateCw, label: 'Rotate', href: t('rotate') },
            { icon: Crop, label: 'Crop', href: t('crop') },
            { icon: ArrowLeftRight, label: 'Reverse', href: t('reverse') },
          ],
        },
        {
          label: 'Combine',
          tools: [
            { icon: Layers, label: 'Merge', href: t('merge') },
            { icon: Scissors, label: 'Split', href: t('split') },
          ],
        },
      ];

    case 'comment':
      return [
        {
          label: 'History',
          tools: [
            { icon: Undo2, label: 'Undo', action: 'undo' },
            { icon: Redo2, label: 'Redo', action: 'redo' },
          ],
        },
        {
          label: 'Markup',
          tools: [
            { icon: Highlighter, label: 'Highlight', action: 'annot:highlight' },
            { icon: Underline, label: 'Underline', action: 'annot:underline' },
            { icon: Strikethrough, label: 'Strikeout', action: 'annot:strikeout' },
          ],
        },
        {
          label: 'Drawing',
          tools: [
            { icon: PenTool, label: 'Freehand', action: 'annot:freehand' },
            { icon: Square, label: 'Rectangle', action: 'annot:rectangle' },
            { icon: Circle, label: 'Circle', action: 'annot:circle' },
            { icon: Type, label: 'Text', action: 'annot:freeText' },
          ],
        },
        {
          label: 'Objects',
          tools: [
            { icon: StickyNote, label: 'Note', action: 'annot:note' },
            { icon: Stamp, label: 'Stamp', action: 'annot:stamp' },
            { icon: Pen, label: 'Signature', action: 'annot:signature' },
          ],
        },
        {
          label: 'Manage',
          tools: [
            { icon: Trash2, label: 'Remove All', href: t('remove-annotations') },
            { icon: Save, label: 'Save', action: 'save' },
            { icon: FileDown, label: 'Export', action: 'export' },
          ],
        },
      ];

    case 'convert':
      return [
        {
          label: 'Export',
          tools: [
            { icon: FileText, label: 'PDF to Word', href: t('pdf-to-docx') },
            { icon: FileSpreadsheet, label: 'PDF to Excel', href: t('pdf-to-excel') },
            { icon: FileImage, label: 'PDF to PPT', href: t('pdf-to-pptx') },
            { icon: Image, label: 'PDF to Image', href: t('pdf-to-image') },
            { icon: FileType, label: 'PDF to TXT', href: t('pdf-to-markdown') },
          ],
        },
        {
          label: 'Import',
          tools: [
            { icon: Image, label: 'Image to PDF', href: t('image-to-pdf') },
            { icon: FileText, label: 'Word to PDF', href: t('word-to-pdf') },
            { icon: FileSpreadsheet, label: 'Excel to PDF', href: t('excel-to-pdf') },
          ],
        },
        {
          label: 'Extract',
          tools: [
            { icon: Type, label: 'Extract Text', href: t('extract') },
            { icon: Table, label: 'Extract Tables', href: t('extract-tables') },
            { icon: Image, label: 'Extract Images', href: t('extract-images') },
          ],
        },
      ];

    case 'tool':
      return [
        {
          label: 'Process',
          tools: [
            { icon: ScanText, label: 'OCR', href: t('ocr') },
            { icon: Minimize2, label: 'Compress', href: t('compress') },
            { icon: Wrench, label: 'Repair', href: t('repair') },
          ],
        },
        {
          label: 'Watermark',
          tools: [
            { icon: Eye, label: 'Watermark', href: t('watermark') },
            { icon: Stamp, label: 'Stamps', href: t('stamps') },
          ],
        },
        {
          label: 'Advanced',
          tools: [
            { icon: FileCheck, label: 'Compare', href: t('compare-pdfs') },
            { icon: Settings, label: 'Metadata', href: t('edit-metadata') },
            { icon: Layers, label: 'Flatten', href: t('flatten') },
          ],
        },
      ];

    case 'fillsign':
      return [
        {
          label: 'Fill',
          tools: [
            { icon: PenSquare, label: 'Form Filler', href: t('form-filler') },
            { icon: LayoutGrid, label: 'Form Creator', href: t('form-creator') },
          ],
        },
        {
          label: 'Sign',
          tools: [
            { icon: Pen, label: 'Sign', href: t('sign') },
            { icon: ShieldCheck, label: 'Digital Sign', href: t('digital-sign') },
            { icon: FileCheck, label: 'Validate', href: t('validate-signature') },
          ],
        },
      ];

    case 'protect':
      return [
        {
          label: 'Security',
          tools: [
            { icon: Lock, label: 'Encrypt', href: t('encrypt') },
            { icon: Unlock, label: 'Decrypt', href: t('decrypt') },
          ],
        },
        {
          label: 'Redact',
          tools: [
            { icon: EyeOff, label: 'Redact', href: t('find-and-redact') },
            { icon: Trash2, label: 'Remove Metadata', href: t('remove-metadata') },
          ],
        },
        {
          label: 'Permissions',
          tools: [
            { icon: Settings, label: 'Permissions', href: t('change-permissions') },
          ],
        },
      ];

    case 'ai':
      return [
        {
          label: 'AI Tools',
          tools: [
            { icon: MessageCircle, label: 'Chat PDF', href: `/${locale}/chat-pdf` },
            { icon: FileText, label: 'Summarize', href: `/${locale}/ai-summary` },
            { icon: Languages, label: 'Translate', href: `/${locale}/ai-translate` },
            { icon: ScanText, label: 'Smart OCR', href: `/${locale}/smart-ocr` },
          ],
        },
      ];

    default:
      return [];
  }
}

type PdfViewerApp = {
  initializedPromise?: Promise<void>;
  pdfSidebar?: { isOpen?: boolean; open?: () => void; toggle?: () => void; close?: () => void };
  pdfViewer?: {
    currentScale: number;
    currentScaleValue: string;
    scrollMode?: number;
    removePageBorders?: boolean;
    update?: () => void;
  };
  eventBus?: { on: (name: string, fn: (e: { scale: number }) => void) => void };
};

function getPdfApp(iframe: HTMLIFrameElement | null) {
  return iframe?.contentWindow as (Window & { PDFViewerApplication?: PdfViewerApp }) | null;
}

function patchViewerIframe(
  iframe: HTMLIFrameElement,
  opts?: { scaleOnLoad?: boolean; onScaleChange?: (pct: number) => void },
) {
  try {
    const doc = iframe.contentDocument;
    if (!doc) return;

    injectPdfViewerChrome(doc);

    const win = getPdfApp(iframe);
    const app = win?.PDFViewerApplication;
    if (!app) return;

    const setup = () => {
      const pdfViewer = app.pdfViewer;
      if (!pdfViewer) return;

      pdfViewer.removePageBorders = true;

      const applyScale100 = () => {
        pdfViewer.currentScale = snapPdfViewerScale(1);
        if (typeof pdfViewer.scrollMode !== 'undefined') {
          pdfViewer.scrollMode = 0;
        }
        opts?.onScaleChange?.(100);
        const container = doc.getElementById('viewerContainer');
        if (container) container.scrollTop = 0;
      };

      const refreshPages = () => {
        lockPdfViewerSidebar(doc, app);
        stripPdfViewerSeams(doc);
        pdfViewer.removePageBorders = true;
        doc.querySelector('.pdfViewer')?.classList.add('removePageBorders');
        requestAnimationFrame(() => coverPageCanvasSeams(doc));
      };

      const onPagesReady = () => {
        refreshPages();
        if (opts?.scaleOnLoad) applyScale100();
      };

      if (opts?.scaleOnLoad) {
        applyScale100();
        if (app.eventBus) {
          app.eventBus.on('pagesinit', onPagesReady);
          app.eventBus.on('pagerendered', refreshPages);
          app.eventBus.on('sidebarviewchanged', () => lockPdfViewerSidebar(doc, app));
        }
        requestAnimationFrame(onPagesReady);
        setTimeout(onPagesReady, 120);
        setTimeout(onPagesReady, 400);
        setTimeout(onPagesReady, 1200);
        setTimeout(onPagesReady, 2500);
      } else if (app.eventBus) {
        app.eventBus.on('pagesinit', refreshPages);
        app.eventBus.on('pagerendered', refreshPages);
        app.eventBus.on('sidebarviewchanged', () => lockPdfViewerSidebar(doc, app));
      }

      lockPdfViewerSidebar(doc, app);
      if (app.pdfSidebar) {
        const sidebar = app.pdfSidebar as { open?: () => void; toggle?: () => void };
        sidebar.open = () => lockPdfViewerSidebar(doc, app);
        sidebar.toggle = () => lockPdfViewerSidebar(doc, app);
      }

      attachKonvaSeamGuard(doc);

      const viewerRoot = doc.getElementById('viewer');
      if (viewerRoot && !doc.getElementById('pdfcraft-seam-observer')) {
        const marker = doc.createElement('span');
        marker.id = 'pdfcraft-seam-observer';
        marker.hidden = true;
        viewerRoot.appendChild(marker);
        let queued = false;
        const observer = new MutationObserver(() => {
          if (queued) return;
          queued = true;
          requestAnimationFrame(() => {
            queued = false;
            stripPdfViewerSeams(doc);
            coverPageCanvasSeams(doc);
          });
        });
        observer.observe(viewerRoot, { childList: true, subtree: true });
      }

      if (opts?.onScaleChange && app.eventBus) {
        app.eventBus.on('scalechanging', (evt) => {
          opts.onScaleChange?.(Math.round(evt.scale * 100));
          requestAnimationFrame(() => coverPageCanvasSeams(doc));
        });
      }
    };

    if (app.initializedPromise) {
      app.initializedPromise.then(setup);
    } else {
      setup();
    }
  } catch {
    // cross-origin or viewer not ready
  }
}

const TAB_LIST: { key: RibbonTabKey; label: string; icon: LucideIcon }[] = [
  { key: 'home', label: 'Home', icon: Eye },
  { key: 'edit', label: 'Edit', icon: PenSquare },
  { key: 'page', label: 'Page', icon: LayoutGrid },
  { key: 'comment', label: 'Comment', icon: Highlighter },
  { key: 'convert', label: 'Convert', icon: ArrowLeftRight },
  { key: 'tool', label: 'Tool', icon: Wrench },
  { key: 'fillsign', label: 'Fill & Sign', icon: Pen },
  { key: 'protect', label: 'Protect', icon: Lock },
  { key: 'ai', label: 'AI', icon: Bot },
];

export function DocumentWorkspaceClient({ locale }: DocumentWorkspaceClientProps) {
  const router = useRouter();
  const hasInitialized = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [zoom, setZoom] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const editorIframeRef = useRef<HTMLIFrameElement | null>(null);
  const viewerFitAppliedRef = useRef(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [activeTab, setActiveTab] = useState<RibbonTabKey>('home');
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

  const [aiTab, setAiTab] = useState<'chat' | 'summary' | 'translate' | 'insights'>('chat');
  const [chatInput, setChatInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
    { role: 'assistant', text: 'This appears to be a 3-page document. I can summarize, translate, OCR, or extract tables.' },
  ]);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  /** Chỉ đổi khi file đổi — đổi tab Home/Edit/Convert không reload iframe */
  const viewerInstanceKey = file
    ? `${file.name}-${file.size}-${file.lastModified}`
    : 'no-document';
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const initialFile = peekUploadedPdf();
    if (initialFile) {
      setFile(initialFile);
      setIsBootstrapping(false);
      return;
    }
    router.replace(`/${locale}`);
  }, [locale, router]);

  function handleFileChange(nextFile: File | null) {
    setFile(nextFile);
    if (!nextFile) return;
    setUploadedPdf(nextFile);
  }

  const applyPdfZoom = useCallback((direction: 'in' | 'out' | 'fit') => {
    const pdfViewer = getPdfApp(editorIframeRef.current)?.PDFViewerApplication?.pdfViewer;
    if (!pdfViewer) {
      setZoom((z) => {
        if (direction === 'in') return Math.min(200, z + 10);
        if (direction === 'out') return Math.max(50, z - 10);
        return 100;
      });
      return;
    }

    if (direction === 'fit') {
      pdfViewer.currentScale = snapPdfViewerScale(1);
      setZoom(100);
      return;
    }

    const factor = direction === 'in' ? 1.1 : 1 / 1.1;
    const next = Math.max(0.25, Math.min(4, pdfViewer.currentScale * factor));
    pdfViewer.currentScaleValue = String(next);
    setZoom(Math.round(pdfViewer.currentScale * 100));
  }, []);

  const handleZoomIn = useCallback(() => applyPdfZoom('in'), [applyPdfZoom]);
  const handleZoomOut = useCallback(() => applyPdfZoom('out'), [applyPdfZoom]);

  const patchViewer = useCallback(
    (iframe: HTMLIFrameElement) => {
      const scaleOnLoad = !viewerFitAppliedRef.current;
      if (scaleOnLoad) viewerFitAppliedRef.current = true;

      patchViewerIframe(iframe, {
        scaleOnLoad,
        onScaleChange: setZoom,
      });
    },
    [],
  );

  useEffect(() => {
    viewerFitAppliedRef.current = false;
  }, [previewUrl, viewerInstanceKey]);

  // Keep zoom behavior consistent across ribbon tabs.
  // User expectation: switching tab should always show 100%.
  useEffect(() => {
    if (!previewUrl) return;
    applyPdfZoom('fit');
  }, [activeTab, previewUrl, applyPdfZoom]);

  const handlePageSelect = useCallback((page: number) => {
    setCurrentPage(page);
    try {
      const iframe = editorIframeRef.current;
      const win = iframe?.contentWindow as Window & { PDFViewerApplication?: { page: number } } | null;
      if (win?.PDFViewerApplication) {
        win.PDFViewerApplication.page = page;
      }
    } catch {
      // cross-origin or not ready
    }
  }, []);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'pdfcraft-page-change' && typeof e.data.page === 'number') {
        setCurrentPage(e.data.page);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const sendAnnotationToolToViewer = useCallback((tool: string) => {
    const win = editorIframeRef.current?.contentWindow as (Window & { pdfcraftSetAnnotationTool?: (t: string) => void }) | null;
    if (!win) return;
    try {
      if (typeof win.pdfcraftSetAnnotationTool === 'function') {
        win.pdfcraftSetAnnotationTool(tool);
        return;
      }
    } catch {
      // ignore
    }
    try {
      win.postMessage({ type: 'pdfcraft-set-annotation-tool', tool }, '*');
    } catch {
      // ignore
    }
  }, []);

  const handleRibbonAction = useCallback((action: string) => {
    const iframeWin = () => editorIframeRef.current?.contentWindow as (Window & Record<string, unknown>) | null;

    switch (action) {
      case 'zoomIn': handleZoomIn(); break;
      case 'zoomOut': handleZoomOut(); break;
      case 'fitPage':
        applyPdfZoom('fit');
        break;
      case 'undo':
        try { (iframeWin() as { pdfcraftUndo?: () => void } | null)?.pdfcraftUndo?.(); } catch { /* noop */ }
        break;
      case 'redo':
        try { (iframeWin() as { pdfcraftRedo?: () => void } | null)?.pdfcraftRedo?.(); } catch { /* noop */ }
        break;
      case 'print':
        try {
          editorIframeRef.current?.contentWindow?.print();
        } catch { window.print(); }
        break;
      case 'rotateCw':
        try {
          const win = iframeWin();
          const app = win?.PDFViewerApplication as { eventBus?: { dispatch: (name: string) => void }; pdfViewer?: { pagesRotation?: number } } | undefined;
          if (app?.eventBus?.dispatch) {
            app.eventBus.dispatch('rotatecw');
          } else if (app?.pdfViewer) {
            const current = app.pdfViewer.pagesRotation ?? 0;
            app.pdfViewer.pagesRotation = (current + 90) % 360;
          }
        } catch { /* noop */ }
        break;
      case 'save':
      case 'export':
        try {
          const win = iframeWin();
          const app = win?.PDFViewerApplication as { download?: () => void } | undefined;
          app?.download?.();
        } catch { /* noop */ }
        break;
      case 'switchToEdit':
        if (file) setUploadedPdf(file);
        setActiveTab('edit');
        break;
      case 'annot:highlight':
        sendAnnotationToolToViewer('highlight');
        setActiveTab('comment');
        break;
      case 'annot:underline':
        sendAnnotationToolToViewer('underline');
        setActiveTab('comment');
        break;
      case 'annot:strikeout':
        sendAnnotationToolToViewer('strikeout');
        setActiveTab('comment');
        break;
      case 'annot:freehand':
        sendAnnotationToolToViewer('freehand');
        setActiveTab('comment');
        break;
      case 'annot:rectangle':
        sendAnnotationToolToViewer('rectangle');
        setActiveTab('comment');
        break;
      case 'annot:circle':
        sendAnnotationToolToViewer('circle');
        setActiveTab('comment');
        break;
      case 'annot:freeText':
        sendAnnotationToolToViewer('freeText');
        setActiveTab('comment');
        break;
      case 'annot:note':
        sendAnnotationToolToViewer('note');
        setActiveTab('comment');
        break;
      case 'annot:stamp':
        sendAnnotationToolToViewer('stamp');
        setActiveTab('comment');
        break;
      case 'annot:signature':
        sendAnnotationToolToViewer('signature');
        setActiveTab('comment');
        break;
      default:
        break;
    }
  }, [handleZoomIn, handleZoomOut, applyPdfZoom, file, sendAnnotationToolToViewer]);

  const handleToolClick = useCallback((tool: RibbonToolDef) => {
    if (tool.href) {
      // In workspace mode, keep users in the current editing surface.
      // Clicking ribbon tools should not navigate to standalone upload pages.
      if (file) {
        setUploadedPdf(file);
        const slug = tool.href.split('/').filter(Boolean).pop() ?? '';

        if (slug === 'rotate-pdf') {
          handleRibbonAction('rotateCw');
          return;
        }

        if (slug === 'crop-pdf') {
          handleRibbonAction('annot:rectangle');
          setActiveTab('comment');
          return;
        }

        // For page-level tools, keep user in workspace and open left page panel.
        if ([
          'add-blank-page',
          'delete-pages',
          'extract-pages',
          'organize-pdf',
          'reverse-pages',
          'merge-pdf',
          'split-pdf',
        ].includes(slug)) {
          setShowThumbnails(true);
          setActiveTab('page');
          return;
        }

        setActiveTab('edit');
        return;
      }
      router.push(tool.href);
    } else if (tool.action) {
      handleRibbonAction(tool.action);
    }
  }, [file, router, handleRibbonAction]);

  function handleSendMessage() {
    const content = chatInput.trim();
    if (!content || isAiThinking) return;
    setMessages((prev) => [...prev, { role: 'user', text: content }]);
    setChatInput('');
    setIsAiThinking(true);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Got it. I am analyzing this page and preparing a concise answer with key points.' },
      ]);
      setIsAiThinking(false);
    }, 900);
  }

  const ribbonGroups = useMemo(() => getRibbonGroups(activeTab, locale), [activeTab, locale]);

  if (isBootstrapping) {
    return (
      <section className="min-h-screen flex items-center justify-center" style={{ background: '#1e2028' }}>
        <div className="p-6 border border-white/10 rounded-xl max-w-xl text-center bg-black/20">
          <div className="h-8 w-8 rounded-full border-2 border-blue-400 border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-sm text-white/70">Opening document workspace...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="h-screen flex flex-col text-white overflow-hidden" style={{ background: '#1e2028' }}>
      {/* ─── Tab Bar ─── */}
      <div className="flex items-center h-9 bg-[#2a2d35] border-b border-white/[0.06] px-2 shrink-0">
        <button
          type="button"
          onClick={() => router.push(`/${locale}`)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-white/50 hover:text-white hover:bg-white/[0.08] transition-all mr-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>

        <div className="w-px h-4 bg-white/[0.08] mr-2" />

        <span className="text-[12px] font-medium text-white/70 truncate max-w-[180px] mr-3">
          {file?.name || 'Untitled.pdf'}
        </span>

        <div className="w-px h-4 bg-white/[0.08] mr-1" />

        <nav className="flex items-center gap-0 overflow-x-auto">
          {TAB_LIST.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  if (file) setUploadedPdf(file);
                  setActiveTab(tab.key);
                  if (tab.key === 'ai') setIsRightPanelOpen(true);
                }}
                className={`relative px-3 py-1.5 text-[11px] whitespace-nowrap transition-all ${
                  active
                    ? 'text-white font-medium'
                    : 'text-white/45 hover:text-white/80 hover:bg-white/[0.04]'
                }`}
              >
                {tab.label}
                {active && (
                  <span className="absolute bottom-0 left-1 right-1 h-[2px] bg-blue-400 rounded-t" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex-1" />

        <div className="hidden md:flex items-center gap-1">
          <button
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-white/50 hover:text-white hover:bg-white/[0.06] transition-all text-[11px]"
            onClick={() => handleRibbonAction('save')}
          >
            <Save className="h-3 w-3" /> Save
          </button>
          <button
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-white/50 hover:text-white hover:bg-white/[0.06] transition-all text-[11px]"
            onClick={() => handleRibbonAction('export')}
          >
            <FileDown className="h-3 w-3" /> Export
          </button>
          <button className="inline-flex items-center gap-1 px-2 py-1 rounded text-white/50 hover:text-white hover:bg-white/[0.06] transition-all text-[11px]">
            <Share2 className="h-3 w-3" /> Share
          </button>
        </div>
      </div>

      {/* ─── Ribbon Toolbar (collapsible) ─── */}
      {ribbonGroups.length > 0 && (
      <div className="flex items-stretch h-[44px] bg-[#252830] border-b border-white/[0.06] px-2 shrink-0 overflow-x-auto">
        {ribbonGroups.map((group, gi) => (
          <div key={`${activeTab}-${gi}`} className="flex items-stretch">
            {gi > 0 && (
              <div className="flex items-center px-2">
                <div className="w-px h-10 bg-white/[0.08]" />
              </div>
            )}
            <div className="flex flex-col justify-between py-1">
              <div className="flex items-center gap-0.5">
                {group.tools.map((tool, ti) => {
                  const Icon = tool.icon;
                  return (
                    <button
                      key={ti}
                      type="button"
                      onClick={() => handleToolClick(tool)}
                      className="flex flex-col items-center justify-center gap-0.5 px-2.5 py-1 rounded-md hover:bg-white/[0.08] active:bg-white/[0.14] active:scale-95 transition-all min-w-[48px] cursor-pointer group"
                      title={tool.label}
                    >
                      <Icon className="h-5 w-5 text-white/75 group-hover:text-white transition-colors" />
                      <span className="text-[10px] leading-tight text-white/60 group-hover:text-white/90 whitespace-nowrap transition-colors">
                        {tool.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="text-[9px] text-white/25 text-center px-1 leading-none pb-0.5">
                {group.label}
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* ─── Main Content Area ─── */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Thumbnail Panel */}
        {showThumbnails && (
          <aside className="w-[148px] shrink-0 flex flex-col bg-[#1e2028]">
            <div className="flex items-center justify-between gap-1.5 px-2 py-2 border-b border-white/[0.06] shrink-0">
              <label className="inline-flex flex-1 items-center justify-center rounded-md border border-dashed border-white/10 p-2 cursor-pointer hover:bg-white/[0.04] hover:border-white/20 transition-all">
                <Upload className="h-4 w-4 text-blue-400/80" />
                <span className="sr-only">New PDF</span>
                <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)} />
              </label>
              <button
                type="button"
                onClick={() => setShowThumbnails(false)}
                className="p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all"
                title="Hide pages"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin">
              {previewUrl && (
                <PageThumbnails
                  pdfUrl={previewUrl}
                  currentPage={currentPage}
                  onPageSelect={handlePageSelect}
                  onPageCountChange={setPageCount}
                />
              )}
            </div>
          </aside>
        )}

        {/* Center: single annotation viewer (no remount on tab switch) */}
        <div className="flex-1 min-w-0 flex flex-col bg-[#16181d] overflow-hidden">
          <div className="relative flex-1 min-h-0 overflow-hidden">
            {!previewUrl && (
              <div className="absolute inset-0 flex items-center justify-center">
                <label className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-8 py-10 text-center cursor-pointer hover:bg-white/[0.05] hover:border-white/25 transition-all">
                  <Upload className="h-8 w-8 text-blue-300/80" />
                  <div>
                    <div className="text-[13px] font-medium text-white/80">Tải PDF để bắt đầu</div>
                    <div className="mt-1 text-[11px] text-white/45">Chọn file .pdf (sẽ mở ngay trong workspace)</div>
                  </div>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            )}
            {/* Annotation viewer: always mounted; ribbon only changes behavior */}
            {previewUrl && (
              <EditPDFTool
                key={viewerInstanceKey}
                className="absolute inset-0 h-full"
                immersive
                sourceFile={file}
                sourcePdfUrl={previewUrl}
                onIframeRef={(ref) => {
                  editorIframeRef.current = ref;
                  if (ref) patchViewer(ref);
                }}
              />
            )}
          </div>
        </div>

        {/* Right: AI Panel */}
        {isRightPanelOpen && (
          <aside className="w-[300px] shrink-0 flex flex-col bg-[#1e2028]">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] shrink-0">
              <span className="text-[12px] font-medium text-white/80">AI Assistant</span>
              <button
                type="button"
                onClick={() => setIsRightPanelOpen(false)}
                className="p-0.5 rounded text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            <div className="px-3 py-2 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2 text-[11px]">
                {(['chat', 'summary', 'translate', 'insights'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setAiTab(tab)}
                    className={`capitalize px-1.5 py-0.5 rounded ${
                      aiTab === tab ? 'text-blue-300 bg-blue-500/10' : 'text-white/50 hover:text-white/80'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-3 py-2 shrink-0">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                <div className="text-[10px] text-white/40">Detected</div>
                <div className="mt-1 text-[11px] text-white/70">
                  {pageCount > 0 ? `${pageCount}-page document` : 'Document loaded'}
                </div>
              </div>
            </div>

            <div className="px-3 py-1 space-y-1 shrink-0">
              {['Summarize', 'Translate', 'Extract tables', 'OCR'].map((label) => (
                <button
                  key={label}
                  className="block w-full rounded-lg border border-white/[0.06] px-2.5 py-1.5 text-left text-[11px] text-white/70 hover:bg-white/[0.04] hover:border-white/10 transition-all"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0 flex flex-col px-3 py-2">
              <div className="flex-1 overflow-auto space-y-2 pr-1">
                {messages.map((m, idx) => (
                  <div key={idx} className={`${m.role === 'assistant' ? 'text-white/70' : 'text-blue-200'} text-[11px]`}>
                    {m.text}
                  </div>
                ))}
                {isAiThinking && <div className="text-[10px] text-blue-300 animate-pulse">Thinking...</div>}
              </div>
              <div className="pt-2 border-t border-white/[0.06] flex items-center gap-2 shrink-0">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Ask about this document..."
                  className="flex-1 min-w-0 h-7 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-blue-400/30 transition-all"
                />
                <Button size="sm" onClick={handleSendMessage} className="h-7 px-2 text-[10px]">
                  Send
                </Button>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* ─── Bottom Status Bar ─── */}
      <div className="h-9 flex items-center justify-between bg-[#2a2d35] border-t border-white/[0.06] px-3 shrink-0 text-[12px]">
        {/* Left: Thumbnail toggle + page nav */}
        <div className="flex items-center gap-2">
          {!showThumbnails && (
            <button
              type="button"
              onClick={() => setShowThumbnails(true)}
              className="p-0.5 rounded text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-all"
              title="Show thumbnails"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => handlePageSelect(1)}
              disabled={currentPage <= 1}
              className="p-0.5 rounded text-white/40 hover:text-white/80 disabled:opacity-30 disabled:cursor-default transition-all"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handlePageSelect(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="p-0.5 rounded text-white/40 hover:text-white/80 disabled:opacity-30 disabled:cursor-default transition-all"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-center gap-1 px-1.5">
              <input
                type="text"
                value={currentPage}
                onChange={(e) => {
                  const p = parseInt(e.target.value);
                  if (p >= 1 && p <= pageCount) handlePageSelect(p);
                }}
                className="w-6 h-5 text-center bg-white/[0.06] border border-white/[0.08] rounded text-[11px] text-white/80 focus:outline-none focus:border-blue-400/40"
              />
              <span className="text-white/30">/</span>
              <span className="text-white/50 tabular-nums">{pageCount || '—'}</span>
            </div>
            <button
              onClick={() => handlePageSelect(Math.min(pageCount, currentPage + 1))}
              disabled={currentPage >= pageCount}
              className="p-0.5 rounded text-white/40 hover:text-white/80 disabled:opacity-30 disabled:cursor-default transition-all"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handlePageSelect(pageCount)}
              disabled={currentPage >= pageCount}
              className="p-0.5 rounded text-white/40 hover:text-white/80 disabled:opacity-30 disabled:cursor-default transition-all"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Center: info */}
        <div className="text-white/30 text-[10px]">
          {file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : ''}
        </div>

        {/* Right: Zoom + AI panel toggle */}
        <div className="flex items-center gap-2">
          <button
            className="p-1 rounded text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-all"
            onClick={() => setIsRightPanelOpen((prev) => !prev)}
            title="AI Assistant"
          >
            {isRightPanelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </button>
          <div className="flex items-center gap-1.5 ml-1">
            <button
              onClick={handleZoomOut}
              className="p-1 rounded text-white/40 hover:text-white/80 transition-all"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="w-10 text-center text-white/50 tabular-nums text-[11px]">{zoom}%</span>
            <button
              onClick={handleZoomIn}
              className="p-1 rounded text-white/40 hover:text-white/80 transition-all"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

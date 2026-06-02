'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Upload, ScanText, ZoomIn, ZoomOut, Maximize2, Minimize2,
  Eye, Highlighter, ArrowLeft, Save, Share2, FileDown,
  Type, FileText, FileSpreadsheet,
  Image, FileType, Plus, Trash2, RotateCw, Crop, LayoutGrid,
  ArrowLeftRight, Lock, Unlock, EyeOff, Pen, ShieldCheck,
  Languages, Layers, Scissors, Wrench,
  ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight,
  X,
  Underline, Strikethrough, StickyNote, Square, Circle,
  PenTool, Stamp, Table, FileImage,
  Undo2, Redo2, Printer, Settings,
  FileCheck, PenSquare,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EditPDFTool } from '@/components/tools/edit-pdf/EditPDFTool';
import { CompressPDFTool } from '@/components/tools/compress/CompressPDFTool';
import { OCRPDFTool } from '@/components/tools/ocr/OCRPDFTool';
import { MergePDFTool } from '@/components/tools/merge/MergePDFTool';
import { SplitPDFTool } from '@/components/tools/split/SplitPDFTool';
import { PDFToDocxTool } from '@/components/tools/pdf-to-docx';
import { PDFToExcelTool } from '@/components/tools/pdf-to-excel';
import { PDFToPptxTool } from '@/components/tools/pdf-to-pptx';
import { PDFToImageTool } from '@/components/tools/pdf-to-image';
import { PDFToMarkdownTool } from '@/components/tools/pdf-to-markdown';
import { PageThumbnails } from '@/components/workspace/PageThumbnails';
import { WorkspaceAIPanel } from '@/components/workspace/WorkspaceAIPanel';
import { WorkspaceAIIcon } from '@/components/workspace/WorkspaceAIIcon';
import { WorkspacePagesSidebarToggle } from '@/components/workspace/WorkspacePagesSidebarToggle';
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

type RibbonTabKey = 'home' | 'edit' | 'page' | 'comment' | 'convert' | 'tool' | 'fillsign' | 'protect';

type WorkspaceInlineTool =
  | 'compress'
  | 'ocr'
  | 'merge'
  | 'split'
  | 'pdf-to-docx'
  | 'pdf-to-excel'
  | 'pdf-to-pptx'
  | 'pdf-to-image'
  | 'pdf-to-markdown';

const WORKSPACE_PDF_EXPORT_SLUGS = new Set<string>([
  'pdf-to-docx',
  'pdf-to-excel',
  'pdf-to-pptx',
  'pdf-to-image',
  'pdf-to-markdown',
]);

function workspaceInlineToolTitleKey(tool: WorkspaceInlineTool): string {
  switch (tool) {
    case 'pdf-to-docx':
      return 'tools.pdfToWord';
    case 'pdf-to-excel':
      return 'tools.pdfToExcel';
    case 'pdf-to-pptx':
      return 'tools.pdfToPpt';
    case 'pdf-to-image':
      return 'tools.pdfToImage';
    case 'pdf-to-markdown':
      return 'tools.pdfToTxt';
    default:
      return `inlineTools.${tool}`;
  }
}

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

function getRibbonGroups(
  tab: RibbonTabKey,
  locale: string,
  tr: (key: string) => string,
): RibbonGroupDef[] {
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
          label: tr('groups.view'),
          tools: [
            { icon: ZoomIn, label: tr('tools.zoomIn'), action: 'zoomIn' },
            { icon: ZoomOut, label: tr('tools.zoomOut'), action: 'zoomOut' },
            { icon: Maximize2, label: tr('tools.fitPage'), action: 'fitPage' },
          ],
        },
        {
          label: tr('groups.process'),
          tools: [
            { icon: Minimize2, label: tr('tools.compress'), href: t('compress') },
            { icon: ScanText, label: tr('tools.ocr'), href: t('ocr') },
          ],
        },
        {
          label: tr('groups.organize'),
          tools: [
            { icon: Layers, label: tr('tools.merge'), href: t('merge') },
            { icon: Scissors, label: tr('tools.split'), href: t('split') },
          ],
        },
        {
          label: tr('groups.output'),
          tools: [
            { icon: Printer, label: tr('tools.print'), action: 'print' },
            { icon: Save, label: tr('tools.save'), action: 'save' },
            { icon: FileDown, label: tr('tools.export'), action: 'export' },
          ],
        },
      ];

    case 'edit':
      return [
        {
          label: tr('groups.history'),
          tools: [
            { icon: Undo2, label: tr('tools.undo'), action: 'undo' },
            { icon: Redo2, label: tr('tools.redo'), action: 'redo' },
          ],
        },
        {
          label: tr('groups.page'),
          tools: [
            { icon: Crop, label: tr('tools.cropPages'), href: t('crop') },
            { icon: RotateCw, label: tr('tools.rotate'), href: t('rotate') },
            { icon: Plus, label: tr('tools.addPage'), href: t('add-blank-page') },
            { icon: Trash2, label: tr('tools.deletePage'), href: t('delete') },
          ],
        },
        {
          label: tr('groups.insert'),
          tools: [
            { icon: Eye, label: tr('tools.watermark'), href: t('watermark') },
            { icon: Type, label: tr('tools.headerFooter'), href: t('header-footer') },
            { icon: FileType, label: tr('tools.pageNumbers'), href: t('page-numbers') },
            { icon: Image, label: tr('tools.background'), href: t('background-color') },
          ],
        },
        {
          label: tr('groups.save'),
          tools: [
            { icon: Save, label: tr('tools.save'), action: 'save' },
            { icon: FileDown, label: tr('tools.export'), action: 'export' },
          ],
        },
      ];

    case 'page':
      return [
        {
          label: tr('groups.pages'),
          tools: [
            { icon: Plus, label: tr('tools.addPage'), href: t('add-blank-page') },
            { icon: Trash2, label: tr('tools.delete'), href: t('delete') },
            { icon: FileDown, label: tr('tools.extract'), href: t('extract') },
            { icon: LayoutGrid, label: tr('tools.organize'), href: t('organize') },
          ],
        },
        {
          label: tr('groups.transform'),
          tools: [
            { icon: RotateCw, label: tr('tools.rotate'), href: t('rotate') },
            { icon: Crop, label: tr('tools.cropPages'), href: t('crop') },
            { icon: ArrowLeftRight, label: tr('tools.reverse'), href: t('reverse') },
          ],
        },
        {
          label: tr('groups.combine'),
          tools: [
            { icon: Layers, label: tr('tools.merge'), href: t('merge') },
            { icon: Scissors, label: tr('tools.split'), href: t('split') },
          ],
        },
      ];

    case 'comment':
      return [
        {
          label: tr('groups.history'),
          tools: [
            { icon: Undo2, label: tr('tools.undo'), action: 'undo' },
            { icon: Redo2, label: tr('tools.redo'), action: 'redo' },
          ],
        },
        {
          label: tr('groups.markup'),
          tools: [
            { icon: Highlighter, label: tr('tools.highlight'), action: 'annot:highlight' },
            { icon: Underline, label: tr('tools.underline'), action: 'annot:underline' },
            { icon: Strikethrough, label: tr('tools.strikeout'), action: 'annot:strikeout' },
          ],
        },
        {
          label: tr('groups.drawing'),
          tools: [
            { icon: PenTool, label: tr('tools.freehand'), action: 'annot:freehand' },
            { icon: Square, label: tr('tools.rectangle'), action: 'annot:rectangle' },
            { icon: Circle, label: tr('tools.circle'), action: 'annot:circle' },
            { icon: Type, label: tr('tools.text'), action: 'annot:freeText' },
          ],
        },
        {
          label: tr('groups.objects'),
          tools: [
            { icon: StickyNote, label: tr('tools.note'), action: 'annot:note' },
            { icon: Stamp, label: tr('tools.stamp'), action: 'annot:stamp' },
            { icon: Pen, label: tr('tools.signature'), action: 'annot:signature' },
          ],
        },
        {
          label: tr('groups.manage'),
          tools: [
            { icon: Trash2, label: tr('tools.removeAll'), href: t('remove-annotations') },
            { icon: Save, label: tr('tools.save'), action: 'save' },
            { icon: FileDown, label: tr('tools.export'), action: 'export' },
          ],
        },
      ];

    case 'convert':
      return [
        {
          label: tr('groups.export'),
          tools: [
            { icon: FileText, label: tr('tools.pdfToWord'), href: t('pdf-to-docx') },
            { icon: FileSpreadsheet, label: tr('tools.pdfToExcel'), href: t('pdf-to-excel') },
            { icon: FileImage, label: tr('tools.pdfToPpt'), href: t('pdf-to-pptx') },
            { icon: Image, label: tr('tools.pdfToImage'), href: t('pdf-to-image') },
            { icon: FileType, label: tr('tools.pdfToTxt'), href: t('pdf-to-markdown') },
          ],
        },
        {
          label: tr('groups.import'),
          tools: [
            { icon: Image, label: tr('tools.imageToPdf'), href: t('image-to-pdf') },
            { icon: FileText, label: tr('tools.wordToPdf'), href: t('word-to-pdf') },
            { icon: FileSpreadsheet, label: tr('tools.excelToPdf'), href: t('excel-to-pdf') },
          ],
        },
        {
          label: tr('groups.extract'),
          tools: [
            { icon: Type, label: tr('tools.extractText'), href: t('extract') },
            { icon: Table, label: tr('tools.extractTables'), href: t('extract-tables') },
            { icon: Image, label: tr('tools.extractImages'), href: t('extract-images') },
          ],
        },
      ];

    case 'tool':
      return [
        {
          label: tr('groups.process'),
          tools: [
            { icon: ScanText, label: tr('tools.ocr'), href: t('ocr') },
            { icon: Minimize2, label: tr('tools.compress'), href: t('compress') },
            { icon: Wrench, label: tr('tools.repair'), href: t('repair') },
          ],
        },
        {
          label: tr('groups.watermark'),
          tools: [
            { icon: Eye, label: tr('tools.watermark'), href: t('watermark') },
            { icon: Stamp, label: tr('tools.stamps'), href: t('stamps') },
          ],
        },
        {
          label: tr('groups.advanced'),
          tools: [
            { icon: FileCheck, label: tr('tools.compare'), href: t('compare-pdfs') },
            { icon: Settings, label: tr('tools.metadata'), href: t('edit-metadata') },
            { icon: Layers, label: tr('tools.flatten'), href: t('flatten') },
          ],
        },
      ];

    case 'fillsign':
      return [
        {
          label: tr('groups.fill'),
          tools: [
            { icon: PenSquare, label: tr('tools.formFiller'), href: t('form-filler') },
            { icon: LayoutGrid, label: tr('tools.formCreator'), href: t('form-creator') },
          ],
        },
        {
          label: tr('groups.sign'),
          tools: [
            { icon: Pen, label: tr('tools.sign'), href: t('sign') },
            { icon: ShieldCheck, label: tr('tools.digitalSign'), href: t('digital-sign') },
            { icon: FileCheck, label: tr('tools.validate'), href: t('validate-signature') },
          ],
        },
      ];

    case 'protect':
      return [
        {
          label: tr('groups.security'),
          tools: [
            { icon: Lock, label: tr('tools.encrypt'), href: t('encrypt') },
            { icon: Unlock, label: tr('tools.decrypt'), href: t('decrypt') },
          ],
        },
        {
          label: tr('groups.redact'),
          tools: [
            { icon: EyeOff, label: tr('tools.redact'), href: t('find-and-redact') },
            { icon: Trash2, label: tr('tools.removeMetadata'), href: t('remove-metadata') },
          ],
        },
        {
          label: tr('groups.permissions'),
          tools: [
            { icon: Settings, label: tr('tools.permissions'), href: t('change-permissions') },
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
  download?: (options?: Record<string, unknown>) => void | Promise<void>;
  save?: (options?: Record<string, unknown>) => void | Promise<void>;
  downloadOrSave?: (options?: Record<string, unknown>) => void | Promise<void>;
  triggerPrinting?: () => void;
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

const TAB_KEYS: { key: RibbonTabKey; icon: LucideIcon }[] = [
  { key: 'home', icon: Eye },
  { key: 'edit', icon: PenSquare },
  { key: 'page', icon: LayoutGrid },
  { key: 'comment', icon: Highlighter },
  { key: 'convert', icon: ArrowLeftRight },
  { key: 'tool', icon: Wrench },
  { key: 'fillsign', icon: Pen },
  { key: 'protect', icon: Lock },
];

export function DocumentWorkspaceClient({ locale }: DocumentWorkspaceClientProps) {
  const router = useRouter();
  const t = useTranslations('workspace');
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
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [workspaceTool, setWorkspaceTool] = useState<WorkspaceInlineTool | null>(null);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);

  useEffect(() => {
    if (file) setIsRightPanelOpen(true);
  }, [file]);
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
    pdfViewer.currentScale = snapPdfViewerScale(next);
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

  const handleEditorIframeRef = useCallback(
    (ref: HTMLIFrameElement | null) => {
      editorIframeRef.current = ref;
      if (ref) patchViewer(ref);
    },
    [patchViewer],
  );

  // Default zoom when a new document loads (not on every ribbon tab switch).
  useEffect(() => {
    if (!previewUrl) return;
    applyPdfZoom('fit');
  }, [previewUrl, applyPdfZoom]);

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
          const app = iframeWin()?.PDFViewerApplication as PdfViewerApp | undefined;
          if (app?.triggerPrinting) {
            app.triggerPrinting();
          } else {
            editorIframeRef.current?.contentWindow?.print();
          }
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
        try {
          const app = iframeWin()?.PDFViewerApplication as PdfViewerApp | undefined;
          if (app?.save) {
            void app.save();
          } else if (app?.downloadOrSave) {
            app.downloadOrSave();
          } else {
            app?.download?.();
          }
        } catch { /* noop */ }
        break;
      case 'export':
        try {
          const app = iframeWin()?.PDFViewerApplication as PdfViewerApp | undefined;
          if (app?.download) {
            void app.download();
          } else if (app?.downloadOrSave) {
            app.downloadOrSave();
          }
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

        if (slug === 'compress-pdf') {
          setWorkspaceTool('compress');
          return;
        }

        if (slug === 'ocr-pdf') {
          setWorkspaceTool('ocr');
          return;
        }

        if (slug === 'merge-pdf') {
          setWorkspaceTool('merge');
          return;
        }

        if (slug === 'split-pdf') {
          setWorkspaceTool('split');
          return;
        }

        if (WORKSPACE_PDF_EXPORT_SLUGS.has(slug)) {
          setWorkspaceTool(slug as WorkspaceInlineTool);
          return;
        }

        if (['image-to-pdf', 'word-to-pdf', 'excel-to-pdf'].includes(slug)) {
          router.push(tool.href);
          return;
        }

        // For page-level tools, keep user in workspace and open left page panel.
        if ([
          'add-blank-page',
          'delete-pages',
          'extract-pages',
          'organize-pdf',
          'reverse-pages',
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

  const tabList = useMemo(
    () => TAB_KEYS.map((tab) => ({ ...tab, label: t(`tabs.${tab.key}`) })),
    [t],
  );

  const ribbonGroups = useMemo(
    () => getRibbonGroups(activeTab, locale, (key) => t(key)),
    [activeTab, locale, t],
  );

  if (isBootstrapping) {
    return (
      <section className="min-h-screen flex items-center justify-center" style={{ background: '#1e2028' }}>
        <div className="p-6 border border-white/10 rounded-xl max-w-xl text-center bg-black/20">
          <div className="h-8 w-8 rounded-full border-2 border-blue-400 border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-sm text-white/70">{t('opening')}</p>
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
          {file?.name || t('untitled')}
        </span>

        <div className="w-px h-4 bg-white/[0.08] mr-1" />

        <nav className="flex items-center gap-0 overflow-x-auto">
          {tabList.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  if (file) setUploadedPdf(file);
                  setActiveTab(tab.key);
                }}
                className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] whitespace-nowrap transition-all ${
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
            <Save className="h-3 w-3" /> {t('header.save')}
          </button>
          <button
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-white/50 hover:text-white hover:bg-white/[0.06] transition-all text-[11px]"
            onClick={() => handleRibbonAction('export')}
          >
            <FileDown className="h-3 w-3" /> {t('header.export')}
          </button>
          <button className="inline-flex items-center gap-1 px-2 py-1 rounded text-white/50 hover:text-white hover:bg-white/[0.06] transition-all text-[11px]">
            <Share2 className="h-3 w-3" /> {t('header.share')}
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
                <span className="sr-only">{t('sidebar.newPdf')}</span>
                <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)} />
              </label>
              <WorkspacePagesSidebarToggle
                expanded
                variant="header"
                onClick={() => setShowThumbnails(false)}
                title={t('sidebar.hidePages')}
                aria-label={t('sidebar.hidePages')}
              />
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
                    <div className="text-[13px] font-medium text-white/80">{t('upload.title')}</div>
                    <div className="mt-1 text-[11px] text-white/45">{t('upload.description')}</div>
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
            {previewUrl && !showThumbnails && (
              <WorkspacePagesSidebarToggle
                expanded={false}
                variant="floating"
                onClick={() => setShowThumbnails(true)}
                title={t('sidebar.openPages')}
                aria-label={t('sidebar.openPages')}
                className="absolute left-2 top-2 z-20"
              />
            )}

            {previewUrl && !isRightPanelOpen && file && (
              <button
                type="button"
                onClick={() => setIsRightPanelOpen(true)}
                className="absolute right-0 top-1/2 z-20 -translate-y-1/2 flex items-center gap-2 rounded-l-xl border border-r-0 border-white/12 bg-[#0D1117]/95 py-2 pl-2.5 pr-2 shadow-[-6px_0_20px_rgba(0,0,0,0.35)] backdrop-blur-sm hover:bg-[#161B22] hover:border-white/20 transition-all"
                title={t('statusBar.aiAssistant')}
                aria-label={t('statusBar.aiAssistant')}
              >
                <WorkspaceAIIcon size="sm" />
                <span className="max-w-[4.5rem] text-[10px] font-medium leading-tight text-white/55 pr-0.5">
                  {t('statusBar.aiAssistant')}
                </span>
              </button>
            )}

            {previewUrl && (
              <EditPDFTool
                key={viewerInstanceKey}
                className="absolute inset-0 h-full"
                immersive
                sourceFile={file}
                sourcePdfUrl={previewUrl}
                onIframeRef={handleEditorIframeRef}
              />
            )}
          </div>
        </div>

        {isRightPanelOpen && file && (
          <WorkspaceAIPanel
            file={file}
            pageCount={pageCount}
            onClose={() => setIsRightPanelOpen(false)}
          />
        )}
      </div>

      {/* ─── Bottom Status Bar ─── */}
      <div className="h-9 flex items-center justify-between bg-[#2a2d35] border-t border-white/[0.06] px-3 shrink-0 text-[12px]">
        {/* Left: Thumbnail toggle + page nav */}
        <div className="flex items-center gap-2">
          {!showThumbnails && (
            <WorkspacePagesSidebarToggle
              expanded={false}
              variant="compact"
              onClick={() => setShowThumbnails(true)}
              title={t('sidebar.showThumbnails')}
              aria-label={t('sidebar.showThumbnails')}
            />
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

        {/* Right: Zoom */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
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

      {workspaceTool && file && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('inlineTools.dialogLabel')}
        >
          <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#252830] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 shrink-0">
              <h2 className="text-[13px] font-medium text-white/90">
                {t(workspaceInlineToolTitleKey(workspaceTool))}
              </h2>
              <button
                type="button"
                onClick={() => setWorkspaceTool(null)}
                className="rounded p-1 text-white/40 hover:bg-white/[0.06] hover:text-white/80 transition-all"
                aria-label={t('inlineTools.close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {workspaceTool === 'compress' && <CompressPDFTool initialFile={file} />}
              {workspaceTool === 'ocr' && <OCRPDFTool initialFile={file} />}
              {workspaceTool === 'merge' && <MergePDFTool initialFile={file} />}
              {workspaceTool === 'split' && <SplitPDFTool initialFile={file} />}
              {workspaceTool === 'pdf-to-docx' && <PDFToDocxTool initialFile={file} />}
              {workspaceTool === 'pdf-to-excel' && <PDFToExcelTool initialFile={file} />}
              {workspaceTool === 'pdf-to-pptx' && <PDFToPptxTool initialFile={file} />}
              {workspaceTool === 'pdf-to-image' && <PDFToImageTool initialFile={file} />}
              {workspaceTool === 'pdf-to-markdown' && <PDFToMarkdownTool initialFile={file} />}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

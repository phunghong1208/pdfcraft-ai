'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Upload, ScanText, Minimize2, ZoomIn, ZoomOut, Plus,
  FolderOpen,
  Eye, Highlighter, ArrowLeft, Save, Share2, FileDown,
  Type, FileText, FileSpreadsheet,
  Image, FileType, Trash2, RotateCw, Crop, LayoutGrid,
  ArrowLeftRight, Lock, Unlock, EyeOff, Pen, ShieldCheck,
  Languages, Layers, Scissors, Wrench,
  ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight,
  X,
  Underline, Strikethrough, Square, Circle,
  PenTool, Stamp, Table, FileImage,
  Undo2, Redo2, Printer, Settings,
  FileCheck, PenSquare, SquareStack, Link2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EditPDFTool } from '@/components/tools/edit-pdf/EditPDFTool';
import { CompressPDFTool } from '@/components/tools/compress/CompressPDFTool';
import { OCRPDFTool } from '@/components/tools/ocr/OCRPDFTool';
import { MergePDFTool } from '@/components/tools/merge/MergePDFTool';
import { RepairPDFTool } from '@/components/tools/repair/RepairPDFTool';
import { ComparePDFsTool } from '@/components/tools/compare-pdfs/ComparePDFsTool';
import { SplitPDFTool } from '@/components/tools/split/SplitPDFTool';
import { ExtractPagesTool } from '@/components/tools/extract/ExtractPagesTool';
import { OrganizePDFTool } from '@/components/tools/organize/OrganizePDFTool';
import { CropPDFTool } from '@/components/tools/crop/CropPDFTool';
import { ReversePagesTool } from '@/components/tools/reverse/ReversePagesTool';
import { WatermarkTool } from '@/components/tools/watermark/WatermarkTool';
import { HeaderFooterTool } from '@/components/tools/header-footer/HeaderFooterTool';
import { PageNumbersTool } from '@/components/tools/page-numbers/PageNumbersTool';
import { BackgroundColorTool } from '@/components/tools/background-color/BackgroundColorTool';
import { WORKSPACE_INLINE_TOOL_SHELL_CLASS } from '@/lib/workspace-inline-tool-ui';
import { PDFToDocxTool } from '@/components/tools/pdf-to-docx';
import { PDFToExcelTool } from '@/components/tools/pdf-to-excel';
import { PDFToPptxTool } from '@/components/tools/pdf-to-pptx';
import { PDFToImageTool } from '@/components/tools/pdf-to-image';
import { PDFToMarkdownTool } from '@/components/tools/pdf-to-markdown';
import { FlattenPDFTool } from '@/components/tools/flatten/FlattenPDFTool';
import { ExtractTablesTool } from '@/components/tools/extract-tables/ExtractTablesTool';
import { ExtractImagesTool } from '@/components/tools/extract-images/ExtractImagesTool';
import { EditMetadataTool } from '@/components/tools/edit-metadata/EditMetadataTool';
import { FormFillerTool } from '@/components/tools/form-filler/FormFillerTool';
import { FormCreatorTool } from '@/components/tools/form-creator/FormCreatorTool';
import { DigitalSignPDFTool } from '@/components/tools/digital-sign/DigitalSignPDFTool';
import { ValidateSignatureTool } from '@/components/tools/validate-signature/ValidateSignatureTool';
import { EncryptPDFTool } from '@/components/tools/encrypt/EncryptPDFTool';
import { DecryptPDFTool } from '@/components/tools/decrypt/DecryptPDFTool';
import { FindAndRedactTool } from '@/components/tools/find-and-redact/FindAndRedactTool';
import { RemoveMetadataTool } from '@/components/tools/remove-metadata/RemoveMetadataTool';
import { ChangePermissionsTool } from '@/components/tools/change-permissions/ChangePermissionsTool';
import { PageThumbnails } from '@/components/workspace/PageThumbnails';
import { WorkspaceAIPanel } from '@/components/workspace/WorkspaceAIPanel';
import { WorkspaceAIIcon } from '@/components/workspace/WorkspaceAIIcon';
import { WorkspacePagesSidebarToggle } from '@/components/workspace/WorkspacePagesSidebarToggle';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { type Locale } from '@/lib/i18n/config';
import { peekUploadedPdf, setUploadedPdf } from '@/lib/document-session';
import { addBlankPages } from '@/lib/pdf/processors/add-blank-page';
import { deletePages } from '@/lib/pdf/processors/delete';
import {
  coverPageCanvasSeams,
  injectPdfViewerChrome,
  lockPdfViewerSidebar,
  attachKonvaSeamGuard,
  snapPdfViewerScale,
  fitPdfViewerPageWidth,
  fitPdfViewerPageFit,
  stripPdfViewerSeams,
} from '@/lib/pdf-viewer-chrome';

interface DocumentWorkspaceClientProps {
  locale: Locale;
}

type RibbonTabKey = 'home' | 'edit' | 'page' | 'comment' | 'convert' | 'tool' | 'fillsign' | 'protect';

const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200] as const;

type WorkspaceInlineTool =
  | 'compress'
  | 'ocr'
  | 'merge'
  | 'repair'
  | 'compare'
  | 'split'
  | 'extract-pages'
  | 'organize'
  | 'crop'
  | 'reverse'
  | 'watermark'
  | 'header-footer'
  | 'page-numbers'
  | 'background-color'
  | 'pdf-to-docx'
  | 'pdf-to-excel'
  | 'pdf-to-pptx'
  | 'pdf-to-image'
  | 'pdf-to-markdown'
  | 'flatten'
  | 'extract-tables'
  | 'extract-images'
  | 'stamps'
  | 'edit-metadata'
  | 'form-filler'
  | 'form-creator'
  | 'digital-sign'
  | 'validate-signature'
  | 'encrypt'
  | 'decrypt'
  | 'find-and-redact'
  | 'remove-metadata'
  | 'change-permissions';

const FILL_SIGN_INLINE_TOOLS = new Set<WorkspaceInlineTool>([
  'form-filler',
  'form-creator',
  'digital-sign',
  'validate-signature',
]);

const PROTECT_INLINE_TOOLS = new Set<WorkspaceInlineTool>([
  'encrypt',
  'decrypt',
  'find-and-redact',
  'remove-metadata',
  'change-permissions',
]);

/** Công cụ mở từ tab Edit / Page — không chuyển sang tab Tool. */
const EDIT_INLINE_TOOLS = new Set<WorkspaceInlineTool>([
  'watermark',
  'header-footer',
  'page-numbers',
  'background-color',
]);

function inlineRibbonTabForTool(inlineTool: WorkspaceInlineTool): RibbonTabKey {
  if (FILL_SIGN_INLINE_TOOLS.has(inlineTool)) return 'fillsign';
  if (PROTECT_INLINE_TOOLS.has(inlineTool)) return 'protect';
  if (EDIT_INLINE_TOOLS.has(inlineTool)) return 'edit';
  return 'tool';
}

/** Ribbon href slug → inline workspace tool (uses open PDF, no standalone upload page). */
const WORKSPACE_INLINE_BY_SLUG: Record<string, WorkspaceInlineTool> = {
  'merge-pdf': 'merge',
  'repair-pdf': 'repair',
  'compare-pdfs': 'compare',
  'compress-pdf': 'compress',
  'ocr-pdf': 'ocr',
  'split-pdf': 'split',
  'extract-pages': 'extract-pages',
  'flatten-pdf': 'flatten',
  'extract-tables': 'extract-tables',
  'extract-images': 'extract-images',
  'pdf-to-markdown': 'pdf-to-markdown',
  'pdf-to-docx': 'pdf-to-docx',
  'pdf-to-excel': 'pdf-to-excel',
  'pdf-to-pptx': 'pdf-to-pptx',
  'pdf-to-image': 'pdf-to-image',
  'add-watermark': 'watermark',
  'header-footer': 'header-footer',
  'page-numbers': 'page-numbers',
  'background-color': 'background-color',
  'organize-pdf': 'organize',
  'crop-pdf': 'crop',
  'reverse-pages': 'reverse',
  'edit-metadata': 'edit-metadata',
  'form-filler': 'form-filler',
  'form-creator': 'form-creator',
  'digital-sign': 'digital-sign',
  'validate-signature': 'validate-signature',
  'encrypt-pdf': 'encrypt',
  'decrypt-pdf': 'decrypt',
  'find-and-redact': 'find-and-redact',
  'remove-metadata': 'remove-metadata',
  'change-permissions': 'change-permissions',
};

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
    case 'watermark':
      return 'tools.watermark';
    case 'header-footer':
      return 'tools.headerFooter';
    case 'page-numbers':
      return 'tools.pageNumbers';
    case 'background-color':
      return 'tools.background';
    case 'extract-pages':
      return 'tools.extract';
    case 'organize':
      return 'tools.organize';
    case 'crop':
      return 'tools.cropPages';
    case 'reverse':
      return 'tools.reverse';
    case 'repair':
      return 'tools.repair';
    case 'compare':
      return 'tools.compare';
    case 'flatten':
      return 'tools.flatten';
    case 'extract-tables':
      return 'tools.extractTables';
    case 'extract-images':
      return 'tools.extractImages';
    case 'stamps':
      return 'tools.stamps';
    case 'edit-metadata':
      return 'tools.metadata';
    case 'form-filler':
      return 'tools.formFiller';
    case 'form-creator':
      return 'tools.formCreator';
    case 'digital-sign':
      return 'tools.digitalSign';
    case 'validate-signature':
      return 'tools.validate';
    case 'encrypt':
      return 'tools.encrypt';
    case 'decrypt':
      return 'tools.decrypt';
    case 'find-and-redact':
      return 'tools.redact';
    case 'remove-metadata':
      return 'tools.removeMetadata';
    case 'change-permissions':
      return 'tools.permissions';
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
    extractText: 'pdf-to-markdown',
    extractTables: 'extract-tables',
    extractImages: 'extract-images',
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
      return [];

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
          label: tr('groups.document'),
          tools: [
            { icon: Eye, label: tr('tools.watermark'), href: t('watermark') },
            { icon: Image, label: tr('tools.background'), href: t('background-color') },
            { icon: Type, label: tr('tools.headerFooter'), href: t('header-footer') },
            { icon: FileType, label: tr('tools.pageNumbers'), href: t('page-numbers') },
          ],
        },
      ];

    case 'page':
      return [
        {
          label: tr('groups.history'),
          tools: [
            { icon: Undo2, label: tr('tools.undo'), action: 'undo' },
            { icon: Redo2, label: tr('tools.redo'), action: 'redo' },
          ],
        },
        {
          label: tr('groups.pages'),
          tools: [
            { icon: Plus, label: tr('tools.addPage'), action: 'addPageInline' },
            { icon: Trash2, label: tr('tools.deletePage'), action: 'deletePageInline' },
            { icon: FileDown, label: tr('tools.extract'), href: t('extract') },
            { icon: LayoutGrid, label: tr('tools.reorderPages'), href: t('organize') },
            { icon: Scissors, label: tr('tools.split'), href: t('split') },
          ],
        },
        {
          label: tr('groups.transform'),
          tools: [
            { icon: RotateCw, label: tr('tools.rotate'), href: t('rotate') },
            { icon: Crop, label: tr('tools.cropPages'), href: t('crop') },
            { icon: ArrowLeftRight, label: tr('tools.reverseOrder'), href: t('reverse') },
          ],
        },
        {
          label: tr('groups.document'),
          tools: [
            { icon: Eye, label: tr('tools.watermark'), href: t('watermark') },
            { icon: Image, label: tr('tools.background'), href: t('background-color') },
            { icon: Type, label: tr('tools.headerFooter'), href: t('header-footer') },
            { icon: FileType, label: tr('tools.pageNumbers'), href: t('page-numbers') },
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
            { icon: Strikethrough, label: tr('tools.strikeout'), action: 'annot:strikeout' },
            { icon: Underline, label: tr('tools.underline'), action: 'annot:underline' },
          ],
        },
        {
          label: tr('groups.drawing'),
          tools: [
            { icon: Square, label: tr('tools.rectangle'), action: 'annot:rectangle' },
            { icon: Circle, label: tr('tools.circle'), action: 'annot:circle' },
            { icon: PenTool, label: tr('tools.freehand'), action: 'annot:freehand' },
            { icon: Type, label: tr('tools.textComment'), action: 'annot:freeText' },
          ],
        },
        {
          label: tr('groups.objects'),
          tools: [
            { icon: Stamp, label: tr('tools.stamp'), action: 'annot:stamp' },
          ],
        },
        {
          label: tr('groups.manage'),
          tools: [
            { icon: Trash2, label: tr('tools.clearComments'), action: 'annot:clearAll' },
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
      ];

    case 'tool':
      return [
        {
          label: tr('groups.process'),
          tools: [
            { icon: ScanText, label: tr('tools.ocr'), href: t('ocr') },
            { icon: Minimize2, label: tr('tools.compress'), action: 'openInlineCompress' },
            { icon: Wrench, label: tr('tools.repair'), href: t('repair') },
            { icon: Layers, label: tr('tools.merge'), href: t('merge') },
          ],
        },
        {
          label: tr('groups.advanced'),
          tools: [
            { icon: FileCheck, label: tr('tools.compare'), href: t('compare-pdfs') },
            { icon: Settings, label: tr('tools.metadata'), href: t('edit-metadata') },
            { icon: SquareStack, label: tr('tools.flatten'), href: t('flatten') },
          ],
        },
        {
          label: tr('groups.extract'),
          tools: [
            { icon: Table, label: tr('tools.extractTables'), href: t('extractTables') },
            { icon: Image, label: tr('tools.extractImages'), href: t('extractImages') },
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
            { icon: Pen, label: tr('tools.eSign'), action: 'annot:signature' },
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
            { icon: Lock, label: tr('tools.passwordProtect'), href: t('encrypt') },
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
  opts?: {
    scaleOnLoad?: boolean;
    onScaleChange?: (pct: number) => void;
    theme?: 'light' | 'dark';
    locale?: string;
  },
) {
  try {
    const doc = iframe.contentDocument;
    if (!doc) return;

    injectPdfViewerChrome(doc, 'pdfcraft-viewer-chrome', opts?.theme ?? 'light', opts?.locale);

    const win = getPdfApp(iframe);
    const app = win?.PDFViewerApplication;
    if (!app) return;

    const setup = () => {
      const pdfViewer = app.pdfViewer;
      if (!pdfViewer) return;

      pdfViewer.removePageBorders = true;

      const applyInitialZoom100 = () => {
        pdfViewer.currentScale = 1;
        pdfViewer.currentScaleValue = '1';
        pdfViewer.update?.();
        opts?.onScaleChange?.(Math.round((pdfViewer.currentScale ?? 1) * 100));
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
        if (opts?.scaleOnLoad) applyInitialZoom100();
      };

      if (opts?.scaleOnLoad) {
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

function WorkspaceHomeRibbon({
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomPreset,
  onFitWidth,
  onFitPage,
  onAction,
  t,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomPreset: (percent: number) => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  onAction: (action: string) => void;
  t: ReturnType<typeof useTranslations<'workspace'>>;
}) {
  const nearestPreset = ZOOM_PRESETS.reduce((prev, cur) =>
    Math.abs(cur - zoom) < Math.abs(prev - zoom) ? cur : prev,
  );

  return (
    <div className="ws-home-ribbon w-fit max-w-full px-2 pb-1.5 pt-0.5">
      <button type="button" className="ws-ribbon-icon-btn" onClick={() => onAction('openDocument')} title={t('tools.open')}>
        <FolderOpen className="h-3.5 w-3.5" />
        <span>{t('tools.open')}</span>
      </button>
      <button type="button" className="ws-ribbon-icon-btn" onClick={() => onAction('print')} title={t('tools.print')}>
        <Printer className="h-3.5 w-3.5" />
        <span>{t('tools.print')}</span>
      </button>

      <div className="ws-zoom-inline">
        <select
          className="ws-zoom-select"
          value={nearestPreset}
          onChange={(e) => onZoomPreset(Number(e.target.value))}
          aria-label={t('tools.zoom')}
        >
          {ZOOM_PRESETS.map((preset) => (
            <option key={preset} value={preset}>{preset}%</option>
          ))}
        </select>
        <button type="button" className="ws-ribbon-icon-btn ws-ribbon-icon-btn--icon" onClick={onZoomOut} aria-label={t('tools.zoomOut')}>
          <ZoomOut className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <button type="button" className="ws-ribbon-icon-btn ws-ribbon-icon-btn--icon" onClick={onZoomIn} aria-label={t('tools.zoomIn')}>
          <ZoomIn className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>

      <button type="button" className="ws-fit-btn" onClick={onFitWidth}>{t('tools.fitWidth')}</button>
      <button type="button" className="ws-fit-btn" onClick={onFitPage}>{t('tools.fitPage')}</button>
    </div>
  );
}

export function DocumentWorkspaceClient({ locale }: DocumentWorkspaceClientProps) {
  const router = useRouter();
  const t = useTranslations('workspace');
  const hasInitialized = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [zoom, setZoom] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const editorIframeRef = useRef<HTMLIFrameElement | null>(null);
  const openFileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingWorkspaceToolRef = useRef<WorkspaceInlineTool | null>(null);
  const pendingAnnotAfterLoadRef = useRef<'stamp' | 'signature' | null>(null);
  const viewerFitAppliedRef = useRef(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [activeTab, setActiveTab] = useState<RibbonTabKey>('home');
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [workspaceTool, setWorkspaceTool] = useState<WorkspaceInlineTool | null>(null);
  const [bgToolSession, setBgToolSession] = useState(0);
  const [documentRevision, setDocumentRevision] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const [activeAnnotTool, setActiveAnnotTool] = useState<string | null>(null);
  const [isWorkspaceDark, setIsWorkspaceDark] = useState(false);
  const inlineToolThemeVars = useMemo(
    () =>
      ({
        colorScheme: isWorkspaceDark ? 'dark' : 'light',
        ['--color-primary' as const]: isWorkspaceDark ? '0 72% 55%' : '0 72% 51%',
        ['--color-primary-foreground' as const]: '0 0% 100%',
        ['--color-primary-hover' as const]: isWorkspaceDark ? '0 72% 48%' : '0 72% 44%',
        ['--color-secondary' as const]: isWorkspaceDark ? '215 20% 20%' : '215 20% 90%',
        ['--color-secondary-foreground' as const]: isWorkspaceDark ? '210 40% 98%' : '215 25% 15%',
        ['--color-secondary-hover' as const]: isWorkspaceDark ? '215 20% 30%' : '215 20% 80%',
        ['--color-accent' as const]: isWorkspaceDark ? '0 72% 55%' : '0 72% 51%',
        ['--color-accent-foreground' as const]: '0 0% 100%',
        ['--color-background' as const]: isWorkspaceDark ? '222 47% 7%' : '210 40% 98%',
        ['--color-foreground' as const]: isWorkspaceDark ? '210 40% 98%' : '222 47% 11%',
        ['--color-muted' as const]: isWorkspaceDark ? '217 33% 13%' : '210 40% 96%',
        ['--color-muted-foreground' as const]: isWorkspaceDark ? '215 20% 65%' : '215 16% 47%',
        ['--color-card' as const]: isWorkspaceDark ? '222 47% 10%' : '0 0% 100%',
        ['--color-card-foreground' as const]: isWorkspaceDark ? '210 40% 98%' : '222 47% 11%',
        ['--color-border' as const]: isWorkspaceDark ? '217 33% 15%' : '214 32% 91%',
        ['--color-input' as const]: isWorkspaceDark ? '217 33% 15%' : '214 32% 91%',
        ['--color-ring' as const]: isWorkspaceDark ? '0 72% 55%' : '0 72% 51%',
      }) as CSSProperties,
    [isWorkspaceDark],
  );
  const fileHandleRef = useRef<{
    name: string;
    createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
    getFile?: () => Promise<File>;
  } | null>(null);
  /** Unmodified PDF used by background-color (not updated by inline tool applies). */
  const pristinePdfRef = useRef<File | null>(null);
  const docUndoStackRef = useRef<File[]>([]);
  const docRedoStackRef = useRef<File[]>([]);
  const DOC_HISTORY_MAX = 25;

  const previewUrlRef = useRef('');
  const previewUrl = useMemo(() => {
    if (!file) return '';
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    if (file) setIsRightPanelOpen(true);
  }, [file]);
  /** Chỉ đổi khi file đổi — đổi tab Home/Edit/Convert không reload iframe */
  const viewerInstanceKey = file
    ? `${file.name}-${file.size}-${file.lastModified}-r${documentRevision}`
    : 'no-document';
  useEffect(() => {
    const prev = previewUrlRef.current;
    if (prev && prev !== previewUrl) {
      URL.revokeObjectURL(prev);
    }
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (!previewUrlRef.current) return;
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = '';
    };
  }, [previewUrlRef]);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const initialFile = peekUploadedPdf();
    if (initialFile) {
      pristinePdfRef.current = initialFile;
      setFile(initialFile);
      setIsDirty(false);
      setIsBootstrapping(false);
      return;
    }
    router.replace(`/${locale}`);
  }, [locale, router]);

  const confirmDiscardUnsavedChanges = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm('Bạn có thay đổi chưa lưu. Bạn có muốn bỏ thay đổi và tiếp tục không?');
  }, [isDirty]);

  const handleFileChange = useCallback((nextFile: File | null, options?: { markDirty?: boolean }) => {
    setFile(nextFile);
    setIsDirty(Boolean(options?.markDirty));
    if (!nextFile) {
      pristinePdfRef.current = null;
      fileHandleRef.current = null;
      docUndoStackRef.current = [];
      docRedoStackRef.current = [];
      return;
    }
    if (options?.markDirty !== true) {
      pristinePdfRef.current = nextFile;
    }
    if (fileHandleRef.current?.name !== nextFile.name) {
      fileHandleRef.current = null;
    }
    setUploadedPdf(nextFile);
  }, []);

  const pushDocumentHistory = useCallback((snapshot: File | null) => {
    if (!snapshot) return;
    const stack = docUndoStackRef.current;
    const last = stack[stack.length - 1];
    if (last && last.size === snapshot.size && last.lastModified === snapshot.lastModified) return;
    stack.push(snapshot);
    if (stack.length > DOC_HISTORY_MAX) stack.shift();
    docRedoStackRef.current = [];
  }, []);

  const restoreDocumentSnapshot = useCallback(
    (snapshot: File) => {
      handleFileChange(snapshot, { markDirty: true });
      setDocumentRevision((r) => r + 1);
    },
    [handleFileChange],
  );

  const performDocumentUndo = useCallback((): boolean => {
    if (!file || docUndoStackRef.current.length === 0) return false;
    docRedoStackRef.current.push(file);
    const previous = docUndoStackRef.current.pop();
    if (!previous) return false;
    restoreDocumentSnapshot(previous);
    return true;
  }, [file, restoreDocumentSnapshot]);

  const performDocumentRedo = useCallback((): boolean => {
    if (!file || docRedoStackRef.current.length === 0) return false;
    docUndoStackRef.current.push(file);
    const next = docRedoStackRef.current.pop();
    if (!next) return false;
    restoreDocumentSnapshot(next);
    return true;
  }, [file, restoreDocumentSnapshot]);

  const resolveWritableHandle = useCallback(async (currentFileName: string) => {
    if (fileHandleRef.current) return fileHandleRef.current;
    const browserWindow = window as Window & {
      showSaveFilePicker?: (options?: {
        suggestedName?: string;
        types?: Array<{ description?: string; accept: Record<string, string[]> }>;
      }) => Promise<{
        name: string;
        createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
        getFile?: () => Promise<File>;
      }>;
      showOpenFilePicker?: (options?: {
        multiple?: boolean;
        types?: Array<{ description?: string; accept: Record<string, string[]> }>;
      }) => Promise<Array<{
        name: string;
        createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
        getFile?: () => Promise<File>;
      }>>;
    };

    if (browserWindow.showSaveFilePicker) {
      const handle = await browserWindow.showSaveFilePicker({
        suggestedName: currentFileName,
        types: [
          {
            description: 'PDF files',
            accept: { 'application/pdf': ['.pdf'] },
          },
        ],
      });
      fileHandleRef.current = handle;
      return handle;
    }

    if (browserWindow.showOpenFilePicker) {
      const handles = await browserWindow.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: 'PDF files',
            accept: { 'application/pdf': ['.pdf'] },
          },
        ],
      });
      const handle = handles[0];
      if (!handle) return null;
      fileHandleRef.current = handle;
      return handle;
    }

    return null;
  }, []);

  const navigateWithUnsavedCheck = useCallback((href: string) => {
    if (!confirmDiscardUnsavedChanges()) return;
    router.push(href);
  }, [confirmDiscardUnsavedChanges, router]);

  const downloadPdfFallback = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleFilePicked = useCallback((nextFile: File | null) => {
    if (!nextFile) return;
    if (!confirmDiscardUnsavedChanges()) return;
    handleFileChange(nextFile, { markDirty: false });
    const pending = pendingWorkspaceToolRef.current;
    if (pending) {
      pendingWorkspaceToolRef.current = null;
      setWorkspaceTool(pending);
      setActiveTab(inlineRibbonTabForTool(pending));
    }
  }, [confirmDiscardUnsavedChanges, handleFileChange]);

  const openWorkspaceInlineTool = useCallback(
    (inlineTool: WorkspaceInlineTool, activeTabKey?: RibbonTabKey) => {
      if (!file) {
        pendingWorkspaceToolRef.current = inlineTool;
        openFileInputRef.current?.click();
        return;
      }
      setUploadedPdf(file);
      setWorkspaceTool(inlineTool);
      if (activeTabKey) setActiveTab(activeTabKey);
    },
    [file],
  );

  const handleInlineToolFileUpdated = useCallback(
    (nextFile: File, options?: { keepDialogOpen?: boolean; markDirty?: boolean }) => {
      if (file) pushDocumentHistory(file);
      handleFileChange(nextFile, { markDirty: options?.markDirty ?? true });
      setDocumentRevision((r) => r + 1);
      if (!options?.keepDialogOpen) {
        setWorkspaceTool(null);
      }
    },
    [file, handleFileChange, pushDocumentHistory],
  );

  const applyPdfZoom = useCallback((direction: 'in' | 'out' | 'fitWidth' | 'fitPage') => {
    const app = getPdfApp(editorIframeRef.current)?.PDFViewerApplication;
    const pdfViewer = app?.pdfViewer;
    if (!pdfViewer) {
      setZoom((z) => {
        if (direction === 'in') return Math.min(200, z + 10);
        if (direction === 'out') return Math.max(50, z - 10);
        if (direction === 'fitWidth' || direction === 'fitPage') return 100;
        return z;
      });
      return;
    }

    if (direction === 'fitWidth') {
      fitPdfViewerPageWidth(pdfViewer);
      setZoom(Math.round((pdfViewer.currentScale ?? 1) * 100));
      return;
    }
    if (direction === 'fitPage') {
      fitPdfViewerPageFit(pdfViewer);
      setZoom(Math.round((pdfViewer.currentScale ?? 1) * 100));
      return;
    }

    // Prefer built-in PDF.js zoom handlers to keep UI state consistent.
    const zoomApp = app as { zoomIn?: (steps?: number) => void; zoomOut?: (steps?: number) => void; forceRendering?: () => void } | undefined;
    if (direction === 'in' && typeof zoomApp?.zoomIn === 'function') {
      zoomApp.zoomIn(1);
      zoomApp.forceRendering?.();
      setZoom(Math.round((pdfViewer.currentScale ?? 1) * 100));
      return;
    }
    if (direction === 'out' && typeof zoomApp?.zoomOut === 'function') {
      zoomApp.zoomOut(1);
      zoomApp.forceRendering?.();
      setZoom(Math.round((pdfViewer.currentScale ?? 1) * 100));
      return;
    }

    // Fallback for builds without zoomIn/zoomOut.
    const factor = direction === 'in' ? 1.1 : 1 / 1.1;
    const baseScale = typeof pdfViewer.currentScale === 'number' && Number.isFinite(pdfViewer.currentScale)
      ? pdfViewer.currentScale
      : 1;
    const next = snapPdfViewerScale(Math.max(0.25, Math.min(4, baseScale * factor)));
    pdfViewer.currentScale = next;
    pdfViewer.currentScaleValue = `${next}`;
    pdfViewer.update?.();
    zoomApp?.forceRendering?.();
    setZoom(Math.round(next * 100));
  }, []);

  const handleZoomIn = useCallback(() => applyPdfZoom('in'), [applyPdfZoom]);
  const handleZoomOut = useCallback(() => applyPdfZoom('out'), [applyPdfZoom]);
  const handleFitWidth = useCallback(() => applyPdfZoom('fitWidth'), [applyPdfZoom]);
  const handleFitPage = useCallback(() => applyPdfZoom('fitPage'), [applyPdfZoom]);

  const handleZoomPreset = useCallback((percent: number) => {
    const app = getPdfApp(editorIframeRef.current)?.PDFViewerApplication;
    const pdfViewer = app?.pdfViewer;
    if (!pdfViewer) {
      setZoom(percent);
      return;
    }
    const scale = percent / 100;
    pdfViewer.currentScale = scale;
    pdfViewer.currentScaleValue = `${scale}`;
    pdfViewer.update?.();
    (app as { forceRendering?: () => void } | undefined)?.forceRendering?.();
    setZoom(percent);
  }, []);

  const patchViewer = useCallback(
    (iframe: HTMLIFrameElement) => {
      const scaleOnLoad = !viewerFitAppliedRef.current;
      if (scaleOnLoad) viewerFitAppliedRef.current = true;

      patchViewerIframe(iframe, {
        scaleOnLoad,
        onScaleChange: setZoom,
        theme: isWorkspaceDark ? 'dark' : 'light',
        locale,
      });
    },
    [isWorkspaceDark, locale],
  );

  useEffect(() => {
    viewerFitAppliedRef.current = false;
  }, [previewUrl, viewerInstanceKey]);

  useEffect(() => {
    const iframe = editorIframeRef.current;
    if (iframe) patchViewer(iframe);
  }, [isWorkspaceDark, patchViewer]);

  const handleEditorIframeRef = useCallback(
    (ref: HTMLIFrameElement | null) => {
      editorIframeRef.current = ref;
      if (ref) patchViewer(ref);
    },
    [patchViewer],
  );

  // New documents start at 100%.
  useEffect(() => {
    if (!previewUrl) return;
    setZoom(100);
  }, [previewUrl, applyPdfZoom]);

  useEffect(() => {
    // Entering workspace from a scrolled page can leave viewport offset artifacts.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Sync workspace theme with global setting and ThemeToggle.
    const syncTheme = () => {
      try {
        const savedTheme = window.localStorage.getItem('theme');
        if (savedTheme === 'dark') {
          setIsWorkspaceDark(true);
          document.documentElement.classList.add('dark');
          return;
        }
        if (savedTheme === 'light') {
          setIsWorkspaceDark(false);
          document.documentElement.classList.remove('dark');
          return;
        }
      } catch {
        // ignore localStorage access errors
      }

      // Fallback to current document class / system preference.
      const prefersDark =
        document.documentElement.classList.contains('dark') ||
        window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      setIsWorkspaceDark(Boolean(prefersDark));
      if (prefersDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };
    syncTheme();
    window.addEventListener('storage', syncTheme);
    window.addEventListener('pdfcraft-theme-changed', syncTheme as EventListener);
    return () => {
      window.removeEventListener('storage', syncTheme);
      window.removeEventListener('pdfcraft-theme-changed', syncTheme as EventListener);
    };
  }, []);

  useEffect(() => {
    // Hard lock page scroll while workspace editor is active.
    const html = document.documentElement;
    const body = document.body;
    const appRoot = document.getElementById('__next');
    const isDarkTheme = html.classList.contains('dark');
    const scrollY = window.scrollY;
    const prevHtmlOverflow = html.style.overflow;
    const prevHtmlHeight = html.style.height;
    const prevHtmlBg = html.style.background;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyWidth = body.style.width;
    const prevBodyHeight = body.style.height;
    const prevBodyLeft = body.style.left;
    const prevBodyRight = body.style.right;
    const prevBodyBg = body.style.background;
    const prevAppOverflow = appRoot?.style.overflow ?? '';
    const prevAppHeight = appRoot?.style.height ?? '';
    const prevAppBg = appRoot?.style.background ?? '';

    html.style.setProperty('overflow', 'hidden', 'important');
    html.style.setProperty('height', '100%', 'important');
    body.style.setProperty('overflow', 'hidden', 'important');
    body.style.setProperty('position', 'fixed', 'important');
    body.style.setProperty('top', `-${scrollY}px`, 'important');
    body.style.setProperty('left', '0', 'important');
    body.style.setProperty('right', '0', 'important');
    body.style.setProperty('width', '100%', 'important');
    body.style.setProperty('height', '100%', 'important');
    if (!isDarkTheme) {
      html.style.setProperty('background', '#ffffff', 'important');
      body.style.setProperty('background', '#ffffff', 'important');
    }
    if (appRoot) {
      appRoot.style.setProperty('overflow', 'hidden', 'important');
      appRoot.style.setProperty('height', '100%', 'important');
      if (!isDarkTheme) {
        appRoot.style.setProperty('background', '#ffffff', 'important');
      }
    }

    return () => {
      html.style.overflow = prevHtmlOverflow;
      html.style.height = prevHtmlHeight;
      html.style.background = prevHtmlBg;
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.width = prevBodyWidth;
      body.style.height = prevBodyHeight;
      body.style.left = prevBodyLeft;
      body.style.right = prevBodyRight;
      body.style.background = prevBodyBg;
      if (appRoot) {
        appRoot.style.overflow = prevAppOverflow;
        appRoot.style.height = prevAppHeight;
        appRoot.style.background = prevAppBg;
      }
      window.scrollTo(0, scrollY);
    };
  }, []);

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
      if (e.data?.type === 'pdfcraft-dirty-change') {
        setIsDirty(true);
      }
      if (e.data?.type === 'pdfcraft-tool-changed' && typeof e.data.tool === 'string') {
        setActiveAnnotTool(e.data.tool === 'select' ? null : e.data.tool);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const sendAnnotationToolToViewer = useCallback((tool: string) => {
    const deliver = (attempt: number) => {
      const win = editorIframeRef.current?.contentWindow as
        | (Window & { pdfcraftSetAnnotationTool?: (t: string) => void })
        | null;
      if (!win) {
        if (attempt < 40) window.setTimeout(() => deliver(attempt + 1), 150);
        return;
      }
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
      if (attempt < 40) window.setTimeout(() => deliver(attempt + 1), 150);
    };
    deliver(0);
  }, []);

  useEffect(() => {
    const pendingAnnot = pendingAnnotAfterLoadRef.current;
    if (!file || !pendingAnnot) return;
    pendingAnnotAfterLoadRef.current = null;
    setActiveTab('comment');
    setActiveAnnotTool(pendingAnnot);
    const id = window.setTimeout(() => sendAnnotationToolToViewer(pendingAnnot), 500);
    return () => window.clearTimeout(id);
  }, [file, sendAnnotationToolToViewer]);

  const handleRibbonAction = useCallback((action: string) => {
    const iframeWin = () => editorIframeRef.current?.contentWindow as (Window & Record<string, unknown>) | null;

    switch (action) {
      case 'openDocument':
        openFileInputRef.current?.click();
        break;
      case 'zoomIn': handleZoomIn(); break;
      case 'zoomOut': handleZoomOut(); break;
      case 'fitPage':
        applyPdfZoom('fitPage');
        break;
      case 'fitWidth':
        applyPdfZoom('fitWidth');
        break;
      case 'undo': {
        const commentContext = activeTab === 'comment' || activeAnnotTool != null;
        if (!commentContext && performDocumentUndo()) break;
        try { (iframeWin() as { pdfcraftUndo?: () => void } | null)?.pdfcraftUndo?.(); } catch { /* noop */ }
        break;
      }
      case 'redo': {
        const commentContext = activeTab === 'comment' || activeAnnotTool != null;
        if (!commentContext && performDocumentRedo()) break;
        try { (iframeWin() as { pdfcraftRedo?: () => void } | null)?.pdfcraftRedo?.(); } catch { /* noop */ }
        break;
      }
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
        if (!file) break;
        void (async () => {
          try {
            const win = iframeWin() as (Window & { pdfcraftExportEditedPdf?: () => Promise<Uint8Array | ArrayBuffer | null> }) | null;
            const bytes = await win?.pdfcraftExportEditedPdf?.();
            let blob: Blob;
            if (bytes) {
              const arrayBuffer = bytes instanceof ArrayBuffer
                ? bytes
                : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
              const safeBuffer = arrayBuffer instanceof SharedArrayBuffer
                ? new Uint8Array(arrayBuffer).slice().buffer
                : arrayBuffer;
              blob = new Blob([safeBuffer], { type: 'application/pdf' });
            } else {
              blob = file;
            }
            const nextFile = new File([blob], file.name, {
              type: 'application/pdf',
              lastModified: Date.now(),
            });
            try {
              const handle = await resolveWritableHandle(file.name);
              if (!handle) {
                downloadPdfFallback(blob, file.name);
                window.alert('Trình duyệt chưa hỗ trợ lưu đè trực tiếp. Đã tải file PDF mới về máy.');
                handleFileChange(nextFile, { markDirty: false });
                return;
              }
              const writable = await handle.createWritable();
              await writable.write(blob);
              await writable.close();
            } catch (diskErr) {
              if ((diskErr as { name?: string })?.name === 'AbortError') {
                return;
              }
              downloadPdfFallback(blob, file.name);
              window.alert('Không thể ghi đè trực tiếp. Đã tải file PDF mới về máy.');
              handleFileChange(nextFile, { markDirty: false });
              return;
            }
            handleFileChange(nextFile, { markDirty: false });
          } catch {
            window.alert('Không thể lưu trực tiếp. Vui lòng thử lại.');
          }
        })();
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
      case 'addPageInline':
        if (!file) break;
        void (async () => {
          const inlineWin = iframeWin() as { pdfcraftInvokeToolbarAction?: (action: string) => boolean } | null;
          const invokedInline = inlineWin?.pdfcraftInvokeToolbarAction?.('addPage') ?? false;
          if (invokedInline) {
            const app = (iframeWin()?.PDFViewerApplication as { pagesCount?: number; pdfViewer?: { pagesCount?: number; currentPageNumber?: number } } | undefined);
            const nextPageCount = app?.pdfViewer?.pagesCount ?? app?.pagesCount;
            if (typeof nextPageCount === 'number' && nextPageCount > 0) {
              setPageCount(nextPageCount);
              setCurrentPage(app?.pdfViewer?.currentPageNumber ?? nextPageCount);
            }
            setShowThumbnails(true);
            setIsDirty(true);
            return;
          }
          try {
            const position = Math.max(0, pageCount);
            const output = await addBlankPages(file, position, 1);
            if (!output.success || !output.result) {
              throw new Error(output.error?.message || 'Không thể thêm trang.');
            }
            const blob = output.result as Blob;
            const nextFile = new File([blob], file.name, {
              type: 'application/pdf',
              lastModified: Date.now(),
            });
            pushDocumentHistory(file);
            handleFileChange(nextFile, { markDirty: true });
            setDocumentRevision((r) => r + 1);
            setCurrentPage(position + 1);
            setShowThumbnails(true);
          } catch (err) {
            window.alert(err instanceof Error ? err.message : 'Không thể thêm trang.');
          }
        })();
        break;
      case 'deletePageInline':
        if (!file) break;
        if (pageCount <= 1) {
          window.alert('PDF cần giữ lại ít nhất 1 trang.');
          break;
        }
        void (async () => {
          const inlineWin = iframeWin() as { pdfcraftInvokeToolbarAction?: (action: string) => boolean } | null;
          const invokedInline = inlineWin?.pdfcraftInvokeToolbarAction?.('deletePage') ?? false;
          if (invokedInline) {
            const app = (iframeWin()?.PDFViewerApplication as { pagesCount?: number; pdfViewer?: { pagesCount?: number; currentPageNumber?: number } } | undefined);
            const nextPageCount = app?.pdfViewer?.pagesCount ?? app?.pagesCount;
            if (typeof nextPageCount === 'number' && nextPageCount > 0) {
              setPageCount(nextPageCount);
              setCurrentPage(Math.max(1, app?.pdfViewer?.currentPageNumber ?? currentPage - 1));
            }
            setShowThumbnails(true);
            setIsDirty(true);
            return;
          }
          const pageToDelete = Math.min(Math.max(currentPage, 1), pageCount);
          try {
            const output = await deletePages(file, [pageToDelete]);
            if (!output.success || !output.result) {
              throw new Error(output.error?.message || 'Không thể xóa trang.');
            }
            const blob = output.result as Blob;
            const nextFile = new File([blob], file.name, {
              type: 'application/pdf',
              lastModified: Date.now(),
            });
            pushDocumentHistory(file);
            handleFileChange(nextFile, { markDirty: true });
            setDocumentRevision((r) => r + 1);
            setCurrentPage(Math.max(1, pageToDelete - 1));
            setShowThumbnails(true);
          } catch (err) {
            window.alert(err instanceof Error ? err.message : 'Không thể xóa trang.');
          }
        })();
        break;
      case 'switchToEdit':
        if (file) setUploadedPdf(file);
        setActiveTab('edit');
        break;
      case 'annot:highlight':
      case 'annot:underline':
      case 'annot:strikeout':
      case 'annot:freehand':
      case 'annot:rectangle':
      case 'annot:circle':
      case 'annot:freeText':
      case 'annot:stamp':
      case 'annot:signature':
      case 'annot:clearAll': {
        if (action === 'annot:clearAll') {
          if (!file) break;
          if (!window.confirm(t('textStyle.clearConfirm'))) break;
          setActiveTab('comment');
          const tryClear = (attempt: number) => {
            const win = editorIframeRef.current?.contentWindow as
              | (Window & { pdfcraftClearAllAnnotations?: () => boolean })
              | undefined;
            if (!win) {
              if (attempt < 40) window.setTimeout(() => tryClear(attempt + 1), 150);
              return;
            }
            let cleared = false;
            try {
              cleared = win.pdfcraftClearAllAnnotations?.() === true;
            } catch {
              // ignore
            }
            if (!cleared) {
              try {
                win.postMessage({ type: 'pdfcraft-clear-annotations' }, '*');
                cleared = true;
              } catch {
                // ignore
              }
            }
            if (cleared) {
              setIsDirty(true);
              setActiveAnnotTool(null);
              return;
            }
            if (attempt < 40) window.setTimeout(() => tryClear(attempt + 1), 150);
          };
          tryClear(0);
          break;
        }
        if (!file) {
          if (action === 'annot:stamp') pendingAnnotAfterLoadRef.current = 'stamp';
          if (action === 'annot:signature') pendingAnnotAfterLoadRef.current = 'signature';
          openFileInputRef.current?.click();
          break;
        }
        const tool = action.replace('annot:', '');
        const deselecting = activeAnnotTool === tool;
        sendAnnotationToolToViewer(deselecting ? 'select' : tool);
        setActiveAnnotTool(deselecting ? null : tool);
        if (!(tool === 'signature' && activeTab === 'fillsign')) {
          setActiveTab('comment');
        }
        break;
      }
      case 'openInlineCompress':
        if (file) {
          setWorkspaceTool('compress');
        } else {
          window.alert('Vui lòng mở PDF trước khi nén.');
        }
        break;
      default:
        break;
    }
  }, [
    handleZoomIn,
    handleZoomOut,
    applyPdfZoom,
    file,
    downloadPdfFallback,
    resolveWritableHandle,
    pageCount,
    currentPage,
    sendAnnotationToolToViewer,
    activeTab,
    activeAnnotTool,
    performDocumentUndo,
    performDocumentRedo,
    handleFileChange,
    pushDocumentHistory,
    t,
  ]);

  const handleToolClick = useCallback((tool: RibbonToolDef) => {
    if (tool.action) {
      handleRibbonAction(tool.action);
      return;
    }

    if (tool.href) {
      const slug = tool.href.split('/').filter(Boolean).pop() ?? '';
      const inlineTool = WORKSPACE_INLINE_BY_SLUG[slug];
      if (inlineTool) {
        if (slug === 'crop-pdf') {
          openWorkspaceInlineTool('crop', 'page');
          setShowThumbnails(true);
          return;
        }
        if (slug === 'organize-pdf') {
          openWorkspaceInlineTool('organize', 'page');
          setShowThumbnails(true);
          return;
        }
        if (slug === 'reverse-pages') {
          openWorkspaceInlineTool('reverse', 'page');
          setShowThumbnails(true);
          return;
        }
        if (slug === 'background-color') {
          setBgToolSession((n) => n + 1);
          openWorkspaceInlineTool('background-color', 'edit');
          return;
        }
        openWorkspaceInlineTool(
          inlineTool,
          activeTab === 'home' ? inlineRibbonTabForTool(inlineTool) : activeTab,
        );
        return;
      }

      // In workspace mode, keep users in the current editing surface.
      if (file) {
        setUploadedPdf(file);

        if (slug === 'rotate-pdf') {
          handleRibbonAction('rotateCw');
          return;
        }

        if (['image-to-pdf', 'word-to-pdf', 'excel-to-pdf'].includes(slug)) {
          navigateWithUnsavedCheck(tool.href);
          return;
        }

        navigateWithUnsavedCheck(tool.href);
        return;
      }
      navigateWithUnsavedCheck(tool.href);
    }
  }, [activeTab, file, handleRibbonAction, navigateWithUnsavedCheck, openWorkspaceInlineTool, sendAnnotationToolToViewer]);

  const tabList = useMemo(
    () => TAB_KEYS.map((tab) => ({ ...tab, label: t(`tabs.${tab.key}`) })),
    [t],
  );
  const previewHeavyTools = useMemo(
    () =>
      new Set<WorkspaceInlineTool>([
        'watermark',
        'header-footer',
        'page-numbers',
        'organize',
        'crop',
        'compare',
        'extract-images',
        'form-creator',
        'find-and-redact',
      ]),
    [],
  );
  const inlineDialogMaxWidthClass =
    workspaceTool === 'watermark' || workspaceTool === 'header-footer' || workspaceTool === 'page-numbers'
      ? 'max-w-5xl'
      : workspaceTool && previewHeavyTools.has(workspaceTool)
        ? 'max-w-6xl'
        : 'max-w-3xl';
  const inlineDialogMaxHeightClass =
    workspaceTool === 'watermark' ? 'max-h-[90vh]' : 'max-h-[90vh]';

  const ribbonGroups = useMemo(
    () => getRibbonGroups(activeTab, locale, (key) => t(key)),
    [activeTab, locale, t],
  );

  if (isBootstrapping) {
    return (
      <section className="min-h-screen flex items-center justify-center bg-[hsl(var(--color-background))] dark:bg-[#1e2028]">
        <div className="p-6 border border-[hsl(var(--color-border))] dark:border-white/10 rounded-xl max-w-xl text-center bg-[hsl(var(--color-card))] dark:bg-black/20">
          <div className="h-8 w-8 rounded-full border-2 border-[hsl(var(--color-primary))] border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-sm text-[hsl(var(--color-muted-foreground))] dark:text-white/70">{t('opening')}</p>
        </div>
      </section>
    );
  }

  return (
    <section className={`workspace-shell ${isWorkspaceDark ? 'workspace-shell--dark text-white bg-[#1e2028]' : 'workspace-shell--light text-[hsl(var(--color-foreground))] bg-[#F1F5F9]'} fixed inset-0 z-40 flex flex-col overflow-hidden`}>
      <input
        ref={openFileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          handleFilePicked(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
      {/* ─── Tab bar + ribbon (shared chrome) ─── */}
      <div className={`ws-chrome shrink-0 ${isWorkspaceDark ? 'bg-[#2a2d35]' : 'bg-white'}`}>
      <div className="flex items-center h-9 px-2">
        <button
          type="button"
          onClick={() => navigateWithUnsavedCheck(`/${locale}`)}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded transition-all mr-2 ${
            isWorkspaceDark
              ? 'text-white/55 hover:text-white hover:bg-white/[0.08]'
              : 'text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]'
          }`}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>

        <span className="ws-filename mr-3 ml-1">
          {file?.name || t('untitled')}
        </span>

        <nav className="flex items-center gap-0.5 overflow-x-auto">
          {tabList.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  if (file) setUploadedPdf(file);
                  setActiveTab(tab.key);
                  setActiveAnnotTool(null);
                }}
                className={`ws-tab${active ? ' ws-tab--active' : ''}`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="flex-1" />

        <div className="hidden md:flex items-center gap-1">
          <button
            type="button"
            disabled={!file}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded transition-all text-[11px] disabled:opacity-40 disabled:pointer-events-none ${
              isWorkspaceDark
                ? isDirty
                  ? 'text-white hover:bg-white/[0.08]'
                  : 'text-white/55 hover:text-white hover:bg-white/[0.06]'
                : isDirty
                  ? 'text-[#111827] hover:bg-[#F3F4F6]'
                  : 'text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]'
            }`}
            onClick={() => handleRibbonAction('save')}
          >
            <Save className="h-3 w-3" /> {t('header.save')}
          </button>
          <button
            type="button"
            disabled={!file}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded transition-all text-[11px] disabled:opacity-40 disabled:pointer-events-none ${
              isWorkspaceDark
                ? 'text-white/55 hover:text-white hover:bg-white/[0.06]'
                : 'text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]'
            }`}
            onClick={() => handleRibbonAction('export')}
          >
            <FileDown className="h-3 w-3" /> {t('header.export')}
          </button>
          <button className={`inline-flex items-center gap-1 px-2 py-1 rounded transition-all text-[11px] ${
            isWorkspaceDark
              ? 'text-white/55 hover:text-white hover:bg-white/[0.06]'
              : 'text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6]'
          }`}>
            <Share2 className="h-3 w-3" /> {t('header.share')}
          </button>
          <div className="w-px h-4 bg-[hsl(var(--color-border))] dark:bg-white/[0.08] mx-1" />
          <ThemeToggle />
        </div>
      </div>

      {activeTab === 'home' ? (
        <WorkspaceHomeRibbon
          zoom={zoom}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onZoomPreset={handleZoomPreset}
          onFitWidth={handleFitWidth}
          onFitPage={handleFitPage}
          onAction={handleRibbonAction}
          t={t}
        />
      ) : ribbonGroups.length > 0 ? (
      <div className="flex items-center w-fit max-w-full min-h-[42px] px-2 overflow-x-auto">
        {ribbonGroups.map((group, gi) => (
          <div key={`${activeTab}-${gi}`} className="flex items-center shrink-0">
            {gi > 0 && (
              <div className="flex items-center px-2">
                <div className="w-px h-6 bg-[hsl(var(--color-border))] dark:bg-white/[0.08]" />
              </div>
            )}
            <div className="flex items-center gap-0.5">
              {group.tools.map((tool, ti) => {
                const Icon = tool.icon;
                const isActive =
                  !!tool.action &&
                  tool.action.startsWith('annot:') &&
                  activeAnnotTool === tool.action.replace('annot:', '');
                return (
                  <button
                    key={ti}
                    type="button"
                    onClick={() => handleToolClick(tool)}
                    className={`flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded-md active:scale-95 transition-all min-w-[42px] cursor-pointer group ${
                      isActive
                        ? isWorkspaceDark
                          ? 'bg-white/[0.06]'
                          : 'bg-[#F3F4F6]'
                        : isWorkspaceDark
                          ? 'hover:bg-white/[0.08] active:bg-white/[0.14]'
                          : 'hover:bg-[#F3F4F6] active:bg-[#E5E7EB]'
                    }`}
                    title={`${group.label}: ${tool.label}`}
                  >
                    <Icon className={`h-4 w-4 transition-colors ${
                      isActive
                        ? isWorkspaceDark ? 'text-white' : 'text-[#111827]'
                        : isWorkspaceDark
                          ? 'text-white/75 group-hover:text-white'
                          : 'text-[#4B5563] group-hover:text-[#111827]'
                    }`} />
                    <span className={`text-[9px] leading-tight whitespace-nowrap transition-colors ${
                      isActive
                        ? isWorkspaceDark ? 'text-white font-medium' : 'text-[#111827] font-medium'
                        : isWorkspaceDark
                          ? 'text-white/60 group-hover:text-white/90'
                          : 'text-[#4B5563] group-hover:text-[#111827]'
                    }`}>
                      {tool.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      ) : null}
      </div>

      {/* ─── Main Content Area ─── */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Thumbnail Panel */}
        {showThumbnails && (
          <aside className={`w-[148px] shrink-0 flex flex-col ${isWorkspaceDark ? 'bg-[#1e2028]' : 'bg-[#F1F5F9]'}`}>
            <div className="flex items-center justify-end px-2 py-2 border-b border-[#E5E7EB] dark:border-white/[0.06] shrink-0">
              <WorkspacePagesSidebarToggle
                expanded
                variant="header"
                theme={isWorkspaceDark ? 'dark' : 'light'}
                onClick={() => setShowThumbnails(false)}
                title={t('sidebar.hidePages')}
                aria-label={t('sidebar.hidePages')}
              />
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2 scrollbar-hide">
              {previewUrl && (
                <PageThumbnails
                  pdfUrl={previewUrl}
                  currentPage={currentPage}
                  onPageSelect={handlePageSelect}
                  onPageCountChange={setPageCount}
                  theme={isWorkspaceDark ? 'dark' : 'light'}
                />
              )}
            </div>
          </aside>
        )}

        {/* Center: single annotation viewer (no remount on tab switch) */}
        <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${isWorkspaceDark ? 'bg-[#16181d]' : 'bg-[#F1F5F9]'}`}>
          <div className="relative flex-1 min-h-0 overflow-hidden">
            {!previewUrl && (
              <div className="absolute inset-0 flex items-center justify-center">
                <label className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[hsl(var(--color-border))] dark:border-white/15 bg-[hsl(var(--color-card))] dark:bg-white/[0.03] px-8 py-10 text-center cursor-pointer hover:bg-[hsl(var(--color-muted)/0.5)] dark:hover:bg-white/[0.05] hover:border-[hsl(var(--color-primary)/0.35)] dark:hover:border-white/25 transition-all">
                  <Upload className="h-8 w-8 text-[hsl(var(--color-primary)/0.8)]" />
                  <div>
                    <div className="text-[13px] font-medium text-[hsl(var(--color-foreground))] dark:text-white/80">{t('upload.title')}</div>
                    <div className="mt-1 text-[11px] text-[hsl(var(--color-muted-foreground))] dark:text-white/45">{t('upload.description')}</div>
                  </div>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => handleFilePicked(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            )}
            {/* Annotation viewer: always mounted; ribbon only changes behavior */}
            {previewUrl && !showThumbnails && (
              <WorkspacePagesSidebarToggle
                expanded={false}
                variant="floating"
                theme={isWorkspaceDark ? 'dark' : 'light'}
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
                className={`absolute right-0 top-1/2 z-20 -translate-y-1/2 flex items-center gap-2 rounded-l-xl border border-r-0 py-2 pl-2.5 pr-2 backdrop-blur-sm transition-all ${
                  isWorkspaceDark
                    ? 'border-white/12 bg-[#0D1117]/95 shadow-[-6px_0_20px_rgba(0,0,0,0.35)] hover:border-white/20 hover:bg-[#161B22]'
                    : 'border-[#DDE3EA] bg-[#F8FAFC]/95 shadow-[-4px_0_16px_rgba(15,23,42,0.08)] hover:border-[#CBD5E1] hover:bg-[#F1F5F9]'
                }`}
                title={t('statusBar.aiAssistant')}
                aria-label={t('statusBar.aiAssistant')}
              >
                <WorkspaceAIIcon size="sm" />
                <span
                  className={`max-w-[4.5rem] pr-0.5 text-[10px] font-medium leading-tight ${
                    isWorkspaceDark ? 'text-white/55' : 'text-[#475569]'
                  }`}
                >
                  {t('statusBar.aiAssistant')}
                </span>
              </button>
            )}

            {previewUrl && (
              <EditPDFTool
                key={viewerInstanceKey}
                className="absolute inset-0 h-full"
                immersive
                theme={isWorkspaceDark ? 'dark' : 'light'}
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
            pdfViewerIframeRef={editorIframeRef}
          />
        )}
      </div>

      {/* ─── Bottom Status Bar ─── */}
      <div className={`h-9 flex items-center justify-between border-t px-3 shrink-0 text-[12px] ${isWorkspaceDark ? 'bg-[#2a2d35] border-white/[0.06]' : 'bg-white border-[#E5E7EB]'}`}>
        {/* Left: Thumbnail toggle + page nav */}
        <div className="flex items-center gap-2">
          {!showThumbnails && (
            <WorkspacePagesSidebarToggle
              expanded={false}
              variant="compact"
              theme={isWorkspaceDark ? 'dark' : 'light'}
              onClick={() => setShowThumbnails(true)}
              title={t('sidebar.showThumbnails')}
              aria-label={t('sidebar.showThumbnails')}
            />
          )}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => handlePageSelect(1)}
              disabled={currentPage <= 1}
              className="p-0.5 rounded text-[hsl(var(--color-muted-foreground))] dark:text-[#97a1b3] hover:text-[hsl(var(--color-foreground))] dark:hover:text-white/85 disabled:opacity-30 disabled:cursor-default transition-all"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handlePageSelect(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="p-0.5 rounded text-[hsl(var(--color-muted-foreground))] dark:text-[#97a1b3] hover:text-[hsl(var(--color-foreground))] dark:hover:text-white/85 disabled:opacity-30 disabled:cursor-default transition-all"
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
                className="w-6 h-5 text-center bg-[hsl(var(--color-muted)/0.6)] dark:bg-[#252b37] border border-[hsl(var(--color-border))] dark:border-[#2f3440] rounded text-[11px] text-[hsl(var(--color-foreground))] dark:text-white/85 focus:outline-none focus:border-[hsl(var(--color-primary)/0.45)]"
              />
              <span className="text-[hsl(var(--color-muted-foreground))] dark:text-[#8b96aa]">/</span>
              <span className="text-[hsl(var(--color-muted-foreground))] dark:text-[#a8b3c8] tabular-nums">{pageCount || '—'}</span>
            </div>
            <button
              onClick={() => handlePageSelect(Math.min(pageCount, currentPage + 1))}
              disabled={currentPage >= pageCount}
              className="p-0.5 rounded text-[hsl(var(--color-muted-foreground))] dark:text-[#97a1b3] hover:text-[hsl(var(--color-foreground))] dark:hover:text-white/85 disabled:opacity-30 disabled:cursor-default transition-all"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handlePageSelect(pageCount)}
              disabled={currentPage >= pageCount}
              className="p-0.5 rounded text-[hsl(var(--color-muted-foreground))] dark:text-[#97a1b3] hover:text-[hsl(var(--color-foreground))] dark:hover:text-white/85 disabled:opacity-30 disabled:cursor-default transition-all"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Center: info */}
        <div className="flex-1 text-center text-[hsl(var(--color-muted-foreground))] dark:text-white/30 text-[10px]">
          {file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : ''}
        </div>
      </div>

      {workspaceTool && file && (
        <div
          className={`fixed inset-0 z-[100] flex items-center justify-center p-4 ${isWorkspaceDark ? 'bg-black/60' : 'bg-black/45'}`}
          role="dialog"
          aria-modal="true"
          aria-label={t('inlineTools.dialogLabel')}
          onClick={() => setWorkspaceTool(null)}
        >
          <div
            style={inlineToolThemeVars}
            className={`relative flex ${inlineDialogMaxHeightClass} w-full ${inlineDialogMaxWidthClass} flex-col overflow-hidden rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] text-[hsl(var(--color-foreground))] shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[hsl(var(--color-border))] px-4 py-3 shrink-0">
              <h2 className="text-sm font-medium text-[hsl(var(--color-foreground))]">
                {t(workspaceInlineToolTitleKey(workspaceTool))}
              </h2>
              <button
                type="button"
                onClick={() => setWorkspaceTool(null)}
                className={`rounded p-1 transition-all ${
                  isWorkspaceDark
                    ? 'text-white/55 hover:bg-white/[0.08] hover:text-white/90'
                    : 'text-[hsl(var(--color-muted-foreground))] hover:bg-[hsl(var(--color-muted)/0.65)] hover:text-[hsl(var(--color-foreground))]'
                }`}
                aria-label={t('inlineTools.close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className={WORKSPACE_INLINE_TOOL_SHELL_CLASS}>
              {workspaceTool === 'compress' && (
                <CompressPDFTool
                  initialFile={file}
                  lockToInitialFile
                  onFileUpdated={handleInlineToolFileUpdated}
                />
              )}
              {workspaceTool === 'ocr' && <OCRPDFTool initialFile={file} lockToInitialFile />}
              {workspaceTool === 'merge' && <MergePDFTool initialFile={file} />}
              {workspaceTool === 'repair' && (
                <RepairPDFTool
                  initialFile={file}
                  lockToInitialFile
                  onFileUpdated={handleInlineToolFileUpdated}
                />
              )}
              {workspaceTool === 'compare' && <ComparePDFsTool initialFile={file} />}
              {workspaceTool === 'split' && (
                <SplitPDFTool
                  initialFile={file}
                  lockToInitialFile
                  onFileUpdated={handleInlineToolFileUpdated}
                />
              )}
              {workspaceTool === 'extract-pages' && (
                <ExtractPagesTool
                  initialFile={file}
                  lockToInitialFile
                  onFileUpdated={handleInlineToolFileUpdated}
                />
              )}
              {workspaceTool === 'organize' && (
                <OrganizePDFTool
                  initialFile={file}
                  lockToInitialFile
                  onFileUpdated={handleInlineToolFileUpdated}
                />
              )}
              {workspaceTool === 'crop' && (
                <CropPDFTool
                  initialFile={file}
                  lockToInitialFile
                  onFileUpdated={handleInlineToolFileUpdated}
                />
              )}
              {workspaceTool === 'reverse' && (
                <ReversePagesTool
                  initialFile={file}
                  lockToInitialFile
                  onFileUpdated={handleInlineToolFileUpdated}
                />
              )}
              {workspaceTool === 'watermark' && (
                <WatermarkTool
                  initialFile={file}
                  lockToInitialFile
                  onFileUpdated={handleInlineToolFileUpdated}
                />
              )}
              {workspaceTool === 'header-footer' && (
                <HeaderFooterTool
                  initialFile={file}
                  lockToInitialFile
                  onFileUpdated={handleInlineToolFileUpdated}
                />
              )}
              {workspaceTool === 'page-numbers' && (
                <PageNumbersTool
                  initialFile={file}
                  lockToInitialFile
                  onFileUpdated={handleInlineToolFileUpdated}
                />
              )}
              {workspaceTool === 'background-color' && (
                <BackgroundColorTool
                  key={`bg-dialog-${bgToolSession}`}
                  initialFile={file}
                  processSourceFile={pristinePdfRef.current ?? file}
                  lockToInitialFile
                  keepDialogOpenOnApply
                  onFileUpdated={(nextFile) =>
                    handleInlineToolFileUpdated(nextFile, { keepDialogOpen: true })
                  }
                />
              )}
              {workspaceTool === 'pdf-to-docx' && <PDFToDocxTool initialFile={file} />}
              {workspaceTool === 'pdf-to-excel' && <PDFToExcelTool initialFile={file} />}
              {workspaceTool === 'pdf-to-pptx' && <PDFToPptxTool initialFile={file} />}
              {workspaceTool === 'pdf-to-image' && <PDFToImageTool initialFile={file} />}
              {workspaceTool === 'pdf-to-markdown' && (
                <PDFToMarkdownTool initialFile={file} lockToInitialFile />
              )}
              {workspaceTool === 'flatten' && (
                <FlattenPDFTool
                  initialFile={file}
                  lockToInitialFile
                  onFileUpdated={handleInlineToolFileUpdated}
                />
              )}
              {workspaceTool === 'extract-tables' && (
                <ExtractTablesTool initialFile={file} lockToInitialFile />
              )}
              {workspaceTool === 'extract-images' && (
                <ExtractImagesTool initialFile={file} lockToInitialFile />
              )}
              {workspaceTool === 'edit-metadata' && (
                <EditMetadataTool
                  initialFile={file}
                  lockToInitialFile
                  onFileUpdated={handleInlineToolFileUpdated}
                />
              )}
              {workspaceTool === 'form-filler' && (
                <FormFillerTool
                  initialFile={file}
                  lockToInitialFile
                  onFileUpdated={handleInlineToolFileUpdated}
                />
              )}
              {workspaceTool === 'form-creator' && (
                <FormCreatorTool initialFile={file} lockToInitialFile />
              )}
              {workspaceTool === 'digital-sign' && (
                <DigitalSignPDFTool initialFile={file} lockToInitialFile />
              )}
              {workspaceTool === 'validate-signature' && (
                <ValidateSignatureTool initialFile={file} lockToInitialFile />
              )}
              {workspaceTool === 'encrypt' && (
                <EncryptPDFTool initialFile={file} lockToInitialFile />
              )}
              {workspaceTool === 'decrypt' && (
                <DecryptPDFTool
                  initialFile={file}
                  lockToInitialFile
                  onFileUpdated={handleInlineToolFileUpdated}
                />
              )}
              {workspaceTool === 'find-and-redact' && (
                <FindAndRedactTool
                  initialFile={file}
                  lockToInitialFile
                  onFileUpdated={handleInlineToolFileUpdated}
                />
              )}
              {workspaceTool === 'remove-metadata' && (
                <RemoveMetadataTool
                  initialFile={file}
                  lockToInitialFile
                  onFileUpdated={handleInlineToolFileUpdated}
                />
              )}
              {workspaceTool === 'change-permissions' && (
                <ChangePermissionsTool
                  initialFile={file}
                  lockToInitialFile
                  onFileUpdated={handleInlineToolFileUpdated}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

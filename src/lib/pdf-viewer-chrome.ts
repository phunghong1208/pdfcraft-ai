/** Injected into PDF.js iframe — hide chrome and remove Konva edge seam. */

export const PDF_VIEWER_CHROME_CSS = `
html,body{margin:0!important;padding:0!important;background:#16181d!important}
#outerContainer,#mainContainer,#viewerContainer{
  position:absolute!important;inset:0!important;width:100%!important;height:100%!important;
  background:#16181d!important;box-shadow:none!important;border:none!important;outline:none!important;
}
#outerContainer::before,#outerContainer::after,
#mainContainer::before,#mainContainer::after,
#viewerContainer::before,#viewerContainer::after,
#viewer::before,#viewer::after{content:none!important;display:none!important}
#toolbarContainer,#toolbarViewer,#loadingBar,#secondaryToolbar,
#sidebarContainer,#sidebarContent,#sidebarResizer,#sidebarToggleButton,#toolbarSidebar,
#editorModeButtons,.splitToolbarButtonSeparator,.verticalToolbarSeparator{display:none!important}
/* Keep annotation toolbar accessible while annotating. */
html:not(.pdfcraft-annotating) .CustomToolbar{
  position:absolute!important;top:-9999px!important;left:-9999px!important;
  opacity:0!important;pointer-events:none!important;
}
html.pdfcraft-annotating .CustomToolbar{
  position:fixed!important;top:8px!important;right:12px!important;left:auto!important;
  z-index:60!important;opacity:1!important;pointer-events:auto!important;
}
html:not(.pdfcraft-annotating) .ant-btn,
html:not(.pdfcraft-annotating) [class*="ant-btn"]{
  display:none!important;visibility:hidden!important;pointer-events:none!important;
}
/* Annotation extension comment panel — gray left border = visible vertical line */
.CustomComment,[class*="CustomComment"]{
  display:none!important;visibility:hidden!important;width:0!important;height:0!important;
  border:none!important;border-left-color:#16181d!important;background:#16181d!important;
  overflow:hidden!important;pointer-events:none!important;opacity:0!important;
}
html.pdfcraft-annotating .CustomComment,html.pdfcraft-annotating [class*="CustomComment"]{
  display:block!important;visibility:visible!important;width:auto!important;height:auto!important;
  opacity:1!important;pointer-events:auto!important;
  border-left-color:#16181d!important;background:#16181d!important;border-left-width:0!important;
}
#viewerContainer{top:0!important;inset-inline-start:0!important;left:0!important;overflow:auto!important;scrollbar-width:none!important}
#outerContainer.sidebarOpen #viewerContainer,#outerContainer.sidebarMoving #viewerContainer{inset-inline-start:0!important;left:0!important}
#loadingBar{display:none!important}
#viewerContainer::-webkit-scrollbar{display:none!important;width:0!important}
.pdfViewer.removePageBorders .page,.pdfViewer .page{
  --page-border:0!important;border:none!important;box-shadow:none!important;outline:none!important;
  margin:8px auto 12px!important;background:#fff!important;background-clip:border-box!important;overflow:hidden!important;
}
.pdfViewer .canvasWrapper{position:relative!important;overflow:hidden!important;border:none!important}
.pdfViewer .canvasWrapper>canvas{display:block!important;border:none!important;outline:none!important}
/* Konva stage = black vertical line at page right — remove from view mode entirely */
.pdfViewer .page .PdfjsAnnotationExtension_painter_wrapper,
.pdfViewer .page .konvajs-content,
.pdfViewer .page .konvajs-content>canvas{display:none!important;visibility:hidden!important;width:0!important;height:0!important;overflow:hidden!important;pointer-events:none!important}
html.pdfcraft-annotating .pdfViewer .page .PdfjsAnnotationExtension_painter_wrapper{display:block!important;visibility:visible!important;width:auto!important;height:auto!important;overflow:hidden!important;pointer-events:auto!important}
html.pdfcraft-annotating .pdfViewer .page .konvajs-content{display:block!important;visibility:visible!important;width:calc(100% - 1px)!important;height:auto!important}
html.pdfcraft-annotating .pdfViewer .page .konvajs-content>canvas{display:block!important;visibility:visible!important;width:100%!important;height:auto!important;clip-path:inset(0 4px 0 0)!important}
#sidebarContainer,#sidebarContent,#sidebarResizer{display:none!important;box-shadow:none!important;border:none!important}
`;

/** Extension re-creates Konva layers on render — delete them unless user is annotating. */
export function removeAnnotationPainters(doc: Document) {
  if (doc.documentElement.classList.contains('pdfcraft-annotating')) return;
  doc.querySelectorAll('.PdfjsAnnotationExtension_painter_wrapper, .konvajs-content').forEach((node) => {
    node.remove();
  });
}

export function removeExtensionPanels(doc: Document) {
  if (doc.documentElement.classList.contains('pdfcraft-annotating')) {
    doc.querySelectorAll('.CustomComment, [class*="CustomComment"]').forEach((node) => {
      const el = node as HTMLElement;
      el.style.setProperty('border-left', '0', 'important');
      el.style.setProperty('border-left-color', '#16181d', 'important');
      el.style.setProperty('background', '#16181d', 'important');
      el.style.setProperty('box-shadow', 'none', 'important');
    });
    return;
  }
  doc.querySelectorAll('.CustomComment, [class*="CustomComment"]').forEach((node) => {
    node.remove();
  });
}

export function coverPageCanvasSeams(doc: Document) {
  doc.querySelectorAll('.pdfViewer .page').forEach((pageNode) => {
    const page = pageNode as HTMLElement;
    page.style.setProperty('border', 'none', 'important');
    page.style.setProperty('--page-border', '0', 'important');
    page.style.setProperty('background-clip', 'border-box', 'important');
    page.style.setProperty('overflow', 'hidden', 'important');
  });
  removeAnnotationPainters(doc);
  removeExtensionPanels(doc);
}

export function lockPdfViewerSidebar(doc: Document, app?: { pdfSidebar?: { isOpen?: boolean; close?: () => void } }) {
  doc.getElementById('outerContainer')?.classList.remove('sidebarOpen', 'sidebarMoving');
  if (app?.pdfSidebar?.isOpen) app.pdfSidebar.close?.();
}

export function stripPdfViewerSeams(doc: Document) {
  lockPdfViewerSidebar(doc);

  ['sidebarContainer', 'sidebarContent', 'sidebarResizer', 'toolbarSidebar'].forEach((id) => {
    const el = doc.getElementById(id);
    if (!el) return;
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('width', '0', 'important');
    el.style.setProperty('box-shadow', 'none', 'important');
    el.style.setProperty('border', 'none', 'important');
  });

  doc.querySelectorAll('.verticalToolbarSeparator, .splitToolbarButtonSeparator').forEach((node) => {
    node.remove();
  });

  doc.querySelectorAll('[class*="separator"], [class*="Separator"], [class*="resizer"], [class*="Resizer"], #sidebarResizer').forEach((node) => {
    const el = node as HTMLElement;
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('width', '0', 'important');
    el.style.setProperty('border', '0', 'important');
    el.style.setProperty('box-shadow', 'none', 'important');
  });

  doc.querySelectorAll('#toolbarContainer, #toolbarViewer').forEach((node) => {
    const el = node as HTMLElement;
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('height', '0', 'important');
  });

  doc.querySelectorAll('.page').forEach((node) => {
    const el = node as HTMLElement;
    el.style.setProperty('border', 'none', 'important');
    el.style.setProperty('box-shadow', 'none', 'important');
    el.style.setProperty('outline', 'none', 'important');
  });

  doc.getElementById('pdfcraft-page-edge-rail')?.remove();
  coverPageCanvasSeams(doc);
}

export function injectPdfViewerChrome(doc: Document, styleId = 'pdfcraft-viewer-chrome') {
  let style = doc.getElementById(styleId) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = styleId;
    doc.head.appendChild(style);
  }
  style.textContent = PDF_VIEWER_CHROME_CSS;

  doc.querySelector('.pdfViewer')?.classList.add('removePageBorders');
  stripPdfViewerSeams(doc);
}

export function attachKonvaSeamGuard(doc: Document) {
  if (doc.getElementById('pdfcraft-konva-guard')) return;

  const marker = doc.createElement('span');
  marker.id = 'pdfcraft-konva-guard';
  marker.hidden = true;
  doc.body.appendChild(marker);

  const sweep = () => stripPdfViewerSeams(doc);

  const vc = doc.getElementById('viewerContainer');
  vc?.addEventListener('scroll', sweep, { passive: true });
  window.addEventListener('resize', sweep, { passive: true });
  window.addEventListener('pdfcraft-edge-sync', sweep, { passive: true });

  let ticks = 0;
  const boot = window.setInterval(() => {
    sweep();
    ticks += 1;
    if (ticks >= 20) window.clearInterval(boot);
  }, 250);

  sweep();
}

/** Làm tròn scale để tránh vạch dọc do zoom lẻ (146%, …). */
export function snapPdfViewerScale(scale: number): number {
  return Math.round(scale * 100) / 100;
}

/** Vừa chiều ngang viewer — tránh hash `zoom=1` (= 1% trong PDF.js). */
export function fitPdfViewerPageWidth(pdfViewer: {
  currentScaleValue: string;
  currentScale?: number;
  scrollMode?: number;
}): void {
  pdfViewer.currentScaleValue = 'page-width';
  if (typeof pdfViewer.scrollMode !== 'undefined') {
    pdfViewer.scrollMode = 0;
  }
}

/** Injected into PDF.js iframe — hide chrome and cover canvas edge seams. */

export const PDF_VIEWER_CHROME_CSS = `
html,body{margin:0!important;padding:0!important;background:#16181d!important}
#outerContainer,#mainContainer,#viewerContainer{
  position:absolute!important;inset:0!important;width:100%!important;height:100%!important;
  background:#16181d!important;box-shadow:none!important;border:none!important;outline:none!important;
}
#outerContainer::before,#outerContainer::after,
#mainContainer::before,#mainContainer::after,
#viewerContainer::before,#viewerContainer::after,
#viewer::before,#viewer::after{
  content:none!important;
  display:none!important;
}
#toolbarContainer,#toolbarViewer,#loadingBar,#secondaryToolbar,
#sidebarContainer,#sidebarContent,#sidebarResizer,#sidebarToggleButton,#toolbarSidebar,
.CustomToolbar,#editorModeButtons,.ant-btn,.splitToolbarButtonSeparator,.verticalToolbarSeparator{
  display:none!important;
}
#viewerContainer{top:0!important;overflow:auto!important;scrollbar-width:none!important}
#viewerContainer::-webkit-scrollbar{display:none!important;width:0!important}
.pdfViewer.removePageBorders .page{
  --page-border:0!important;
  border:none!important;
  box-shadow:none!important;
  outline:none!important;
  margin:8px auto 12px!important;
  background:#fff!important;
  overflow:hidden!important;
}
.pdfViewer .canvasWrapper{
  position:relative!important;
  overflow:hidden!important;
  border:none!important;
  box-shadow:none!important;
}
.pdfViewer .canvasWrapper>canvas{
  display:block!important;
  border:none!important;
  outline:none!important;
}
.pdfcraft-edge-cover{
  position:absolute!important;
  top:0!important;
  bottom:0!important;
  background:#fff!important;
  pointer-events:none!important;
  z-index:4!important;
}
`;

const EDGE_COVER_PX = 90;

function addEdgeCover(wrap: HTMLElement, doc: Document, side: 'left' | 'right', leftPx: number) {
  const cover = doc.createElement('div');
  cover.className = `pdfcraft-edge-cover pdfcraft-edge-cover-${side}`;
  cover.style.left = `${leftPx}px`;
  cover.style.width = `${EDGE_COVER_PX}px`;
  wrap.appendChild(cover);
}

/** Che vạch 1px ở mép canvas (lỗi subpixel khi zoom). */
export function coverPageCanvasSeams(doc: Document) {
  doc.querySelectorAll('.page .canvasWrapper').forEach((wrapNode) => {
    const wrap = wrapNode as HTMLElement;
    const canvas = wrap.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas || canvas.offsetWidth < 1) return;

    wrap.querySelectorAll('.pdfcraft-edge-cover').forEach((el) => el.remove());
    const left = canvas.offsetLeft;
    const right = left + canvas.offsetWidth;
    // Cover possible 1px anti-aliased seam at both canvas edges.
    addEdgeCover(wrap, doc, 'left', Math.max(0, left - 1));
    addEdgeCover(wrap, doc, 'right', Math.max(0, right - 2));
  });
}

export function stripPdfViewerSeams(doc: Document) {
  doc.getElementById('outerContainer')?.classList.remove('sidebarOpen', 'sidebarMoving');

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

  // Some viewer builds/extensions still leave 1px separators/resizers in DOM.
  doc.querySelectorAll('[class*="separator"], [class*="Separator"], [class*="resizer"], [class*="Resizer"], #sidebarResizer').forEach((node) => {
    const el = node as HTMLElement;
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('width', '0', 'important');
    el.style.setProperty('border-left', '0', 'important');
    el.style.setProperty('border-right', '0', 'important');
    el.style.setProperty('box-shadow', 'none', 'important');
  });

  doc.querySelectorAll('.CustomToolbar, #toolbarContainer, #toolbarViewer').forEach((node) => {
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

/** Làm tròn scale để tránh vạch dọc do zoom lẻ (146%, …). */
export function snapPdfViewerScale(scale: number): number {
  return Math.round(scale * 100) / 100;
}

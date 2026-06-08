/** Injected into PDF.js iframe — hide chrome and remove Konva edge seam. */

export const PDF_VIEWER_SHELL_BG = {
  dark: '#16181d',
  light: '#F1F5F9',
} as const;

const PDFCRAFT_THEME_VARS = {
  light: {
    '--pdfcraft-card': '0 0% 100%',
    '--pdfcraft-fg': '222 47% 11%',
    '--pdfcraft-muted-fg': '215 16% 47%',
    '--pdfcraft-border': '214 32% 91%',
    '--pdfcraft-muted': '210 40% 96%',
    '--pdfcraft-primary': '0 72% 51%',
    '--pdfcraft-primary-fg': '0 0% 100%',
    '--pdfcraft-danger': '0 72% 45%',
  },
  dark: {
    '--pdfcraft-card': '222 47% 10%',
    '--pdfcraft-fg': '210 40% 98%',
    '--pdfcraft-muted-fg': '215 20% 65%',
    '--pdfcraft-border': '217 33% 15%',
    '--pdfcraft-muted': '217 33% 13%',
    '--pdfcraft-primary': '0 72% 55%',
    '--pdfcraft-primary-fg': '0 0% 100%',
    '--pdfcraft-danger': '0 72% 58%',
  },
} as const;

const PASSWORD_DIALOG_TITLE: Record<string, string> = {
  vi: 'Tài liệu được bảo vệ',
  en: 'Protected document',
};

export const PDF_VIEWER_CHROME_CSS = `
html,body{margin:0!important;padding:0!important;background:var(--pdfcraft-shell-bg,#16181d)!important}
#outerContainer,#mainContainer,#viewerContainer{
  position:absolute!important;inset:0!important;width:100%!important;height:100%!important;
  background:var(--pdfcraft-shell-bg,#16181d)!important;box-shadow:none!important;border:none!important;outline:none!important;
}
#outerContainer::before,#outerContainer::after,
#mainContainer::before,#mainContainer::after,
#viewerContainer::before,#viewerContainer::after,
#viewer::before,#viewer::after{content:none!important;display:none!important}
#toolbarContainer,#toolbarViewer,#loadingBar,#secondaryToolbar,
#sidebarContainer,#sidebarContent,#sidebarResizer,#sidebarToggleButton,#toolbarSidebar,
#editorModeButtons,.splitToolbarButtonSeparator,.verticalToolbarSeparator{display:none!important}
#toolbarContainer,#toolbarViewer,#mainContainer,#outerContainer{
  border:none!important;box-shadow:none!important;
}
/* CustomToolbar: ẩn; khi text markup → thanh 3 nút ở dưới giữa */
html:not(.pdfcraft-text-markup) .CustomToolbar{
  position:absolute!important;top:-9999px!important;left:-9999px!important;
  opacity:0!important;pointer-events:auto!important;
}
html.pdfcraft-text-markup .CustomToolbar{
  position:fixed!important;bottom:20px!important;top:auto!important;
  left:50%!important;right:auto!important;transform:translateX(-50%)!important;
  z-index:10002!important;opacity:1!important;pointer-events:auto!important;
  width:auto!important;max-width:max-content!important;
  background:var(--doorhanger-bg-color,#323639)!important;
  border-radius:8px!important;padding:4px 8px!important;
  box-shadow:0 2px 10px rgba(0,0,0,.35)!important;
}
html.pdfcraft-text-markup .CustomToolbar ul.buttons{display:flex!important;flex-direction:row!important}
html.pdfcraft-text-markup .CustomToolbar ul.buttons > li{display:none!important}
html.pdfcraft-text-markup .CustomToolbar ul.buttons > li:nth-child(2),
html.pdfcraft-text-markup .CustomToolbar ul.buttons > li:nth-child(3),
html.pdfcraft-text-markup .CustomToolbar ul.buttons > li:nth-child(4){display:flex!important}
html.pdfcraft-text-markup .CustomToolbar ul.buttons > li:nth-child(2){order:1!important}
html.pdfcraft-text-markup .CustomToolbar ul.buttons > li:nth-child(3){order:2!important}
html.pdfcraft-text-markup .CustomToolbar ul.buttons > li:nth-child(4){order:3!important}
html.pdfcraft-text-markup .CustomToolbar .splitToolbarButtonSeparator{display:none!important}
/* Konva không chặn bôi chữ trên text layer */
html.pdfcraft-text-markup .pdfViewer .page .PdfjsAnnotationExtension_painter_wrapper,
html.pdfcraft-text-markup .pdfViewer .page .konvajs-content,
html.pdfcraft-text-markup .pdfViewer .page .konvajs-content>canvas{pointer-events:none!important}
/* Remove toolbar/header separators that create an ugly top line. */
.CustomToolbar::before,.CustomToolbar::after,.CustomToolbar hr,
[class*="Toolbar"]::before,[class*="toolbar"]::before,
[class*="Header"]::before,[class*="header"]::before{
  display:none!important;content:none!important;border:none!important;
}
html:not(.pdfcraft-annotating) .CustomToolbar .ant-btn,
html:not(.pdfcraft-annotating) .CustomToolbar [class*="ant-btn"]{
  display:none!important;visibility:hidden!important;pointer-events:none!important;
}
/* Ant Design modal — FreeText OK / Cancel đồng bộ */
.ant-modal-wrap,.ant-modal-root{z-index:10050!important;pointer-events:auto!important}
.ant-modal-footer,.ant-modal-confirm-btns{
  display:flex!important;justify-content:flex-end!important;gap:8px!important;
  margin-top:12px!important;pointer-events:auto!important;
}
.ant-modal .ant-btn,.ant-modal-confirm .ant-btn,.ant-modal-footer .ant-btn,.ant-modal-confirm-btns .ant-btn,.ant-modal-footer button{
  display:inline-flex!important;align-items:center!important;justify-content:center!important;
  visibility:visible!important;min-width:72px!important;height:32px!important;padding:4px 15px!important;
  font-size:14px!important;line-height:1.5!important;border-radius:6px!important;box-shadow:none!important;
  max-height:none!important;width:auto!important;overflow:visible!important;pointer-events:auto!important;cursor:pointer!important;
}
.ant-modal-footer .ant-btn-default,.ant-modal-confirm-btns .ant-btn-default,
.ant-modal-confirm-btns > .ant-btn:first-child{
  color:rgba(0,0,0,.88)!important;background:#fff!important;border:1px solid #d9d9d9!important;opacity:1!important;
}
.ant-modal-footer .ant-btn-primary,.ant-modal-confirm-btns .ant-btn-primary,
.ant-modal-confirm-btns > .ant-btn:last-child:not(:only-child){
  color:#fff!important;background:#1677ff!important;border:1px solid #1677ff!important;opacity:1!important;
}
.ant-modal-footer .ant-btn-primary:disabled,.ant-modal-confirm-btns .ant-btn-primary:disabled,
.ant-modal-confirm-btns > .ant-btn:last-child:disabled{
  color:rgba(0,0,0,.25)!important;background:rgba(0,0,0,.04)!important;border:1px solid #d9d9d9!important;
  cursor:not-allowed!important;opacity:1!important;
}
.EditorFreeText-Modal,.EditorFreeText-Modal-Toolbar{pointer-events:auto!important}
.pdfcraft-freetext-dialog .ant-modal-content{display:flex!important;flex-direction:column!important;align-items:stretch!important;box-sizing:border-box!important;width:420px!important;max-width:calc(100vw - 24px)!important;padding:20px!important;border-radius:12px!important;overflow:hidden!important}
.pdfcraft-freetext-dialog .ant-modal-body,.pdfcraft-freetext-dialog .ant-modal-confirm-body{width:100%!important;max-width:100%!important;padding:0!important;margin:0!important;box-sizing:border-box!important}
.pdfcraft-freetext-dialog .ant-modal-confirm-title{margin:0 0 12px!important;padding:0!important;font-size:15px!important;font-weight:600!important}
.pdfcraft-freetext-dialog .ant-modal-confirm-btns{display:flex!important;justify-content:flex-end!important;align-items:center!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important;padding:0!important;margin:16px 0 0!important;gap:8px!important;float:none!important}
.pdfcraft-freetext-dialog .ant-modal-confirm-btns .ant-btn{float:none!important;margin:0!important;min-width:80px!important;height:34px!important;padding:0 18px!important;font-weight:500!important;border-radius:8px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important}
.pdfcraft-freetext-dialog textarea.ant-input,.pdfcraft-freetext-dialog .ant-input{width:100%!important;max-width:100%!important;box-sizing:border-box!important}
.EditorFreeText-Modal{width:100%;box-sizing:border-box!important}
.EditorFreeText-Modal textarea.ant-input,.EditorFreeText-Modal .ant-input{border-radius:8px!important;min-height:88px!important}
.EditorFreeText-Modal-Toolbar{display:flex!important;flex-direction:column!important;gap:10px!important;margin-top:12px!important;width:100%!important}
.EditorFreeText-Modal-Toolbar>*:not(.pdfcraft-ft-style-row):not(.colorPalette),.EditorFreeText-Modal-Toolbar .ant-dropdown-trigger{display:none!important}
.EditorFreeText-Modal-Toolbar .colorPalette{display:flex!important;flex-wrap:nowrap!important;gap:6px!important;width:100%!important;margin:0 auto!important;justify-content:center!important;overflow-x:auto!important;scrollbar-width:none!important;box-sizing:border-box!important}
.EditorFreeText-Modal-Toolbar .colorPalette .cell{flex:0 0 auto!important;width:20px!important;height:20px!important;min-width:20px!important;margin:0!important}
.EditorFreeText-Modal-Toolbar .colorPalette .cell span{width:11px!important;height:11px!important}
.EditorFreeText-Modal-Toolbar .colorPalette .cell.active{border:2px solid #1677ff!important}
.pdfcraft-ft-style-row{display:grid!important;grid-template-columns:1fr 68px!important;gap:8px!important;width:100%!important}
.pdfcraft-ft-style-row select{height:32px!important;width:100%!important;border-radius:8px!important;box-sizing:border-box!important}
html.pdfcraft-annotating:not(.pdfcraft-text-markup) .pdfViewer .page .konvajs-content,
html.pdfcraft-annotating:not(.pdfcraft-text-markup) .pdfViewer .page .konvajs-content>canvas{pointer-events:auto!important}
.CustomComment,[class*="CustomComment"],
html.pdfcraft-annotating .CustomComment,html.pdfcraft-annotating [class*="CustomComment"]{
  display:none!important;visibility:hidden!important;width:0!important;height:0!important;
  border:none!important;overflow:hidden!important;pointer-events:none!important;opacity:0!important;
}
html.pdfcraft-embedded .StampPop,html.pdfcraft-embedded .ant-dropdown:has(.StampPop-Container),
html.pdfcraft-embedded [class*="StampPop"]{
  z-index:10050!important;pointer-events:auto!important;
}
html.pdfcraft-embedded .SignaturePop,html.pdfcraft-embedded .ant-popover.SignaturePop,
html.pdfcraft-embedded .ant-dropdown:has(.SignaturePop-Container),html.pdfcraft-embedded [class*="SignaturePop"]{
  z-index:10050!important;pointer-events:auto!important;
}
html.pdfcraft-embedded .SignaturePop-Container,html.pdfcraft-embedded .SignaturePop-Container img,
html.pdfcraft-embedded .SignaturePop li img{
  pointer-events:auto!important;cursor:pointer!important;
}
.ant-dropdown:has(.SignaturePop-Container),.ant-popover.SignaturePop,.ant-popover:has(.SignaturePop-Container){
  position:fixed!important;top:50%!important;left:50%!important;
  transform:translate(-50%,-50%)!important;z-index:10050!important;
}
.ant-modal:has(.SignatureTool),.ant-modal-wrap:has(.SignatureTool){
  z-index:10055!important;pointer-events:auto!important;
}
html.pdfcraft-embedded .StampPop-Container,html.pdfcraft-embedded .StampPop-Container img{
  pointer-events:auto!important;cursor:pointer!important;
}
.ant-dropdown:has(.StampPop-Container),.ant-dropdown:has(.StampPop),
.ant-popover.StampPop,.ant-popover:has(.StampPop-Container){
  position:fixed!important;top:50%!important;left:50%!important;
  transform:translate(-50%,-50%)!important;z-index:10050!important;
}
html.pdfcraft-stamp-active #pdfcraft-stamp-picker.pdfcraft-stamp-picker{
  position:fixed!important;inset:0!important;z-index:10060!important;display:flex!important;
  align-items:center!important;justify-content:center!important;background:rgba(15,18,24,.55)!important;
  backdrop-filter:blur(2px)!important;pointer-events:auto!important;padding:20px!important;box-sizing:border-box!important;
}
#pdfcraft-stamp-picker .pdfcraft-stamp-picker-panel{
  width:min(560px,100%)!important;max-height:min(78vh,560px)!important;display:flex!important;flex-direction:column!important;
  overflow:hidden!important;background:#2a2e35!important;color:#f3f4f6!important;border-radius:14px!important;
  border:1px solid rgba(255,255,255,.08)!important;box-shadow:0 20px 50px rgba(0,0,0,.45)!important;
  font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif!important;
}
#pdfcraft-stamp-picker .pdfcraft-stamp-picker-header{
  display:flex!important;align-items:center!important;justify-content:space-between!important;
  padding:14px 16px 10px!important;border-bottom:1px solid rgba(255,255,255,.08)!important;
}
#pdfcraft-stamp-picker .pdfcraft-stamp-picker-title{margin:0!important;font-size:15px!important;font-weight:600!important;color:#f9fafb!important}
#pdfcraft-stamp-picker .pdfcraft-stamp-close{
  width:32px!important;height:32px!important;border:none!important;border-radius:8px!important;
  background:rgba(255,255,255,.06)!important;color:#d1d5db!important;font-size:20px!important;cursor:pointer!important;
}
#pdfcraft-stamp-picker .pdfcraft-stamp-tabs{display:flex!important;gap:8px!important;padding:10px 16px 0!important}
#pdfcraft-stamp-picker .pdfcraft-stamp-tab{
  flex:1!important;border:1px solid rgba(255,255,255,.1)!important;background:rgba(255,255,255,.04)!important;
  color:#cbd5e1!important;border-radius:8px!important;padding:8px 10px!important;font-size:13px!important;font-weight:500!important;cursor:pointer!important;
}
#pdfcraft-stamp-picker .pdfcraft-stamp-tab.active{background:#1677ff!important;border-color:#1677ff!important;color:#fff!important}
#pdfcraft-stamp-picker .pdfcraft-stamp-body{overflow:auto!important;padding:12px 16px 16px!important}
#pdfcraft-stamp-picker .pdfcraft-stamp-section{display:none!important}
#pdfcraft-stamp-picker .pdfcraft-stamp-section.active{display:block!important}
#pdfcraft-stamp-picker .pdfcraft-stamp-section-label{
  margin:0 0 10px!important;font-size:12px!important;font-weight:600!important;color:#9ca3af!important;
  text-transform:uppercase!important;letter-spacing:.04em!important;
}
#pdfcraft-stamp-picker .pdfcraft-stamp-upload-btn{
  width:100%!important;display:flex!important;flex-direction:column!important;align-items:center!important;
  justify-content:center!important;gap:4px!important;margin:0 0 14px!important;padding:18px 12px!important;
  border:2px dashed rgba(255,255,255,.22)!important;border-radius:10px!important;background:rgba(255,255,255,.03)!important;
  color:#e5e7eb!important;cursor:pointer!important;
}
#pdfcraft-stamp-picker .pdfcraft-stamp-upload-btn:hover{border-color:#1677ff!important;background:rgba(22,119,255,.08)!important}
#pdfcraft-stamp-picker .pdfcraft-stamp-upload-icon{font-size:22px!important;color:#93c5fd!important}
#pdfcraft-stamp-picker .pdfcraft-stamp-upload-text{font-size:14px!important;font-weight:600!important}
#pdfcraft-stamp-picker .pdfcraft-stamp-upload-hint{font-size:11px!important;color:#9ca3af!important}
#pdfcraft-stamp-picker .pdfcraft-stamp-file-input{display:none!important}
#pdfcraft-stamp-picker .pdfcraft-stamp-grid{
  display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:10px!important;
  margin:0!important;padding:0!important;list-style:none!important;
}
#pdfcraft-stamp-picker .pdfcraft-stamp-tile,#pdfcraft-stamp-picker .pdfcraft-stamp-grid li{
  aspect-ratio:1.35/1!important;min-height:72px!important;display:flex!important;align-items:center!important;justify-content:center!important;
  background:#fff!important;border-radius:10px!important;border:1px solid rgba(0,0,0,.06)!important;
  cursor:pointer!important;padding:8px!important;box-sizing:border-box!important;
}
#pdfcraft-stamp-picker .pdfcraft-stamp-tile:hover,#pdfcraft-stamp-picker .pdfcraft-stamp-grid li:hover{
  transform:translateY(-1px)!important;box-shadow:0 6px 16px rgba(0,0,0,.18)!important;outline:2px solid #1677ff!important;
}
#pdfcraft-stamp-picker .pdfcraft-stamp-grid img{width:100%!important;height:100%!important;object-fit:contain!important;pointer-events:none!important}
#pdfcraft-stamp-picker .pdfcraft-stamp-empty{
  grid-column:1/-1!important;background:transparent!important;border:none!important;color:#9ca3af!important;
  font-size:13px!important;cursor:default!important;min-height:auto!important;padding:8px 0!important;
}
html.pdfcraft-text-markup .CustomPopbar{display:none!important;pointer-events:none!important}
.CustomPopbar{z-index:10000!important;pointer-events:auto!important}
/* Menu chỉnh: comment / màu / xóa */
.CustomAnnotationMenu{z-index:10001!important;pointer-events:auto!important}
.CustomAnnotationMenu.show{display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important}
.CustomAnnotationMenu .buttons,.CustomAnnotationMenu .buttons li,
.CustomAnnotationMenu .styleContainer,.CustomAnnotationMenu .colorPalette .cell,
.CustomAnnotationMenu .prototypeSetting{pointer-events:auto!important}
/* Comment panel — ẩn sidebar, giữ DOM */
html.pdfcraft-text-markup .textLayer span,html.pdfcraft-text-markup .textLayer br{user-select:text!important;-webkit-user-select:text!important}
html.pdfcraft-text-markup .textLayer{pointer-events:auto!important;cursor:text!important}
html.pdfcraft-annotating:not(.pdfcraft-text-markup) .textLayer{pointer-events:none!important}
#viewerContainer{top:0!important;inset-inline-start:0!important;left:0!important;overflow:auto!important;scrollbar-width:none!important}
#viewer,#viewerContainer .pdfViewer{padding-top:0!important;margin-top:0!important}
#outerContainer.sidebarOpen #viewerContainer,#outerContainer.sidebarMoving #viewerContainer{inset-inline-start:0!important;left:0!important}
#loadingBar{display:none!important}
#viewerContainer::-webkit-scrollbar{display:none!important;width:0!important}
.pdfViewer.removePageBorders .page,.pdfViewer .page{
  --page-border:0!important;border:none!important;box-shadow:none!important;outline:none!important;
  margin:0 auto 12px!important;background:#fff!important;background-clip:border-box!important;overflow:hidden!important;
}
.pdfViewer .page:first-child{margin-top:0!important}
.pdfViewer .canvasWrapper{position:relative!important;overflow:hidden!important;border:none!important}
.pdfViewer .canvasWrapper>canvas{display:block!important;border:none!important;outline:none!important}
/* Konva stage — hide via opacity when not annotating so elements stay in DOM with correct dimensions */
.pdfViewer .page .PdfjsAnnotationExtension_painter_wrapper,
.pdfViewer .page .konvajs-content,
.pdfViewer .page .konvajs-content>canvas{opacity:0!important;overflow:hidden!important}
html.pdfcraft-annotating .pdfViewer .page .PdfjsAnnotationExtension_painter_wrapper{opacity:1!important;overflow:hidden!important}
html.pdfcraft-annotating .pdfViewer .page .konvajs-content{opacity:1!important;width:calc(100% - 1px)!important}
html.pdfcraft-annotating .pdfViewer .page .konvajs-content>canvas{opacity:1!important;clip-path:inset(0 4px 0 0)!important}
html.pdfcraft-annotations-visible .pdfViewer .page .PdfjsAnnotationExtension_painter_wrapper,
html.pdfcraft-annotations-visible .pdfViewer .page .konvajs-content,
html.pdfcraft-annotations-visible .pdfViewer .page .konvajs-content>canvas{opacity:1!important}
html:not(.pdfcraft-annotating):not(.pdfcraft-annotations-visible) .pdfViewer .page .PdfjsAnnotationExtension_painter_wrapper,
html:not(.pdfcraft-annotating):not(.pdfcraft-annotations-visible) .pdfViewer .page .konvajs-content,
html:not(.pdfcraft-annotating):not(.pdfcraft-annotations-visible) .pdfViewer .page .konvajs-content>canvas{pointer-events:none!important}
#sidebarContainer,#sidebarContent,#sidebarResizer{display:none!important;box-shadow:none!important;border:none!important}
/* Password dialog — đồng bộ workspace Modal */
#passwordDialog.pdfcraft-password-dialog{
  position:fixed!important;inset:auto!important;top:50%!important;left:50%!important;
  transform:translate(-50%,-50%)!important;margin:0!important;padding:0!important;
  border:none!important;background:transparent!important;color:hsl(var(--pdfcraft-fg))!important;
  max-width:min(440px,calc(100vw - 32px))!important;width:calc(100% - 32px)!important;
  overflow:visible!important;box-shadow:none!important;
}
#passwordDialog.pdfcraft-password-dialog::backdrop{
  background:rgba(0,0,0,.55)!important;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);
}
.pdfcraft-password-panel{
  display:flex;flex-direction:column;background:hsl(var(--pdfcraft-card));
  border:1px solid hsl(var(--pdfcraft-border));border-radius:var(--radius-lg,12px);
  box-shadow:0 20px 48px rgba(0,0,0,.22);overflow:hidden;
}
.pdfcraft-password-header{
  display:flex;align-items:center;gap:12px;padding:16px 20px;
  border-bottom:1px solid hsl(var(--pdfcraft-border));
  background:hsl(var(--pdfcraft-muted)/0.45);
}
.pdfcraft-password-header-icon{
  display:flex;align-items:center;justify-content:center;flex-shrink:0;
  width:40px;height:40px;border-radius:10px;
  background:hsl(var(--pdfcraft-primary)/0.12);color:hsl(var(--pdfcraft-primary));
}
.pdfcraft-password-title{
  margin:0;font-size:17px;font-weight:600;line-height:1.3;color:hsl(var(--pdfcraft-fg));
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
.pdfcraft-password-body{padding:16px 20px 8px;display:flex;flex-direction:column;gap:12px}
#passwordDialog .pdfcraft-password-label{
  display:block;margin:0;font-size:14px;line-height:1.5;font-weight:500;
  color:hsl(var(--pdfcraft-muted-fg));text-align:start!important;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
#passwordDialog .pdfcraft-password-label.pdfcraft-password-error{
  color:hsl(var(--pdfcraft-danger))!important;font-weight:600;
}
#passwordDialog .pdfcraft-password-input{
  width:100%!important;max-width:none!important;box-sizing:border-box!important;
  height:40px!important;padding:8px 12px!important;margin:0!important;
  font-size:14px!important;line-height:1.4!important;
  color:hsl(var(--pdfcraft-fg))!important;
  background:hsl(var(--pdfcraft-card))!important;
  border:1px solid hsl(var(--pdfcraft-border))!important;border-radius:8px!important;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif!important;
  outline:none!important;box-shadow:none!important;
}
#passwordDialog .pdfcraft-password-input:focus{
  border-color:hsl(var(--pdfcraft-primary))!important;
  box-shadow:0 0 0 2px hsl(var(--pdfcraft-primary)/0.25)!important;
}
.pdfcraft-password-actions{
  display:flex!important;justify-content:flex-end!important;align-items:center!important;
  gap:8px!important;padding:12px 20px 16px!important;margin:0!important;
  border-top:1px solid hsl(var(--pdfcraft-border));
}
#passwordDialog .pdfcraft-password-btn{
  all:unset;box-sizing:border-box!important;display:inline-flex!important;
  align-items:center!important;justify-content:center!important;
  min-width:88px!important;height:36px!important;padding:0 16px!important;
  font-size:14px!important;font-weight:500!important;line-height:1!important;
  border-radius:8px!important;cursor:pointer!important;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif!important;
  pointer-events:auto!important;
}
#passwordDialog .pdfcraft-password-btn > span{display:inline!important;color:inherit!important}
#passwordDialog .pdfcraft-password-btn-secondary{
  color:hsl(var(--pdfcraft-fg))!important;
  background:hsl(var(--pdfcraft-muted))!important;
  border:1px solid hsl(var(--pdfcraft-border))!important;
}
#passwordDialog .pdfcraft-password-btn-secondary:hover{
  background:hsl(var(--pdfcraft-border))!important;
}
#passwordDialog .pdfcraft-password-btn-primary{
  color:hsl(var(--pdfcraft-primary-fg))!important;
  background:hsl(var(--pdfcraft-primary))!important;
  border:1px solid hsl(var(--pdfcraft-primary))!important;
}
#passwordDialog .pdfcraft-password-btn-primary:hover{
  filter:brightness(0.95);
}
#passwordDialog .row{margin:0!important;padding:0!important}
#passwordDialog .buttonRow{display:contents!important}
`;

export function applyPdfcraftThemeVars(doc: Document, theme: 'light' | 'dark' = 'light') {
  const vars = PDFCRAFT_THEME_VARS[theme];
  const root = doc.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

function passwordDialogTitle(locale: string): string {
  return PASSWORD_DIALOG_TITLE[locale] ?? PASSWORD_DIALOG_TITLE.en;
}

/** Restyle PDF.js native password prompt to match PDFCraft workspace. */
export function setupPasswordDialogChrome(
  doc: Document,
  opts?: { theme?: 'light' | 'dark'; locale?: string },
) {
  const theme = opts?.theme ?? 'light';
  const locale = opts?.locale ?? 'en';
  applyPdfcraftThemeVars(doc, theme);

  const mount = () => {
    const dialog = doc.getElementById('passwordDialog');
    if (!dialog) return;

    dialog.classList.add('pdfcraft-password-dialog');

    if (dialog.querySelector('.pdfcraft-password-panel')) return;

    const label = doc.getElementById('passwordText');
    const input = doc.getElementById('password') as HTMLInputElement | null;
    const submit = doc.getElementById('passwordSubmit');
    const cancel = doc.getElementById('passwordCancel');
    const rows = Array.from(dialog.querySelectorAll(':scope > .row'));
    const buttonRow = dialog.querySelector('.buttonRow');

    const panel = doc.createElement('div');
    panel.className = 'pdfcraft-password-panel';

    const header = doc.createElement('div');
    header.className = 'pdfcraft-password-header';
    header.innerHTML = `
      <div class="pdfcraft-password-header-icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <div class="pdfcraft-password-header-text">
        <h2 class="pdfcraft-password-title">${passwordDialogTitle(locale)}</h2>
      </div>
    `;

    const body = doc.createElement('div');
    body.className = 'pdfcraft-password-body';
    for (const row of rows) body.appendChild(row);

    if (label) label.classList.add('pdfcraft-password-label');
    if (input) {
      input.classList.remove('toolbarField');
      input.classList.add('pdfcraft-password-input');
      input.autocomplete = 'current-password';
      input.placeholder = locale === 'vi' ? 'Nhập mật khẩu' : 'Enter password';
    }

    const actions = doc.createElement('div');
    actions.className = 'pdfcraft-password-actions';
    if (buttonRow) {
      buttonRow.classList.remove('buttonRow');
      actions.appendChild(buttonRow);
    } else if (cancel && submit) {
      actions.append(cancel, submit);
    }

    if (submit) {
      submit.classList.add('pdfcraft-password-btn', 'pdfcraft-password-btn-primary');
    }
    if (cancel) {
      cancel.classList.add('pdfcraft-password-btn', 'pdfcraft-password-btn-secondary');
    }

    panel.append(header, body, actions);
    dialog.replaceChildren(panel);
  };

  mount();

  const dialog = doc.getElementById('passwordDialog') as HTMLDialogElement | null;
  if (dialog && !dialog.dataset.pdfcraftBound) {
    dialog.dataset.pdfcraftBound = '1';
    dialog.addEventListener('toggle', () => {
      if (dialog.open) {
        const input = doc.getElementById('password') as HTMLInputElement | null;
        requestAnimationFrame(() => input?.focus());
      } else {
        doc.getElementById('passwordText')?.classList.remove('pdfcraft-password-error');
      }
    });
  }

  if (!doc.body.dataset.pdfcraftPwdObs) {
    doc.body.dataset.pdfcraftPwdObs = '1';
    const container = doc.getElementById('dialogContainer') ?? doc.body;
    const obs = new MutationObserver(() => mount());
    obs.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open'],
    });
  }

  const label = doc.getElementById('passwordText');
  if (label && !label.dataset.pdfcraftLabelObs) {
    label.dataset.pdfcraftLabelObs = '1';
    const syncInvalid = () => {
      const text = (label.textContent ?? '').toLowerCase();
      const invalid =
        label.getAttribute('data-l10n-id') === 'pdfjs-password-invalid' ||
        text.includes('invalid') ||
        text.includes('không đúng') ||
        text.includes('incorrect');
      label.classList.toggle('pdfcraft-password-error', invalid);
    };
    syncInvalid();
    const labelObs = new MutationObserver(syncInvalid);
    labelObs.observe(label, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-l10n-id'],
    });
  }
}

/** Konva layers hidden by CSS (opacity:0) — no DOM removal needed. */
export function removeAnnotationPainters(_doc: Document) {
  // No-op: CSS handles visibility. Removing from DOM breaks the painter.
}

export function removeExtensionPanels(_doc: Document) {
  // Giữ CustomComment — extension cần store chú thích.
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

export function injectPdfViewerChrome(
  doc: Document,
  styleId = 'pdfcraft-viewer-chrome',
  theme: 'light' | 'dark' = 'light',
  locale?: string,
) {
  const shellBg = PDF_VIEWER_SHELL_BG[theme];
  doc.documentElement.style.setProperty('--pdfcraft-shell-bg', shellBg);
  applyPdfcraftThemeVars(doc, theme);
  let style = doc.getElementById(styleId) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = styleId;
    doc.head.appendChild(style);
  }
  style.textContent = PDF_VIEWER_CHROME_CSS;

  doc.querySelector('.pdfViewer')?.classList.add('removePageBorders');
  stripPdfViewerSeams(doc);
  setupPasswordDialogChrome(doc, { theme, locale });
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
  update?: () => void;
}): void {
  pdfViewer.currentScaleValue = 'page-width';
  if (typeof pdfViewer.scrollMode !== 'undefined') {
    pdfViewer.scrollMode = 0;
  }
  pdfViewer.update?.();
}

/** Vừa toàn trang trong khung viewer. */
export function fitPdfViewerPageFit(pdfViewer: {
  currentScaleValue: string;
  currentScale?: number;
  scrollMode?: number;
  update?: () => void;
}): void {
  pdfViewer.currentScaleValue = 'page-fit';
  if (typeof pdfViewer.scrollMode !== 'undefined') {
    pdfViewer.scrollMode = 0;
  }
  pdfViewer.update?.();
}

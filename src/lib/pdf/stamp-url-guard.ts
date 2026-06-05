/** Validates stamp/signature image URLs used in the PDF annotation iframe. */
export function isInvalidMediaUrl(url: unknown): boolean {
  if (url == null) return true;
  if (typeof url !== 'string') return true;
  const u = url.trim();
  if (!u || u === 'null' || u === 'undefined') return true;
  if (u.includes('/null/') || u.includes('/web/null')) return true;
  if (u.endsWith('/null')) return true;
  return false;
}

export function isValidStampUrl(url: unknown): boolean {
  if (isInvalidMediaUrl(url)) return false;
  const u = (url as string).trim();
  return (
    u.startsWith('data:image/') ||
    u.startsWith('blob:') ||
    u.startsWith('http://') ||
    u.startsWith('https://') ||
    (u.startsWith('/') && !u.includes('/null'))
  );
}

/** Injected into pdfjs annotation iframe — keep in sync with stamp-url-guard.ts */
export function buildStampUrlGuardScript(): string {
  return `
        function isInvalidMediaUrl(url){
          if(url == null) return true;
          if(typeof url !== 'string') return true;
          var u = url.trim();
          if(!u || u === 'null' || u === 'undefined') return true;
          if(u.indexOf('/null/') >= 0 || u.indexOf('/web/null') >= 0) return true;
          if(u.length >= 5 && u.slice(-5) === '/null') return true;
          return false;
        }
        function isValidStampUrl(url){
          if(isInvalidMediaUrl(url)) return false;
          var u = url.trim();
          return u.indexOf('data:image/') === 0 || u.indexOf('blob:') === 0 ||
            u.indexOf('http://') === 0 || u.indexOf('https://') === 0 ||
            (u.indexOf('/') === 0 && u.indexOf('/null') < 0);
        }
        function guardRoot(){
          return typeof window !== 'undefined' ? window : globalThis;
        }
        function patchInvalidMediaUrls(){
          var root = guardRoot();
          if(root.__pdfcraftMediaGuard) return;
          root.__pdfcraftMediaGuard = true;
          try {
            var desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
            if(desc && desc.set) {
              var nativeSet = desc.set;
              Object.defineProperty(HTMLImageElement.prototype, 'src', {
                configurable: true,
                enumerable: desc.enumerable,
                get: desc.get,
                set: function(v) {
                  if(isInvalidMediaUrl(v)) return;
                  return nativeSet.call(this, v);
                }
              });
            }
          } catch(e) {}
          try {
            var origSetAttr = Element.prototype.setAttribute;
            Element.prototype.setAttribute = function(name, value) {
              if(String(name).toLowerCase() === 'src' && this.tagName === 'IMG' && isInvalidMediaUrl(value)) return;
              return origSetAttr.call(this, name, value);
            };
          } catch(e) {}
          function getKonva(){
            if(typeof window !== 'undefined' && window.Konva) return window.Konva;
            if(typeof document !== 'undefined' && document.defaultView && document.defaultView.Konva) return document.defaultView.Konva;
            return globalThis.Konva || null;
          }
          function patchKonva(){
            var K = getKonva();
            if(!K || !K.Image || !K.Image.fromURL || K.Image.fromURL.__pdfcraftPatched) return;
            var orig = K.Image.fromURL;
            K.Image.fromURL = function(url, cb, onError) {
              if(isInvalidMediaUrl(url)) {
                if(typeof onError === 'function') onError();
                return;
              }
              return orig.call(this, url, cb, onError);
            };
            K.Image.fromURL.__pdfcraftPatched = true;
          }
          patchKonva();
          var konvaAttempts = 0;
          var konvaTimer = setInterval(function(){
            patchKonva();
            konvaAttempts += 1;
            var K2 = getKonva();
            if((K2 && K2.Image && K2.Image.fromURL && K2.Image.fromURL.__pdfcraftPatched) || konvaAttempts >= 50) clearInterval(konvaTimer);
          }, 100);
        }
  `.trim();
}

export function buildStampGuardBootstrapScript(): string {
  return `(function(){\n${buildStampUrlGuardScript()}\npatchInvalidMediaUrls();\n})();`;
}

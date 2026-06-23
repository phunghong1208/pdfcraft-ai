/**
 * HTTP Content-Disposition an toàn — header chỉ chấp nhận ByteString (Latin-1).
 * Tên file Unicode (đ, ề, …) phải dùng filename*=UTF-8''.
 */

function asciiFileNameFallback(fileName: string): string {
  const cleaned = fileName
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_')
    .trim();
  return cleaned || 'download';
}

/** attachment; filename="ascii-fallback"; filename*=UTF-8''encoded */
export function contentDispositionAttachment(fileName: string): string {
  const fallback = asciiFileNameFallback(fileName);
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** Sửa header upstream/proxy khi có ký tự > U+00FF (vd. đ = 273). */
export function normalizeContentDispositionHeader(value: string): string {
  let needsRewrite = false;
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 255) {
      needsRewrite = true;
      break;
    }
  }
  if (!needsRewrite) return value;

  const utf8 = value.match(/filename\*=UTF-8''([^;\s]+)/i);
  if (utf8?.[1]) {
    try {
      return contentDispositionAttachment(decodeURIComponent(utf8[1]));
    } catch {
      // fall through
    }
  }

  const quoted = value.match(/filename="([^"]+)"/i);
  const plain = value.match(/filename=([^;\s]+)/i);
  const raw = (quoted?.[1] ?? plain?.[1] ?? 'download').trim();
  return contentDispositionAttachment(raw);
}

/** Copy response headers từ upstream fetch, an toàn với Unicode. */
export function copyProxyResponseHeaders(
  upstream: Response,
  skip = new Set(['transfer-encoding']),
): Headers {
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (skip.has(key.toLowerCase())) return;
    try {
      const normalized =
        key.toLowerCase() === 'content-disposition'
          ? normalizeContentDispositionHeader(value)
          : value;
      headers.set(key, normalized);
    } catch {
      if (key.toLowerCase() === 'content-disposition') {
        headers.set(key, contentDispositionAttachment('download'));
      }
    }
  });
  return headers;
}

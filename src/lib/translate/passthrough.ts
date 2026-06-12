/** Bỏ qua OpenAI — dùng text block gốc để test OCR + render. */
export function isTranslatePassthroughFromSearch(search: string): boolean {
  return new URLSearchParams(search).get('passthrough') === '1';
}

export function isTranslatePassthroughClient(): boolean {
  if (process.env.NEXT_PUBLIC_TRANSLATE_PASSTHROUGH === '1') return true;
  if (typeof window === 'undefined') return false;
  return isTranslatePassthroughFromSearch(window.location.search);
}

export function isTranslatePassthroughServer(
  formPassthrough?: string | null,
): boolean {
  if (process.env.TRANSLATE_PASSTHROUGH === '1') return true;
  return formPassthrough === '1' || formPassthrough === 'true';
}

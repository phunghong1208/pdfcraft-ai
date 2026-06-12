/** Upstream PDF microservice (OCR + layout + pdf-to-docx) — một cổng duy nhất. */
export function pdfServerUpstream(): string {
  return (
    process.env.PDF_SERVER_UPSTREAM ||
    process.env.OCR_SERVER_UPSTREAM ||
    process.env.LAYOUT_SERVER_UPSTREAM ||
    'http://localhost:8100'
  ).replace(/\/$/, '');
}

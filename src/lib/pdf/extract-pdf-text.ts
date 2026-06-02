/** Lỗi phổ biến từ AI server khi PDF không có lớp text (chỉ ảnh / font lạ). */
export function isPdfNoExtractableTextError(message: string): boolean {
  return /no extractable text/i.test(message);
}

export { extractTextFromPdfFile, buildPdfSpeechIndex } from '@/lib/pdf/pdf-speech-index';
export type { PdfSpeechIndex, PdfSpeechSegment } from '@/lib/pdf/pdf-speech-index';

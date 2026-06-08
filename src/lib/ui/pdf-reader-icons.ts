import type { PdfReaderIconId } from '@/components/icons/PdfReaderIcons';
import type { IconTone } from '@/lib/ui/icon-tones';

const ICON_BY_TOOL: Partial<Record<string, PdfReaderIconId>> = {
  // Convert
  'ocr-pdf': 'scan-to-pdf',
  'image-to-pdf': 'image-to-pdf',
  'jpg-to-pdf': 'image-to-pdf',
  'png-to-pdf': 'image-to-pdf',
  'webp-to-pdf': 'image-to-pdf',
  'bmp-to-pdf': 'image-to-pdf',
  'heic-to-pdf': 'image-to-pdf',
  'tiff-to-pdf': 'image-to-pdf',
  'svg-to-pdf': 'image-to-pdf',
  'psd-to-pdf': 'image-to-pdf',
  'word-to-pdf': 'file-to-pdf',
  'excel-to-pdf': 'file-to-pdf',
  'pptx-to-pdf': 'file-to-pdf',
  'txt-to-pdf': 'file-to-pdf',
  'json-to-pdf': 'file-to-pdf',
  'rtf-to-pdf': 'file-to-pdf',
  'xps-to-pdf': 'file-to-pdf',
  'epub-to-pdf': 'file-to-pdf',
  'mobi-to-pdf': 'file-to-pdf',
  'djvu-to-pdf': 'file-to-pdf',
  'fb2-to-pdf': 'file-to-pdf',
  'pdf-to-docx': 'pdf-to-word',
  'pdf-to-pptx': 'pdf-to-ppt',
  'pdf-to-excel': 'pdf-to-excel',
  'pdf-to-jpg': 'pdf-to-image',
  'pdf-to-png': 'pdf-to-image',
  'pdf-to-webp': 'pdf-to-image',
  'pdf-to-bmp': 'pdf-to-image',
  'pdf-to-tiff': 'pdf-to-image',
  'pdf-to-svg': 'pdf-to-image',
  'pdf-to-cbz': 'pdf-to-image',
  'combine-single-page': 'pdf-to-long-image',
  // Edit
  'edit-pdf': 'edit-text',
  'form-filler': 'add-text',
  'form-creator': 'add-text',
  'sign-pdf': 'signature',
  'digital-sign': 'signature',
  'add-watermark': 'watermark',
  'pdf-multi-tool': 'annotate',
  // Actions
  'merge-pdf': 'merge',
  'alternate-merge': 'merge',
  'split-pdf': 'split',
  'compress-pdf': 'compress',
  'organize-pdf': 'manage-pages',
  'extract-pages': 'manage-pages',
  'delete-pages': 'manage-pages',
  'rotate-pdf': 'manage-pages',
  'crop-pdf': 'manage-pages',
  'reverse-pages': 'manage-pages',
  'n-up-pdf': 'manage-pages',
  'posterize-pdf': 'manage-pages',
  // Protect
  'encrypt-pdf': 'lock-pdf',
  'decrypt-pdf': 'unlock-pdf',
};

const TONE_BY_ICON: Record<PdfReaderIconId, IconTone> = {
  'scan-to-pdf': 'green',
  'image-to-pdf': 'red',
  'file-to-pdf': 'purple',
  'pdf-to-word': 'blue',
  'pdf-to-ppt': 'orange',
  'pdf-to-excel': 'green',
  'pdf-to-image': 'teal',
  'pdf-to-long-image': 'blue',
  'edit-text': 'blue',
  'add-text': 'blue',
  annotate: 'orange',
  signature: 'green',
  watermark: 'purple',
  merge: 'green',
  split: 'orange',
  compress: 'purple',
  'manage-pages': 'blue',
  'lock-pdf': 'red',
  'unlock-pdf': 'green',
};

export function getPdfReaderIconId(toolId?: string): PdfReaderIconId | null {
  if (!toolId) return null;
  return ICON_BY_TOOL[toolId] ?? null;
}

export function getPdfReaderIconTone(iconId: PdfReaderIconId): IconTone {
  return TONE_BY_ICON[iconId];
}

/** @deprecated Dùng getPdfReaderIconId */
export function getConvertIconId(toolId?: string) {
  return getPdfReaderIconId(toolId);
}

/** @deprecated Dùng getPdfReaderIconTone */
export function getConvertIconTone(iconId: PdfReaderIconId) {
  return getPdfReaderIconTone(iconId);
}

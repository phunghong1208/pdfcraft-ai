export type IconTone = 'primary' | 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'gray' | 'teal';

/** Icon container — light/dark via CSS variables in globals.css */
export function iconToneClass(tone: IconTone): string {
  return `icon-tone icon-tone-${tone}`;
}

/** Per-tool icon colors aligned with PDF Reader mockup */
const TOOL_TONE_MAP: Record<string, IconTone> = {
  'merge-pdf': 'orange',
  'alternate-merge': 'orange',
  'split-pdf': 'green',
  'organize-pdf': 'blue',
  'compress-pdf': 'blue',
  'pdf-to-docx': 'blue',
  'word-to-pdf': 'blue',
  'pdf-to-excel': 'green',
  'excel-to-pdf': 'green',
  'pdf-to-pptx': 'orange',
  'pptx-to-pdf': 'orange',
  'edit-pdf': 'blue',
  'ocr-pdf': 'blue',
  'sign-pdf': 'green',
  'encrypt-pdf': 'red',
  'decrypt-pdf': 'orange',
  'add-watermark': 'gray',
  'image-to-pdf': 'red',
  'jpg-to-pdf': 'red',
  'image-to-pdf': 'red',
  'png-to-pdf': 'red',
  'webp-to-pdf': 'red',
  'svg-to-pdf': 'purple',
  'bmp-to-pdf': 'red',
  'heic-to-pdf': 'blue',
  'tiff-to-pdf': 'blue',
  'txt-to-pdf': 'gray',
  'json-to-pdf': 'teal',
  'psd-to-pdf': 'purple',
  'xps-to-pdf': 'blue',
  'rtf-to-pdf': 'blue',
  'epub-to-pdf': 'green',
  'mobi-to-pdf': 'green',
  'djvu-to-pdf': 'blue',
  'fb2-to-pdf': 'green',
  'pdf-to-png': 'blue',
  'pdf-to-webp': 'blue',
  'pdf-to-bmp': 'blue',
  'pdf-to-tiff': 'blue',
  'pdf-to-cbz': 'green',
  'pdf-to-svg': 'purple',
  'pdf-to-greyscale': 'gray',
  'pdf-to-json': 'teal',
  'pdf-to-markdown': 'teal',
  'repair-pdf': 'blue',
  'linearize-pdf': 'blue',
  'find-and-redact': 'red',
  'header-footer': 'blue',
  'page-numbers': 'blue',
  'background-color': 'teal',
  'extract-pages': 'green',
  'delete-pages': 'orange',
  'crop-pdf': 'blue',
  'rotate-pdf': 'blue',
  'pdf-to-image': 'blue',
  'pdf-to-jpg': 'blue',
  'flatten-pdf': 'gray',
  'compare-pdfs': 'purple',
  'edit-metadata': 'gray',
  'remove-metadata': 'gray',
  'change-permissions': 'red',
  'form-filler': 'green',
  'digital-sign': 'green',
  'validate-signature': 'green',
};

const CATEGORY_TONE_FALLBACK: Record<string, IconTone> = {
  'organize-manage': 'blue',
  'convert-to-pdf': 'blue',
  'convert-from-pdf': 'blue',
  'edit-annotate': 'blue',
  'optimize-repair': 'blue',
  'secure-pdf': 'green',
};

export function getToolIconTone(toolId: string, category?: string): IconTone {
  return TOOL_TONE_MAP[toolId] ?? (category ? CATEGORY_TONE_FALLBACK[category] : undefined) ?? 'blue';
}

export function toolActionCardClass(tone: IconTone): string {
  return `tool-action-card icon-tone icon-tone-${tone}`;
}

/** AI homepage cards — dark surface, accent border & glow */
export type AiCardAccent = 'purple' | 'blue' | 'coral' | 'green' | 'violet';

export function aiCardAccentClass(accent: AiCardAccent): string {
  return `ai-card ai-card-surface ai-card-accent-${accent}`;
}

/** @deprecated Use AiCardAccent */
export type AiCardVariant = AiCardAccent | 'violet-wide' | 'neutral';

export function aiCardClass(variant: AiCardVariant): string {
  if (variant === 'violet-wide' || variant === 'neutral') return aiCardAccentClass('purple');
  return aiCardAccentClass(variant);
}

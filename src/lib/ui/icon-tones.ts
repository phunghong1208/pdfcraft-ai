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
  'png-to-pdf': 'red',
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

/** AI power-up card gradients — theme-aware via CSS vars */
export type AiCardVariant = 'purple' | 'blue' | 'coral' | 'green' | 'violet-wide';

export function aiCardClass(variant: AiCardVariant): string {
  return `ai-card ai-card-${variant}`;
}

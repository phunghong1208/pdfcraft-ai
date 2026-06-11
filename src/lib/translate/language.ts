const LANG_NAMES: Record<string, string> = {
  en: 'English',
  vi: 'Vietnamese',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  ar: 'Arabic',
  it: 'Italian',
  id: 'Indonesian',
  ro: 'Romanian',
};

export function languageDisplayName(code: string): string {
  const normalized = code.trim();
  return LANG_NAMES[normalized] ?? LANG_NAMES[normalized.toLowerCase()] ?? normalized;
}

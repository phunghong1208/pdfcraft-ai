/** 26 ngôn ngữ product — mã Tesseract (OCR đầu vào). Render dịch dùng font Noto, không cần pack này. */

export const PRODUCT_TESSERACT_LANGS = [
  'eng', 'spa', 'fra', 'deu', 'ita', 'por',
  'jpn', 'rus', 'kor', 'chi_sim', 'chi_tra',
  'ara', 'bul', 'cat', 'nld', 'ell', 'hin', 'ind', 'msa',
  'pol', 'swe', 'tha', 'tur', 'ukr', 'vie', 'swa',
] as const;

export type ProductTesseractLang = (typeof PRODUCT_TESSERACT_LANGS)[number];

/** Locale app (UI dịch) → mã Tesseract OCR nguồn */
export const APP_TO_TESSERACT: Record<string, ProductTesseractLang> = {
  en: 'eng',
  es: 'spa',
  fr: 'fra',
  de: 'deu',
  it: 'ita',
  pt: 'por',
  ja: 'jpn',
  ru: 'rus',
  ko: 'kor',
  zh: 'chi_sim',
  'zh-TW': 'chi_tra',
  ar: 'ara',
  bg: 'bul',
  ca: 'cat',
  nl: 'nld',
  el: 'ell',
  hi: 'hin',
  id: 'ind',
  ms: 'msa',
  pl: 'pol',
  sv: 'swe',
  th: 'tha',
  tr: 'tur',
  uk: 'ukr',
  vi: 'vie',
  sw: 'swa',
};

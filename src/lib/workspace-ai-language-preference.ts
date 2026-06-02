import {
  getWorkspaceAiLanguageForLocale,
  isWorkspaceAiLanguageSupported,
  WORKSPACE_DEFAULT_AI_LANGUAGE,
} from '@/services/workspaceAiApi';

/** Chỉ lưu khi user đổi khác ngôn ngữ UI (setting) */
const OVERRIDE_KEY = 'pdfcraft-ai-answer-language-override';

export function getDefaultWorkspaceAiAnswerLanguage(locale?: string): string {
  return locale ? getWorkspaceAiLanguageForLocale(locale) : WORKSPACE_DEFAULT_AI_LANGUAGE;
}

/** Mặc định = ngôn ngữ app (locale); override nếu user đã chọn riêng trong panel AI */
export function loadWorkspaceAiAnswerLanguage(locale?: string): string {
  if (typeof window === 'undefined') {
    return getDefaultWorkspaceAiAnswerLanguage(locale);
  }
  try {
    const override = localStorage.getItem(OVERRIDE_KEY);
    if (override && isWorkspaceAiLanguageSupported(override)) return override;
  } catch {
    // ignore
  }
  return getDefaultWorkspaceAiAnswerLanguage(locale);
}

export function saveWorkspaceAiAnswerLanguage(language: string, locale?: string): void {
  if (typeof window === 'undefined') return;
  const defaultForLocale = getDefaultWorkspaceAiAnswerLanguage(locale);
  try {
    if (language === defaultForLocale) {
      localStorage.removeItem(OVERRIDE_KEY);
    } else {
      localStorage.setItem(OVERRIDE_KEY, language);
    }
  } catch {
    // ignore quota / private mode
  }
}

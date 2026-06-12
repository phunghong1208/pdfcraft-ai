import { defaultLocale, localeConfig, locales, type Locale } from '@/lib/i18n/config';
import {
  loadPersistedSuggestedQuestions,
  savePersistedSuggestedQuestions,
} from '@/lib/workspace-ai-persistence';
import {
  buildSuggestedQuestionsPrompt,
  parseSuggestedQuestionsFromResponse,
  peekSuggestedQuestions,
  rememberSuggestedQuestions,
  suggestedQuestionsCacheKey,
} from '@/lib/workspace-ai-suggested-questions';

/** Same-origin proxy path — paired with next.config rewrites (dev) or nginx (prod). */
const WORKSPACE_AI_PROXY_PATH = '/api/workspace-ai';

export const WORKSPACE_AI_USER_KEY = 'user_001';
/** API mặc định POST /summary */
export const WORKSPACE_SUMMARY_DETAIL = '0.2';

export type WorkspacePresetTierId = 'light' | 'balanced' | 'deep';

export type WorkspaceSummaryDetailPreset = {
  id: WorkspacePresetTierId;
  /** form-data `detail` — 0 ngắn nhất, 0.2 cân bằng, 1 chi tiết nhất */
  detail: string;
};

export type WorkspaceChatTopKPreset = {
  id: WorkspacePresetTierId;
  topK: number;
};

/** POST /summary — tham số `detail` */
export const WORKSPACE_SUMMARY_DETAIL_PRESETS: WorkspaceSummaryDetailPreset[] = [
  { id: 'light', detail: '0' },
  { id: 'balanced', detail: '0.2' },
  { id: 'deep', detail: '1' },
];

/** POST /chat — tham số `top_k` */
export const WORKSPACE_CHAT_TOP_K_PRESETS: WorkspaceChatTopKPreset[] = [
  { id: 'light', topK: 3 },
  { id: 'balanced', topK: 5 },
  { id: 'deep', topK: 10 },
];

export const WORKSPACE_DEFAULT_PRESET_TIER: WorkspacePresetTierId = 'balanced';

/** Giá trị `language` gửi lên POST /summary và POST /chat (tên tiếng Anh, vd. Vietnamese). */
export type WorkspaceAiResponseLanguage = {
  /** API form field / JSON value */
  apiName: string;
  locale: Locale;
  nativeName: string;
};

export const WORKSPACE_AI_RESPONSE_LANGUAGES: WorkspaceAiResponseLanguage[] = locales.map((loc) => ({
  apiName: localeConfig[loc].name,
  locale: loc,
  nativeName: localeConfig[loc].nativeName,
}));

export const WORKSPACE_DEFAULT_AI_LANGUAGE = localeConfig[defaultLocale].name;

export function getWorkspaceAiLanguageForLocale(locale: string): string {
  if (locale in localeConfig) return localeConfig[locale as Locale].name;
  return WORKSPACE_DEFAULT_AI_LANGUAGE;
}

export function isWorkspaceAiLanguageSupported(language: string): boolean {
  return WORKSPACE_AI_RESPONSE_LANGUAGES.some((l) => l.apiName === language);
}

/** Mã BCP 47 cho Web Speech API — khớp ngôn ngữ trả lời AI */
const SPEECH_LANG_BY_LOCALE: Record<Locale, string> = {
  en: 'en-US',
  vi: 'vi-VN',
  ja: 'ja-JP',
  ko: 'ko-KR',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  zh: 'zh-CN',
  'zh-TW': 'zh-TW',
  pt: 'pt-BR',
  ar: 'ar-SA',
  it: 'it-IT',
  id: 'id-ID',
  ro: 'ro-RO',
};

export function getSpeechLangForWorkspaceAiAnswerLanguage(apiName: string): string {
  const entry = WORKSPACE_AI_RESPONSE_LANGUAGES.find((l) => l.apiName === apiName);
  if (entry) return SPEECH_LANG_BY_LOCALE[entry.locale] ?? 'en-US';
  return 'en-US';
}

export function getWorkspaceSummaryDetailPreset(id: WorkspacePresetTierId): WorkspaceSummaryDetailPreset {
  return WORKSPACE_SUMMARY_DETAIL_PRESETS.find((p) => p.id === id) ?? WORKSPACE_SUMMARY_DETAIL_PRESETS[1];
}

export function getWorkspaceChatTopKPreset(id: WorkspacePresetTierId): WorkspaceChatTopKPreset {
  return WORKSPACE_CHAT_TOP_K_PRESETS.find((p) => p.id === id) ?? WORKSPACE_CHAT_TOP_K_PRESETS[1];
}

const DEFAULT_USER_KEY = WORKSPACE_AI_USER_KEY;
const DEFAULT_TOP_K = getWorkspaceChatTopKPreset(WORKSPACE_DEFAULT_PRESET_TIER).topK;
const DEFAULT_SUMMARY_DETAIL = getWorkspaceSummaryDetailPreset(WORKSPACE_DEFAULT_PRESET_TIER).detail;

export type WorkspaceChatResponse = {
  answer?: string;
  response?: string;
  message?: string;
  text?: string;
};

export type WorkspaceSummaryResponse = {
  summary?: string;
  markdown?: string;
  text?: string;
  content?: string;
  result?: string;
  data?: Record<string, unknown>;
  document_id?: number;
  documentId?: number;
};

export type WorkspaceIndexResponse = {
  document_id?: number;
  documentId?: number;
  id?: number;
};

/** Shared document id fields returned by index/upload/summary APIs. */
type WorkspaceDocumentIdPayload = {
  document_id?: number;
  documentId?: number;
  id?: number;
};

function getBaseUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_WORKSPACE_AI_URL ||
    process.env.NEXT_PUBLIC_AI_API_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');
  return `${basePath}${WORKSPACE_AI_PROXY_PATH}`.replace(/\/$/, '');
}

/** URL gọi API — slash cuối chỉ khi qua Next proxy (relative). FastAPI đăng ký /summary không có slash. */
function buildApiUrl(pathSegment: string): string {
  const base = getBaseUrl();
  const segment = pathSegment.replace(/^\//, '').replace(/\/$/, '');
  const url = `${base}/${segment}`;
  const isRelativeNextProxy = url.startsWith('/');
  return isRelativeNextProxy && !url.endsWith('/') ? `${url}/` : url;
}

function wrapNetworkError(err: unknown): Error {
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return new Error(
      'Không gọi được API AI (Failed to fetch / socket hang up). ' +
        'Tóm tắt thường mất 1–2 phút — nếu lỗi sớm hơn ~30s, restart `npm run dev` (proxy timeout). ' +
        'Dùng NEXT_PUBLIC_WORKSPACE_AI_URL=/api/workspace-ai hoặc bật CORS khi gọi thẳng IP.',
    );
  }
  if (err instanceof Error) return err;
  return new Error(String(err));
}

function tryDocumentId(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}

/** Chỉ lấy id tài liệu — không dùng `id` gốc (hay là request id / page id). */
function pickDocumentId(data: Record<string, unknown>): number | null {
  const direct =
    tryDocumentId(data.document_id) ??
    tryDocumentId(data.documentId) ??
    tryDocumentId(data.doc_id);
  if (direct != null) return direct;

  const document = data.document;
  if (document && typeof document === 'object' && !Array.isArray(document)) {
    const doc = document as Record<string, unknown>;
    const fromDoc =
      tryDocumentId(doc.document_id) ??
      tryDocumentId(doc.documentId) ??
      tryDocumentId(doc.id);
    if (fromDoc != null) return fromDoc;
  }

  for (const key of ['data', 'result', 'payload'] as const) {
    const nested = data[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const fromChild = pickDocumentId(nested as Record<string, unknown>);
      if (fromChild != null) return fromChild;
    }
  }

  return null;
}

function pickText(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value != null && typeof value !== 'object' && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

const SUMMARY_TEXT_KEYS = [
  'summary',
  'markdown',
  'text',
  'content',
  'result',
  'answer',
  'output',
  'summary_text',
  'summaryText',
  'response',
] as const;

/** Trích văn bản tóm tắt từ JSON server (nhiều schema khác nhau). */
export function extractWorkspaceSummaryText(data: unknown): string {
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (!data || typeof data !== 'object') return '';

  const record = data as Record<string, unknown>;
  const direct = pickText(record, [...SUMMARY_TEXT_KEYS]);
  if (direct) return direct;

  const summaryField = record.summary;
  if (summaryField && typeof summaryField === 'object' && !Array.isArray(summaryField)) {
    const fromNested = pickText(summaryField as Record<string, unknown>, [...SUMMARY_TEXT_KEYS, 'body']);
    if (fromNested) return fromNested;
  }

  for (const key of ['data', 'result', 'payload'] as const) {
    const nested = record[key];
    if (nested && typeof nested === 'object') {
      const fromChild = extractWorkspaceSummaryText(nested);
      if (fromChild) return fromChild;
    }
  }

  return '';
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      detail?: string | Array<{ msg?: string; loc?: unknown[] }>;
      message?: string;
      error?: string;
    };
    if (Array.isArray(body.detail)) {
      return body.detail.map((d) => d.msg).filter(Boolean).join('; ') || `HTTP ${res.status}`;
    }
    if (typeof body.detail === 'string') return body.detail;
    return body.message || body.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/** Server AI hiện chỉ có /summary, /chat — không gọi /upload|/index (404). */
export async function prepareWorkspaceDocumentForChat(
  _file: File,
  _userKey = DEFAULT_USER_KEY,
): Promise<number | null> {
  return null;
}

/** @deprecated Use prepareWorkspaceDocumentForChat */
export async function indexWorkspaceDocument(file: File, userKey = DEFAULT_USER_KEY): Promise<number> {
  const id = await prepareWorkspaceDocumentForChat(file, userKey);
  if (id == null) {
    throw new Error('Could not prepare PDF for chat. Run Summary first or add /upload on the AI server.');
  }
  return id;
}

export async function chatWithWorkspaceDocument(opts: {
  question: string;
  documentId: number;
  topK?: number;
  userKey?: string;
  language?: string;
}): Promise<string> {
  let res: Response;
  try {
    res = await fetch(buildApiUrl('chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: opts.question,
        document_id: opts.documentId,
        top_k: opts.topK ?? DEFAULT_TOP_K,
        user_key: opts.userKey ?? DEFAULT_USER_KEY,
        language: opts.language ?? WORKSPACE_DEFAULT_AI_LANGUAGE,
      }),
    });
  } catch (err) {
    throw wrapNetworkError(err);
  }

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }

  const data = (await res.json()) as WorkspaceChatResponse & Record<string, unknown>;
  return (
    pickText(data, ['answer', 'response', 'message', 'text']) ||
    JSON.stringify(data, null, 2)
  );
}

const suggestedQuestionsInflight = new Map<string, Promise<string[]>>();

/** Gợi ý câu hỏi — một lần POST /chat, chỉ document_id + prompt ngắn. */
export async function generateWorkspaceSuggestedQuestions(opts: {
  documentId: number;
  language?: string;
  userKey?: string;
  topK?: number;
}): Promise<string[]> {
  const language = opts.language ?? WORKSPACE_DEFAULT_AI_LANGUAGE;
  const answer = await chatWithWorkspaceDocument({
    question: buildSuggestedQuestionsPrompt(language),
    documentId: opts.documentId,
    topK: opts.topK ?? 3,
    userKey: opts.userKey ?? DEFAULT_USER_KEY,
    language,
  });

  return parseSuggestedQuestionsFromResponse(answer).slice(0, 3);
}

/** Lấy câu hỏi gợi ý — ưu tiên cache (memory + session), tránh gọi API trùng. */
export async function resolveWorkspaceSuggestedQuestions(opts: {
  documentId: number;
  language?: string;
  file?: File | null;
  userKey?: string;
  topK?: number;
}): Promise<string[]> {
  const language = opts.language ?? WORKSPACE_DEFAULT_AI_LANGUAGE;
  const cacheKey = suggestedQuestionsCacheKey(opts.documentId, language);

  const fromMemory = peekSuggestedQuestions(cacheKey);
  if (fromMemory) return fromMemory;

  if (opts.file) {
    const fromSession = loadPersistedSuggestedQuestions(opts.file, cacheKey);
    if (fromSession) {
      rememberSuggestedQuestions(cacheKey, fromSession);
      return fromSession;
    }
  }

  const inflight = suggestedQuestionsInflight.get(cacheKey);
  if (inflight) return inflight;

  const request = generateWorkspaceSuggestedQuestions({
    documentId: opts.documentId,
    language,
    userKey: opts.userKey,
    topK: opts.topK,
  })
    .then((questions) => {
      rememberSuggestedQuestions(cacheKey, questions);
      if (opts.file && questions.length > 0) {
        savePersistedSuggestedQuestions(opts.file, cacheKey, questions);
      }
      return questions;
    })
    .finally(() => {
      suggestedQuestionsInflight.delete(cacheKey);
    });

  suggestedQuestionsInflight.set(cacheKey, request);
  return request;
}

/**
 * Tóm tắt PDF — khớp Postman:
 * POST {BASE}/summary
 * Headers: Accept: application/json
 * Body (form-data): file, detail=0.2, language=Vietnamese, user_key=user_001
 */
export async function summarizeWorkspaceDocument(
  file: File,
  opts?: { detail?: number | string; userKey?: string; language?: string },
): Promise<{ text: string; documentId: number | null }> {
  const detail = String(opts?.detail ?? DEFAULT_SUMMARY_DETAIL);
  const userKey = opts?.userKey ?? DEFAULT_USER_KEY;
  const language = opts?.language ?? WORKSPACE_DEFAULT_AI_LANGUAGE;

  const form = new FormData();
  form.append('file', file, file.name);
  form.append('detail', detail);
  form.append('language', language);
  form.append('user_key', userKey);

  let res: Response;
  try {
    res = await fetch(buildApiUrl('summary'), {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: form,
    });
  } catch (err) {
    throw wrapNetworkError(err);
  }

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const plain = (await res.text()).trim();
    return { text: plain || '(empty summary)', documentId: null };
  }

  const data = (await res.json()) as WorkspaceSummaryResponse & Record<string, unknown>;
  const text = extractWorkspaceSummaryText(data);
  if (!text) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[summary] Empty body keys:', Object.keys(data), data);
    }
    const pageCount = data.page_count ?? data.pageCount;
    const hint =
      pageCount != null
        ? ` PDF có ${pageCount} trang — nếu là bản scan, hãy chạy OCR trước.`
        : ' Nếu PDF là bản scan/ảnh, hãy dùng OCR thông minh trước.';
    throw new Error(
      `Server trả 200 nhưng không có nội dung tóm tắt.${hint}`,
    );
  }

  const documentId = pickDocumentId(data as Record<string, unknown>);

  return { text, documentId };
}

/** Server trả câu này khi chưa index / document_id không khớp kho vector. */
export function isWorkspaceChatNoContextAnswer(text: string): boolean {
  const normalized = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return (
    /no relevant context|upload and summarize|hay tao summary|tao summary truoc/i.test(normalized) ||
    /khong tim thay ngu canh|chua co ngu canh|khong co ngu canh phu hop/i.test(normalized)
  );
}

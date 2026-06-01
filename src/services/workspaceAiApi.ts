/** Same-origin proxy path — paired with next.config rewrites (dev) or nginx (prod). */
const WORKSPACE_AI_PROXY_PATH = '/api/workspace-ai';

export const WORKSPACE_AI_USER_KEY = 'user_001';
export const WORKSPACE_SUMMARY_DETAIL = '0.2';

const DEFAULT_USER_KEY = WORKSPACE_AI_USER_KEY;
const DEFAULT_TOP_K = 5;
const DEFAULT_SUMMARY_DETAIL = WORKSPACE_SUMMARY_DETAIL;

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

function pickDocumentId(data: WorkspaceDocumentIdPayload): number | null {
  const id = data.document_id ?? data.documentId ?? data.id;
  return id != null && !Number.isNaN(Number(id)) ? Number(id) : null;
}

function pickText(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
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
}): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: opts.question,
        document_id: opts.documentId,
        top_k: opts.topK ?? DEFAULT_TOP_K,
        user_key: opts.userKey ?? DEFAULT_USER_KEY,
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

/**
 * Tóm tắt PDF — khớp Postman:
 * POST {BASE}/summary
 * Headers: Accept: application/json
 * Body (form-data): file, detail=0.2, user_key=user_001
 */
export async function summarizeWorkspaceDocument(
  file: File,
  opts?: { detail?: number | string; userKey?: string },
): Promise<{ text: string; documentId: number | null }> {
  const detail = String(opts?.detail ?? DEFAULT_SUMMARY_DETAIL);
  const userKey = opts?.userKey ?? DEFAULT_USER_KEY;

  const form = new FormData();
  form.append('file', file, file.name);
  form.append('detail', detail);
  form.append('user_key', userKey);

  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}/summary`, {
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
  const nested = data.data;
  const nestedRecord =
    nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : null;

  const text =
    pickText(data, ['summary', 'markdown', 'text', 'content', 'result']) ||
    (nestedRecord ? pickText(nestedRecord, ['summary', 'markdown', 'text', 'content']) : '') ||
    (typeof data === 'string' ? data : '') ||
    JSON.stringify(data, null, 2);

  return { text, documentId: pickDocumentId(data) };
}

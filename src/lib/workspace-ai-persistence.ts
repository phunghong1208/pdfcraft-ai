import type { WorkspacePresetTierId } from '@/services/workspaceAiApi';

export type WorkspaceAiChatMessage = { role: 'user' | 'assistant'; text: string };

export type WorkspaceAiTab = 'assist' | 'chat' | 'summary' | 'translate' | 'voice';

export function normalizeWorkspaceAiTab(tab?: WorkspaceAiTab): WorkspaceAiTab {
  if (tab === 'chat' || tab === 'summary') return 'assist';
  if (tab === 'assist' || tab === 'translate' || tab === 'voice') return tab;
  return 'assist';
}

export type PersistedWorkspaceAi = {
  documentId: number;
  summaryText: string;
  summaryTierId?: WorkspacePresetTierId;
  chatTierId?: WorkspacePresetTierId;
  answerLanguage?: string;
  messages?: WorkspaceAiChatMessage[];
  aiTab?: WorkspaceAiTab;
};

const WORKSPACE_AI_STORAGE_PREFIX = 'pdfcraft-workspace-ai:';
const LEGACY_SUMMARY_STORAGE_KEY = 'pdfcraft-ai-summary-last';

const VALID_AI_TABS = new Set<WorkspaceAiTab>(['assist', 'chat', 'summary', 'translate', 'voice']);

export function getWorkspaceFileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function parseDocumentId(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return value;
}

function isSameFileMeta(
  file: File,
  meta: { fileName: string; fileSize: number; fileModified: number },
): boolean {
  return (
    meta.fileName === file.name &&
    meta.fileSize === file.size &&
    meta.fileModified === file.lastModified
  );
}

export type LoadedWorkspaceAiSession = {
  summaryText: string;
  documentId: number | null;
  summaryTierId?: WorkspacePresetTierId;
  messages: WorkspaceAiChatMessage[];
  answerLanguage?: string;
  aiTab?: WorkspaceAiTab;
};

/** Khôi phục session — có tóm tắt kể cả khi thiếu document_id (cần lập chỉ mục lại). */
export function loadWorkspaceAiSession(file: File): LoadedWorkspaceAiSession | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = sessionStorage.getItem(WORKSPACE_AI_STORAGE_PREFIX + getWorkspaceFileKey(file));
    if (raw) {
      const data = JSON.parse(raw) as PersistedWorkspaceAi & { documentId?: unknown };
      if (typeof data.summaryText === 'string' && data.summaryText.trim()) {
        return {
          summaryText: data.summaryText.trim(),
          documentId: parseDocumentId(data.documentId),
          summaryTierId: data.summaryTierId,
          messages: normalizeMessages(data.messages) ?? [],
          answerLanguage: data.answerLanguage,
          aiTab:
            data.aiTab && VALID_AI_TABS.has(data.aiTab)
              ? normalizeWorkspaceAiTab(data.aiTab)
              : undefined,
        };
      }
    }
  } catch {
    // fall through to legacy summary storage
  }

  try {
    const legacyRaw = sessionStorage.getItem(LEGACY_SUMMARY_STORAGE_KEY);
    if (!legacyRaw) return null;
    const stored = JSON.parse(legacyRaw) as {
      fileName: string;
      fileSize: number;
      fileModified: number;
      summary: string;
      documentId?: unknown;
      answerLanguage?: string;
    };
    if (!isSameFileMeta(file, stored) || typeof stored.summary !== 'string' || !stored.summary.trim()) {
      return null;
    }
    return {
      summaryText: stored.summary.trim(),
      documentId: parseDocumentId(stored.documentId),
      messages: [],
      answerLanguage: stored.answerLanguage,
    };
  } catch {
    return null;
  }
}

function isValidChatMessage(value: unknown): value is WorkspaceAiChatMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as WorkspaceAiChatMessage;
  return (message.role === 'user' || message.role === 'assistant') && typeof message.text === 'string';
}

function normalizeMessages(value: unknown): WorkspaceAiChatMessage[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || !value.every(isValidChatMessage)) return [];
  return value;
}

export function loadPersistedWorkspaceAi(file: File): PersistedWorkspaceAi | null {
  const session = loadWorkspaceAiSession(file);
  if (!session || session.documentId == null) return null;
  return {
    documentId: session.documentId,
    summaryText: session.summaryText,
    summaryTierId: session.summaryTierId,
    messages: session.messages,
    answerLanguage: session.answerLanguage,
    aiTab: session.aiTab,
  };
}

export function savePersistedWorkspaceAi(file: File, data: PersistedWorkspaceAi): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      WORKSPACE_AI_STORAGE_PREFIX + getWorkspaceFileKey(file),
      JSON.stringify(data),
    );
  } catch {
    // ignore quota / private mode
  }
}

export function clearPersistedWorkspaceAi(file: File): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(WORKSPACE_AI_STORAGE_PREFIX + getWorkspaceFileKey(file));
  } catch {
    // ignore
  }
}

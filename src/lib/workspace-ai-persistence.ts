import type { WorkspacePresetTierId } from '@/services/workspaceAiApi';

export type WorkspaceAiChatMessage = { role: 'user' | 'assistant'; text: string };

export type WorkspaceAiTab = 'chat' | 'summary' | 'translate' | 'voice';

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

const VALID_AI_TABS = new Set<WorkspaceAiTab>(['chat', 'summary', 'translate', 'voice']);

export function getWorkspaceFileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
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
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(WORKSPACE_AI_STORAGE_PREFIX + getWorkspaceFileKey(file));
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedWorkspaceAi;
    if (typeof data.documentId !== 'number' || Number.isNaN(data.documentId)) return null;
    if (typeof data.summaryText !== 'string' || !data.summaryText.trim()) return null;
    return {
      ...data,
      messages: normalizeMessages(data.messages),
      aiTab: data.aiTab && VALID_AI_TABS.has(data.aiTab) ? data.aiTab : undefined,
    };
  } catch {
    return null;
  }
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

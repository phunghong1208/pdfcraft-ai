import {
  getWorkspaceSummaryDetailPreset,
  summarizeWorkspaceDocument,
  WORKSPACE_DEFAULT_PRESET_TIER,
} from '@/services/workspaceAiApi';

const AI_API_BASE_URL = process.env.NEXT_PUBLIC_AI_API_URL || '';

async function postPdfFile<T>(endpoint: string, file: File): Promise<T> {
  if (!AI_API_BASE_URL) {
    throw new Error(
      'NEXT_PUBLIC_AI_API_URL is not configured. Set NEXT_PUBLIC_WORKSPACE_AI_URL=/api/workspace-ai in .env.local (see .env.example).',
    );
  }

  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${AI_API_BASE_URL}${endpoint}`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`API request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

/** POST /summary trên AI Document Summarizer — cùng API với workspace */
export async function summarizePdf(file: File, detail?: string) {
  const tier = getWorkspaceSummaryDetailPreset(WORKSPACE_DEFAULT_PRESET_TIER);
  const { text, documentId } = await summarizeWorkspaceDocument(file, {
    detail: detail ?? tier.detail,
  });
  return {
    summary: text,
    markdown: text,
    document_id: documentId,
    documentId,
  };
}

export async function translatePdf(file: File) {
  return postPdfFile<{ translatedText: string; outputFileUrl?: string }>('/pdf/translate', file);
}

export async function chatWithPdf(file: File) {
  return postPdfFile<{ answer: string; context?: string[] }>('/pdf/chat', file);
}

export async function smartOcrPdf(file: File) {
  return postPdfFile<{ text: string; markdown?: string; outputFileUrl?: string }>('/pdf/smart-ocr', file);
}

export async function voiceReaderPdf(file: File) {
  return postPdfFile<{ audioUrl: string; transcript?: string }>('/pdf/voice-reader', file);
}

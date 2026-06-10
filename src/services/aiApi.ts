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
export async function summarizePdf(
  file: File,
  opts?: { detail?: string; language?: string },
) {
  const tier = getWorkspaceSummaryDetailPreset(WORKSPACE_DEFAULT_PRESET_TIER);
  const { text, documentId } = await summarizeWorkspaceDocument(file, {
    detail: opts?.detail ?? tier.detail,
    language: opts?.language,
  });
  return {
    summary: text,
    markdown: text,
    document_id: documentId,
    documentId,
  };
}

/** @deprecated Dùng translateDocument từ translateDocsApi */
export async function translatePdf(file: File) {
  const { translateDocument } = await import('@/services/translateDocsApi');
  const result = await translateDocument(file, {
    sourceLang: 'en',
    targetLang: 'vi',
    outputType: 'keep_layout',
  });
  if (result.kind !== 'pdf') {
    throw new Error('Dịch giữ bố cục phải trả về PDF.');
  }
  return {
    translatedBlob: result.blob,
    fileName: result.fileName,
    outputFileUrl: URL.createObjectURL(result.blob),
  };
}

export async function chatWithPdf(file: File) {
  return postPdfFile<{ answer: string; context?: string[] }>('/pdf/chat', file);
}

export async function smartOcrPdf(file: File): Promise<{ blob: Blob; fileName: string }> {
  const form = new FormData();
  form.append('file', file);
  form.append('languages', 'vie+eng');
  form.append('deskew', 'true');
  form.append('rotate_pages', 'true');
  form.append('remove_background', 'false');
  form.append('clean', 'true');
  form.append('force_ocr', 'false');
  form.append('optimize', '1');

  const res = await fetch('/api/ocr', { method: 'POST', body: form });

  if (!res.ok) {
    let detail = 'OCR processing failed.';
    try {
      const json = await res.json();
      detail = json.detail || detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }

  const blob = await res.blob();
  const baseName = file.name.replace(/\.pdf$/i, '');
  return { blob, fileName: `${baseName}_ocr.pdf` };
}

export async function voiceReaderPdf(file: File) {
  return postPdfFile<{ audioUrl: string; transcript?: string }>('/pdf/voice-reader', file);
}

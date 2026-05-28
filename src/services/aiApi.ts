const AI_API_BASE_URL = process.env.NEXT_PUBLIC_AI_API_URL || '';

async function postPdfFile<T>(endpoint: string, file: File): Promise<T> {
  if (!AI_API_BASE_URL) {
    throw new Error('NEXT_PUBLIC_AI_API_URL is not configured');
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

export async function summarizePdf(file: File) {
  return postPdfFile<{ summary: string; markdown?: string }>('/pdf/summary', file);
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

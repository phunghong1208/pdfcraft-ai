const AI_API_BASE_URL = process.env.NEXT_PUBLIC_AI_API_URL || '';

export async function uploadPdf(file: File) {
  if (!AI_API_BASE_URL) {
    throw new Error('NEXT_PUBLIC_AI_API_URL is not configured');
  }

  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${AI_API_BASE_URL}/pdf/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`);
  }

  return res.json() as Promise<{ fileId: string; fileUrl?: string; pageCount?: number }>;
}

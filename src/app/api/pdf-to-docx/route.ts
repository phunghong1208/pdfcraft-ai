import { NextRequest, NextResponse } from 'next/server';

import { copyProxyResponseHeaders } from '@/lib/http/content-disposition';
import { pdfServerUpstream } from '@/lib/pdf-server-upstream';

const UPSTREAM = pdfServerUpstream();
const PROXY_TIMEOUT_MS = Number(process.env.OCR_PROXY_TIMEOUT_MS || '600000');

export async function POST(req: NextRequest): Promise<NextResponse> {
  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch {
    return NextResponse.json({ detail: 'Invalid multipart body.' }, { status: 400 });
  }

  const outgoing = new FormData();
  for (const [key, value] of incoming.entries()) {
    outgoing.append(key, value);
  }

  try {
    const upstream = await fetch(`${UPSTREAM}/pdf-to-docx`, {
      method: 'POST',
      body: outgoing,
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      let detail: string;
      try {
        detail = JSON.parse(text).detail;
      } catch {
        detail = text;
      }
      return NextResponse.json({ detail }, { status: upstream.status });
    }

    const responseHeaders = copyProxyResponseHeaders(upstream);

    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = /timeout|aborted/i.test(message);
    return NextResponse.json(
      {
        detail: isTimeout
          ? `Convert server không phản hồi trong ${PROXY_TIMEOUT_MS / 1000}s.`
          : `PDF→DOCX proxy lỗi: ${message}`,
      },
      { status: isTimeout ? 504 : 502 },
    );
  }
}

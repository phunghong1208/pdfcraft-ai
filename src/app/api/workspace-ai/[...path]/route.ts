import { NextRequest, NextResponse } from 'next/server';

const UPSTREAM = (process.env.AI_SERVER_UPSTREAM || 'http://192.168.1.90:8338').replace(/\/$/, '');
const PROXY_TIMEOUT_MS = Number(process.env.AI_PROXY_TIMEOUT_MS || '600000');

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxyRequest(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { path } = await context.params;
  const target = `${UPSTREAM}/${path.join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    // Skip hop-by-hop headers and HTTP/2 pseudo-headers (start with ':')
    if (lower === 'host' || lower === 'connection' || lower === 'content-length') return;
    if (key.startsWith(':')) return;
    if (!key || !/^[a-zA-Z0-9\-_!#$%&'*+.^`|~]+$/.test(key)) return;
    try {
      headers.set(key, value);
    } catch {
      // Skip malformed header names/values from browser/proxy internals.
    }
  });

  const init: RequestInit & { duplex?: 'half' } = {
    method: req.method,
    headers,
    signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body;
    init.duplex = 'half';
  }

  try {
    const upstream = await fetch(target, init);
    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'transfer-encoding') return;
      try {
        responseHeaders.set(key, value);
      } catch {
        // Skip malformed upstream headers to avoid runtime crash in proxy layer.
      }
    });

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
          ? `AI server không phản hồi trong ${PROXY_TIMEOUT_MS / 1000}s (tóm tắt PDF thường mất 1–2 phút).`
          : `Proxy lỗi: ${message}`,
      },
      { status: isTimeout ? 504 : 502 },
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;

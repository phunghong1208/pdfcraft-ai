import { NextRequest, NextResponse } from 'next/server';

const UPSTREAM = (process.env.TRANSLATE_SERVER_UPSTREAM || 'http://192.168.1.90:5533').replace(/\/$/, '');
const PROXY_TIMEOUT_MS = Number(process.env.TRANSLATE_PROXY_TIMEOUT_MS || '600000');
const DEFAULT_MODEL = process.env.TRANSLATE_DOCS_MODEL || 'gpt-4.1-nano';

type TranslateOutputType = 'keep_layout' | 'text_only';

function resolveUpstreamPath(outputType: TranslateOutputType): string {
  if (outputType === 'text_only') return '/translate/pdf/text';
  return '/translate_docs';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch {
    return NextResponse.json({ detail: 'Invalid multipart body.' }, { status: 400 });
  }

  const outputType = (incoming.get('output_type')?.toString() || 'keep_layout') as TranslateOutputType;
  const outgoing = new FormData();

  const file = incoming.get('file');
  const sourceLang = incoming.get('source_lang');
  const targetLang = incoming.get('target_lang');
  if (file != null) outgoing.append('file', file);
  if (sourceLang != null) outgoing.append('source_lang', sourceLang);
  if (targetLang != null) outgoing.append('target_lang', targetLang);

  const model = incoming.get('model')?.toString() || DEFAULT_MODEL;
  outgoing.append('model', model);

  const deviceId = process.env.TRANSLATE_DEVICE_ID;
  if (!deviceId) {
    return NextResponse.json(
      { detail: 'Thiếu TRANSLATE_DEVICE_ID trong .env.local (bắt buộc cho API dịch).' },
      { status: 500 },
    );
  }
  outgoing.append('device_id', deviceId);

  if (outputType === 'keep_layout') {
    const fcmToken = process.env.TRANSLATE_FCM_TOKEN;
    const appCheck = process.env.TRANSLATE_FIREBASE_APP_CHECK;
    const packageName = process.env.TRANSLATE_PACKAGE_NAME || 'com.amobilab.translate';
    // if (fcmToken) outgoing.append('fcm_token', fcmToken);
    // if (appCheck) outgoing.append('X-Firebase-AppCheck', appCheck);
    // outgoing.append('package-name', packageName);
  }

  const upstreamPath = resolveUpstreamPath(outputType);

  try {
    const upstream = await fetch(`${UPSTREAM}${upstreamPath}`, {
      method: 'POST',
      body: outgoing,
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'transfer-encoding') return;
      try {
        responseHeaders.set(key, value);
      } catch {
        // skip malformed headers
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
          ? `Server dịch không phản hồi trong ${PROXY_TIMEOUT_MS / 1000}s.`
          : `Proxy dịch lỗi: ${message}`,
      },
      { status: isTimeout ? 504 : 502 },
    );
  }
}

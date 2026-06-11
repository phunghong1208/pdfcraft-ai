import { NextRequest, NextResponse } from 'next/server';
import {
  translatePlainText,
  translateSegmentsLightweight,
} from '@/lib/translate/translate-segments-lightweight';
import type { TranslateTextRequest, TranslateTextResponse } from '@/lib/translate/types';

function badRequest(detail: string): NextResponse {
  return NextResponse.json({ detail }, { status: 400 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: TranslateTextRequest;
  try {
    body = (await req.json()) as TranslateTextRequest;
  } catch {
    return badRequest('Invalid JSON body.');
  }

  const sourceLang = body.sourceLang?.trim();
  const targetLang = body.targetLang?.trim();
  if (!sourceLang || !targetLang) {
    return badRequest('Thiếu sourceLang hoặc targetLang.');
  }

  const model = body.model?.trim() || undefined;

  try {
    if (Array.isArray(body.segments) && body.segments.length > 0) {
      const { translations, tokenUsage } = await translateSegmentsLightweight({
        segments: body.segments,
        sourceLang,
        targetLang,
        model,
      });
      const response: TranslateTextResponse = {
        translations,
        token_usage: tokenUsage,
      };
      return NextResponse.json(response);
    }

    const text = body.text?.trim();
    if (!text) {
      return badRequest('Thiếu text hoặc segments.');
    }

    const { translatedText, tokenUsage } = await translatePlainText({
      text,
      sourceLang,
      targetLang,
      model,
    });

    const response: TranslateTextResponse = {
      translated_text: translatedText,
      token_usage: tokenUsage,
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = /timeout|aborted/i.test(message);
    return NextResponse.json(
      { detail: message },
      { status: isTimeout ? 504 : 502 },
    );
  }
}

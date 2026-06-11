import { NextRequest, NextResponse } from 'next/server';
import { getDefaultTranslateModel } from '@/lib/translate/openai-client';
import {
  translatePdfKeepLayout,
  translatePdfTextOnly,
} from '@/lib/translate/server-document-translate';

type TranslateOutputType = 'keep_layout' | 'text_only';

function buildTranslatedFileName(originalName: string, targetLang: string): string {
  const base = originalName.replace(/\.[^.]+$/, '') || 'document';
  return `${base}-translated-${targetLang}.pdf`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch {
    return NextResponse.json({ detail: 'Invalid multipart body.' }, { status: 400 });
  }

  const file = incoming.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ detail: 'Thiếu file PDF.' }, { status: 400 });
  }

  const sourceLang = incoming.get('source_lang')?.toString().trim();
  const targetLang = incoming.get('target_lang')?.toString().trim();
  if (!sourceLang || !targetLang) {
    return NextResponse.json({ detail: 'Thiếu source_lang hoặc target_lang.' }, { status: 400 });
  }

  const outputType = (incoming.get('output_type')?.toString() || 'keep_layout') as TranslateOutputType;
  const model = incoming.get('model')?.toString().trim() || getDefaultTranslateModel();

  try {
    if (outputType === 'text_only') {
      const { translatedText } = await translatePdfTextOnly(file, sourceLang, targetLang, model);
      return NextResponse.json({ translated_text: translatedText });
    }

    const pdfBytes = await translatePdfKeepLayout(file, sourceLang, targetLang, model);
    const fileName = buildTranslatedFileName(file.name, targetLang);
    return new NextResponse(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = /timeout|aborted/i.test(message);
    return NextResponse.json(
      { detail: message },
      { status: isTimeout ? 504 : 502 },
    );
  }
}

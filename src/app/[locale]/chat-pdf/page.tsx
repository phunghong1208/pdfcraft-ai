import { redirect } from 'next/navigation';
import { type Locale } from '@/lib/i18n/config';

export default async function ChatPdfPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale as Locale}/ai-assist`);
}

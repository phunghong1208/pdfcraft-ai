import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import AIToolPageClient from '@/components/ai/AIToolPageClient';
import { type Locale } from '@/lib/i18n/config';
import { getTranslations } from 'next-intl/server';

export default async function SmartOcrPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ai.pages.smartOcr' });
  return (
    <div className="min-h-screen flex flex-col">
      <Header locale={locale as Locale} />
      <main className="flex-1">
        <AIToolPageClient
          title={t('title')}
          description={t('description')}
          actionLabel={t('action')}
          actionType="smartOcr"
        />
      </main>
      <Footer locale={locale as Locale} />
    </div>
  );
}

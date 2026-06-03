'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { type Locale } from '@/lib/i18n/config';

interface TermsPageClientProps {
  locale: Locale;
}

const SECTIONS = [
  'acceptance',
  'use',
  'privacy',
  'disclaimer',
  'changes',
] as const;

export default function TermsPageClient({ locale }: TermsPageClientProps) {
  const t = useTranslations('legalPages.terms');
  const tFooter = useTranslations('common.footer');

  return (
    <div className="min-h-screen flex flex-col">
      <Header locale={locale} />

      <main className="flex-1">
        <section className="bg-gradient-to-br from-[hsl(var(--color-primary)/0.1)] via-[hsl(var(--color-background))] to-[hsl(var(--color-secondary)/0.1)] py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-6">
                <FileText className="h-8 w-8 text-blue-600" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-[hsl(var(--color-foreground))] mb-6">
                {t('heroTitle')}
              </h1>
              <p className="text-lg text-[hsl(var(--color-muted-foreground))]">
                {t('heroSubtitle')}
              </p>
            </div>
          </div>
        </section>

        <section className="py-12">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto space-y-8">
              {SECTIONS.map((key) => (
                <div key={key}>
                  <h2 className="text-2xl font-bold text-[hsl(var(--color-foreground))] mb-3">
                    {t(`${key}Title`)}
                  </h2>
                  <p className="text-[hsl(var(--color-muted-foreground))]">{t(`${key}Body`)}</p>
                </div>
              ))}
              <p>
                <Link
                  href={`/${locale}/privacy`}
                  className="text-[hsl(var(--color-primary))] hover:underline"
                >
                  {tFooter('privacyLink')}
                </Link>
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer locale={locale} />
    </div>
  );
}

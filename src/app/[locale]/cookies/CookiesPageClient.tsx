'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Cookie } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { type Locale } from '@/lib/i18n/config';

interface CookiesPageClientProps {
  locale: Locale;
}

export default function CookiesPageClient({ locale }: CookiesPageClientProps) {
  const t = useTranslations('legalPages.cookies');

  return (
    <div className="min-h-screen flex flex-col">
      <Header locale={locale} />

      <main className="flex-1">
        <section className="bg-gradient-to-br from-[hsl(var(--color-primary)/0.1)] via-[hsl(var(--color-background))] to-[hsl(var(--color-secondary)/0.1)] py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-6">
                <Cookie className="h-8 w-8 text-amber-600" />
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
            <div className="max-w-3xl mx-auto prose prose-neutral dark:prose-invert">
              <ul className="list-disc pl-6 space-y-4 text-[hsl(var(--color-muted-foreground))]">
                <li>
                  <strong className="text-[hsl(var(--color-foreground))]">{t('essentialTitle')}:</strong>{' '}
                  {t('essentialDesc')}
                </li>
                <li>
                  <strong className="text-[hsl(var(--color-foreground))]">{t('preferenceTitle')}:</strong>{' '}
                  {t('preferenceDesc')}
                </li>
              </ul>
              <p className="mt-8 text-[hsl(var(--color-muted-foreground))]">{t('noTracking')}</p>
              <p className="mt-6">
                <Link
                  href={`/${locale}/privacy#cookies`}
                  className="text-[hsl(var(--color-primary))] hover:underline"
                >
                  {t('moreLink')}
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

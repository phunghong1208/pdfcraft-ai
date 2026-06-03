'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Upload, Sparkles, Languages, MessagesSquare, ScanText, Volume2, PencilLine, Minimize2, GitMerge, FileCog, ShieldCheck, Scissors } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconBadge } from '@/components/ui/IconBadge';
import { aiCardClass, type AiCardVariant } from '@/lib/ui/icon-tones';
import { type Locale } from '@/lib/i18n/config';
import { setUploadedPdf } from '@/lib/document-session';

interface HomePageClientProps {
  locale: Locale;
  localizedToolContent?: Record<string, { title: string; description: string }>;
}

export default function HomePageClient({ locale }: HomePageClientProps) {
  const t = useTranslations('homePage');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);

  const aiActions: Array<{ href: string; label: string; icon: typeof Sparkles; variant: AiCardVariant; description: string }> = [
    { href: `/${locale}/ai-summary`, label: t('actions.summarize'), icon: Sparkles, variant: 'purple', description: 'Extract key insights from any PDF.' },
    { href: `/${locale}/ai-translate`, label: t('actions.translate'), icon: Languages, variant: 'blue', description: 'Translate entire documents into other languages.' },
    { href: `/${locale}/voice-reader`, label: t('actions.voice'), icon: Volume2, variant: 'coral', description: 'Convert PDF to natural speech instantly.' },
    { href: `/${locale}/smart-ocr`, label: t('actions.ocr'), icon: ScanText, variant: 'green', description: 'Convert scans to editable PDF.' },
    { href: `/${locale}/chat-pdf`, label: t('actions.chat'), icon: MessagesSquare, variant: 'violet-wide', description: 'Ask questions about your files and get instant answers.' },
  ];

  const pdfActions: Array<{ href: string; label: string; icon: typeof PencilLine }> = [
    { href: `/${locale}/tools/image-to-pdf`, label: 'Scan to PDF', icon: ScanText },
    { href: `/${locale}/tools/merge-pdf`, label: t('actions.merge'), icon: GitMerge },
    { href: `/${locale}/tools/split-pdf`, label: 'Split', icon: Scissors },
    { href: `/${locale}/tools/encrypt-pdf`, label: 'Protect', icon: ShieldCheck },
    { href: `/${locale}/tools/compress-pdf`, label: t('actions.compress'), icon: Minimize2 },
    { href: `/${locale}/smart-ocr`, label: 'OCR Text', icon: ScanText },
    { href: `/${locale}/tools/edit-pdf`, label: t('actions.edit'), icon: PencilLine },
    { href: `/${locale}/tools?tab=convert`, label: t('actions.convert'), icon: FileCog },
  ];

  function startUpload() {
    inputRef.current?.click();
  }

  function handleSelectedFile(file: File | null) {
    if (!file) return;
    setUploadedPdf(file);
    setIsPreparing(true);
    setLoadingStep(0);

    setTimeout(() => setLoadingStep(1), 650);
    setTimeout(() => setLoadingStep(2), 1300);
    setTimeout(() => router.push(`/${locale}/workspace`), 1900);
  }

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--color-background))]">
      <Header locale={locale} />

      <main id="main-content" className="flex-1 pt-24" tabIndex={-1}>
        <section className="py-8 md:py-10 relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-56 w-[38rem] rounded-full bg-[hsl(var(--color-primary)/0.12)] blur-3xl animate-pulse" />
          </div>
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.35)] mb-4">
                <Sparkles className="h-4 w-4 text-[hsl(var(--color-primary))]" />
                <span className="text-sm font-medium">
                  {tCommon('brand')} • {tCommon('workspaceBadge')}
                </span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-[hsl(var(--color-foreground))]">
                {t('heroTitle')}
              </h1>
              <p className="mt-4 text-lg text-[hsl(var(--color-muted-foreground))]">
                {t('heroSubtitle')}
              </p>
            </div>
          </div>
        </section>

        <section id="upload" className="pb-6 scroll-mt-28">
          <div className="container mx-auto px-4 max-w-4xl">
            <Card className="p-5 md:p-8 border border-[hsl(var(--color-border)/0.8)] shadow-sm">
              <div className="rounded-2xl border-2 border-dashed border-[hsl(var(--color-border))] px-5 py-7 text-center bg-[hsl(var(--color-muted)/0.18)]">
                <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-[hsl(var(--color-primary)/0.15)] flex items-center justify-center shadow-[0_0_24px_hsl(var(--color-primary)/0.2)] animate-pulse">
                  <Upload className="h-7 w-7 text-[hsl(var(--color-primary))]" />
                </div>
                <h2 className="text-2xl font-semibold">{t('uploadTitle')}</h2>
                <p className="mt-2 text-sm text-[hsl(var(--color-muted-foreground))]">{t('uploadDescription')}</p>
                <div className="inline-block mt-5">
                  <Button variant="primary" size="lg" onClick={startUpload} className="hover:scale-[1.01] transition-all">
                    {t('uploadCta')}
                  </Button>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => handleSelectedFile(e.target.files?.[0] ?? null)}
                />
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-[hsl(var(--color-muted-foreground))]">
                  <span>✓ {t('uploadSecure')}</span>
                  <span>✓ {t('uploadOcr')}</span>
                  <span>✓ {t('uploadLanguages')}</span>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section className="py-6">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">{t('aiActionsTitle')}</h2>
                <Link href={`/${locale}/workspace`} className="text-sm text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]">
                  {t('useInWorkspace')}
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {aiActions.map((item) => {
                  const Icon = item.icon;
                  const isWide = item.variant === 'violet-wide';
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`${aiCardClass(item.variant)} p-4 block ${isWide ? 'sm:col-span-2 lg:col-span-2' : ''}`}
                    >
                      <div className="flex h-full flex-col gap-3">
                        <div className="h-9 w-9 rounded-lg bg-white/20 flex items-center justify-center">
                          <Icon className="h-5 w-5 text-white" strokeWidth={1.75} />
                        </div>
                        <div>
                          <div className="text-sm font-semibold">{item.label}</div>
                          <p className="mt-1 text-xs text-white/80 leading-relaxed">{item.description}</p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="pb-10">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">{t('coreActionsTitle')}</h2>
                <Link href={`/${locale}/tools`} className="text-sm text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]">
                  {t('viewAllTools')}
                </Link>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {pdfActions.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={`${item.href}-${item.label}`}
                      href={item.href}
                      className="feature-card-light rounded-2xl px-3 py-3 min-h-[96px] hover:shadow-md transition-all group"
                    >
                      <div className="flex flex-col gap-3 h-full justify-between">
                        <IconBadge icon={Icon} tone="primary" size="md" />
                        <span className="text-sm font-medium text-[hsl(var(--color-foreground))] group-hover:text-[hsl(var(--color-primary))] transition-colors">
                          {item.label}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer locale={locale} />

      {isPreparing && (
        <div className="fixed inset-0 z-[100] bg-black/65 backdrop-blur-sm flex items-center justify-center px-4">
          <Card className="w-full max-w-md p-6 border border-white/15 bg-[hsl(var(--color-card))]">
            <div className="relative h-10 w-10 mb-4">
              <svg className="animate-spin h-10 w-10" viewBox="0 0 36 36">
                <circle className="text-[hsl(var(--color-muted))]" cx="18" cy="18" r="15" fill="none" strokeWidth="3" stroke="currentColor" />
                <circle className="text-[hsl(var(--color-primary))]" cx="18" cy="18" r="15" fill="none" strokeWidth="3" stroke="currentColor" strokeDasharray={`${Math.min((loadingStep + 1) * 31, 94)} 94`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-3">{t('preparingTitle')}</h3>
            <ul className="space-y-2 text-sm text-[hsl(var(--color-muted-foreground))]">
              <li className={loadingStep >= 0 ? 'text-[hsl(var(--color-foreground))]' : ''}>{t('preparingUploading')}</li>
              <li className={loadingStep >= 1 ? 'text-[hsl(var(--color-foreground))]' : ''}>{t('preparingAnalyzing')}</li>
              <li className={loadingStep >= 2 ? 'text-[hsl(var(--color-foreground))]' : ''}>{t('preparingWorkspace')}</li>
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

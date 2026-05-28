'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Upload, Sparkles, Languages, MessagesSquare, ScanText, Volume2, PencilLine, Minimize2, GitMerge, FileCog, ArrowRight } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { type Locale } from '@/lib/i18n/config';
import { setUploadedPdf } from '@/lib/document-session';

interface HomePageClientProps {
  locale: Locale;
  localizedToolContent?: Record<string, { title: string; description: string }>;
}

export default function HomePageClient({ locale }: HomePageClientProps) {
  const t = useTranslations();
  const isVi = locale === 'vi';
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);

  const aiActions = [
    { href: `/${locale}/ai-summary`, label: isVi ? 'Tóm tắt' : 'Summarize', icon: Sparkles },
    { href: `/${locale}/ai-translate`, label: isVi ? 'Dịch tài liệu' : 'Translate', icon: Languages },
    { href: `/${locale}/chat-pdf`, label: isVi ? 'Chat với PDF' : 'Chat with PDF', icon: MessagesSquare },
    { href: `/${locale}/smart-ocr`, label: isVi ? 'OCR Scan' : 'OCR Scan', icon: ScanText },
    { href: `/${locale}/voice-reader`, label: isVi ? 'Voice Reader' : 'Voice Reader', icon: Volume2 },
  ];

  const pdfActions = [
    { href: `/${locale}/tools?tab=edit`, label: isVi ? 'Edit' : 'Edit', icon: PencilLine },
    { href: `/${locale}/tools?tab=optimize`, label: isVi ? 'Compress' : 'Compress', icon: Minimize2 },
    { href: `/${locale}/tools?tab=edit`, label: isVi ? 'Merge' : 'Merge', icon: GitMerge },
    { href: `/${locale}/tools?tab=convert`, label: isVi ? 'Convert' : 'Convert', icon: FileCog },
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
                <span className="text-sm font-medium">{t('common.brand')} • {isVi ? 'AI PDF Workspace' : 'AI PDF Workspace'}</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-[hsl(var(--color-foreground))]">
                {locale === 'vi' ? 'Hiểu mọi tài liệu PDF với AI' : 'Understand Any PDF with AI'}
              </h1>
              <p className="mt-4 text-lg text-[hsl(var(--color-muted-foreground))]">
                {locale === 'vi'
                  ? 'Tóm tắt, dịch, chat và chỉnh sửa tài liệu trong vài giây.'
                  : 'Summarize, translate, chat, and edit documents instantly.'}
              </p>
            </div>
          </div>
        </section>

        <section className="pb-6">
          <div className="container mx-auto px-4 max-w-4xl">
            <Card className="p-5 md:p-8 border border-[hsl(var(--color-border)/0.8)] shadow-sm">
              <div className="rounded-2xl border-2 border-dashed border-[hsl(var(--color-border))] px-5 py-7 text-center bg-[hsl(var(--color-muted)/0.18)]">
                <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-[hsl(var(--color-primary)/0.15)] flex items-center justify-center shadow-[0_0_24px_hsl(var(--color-primary)/0.2)] animate-pulse">
                  <Upload className="h-7 w-7 text-[hsl(var(--color-primary))]" />
                </div>
                <h2 className="text-2xl font-semibold">{isVi ? 'Upload tài liệu để bắt đầu' : 'Upload document to start'}</h2>
                <p className="mt-2 text-sm text-[hsl(var(--color-muted-foreground))]">{isVi ? 'Mở Document Workspace và thao tác bằng AI theo ngữ cảnh.' : 'Open Document Workspace and use contextual AI actions.'}</p>
                <div className="inline-block mt-5">
                  <Button variant="primary" size="lg" onClick={startUpload} className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-500 hover:to-indigo-600 shadow-[0_8px_24px_rgba(59,130,246,0.28)] hover:scale-[1.01] transition-all">
                    {isVi ? 'Upload to Workspace' : 'Upload to Workspace'}
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
                  <span>✓ Secure processing</span>
                  <span>✓ AI-powered OCR</span>
                  <span>✓ Supports 100+ languages</span>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section className="py-6">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">{isVi ? 'AI Actions' : 'AI Actions'}</h2>
                <Link href={`/${locale}/workspace`} className="text-sm text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]">
                  {isVi ? 'Dùng trong Workspace' : 'Use in Workspace'}
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {aiActions.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 hover:bg-white/[0.06] transition-all">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                          <Icon className="h-[18px] w-[18px] text-blue-400" strokeWidth={1.75} />
                        </div>
                        <div className="text-sm font-medium">{item.label}</div>
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
                <h2 className="text-xl font-bold">{isVi ? 'Core PDF Actions' : 'Core PDF Actions'}</h2>
                <Link href={`/${locale}/tools`} className="text-sm text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]">
                  {isVi ? 'Xem tất cả tools' : 'View all tools'}
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {pdfActions.map((item) => {
                  const Icon = item.icon;
                  return (
                  <Link key={`${item.href}-${item.label}`} href={item.href} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 hover:bg-white/[0.06] transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                          <Icon className="h-[18px] w-[18px] text-blue-400" strokeWidth={1.75} />
                        </div>
                        <span className="text-sm font-medium">{item.label}</span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-[hsl(var(--color-muted-foreground))]" />
                    </div>
                  </Link>
                )})}
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer locale={locale} />

      {isPreparing && (
        <div className="fixed inset-0 z-[100] bg-black/65 backdrop-blur-sm flex items-center justify-center px-4">
          <Card className="w-full max-w-md p-6 border border-white/15 bg-[hsl(var(--color-card))]">
            <div className="h-9 w-9 rounded-full border-2 border-blue-400 border-t-transparent animate-spin mb-4" />
            <h3 className="text-lg font-semibold mb-3">{isVi ? 'Đang chuẩn bị tài liệu...' : 'Preparing document...'}</h3>
            <ul className="space-y-2 text-sm text-[hsl(var(--color-muted-foreground))]">
              <li className={loadingStep >= 0 ? 'text-[hsl(var(--color-foreground))]' : ''}>Uploading...</li>
              <li className={loadingStep >= 1 ? 'text-[hsl(var(--color-foreground))]' : ''}>Analyzing document...</li>
              <li className={loadingStep >= 2 ? 'text-[hsl(var(--color-foreground))]' : ''}>Preparing AI workspace...</li>
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

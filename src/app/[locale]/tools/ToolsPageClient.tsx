'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search, X, Sparkles, Languages, MessagesSquare, ScanText, Volume2, Table2, Bot, PencilLine, FileCog, Zap, ShieldCheck } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ToolGrid } from '@/components/tools/ToolGrid';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { aiCardAccentClass, type AiCardAccent } from '@/lib/ui/icon-tones';
import { getAllTools } from '@/config/tools';
import { toolMatchesQuery } from '@/lib/utils/search';
import { type Locale } from '@/lib/i18n/config';

type ToolTab = 'ai' | 'edit' | 'convert' | 'optimize' | 'security';

interface ToolsPageClientProps {
  locale: Locale;
  localizedToolContent?: Record<string, { title: string; description: string }>;
}

const TAB_TOOL_IDS: Record<Exclude<ToolTab, 'ai'>, string[]> = {
  edit: ['edit-pdf', 'merge-pdf', 'split-pdf', 'delete-pages', 'organize-pdf', 'crop-pdf', 'add-watermark', 'header-footer'],
  convert: ['pdf-to-docx', 'word-to-pdf', 'pdf-to-jpg', 'jpg-to-pdf', 'pdf-to-pptx', 'pdf-to-excel', 'image-to-pdf'],
  optimize: ['compress-pdf', 'repair-pdf', 'linearize-pdf', 'deskew-pdf', 'ocr-pdf', 'pdf-to-pdfa'],
  security: ['encrypt-pdf', 'decrypt-pdf', 'find-and-redact', 'remove-metadata', 'change-permissions', 'pdf-to-pdfa'],
};

const AI_ACTIONS: Array<{ icon: typeof Sparkles; label: string; href: string; accent: AiCardAccent; description: string; wide?: boolean; popular?: boolean }> = [
  { icon: Sparkles, label: 'AI Summary', href: '/ai-summary', accent: 'purple', description: 'Extract key insights from any PDF.' },
  { icon: Languages, label: 'AI Translate', href: '/ai-translate', accent: 'blue', description: 'Translate entire documents into other languages.' },
  { icon: Volume2, label: 'AI Voice Reader', href: '/voice-reader', accent: 'coral', description: 'Convert PDF to natural speech instantly.' },
  { icon: ScanText, label: 'Smart OCR', href: '/smart-ocr', accent: 'green', description: 'Convert scans to editable PDF.' },
  { icon: MessagesSquare, label: 'Chat with PDF', href: '/chat-pdf', accent: 'purple', description: 'Ask questions about your files and get instant answers.', wide: true, popular: true },
  { icon: Table2, label: 'Extract Tables', href: '/chat-pdf', accent: 'blue', description: 'Pull tables from invoices and reports.' },
  { icon: Bot, label: 'Explain Terms', href: '/chat-pdf', accent: 'purple', description: 'Clarify complex terms in your document.' },
];

export default function ToolsPageClient({ locale, localizedToolContent }: ToolsPageClientProps) {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const allTools = getAllTools();
  const initialTab = (searchParams.get('tab') as ToolTab) || 'ai';
  const initialQuery = searchParams.get('q') || '';

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<ToolTab>(initialTab);

  useEffect(() => {
    const tab = (searchParams.get('tab') as ToolTab) || 'ai';
    const query = searchParams.get('q') || '';
    setActiveTab(tab);
    setSearchQuery(query);
  }, [searchParams]);

  const visibleTools = useMemo(() => {
    if (activeTab === 'ai') return [];
    const ids = new Set(TAB_TOOL_IDS[activeTab]);
    const tools = allTools.filter((tool) => ids.has(tool.id));

    if (!searchQuery.trim()) return tools;

    return tools.filter((tool) =>
      toolMatchesQuery(tool, searchQuery, localizedToolContent?.[tool.id]),
    );
  }, [activeTab, allTools, searchQuery, localizedToolContent]);

  const tabs: Array<{ id: ToolTab; label: string; icon: typeof Sparkles }> = [
    { id: 'ai', label: 'AI Assistant', icon: Sparkles },
    { id: 'edit', label: 'Edit & Organize', icon: PencilLine },
    { id: 'convert', label: 'Convert', icon: FileCog },
    { id: 'optimize', label: 'Optimize', icon: Zap },
    { id: 'security', label: 'Security', icon: ShieldCheck },
  ];

  const contextualSuggestions = [
    { icon: ScanText, label: 'OCR this document' },
    { icon: Languages, label: 'Translate scanned pages' },
    { icon: FileCog, label: 'Extract text' },
    { icon: Zap, label: 'Compress large file' },
    { icon: Table2, label: 'Extract invoice tables' },
  ];

  const handleClearSearch = useCallback(() => setSearchQuery(''), []);

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--color-background))]">
      <Header locale={locale} />

      <main className="flex-1 pt-28 pb-12">
        <section className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="mb-8 text-center">
              <h1 className="text-3xl md:text-4xl font-bold">{t('common.brand')} Tools</h1>
              <p className="mt-3 text-[hsl(var(--color-muted-foreground))]">
                Search-first tools. AI-first workflow. Use full toolbox contextually in workspace.
              </p>
            </div>

            <div className="relative max-w-2xl mx-auto mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--color-muted-foreground))]" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tools... merge, ocr, pdf to jpg, compress"
                className="w-full pl-11 pr-10 py-3 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary)/0.25)]"
              />
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-[hsl(var(--color-muted))]"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4 text-[hsl(var(--color-muted-foreground))]" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2 justify-center mb-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-[hsl(var(--color-primary))] text-white'
                      : 'border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))]'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <tab.icon className={`h-[18px] w-[18px] ${activeTab === tab.id ? 'text-white' : 'text-[hsl(var(--color-primary))]'}`} strokeWidth={1.75} />
                    {tab.label}
                  </span>
                </button>
              ))}
            </div>

            {activeTab === 'ai' ? (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
                <div>
                  <h2 className="text-lg font-semibold mb-1">Power-ups</h2>
                  <p className="text-sm text-[hsl(var(--color-muted-foreground))] mb-4">
                    Supercharge your documents with AI
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {AI_ACTIONS.map((action) => (
                      <Link
                        key={action.label}
                        href={`/${locale}${action.href}`}
                        className={`${aiCardAccentClass(action.accent)} p-4 block ${action.wide ? 'sm:col-span-2 lg:col-span-2' : ''}`}
                      >
                        {action.popular && (
                          <span className="ai-card__badge">Popular AI</span>
                        )}
                        <div className="flex h-full flex-col gap-3">
                          <div className="ai-card__icon">
                            <action.icon className="h-5 w-5" strokeWidth={1.75} />
                          </div>
                          <div>
                            <div className="text-sm font-semibold">{action.label}</div>
                            <p className="ai-card__desc">{action.description}</p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>

                <Card className="p-5 border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))]">
                  <h3 className="text-sm font-semibold mb-3">Contextual suggestions</h3>
                  <ul className="space-y-2 text-sm text-[hsl(var(--color-muted-foreground))]">
                    {contextualSuggestions.map((item) => (
                      <li key={item.label} className="inline-flex items-center gap-2 w-full">
                        <item.icon className="h-4 w-4 text-[hsl(var(--color-primary))]" strokeWidth={1.75} />
                        {item.label}
                      </li>
                    ))}
                  </ul>
                  <Link href={`/${locale}/workspace`} className="inline-block mt-4">
                    <Button size="sm">Open Document Workspace</Button>
                  </Link>
                </Card>
              </div>
            ) : visibleTools.length > 0 ? (
              <ToolGrid tools={visibleTools} locale={locale} localizedToolContent={localizedToolContent} />
            ) : (
              <Card className="p-12 text-center border-dashed border-2">
                <p className="text-[hsl(var(--color-muted-foreground))] mb-4">No tools found for this tab and query.</p>
                <Button variant="outline" onClick={handleClearSearch}>Clear search</Button>
              </Card>
            )}

            <div className="mt-8 text-center text-sm text-[hsl(var(--color-muted-foreground))]">
              Full tools are organized here. Homepage stays AI-first and lightweight.
            </div>
          </div>
        </section>
      </main>

      <Footer locale={locale} />
    </div>
  );
}

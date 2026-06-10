'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Search, X, Sparkles, Languages, MessagesSquare, ScanText, Volume2, Table2,
  PencilLine, FileCog, Zap, ShieldCheck, ArrowRight,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ToolGrid } from '@/components/tools/ToolGrid';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { aiCardAccentClass, type AiCardAccent } from '@/lib/ui/icon-tones';
import { getAllTools } from '@/config/tools';
import { toolMatchesQuery } from '@/lib/utils/search';
import { type Locale } from '@/lib/i18n/config';
import type { ToolCategory } from '@/types/tool';

type ToolTab = 'ai' | 'edit' | 'convert' | 'optimize' | 'security';

interface ToolsPageClientProps {
  locale: Locale;
  localizedToolContent?: Record<string, { title: string; description: string }>;
}

/** Gán tool theo category — khớp nhãn tab */
const TAB_CATEGORIES: Record<Exclude<ToolTab, 'ai'>, ToolCategory[]> = {
  edit: ['edit-annotate', 'organize-manage'],
  convert: ['convert-to-pdf', 'convert-from-pdf'],
  optimize: ['optimize-repair'],
  security: ['secure-pdf'],
};

const AI_ACTIONS: Array<{
  id: string;
  icon: typeof Sparkles;
  href: string;
  accent: AiCardAccent;
  popular?: boolean;
  aiBadge?: boolean;
  wide?: boolean;
}> = [
  { id: 'summarize', icon: Sparkles, href: '/ai-summary', accent: 'purple', aiBadge: true },
  { id: 'translate', icon: Languages, href: '/ai-translate', accent: 'blue' },
  { id: 'voice', icon: Volume2, href: '/voice-reader', accent: 'coral' },
  { id: 'ocr', icon: ScanText, href: '/smart-ocr', accent: 'green' },
  { id: 'chat', icon: MessagesSquare, href: '/chat-pdf', accent: 'violet', wide: true, popular: true },
];

const CONTEXT_SUGGESTION_HREFS: Record<string, string> = {
  ocr: '/smart-ocr',
  translate: '/ai-translate',
  extractText: '/workspace',
  compress: '/tools/compress-pdf',
  extractTables: '/tools/extract-tables',
};

export default function ToolsPageClient({ locale, localizedToolContent }: ToolsPageClientProps) {
  const t = useTranslations();
  const tHome = useTranslations('homePage');
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
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

  const setTab = useCallback((tab: ToolTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const visibleTools = useMemo(() => {
    if (activeTab === 'ai') return [];
    const categories = new Set(TAB_CATEGORIES[activeTab]);
    const tools = allTools.filter((tool) => categories.has(tool.category));

    if (!searchQuery.trim()) return tools;

    return tools.filter((tool) =>
      toolMatchesQuery(tool, searchQuery, localizedToolContent?.[tool.id]),
    );
  }, [activeTab, allTools, searchQuery, localizedToolContent]);

  const tabs: Array<{ id: ToolTab; label: string; icon: typeof Sparkles }> = [
    { id: 'ai', label: t('toolsPage.tabs.ai'), icon: Sparkles },
    { id: 'edit', label: t('toolsPage.tabs.edit'), icon: PencilLine },
    { id: 'convert', label: t('toolsPage.tabs.convert'), icon: FileCog },
    { id: 'optimize', label: t('toolsPage.tabs.optimize'), icon: Zap },
    { id: 'security', label: t('toolsPage.tabs.security'), icon: ShieldCheck },
  ];

  const contextualSuggestions = [
    { id: 'ocr', icon: ScanText, label: t('toolsPage.contextualSuggestions.ocr') },
    { id: 'translate', icon: Languages, label: t('toolsPage.contextualSuggestions.translate') },
    { id: 'extractText', icon: FileCog, label: t('toolsPage.contextualSuggestions.extractText') },
    { id: 'compress', icon: Zap, label: t('toolsPage.contextualSuggestions.compress') },
    { id: 'extractTables', icon: Table2, label: t('toolsPage.contextualSuggestions.extractTables') },
  ] as const;

  const handleClearSearch = useCallback(() => setSearchQuery(''), []);

  const showCategoryHeaders = activeTab === 'edit' || activeTab === 'convert';

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--color-background))]">
      <Header locale={locale} />

      <main className="flex-1 pt-20 sm:pt-24 lg:pt-28 pb-8 sm:pb-12">
        <section className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="mb-6 sm:mb-8 text-center">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">{t('toolsPage.toolsTitle', { brand: t('common.brand') })}</h1>
              <p className="mt-2 sm:mt-3 text-sm sm:text-base text-[hsl(var(--color-muted-foreground))] px-1">
                {t('toolsPage.toolsSubtitle')}
              </p>
            </div>

            <div className="relative max-w-2xl mx-auto mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--color-muted-foreground))]" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('toolsPage.searchPlaceholder')}
                className="w-full pl-11 pr-10 py-3 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary)/0.25)]"
              />
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-[hsl(var(--color-muted))]"
                  aria-label={t('toolsPage.clearSearchAria')}
                >
                  <X className="h-4 w-4 text-[hsl(var(--color-muted-foreground))]" />
                </button>
              )}
            </div>

            <div className="tools-page-tabs mb-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTab(tab.id)}
                  className={`tools-page-tab${activeTab === tab.id ? ' tools-page-tab--active' : ''}`}
                >
                  <tab.icon className="tools-page-tab__icon" strokeWidth={1.75} aria-hidden />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {activeTab === 'ai' ? (
              <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-xl font-bold">{t('toolsPage.aiSectionTitle')}</h2>
                    <p className="mt-1 text-sm text-[hsl(var(--color-muted-foreground))]">
                      {t('toolsPage.aiSectionSubtitle')}
                    </p>
                  </div>
                  <Link
                    href={`/${locale}/workspace`}
                    className="shrink-0 text-sm text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]"
                  >
                    {tHome('useInWorkspace')}
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {AI_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                      <Link
                        key={action.id}
                        href={`/${locale}${action.href}`}
                        className={`${aiCardAccentClass(action.accent)} p-3.5 block h-full ${action.wide ? 'sm:col-span-2 lg:col-span-2' : ''}`}
                      >
                        {action.aiBadge && (
                          <span className="ai-card__badge">{tHome('aiBadge')}</span>
                        )}
                        {action.popular && (
                          <span className="ai-card__badge">{t('toolsPage.popularAiBadge')}</span>
                        )}
                        <div className="ai-card__body">
                          <div className="ai-card__icon">
                            <Icon strokeWidth={1.75} />
                          </div>
                          <div className="ai-card__copy">
                            <div className="ai-card__title">{t(`toolsPage.aiActions.${action.id}.label`)}</div>
                            <p className="ai-card__desc">{t(`toolsPage.aiActions.${action.id}.description`)}</p>
                          </div>
                          <div className="ai-card__foot">
                            <ArrowRight className="action-card-arrow__icon" strokeWidth={1.75} aria-hidden />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  {contextualSuggestions.map((item) => (
                    <Link
                      key={item.id}
                      href={`/${locale}${CONTEXT_SUGGESTION_HREFS[item.id]}`}
                      className="tools-page-tab"
                    >
                      <item.icon className="tools-page-tab__icon" strokeWidth={1.75} aria-hidden />
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : visibleTools.length > 0 ? (
              <ToolGrid
                tools={visibleTools}
                locale={locale}
                localizedToolContent={localizedToolContent}
                searchQuery={searchQuery}
                showCategoryHeaders={showCategoryHeaders}
              />
            ) : (
              <Card className="p-12 text-center border-dashed border-2">
                <p className="text-[hsl(var(--color-muted-foreground))] mb-4">{t('toolsPage.noToolsFoundDetailed')}</p>
                <Button variant="outline" onClick={handleClearSearch}>{t('toolsPage.clearSearch')}</Button>
              </Card>
            )}

            <div className="mt-8 text-center text-sm text-[hsl(var(--color-muted-foreground))]">
              {t('toolsPage.footerNote')}
            </div>
          </div>
        </section>
      </main>

      <Footer locale={locale} />
    </div>
  );
}

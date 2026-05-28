'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, Menu, X, ChevronDown, UserCircle2 } from 'lucide-react';
import { type Locale } from '@/lib/i18n/config';
import { Button } from '@/components/ui/Button';
import { RecentFilesDropdown } from '@/components/common/RecentFilesDropdown';
import { searchTools, SearchResult } from '@/lib/utils/search';
import { getToolContent } from '@/config/tool-content';
import { getAllTools } from '@/config/tools';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LanguageSelector } from '@/components/layout/LanguageSelector';

export interface HeaderProps {
  locale: Locale;
  showSearch?: boolean;
}

type NavGroup = 'ai' | 'pdf';

export const Header: React.FC<HeaderProps> = ({ locale, showSearch = true }) => {
  const t = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [localizedTools, setLocalizedTools] = useState<Record<string, { title: string; description: string }>>({});
  const [openGroup, setOpenGroup] = useState<NavGroup | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  const aiItems = [
    { href: `/${locale}/ai-summary`, label: t('ai.menu.summarizePdf') },
    { href: `/${locale}/ai-translate`, label: t('ai.menu.translatePdf') },
    { href: `/${locale}/chat-pdf`, label: t('ai.menu.chatWithPdf') },
    { href: `/${locale}/smart-ocr`, label: t('ai.menu.smartOcr') },
    { href: `/${locale}/voice-reader`, label: t('ai.menu.voiceReader') },
  ];

  const pdfItems = [
    { href: `/${locale}/editor`, label: t('ai.menu.editPdf') },
    { href: `/${locale}/tools/merge-pdf`, label: t('ai.menu.mergePdf') },
    { href: `/${locale}/tools/split-pdf`, label: t('ai.menu.splitPdf') },
    { href: `/${locale}/tools/compress-pdf`, label: t('ai.menu.compressPdf') },
    { href: `/${locale}/tools/pdf-to-docx`, label: t('ai.menu.pdfToWord') },
    { href: `/${locale}/tools/ocr-pdf`, label: t('ai.menu.ocrPdf') },
  ];

  useEffect(() => {
    const allTools = getAllTools();
    const contentMap: Record<string, { title: string; description: string }> = {};

    allTools.forEach(tool => {
      const content = getToolContent(locale, tool.id);
      if (content) {
        contentMap[tool.id] = {
          title: content.title,
          description: content.metaDescription,
        };
      }
    });

    setLocalizedTools(contentMap);
  }, [locale]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      const results = searchTools(searchQuery, localizedTools);
      setSearchResults(results.slice(0, 8));
      setSelectedIndex(-1);
    } else {
      setSearchResults([]);
      setSelectedIndex(-1);
    }
  }, [searchQuery, localizedTools]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
        setSearchQuery('');
        setSearchResults([]);
      }
      if (groupRef.current && !groupRef.current.contains(event.target as Node)) {
        setOpenGroup(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navigateToTool = useCallback((slug: string) => {
    router.push(`/${locale}/tools/${slug}`);
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  }, [locale, router]);

  const handleSearchToggle = useCallback(() => {
    setIsSearchOpen((prev) => !prev);
    if (!isSearchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [isSearchOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && searchResults[selectedIndex]) {
        navigateToTool(searchResults[selectedIndex].tool.slug);
      } else if (searchResults.length > 0) {
        navigateToTool(searchResults[0].tool.slug);
      }
    } else if (e.key === 'Escape') {
      setIsSearchOpen(false);
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [navigateToTool, searchResults, selectedIndex]);

  const getToolIcon = (category: string) => {
    const icons: Record<string, string> = {
      'edit-annotate': '✏️',
      'convert-to-pdf': '📄',
      'convert-from-pdf': '🖼️',
      'organize-manage': '📁',
      'optimize-repair': '🔧',
      'secure-pdf': '🔒',
    };
    return icons[category] || '📄';
  };

  const renderGroupDropdown = (items: Array<{ href: string; label: string }>) => (
    <div className="absolute top-full left-0 mt-2 w-64 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] shadow-xl p-2 z-50">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="block rounded-lg px-3 py-2 text-sm text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))/0.6]"
          onClick={() => setOpenGroup(null)}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );

  const isAIActive = pathname?.includes('/ai-') || pathname?.includes('/chat-pdf') || pathname?.includes('/smart-ocr') || pathname?.includes('/voice-reader');
  const isPDFAcitve = pathname?.includes('/tools/');
  const isWorkspaceActive = pathname?.includes('/workspace');

  return (
    <header
      className={`fixed top-0 z-50 w-full transition-all duration-300 ${scrolled
        ? 'bg-transparent'
        : 'bg-transparent'}`}
      role="banner"
    >
      <div className="container mx-auto px-4 pt-5">
        <div className="flex h-[78px] items-center justify-between rounded-2xl bg-white/[0.03] backdrop-blur-2xl px-4 shadow-sm">
          <div className="flex flex-1 items-center gap-2">
            <Link
              href={`/${locale}`}
              className="group flex items-center gap-2 text-base font-semibold text-[hsl(var(--color-foreground))]"
              aria-label={`${t('brand')} - ${t('navigation.home')}`}
            >
              <div className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[hsl(var(--color-primary))] to-[hsl(var(--color-accent))] shadow-sm shadow-primary/20 transition-transform group-hover:scale-105">
                <svg className="h-4.5 w-4.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <span className="tracking-tight" data-testid="brand-name">{t('brand')}</span>
            </Link>
          </div>

          <nav
            className={`hidden md:flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.02] px-1.5 py-1 transition-all duration-300 ${isSearchOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            role="navigation"
            aria-label="Main navigation"
            ref={groupRef}
          >
            <Link href={`/${locale}`} className="px-3.5 py-1.5 text-sm font-medium rounded-full text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))] hover:bg-white/[0.06] transition-colors">{t('navigation.home')}</Link>

            <div className="relative">
              <button
                type="button"
                className={`inline-flex items-center gap-1 px-3.5 py-1.5 text-sm font-medium rounded-full transition-all ${isAIActive ? 'text-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary)/0.14)]' : 'text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))] hover:bg-white/[0.06]'}`}
                onClick={() => setOpenGroup(prev => prev === 'ai' ? null : 'ai')}
              >
                {t('ai.menu.aiAssistant')}
                <ChevronDown className={`h-4 w-4 transition-transform ${openGroup === 'ai' ? 'rotate-180' : ''}`} />
              </button>
              {openGroup === 'ai' && renderGroupDropdown(aiItems)}
            </div>

            <div className="relative">
              <button
                type="button"
                className={`inline-flex items-center gap-1 px-3.5 py-1.5 text-sm font-medium rounded-full transition-all ${isPDFAcitve ? 'text-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary)/0.14)]' : 'text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))] hover:bg-white/[0.06]'}`}
                onClick={() => setOpenGroup(prev => prev === 'pdf' ? null : 'pdf')}
              >
                {t('ai.menu.pdfTools')}
                <ChevronDown className={`h-4 w-4 transition-transform ${openGroup === 'pdf' ? 'rotate-180' : ''}`} />
              </button>
              {openGroup === 'pdf' && renderGroupDropdown(pdfItems)}
            </div>

            <Link href={`/${locale}/workspace`} className={`px-3.5 py-1.5 text-sm font-medium rounded-full transition-all ${isWorkspaceActive ? 'text-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary)/0.14)]' : 'text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))] hover:bg-white/[0.06]'}`}>Workspace</Link>
          </nav>

          <div className="hidden lg:flex flex-1 items-center justify-center px-10">
            {showSearch && !isSearchOpen && (
              <Button variant="ghost" size="sm" onClick={handleSearchToggle} aria-label="Open search" className="h-11 w-[290px] justify-between rounded-xl border border-white/10 bg-white/[0.045] px-3 text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))] hover:bg-white/[0.08] hover:border-blue-400/30 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/20">
                <span className="inline-flex items-center text-sm font-medium">Search PDFs...</span>
                <span className="text-xs font-semibold text-[hsl(var(--color-muted-foreground))/0.8] border border-[hsl(var(--color-border))] rounded px-1.5 py-0.5">⌘K</span>
              </Button>
            )}
          </div>

          <div className="flex flex-1 items-center justify-end gap-2">
            {showSearch && (
              <div className="relative" ref={searchContainerRef}>
                {isSearchOpen ? (
                  <div className="fixed md:absolute left-4 right-4 md:left-auto md:right-0 top-[22px] md:top-1/2 md:-translate-y-1/2 z-50 md:origin-right animate-in fade-in slide-in-from-right-4 duration-200">
                    <div className="relative w-full md:w-96">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--color-muted-foreground))]" />
                      <input
                        ref={searchInputRef}
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleInputKeyDown}
                        placeholder={t('search.placeholder') || 'Search PDFs, tools, AI...'}
                        className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] shadow-lg focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
                        aria-label="Search tools"
                        autoComplete="off"
                      />
                      <Button variant="ghost" size="sm" onClick={handleSearchToggle} aria-label="Close search" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0 hover:bg-transparent">
                        <X className="h-4 w-4 text-[hsl(var(--color-muted-foreground))]" aria-hidden="true" />
                      </Button>

                      {searchResults.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-[hsl(var(--color-background))] border border-[hsl(var(--color-border))] rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 max-h-[60vh] overflow-y-auto">
                          <ul className="py-2" role="listbox">
                            {searchResults.map((result, index) => {
                              const localized = localizedTools[result.tool.id];
                              const toolName = localized?.title || result.tool.id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                              const toolDescription = localized?.description || result.tool.features.slice(0, 3).join(' • ');

                              return (
                                <li key={result.tool.id}>
                                  <button
                                    onClick={() => navigateToTool(result.tool.slug)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                    className={`w-full px-4 py-2.5 text-left flex items-center gap-3 transition-colors ${index === selectedIndex ? 'bg-[hsl(var(--color-primary))/0.1] text-[hsl(var(--color-primary))]' : 'hover:bg-[hsl(var(--color-muted))] text-[hsl(var(--color-foreground))]'}`}
                                    role="option"
                                    aria-selected={index === selectedIndex}
                                  >
                                    <span className="text-xl">{getToolIcon(result.tool.category)}</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-sm truncate">{toolName}</div>
                                      <div className="text-xs text-[hsl(var(--color-muted-foreground))] truncate">{toolDescription}</div>
                                    </div>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={handleSearchToggle} aria-label="Open search" className="lg:hidden relative text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))/0.6] transition-colors rounded-full">
                    <Search className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            )}

            <RecentFilesDropdown
              locale={locale}
              showLabel={false}
              translations={{
                title: t('recentFiles.title') || 'Recent Files',
                empty: t('recentFiles.empty') || 'No recent files',
                clearAll: t('recentFiles.clearAll') || 'Clear all',
                processedWith: t('recentFiles.processedWith') || 'Processed with',
              }}
            />

            <ThemeToggle />
            <LanguageSelector currentLocale={locale} compact />
            <button
              type="button"
              className="hidden sm:inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold bg-white/[0.05] hover:bg-white/[0.1] transition-colors"
              aria-label="Account"
              title="Upgrade plan"
            >
              <UserCircle2 className="h-4 w-4" />
              <span className="font-medium">Upgrade</span>
            </button>

            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setIsMobileMenuOpen(prev => !prev)}
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <nav id="mobile-menu" className="md:hidden py-4 border-t border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] shadow-lg" role="navigation" aria-label="Mobile navigation">
            <div className="px-2 space-y-1">
              <Link href={`/${locale}`} className="block px-4 py-2.5 text-base font-medium rounded-lg hover:bg-[hsl(var(--color-muted))]" onClick={() => setIsMobileMenuOpen(false)}>{t('navigation.home')}</Link>
              <Link href={`/${locale}/workspace`} className="block px-4 py-2.5 text-base font-medium rounded-lg hover:bg-[hsl(var(--color-muted))]" onClick={() => setIsMobileMenuOpen(false)}>{t('ai.menu.workspace')}</Link>

              <div className="px-4 pt-2 text-xs font-semibold text-[hsl(var(--color-muted-foreground))]">{t('ai.menu.aiAssistant')}</div>
              {aiItems.map(item => (
                <Link key={item.href} href={item.href} className="block px-4 py-2 text-sm rounded-lg hover:bg-[hsl(var(--color-muted))]" onClick={() => setIsMobileMenuOpen(false)}>{item.label}</Link>
              ))}

              <div className="px-4 pt-2 text-xs font-semibold text-[hsl(var(--color-muted-foreground))]">{t('ai.menu.pdfTools')}</div>
              {pdfItems.map(item => (
                <Link key={item.href} href={item.href} className="block px-4 py-2 text-sm rounded-lg hover:bg-[hsl(var(--color-muted))]" onClick={() => setIsMobileMenuOpen(false)}>{item.label}</Link>
              ))}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
};

export default Header;

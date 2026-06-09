'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Search,
  Menu,
  X,
  ChevronDown,
  Crown,
  Home,
  Sparkles,
  Wrench,
  PencilLine,
  ArrowLeftRight,
  Languages,
  MessageCircle,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import { getToolIcon } from '@/config/icons';
import { ToolIcon } from '@/components/ui/ToolIcon';
import type { PdfReaderIconId } from '@/components/icons/PdfReaderIcons';
import type { IconTone } from '@/lib/ui/icon-tones';
import { type Locale } from '@/lib/i18n/config';
import { Button } from '@/components/ui/Button';
import { RecentFilesDropdown } from '@/components/common/RecentFilesDropdown';
import { searchTools, SearchResult } from '@/lib/utils/search';
import { getToolContent } from '@/config/tool-content';
import { getAllTools, getToolBySlug, getToolsByCategory } from '@/config/tools';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { LanguageSelector } from '@/components/layout/LanguageSelector';

export interface HeaderProps {
  locale: Locale;
  showSearch?: boolean;
}

type NavGroup = 'ai' | 'pdf' | 'edit' | 'convert';

type NavDropdownItem = {
  href: string;
  label: string;
  iconKey?: string;
  lucideIcon?: LucideIcon;
  toolId?: string;
  readerIconId?: PdfReaderIconId;
  tone?: IconTone;
};

function resolveDropdownLucideIcon(item: NavDropdownItem): LucideIcon | null {
  if (item.lucideIcon) return item.lucideIcon;
  if (item.iconKey) return getToolIcon(item.iconKey);
  return null;
}

const PDF_NAV_SLUGS = new Set(['merge-pdf', 'split-pdf', 'compress-pdf', 'rotate-pdf', 'organize-pdf', 'extract-pages', 'delete-pages', 'ocr-pdf']);

const PDF_NAV_SLUG_ORDER = ['merge-pdf', 'split-pdf', 'compress-pdf', 'rotate-pdf', 'organize-pdf', 'extract-pages', 'delete-pages', 'ocr-pdf'] as const;

const EDIT_NAV_SLUGS = new Set(['edit-pdf', 'sign-pdf', 'crop-pdf', 'add-watermark', 'form-filler', 'page-numbers', 'header-footer']);

const EDIT_NAV_SLUG_ORDER = ['edit-pdf', 'sign-pdf', 'crop-pdf', 'add-watermark', 'form-filler', 'page-numbers', 'header-footer'] as const;

function toolHref(locale: Locale, toolId: string, slug: string): string {
  if (toolId === 'edit-pdf') return `/${locale}/workspace`;
  return `/${locale}/tools/${slug}`;
}

export const Header: React.FC<HeaderProps> = ({ locale, showSearch = true }) => {
  const t = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [localizedTools, setLocalizedTools] = useState<Record<string, { title: string; description: string }>>({});
  const [openGroup, setOpenGroup] = useState<NavGroup | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  const aiItems: NavDropdownItem[] = [
    { href: `/${locale}/ai-summary`, label: t('ai.menu.summarizePdf'), lucideIcon: Sparkles, tone: 'purple' },
    { href: `/${locale}/ai-translate`, label: t('ai.menu.translatePdf'), lucideIcon: Languages, tone: 'blue' },
    { href: `/${locale}/chat-pdf`, label: t('ai.menu.chatWithPdf'), lucideIcon: MessageCircle, tone: 'purple' },
    { href: `/${locale}/smart-ocr`, label: t('ai.menu.smartOcr'), readerIconId: 'scan-to-pdf' },
    { href: `/${locale}/voice-reader`, label: t('ai.menu.voiceReader'), lucideIcon: Volume2, tone: 'red' },
  ];

  const pdfItems: NavDropdownItem[] = useMemo(
    () =>
      PDF_NAV_SLUG_ORDER.map((slug) => {
        const tool = getToolBySlug(slug);
        const labels: Record<(typeof PDF_NAV_SLUG_ORDER)[number], string> = {
          'merge-pdf': t('ai.menu.mergePdf'),
          'split-pdf': t('ai.menu.splitPdf'),
          'compress-pdf': t('ai.menu.compressPdf'),
          'rotate-pdf': t('ai.menu.rotatePdf'),
          'organize-pdf': t('ai.menu.organizePdf'),
          'extract-pages': t('ai.menu.extractPages'),
          'delete-pages': t('ai.menu.deletePages'),
          'ocr-pdf': t('ai.menu.ocrPdf'),
        };
        return {
          href: `/${locale}/tools/${slug}`,
          label: labels[slug],
          iconKey: tool?.icon ?? 'file-text',
          toolId: slug,
        };
      }),
    [locale, t],
  );

  const editItems: NavDropdownItem[] = useMemo(
    () =>
      EDIT_NAV_SLUG_ORDER.map((slug) => {
        const tool = getToolBySlug(slug);
        const labels: Record<(typeof EDIT_NAV_SLUG_ORDER)[number], string> = {
          'edit-pdf': t('ai.menu.editPdf'),
          'sign-pdf': t('ai.menu.signPdf'),
          'crop-pdf': t('ai.menu.cropPdf'),
          'add-watermark': t('ai.menu.addWatermark'),
          'form-filler': t('ai.menu.formFiller'),
          'page-numbers': t('ai.menu.pageNumbers'),
          'header-footer': t('ai.menu.headerFooter'),
        };
        return {
          href: toolHref(locale, tool?.id ?? slug, slug),
          label: labels[slug],
          iconKey: tool?.icon ?? 'file-text',
          toolId: slug,
        };
      }),
    [locale, t],
  );

  const convertToItems = useMemo(
    () =>
      getToolsByCategory('convert-to-pdf').map((tool) => ({
        href: toolHref(locale, tool.id, tool.slug),
        label: localizedTools[tool.id]?.title ?? tool.slug.replace(/-/g, ' '),
        iconKey: tool.icon,
        toolId: tool.id,
      })),
    [locale, localizedTools],
  );

  const convertFromItems = useMemo(
    () =>
      getToolsByCategory('convert-from-pdf').map((tool) => ({
        href: toolHref(locale, tool.id, tool.slug),
        label: localizedTools[tool.id]?.title ?? tool.slug.replace(/-/g, ' '),
        iconKey: tool.icon,
        toolId: tool.id,
      })),
    [locale, localizedTools],
  );

  const toolSlugFromPath = useMemo(() => {
    const match = pathname?.match(/\/tools\/([^/?#]+)/);
    return match?.[1] ?? null;
  }, [pathname]);

  useEffect(() => {
    const allTools = getAllTools();
    const contentMap: Record<string, { title: string; description: string }> = {};

    allTools.forEach((tool) => {
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
    if (!isMobileMenuOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isMobileMenuOpen]);

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

  const navigateToTool = useCallback(
    (slug: string) => {
      router.push(`/${locale}/tools/${slug}`);
      setIsSearchOpen(false);
      setSearchQuery('');
      setSearchResults([]);
    },
    [locale, router],
  );

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

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, -1));
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
    },
    [navigateToTool, searchResults, selectedIndex],
  );

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

  const renderDropdownIcon = (item: NavDropdownItem) => {
    if (item.toolId || item.readerIconId) {
      return (
        <ToolIcon
          toolId={item.toolId}
          readerIconId={item.readerIconId}
          iconKey={item.iconKey}
          tone={item.tone}
          size="xs"
          shape="circle"
          elevated={false}
          className="site-header__dropdown-icon"
        />
      );
    }
    const ResolvedIcon = resolveDropdownLucideIcon(item);
    if (!ResolvedIcon) return null;
    return (
      <ToolIcon
        lucideIcon={ResolvedIcon}
        tone={item.tone ?? 'gray'}
        size="xs"
        shape="circle"
        elevated={false}
        className="site-header__dropdown-icon"
      />
    );
  };

  const renderGroupDropdown = (items: NavDropdownItem[]) => (
    <div className="site-header__dropdown absolute top-full left-0 mt-2 w-80 rounded-xl border p-2 z-50 flex flex-col gap-0.5">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="site-header__dropdown-item rounded-lg"
          onClick={() => setOpenGroup(null)}
        >
          {renderDropdownIcon(item)}
          <span className="truncate">{item.label}</span>
        </Link>
      ))}
    </div>
  );

  const renderConvertDropdown = () => (
    <div className="site-header__dropdown site-header__dropdown--convert absolute top-full left-1/2 -translate-x-1/2 mt-2 rounded-xl border p-2 z-50">
      <div className="grid grid-cols-2 gap-x-3 gap-y-0">
        <div>
          <div className="px-2.5 py-1.5 text-[0.625rem] font-bold tracking-wider uppercase text-[hsl(var(--color-muted-foreground))]">
            {t('ai.menu.convertToPdf')}
          </div>
          {convertToItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="site-header__dropdown-item rounded-lg"
              onClick={() => setOpenGroup(null)}
            >
              {renderDropdownIcon(item)}
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </div>
        <div>
          <div className="px-2.5 py-1.5 text-[0.625rem] font-bold tracking-wider uppercase text-[hsl(var(--color-muted-foreground))]">
            {t('ai.menu.convertFromPdf')}
          </div>
          {convertFromItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="site-header__dropdown-item rounded-lg"
              onClick={() => setOpenGroup(null)}
            >
              {renderDropdownIcon(item)}
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );

  const isHomeActive = pathname === `/${locale}` || pathname === `/${locale}/`;
  const isAIActive =
    pathname?.includes('/ai-') ||
    pathname?.includes('/chat-pdf') ||
    pathname?.includes('/smart-ocr') ||
    pathname?.includes('/voice-reader');
  const isPDFActive = toolSlugFromPath != null && PDF_NAV_SLUGS.has(toolSlugFromPath);
  const isEditActive =
    pathname?.includes('/editor') ||
    (toolSlugFromPath != null && EDIT_NAV_SLUGS.has(toolSlugFromPath));
  const isConvertActive =
    toolSlugFromPath != null &&
    (getToolBySlug(toolSlugFromPath)?.category === 'convert-to-pdf' ||
      getToolBySlug(toolSlugFromPath)?.category === 'convert-from-pdf');

  const navItemClass = (active: boolean) =>
    `site-header__nav-item${active ? ' site-header__nav-item--active' : ''}`;

  const toggleGroup = (group: NavGroup) => {
    setOpenGroup((prev) => (prev === group ? null : group));
  };

  const renderNavDropdown = (
    group: NavGroup,
    active: boolean,
    label: string,
    icon: React.ReactNode,
    items: NavDropdownItem[],
  ) => (
    <div className="relative">
      <button type="button" className={navItemClass(active)} onClick={() => toggleGroup(group)}>
        {icon}
        <span>{label}</span>
        <ChevronDown className={`site-header__nav-chevron ${openGroup === group ? 'site-header__nav-chevron--open' : ''}`} />
      </button>
      {openGroup === group && renderGroupDropdown(items)}
    </div>
  );

  return (
    <header className="site-header fixed top-0 z-50 w-full transition-all duration-300" role="banner">
      <div className="site-header__shell container mx-auto px-3 sm:px-4 pt-2 sm:pt-4">
        <div className="site-header__bar flex min-h-[3.25rem] sm:min-h-[3.75rem] items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-5 py-2 sm:py-0">
          <div className="site-header__brand min-w-0 flex-1 sm:flex-none sm:shrink-0">
            <BrandLogo locale={locale} href={`/${locale}`} />
          </div>

          <nav
            className={`site-header__nav hidden lg:flex flex-1 items-center justify-center gap-0.5 min-w-0 transition-opacity duration-300 ${isSearchOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            role="navigation"
            aria-label="Main navigation"
            ref={groupRef}
          >
            <Link href={`/${locale}`} className={navItemClass(isHomeActive)}>
              <Home className="site-header__nav-icon" strokeWidth={1.75} aria-hidden />
              <span>{t('navigation.home')}</span>
            </Link>

            {renderNavDropdown(
              'ai',
              !!isAIActive,
              t('ai.menu.aiAssistant'),
              <Sparkles className="site-header__nav-icon" strokeWidth={1.75} aria-hidden />,
              aiItems,
            )}
            {renderNavDropdown(
              'pdf',
              !!isPDFActive,
              t('ai.menu.pdfTools'),
              <Wrench className="site-header__nav-icon" strokeWidth={1.75} aria-hidden />,
              pdfItems,
            )}
            {renderNavDropdown(
              'edit',
              !!isEditActive,
              t('ai.menu.edit'),
              <PencilLine className="site-header__nav-icon" strokeWidth={1.75} aria-hidden />,
              editItems,
            )}
            <div className="relative">
              <button type="button" className={navItemClass(!!isConvertActive)} onClick={() => toggleGroup('convert')}>
                <ArrowLeftRight className="site-header__nav-icon" strokeWidth={1.75} aria-hidden />
                <span>{t('ai.menu.convert')}</span>
                <ChevronDown className={`site-header__nav-chevron ${openGroup === 'convert' ? 'site-header__nav-chevron--open' : ''}`} />
              </button>
              {openGroup === 'convert' && renderConvertDropdown()}
            </div>
          </nav>

          <div className="site-header__actions flex shrink-0 items-center justify-end gap-1 sm:gap-2">
            {showSearch && (
              <div className="relative hidden md:block" ref={searchContainerRef}>
                {isSearchOpen ? (
                  <div className="absolute right-0 top-1/2 z-50 w-[min(100vw-2rem,22rem)] -translate-y-1/2 origin-right animate-in fade-in slide-in-from-right-4 duration-200">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--color-muted-foreground))]" />
                      <input
                        ref={searchInputRef}
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleInputKeyDown}
                        placeholder={t('search.placeholderExpanded')}
                        className="site-header__search-input w-full rounded-full border py-2.5 pl-10 pr-10 text-sm shadow-lg focus:outline-none"
                        aria-label={t('search.trigger')}
                        autoComplete="off"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSearchToggle}
                        aria-label={t('search.close')}
                        className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 p-0 hover:bg-transparent"
                      >
                        <X className="h-4 w-4 text-[hsl(var(--color-muted-foreground))]" aria-hidden="true" />
                      </Button>

                      {searchResults.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 max-h-[60vh] overflow-hidden overflow-y-auto rounded-xl border bg-[hsl(var(--color-background))] shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
                          <ul className="py-2" role="listbox">
                            {searchResults.map((result, index) => {
                              const localized = localizedTools[result.tool.id];
                              const toolName =
                                localized?.title ||
                                result.tool.id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                              const toolDescription =
                                localized?.description || result.tool.features.slice(0, 3).join(' • ');
                              return (
                                <li key={result.tool.id}>
                                  <button
                                    onClick={() => navigateToTool(result.tool.slug)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                    className={`w-full px-4 py-2.5 text-left flex items-center gap-3 transition-colors ${index === selectedIndex ? 'bg-[hsl(var(--color-primary))/0.1] text-[hsl(var(--color-primary))]' : 'hover:bg-[hsl(var(--color-muted))] text-[hsl(var(--color-foreground))]'}`}
                                    role="option"
                                    aria-selected={index === selectedIndex}
                                  >
                                    <span className="text-xl" aria-hidden>{getToolIcon(result.tool.category)}</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-sm truncate">{toolName}</div>
                                      <div className="text-xs text-[hsl(var(--color-muted-foreground))] truncate">
                                        {toolDescription}
                                      </div>
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
                  <button
                    type="button"
                    onClick={handleSearchToggle}
                    aria-label={t('search.open')}
                    className="site-header__search hidden lg:inline-flex"
                  >
                    <Search className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                    <span className="site-header__search-label">{t('search.trigger')}</span>
                    <kbd className="site-header__search-kbd">⌘K</kbd>
                  </button>
                )}
              </div>
            )}

            {showSearch && !isSearchOpen && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSearchToggle}
                aria-label={t('search.open')}
                className="site-header__icon-btn lg:hidden"
              >
                <Search className="h-4 w-4" aria-hidden />
              </Button>
            )}

            <div className="hidden xl:flex">
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
            </div>

            <ThemeToggle className="site-header__theme-btn" />
            <div className="hidden lg:block">
              <LanguageSelector currentLocale={locale} compact />
            </div>

            <button type="button" className="site-header__upgrade-btn" aria-label={t('upgradeTitle')} title={t('upgradeTitle')}>
              <Crown className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              <span className="hidden xl:inline">{t('upgrade')}</span>
            </button>

            <Button
              variant="ghost"
              size="sm"
              className="site-header__icon-btn lg:hidden"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <nav
            id="mobile-menu"
            className="site-header__mobile lg:hidden mt-2 rounded-2xl border px-2 py-3 shadow-lg max-h-[calc(100dvh-5.5rem)] overflow-y-auto overscroll-contain"
            role="navigation"
            aria-label="Mobile navigation"
          >
            <div className="space-y-1">
              <Link
                href={`/${locale}`}
                className="block rounded-lg px-4 py-2.5 text-base font-medium hover:bg-[hsl(var(--color-muted))]"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t('navigation.home')}
              </Link>
              <Link
                href={`/${locale}/workspace`}
                className="block rounded-lg px-4 py-2.5 text-base font-medium hover:bg-[hsl(var(--color-muted))]"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t('ai.menu.workspace')}
              </Link>

              <div className="px-4 pt-2 text-xs font-semibold text-[hsl(var(--color-muted-foreground))]">
                {t('ai.menu.aiAssistant')}
              </div>
              {aiItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="site-header__dropdown-item rounded-lg px-4 hover:bg-[hsl(var(--color-muted))]"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {renderDropdownIcon(item)}
                  <span>{item.label}</span>
                </Link>
              ))}

              <div className="px-4 pt-2 text-xs font-semibold text-[hsl(var(--color-muted-foreground))]">{t('ai.menu.pdfTools')}</div>
              {pdfItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="site-header__dropdown-item rounded-lg px-4 hover:bg-[hsl(var(--color-muted))]"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {renderDropdownIcon(item)}
                  <span>{item.label}</span>
                </Link>
              ))}

              <div className="px-4 pt-2 text-xs font-semibold text-[hsl(var(--color-muted-foreground))]">{t('ai.menu.edit')}</div>
              {editItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="site-header__dropdown-item rounded-lg px-4 hover:bg-[hsl(var(--color-muted))]"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {renderDropdownIcon(item)}
                  <span>{item.label}</span>
                </Link>
              ))}

              <div className="px-4 pt-2 text-xs font-semibold text-[hsl(var(--color-muted-foreground))]">{t('ai.menu.convertToPdf')}</div>
              {convertToItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="site-header__dropdown-item rounded-lg px-4 hover:bg-[hsl(var(--color-muted))]"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {renderDropdownIcon(item)}
                  <span>{item.label}</span>
                </Link>
              ))}

              <div className="px-4 pt-2 text-xs font-semibold text-[hsl(var(--color-muted-foreground))]">{t('ai.menu.convertFromPdf')}</div>
              {convertFromItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="site-header__dropdown-item rounded-lg px-4 hover:bg-[hsl(var(--color-muted))]"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {renderDropdownIcon(item)}
                  <span>{item.label}</span>
                </Link>
              ))}

              <div className="border-t border-[hsl(var(--color-border))] pt-3 mt-2 px-2 flex flex-wrap gap-2">
                <LanguageSelector currentLocale={locale} compact />
              </div>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
};

export default Header;

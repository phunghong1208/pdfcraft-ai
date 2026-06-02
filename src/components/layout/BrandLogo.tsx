'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type Locale } from '@/lib/i18n/config';

const PDF_ICON = (
  <svg
    className="h-[18px] w-[18px] text-white"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

export function BrandLogo({
  href,
  className = '',
  testId,
}: {
  locale?: Locale;
  href?: string;
  /** @deprecated Dùng token theme — prop giữ để tương thích */
  variant?: 'dark' | 'light';
  className?: string;
  testId?: string;
}) {
  const t = useTranslations('common');

  const inner = (
    <>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#E51A24] shadow-sm transition-transform group-hover:scale-105">
        {PDF_ICON}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 leading-none">
        <span
          className="text-[15px] font-bold tracking-tight text-[hsl(var(--color-foreground))]"
          data-testid={testId ?? 'brand-name'}
        >
          {t('brand')}
        </span>
        <span className="text-[11px] font-normal text-[hsl(var(--color-muted-foreground))]">
          {t('brandSubtitle')}
        </span>
      </div>
    </>
  );

  const wrapClass = `group inline-flex items-center gap-2.5 ${className}`;

  if (href) {
    return (
      <Link
        href={href}
        className={wrapClass}
        aria-label={`${t('brand')} — ${t('brandSubtitle')}`}
      >
        {inner}
      </Link>
    );
  }

  return <div className={wrapClass}>{inner}</div>;
}

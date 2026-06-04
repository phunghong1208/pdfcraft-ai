'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { type Locale } from '@/lib/i18n/config';
import { IconBadge } from '@/components/ui/IconBadge';

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
      <IconBadge
        icon={FileText}
        tone="primary"
        size="sm"
        className="site-header__logo-icon transition-transform duration-200 group-hover:scale-[1.03]"
      />
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

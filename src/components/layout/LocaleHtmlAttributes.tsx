'use client';

import { useEffect } from 'react';

export function LocaleHtmlAttributes({
  locale,
  direction,
}: {
  locale: string;
  direction: 'ltr' | 'rtl';
}) {
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
  }, [locale, direction]);

  return null;
}

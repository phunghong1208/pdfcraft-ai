'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CloudOff, Lock, ShieldCheck, type LucideIcon } from 'lucide-react';
import { type Locale } from '@/lib/i18n/config';
import { siteConfig } from '@/config/site';
import { FooterStoreLink } from '@/components/layout/FooterStoreBadges';

const BRAND_FILE_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);

type TrustItem = { label: string; icon: LucideIcon };

export interface FooterProps {
  locale: Locale;
}

export const Footer: React.FC<FooterProps> = ({ locale }) => {
  const t = useTranslations('common');
  const currentYear = new Date().getFullYear();

  const legalLinks = [
    { href: `/${locale}/privacy`, label: t('footer.privacyLink') },
    { href: `/${locale}/terms`, label: t('footer.terms') },
    { href: `/${locale}/cookies`, label: t('footer.cookies') },
  ];

  const securityItems: TrustItem[] = [
    { icon: Lock, label: t('footer.trustLocalFirst') },
    { icon: CloudOff, label: t('footer.trustNoCloud') },
    { icon: ShieldCheck, label: t('footer.trustGdpr') },
  ];

  return (
    <footer className="site-footer site-footer--workspace" role="contentinfo">
      <div className="site-footer__inner">
        <div className="site-footer__main">
          <Link
            href={`/${locale}`}
            className="site-footer__brand group"
            aria-label={t('footer.brandName')}
          >
            <div className="site-footer__brand-content">
              <div className="site-footer__brand-main">
                <div className="site-footer__brand-icon">{BRAND_FILE_ICON}</div>
                <div className="site-footer__title" data-testid="footer-brand-name">
                  <span className="site-footer__title-line">{t('footer.brandLine1')}</span>
                  <span className="site-footer__title-line">{t('footer.brandLine2')}</span>
                </div>
              </div>
              <p className="site-footer__tagline">{t('footer.tagline')}</p>
            </div>
          </Link>

          <div className="site-footer__trust-zone" aria-label={t('footer.trustNav')}>
            <div className="site-footer__trust-group">
              <div className="site-footer__trust-heading">{t('footer.trustGroupSecurity')}</div>
              <ul className="site-footer__trust" aria-label={t('footer.trustGroupSecurity')}>
                {securityItems.map((item) => {
                  const TrustIcon = item.icon;
                  return (
                    <li key={item.label} className="site-footer__trust-card">
                      <span className="site-footer__trust-icon" aria-hidden>
                        <TrustIcon strokeWidth={2.25} />
                      </span>
                      <span className="site-footer__trust-label">{item.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="site-footer__trust-group site-footer__trust-group--download">
              <div className="site-footer__trust-heading">{t('footer.trustGroupDownload')}</div>
              <div
                className="site-footer__app-badges"
                aria-label={t('footer.downloadApp')}
              >
                <FooterStoreLink
                  href={siteConfig.links.googlePlay}
                  store="google"
                  label={t('footer.storeGooglePlay')}
                  ariaLabel={t('footer.googlePlayAria')}
                />
                <FooterStoreLink
                  href={siteConfig.links.appStore}
                  store="apple"
                  label={t('footer.storeAppStore')}
                  ariaLabel={t('footer.appStoreAria')}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="site-footer__rule" aria-hidden="true" />

        <div className="site-footer__foot">
          <nav className="site-footer__legal" aria-label={t('footer.legalNav')}>
            {legalLinks.map((link, index) => (
              <span key={link.href} className="site-footer__legal-item">
                {index > 0 && (
                  <span className="site-footer__legal-sep" aria-hidden="true">
                    ·
                  </span>
                )}
                <Link href={link.href} className="site-footer__legal-link">
                  {link.label}
                </Link>
              </span>
            ))}
          </nav>

          <p className="site-footer__copyright tabular-nums" suppressHydrationWarning>
            {t('footer.copyright', { year: currentYear })}
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

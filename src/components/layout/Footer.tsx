'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Shield, Lock, FileCheck, Github, Twitter, Mail } from 'lucide-react';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { type Locale } from '@/lib/i18n/config';

export interface FooterProps {
  locale: Locale;
}

export const Footer: React.FC<FooterProps> = ({ locale }) => {
  const t = useTranslations('common');
  const currentYear = new Date().getFullYear();

  const footerLinks = [
    { href: `/${locale}/about`, label: t('navigation.about') },
    { href: `/${locale}/faq`, label: t('navigation.faq') },
    { href: `/${locale}/privacy`, label: t('navigation.privacy') },
    { href: `/${locale}/contact`, label: t('navigation.contact') },
  ];

  return (
    <footer
      className="w-full border-t border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] pt-16 pb-8"
      role="contentinfo"
    >
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          {/* Brand Column */}
          <div className="col-span-1 md:col-span-1 flex flex-col gap-6">
            <BrandLogo locale={locale} href={`/${locale}`} testId="footer-brand-name" />
            <p className="text-sm text-[hsl(var(--color-muted-foreground))] leading-relaxed max-w-xs">
              {t('tagline') || 'Professional, secure, and free PDF tools for everyone. No installation required.'}
            </p>

            <div className="flex gap-4">
              <a href="https://github.com/PDFCraftTool/pdfcraft" className="p-2 rounded-full bg-[hsl(var(--color-muted))] text-[hsl(var(--color-muted-foreground))] hover:bg-[hsl(var(--color-primary))] hover:text-white transition-all">
                <Github className="w-4 h-4" />
              </a>
              <a href="https://x.com/PDFCraftTool" className="p-2 rounded-full bg-[hsl(var(--color-muted))] text-[hsl(var(--color-muted-foreground))] hover:bg-[hsl(var(--color-primary))] hover:text-white transition-all">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="#" className="p-2 rounded-full bg-[hsl(var(--color-muted))] text-[hsl(var(--color-muted-foreground))] hover:bg-[hsl(var(--color-primary))] hover:text-white transition-all">
                <Mail className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--color-foreground))] mb-6">
              {t('footer.resources')}
            </h3>
            <ul className="flex flex-col gap-3">
              {footerLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-primary))] transition-colors flex items-center gap-2 group"
                  >
                    <span className="w-1 h-1 rounded-full bg-[hsl(var(--color-muted-foreground))] group-hover:bg-[hsl(var(--color-primary))] transition-colors" />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Security Features */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--color-foreground))] mb-6">
              {t('footer.security')}
            </h3>
            <ul className="flex flex-col gap-4">
              <li className="flex items-start gap-3">
                <div className="mt-0.5 p-1 rounded bg-[hsl(var(--color-success)/0.1)] text-[hsl(var(--color-success))]">
                  <Lock className="h-3 w-3" />
                </div>
                <div>
                  <span className="block text-sm font-medium text-[hsl(var(--color-foreground))]">{t('footer.clientSideProcessing')}</span>
                  <span className="text-xs text-[hsl(var(--color-muted-foreground))]">{t('footer.filesNeverLeave')}</span>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-0.5 p-1 rounded bg-[hsl(var(--color-primary)/0.1)] text-[hsl(var(--color-primary))]">
                  <FileCheck className="h-3 w-3" />
                </div>
                <div>
                  <span className="block text-sm font-medium text-[hsl(var(--color-foreground))]">{t('footer.noUploads')}</span>
                  <span className="text-xs text-[hsl(var(--color-muted-foreground))]">{t('footer.privateSecure')}</span>
                </div>
              </li>
            </ul>
          </div>

          {/* Privacy Badge Block */}
          <div className="flex flex-col justify-start">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--color-foreground))] mb-6">
              {t('footer.compliance')}
            </h3>
            <div
              className="flex items-center gap-3 p-4 bg-[hsl(var(--color-card))] border border-[hsl(var(--color-border))] rounded-xl shadow-sm"
            >
              <div className="h-10 w-10 rounded-full bg-[hsl(var(--color-success)/0.1)] flex items-center justify-center flex-shrink-0">
                <Shield className="h-5 w-5 text-[hsl(var(--color-success))]" aria-hidden="true" />
              </div>
              <div>
                <div className="text-sm font-bold text-[hsl(var(--color-foreground))]">{t('footer.gdprCompliant')}</div>
                <div className="text-xs text-[hsl(var(--color-muted-foreground))]">{t('footer.privacyBadge')}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="pt-8 border-t border-[hsl(var(--color-border))] flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
            &copy; {currentYear} {t('brand')}. {t('footer.copyright', { year: '' }).replace(/^\d{4}\s*/, '')}
          </p>
          <div className="flex items-center gap-6">
            <Link href={`/${locale}/terms`} className="text-xs text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]">{t('footer.terms')}</Link>
            <Link href={`/${locale}/privacy`} className="text-xs text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]">{t('footer.privacyLink')}</Link>
            <Link href={`/${locale}/cookies`} className="text-xs text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]">{t('footer.cookies')}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;


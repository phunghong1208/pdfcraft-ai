'use client';

import { useRef, useState, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { CloudUpload, Sparkles, Check, Upload } from 'lucide-react';
import { HomeAiOrbDecor, HomePdfFloatDecor } from '@/components/home/HomeHeroDecorations';

interface HomeUploadWorkspaceProps {
  inputRef: RefObject<HTMLInputElement | null>;
  onStartUpload: () => void;
  onFileSelected: (file: File | null) => void;
}

export function HomeUploadWorkspace({ inputRef, onStartUpload, onFileSelected }: HomeUploadWorkspaceProps) {
  const t = useTranslations('homePage');
  const tCommon = useTranslations('common');
  const dropRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    if (dropRef.current && !dropRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.type === 'application/pdf' || file?.name.toLowerCase().endsWith('.pdf')) {
      onFileSelected(file);
    }
  }

  const trustItems = [
    t('uploadSecure'),
    t('uploadOcr'),
    t('uploadLanguages'),
  ];

  return (
    <section id="upload" className="home-hero scroll-mt-28">
      <div className="home-hero__ambient" aria-hidden>
        <div className="home-hero__glow home-hero__glow--center" />
        <div className="home-hero__glow home-hero__glow--left" />
        <div className="home-hero__glow home-hero__glow--right" />
        <div className="home-hero__orbit home-hero__orbit--a" />
        <div className="home-hero__orbit home-hero__orbit--b" />
        <span className="home-hero__star home-hero__star--1" />
        <span className="home-hero__star home-hero__star--2" />
        <span className="home-hero__star home-hero__star--3" />
        <span className="home-hero__star home-hero__star--4" />
        <span className="home-hero__star home-hero__star--5" />
      </div>

      <div className="container mx-auto px-4">
        <div className="home-hero__head">
          <div className="home-hero__badge">
            <Sparkles className="home-hero__badge-icon" aria-hidden />
            <span>
              {tCommon('brand')} • {tCommon('workspaceBadge')}
            </span>
          </div>
          <h1 className="home-hero__title">
            {t('heroTitleBefore')}
            <span className="home-hero__title-ai">{t('heroTitleAccent')}</span>
            {t('heroTitleAfter')}
          </h1>
          <p className="home-hero__subtitle">{t('heroSubtitle')}</p>
        </div>

        <div className="home-hero__stage">
          <div className="home-hero__deco home-hero__deco--left" aria-hidden>
            <HomePdfFloatDecor />
          </div>

          <div
            ref={dropRef}
            role="button"
            tabIndex={0}
            className={`home-upload-card${isDragging ? ' home-upload-card--active' : ''}`}
            onClick={onStartUpload}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onStartUpload();
              }
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="home-upload-card__body">
              <div className="home-upload-icon-wrap" aria-hidden>
                <span className="home-upload-icon-ring home-upload-icon-ring--1" />
                <span className="home-upload-icon-ring home-upload-icon-ring--2" />
                <span className="home-upload-icon">
                  <CloudUpload strokeWidth={2} />
                </span>
              </div>

              <h2 className="home-upload-card__title">{t('uploadTitle')}</h2>
              <p className="home-upload-card__desc">{t('uploadDescription')}</p>

              <button
                type="button"
                className="home-upload-cta"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartUpload();
                }}
              >
                <Upload className="home-upload-cta__icon" strokeWidth={2.5} aria-hidden />
                {t('uploadCta')}
              </button>

              <input
                ref={inputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
              />
            </div>

            <ul className="home-upload-trust">
              {trustItems.map((label) => (
                <li key={label} className="home-upload-trust__item">
                  <Check className="home-upload-trust__icon" strokeWidth={2.5} aria-hidden />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="home-hero__deco home-hero__deco--right" aria-hidden>
            <HomeAiOrbDecor />
          </div>
        </div>

        <p className="home-upload-hint">
          <span className="home-upload-hint__grip" aria-hidden>
            <svg viewBox="0 0 14 14" fill="none">
              <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.25" strokeDasharray="2.5 2" />
            </svg>
          </span>
          {t('uploadDropHint')}
        </p>
      </div>
    </section>
  );
}

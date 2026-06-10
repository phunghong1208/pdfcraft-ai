'use client';
import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Tool, ToolCategory } from '@/types/tool';
import { ToolIcon } from '@/components/ui/ToolIcon';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import { getToolIconTone, iconToneClass } from '@/lib/ui/icon-tones';

export interface ToolCardProps {
  tool: Tool;
  locale: string;
  className?: string;
  localizedContent?: { title: string; description: string };
}

const categoryTranslationKeys: Record<ToolCategory, string> = {
  'edit-annotate': 'editAnnotate',
  'convert-to-pdf': 'convertToPdf',
  'convert-from-pdf': 'convertFromPdf',
  'organize-manage': 'organizeManage',
  'optimize-repair': 'optimizeRepair',
  'secure-pdf': 'securePdf',
};

export function ToolCard({ tool, locale, className = '', localizedContent }: ToolCardProps) {
  const t = useTranslations();
  const toolUrl = tool.id === 'edit-pdf'
    ? `/${locale}/workspace`
    : `/${locale}/tools/${tool.slug}`;

  const toolName = localizedContent?.title || tool.id
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  const description = localizedContent?.description || tool.features
    .slice(0, 3)
    .map(f => f.replace(/-/g, ' '))
    .join(', ');

  const categoryName = t(`home.categories.${categoryTranslationKeys[tool.category]}`);
  const tone = getToolIconTone(tool.id, tool.category);

  return (
    <Link
      href={toolUrl}
      className={`tool-grid-card ${iconToneClass(tone)} group ${className}`}
      data-testid="tool-card"
    >
      <div className="tool-grid-card__fav">
        <FavoriteButton toolId={tool.id} size="sm" />
      </div>

      <div className="tool-grid-card__body">
        <ToolIcon toolId={tool.id} iconKey={tool.icon} size="lg" shape="rounded" className="tool-grid-card__icon" />

        <div className="tool-grid-card__copy">
          <h3 className="tool-grid-card__title" data-testid="tool-card-name">
            {toolName}
          </h3>
          <p className="tool-grid-card__desc" data-testid="tool-card-description">
            {description}
          </p>
        </div>

        <div className="tool-grid-card__foot">
          <span className="tool-grid-card__category">{categoryName}</span>
          <ArrowRight className="tool-grid-card__arrow" strokeWidth={1.75} aria-hidden />
        </div>
      </div>
    </Link>
  );
}

export default ToolCard;

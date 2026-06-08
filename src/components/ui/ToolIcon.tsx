import type { LucideIcon } from 'lucide-react';
import { getToolIcon } from '@/config/icons';
import { getToolIconTone, iconToneClass, type IconTone } from '@/lib/ui/icon-tones';
import { getPdfReaderIconId, getPdfReaderIconTone } from '@/lib/ui/pdf-reader-icons';
import { PdfReaderIcon, type PdfReaderIconId } from '@/components/icons/PdfReaderIcons';

interface ToolIconProps {
  toolId?: string;
  readerIconId?: PdfReaderIconId;
  iconKey?: string;
  lucideIcon?: LucideIcon;
  tone?: IconTone;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'rounded' | 'circle';
  elevated?: boolean;
  className?: string;
}

const sizeMap = {
  xs: { box: 'h-7 w-7', icon: 'h-full w-full', rounded: 'rounded-lg' },
  sm: { box: 'h-8 w-8', icon: 'h-full w-full', rounded: 'rounded-lg' },
  md: { box: 'h-10 w-10', icon: 'h-full w-full', rounded: 'rounded-xl' },
  lg: { box: 'h-12 w-12', icon: 'h-full w-full', rounded: 'rounded-[14px]' },
  xl: { box: 'h-[60px] w-[60px]', icon: 'h-full w-full', rounded: 'rounded-2xl' },
};

export function ToolIcon({
  toolId,
  readerIconId,
  iconKey,
  lucideIcon,
  tone,
  size = 'md',
  shape = 'circle',
  elevated = true,
  className = '',
}: ToolIconProps) {
  const iconId = readerIconId ?? getPdfReaderIconId(toolId);
  const resolvedTone = tone ?? (iconId ? getPdfReaderIconTone(iconId) : getToolIconTone(toolId ?? '', undefined));
  const s = sizeMap[size];
  const radius = shape === 'circle' ? 'rounded-full' : s.rounded;

  if (iconId) {
    return (
      <div
        className={`${s.box} ${radius} flex shrink-0 items-center justify-center border ${iconToneClass(resolvedTone)} icon-badge--convert ${elevated ? 'icon-badge--elevated' : ''} ${className}`}
      >
        <PdfReaderIcon id={iconId} className="text-[var(--tone-fg)]" />
      </div>
    );
  }

  const Lucide = lucideIcon ?? (iconKey ? getToolIcon(iconKey) : undefined);
  if (!Lucide) return null;

  return (
    <div
      className={`${s.box} ${radius} flex shrink-0 items-center justify-center border ${iconToneClass(resolvedTone)} bg-[var(--tone-bg)] border-[var(--tone-border)] ${elevated ? 'icon-badge--elevated' : ''} ${className}`}
    >
      <Lucide className="text-[var(--tone-fg)]" strokeWidth={1.75} style={{ width: 'var(--pdf-icon-glyph-size)', height: 'var(--pdf-icon-glyph-size)' }} />
    </div>
  );
}

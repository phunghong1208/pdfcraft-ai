import type { LucideIcon } from 'lucide-react';
import { iconToneClass, type IconTone } from '@/lib/ui/icon-tones';

interface IconBadgeProps {
  icon: LucideIcon;
  tone?: IconTone;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Soft depth — footer trust, highlights */
  elevated?: boolean;
  className?: string;
}

const sizeMap = {
  xs: { box: 'h-7 w-7 rounded-lg', icon: 'h-3.5 w-3.5' },
  sm: { box: 'h-8 w-8 rounded-lg', icon: 'h-[18px] w-[18px]' },
  md: { box: 'h-10 w-10 rounded-xl', icon: 'h-5 w-5' },
  lg: { box: 'h-11 w-11 rounded-[14px]', icon: 'h-[22px] w-[22px]' },
  xl: { box: 'h-[60px] w-[60px] rounded-2xl', icon: 'h-7 w-7' },
};

export function IconBadge({
  icon: Icon,
  tone = 'blue',
  size = 'md',
  elevated = false,
  className = '',
}: IconBadgeProps) {
  const s = sizeMap[size];
  return (
    <div
      className={`${s.box} flex shrink-0 items-center justify-center border ${iconToneClass(tone)} bg-[var(--tone-bg)] border-[var(--tone-border)] ${elevated ? 'icon-badge--elevated' : ''} ${className}`}
    >
      <Icon className={`${s.icon} text-[var(--tone-fg)]`} strokeWidth={1.75} />
    </div>
  );
}

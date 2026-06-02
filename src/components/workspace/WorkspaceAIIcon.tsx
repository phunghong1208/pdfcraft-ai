'use client';

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const BOX: Record<'xs' | 'sm' | 'md', string> = {
  xs: 'h-6 w-6 rounded-md',
  sm: 'h-7 w-7 rounded-lg',
  md: 'h-9 w-9 rounded-lg',
};

const ICON: Record<'xs' | 'sm' | 'md', string> = {
  xs: 'h-3 w-3',
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
};

export type WorkspaceAIIconSize = keyof typeof BOX;

export interface WorkspaceAIIconProps {
  size?: WorkspaceAIIconSize;
  className?: string;
  /** Bỏ nền gradient — chỉ icon (status bar nhỏ) */
  bare?: boolean;
}

/** Icon Trợ lý AI — đỏ thương hiệu */
export function WorkspaceAIIcon({ size = 'sm', className, bare = false }: WorkspaceAIIconProps) {
  if (bare) {
    return (
      <Sparkles
        className={cn(
          ICON[size],
          'text-[hsl(var(--color-primary))] drop-shadow-[0_0_6px_hsl(var(--color-primary)/0.55)]',
          className,
        )}
        strokeWidth={2.25}
        aria-hidden
      />
    );
  }

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        'bg-[hsl(var(--color-primary))]',
        'shadow-[0_0_14px_hsl(var(--color-primary)/0.45)] ring-1 ring-white/25',
        BOX[size],
        className,
      )}
      aria-hidden
    >
      <span className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.35),transparent_55%)]" />
      <Sparkles className={cn('relative text-white', ICON[size])} strokeWidth={2.25} />
    </span>
  );
}

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

/** Icon Trợ lý AI — gradient xanh–tím + lấp lánh */
export function WorkspaceAIIcon({ size = 'sm', className, bare = false }: WorkspaceAIIconProps) {
  if (bare) {
    return (
      <Sparkles
        className={cn(ICON[size], 'text-blue-300 drop-shadow-[0_0_6px_rgba(96,165,250,0.6)]', className)}
        strokeWidth={2.25}
        aria-hidden
      />
    );
  }

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        'bg-gradient-to-br from-[#2563EB] via-[#4F46E5] to-[#7C3AED]',
        'shadow-[0_0_14px_rgba(79,70,229,0.45)] ring-1 ring-white/25',
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

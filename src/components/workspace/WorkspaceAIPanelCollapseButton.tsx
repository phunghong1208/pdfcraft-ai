'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WorkspaceAIPanelCollapseButtonProps {
  onClick: () => void;
  'aria-label': string;
  title?: string;
  className?: string;
  theme?: 'light' | 'dark';
}

/** Đóng panel Trợ lý AI — icon X (tránh trùng sparkles bên trái header) */
export function WorkspaceAIPanelCollapseButton({
  onClick,
  'aria-label': ariaLabel,
  title,
  className,
  theme = 'light',
}: WorkspaceAIPanelCollapseButtonProps) {
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center justify-center h-8 w-8 rounded-lg border transition-all',
        isDark
          ? 'border-[#2b2f38] bg-[#252a34] text-white/50 hover:border-[#3a4150] hover:bg-[#2b313d] hover:text-white/90'
          : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] text-[hsl(var(--color-muted-foreground))] hover:border-[hsl(var(--color-primary)/0.35)] hover:bg-[hsl(var(--color-muted)/0.65)] hover:text-[hsl(var(--color-foreground))]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-primary)/0.4)]',
        'active:scale-95 transition-all',
        className,
      )}
    >
      <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
    </button>
  );
}

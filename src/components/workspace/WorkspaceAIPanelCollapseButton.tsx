'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WorkspaceAIPanelCollapseButtonProps {
  onClick: () => void;
  'aria-label': string;
  title?: string;
  className?: string;
}

/** Đóng panel Trợ lý AI — icon X (tránh trùng sparkles bên trái header) */
export function WorkspaceAIPanelCollapseButton({
  onClick,
  'aria-label': ariaLabel,
  title,
  className,
}: WorkspaceAIPanelCollapseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      className={cn(
        'shrink-0 rounded-md p-1.5 text-white/40',
        'hover:bg-white/[0.08] hover:text-white/85',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-primary)/0.4)]',
        'active:scale-95 transition-all',
        className,
      )}
    >
      <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
    </button>
  );
}

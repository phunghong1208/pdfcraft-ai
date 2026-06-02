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
        'shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full border',
        'border-[#CBD5E1] bg-white text-[#1F2937] dark:border-[#334155] dark:bg-[#0F172A] dark:text-white/85',
        'hover:bg-[#F3F4F6] hover:text-[#111827] dark:hover:bg-[#1E293B] dark:hover:text-white',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-primary)/0.4)]',
        'active:scale-95 transition-all',
        className,
      )}
    >
      <X className="h-4.5 w-4.5" strokeWidth={2.5} aria-hidden />
    </button>
  );
}

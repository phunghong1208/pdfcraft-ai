'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Icon danh sách trang — hai khung trang xếp, không dùng mũi tên panel */
export function WorkspacePagesSidebarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={cn('h-4 w-4', className)}
      aria-hidden
    >
      <rect
        x="1"
        y="2"
        width="6.25"
        height="12"
        rx="1.1"
        className="stroke-current"
        strokeWidth="1.5"
      />
      <rect
        x="8.75"
        y="2"
        width="6.25"
        height="12"
        rx="1.1"
        className="stroke-current opacity-45"
        strokeWidth="1.5"
      />
      <path
        d="M2.5 5.25h3M2.5 7.5h2.25M2.5 9.75h2.75"
        className="stroke-current opacity-35"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
      <path
        d="M10.25 5.5h3.25M10.25 7.75h2.5M10.25 10h3"
        className="stroke-current opacity-25"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface WorkspacePagesSidebarToggleProps {
  expanded: boolean;
  onClick: () => void;
  'aria-label': string;
  title?: string;
  /** header: trong sidebar; floating: góc viewer; compact: status bar */
  variant?: 'header' | 'floating' | 'compact';
  className?: string;
}

export function WorkspacePagesSidebarToggle({
  expanded,
  onClick,
  'aria-label': ariaLabel,
  title,
  variant = 'header',
  className,
}: WorkspacePagesSidebarToggleProps) {
  const floating = variant === 'floating';
  const compact = variant === 'compact';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={expanded}
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center justify-center transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/45',
        'active:scale-95',
        floating &&
          'h-9 w-9 rounded-lg border border-white/12 bg-[#2a2d35]/95 text-white/70 shadow-lg backdrop-blur-sm hover:border-white/22 hover:bg-[#32363f] hover:text-white',
        compact && 'rounded-md p-1 text-white/45 hover:bg-white/[0.06] hover:text-white/85',
        !floating &&
          !compact &&
          'h-8 w-8 rounded-lg border border-white/10 bg-white/[0.03] text-white/50 hover:border-white/18 hover:bg-white/[0.07] hover:text-white/90',
        className,
      )}
    >
      {expanded ? (
        <X
          className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')}
          strokeWidth={2.25}
          aria-hidden
        />
      ) : (
        <WorkspacePagesSidebarIcon
          className={compact ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]'}
        />
      )}
    </button>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Languages } from 'lucide-react';
import { WORKSPACE_AI_RESPONSE_LANGUAGES } from '@/services/workspaceAiApi';

export interface LanguageItem {
  apiName: string;
  nativeName: string;
}

export interface WorkspaceAiLanguageSelectProps {
  value: string;
  onChange: (language: string) => void;
  disabled?: boolean;
  label: string;
  hint?: string;
  variant?: 'dark' | 'light';
  /** Một dòng gọn trong toolbar */
  compact?: boolean;
  /** Custom language list — defaults to WORKSPACE_AI_RESPONSE_LANGUAGES */
  items?: LanguageItem[];
}

export function WorkspaceAiLanguageSelect({
  value,
  onChange,
  disabled,
  label,
  hint,
  variant = 'dark',
  compact = false,
  items,
}: WorkspaceAiLanguageSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const languages = items ?? WORKSPACE_AI_RESPONSE_LANGUAGES;

  const selected = useMemo(
    () => languages.find((l) => l.apiName === value),
    [languages, value],
  );

  const isDark = variant === 'dark';

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const triggerClass = isDark
    ? [
        'group w-full flex items-center gap-2 rounded-lg border text-left transition-all',
        'border-[#30363D] bg-[#0D1117] hover:border-white/20 hover:bg-[#161B22]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-primary)/0.35)]',
        'disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none',
        compact ? 'px-3 py-2 min-h-[36px]' : 'px-2.5 py-2 min-h-[36px]',
      ].join(' ')
    : [
        'group w-full flex items-center gap-2 rounded-lg border text-left transition-all',
        'border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))]',
        'hover:border-[hsl(var(--color-primary)/0.35)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-primary)/0.25)]',
        'disabled:opacity-45 disabled:cursor-not-allowed',
        compact ? 'px-2 py-1.5' : 'px-2.5 py-2',
      ].join(' ');

  const menuClass = isDark
    ? 'absolute left-0 right-0 top-[calc(100%+4px)] z-[80] max-h-56 overflow-y-auto rounded-lg border border-[#30363D] bg-[#161B22] py-1 shadow-[0_12px_40px_rgba(0,0,0,0.55)] scrollbar-thin'
    : 'absolute left-0 right-0 top-[calc(100%+4px)] z-[80] max-h-56 overflow-y-auto rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] py-1 shadow-lg';

  const itemClass = (active: boolean) =>
    isDark
      ? `w-full flex items-center gap-2 px-2.5 py-2 text-[12px] transition-colors ${
          active ? 'bg-[hsl(var(--color-primary)/0.15)] text-red-100' : 'text-white/85 hover:bg-white/[0.06]'
        }`
      : `w-full flex items-center gap-2 px-2.5 py-2 text-sm transition-colors ${
          active
            ? 'bg-[hsl(var(--color-primary)/0.1)] text-[hsl(var(--color-foreground))]'
            : 'text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))]'
        }`;

  return (
    <div ref={rootRef} className={`relative min-w-0 ${compact ? '' : 'space-y-1'}`}>
      {!compact && hint ? (
        <p className={isDark ? 'text-[10px] text-white/35 px-0.5' : 'text-[11px] text-[hsl(var(--color-muted-foreground))]'}>
          {hint}
        </p>
      ) : null}

      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        className={triggerClass}
      >
        <Languages
          className={`shrink-0 ${isDark ? 'h-3.5 w-3.5 text-red-300/90' : 'h-4 w-4 text-[hsl(var(--color-primary))]'}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate ${isDark ? 'text-[10px] text-white/40' : 'text-[10px] text-[hsl(var(--color-muted-foreground))]'}`}
          >
            {label}
          </span>
          <span
            className={`block truncate font-medium ${isDark ? 'text-[12px] text-white/90' : 'text-sm text-[hsl(var(--color-foreground))]'}`}
          >
            {selected?.nativeName ?? value}
          </span>
        </span>
        <ChevronRight
          className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''} ${
            isDark ? 'h-3.5 w-3.5 text-white/35' : 'h-4 w-4 text-[hsl(var(--color-muted-foreground))]'
          }`}
          aria-hidden
        />
      </button>

      {open ? (
        <ul role="listbox" aria-label={label} className={menuClass}>
          {languages.map((lang) => {
            const active = lang.apiName === value;
            return (
              <li key={lang.apiName} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={itemClass(active)}
                  onClick={() => {
                    onChange(lang.apiName);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 text-left truncate">{lang.nativeName}</span>
                  <span className={`shrink-0 text-[10px] ${isDark ? 'text-white/30' : 'text-[hsl(var(--color-muted-foreground))]'}`}>
                    {lang.apiName}
                  </span>
                  {active ? (
                    <Check className={`shrink-0 h-3.5 w-3.5 ${isDark ? 'text-[hsl(var(--color-primary))]' : 'text-[hsl(var(--color-primary))]'}`} />
                  ) : (
                    <span className="w-3.5 shrink-0" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

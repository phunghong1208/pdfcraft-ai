'use client';

import { useMemo } from 'react';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: true });

const PROSE_DARK = [
  'workspace-ai-markdown text-[12px] leading-relaxed text-[#d1d5db]',
  '[&_h1]:text-[15px] [&_h1]:font-semibold [&_h1]:text-white/95 [&_h1]:mt-3 [&_h1]:mb-2 [&_h1:first-child]:mt-0',
  '[&_h2]:text-[14px] [&_h2]:font-semibold [&_h2]:text-white/90 [&_h2]:mt-3 [&_h2]:mb-1.5',
  '[&_h3]:text-[13px] [&_h3]:font-medium [&_h3]:text-white/85 [&_h3]:mt-2 [&_h3]:mb-1',
  '[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-1',
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-1',
  '[&_li]:text-[#c9d1d9]',
  '[&_strong]:text-white/95 [&_strong]:font-semibold',
  '[&_em]:text-red-200/90',
  '[&_a]:text-red-300 [&_a]:underline [&_a]:underline-offset-2',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-[hsl(var(--color-primary)/0.4)] [&_blockquote]:pl-3 [&_blockquote]:my-2 [&_blockquote]:text-white/60 [&_blockquote]:italic',
  '[&_code]:rounded [&_code]:bg-[#0D1117] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px] [&_code]:text-pink-200/90 [&_code]:font-mono',
  '[&_pre]:my-2 [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-[#30363D] [&_pre]:bg-[#0D1117] [&_pre]:p-3 [&_pre]:overflow-x-auto',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[11px] [&_pre_code]:text-[#e6edf3]',
  '[&_hr]:my-4 [&_hr]:border-[#30363D]',
  '[&_table]:my-2 [&_table]:w-full [&_table]:text-[11px] [&_table]:border-collapse',
  '[&_th]:border [&_th]:border-[#30363D] [&_th]:bg-[#161B22] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
  '[&_td]:border [&_td]:border-[#30363D] [&_td]:px-2 [&_td]:py-1',
].join(' ');

const PROSE_LIGHT = [
  'workspace-ai-markdown text-[13px] leading-relaxed text-[hsl(var(--color-foreground)/0.88)]',
  '[&_h1]:text-[16px] [&_h1]:font-semibold [&_h1]:text-[hsl(var(--color-foreground))] [&_h1]:mt-4 [&_h1]:mb-2 [&_h1:first-child]:mt-0',
  '[&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:text-[hsl(var(--color-foreground))] [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:pb-1 [&_h2]:border-b [&_h2]:border-[hsl(var(--color-border))]',
  '[&_h3]:text-[14px] [&_h3]:font-medium [&_h3]:text-[hsl(var(--color-foreground)/0.9)] [&_h3]:mt-3 [&_h3]:mb-1.5',
  '[&_p]:my-2.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5',
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5',
  '[&_li]:text-[hsl(var(--color-foreground)/0.85)]',
  '[&_strong]:text-[hsl(var(--color-foreground))] [&_strong]:font-semibold',
  '[&_em]:text-red-700/90',
  '[&_a]:text-[hsl(var(--color-primary))] [&_a]:underline [&_a]:underline-offset-2',
  '[&_blockquote]:border-l-[3px] [&_blockquote]:border-[hsl(var(--color-primary)/0.45)] [&_blockquote]:pl-3 [&_blockquote]:my-3 [&_blockquote]:text-[hsl(var(--color-muted-foreground))]',
  '[&_code]:rounded [&_code]:bg-[hsl(var(--color-muted))] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_code]:font-mono',
  '[&_pre]:my-3 [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-[hsl(var(--color-border))] [&_pre]:bg-[hsl(var(--color-muted)/0.5)] [&_pre]:p-3',
  '[&_hr]:my-5 [&_hr]:border-[hsl(var(--color-border))]',
].join(' ');

export interface WorkspaceAiMarkdownProps {
  content: string;
  className?: string;
  variant?: 'dark' | 'light';
}

export function WorkspaceAiMarkdown({
  content,
  className = '',
  variant = 'dark',
}: WorkspaceAiMarkdownProps) {
  const html = useMemo(() => {
    const trimmed = content.trim();
    if (!trimmed) return '';
    try {
      return marked.parse(trimmed, { async: false }) as string;
    } catch {
      return marked.parse(`\`\`\`\n${trimmed}\n\`\`\``, { async: false }) as string;
    }
  }, [content]);

  if (!html) return null;

  return (
    <div
      className={`${variant === 'light' ? PROSE_LIGHT : PROSE_DARK} ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

'use client';

import { Loader2 } from 'lucide-react';
import { AI_UI } from '@/lib/ai-ui-classes';
import { cn } from '@/lib/utils';

type AiCenteredSpinnerProps = {
  className?: string;
  size?: string;
};

/** Spinner giữa vùng nội dung — không kèm chữ loading. */
export function AiCenteredSpinner({ className, size = 'h-8 w-8' }: AiCenteredSpinnerProps) {
  return (
    <div
      className={cn('flex flex-1 items-center justify-center', className)}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <Loader2 className={cn('animate-spin shrink-0', size, AI_UI.spinner)} aria-hidden />
    </div>
  );
}

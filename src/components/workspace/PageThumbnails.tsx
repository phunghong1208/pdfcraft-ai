'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { loadPdfjs } from '@/lib/pdf/loader';

interface PageThumbnailsProps {
  pdfUrl: string;
  currentPage: number;
  onPageSelect: (page: number) => void;
  onPageCountChange?: (count: number) => void;
}

const THUMB_WIDTH = 120;

export function PageThumbnails({ pdfUrl, currentPage, onPageSelect, onPageCountChange }: PageThumbnailsProps) {
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pdfUrl) return;

    let cancelled = false;

    async function render() {
      setLoading(true);
      setThumbnails([]);

      try {
        const pdfjsLib = await loadPdfjs();
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        if (cancelled) return;

        const total = pdf.numPages;
        setPageCount(total);
        onPageCountChange?.(total);

        const thumbs: string[] = [];
        for (let i = 1; i <= total; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const unscaledViewport = page.getViewport({ scale: 1 });
          const scale = THUMB_WIDTH / unscaledViewport.width;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;

          await page.render({ canvasContext: ctx, viewport }).promise;
          thumbs.push(canvas.toDataURL('image/png'));

          if (!cancelled) {
            setThumbnails([...thumbs]);
          }
        }
      } catch (err) {
        console.error('[PageThumbnails] Failed to render', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    render();
    return () => { cancelled = true; };
  }, [pdfUrl, onPageCountChange]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPage]);

  return (
    <div ref={containerRef} className="space-y-2">
      {loading && thumbnails.length === 0 && (
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="w-full rounded-md border border-[hsl(var(--color-border))] dark:border-[#2b2f38] bg-[hsl(var(--color-card))] dark:bg-[#222833] p-1.5 text-center">
            <div className="h-[140px] rounded bg-[hsl(var(--color-muted)/0.6)] dark:bg-[#2a3140] animate-pulse" />
            <div className="mt-2 h-3 w-5 mx-auto rounded bg-[hsl(var(--color-muted)/0.6)] dark:bg-[#2a3140] animate-pulse" />
          </div>
        ))
      )}

      {thumbnails.map((src, idx) => {
        const page = idx + 1;
        const active = page === currentPage;
        return (
          <button
            key={page}
            ref={active ? activeRef : undefined}
            type="button"
            onClick={() => onPageSelect(page)}
            className={`group w-full rounded-md border p-1.5 text-center transition-all duration-150 ${
              active
                ? 'border-[hsl(var(--color-primary)/0.5)] bg-[hsl(var(--color-primary)/0.1)] ring-1 ring-[hsl(var(--color-primary)/0.22)]'
                : 'border-[hsl(var(--color-border))] dark:border-[#2b2f38] bg-[hsl(var(--color-card))] dark:bg-[#222833] hover:border-[hsl(var(--color-primary)/0.35)] dark:hover:border-[#3a4150] hover:bg-[hsl(var(--color-muted)/0.55)] dark:hover:bg-[#2a3140]'
            }`}
          >
            <img
              src={src}
              alt={`Page ${page}`}
              className="w-full rounded"
              draggable={false}
            />
            <div className={`mt-2 text-[11px] tabular-nums ${active ? 'text-red-300 font-medium' : 'text-[hsl(var(--color-muted-foreground))] dark:text-[#9ca3af] group-hover:text-[hsl(var(--color-foreground))] dark:group-hover:text-white/80'}`}>
              {page}
            </div>
          </button>
        );
      })}
    </div>
  );
}

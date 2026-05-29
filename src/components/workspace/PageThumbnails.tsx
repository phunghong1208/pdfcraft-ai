'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { loadPdfjs } from '@/lib/pdf/loader';

interface PageThumbnailsProps {
  pdfUrl: string;
  currentPage: number;
  onPageSelect: (page: number) => void;
  onPageCountChange?: (count: number) => void;
}

const THUMB_WIDTH = 68;

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
    <div ref={containerRef} className="mt-2 space-y-2 px-2">
      {loading && thumbnails.length === 0 && (
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5 text-center">
            <div className="h-[80px] rounded bg-white/[0.06] animate-pulse" />
            <div className="mt-1.5 h-3 w-4 mx-auto rounded bg-white/[0.06] animate-pulse" />
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
            className={`group w-full rounded-lg border p-1.5 text-center transition-all duration-150 ${
              active
                ? 'border-blue-400/50 bg-blue-500/10 ring-1 ring-blue-400/20'
                : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]'
            }`}
          >
            <img
              src={src}
              alt={`Page ${page}`}
              className="w-full rounded"
              draggable={false}
            />
            <div className={`mt-1.5 text-[10px] tabular-nums ${active ? 'text-blue-300 font-medium' : 'text-white/40 group-hover:text-white/70'}`}>
              {page}
            </div>
          </button>
        );
      })}
    </div>
  );
}

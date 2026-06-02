'use client';

import { useEffect, useRef } from 'react';

/** Gán file từ workspace ribbon một lần khi mở tool inline */
export function useToolInitialFile(
  initialFile: File | null | undefined,
  onSeed: (file: File) => void,
) {
  const seededRef = useRef(false);

  useEffect(() => {
    if (!initialFile || seededRef.current) return;
    seededRef.current = true;
    onSeed(initialFile);
  }, [initialFile, onSeed]);
}

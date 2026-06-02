'use client';

import { useTranslations } from 'next-intl';
import type { PdfViewerLayerSettings } from '@/lib/pdf/pdf-viewer-layers';

type PdfViewerLayerPanelProps = {
  settings: PdfViewerLayerSettings;
  isScanLike: boolean;
  onChange: (next: PdfViewerLayerSettings) => void;
};

function LayerToggle({
  checked,
  label,
  hint,
  onToggle,
}: {
  checked: boolean;
  label: string;
  hint?: string;
  onToggle: () => void;
}) {
  return (
    <label
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-white/[0.06] cursor-pointer select-none"
      title={hint}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-3.5 w-3.5 rounded border-white/20 bg-[#1a1d24] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-primary)/0.4)]"
      />
      <span className="text-[10px] text-white/75 whitespace-nowrap">{label}</span>
    </label>
  );
}

export function PdfViewerLayerPanel({ settings, isScanLike, onChange }: PdfViewerLayerPanelProps) {
  const t = useTranslations('workspace');

  const patch = (partial: Partial<PdfViewerLayerSettings>) => {
    onChange({ ...settings, ...partial });
  };

  return (
    <div className="flex items-center gap-0.5 px-1">
      <span className="text-[9px] uppercase tracking-wide text-white/30 px-1 shrink-0">
        {t('viewLayers.title')}
      </span>
      <LayerToggle
        checked={settings.original}
        label={t('viewLayers.original')}
        hint={t('viewLayers.originalHint')}
        onToggle={() => patch({ original: !settings.original })}
      />
      <LayerToggle
        checked={settings.annotationLayer}
        label={t('viewLayers.annotation')}
        hint={t('viewLayers.annotationHint')}
        onToggle={() => patch({ annotationLayer: !settings.annotationLayer })}
      />
      {!isScanLike ? (
        <LayerToggle
          checked={settings.textLayer}
          label={t('viewLayers.textLayer')}
          hint={t('viewLayers.textLayerHint')}
          onToggle={() => patch({ textLayer: !settings.textLayer })}
        />
      ) : (
        <LayerToggle
          checked={settings.ocrLayer}
          label={t('viewLayers.ocrLayer')}
          hint={t('viewLayers.ocrLayerHint')}
          onToggle={() => patch({ ocrLayer: !settings.ocrLayer })}
        />
      )}
    </div>
  );
}

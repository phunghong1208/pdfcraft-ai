import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function BaseIcon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

/** Quét sang PDF — khung scan xanh lá */
export function ScanToPdfIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M4 12h3M17 12h3" />
      <path d="M6 8V6M6 18v-2M18 8V6M18 18v-2" />
      <path d="M7 12h10" />
    </BaseIcon>
  );
}

/** Ảnh sang PDF — khung ảnh đỏ */
export function ImageToPdfIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <path d="M7 16l3.5-4 2.5 2.5L17 12" />
    </BaseIcon>
  );
}

/** File sang PDF — tài liệu tím */
export function FileToPdfIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 3h6l4 4v14H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M14 3v5h5" />
      <path d="M10 12h6M10 15h6M10 18h4" />
    </BaseIcon>
  );
}

/** PDF sang Word */
export function PdfToWordIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 4h7l4 4v12H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M14 4v5h5" />
      <path d="M9 13.5c.8-1.2 1.6-1.2 2.4 0 .8 1.2 1.6 1.2 2.4 0" />
      <path d="M10.2 13.5v4.5M13.8 13.5v4.5" />
    </BaseIcon>
  );
}

/** PDF sang PowerPoint */
export function PdfToPptIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 8h2.2a2 2 0 1 1 0 4H9v5" />
      <path d="M15 14l3 2-3 2v-4z" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

/** PDF sang Excel */
export function PdfToExcelIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h8M12 8v8" />
    </BaseIcon>
  );
}

/** PDF sang ảnh — chồng khung ảnh */
export function PdfToImageIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="7" width="12" height="10" rx="1.5" />
      <rect x="9" y="5" width="12" height="10" rx="1.5" />
      <circle cx="12" cy="9" r="1" fill="currentColor" stroke="none" />
      <path d="M10 13l2-2 1.5 1.5L17 11" />
    </BaseIcon>
  );
}

/** PDF sang ảnh dài */
export function PdfToLongImageIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <circle cx="11" cy="8" r="1.2" fill="currentColor" stroke="none" />
      <path d="M9 16l2.5-3 2 2L15 13" />
    </BaseIcon>
  );
}

export type ConvertIconId =
  | 'scan-to-pdf'
  | 'image-to-pdf'
  | 'file-to-pdf'
  | 'pdf-to-word'
  | 'pdf-to-ppt'
  | 'pdf-to-excel'
  | 'pdf-to-image'
  | 'pdf-to-long-image';

const CONVERT_ICON_MAP: Record<ConvertIconId, (props: IconProps) => ReactNode> = {
  'scan-to-pdf': ScanToPdfIcon,
  'image-to-pdf': ImageToPdfIcon,
  'file-to-pdf': FileToPdfIcon,
  'pdf-to-word': PdfToWordIcon,
  'pdf-to-ppt': PdfToPptIcon,
  'pdf-to-excel': PdfToExcelIcon,
  'pdf-to-image': PdfToImageIcon,
  'pdf-to-long-image': PdfToLongImageIcon,
};

export function ConvertIcon({ id, ...props }: IconProps & { id: ConvertIconId }) {
  const Icon = CONVERT_ICON_MAP[id];
  return <Icon {...props} />;
}

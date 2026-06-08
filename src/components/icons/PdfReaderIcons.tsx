import type { ReactNode, SVGProps } from 'react';
import { ConvertIcon, type ConvertIconId } from '@/components/icons/ConvertIcons';

type IconProps = SVGProps<SVGSVGElement>;

function BaseIcon({ children, strokeWidth = 1.65, ...props }: IconProps & { children: ReactNode; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

/* ─── Edit ─── */

export function EditTextIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 4h7l4 4v12H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M14 4v5h5" />
      <path d="m14.5 14.5-4 4" />
      <path d="m10.5 18.5 8 8" />
      <path d="m16 13-2.5 2.5" />
    </BaseIcon>
  );
}

export function AddTextIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="6" y="5" width="12" height="14" rx="1.5" />
      <circle cx="6" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="18" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="6" cy="19" r="1" fill="currentColor" stroke="none" />
      <circle cx="18" cy="19" r="1" fill="currentColor" stroke="none" />
      <path d="M10 8h4M12 8v7" strokeWidth={2} />
    </BaseIcon>
  );
}

export function AnnotateIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M6 4h9l5 5v11H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M15 4v5h5" />
      <path d="m11 15 2-2 4 4-2 2-4-4z" />
      <path d="m13 13 2 2" />
    </BaseIcon>
  );
}

export function SignatureIcon(props: IconProps) {
  return (
    <BaseIcon {...props} strokeWidth={1.8}>
      <path d="M4 16c3-4 5-5 8-3s5 1 8-4" />
      <path d="M5 18h14" />
    </BaseIcon>
  );
}

export function WatermarkIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 14h8v5H8z" />
      <path d="M10 14V9a2 2 0 0 1 4 0v5" />
      <path d="M7 19h10" />
      <circle cx="12" cy="7" r="2.5" />
      <path d="M9.5 7h5" />
    </BaseIcon>
  );
}

/* ─── Actions ─── */

export function MergeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="7" width="7" height="10" rx="1.5" />
      <rect x="14" y="7" width="7" height="10" rx="1.5" />
      <path d="M10 12h4M11 11l-1 1 1 1M13 11l1 1-1 1" />
    </BaseIcon>
  );
}

export function SplitIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="7" width="7" height="10" rx="1.5" />
      <rect x="14" y="7" width="7" height="10" rx="1.5" />
      <path d="M10 12h4M9 11l-1 1 1 1M15 11l1 1-1 1" />
    </BaseIcon>
  );
}

export function CompressIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M4 10h2M4 14h2M18 10h2M18 14h2" />
      <path d="M9 12h6" />
    </BaseIcon>
  );
}

export function ManagePagesIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4" y="6" width="11" height="14" rx="1.5" />
      <rect x="9" y="4" width="11" height="14" rx="1.5" />
      <path d="M8 10h6M8 13h6M8 16h4" />
    </BaseIcon>
  );
}

/* ─── Protect ─── */

export function LockPdfIcon(props: IconProps) {
  return (
    <BaseIcon {...props} strokeWidth={1.75}>
      <rect x="6" y="11" width="12" height="9" rx="2" />
      <path d="M8 11V9a4 4 0 0 1 8 0v2" />
      <circle cx="10" cy="15.5" r=".8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="15.5" r=".8" fill="currentColor" stroke="none" />
      <circle cx="14" cy="15.5" r=".8" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function UnlockPdfIcon(props: IconProps) {
  return (
    <BaseIcon {...props} strokeWidth={1.75}>
      <rect x="6" y="11" width="12" height="9" rx="2" />
      <path d="M8 11V9a4 4 0 0 1 7-2" />
      <circle cx="10" cy="15.5" r=".8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="15.5" r=".8" fill="currentColor" stroke="none" />
      <circle cx="14" cy="15.5" r=".8" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export type PdfReaderIconId =
  | ConvertIconId
  | 'edit-text'
  | 'add-text'
  | 'annotate'
  | 'signature'
  | 'watermark'
  | 'merge'
  | 'split'
  | 'compress'
  | 'manage-pages'
  | 'lock-pdf'
  | 'unlock-pdf';

const LOCAL_ICON_MAP: Record<Exclude<PdfReaderIconId, ConvertIconId>, (props: IconProps) => ReactNode> = {
  'edit-text': EditTextIcon,
  'add-text': AddTextIcon,
  annotate: AnnotateIcon,
  signature: SignatureIcon,
  watermark: WatermarkIcon,
  merge: MergeIcon,
  split: SplitIcon,
  compress: CompressIcon,
  'manage-pages': ManagePagesIcon,
  'lock-pdf': LockPdfIcon,
  'unlock-pdf': UnlockPdfIcon,
};

const CONVERT_IDS = new Set<string>([
  'scan-to-pdf', 'image-to-pdf', 'file-to-pdf', 'pdf-to-word', 'pdf-to-ppt',
  'pdf-to-excel', 'pdf-to-image', 'pdf-to-long-image',
]);

export function PdfReaderIcon({ id, ...props }: IconProps & { id: PdfReaderIconId }) {
  if (CONVERT_IDS.has(id)) {
    return <ConvertIcon id={id as ConvertIconId} {...props} />;
  }
  const Icon = LOCAL_ICON_MAP[id as Exclude<PdfReaderIconId, ConvertIconId>];
  return <Icon {...props} />;
}

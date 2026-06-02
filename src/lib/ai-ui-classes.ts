/**
 * Accent AI — đồng bộ màu primary đỏ (--color-primary).
 */
export const AI_UI = {
  icon: 'text-[hsl(var(--color-primary))]',
  iconMuted: 'text-[hsl(var(--color-primary)/0.45)]',
  spinner: 'text-[hsl(var(--color-primary))]',
  gradientBtn:
    'rounded-full bg-[hsl(var(--color-primary))] hover:bg-[hsl(var(--color-primary-hover))] text-[hsl(var(--color-primary-foreground))] shadow-md shadow-[hsl(var(--color-primary)/0.28)]',
  cardBorder: 'border-[hsl(var(--color-primary)/0.2)]',
  cardBg: 'bg-gradient-to-b from-[hsl(var(--color-primary)/0.06)] to-[hsl(var(--color-background))]',
  pill: 'bg-[hsl(var(--color-primary)/0.12)] text-[hsl(var(--color-primary))] dark:text-red-200',
  assistantBubble:
    'border border-[hsl(var(--color-primary)/0.18)] bg-gradient-to-br from-[hsl(var(--color-primary)/0.08)] to-[hsl(var(--color-muted)/0.2)]',
  userBubble:
    'bg-[hsl(var(--color-primary)/0.1)] border border-[hsl(var(--color-primary)/0.22)] ml-2',
  focusRing: 'focus:ring-[hsl(var(--color-primary)/0.35)]',
  playerShell:
    'border-[hsl(var(--color-primary)/0.22)] bg-gradient-to-b from-[hsl(var(--color-primary)/0.1)] to-transparent',
  playerBtn:
    'bg-[hsl(var(--color-primary))] hover:bg-[hsl(var(--color-primary-hover))] shadow-lg shadow-[hsl(var(--color-primary)/0.3)] ring-4 ring-[hsl(var(--color-primary)/0.18)]',
  playerIconRing:
    'bg-[hsl(var(--color-primary)/0.15)] ring-1 ring-[hsl(var(--color-primary)/0.28)]',
  playerIcon: 'text-[hsl(var(--color-primary))]',
  playerStatus: 'text-[hsl(var(--color-primary))] dark:text-red-200/90',
  waveBar: 'bg-[hsl(var(--color-primary)/0.75)]',
  speedOn:
    'bg-[hsl(var(--color-primary)/0.15)] border-[hsl(var(--color-primary)/0.35)] text-[hsl(var(--color-primary))] dark:text-red-200',
} as const;

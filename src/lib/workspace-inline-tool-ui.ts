/** Shared layout/typography for tools opened inside DocumentWorkspace modal (match Background / Nền). */

export const WORKSPACE_INLINE_TOOL_SHELL_CLASS =
  'workspace-inline-tool flex-1 overflow-y-auto scrollbar-hide p-4';

export const workspaceInlineRootClass = (embedded: boolean) =>
  embedded ? 'space-y-6' : 'space-y-6';

export const workspaceInlineSectionTitleClass =
  'text-sm font-medium text-[hsl(var(--color-foreground))]';

export const workspaceInlineLabelClass =
  'block text-sm font-medium text-[hsl(var(--color-foreground))]';

export const workspaceInlineFieldLabelClass =
  'block text-sm font-medium mb-1 text-[hsl(var(--color-foreground))]';

export const workspaceInlineRadioLabelClass =
  'text-sm font-medium text-[hsl(var(--color-foreground))]';

export const workspaceInlineInputClass =
  'w-full px-3 py-2 text-sm border rounded-md border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))]';

export const workspaceInlineHintClass =
  'text-[11px] text-[hsl(var(--color-muted-foreground))]';

export const workspaceInlineErrorClass =
  'p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm dark:bg-red-950/40 dark:border-red-500/30 dark:text-red-200';

export const workspaceInlineSuccessClass =
  'text-sm font-medium text-[hsl(142_45%_38%)] dark:text-[hsl(142_50%_55%)]';

export const workspaceInlineActionBtnSize = 'md' as const;

export const workspaceInlineContrastBoostClass = [
  '[&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-[hsl(var(--color-foreground))]',
  '[&_label]:text-sm [&_label]:font-medium [&_label]:text-[hsl(var(--color-foreground))]',
  '[&_input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color])]:text-sm',
  '[&_input]:border-[hsl(var(--color-border))]',
  '[&_input]:bg-[hsl(var(--color-background))]',
  '[&_textarea]:text-sm [&_textarea]:border-[hsl(var(--color-border))]',
  '[&_textarea]:bg-[hsl(var(--color-background))]',
].join(' ');

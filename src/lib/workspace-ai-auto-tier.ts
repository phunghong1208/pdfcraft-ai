import type { WorkspacePresetTierId } from '@/services/workspaceAiApi';

/** Tóm tắt lần đầu → vừa; tạo lại → chi tiết. Chat dùng cùng mức (không chọn riêng). */
export function resolveAutoSummaryTier(hasExistingSummary: boolean): WorkspacePresetTierId {
  return hasExistingSummary ? 'deep' : 'balanced';
}

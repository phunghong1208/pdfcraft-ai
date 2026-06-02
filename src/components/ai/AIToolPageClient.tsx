'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Upload, FileText, Loader2, Copy, Check, FileDown, Sparkles } from 'lucide-react';
import { WorkspaceAiMarkdown } from '@/components/workspace/WorkspaceAiMarkdown';
import { markdownToPDF } from '@/lib/pdf/processors/markdown-to-pdf';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { WorkspaceAiLanguageSelect } from '@/components/workspace/WorkspaceAiLanguageSelect';
import {
  loadWorkspaceAiAnswerLanguage,
  saveWorkspaceAiAnswerLanguage,
} from '@/lib/workspace-ai-language-preference';
import {
  WORKSPACE_SUMMARY_DETAIL_PRESETS,
  WORKSPACE_DEFAULT_PRESET_TIER,
  type WorkspacePresetTierId,
} from '@/services/workspaceAiApi';
import { chatWithPdf, smartOcrPdf, summarizePdf, translatePdf, voiceReaderPdf } from '@/services/aiApi';

type AIActionType = 'summary' | 'translate' | 'chat' | 'smartOcr' | 'voice';

interface AIToolPageClientProps {
  title: string;
  description: string;
  actionLabel: string;
  actionType: AIActionType;
}

type SummaryResult = {
  summary?: string;
  markdown?: string;
  document_id?: number | null;
  documentId?: number | null;
  fileName?: string;
};

const ACTION_MAP: Record<Exclude<AIActionType, 'summary'>, (file: File) => Promise<unknown>> = {
  translate: translatePdf,
  chat: chatWithPdf,
  smartOcr: smartOcrPdf,
  voice: voiceReaderPdf,
};

const SUMMARY_STORAGE_KEY = 'pdfcraft-ai-summary-last';

type StoredSummary = {
  fileName: string;
  fileSize: number;
  fileModified: number;
  summary: string;
  documentId: number | null;
  answerLanguage?: string;
  savedAt: number;
};

function loadStoredSummary(): StoredSummary | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SUMMARY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSummary;
  } catch {
    return null;
  }
}

function saveStoredSummary(
  file: File,
  summary: string,
  documentId: number | null,
  answerLanguage: string,
): void {
  if (typeof window === 'undefined') return;
  const payload: StoredSummary = {
    fileName: file.name,
    fileSize: file.size,
    fileModified: file.lastModified,
    summary,
    documentId,
    answerLanguage,
    savedAt: Date.now(),
  };
  sessionStorage.setItem(SUMMARY_STORAGE_KEY, JSON.stringify(payload));
}

function getSummaryTextFromResult(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const r = result as SummaryResult;
  return (r.summary ?? r.markdown ?? '').trim();
}

export default function AIToolPageClient({ title, description, actionLabel, actionType }: AIToolPageClientProps) {
  const locale = useLocale();
  const tWorkspace = useTranslations('workspace');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [summaryTierId, setSummaryTierId] = useState<WorkspacePresetTierId>(WORKSPACE_DEFAULT_PRESET_TIER);
  const [answerLanguage, setAnswerLanguage] = useState(() => loadWorkspaceAiAnswerLanguage(locale));
  const [restoredHint, setRestoredHint] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    setAnswerLanguage(loadWorkspaceAiAnswerLanguage(locale));
  }, [locale]);

  useEffect(() => {
    if (actionType !== 'summary') return;
    const stored = loadStoredSummary();
    if (!stored?.summary.trim()) return;
    setResult({
      summary: stored.summary,
      markdown: stored.summary,
      document_id: stored.documentId,
      documentId: stored.documentId,
      fileName: stored.fileName,
    });
    if (stored.answerLanguage) setAnswerLanguage(stored.answerLanguage);
    setRestoredHint(
      `Tóm tắt đã lưu cho «${stored.fileName}» (${new Date(stored.savedAt).toLocaleTimeString('vi-VN')}). Chọn lại file để xem preview.`,
    );
  }, [actionType]);

  const restoreSummaryForFile = useCallback((target: File) => {
    const stored = loadStoredSummary();
    if (!stored) return;
    const sameFile =
      stored.fileName === target.name &&
      stored.fileSize === target.size &&
      stored.fileModified === target.lastModified;
    if (!sameFile || !stored.summary.trim()) return;
    setResult({
      summary: stored.summary,
      markdown: stored.summary,
      document_id: stored.documentId,
      documentId: stored.documentId,
      fileName: stored.fileName,
    });
    setRestoredHint(
      `Đã khôi phục tóm tắt lúc ${new Date(stored.savedAt).toLocaleTimeString('vi-VN')}.`,
    );
  }, []);

  const handleFileSelect = useCallback(
    (next: File | null) => {
      setFile(next);
      setError(null);
      setRestoredHint(null);
      if (!next) {
        setResult(null);
        return;
      }
      setResult(null);
      if (actionType === 'summary') restoreSummaryForFile(next);
    },
    [actionType, restoreSummaryForFile],
  );

  async function handleRun() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setRestoredHint(null);

    try {
      if (actionType === 'summary') {
        const preset = WORKSPACE_SUMMARY_DETAIL_PRESETS.find((p) => p.id === summaryTierId);
        const data = (await summarizePdf(file, {
          detail: preset?.detail,
          language: answerLanguage,
        })) as SummaryResult;
        const withMeta = { ...data, fileName: file.name };
        setResult(withMeta);
        const text = getSummaryTextFromResult(withMeta);
        if (text) {
          saveStoredSummary(
            file,
            text,
            withMeta.document_id ?? withMeta.documentId ?? null,
            answerLanguage,
          );
          saveWorkspaceAiAnswerLanguage(answerLanguage, locale);
        }
      } else {
        const data = await ACTION_MAP[actionType](file);
        setResult(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const summaryText = getSummaryTextFromResult(result);
  const summaryDocId =
    result && typeof result === 'object'
      ? ((result as SummaryResult).document_id ?? (result as SummaryResult).documentId ?? null)
      : null;
  const summarySourceName =
    file?.name ??
    (result && typeof result === 'object' ? (result as SummaryResult).fileName : undefined) ??
    'document';

  const handleCopySummary = useCallback(async () => {
    if (!summaryText.trim()) return;
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2000);
    } catch {
      setError(tWorkspace('aiPanel.copyFailed'));
    }
  }, [summaryText, tWorkspace]);

  const handleExportSummaryPdf = useCallback(async () => {
    if (!summaryText.trim()) return;
    setIsExportingPdf(true);
    setError(null);
    try {
      const base = summarySourceName.replace(/\.pdf$/i, '') || 'document';
      const mdFile = new File([summaryText], `${base}-summary.md`, { type: 'text/markdown' });
      const out = await markdownToPDF(mdFile, { theme: 'light', gfm: true });
      if (!out.success || !out.result) {
        throw new Error(out.error?.message ?? tWorkspace('aiPanel.exportFailed'));
      }
      const blob = Array.isArray(out.result) ? out.result[0] : out.result;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = out.filename ?? `${base}-summary.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : tWorkspace('aiPanel.exportFailed'));
    } finally {
      setIsExportingPdf(false);
    }
  }, [summarySourceName, summaryText, tWorkspace]);

  const isSummaryPage = actionType === 'summary';
  /** Có tóm tắt → thu nhỏ preview PDF, ưu tiên vùng kết quả */
  const compactPreview = isSummaryPage && Boolean(summaryText) && !loading;

  return (
    <section className="pt-28 pb-16 bg-[hsl(var(--color-muted)/0.2)] min-h-[calc(100vh-220px)]">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-[hsl(var(--color-foreground))]">{title}</h1>
          <p className="mt-2 text-[hsl(var(--color-muted-foreground))]">{description}</p>
        </div>

        <div
          className={
            isSummaryPage
              ? 'grid grid-cols-1 xl:grid-cols-[minmax(300px,380px)_1fr] gap-6 items-start'
              : 'grid grid-cols-1 lg:grid-cols-2 gap-6'
          }
        >
          <Card className="p-6 border border-[hsl(var(--color-border)/0.7)]">
            <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[hsl(var(--color-border))] p-8 cursor-pointer hover:border-[hsl(var(--color-primary)/0.5)] transition-colors">
              <Upload className="h-10 w-10 text-[hsl(var(--color-primary))]" />
              <span className="mt-3 font-medium">Upload PDF file</span>
              <span className="text-sm text-[hsl(var(--color-muted-foreground))]">
                Select one PDF for AI processing
              </span>
              <input
                type="file"
                className="hidden"
                accept=".pdf,application/pdf"
                onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
              />
            </label>

            {file && (
              <div className="mt-4 rounded-lg border border-[hsl(var(--color-border))] p-3 flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0" />
                <span className="text-sm truncate">{file.name}</span>
              </div>
            )}

            {actionType === 'summary' && (
              <div className="mt-4 space-y-2 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.2)] p-3">
                <WorkspaceAiLanguageSelect
                  compact
                  variant="light"
                  label={tWorkspace('aiPanel.answerLanguage.label')}
                  value={answerLanguage}
                  onChange={(lang) => {
                    setAnswerLanguage(lang);
                    saveWorkspaceAiAnswerLanguage(lang, locale);
                  }}
                  disabled={loading}
                />
                <p className="text-[10px] text-[hsl(var(--color-muted-foreground))] pt-0.5">
                  {tWorkspace('aiPanel.summaryDetail.label')}
                </p>
                <div className="flex gap-1">
                  {WORKSPACE_SUMMARY_DETAIL_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={loading}
                      onClick={() => setSummaryTierId(preset.id)}
                      className={`flex-1 rounded-lg py-1.5 text-[11px] font-medium border transition-all disabled:opacity-40 ${
                        summaryTierId === preset.id
                          ? 'bg-[hsl(var(--color-primary)/0.15)] border-[hsl(var(--color-primary)/0.4)] text-[hsl(var(--color-primary))]'
                          : 'border-[hsl(var(--color-border))] text-[hsl(var(--color-muted-foreground))] hover:bg-[hsl(var(--color-muted))]/50'
                      }`}
                    >
                      {preset.id === 'light' ? 'Gọn' : preset.id === 'balanced' ? 'Vừa' : 'Sâu'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button
              variant="primary"
              size="lg"
              className="mt-4 w-full"
              onClick={() => void handleRun()}
              disabled={!file || loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2 inline" /> : null}
              {loading && actionType === 'summary' ? 'Đang tóm tắt (1–2 phút)…' : actionLabel}
            </Button>

            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
            {!file && actionType === 'summary' && (
              <p className="mt-2 text-xs text-[hsl(var(--color-muted-foreground))]">
                Chọn file PDF trước khi bấm tóm tắt.
              </p>
            )}
          </Card>

          {isSummaryPage ? (
            <div className="flex flex-col gap-3 min-h-[min(68vh,680px)]">
              <Card className="p-3 border border-[hsl(var(--color-border)/0.7)] shrink-0">
                <h2 className="text-xs font-semibold text-[hsl(var(--color-foreground))] mb-1.5">
                  {tWorkspace('aiPanel.previewPdf')}
                </h2>
                {previewUrl ? (
                  <iframe
                    src={previewUrl}
                    className={`w-full rounded-md border border-[hsl(var(--color-border))] transition-[height] duration-300 ${
                      compactPreview ? 'h-52 md:h-56' : 'h-[28rem] md:h-[32rem]'
                    }`}
                    title="PDF preview"
                  />
                ) : (
                  <div
                    className={`rounded-md border border-dashed border-[hsl(var(--color-border))] flex items-center justify-center text-xs text-[hsl(var(--color-muted-foreground))] ${
                      compactPreview ? 'h-52 md:h-56' : 'h-[28rem] md:h-[32rem]'
                    }`}
                  >
                    {tWorkspace('aiPanel.noFile')}
                  </div>
                )}
              </Card>

              <Card className="p-3 md:p-4 border border-[hsl(var(--color-border)/0.7)] flex flex-col flex-1 min-h-0">
                <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2 shrink-0">
                  <h3 className="text-sm font-semibold inline-flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                    {tWorkspace('aiPanel.summaryByAi')}
                  </h3>
                  {summaryText && !loading && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleCopySummary()}
                        className="gap-1.5"
                      >
                        {copyDone ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copyDone ? tWorkspace('aiPanel.copied') : tWorkspace('aiPanel.copy')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleExportSummaryPdf()}
                        disabled={isExportingPdf}
                        className="gap-1.5"
                      >
                        {isExportingPdf ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FileDown className="h-3.5 w-3.5" />
                        )}
                        {tWorkspace('aiPanel.exportPdf')}
                      </Button>
                    </div>
                  )}
                </div>

                {restoredHint && (
                  <p className="text-[10px] text-[hsl(var(--color-primary))] mb-1 shrink-0 leading-snug">
                    {restoredHint}
                  </p>
                )}
                {summaryDocId != null && summaryText && (
                  <p className="text-[10px] text-[hsl(var(--color-muted-foreground))] mb-1.5 shrink-0">
                    {tWorkspace('aiPanel.documentId', { id: summaryDocId })}
                  </p>
                )}

                <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-[hsl(var(--color-border))] overflow-hidden bg-[hsl(var(--color-muted)/0.2)]">
                  {loading ? (
                    <div className="flex-1 flex items-center gap-2 p-4 text-xs text-[hsl(var(--color-muted-foreground))] min-h-[200px]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                      {tWorkspace('aiPanel.summarizing')}
                    </div>
                  ) : summaryText ? (
                    <div
                      className={`flex-1 overflow-auto scrollbar-thin ${
                        compactPreview ? 'p-3 min-h-[min(42vh,480px)]' : 'p-3 min-h-[200px]'
                      }`}
                    >
                      <WorkspaceAiMarkdown content={summaryText} />
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-1.5 p-6 text-center min-h-[200px]">
                      <Sparkles className="h-8 w-8 text-violet-400/35" />
                      <p className="text-xs text-[hsl(var(--color-muted-foreground))] max-w-md">
                        {tWorkspace('aiPanel.summaryPlaceholder')}
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          ) : (
            <Card className="p-6 border border-[hsl(var(--color-border)/0.7)]">
              <h2 className="text-lg font-semibold mb-3">Preview & Result</h2>
              {previewUrl ? (
                <iframe src={previewUrl} className="w-full h-64 rounded border" title="PDF preview" />
              ) : (
                <div className="h-64 rounded border flex items-center justify-center text-sm text-[hsl(var(--color-muted-foreground))]">
                  No file selected
                </div>
              )}
              <div className="mt-4">
                <h3 className="font-medium mb-2">Kết quả</h3>
                <pre className="max-h-56 overflow-auto rounded-lg bg-[hsl(var(--color-muted)/0.5)] p-3 text-xs">
                  {result ? JSON.stringify(result, null, 2) : 'Chưa có kết quả.'}
                </pre>
              </div>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}

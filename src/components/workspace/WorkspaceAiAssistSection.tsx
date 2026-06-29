'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileDown,
  Loader2,
  Send,
  Sparkles,
  User,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AiCenteredSpinner } from '@/components/ai/AiCenteredSpinner';
import { AI_UI } from '@/lib/ai-ui-classes';
import { Button } from '@/components/ui/Button';
import { WorkspaceAiLanguageSelect } from '@/components/workspace/WorkspaceAiLanguageSelect';
import { WorkspaceAiMarkdown } from '@/components/workspace/WorkspaceAiMarkdown';
import { suggestedQuestionsCacheKey, peekSuggestedQuestions, rememberSuggestedQuestions } from '@/lib/workspace-ai-suggested-questions';
import type { WorkspaceAiChatMessage } from '@/lib/workspace-ai-persistence';
import { loadPersistedSuggestedQuestions } from '@/lib/workspace-ai-persistence';
import {
  resolveWorkspaceSuggestedQuestions,
  WORKSPACE_SUMMARY_DETAIL_PRESETS,
  getWorkspaceSummaryDetailPreset,
  type WorkspacePresetTierId,
} from '@/services/workspaceAiApi';

function readCachedSuggestedQuestions(
  file: File | null,
  documentId: number | null,
  language: string,
): string[] {
  if (documentId == null) return [];
  const cacheKey = suggestedQuestionsCacheKey(documentId, language);
  const cached =
    peekSuggestedQuestions(cacheKey) ??
    (file ? loadPersistedSuggestedQuestions(file, cacheKey) : null);
  if (cached?.length) {
    rememberSuggestedQuestions(cacheKey, cached);
    return cached;
  }
  return [];
}

export type WorkspaceAiAssistSectionProps = {
  file: File | null;
  isDarkTheme: boolean;
  summaryText: string | null;
  isSummarizing: boolean;
  messages: WorkspaceAiChatMessage[];
  chatInput: string;
  onChatInputChange: (value: string) => void;
  onSendMessage: () => void;
  isAiThinking: boolean;
  chatReady: boolean;
  documentId?: number | null;
  answerLanguage: string;
  onAnswerLanguageChange: (value: string) => void;
  /** Mức độ tóm tắt & chat (3 mức, chọn một lần). */
  sessionTierId: WorkspacePresetTierId;
  onSessionTierIdChange: (value: WorkspacePresetTierId) => void;
  onRunSummary: () => void;
  onCopySummary: () => void;
  onExportSummaryPdf: () => void;
  copyDone: boolean;
  isExportingPdf: boolean;
  panelCardTone: string;
  panelSoftTone: string;
  panelTextMuted: string;
  inputTone: string;
  /** combined = workspace panel; controls = sidebar; conversation = summary + chat only */
  layout?: 'combined' | 'controls' | 'conversation';
  summaryStage?: 'extract' | 'ai' | null;
};

function SectionTitle({
  children,
  isDarkTheme,
}: {
  children: ReactNode;
  isDarkTheme: boolean;
}) {
  return (
    <h3
      className={`flex items-center gap-1.5 text-[12px] font-semibold shrink-0 ${
        isDarkTheme ? 'text-[#FF5A5F]' : 'text-[hsl(var(--color-primary))]'
      }`}
    >
      {children}
    </h3>
  );
}

export function WorkspaceAiAssistSection({
  file,
  isDarkTheme,
  summaryText,
  isSummarizing,
  messages,
  chatInput,
  onChatInputChange,
  onSendMessage,
  isAiThinking,
  chatReady,
  documentId,
  answerLanguage,
  onAnswerLanguageChange,
  sessionTierId,
  onSessionTierIdChange,
  onRunSummary,
  onCopySummary,
  onExportSummaryPdf,
  copyDone,
  isExportingPdf,
  panelCardTone,
  panelSoftTone,
  panelTextMuted,
  inputTone,
  layout = 'combined',
  summaryStage = null,
}: WorkspaceAiAssistSectionProps) {
  const t = useTranslations('workspace');
  const hasSummary = Boolean(summaryText?.trim());
  const showContent = isSummarizing || hasSummary || chatReady;
  const initialCachedQuestions = readCachedSuggestedQuestions(file, documentId ?? null, answerLanguage);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>(initialCachedQuestions);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionsReady, setSuggestionsReady] = useState(initialCachedQuestions.length > 0);
  const [controlsOpen, setControlsOpen] = useState(!hasSummary);
  // Auto-collapse when summarizing starts, re-open only if no summary yet after done
  useEffect(() => {
    if (isSummarizing) setControlsOpen(false);
  }, [isSummarizing]);
  const fetchedSuggestionsKeyRef = useRef<string | null>(
    initialCachedQuestions.length > 0 && documentId != null
      ? suggestedQuestionsCacheKey(documentId, answerLanguage)
      : null,
  );

  const needsSuggestions = chatReady && messages.length === 0 && documentId != null;
  const chatInputEnabled =
    chatReady && !isAiThinking && (messages.length > 0 || !needsSuggestions || suggestionsReady);

  useEffect(() => {
    if (
      !chatReady ||
      documentId == null ||
      messages.length > 0 ||
      isSummarizing
    ) {
      if (!chatReady || documentId == null) {
        setSuggestedQuestions([]);
        fetchedSuggestionsKeyRef.current = null;
      }
      setSuggestionsReady(true);
      return;
    }

    const cacheKey = suggestedQuestionsCacheKey(documentId, answerLanguage);
    const cached = readCachedSuggestedQuestions(file, documentId ?? null, answerLanguage);

    if (cached.length > 0) {
      setSuggestedQuestions(cached);
      fetchedSuggestionsKeyRef.current = cacheKey;
      setIsLoadingSuggestions(false);
      setSuggestionsReady(true);
      return;
    }

    if (fetchedSuggestionsKeyRef.current === cacheKey) {
      setSuggestionsReady(true);
      return;
    }

    let cancelled = false;
    fetchedSuggestionsKeyRef.current = cacheKey;
    setIsLoadingSuggestions(true);
    setSuggestionsReady(false);

    void resolveWorkspaceSuggestedQuestions({
      documentId,
      language: answerLanguage,
      file,
      detail: parseFloat(getWorkspaceSummaryDetailPreset(sessionTierId).detail),
    })
      .then((questions) => {
        if (cancelled) return;
        setSuggestedQuestions(questions);
      })
      .catch(() => {
        if (!cancelled) {
          setSuggestedQuestions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingSuggestions(false);
          setSuggestionsReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    chatReady,
    documentId,
    answerLanguage,
    messages.length,
    isSummarizing,
    file,
  ]);

  const handleSuggestedClick = (question: string) => {
    onChatInputChange(question);
  };

  const controlsPanel = (
    <div className={`shrink-0 rounded-2xl border ${panelCardTone}`}>
      {/* Header row — always visible, click to toggle */}
      <button
        type="button"
        onClick={() => setControlsOpen((v) => !v)}
        disabled={isSummarizing}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className={`h-3.5 w-3.5 shrink-0 ${isDarkTheme ? 'text-[#FF5A5F]' : 'text-[hsl(var(--color-primary))]'}`} aria-hidden />
          <span className={`text-[12px] font-semibold truncate ${isDarkTheme ? 'text-[#FF5A5F]' : 'text-[hsl(var(--color-primary))]'}`}>
            {t('aiPanel.generateSummary')}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isDarkTheme ? 'text-[#8B949E]' : 'text-[hsl(var(--color-muted-foreground))]'} ${controlsOpen ? 'rotate-180' : ''}`} aria-hidden />
        </div>
      </button>

      {controlsOpen && (
        <div className="px-4 pb-4 space-y-3 border-t border-[hsl(var(--color-border)/0.5)]">
          <div className="pt-3">
            <WorkspaceAiLanguageSelect
              compact
              variant={isDarkTheme ? 'dark' : 'light'}
              label={t('aiPanel.answerLanguage.label')}
              value={answerLanguage}
              onChange={onAnswerLanguageChange}
              disabled={isSummarizing || isAiThinking}
            />
          </div>
          {file ? (
            <div>
              <p className="text-[11px] font-medium text-[hsl(var(--color-foreground))] mb-1.5">
                {t('aiPanel.sessionTier.label')}
              </p>
              <div className="flex gap-1" role="radiogroup" aria-label={t('aiPanel.sessionTier.label')}>
                {WORKSPACE_SUMMARY_DETAIL_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={!file || isSummarizing || isAiThinking}
                    onClick={() => onSessionTierIdChange(preset.id)}
                    aria-pressed={sessionTierId === preset.id}
                    className={`flex-1 rounded-lg py-1.5 text-[11px] font-medium border transition-all disabled:opacity-40 ${
                      sessionTierId === preset.id
                        ? isDarkTheme
                          ? 'bg-[rgba(239,68,68,0.15)] border-[#EF4444]/40 text-[#FF5A5F]'
                          : 'bg-[hsl(var(--color-primary)/0.15)] border-[hsl(var(--color-primary)/0.4)] text-[hsl(var(--color-primary))]'
                        : isDarkTheme
                          ? 'border-[#2F3A4A] text-[#8B949E] hover:bg-[#1A2332]'
                          : 'border-[hsl(var(--color-border))] text-[hsl(var(--color-muted-foreground))] hover:bg-[hsl(var(--color-muted))]/50'
                    }`}
                  >
                    {t(`aiPanel.summaryDetail.${preset.id}.title`)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => { onRunSummary(); setControlsOpen(false); }}
            disabled={!file || isSummarizing}
            className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-xl text-[12px] font-semibold text-white bg-gradient-to-br from-[#EF4444] to-[#DC2626] hover:from-[#DC2626] hover:to-[#B91C1C] border border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSummarizing ? (
              <Loader2 className={`h-4 w-4 animate-spin shrink-0 ${AI_UI.spinner}`} aria-hidden />
            ) : (
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            <span>{hasSummary ? t('aiPanel.refreshSummary') : t('aiPanel.generateSummary')}</span>
          </button>
        </div>
      )}
    </div>
  );

  const conversationPanel = (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      <div className="flex-1 min-h-0 overflow-auto space-y-3 pr-1 scrollbar-thin">
        {isSummarizing ? (
          <AiCenteredSpinner className="min-h-[min(50vh,420px)]" size="h-9 w-9" />
        ) : hasSummary ? (
          <div className={`rounded-xl border overflow-hidden ${panelCardTone}`}>
            <div className="px-3.5 py-2.5 border-b border-[hsl(var(--color-border)/0.6)]">
              <SectionTitle isDarkTheme={isDarkTheme}>{t('aiPanel.summarySection')}</SectionTitle>
            </div>
            <div className="p-3.5">
              <WorkspaceAiMarkdown content={summaryText!} variant={isDarkTheme ? 'dark' : 'light'} />
            </div>
            <div className={`flex gap-2 border-t p-2 ${panelSoftTone}`}>
              <button
                type="button"
                onClick={onCopySummary}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border py-2 text-[11px] font-medium hover:border-[hsl(var(--color-primary)/0.35)] transition-all ${inputTone}`}
              >
                {copyDone ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copyDone ? t('aiPanel.copied') : t('aiPanel.copy')}
              </button>
              <button
                type="button"
                onClick={onExportSummaryPdf}
                disabled={isExportingPdf}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border py-2 text-[11px] font-medium hover:border-[hsl(var(--color-primary)/0.35)] transition-all disabled:opacity-50 ${inputTone}`}
              >
                {isExportingPdf ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileDown className="h-3.5 w-3.5" />
                )}
                {t('aiPanel.exportPdf')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 min-h-[min(50vh,420px)] p-8 text-center">
            <Sparkles className={`h-10 w-10 ${AI_UI.iconMuted}`} aria-hidden />
            <p className={`text-sm max-w-sm leading-relaxed ${panelTextMuted}`}>
              {t('aiPanel.summaryPlaceholder')}
            </p>
          </div>
        )}

        {chatReady && messages.length > 0 && (
          <>
            <SectionTitle isDarkTheme={isDarkTheme}>{t('aiPanel.chatSection')}</SectionTitle>
            <div className="space-y-3">
              {messages.map((m, idx) => {
                const isAssistant = m.role === 'assistant';
                return (
                  <div
                    key={idx}
                    className={`flex flex-col gap-1 max-w-full ${isAssistant ? 'items-start' : 'items-end ml-2'}`}
                  >
                    <div
                      className={`flex items-center gap-1.5 px-0.5 ${isAssistant ? '' : 'flex-row-reverse'}`}
                    >
                      {isAssistant ? (
                        <Sparkles
                          className={`h-3.5 w-3.5 shrink-0 ${isDarkTheme ? 'text-violet-400' : 'text-violet-600'}`}
                          aria-hidden
                        />
                      ) : (
                        <User
                          className={`h-3.5 w-3.5 shrink-0 ${isDarkTheme ? 'text-blue-300' : 'text-blue-600'}`}
                          aria-hidden
                        />
                      )}
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wide ${
                          isAssistant
                            ? isDarkTheme
                              ? 'text-violet-300/95'
                              : 'text-violet-700'
                            : isDarkTheme
                              ? 'text-blue-200/95'
                              : 'text-blue-700'
                        }`}
                      >
                        {isAssistant ? t('aiPanel.chatRoleAssistant') : t('aiPanel.chatRoleUser')}
                      </span>
                    </div>
                    <div
                      className={`w-full rounded-xl px-3 py-2.5 ${
                        isAssistant
                          ? `border ${isDarkTheme ? 'border-[hsl(var(--color-primary)/0.18)] bg-gradient-to-br from-[hsl(var(--color-primary)/0.1)] to-[#161B22]' : 'border-[#E5E7EB] bg-white'}`
                          : `bg-[hsl(var(--color-primary)/0.12)] border border-[hsl(var(--color-primary)/0.25)] ${isDarkTheme ? 'text-[#F8FAFC]' : 'text-[hsl(var(--color-foreground))]'}`
                      }`}
                    >
                      {isAssistant ? (
                        <WorkspaceAiMarkdown content={m.text} variant={isDarkTheme ? 'dark' : 'light'} />
                      ) : (
                        <p className="text-[12px] leading-relaxed">{m.text}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {chatReady && !isSummarizing && messages.length === 0 && !isLoadingSuggestions && suggestedQuestions.length > 0 && (
          <div className="space-y-1.5">
            <p className={`text-[10px] font-medium uppercase tracking-wide px-0.5 ${panelTextMuted}`}>
              {t('aiPanel.suggestedQuestions')}
            </p>
            <div className="flex flex-col gap-1.5">
              {suggestedQuestions.map((question, i) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => handleSuggestedClick(question)}
                  className={`group w-full text-left rounded-xl border px-3 py-2.5 text-[12px] leading-snug transition-all hover:border-[hsl(var(--color-primary)/0.5)] hover:bg-[hsl(var(--color-primary)/0.06)] flex items-center gap-2.5 ${inputTone}`}
                >
                  <span className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${isDarkTheme ? 'bg-[rgba(239,68,68,0.2)] text-[#FF5A5F]' : 'bg-[hsl(var(--color-primary)/0.1)] text-[hsl(var(--color-primary))]'}`}>
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate">{question}</span>
                  <ChevronRight className={`h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity ${isDarkTheme ? 'text-[#8B949E]' : 'text-[hsl(var(--color-muted-foreground))]'}`} aria-hidden />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        className={`pt-3 border-t flex items-end gap-2 shrink-0 ${isDarkTheme ? 'border-[#263241]' : 'border-[#E5E7EB]'} ${
          !chatInputEnabled ? 'pointer-events-none opacity-55' : ''
        }`}
      >
        <textarea
          value={chatInput}
          onChange={(e) => onChatInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (!chatInputEnabled) return;
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSendMessage();
            }
          }}
          rows={2}
          placeholder={
            chatReady || chatInputEnabled
              ? t('aiPanel.placeholder')
              : t('aiPanel.chatReadonlyPlaceholder')
          }
          disabled={!file || isAiThinking || !chatInputEnabled}
          className={`flex-1 min-w-0 resize-none rounded-lg border px-3 py-2 text-[12px] focus:outline-none focus:ring-2 ${AI_UI.focusRing} disabled:opacity-50 ${inputTone}`}
        />
        <Button
          size="sm"
          onClick={onSendMessage}
          disabled={!file || isAiThinking || !chatInputEnabled || !chatInput.trim()}
          className="h-[52px] px-4 text-[12px] bg-[#EF4444] hover:bg-[#DC2626] text-white border border-transparent"
          aria-label={t('aiPanel.send')}
        >
          {isAiThinking ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );

  if (layout === 'controls') {
    return <div className="flex flex-col gap-2.5">{controlsPanel}</div>;
  }

  if (layout === 'conversation') {
    return <div className="flex-1 min-h-0 flex flex-col">{conversationPanel}</div>;
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5">
      {controlsPanel}

      {showContent && conversationPanel}
    </div>
  );
}

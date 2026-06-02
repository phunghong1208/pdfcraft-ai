'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Loader2,
  Volume2,
  Play,
  Pause,
  Square,
  Sparkles,
  Copy,
  FileDown,
  Check,
} from 'lucide-react';
import { WorkspaceAiMarkdown } from '@/components/workspace/WorkspaceAiMarkdown';
import { markdownToPDF } from '@/lib/pdf/processors/markdown-to-pdf';
import { WorkspaceAIIcon } from '@/components/workspace/WorkspaceAIIcon';
import { WorkspaceAIPanelCollapseButton } from '@/components/workspace/WorkspaceAIPanelCollapseButton';
import { WorkspaceAiLanguageSelect } from '@/components/workspace/WorkspaceAiLanguageSelect';
import { useLocale, useTranslations } from 'next-intl';
import {
  loadWorkspaceAiAnswerLanguage,
  saveWorkspaceAiAnswerLanguage,
} from '@/lib/workspace-ai-language-preference';
import { Button } from '@/components/ui/Button';
import {
  chatWithWorkspaceDocument,
  summarizeWorkspaceDocument,
  isWorkspaceChatNoContextAnswer,
  WORKSPACE_CHAT_TOP_K_PRESETS,
  WORKSPACE_DEFAULT_PRESET_TIER,
  WORKSPACE_SUMMARY_DETAIL_PRESETS,
  WORKSPACE_AI_USER_KEY,
  getWorkspaceChatTopKPreset,
  getWorkspaceSummaryDetailPreset,
  getSpeechLangForWorkspaceAiAnswerLanguage,
  type WorkspacePresetTierId,
} from '@/services/workspaceAiApi';

export interface WorkspaceAIPanelProps {
  file: File | null;
  pageCount: number;
  onClose: () => void;
}

type AiTab = 'chat' | 'summary' | 'translate' | 'voice';

type ChatMessage = { role: 'user' | 'assistant'; text: string };

/** Pill chọn mức — dùng chung Tóm tắt / Chat / Tốc độ đọc */
const SEGMENT_PILL_BASE =
  'flex-1 rounded-lg py-1.5 text-[11px] font-medium transition-all disabled:opacity-40';
const segmentPillClass = (selected: boolean) =>
  selected
    ? 'bg-blue-500/20 text-blue-100 border border-blue-500/35'
    : 'bg-[#161B22] text-[#9CA3AF] border border-[#30363D] hover:bg-[#1a2332] hover:text-white/80';
const SEGMENT_LABEL_CLASS = 'text-[10px] text-[#8B949E] px-0.5';

const PANEL_BORDER = 'border-[#30363D]';
const PANEL_SURFACE = 'bg-[#161B22]';

type PersistedWorkspaceAi = {
  documentId: number;
  summaryText: string;
  summaryTierId?: WorkspacePresetTierId;
  chatTierId?: WorkspacePresetTierId;
  answerLanguage?: string;
};

const WORKSPACE_AI_STORAGE_PREFIX = 'pdfcraft-workspace-ai:';

function getWorkspaceFileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function loadPersistedWorkspaceAi(file: File): PersistedWorkspaceAi | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(WORKSPACE_AI_STORAGE_PREFIX + getWorkspaceFileKey(file));
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedWorkspaceAi;
    if (typeof data.documentId !== 'number' || Number.isNaN(data.documentId)) return null;
    if (typeof data.summaryText !== 'string' || !data.summaryText.trim()) return null;
    return data;
  } catch {
    return null;
  }
}

function savePersistedWorkspaceAi(file: File, data: PersistedWorkspaceAi): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      WORKSPACE_AI_STORAGE_PREFIX + getWorkspaceFileKey(file),
      JSON.stringify(data),
    );
  } catch {
    // ignore quota / private mode
  }
}

function clearPersistedWorkspaceAi(file: File): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(WORKSPACE_AI_STORAGE_PREFIX + getWorkspaceFileKey(file));
  } catch {
    // ignore
  }
}

type SpeechStatus = 'idle' | 'playing' | 'paused';

function useDocumentSpeech() {
  const [status, setStatus] = useState<SpeechStatus>('idle');
  const sessionRef = useRef(0);
  const fullTextRef = useRef('');
  const langRef = useRef('vi-VN');
  const charIndexRef = useRef(0);
  const rateRef = useRef(1);

  const supported =
    typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';

  useEffect(() => {
    if (!supported) return;
    const loadVoices = () => window.speechSynthesis.getVoices();
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, [supported]);

  const speakFromOffset = useCallback(
    (text: string, lang: string, rate: number, fromChar: number) => {
      if (!supported || !text.trim()) return;

      fullTextRef.current = text;
      langRef.current = lang;
      rateRef.current = rate;
      const offset = Math.max(0, Math.min(fromChar, text.length));
      charIndexRef.current = offset;
      const slice = text.slice(offset);
      if (!slice.trim()) {
        setStatus('idle');
        charIndexRef.current = text.length;
        return;
      }

      const session = ++sessionRef.current;
      window.speechSynthesis.cancel();

      window.setTimeout(() => {
        if (session !== sessionRef.current) return;

        const utterance = new SpeechSynthesisUtterance(slice);
        utterance.lang = lang;
        utterance.rate = Math.min(2, Math.max(0.5, rate));

        const voices = window.speechSynthesis.getVoices();
        const preferred =
          voices.find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase().slice(0, 2))) ??
          voices.find((v) => v.default);
        if (preferred) utterance.voice = preferred;

        utterance.onstart = () => {
          if (session !== sessionRef.current) return;
          setStatus('playing');
        };
        utterance.onboundary = (event) => {
          if (session !== sessionRef.current) return;
          if (event.charIndex >= 0) {
            charIndexRef.current = Math.min(
              offset + event.charIndex + (event.charLength ?? 0),
              text.length,
            );
          }
        };
        utterance.onend = () => {
          if (session !== sessionRef.current) return;
          charIndexRef.current = text.length;
          setStatus('idle');
        };
        utterance.onerror = (event) => {
          if (session !== sessionRef.current) return;
          if (event.error === 'interrupted' || event.error === 'canceled') return;
          setStatus('idle');
        };

        window.speechSynthesis.speak(utterance);
        setStatus('playing');
      }, 100);
    },
    [supported],
  );

  const speakFresh = useCallback(
    (text: string, lang: string, rate: number) => {
      charIndexRef.current = 0;
      speakFromOffset(text, lang, rate, 0);
    },
    [speakFromOffset],
  );

  const continueAtRate = useCallback(
    (rate: number, text?: string, lang?: string) => {
      if (text) {
        fullTextRef.current = text;
        if (lang) langRef.current = lang;
      }
      if (!fullTextRef.current) return;
      speakFromOffset(fullTextRef.current, langRef.current, rate, charIndexRef.current);
    },
    [speakFromOffset],
  );

  const stop = useCallback(() => {
    if (!supported) return;
    sessionRef.current += 1;
    window.speechSynthesis.cancel();
    charIndexRef.current = 0;
    setStatus('idle');
  }, [supported]);

  const pause = useCallback(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    if (synth.speaking && !synth.paused) {
      synth.pause();
      setStatus('paused');
    }
  }, [supported]);

  const resume = useCallback(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    if (synth.paused) {
      synth.resume();
      setStatus('playing');
      return;
    }
    if (!synth.speaking && fullTextRef.current && charIndexRef.current < fullTextRef.current.length) {
      speakFromOffset(
        fullTextRef.current,
        langRef.current,
        rateRef.current,
        charIndexRef.current,
      );
    }
  }, [speakFromOffset, supported]);

  useEffect(() => () => stop(), [stop]);

  const isPlaying = status === 'playing';
  const isPaused = status === 'paused';
  const isActive = status !== 'idle';

  return {
    supported,
    status,
    isPlaying,
    isPaused,
    isActive,
    speakFresh,
    continueAtRate,
    pause,
    resume,
    stop,
  };
}

function tierTitle(
  t: ReturnType<typeof useTranslations<'workspace'>>,
  mode: 'summaryDetail' | 'chatContext',
  id: WorkspacePresetTierId,
): string {
  if (mode === 'summaryDetail') {
    if (id === 'light') return t('aiPanel.summaryDetail.light.title');
    if (id === 'balanced') return t('aiPanel.summaryDetail.balanced.title');
    return t('aiPanel.summaryDetail.deep.title');
  }
  if (id === 'light') return t('aiPanel.chatContext.light.title');
  if (id === 'balanced') return t('aiPanel.chatContext.balanced.title');
  return t('aiPanel.chatContext.deep.title');
}

function AiSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-transparent bg-gradient-to-r from-blue-200 via-violet-200 to-fuchsia-200 bg-clip-text shrink-0">
      {children}
    </h3>
  );
}

/** Độ chi tiết — 3 pill ngang (gọn) */
function TierRadioGroup({
  mode,
  presets,
  value,
  onChange,
  disabled,
}: {
  mode: 'summaryDetail' | 'chatContext';
  presets: readonly { id: WorkspacePresetTierId }[];
  value: WorkspacePresetTierId;
  onChange: (id: WorkspacePresetTierId) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('workspace');
  const label =
    mode === 'summaryDetail' ? t('aiPanel.summaryDetail.label') : t('aiPanel.chatContext.label');

  return (
    <div className="shrink-0 min-w-0">
      <p className={`${SEGMENT_LABEL_CLASS} mb-1.5 px-0.5`}>{label}</p>
      <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
        {presets.map((preset) => {
          const selected = value === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(preset.id)}
              aria-pressed={selected}
              className={`flex-1 rounded-lg py-1.5 px-1.5 text-[10px] font-medium border transition-all disabled:opacity-40 ${
                selected
                  ? 'bg-blue-500/20 text-blue-100 border-blue-500/35'
                  : 'bg-[#0D1117] text-[#9CA3AF] border-[#30363D] hover:text-white/80 hover:border-white/15'
              }`}
            >
              {tierTitle(t, mode, preset.id)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WorkspaceAIPanel({ file, pageCount, onClose }: WorkspaceAIPanelProps) {
  const locale = useLocale();
  const t = useTranslations('workspace');
  const [aiTab, setAiTab] = useState<AiTab>('summary');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<number | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [voiceRate, setVoiceRate] = useState(1);
  const [summaryTierId, setSummaryTierId] = useState<WorkspacePresetTierId>(WORKSPACE_DEFAULT_PRESET_TIER);
  const [chatTierId, setChatTierId] = useState<WorkspacePresetTierId>(WORKSPACE_DEFAULT_PRESET_TIER);
  const [answerLanguage, setAnswerLanguage] = useState(() => loadWorkspaceAiAnswerLanguage(locale));
  const [copyDone, setCopyDone] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const speech = useDocumentSpeech();

  const summaryPreset = getWorkspaceSummaryDetailPreset(summaryTierId);
  const chatPreset = getWorkspaceChatTopKPreset(chatTierId);
  const speechLang = useMemo(
    () => getSpeechLangForWorkspaceAiAnswerLanguage(answerLanguage),
    [answerLanguage],
  );

  const voiceReady = Boolean(summaryText?.trim() && documentId != null);
  const chatReady = documentId != null && Boolean(summaryText?.trim());

  const voiceStatusLabel = useMemo(() => {
    if (!speech.supported) return t('aiPanel.voice.unsupported');
    if (speech.isPaused) return t('aiPanel.voice.statusPaused');
    if (speech.isPlaying) return t('aiPanel.voice.statusPlaying');
    return t('aiPanel.voice.statusIdle');
  }, [speech.isPaused, speech.isPlaying, speech.supported, t]);

  useEffect(() => {
    setMessages([]);
    setAiError(null);
    setAiHint(null);
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();

    if (!file) {
      setSummaryText(null);
      setDocumentId(null);
      return;
    }

    const persisted = loadPersistedWorkspaceAi(file);
    if (persisted) {
      setDocumentId(persisted.documentId);
      setSummaryText(persisted.summaryText);
      if (persisted.summaryTierId) setSummaryTierId(persisted.summaryTierId);
      if (persisted.chatTierId) setChatTierId(persisted.chatTierId);
      if (persisted.answerLanguage) setAnswerLanguage(persisted.answerLanguage);
    } else {
      setSummaryText(null);
      setDocumentId(null);
      setSummaryTierId(WORKSPACE_DEFAULT_PRESET_TIER);
      setChatTierId(WORKSPACE_DEFAULT_PRESET_TIER);
    }
  }, [file]);

  /** Mỗi lần tóm tắt xong — luôn gán document_id mới cho chat + sessionStorage */
  const commitSummaryResult = useCallback(
    (text: string, newDocumentId: number) => {
      setSummaryText(text);
      setDocumentId(newDocumentId);
      setMessages([]);
      if (file) {
        savePersistedWorkspaceAi(file, {
          documentId: newDocumentId,
          summaryText: text,
          summaryTierId,
          chatTierId,
          answerLanguage,
        });
      }
      saveWorkspaceAiAnswerLanguage(answerLanguage, locale);
    },
    [file, summaryTierId, chatTierId, answerLanguage, locale],
  );

  const runSummary = useCallback(
    async (options?: { keepTab?: boolean }) => {
      if (!file) {
        setAiError(t('aiPanel.noFile'));
        return;
      }
      if (!options?.keepTab) setAiTab('summary');
      // Chạy lại summary → bỏ document_id cũ, chat không dùng index lỗi thời
      setDocumentId(null);
      setMessages([]);
      setIsSummarizing(true);
      setAiError(null);
      setAiHint(null);
      try {
        const { text, documentId: newId } = await summarizeWorkspaceDocument(file, {
          detail: summaryPreset.detail,
          userKey: WORKSPACE_AI_USER_KEY,
          language: answerLanguage,
        });
        if (newId == null) {
          setSummaryText(text);
          setDocumentId(null);
          clearPersistedWorkspaceAi(file);
          setAiError(t('aiPanel.summaryMissingDocumentId'));
          return;
        }
        commitSummaryResult(text, newId);
        if (options?.keepTab) {
          setAiHint(t('aiPanel.chatReady'));
        } else {
          setAiHint(t('aiPanel.summaryDone'));
        }
      } catch (err) {
        setDocumentId(null);
        setAiError(err instanceof Error ? err.message : t('aiPanel.summaryError'));
      } finally {
        setIsSummarizing(false);
      }
    },
    [file, summaryPreset.detail, answerLanguage, commitSummaryResult, t],
  );

  const handleAnswerLanguageChange = useCallback(
    (language: string) => {
      setAnswerLanguage(language);
      saveWorkspaceAiAnswerLanguage(language, locale);
      const nextSpeechLang = getSpeechLangForWorkspaceAiAnswerLanguage(language);
      if (speech.isActive && summaryText?.trim()) {
        speech.continueAtRate(voiceRate, summaryText, nextSpeechLang);
      }
    },
    [locale, speech, summaryText, voiceRate],
  );

  useEffect(() => {
    setAnswerLanguage(loadWorkspaceAiAnswerLanguage(locale));
  }, [locale]);

  const handleCopySummary = useCallback(async () => {
    if (!summaryText?.trim()) return;
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2000);
    } catch {
      setAiError(t('aiPanel.copyFailed'));
    }
  }, [summaryText, t]);

  const handleExportSummaryPdf = useCallback(async () => {
    if (!summaryText?.trim() || !file) return;
    setIsExportingPdf(true);
    setAiError(null);
    try {
      const base = file.name.replace(/\.pdf$/i, '') || 'document';
      const mdFile = new File([summaryText], `${base}-summary.md`, { type: 'text/markdown' });
      const out = await markdownToPDF(mdFile, { theme: 'light', gfm: true });
      if (!out.success || !out.result) {
        throw new Error(out.error?.message ?? t('aiPanel.exportFailed'));
      }
      const blob = Array.isArray(out.result) ? out.result[0] : out.result;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = out.filename ?? `${base}-summary.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t('aiPanel.exportFailed'));
    } finally {
      setIsExportingPdf(false);
    }
  }, [file, summaryText, t]);

  const handleSendMessage = useCallback(async () => {
    const content = chatInput.trim();
    if (!content || isAiThinking) return;
    if (!file) {
      setAiError(t('aiPanel.noFile'));
      return;
    }
    if (documentId == null) {
      setAiError(t('aiPanel.noDocumentId'));
      setAiHint(t('aiPanel.runSummaryForChat'));
      return;
    }

    setMessages((prev) => [...prev, { role: 'user', text: content }]);
    setChatInput('');
    setIsAiThinking(true);
    setAiError(null);
    setAiHint(null);

    try {
      const chatOpts = {
        question: content,
        topK: chatPreset.topK,
        userKey: WORKSPACE_AI_USER_KEY,
        language: answerLanguage,
      };

      let activeDocId = documentId;
      let answer = await chatWithWorkspaceDocument({ ...chatOpts, documentId: activeDocId });

      if (isWorkspaceChatNoContextAnswer(answer) && file) {
        setAiHint(t('aiPanel.chatReindexing'));
        setDocumentId(null);
        const refreshed = await summarizeWorkspaceDocument(file, {
          detail: summaryPreset.detail,
          userKey: WORKSPACE_AI_USER_KEY,
          language: answerLanguage,
        });
        if (refreshed.documentId != null) {
          activeDocId = refreshed.documentId;
          commitSummaryResult(refreshed.text, refreshed.documentId);
          answer = await chatWithWorkspaceDocument({ ...chatOpts, documentId: activeDocId });
        } else {
          setDocumentId(null);
          clearPersistedWorkspaceAi(file);
        }
      }

      if (isWorkspaceChatNoContextAnswer(answer)) {
        setAiError(t('aiPanel.chatNoContext'));
        setAiHint(t('aiPanel.chatNoContextHint'));
      } else {
        setAiHint(null);
      }

      setMessages((prev) => [...prev, { role: 'assistant', text: answer }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('aiPanel.chatError');
      setAiError(msg);
      setMessages((prev) => [...prev, { role: 'assistant', text: msg }]);
    } finally {
      setIsAiThinking(false);
    }
  }, [
    answerLanguage,
    chatInput,
    chatPreset.topK,
    chatTierId,
    documentId,
    file,
    isAiThinking,
    summaryPreset.detail,
    summaryTierId,
    commitSummaryResult,
    t,
  ]);

  const startVoiceReading = useCallback(
    (rate: number) => {
      if (!summaryText?.trim()) {
        setAiError(t('aiPanel.voice.prepareTitle'));
        return;
      }
      if (!speech.supported) {
        setAiError(t('aiPanel.voice.unsupported'));
        return;
      }
      setAiError(null);
      speech.speakFresh(summaryText, speechLang, rate);
    },
    [summaryText, speech, speechLang, t],
  );

  const handleVoiceToggle = useCallback(() => {
    if (speech.isPaused) {
      speech.resume();
      return;
    }
    if (speech.isPlaying) {
      speech.pause();
      return;
    }
    startVoiceReading(voiceRate);
  }, [speech, startVoiceReading, voiceRate]);

  const handleVoiceSpeedChange = useCallback(
    (rate: number) => {
      setVoiceRate(rate);
      if (!speech.isActive || !summaryText?.trim()) return;
      speech.continueAtRate(rate, summaryText, speechLang);
    },
    [speech, speechLang, summaryText],
  );

  const tabs: AiTab[] = ['summary', 'chat', 'translate', 'voice'];

  return (
    <aside
      className={`relative w-[min(100%,420px)] min-w-[360px] shrink-0 flex flex-col border-l ${PANEL_BORDER} bg-[#0B0E14] shadow-[-8px_0_32px_rgba(0,0,0,0.35)]`}
      aria-label={t('aiPanel.title')}
    >
      <div className="px-4 pt-3 pb-2 border-b border-[#30363D] bg-[#0D1117] shrink-0 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <WorkspaceAIIcon size="sm" />
            <span className="text-[12px] font-semibold text-white/90">{t('aiPanel.title')}</span>
            <span className="shrink-0 rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-violet-300">
              AI
            </span>
          </div>
          <WorkspaceAIPanelCollapseButton
            onClick={onClose}
            aria-label={t('inlineTools.close')}
            title={t('inlineTools.close')}
          />
        </div>

        {file ? (
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-white/90 truncate min-w-0">
            <span className="shrink-0 opacity-80" aria-hidden>
              📄
            </span>
            <span className="truncate">{file.name}</span>
            {pageCount > 0 && (
              <span className="shrink-0 text-[10px] font-normal text-white/35">
                · {t('aiPanel.pageDocument', { count: pageCount })}
              </span>
            )}
          </p>
        ) : (
          <p className="text-[12px] text-white/40">{t('aiPanel.noFile')}</p>
        )}

        <div className="flex flex-wrap items-center gap-1 text-[11px] pb-0.5">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                speech.stop();
                setAiTab(tab);
              }}
              disabled={tab === 'translate'}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                aiTab === tab
                  ? 'text-blue-100 bg-blue-500/20 border border-blue-500/30'
                  : tab === 'translate'
                    ? 'text-[#6b7280] cursor-not-allowed'
                    : tab === 'chat' && !chatReady
                      ? 'text-[#6b7280] hover:text-[#9CA3AF]'
                      : 'text-[#9CA3AF] hover:text-white/90 hover:bg-[#161B22]'
              }`}
              aria-disabled={tab === 'chat' && !chatReady ? true : undefined}
              title={tab === 'chat' && !chatReady ? t('aiPanel.runSummaryForChat') : undefined}
            >
              {t(`aiPanel.tabs.${tab}`)}
            </button>
          ))}
        </div>
      </div>

      {aiHint && !aiError && (
        <div className="mx-4 mb-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100/90 shrink-0">
          {aiHint}
        </div>
      )}
      {aiError && (
        <div className="mx-4 mb-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[11px] text-red-200/90 shrink-0">
          {aiError}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col px-4 pt-3 pb-4">
        {aiTab === 'summary' && (
          <div className="flex-1 min-h-0 flex flex-col gap-2.5">
            <div className="shrink-0 rounded-xl border border-[#30363D]/90 bg-[#161B22]/70 px-3.5 py-3.5 space-y-3">
              <WorkspaceAiLanguageSelect
                compact
                label={t('aiPanel.answerLanguage.label')}
                value={answerLanguage}
                onChange={handleAnswerLanguageChange}
                disabled={isSummarizing}
              />
              <TierRadioGroup
                mode="summaryDetail"
                presets={WORKSPACE_SUMMARY_DETAIL_PRESETS}
                value={summaryTierId}
                onChange={setSummaryTierId}
                disabled={isSummarizing}
              />
              <Button
                size="sm"
                onClick={() => void runSummary()}
                disabled={!file || isSummarizing}
                className="w-full h-8 text-[11px] font-semibold bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:via-indigo-500 hover:to-violet-500"
              >
                {isSummarizing ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t('aiPanel.analyzing')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    {t('aiPanel.generateSummary')}
                  </span>
                )}
              </Button>
            </div>

            <div className="flex-1 min-h-0 flex flex-col gap-1.5">
              <AiSectionTitle>{t('aiPanel.summaryByAi')}</AiSectionTitle>

              <div
                className={`flex-1 min-h-0 flex flex-col rounded-xl border overflow-hidden ${
                  summaryText
                    ? 'border-violet-500/20 bg-gradient-to-b from-violet-500/[0.06] to-[#161B22]'
                    : `border-dashed ${PANEL_BORDER} ${PANEL_SURFACE}`
                }`}
              >
                {summaryText ? (
                  <>
                    <div className="flex-1 overflow-auto p-3.5 scrollbar-thin">
                      <WorkspaceAiMarkdown content={summaryText} />
                    </div>
                    <div className="flex gap-2 border-t border-[#30363D] p-2 shrink-0 bg-[#0D1117]/80">
                      <button
                        type="button"
                        onClick={() => void handleCopySummary()}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#30363D] bg-[#161B22] py-2 text-[11px] font-medium text-white/80 hover:border-blue-500/30 hover:text-white transition-all"
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
                        onClick={() => void handleExportSummaryPdf()}
                        disabled={isExportingPdf}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#30363D] bg-[#161B22] py-2 text-[11px] font-medium text-white/80 hover:border-violet-500/30 hover:text-white transition-all disabled:opacity-50"
                      >
                        {isExportingPdf ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FileDown className="h-3.5 w-3.5" />
                        )}
                        {t('aiPanel.exportPdf')}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-[120px] text-center gap-2">
                    <Sparkles className="h-8 w-8 text-violet-400/40" />
                    <p className="text-[11px] text-[#8B949E] max-w-[240px] leading-relaxed">
                      {t('aiPanel.summaryPlaceholder')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {aiTab === 'chat' && (
          <div
            className={`flex-1 min-h-0 flex flex-col gap-2 ${!chatReady ? 'opacity-95' : ''}`}
            aria-readonly={!chatReady}
          >
            <div className="shrink-0 rounded-xl border border-[#30363D]/90 bg-[#161B22]/70 px-3.5 py-3.5 space-y-3">
              <WorkspaceAiLanguageSelect
                compact
                label={t('aiPanel.answerLanguage.label')}
                value={answerLanguage}
                onChange={handleAnswerLanguageChange}
                disabled={isAiThinking}
              />
              {chatReady && (
                <TierRadioGroup
                  mode="chatContext"
                  presets={WORKSPACE_CHAT_TOP_K_PRESETS}
                  value={chatTierId}
                  onChange={setChatTierId}
                  disabled={isAiThinking}
                />
              )}
            </div>

            <AiSectionTitle>{t('aiPanel.askDocument')}</AiSectionTitle>

            <div className="flex-1 overflow-auto space-y-3 pr-1 min-h-0">
              {!chatReady && (
                <div className={`rounded-xl border ${PANEL_BORDER} ${PANEL_SURFACE} p-3 space-y-2.5`}>
                  <p className="text-[11px] leading-relaxed text-[#9CA3AF]">{t('aiPanel.runSummaryForChat')}</p>
                  <Button
                    size="sm"
                    onClick={() => setAiTab('summary')}
                    disabled={!file || isSummarizing}
                    className="w-full h-9 text-[12px] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500"
                  >
                    {t('aiPanel.goToSummaryTab')}
                  </Button>
                </div>
              )}
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl px-3 py-2.5 ${
                    m.role === 'assistant'
                      ? `border border-violet-500/15 bg-gradient-to-br from-violet-500/[0.08] to-[#161B22]`
                      : 'bg-blue-500/12 border border-blue-500/25 text-blue-100 ml-3'
                  }`}
                >
                  {m.role === 'assistant' ? (
                    <WorkspaceAiMarkdown content={m.text} />
                  ) : (
                    <p className="text-[12px] leading-relaxed">{m.text}</p>
                  )}
                </div>
              ))}
            </div>
            <div
              className={`pt-3 border-t border-[#30363D] flex items-end gap-2 shrink-0 ${!chatReady ? 'pointer-events-none opacity-60' : ''}`}
            >
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (!chatReady) return;
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendMessage();
                  }
                }}
                rows={2}
                readOnly={!chatReady}
                placeholder={
                  chatReady ? t('aiPanel.placeholder') : t('aiPanel.chatReadonlyPlaceholder')
                }
                disabled={!file || isAiThinking}
                className="flex-1 min-w-0 resize-none rounded-lg border border-[#30363D] bg-[#0D1117] px-3 py-2 text-[12px] text-white/90 placeholder:text-[#6b7280] focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 read-only:cursor-not-allowed"
              />
              <Button
                size="sm"
                onClick={() => void handleSendMessage()}
                disabled={!chatReady || !file || isAiThinking || !chatInput.trim()}
                className="h-[52px] px-4 text-[12px] bg-blue-600 hover:bg-blue-500"
              >
                {isAiThinking ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-label={t('aiPanel.thinking')} />
                ) : (
                  t('aiPanel.send')
                )}
              </Button>
            </div>
          </div>
        )}

        {aiTab === 'voice' && (
          <div className="flex-1 min-h-0 flex flex-col gap-2.5">
            <div className="shrink-0 rounded-xl border border-[#30363D]/90 bg-[#161B22]/70 px-3.5 py-3">
              <WorkspaceAiLanguageSelect
                compact
                label={t('aiPanel.answerLanguage.label')}
                value={answerLanguage}
                onChange={handleAnswerLanguageChange}
                disabled={speech.isPlaying && !speech.isPaused}
              />
            </div>
            {!voiceReady ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-2 gap-4">
                <div className="h-20 w-20 rounded-full bg-gradient-to-br from-pink-500/25 to-violet-500/15 ring-1 ring-pink-400/30 flex items-center justify-center">
                  <Volume2 className="h-9 w-9 text-pink-300/90" />
                </div>
                <div className="space-y-1.5 max-w-[280px]">
                  <p className="text-[13px] font-medium text-white/90">{t('aiPanel.voice.prepareTitle')}</p>
                  <p className="text-[11px] text-white/45 leading-relaxed">{t('aiPanel.voice.prepareHint')}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => void runSummary({ keepTab: true })}
                  disabled={!file || isSummarizing}
                  className="h-10 px-5 text-[12px] bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500"
                >
                  {isSummarizing ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t('aiPanel.summarizing')}
                    </span>
                  ) : (
                    t('aiPanel.voice.prepareButton')
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col gap-4">
                <div className="rounded-2xl border border-pink-500/20 bg-gradient-to-b from-pink-500/[0.12] to-transparent p-5 flex flex-col items-center gap-4">
                  <div
                    className={`flex items-end justify-center gap-1 h-10 ${
                      speech.isPlaying ? '' : 'opacity-30'
                    }`}
                    aria-hidden
                  >
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className={`w-1 rounded-full bg-pink-400/80 ${
                          speech.isPlaying ? 'h-6 animate-pulse' : 'h-2'
                        }`}
                        style={
                          speech.isPlaying ? { animationDelay: `${i * 0.12}s` } : undefined
                        }
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleVoiceToggle}
                    disabled={!speech.supported}
                    className="h-[72px] w-[72px] rounded-full bg-gradient-to-br from-pink-500 to-rose-600 shadow-lg shadow-pink-500/30 ring-4 ring-pink-400/20 flex items-center justify-center text-white hover:scale-[1.03] active:scale-[0.98] transition-transform disabled:opacity-40"
                    aria-label={
                      speech.isPlaying
                        ? t('aiPanel.voice.pause')
                        : speech.isPaused
                          ? t('aiPanel.voice.resume')
                          : t('aiPanel.voice.play')
                    }
                  >
                    {speech.isPlaying ? (
                      <Pause className="h-8 w-8" />
                    ) : (
                      <Play className="h-8 w-8 ml-0.5" />
                    )}
                  </button>

                  <div className="text-center space-y-1 min-w-0 w-full">
                    <p className="text-[12px] font-medium text-pink-100/95">{voiceStatusLabel}</p>
                    {file && speech.isActive && (
                      <p className="text-[10px] text-white/40 truncate px-2">
                        {t('aiPanel.voice.nowReading', { name: file.name })}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className={SEGMENT_LABEL_CLASS}>{t('aiPanel.voice.speed')}</p>
                  <div className="flex gap-1.5" role="radiogroup" aria-label={t('aiPanel.voice.speed')}>
                    {([0.85, 1, 1.15, 1.3] as const).map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => handleVoiceSpeedChange(rate)}
                        aria-pressed={voiceRate === rate}
                        className={`${SEGMENT_PILL_BASE} ${segmentPillClass(voiceRate === rate)}`}
                      >
                        {rate}×
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={speech.stop}
                  disabled={!speech.isActive}
                  className="w-full h-9 text-[12px]"
                >
                  <Square className="h-3.5 w-3.5 mr-1.5" />
                  {t('aiPanel.voice.stop')}
                </Button>
              </div>
            )}
          </div>
        )}

        {aiTab === 'translate' && (
          <p className="text-[12px] text-white/40 text-center py-8">{t('aiPanel.translateComingSoon')}</p>
        )}
      </div>
    </aside>
  );
}

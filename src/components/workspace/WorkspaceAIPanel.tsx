'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, X, Loader2, FileText, Volume2, Play, Pause, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import {
  chatWithWorkspaceDocument,
  summarizeWorkspaceDocument,
  WORKSPACE_CHAT_TOP_K_PRESETS,
  WORKSPACE_DEFAULT_PRESET_TIER,
  WORKSPACE_SUMMARY_DETAIL_PRESETS,
  WORKSPACE_AI_USER_KEY,
  getWorkspaceChatTopKPreset,
  getWorkspaceSummaryDetailPreset,
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
    ? 'bg-pink-500/25 text-pink-100 ring-1 ring-pink-400/40'
    : 'bg-white/[0.04] text-white/50 hover:bg-white/[0.08]';
const SEGMENT_LABEL_CLASS = 'text-[10px] text-white/45 px-0.5';

type PersistedWorkspaceAi = {
  documentId: number;
  summaryText: string;
  summaryTierId?: WorkspacePresetTierId;
  chatTierId?: WorkspacePresetTierId;
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

/** Giống hàng chọn tốc độ tab Đọc file — chỉ label ngắn + 3 nút */
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
    <div className="shrink-0 space-y-1.5 min-w-0">
      <p className={SEGMENT_LABEL_CLASS}>{label}</p>
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
              className={`${SEGMENT_PILL_BASE} ${segmentPillClass(selected)}`}
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
  const t = useTranslations('workspace');
  const [aiTab, setAiTab] = useState<AiTab>('chat');
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
  const speech = useDocumentSpeech();
  const summaryPreset = getWorkspaceSummaryDetailPreset(summaryTierId);
  const chatPreset = getWorkspaceChatTopKPreset(chatTierId);

  const voiceReady = Boolean(summaryText?.trim() && documentId != null);

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
    } else {
      setSummaryText(null);
      setDocumentId(null);
      setSummaryTierId(WORKSPACE_DEFAULT_PRESET_TIER);
      setChatTierId(WORKSPACE_DEFAULT_PRESET_TIER);
    }
  }, [file]);

  const runSummary = useCallback(
    async (options?: { keepTab?: boolean }) => {
      if (!file) {
        setAiError(t('aiPanel.noFile'));
        return;
      }
      if (!options?.keepTab) setAiTab('summary');
      setIsSummarizing(true);
      setAiError(null);
      setAiHint(null);
      try {
        const { text, documentId: newId } = await summarizeWorkspaceDocument(file, {
          detail: summaryPreset.detail,
          userKey: WORKSPACE_AI_USER_KEY,
        });
        setSummaryText(text);
        if (newId == null) {
          setAiError(t('aiPanel.summaryMissingDocumentId'));
          return;
        }
        setDocumentId(newId);
        savePersistedWorkspaceAi(file, {
          documentId: newId,
          summaryText: text,
          summaryTierId,
          chatTierId,
        });
        if (options?.keepTab) {
          setAiHint(t('aiPanel.chatReady'));
        }
      } catch (err) {
        setAiError(err instanceof Error ? err.message : t('aiPanel.summaryError'));
      } finally {
        setIsSummarizing(false);
      }
    },
    [file, summaryPreset.detail, summaryTierId, chatTierId, t],
  );

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
      const answer = await chatWithWorkspaceDocument({
        question: content,
        documentId,
        topK: chatPreset.topK,
        userKey: WORKSPACE_AI_USER_KEY,
      });
      setMessages((prev) => [...prev, { role: 'assistant', text: answer }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('aiPanel.chatError');
      setAiError(msg);
      setMessages((prev) => [...prev, { role: 'assistant', text: msg }]);
    } finally {
      setIsAiThinking(false);
    }
  }, [chatInput, chatPreset.topK, documentId, file, isAiThinking, t]);

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
      speech.speakFresh(summaryText, 'vi-VN', rate);
    },
    [summaryText, speech, t],
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
      speech.continueAtRate(rate, summaryText, 'vi-VN');
    },
    [speech, summaryText],
  );

  const tabs: AiTab[] = ['chat', 'summary', 'translate', 'voice'];

  return (
    <aside
      className="relative w-[min(100%,420px)] min-w-[360px] shrink-0 flex flex-col border-l border-blue-500/25 bg-gradient-to-b from-[#1a1f2e] to-[#16181d] shadow-[-12px_0_40px_rgba(59,130,246,0.08)]"
      aria-label={t('aiPanel.title')}
    >
      <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-blue-400/50 via-violet-400/30 to-transparent pointer-events-none" />

      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-blue-500/15 bg-blue-500/[0.06] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/30 to-violet-500/20 ring-1 ring-blue-400/30">
            <Sparkles className="h-4 w-4 text-blue-300" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-white truncate">{t('aiPanel.title')}</span>
              <span className="shrink-0 rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-300">
                {t('aiPanel.newBadge')}
              </span>
            </div>
            {file && (
              <p className="text-[10px] text-white/40 truncate mt-0.5">{file.name}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-white/40 hover:text-white/80 hover:bg-white/[0.08] transition-all shrink-0"
          aria-label={t('inlineTools.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 py-2.5 border-b border-white/[0.06] shrink-0">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
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
                  ? 'text-blue-200 bg-blue-500/20 ring-1 ring-blue-400/25'
                  : tab === 'translate'
                    ? 'text-white/25 cursor-not-allowed'
                    : 'text-white/50 hover:text-white/85 hover:bg-white/[0.05]'
              }`}
            >
              {t(`aiPanel.tabs.${tab}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-3 shrink-0">
        <div className="rounded-xl border border-blue-500/15 bg-blue-500/[0.04] p-3">
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 text-blue-400/80 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-wide text-blue-300/70">
                {t('aiPanel.detected')}
              </div>
              <div className="mt-1 text-[12px] text-white/80">
                {pageCount > 0 ? t('aiPanel.pageDocument', { count: pageCount }) : t('aiPanel.documentLoaded')}
              </div>
              {isSummarizing && (
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-blue-300/90">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('aiPanel.summarizing')}
                </div>
              )}
              {documentId != null && !isSummarizing && (
                <div className="mt-1 text-[10px] text-white/35">
                  {t('aiPanel.documentId', { id: documentId })}
                </div>
              )}
            </div>
          </div>
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

      <div className="flex-1 min-h-0 flex flex-col px-4 pb-4">
        {aiTab === 'summary' && (
          <div className="flex-1 min-h-0 flex flex-col gap-2">
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
              className="w-full h-9 text-[12px] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500"
            >
              {isSummarizing ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('aiPanel.thinking')}
                </span>
              ) : (
                t('aiPanel.generateSummary')
              )}
            </Button>
            <div className="flex-1 overflow-auto rounded-xl border border-white/[0.08] bg-black/20 p-3">
              {summaryText ? (
                <p className="text-[12px] leading-relaxed text-white/75 whitespace-pre-wrap">{summaryText}</p>
              ) : (
                <p className="text-[11px] text-white/35">{t('aiPanel.summaryPlaceholder')}</p>
              )}
            </div>
          </div>
        )}

        {aiTab === 'chat' && (
          <>
            {documentId != null && (
              <TierRadioGroup
                mode="chatContext"
                presets={WORKSPACE_CHAT_TOP_K_PRESETS}
                value={chatTierId}
                onChange={setChatTierId}
                disabled={isAiThinking}
              />
            )}
            <div className="flex-1 overflow-auto space-y-3 pr-1 min-h-0 mt-2">
              {documentId == null && (
                <div className="rounded-xl border border-blue-500/25 bg-blue-500/[0.08] p-3 space-y-2.5">
                  <p className="text-[11px] leading-relaxed text-white/60">{t('aiPanel.runSummaryForChat')}</p>
                  <Button
                    size="sm"
                    onClick={() => void runSummary({ keepTab: true })}
                    disabled={!file || isSummarizing}
                    className="w-full h-9 text-[12px] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500"
                  >
                    {isSummarizing ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t('aiPanel.summarizing')}
                      </span>
                    ) : (
                      t('aiPanel.startSummaryForChat')
                    )}
                  </Button>
                </div>
              )}
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg px-3 py-2 text-[12px] leading-relaxed ${
                    m.role === 'assistant'
                      ? 'bg-white/[0.04] border border-white/[0.06] text-white/75'
                      : 'bg-blue-500/15 border border-blue-400/20 text-blue-100 ml-4'
                  }`}
                >
                  {m.text}
                </div>
              ))}
              {isAiThinking && (
                <div className="flex items-center gap-2 text-[11px] text-blue-300/90 px-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('aiPanel.thinking')}
                </div>
              )}
            </div>
            <div className="pt-3 border-t border-white/[0.08] flex items-end gap-2 shrink-0">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendMessage();
                  }
                }}
                rows={2}
                placeholder={t('aiPanel.placeholder')}
                disabled={!file || documentId == null || isAiThinking}
                className="flex-1 min-w-0 resize-none rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/35 disabled:opacity-50"
              />
              <Button
                size="sm"
                onClick={() => void handleSendMessage()}
                disabled={!file || documentId == null || isAiThinking || !chatInput.trim()}
                className="h-[52px] px-4 text-[12px] bg-blue-600 hover:bg-blue-500"
              >
                {t('aiPanel.send')}
              </Button>
            </div>
          </>
        )}

        {aiTab === 'voice' && (
          <div className="flex-1 min-h-0 flex flex-col">
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

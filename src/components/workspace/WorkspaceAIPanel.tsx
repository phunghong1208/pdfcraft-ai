'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
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
  User,
  FileText,
  ArrowLeftRight,
  Languages,
  ScanLine,
  AlignLeft,
  FileOutput,
  ChevronRight,
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
import { AiCenteredSpinner } from '@/components/ai/AiCenteredSpinner';
import { AI_UI } from '@/lib/ai-ui-classes';
import { useDocumentSpeech } from '@/lib/hooks/useDocumentSpeech';
import { isPdfNoExtractableTextError, buildPdfSpeechIndex } from '@/lib/pdf/extract-pdf-text';
import type { PdfSpeechSegment } from '@/lib/pdf/extract-pdf-text';
import {
  applyReadAlongHighlight,
  clearReadAlongHighlight,
} from '@/lib/pdf/pdf-read-along-highlight';
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
import {
  clearPersistedWorkspaceAi,
  loadPersistedWorkspaceAi,
  savePersistedWorkspaceAi,
  type WorkspaceAiChatMessage,
} from '@/lib/workspace-ai-persistence';
import {
  getDefaultTranslateLanguagePair,
  TRANSLATE_LANGUAGE_OPTIONS,
} from '@/services/translateDocsApi';
import {
  runWorkspaceTranslatePipeline,
  type TranslatePipelineProgress,
} from '@/services/workspaceTranslatePipeline';

export interface WorkspaceAIPanelProps {
  file: File | null;
  pageCount: number;
  onClose: () => void;
  /** iframe pdf.js bên trái — dùng bôi vàng read-along khi đọc */
  pdfViewerIframeRef?: RefObject<HTMLIFrameElement | null>;
  /** Áp PDF dịch vào workspace */
  onTranslatedFile?: (file: File) => void;
}

type AiTab = 'chat' | 'summary' | 'translate' | 'voice';

/** Pill chọn mức — dùng chung Tóm tắt / Chat / Tốc độ đọc */
const SEGMENT_PILL_BASE =
  'flex-1 rounded-lg py-1.5 text-[11px] font-medium transition-all disabled:opacity-40';
const segmentPillClass = (selected: boolean, isDarkTheme: boolean) =>
  selected
    ? `border border-[hsl(var(--color-primary)/0.4)] bg-[hsl(var(--color-primary)/0.14)] ${
        isDarkTheme ? 'text-white border-[#EF4444] bg-[rgba(239,68,68,0.18)]' : 'text-[hsl(var(--color-primary))]'
      }`
    : `border ${isDarkTheme ? 'border-[#2F3A4A] bg-[#0F141B] text-[#CBD5E1] hover:bg-[#141C26] hover:text-[#E2E8F0]' : 'border-[#DCE1E7] bg-white text-[hsl(var(--color-muted-foreground))] hover:bg-[#F2F4F7] hover:text-[hsl(var(--color-foreground))]'}`;
const segmentLabelClass = (isDarkTheme: boolean) =>
  `text-[11px] px-0.5 ${isDarkTheme ? 'text-[#8B949E]' : 'text-[hsl(var(--color-muted-foreground))]'}`;

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
    <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-[hsl(var(--color-primary))] shrink-0">
      {children}
    </h3>
  );
}

const TRANSLATE_PIPELINE_TILES = [
  { id: 'pdf', icon: FileText },
  { id: 'ocr', icon: ScanLine },
  { id: 'text', icon: AlignLeft },
  { id: 'ai', icon: Languages },
  { id: 'output', icon: FileOutput },
] as const;

function activeTranslateTileIndex(
  progress: TranslatePipelineProgress | null,
  isTranslating: boolean,
): number {
  if (!isTranslating || !progress) return -1;
  switch (progress.stage) {
    case 'check':
      return 1;
    case 'ocr':
      return 1;
    case 'translate':
      return 3;
    case 'pdf':
      return 4;
    case 'done':
      return 5;
    default:
      return -1;
  }
}

function TranslatePipelineTiles({
  progress,
  isTranslating,
  hasResult,
  isDarkTheme,
  t,
}: {
  progress: TranslatePipelineProgress | null;
  isTranslating: boolean;
  hasResult: boolean;
  isDarkTheme: boolean;
  t: ReturnType<typeof useTranslations<'workspace'>>;
}) {
  const activeIdx = activeTranslateTileIndex(progress, isTranslating);

  return (
    <div className="flex items-center gap-0.5 min-w-0" aria-label={t('aiPanel.translate.run')}>
      {TRANSLATE_PIPELINE_TILES.map((tile, index) => {
        const Icon = tile.icon;
        const isDone = hasResult || (activeIdx >= 0 && index < activeIdx);
        const isActive = isTranslating && index === activeIdx;
        const isIdle = !isDone && !isActive;

        return (
          <div key={tile.id} className="flex items-center gap-0.5 min-w-0 flex-1">
            <div
              className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2 min-w-0 flex-1 transition-all ${
                isActive
                  ? isDarkTheme
                    ? 'border-[#EF4444] bg-[rgba(239,68,68,0.15)] text-white'
                    : 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary)/0.12)] text-[hsl(var(--color-primary))]'
                  : isDone
                    ? isDarkTheme
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-emerald-500/35 bg-emerald-50 text-emerald-700'
                    : isDarkTheme
                      ? 'border-[#2F3A4A] bg-[#0F141B] text-[#64748B]'
                      : 'border-[#E2E8F0] bg-white text-[#94A3B8]'
              }`}
            >
              <div className="relative">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${isIdle ? 'opacity-60' : ''}`} aria-hidden />
                {isDone && !isActive && (
                  <Check className="absolute -bottom-1 -right-1.5 h-2.5 w-2.5 text-emerald-500" aria-hidden />
                )}
              </div>
              <span className="text-[8px] font-medium leading-tight text-center truncate w-full px-0.5">
                {t(`aiPanel.translate.tiles.${tile.id}`)}
              </span>
            </div>
            {index < TRANSLATE_PIPELINE_TILES.length - 1 && (
              <ChevronRight
                className={`h-3 w-3 shrink-0 ${isDarkTheme ? 'text-[#475569]' : 'text-[#CBD5E1]'}`}
                aria-hidden
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Độ chi tiết — 3 pill ngang (gọn) */
function TierRadioGroup({
  mode,
  presets,
  value,
  onChange,
  disabled,
  isDarkTheme,
}: {
  mode: 'summaryDetail' | 'chatContext';
  presets: readonly { id: WorkspacePresetTierId }[];
  value: WorkspacePresetTierId;
  onChange: (id: WorkspacePresetTierId) => void;
  disabled?: boolean;
  isDarkTheme: boolean;
}) {
  const t = useTranslations('workspace');
  const label =
    mode === 'summaryDetail' ? t('aiPanel.summaryDetail.label') : t('aiPanel.chatContext.label');

  return (
    <div className="shrink-0 min-w-0">
      <p className={`${segmentLabelClass(isDarkTheme)} mb-1.5 px-0.5`}>{label}</p>
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
              className={`flex-1 rounded-lg py-1.5 px-1.5 text-[11px] font-medium border transition-all disabled:opacity-40 ${
                selected
                  ? `${isDarkTheme ? 'text-white border-[#EF4444] bg-[rgba(239,68,68,0.18)]' : 'text-[hsl(var(--color-foreground))] border-[hsl(var(--color-primary)/0.35)] bg-[hsl(var(--color-primary)/0.18)]'}`
                  : `${isDarkTheme ? 'bg-[#0F141B] text-[#CBD5E1] border-[#2F3A4A] hover:text-[#F8FAFC] hover:border-[#EF4444]' : 'bg-white text-[hsl(var(--color-muted-foreground))] border-[#DCE1E7] hover:text-[hsl(var(--color-foreground))] hover:border-[hsl(var(--color-primary)/0.35)]'}`
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

export function WorkspaceAIPanel({ file, pageCount, onClose, pdfViewerIframeRef, onTranslatedFile }: WorkspaceAIPanelProps) {
  const locale = useLocale();
  const t = useTranslations('workspace');
  const defaultLangPair = useMemo(() => getDefaultTranslateLanguagePair(locale), [locale]);
  const [aiTab, setAiTab] = useState<AiTab>('summary');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<WorkspaceAiChatMessage[]>([]);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<number | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [voiceRate, setVoiceRate] = useState(1);
  const [voiceText, setVoiceText] = useState<string | null>(null);
  const [isPreparingVoice, setIsPreparingVoice] = useState(false);
  const [summaryTierId, setSummaryTierId] = useState<WorkspacePresetTierId>(WORKSPACE_DEFAULT_PRESET_TIER);
  const [chatTierId, setChatTierId] = useState<WorkspacePresetTierId>(WORKSPACE_DEFAULT_PRESET_TIER);
  const [answerLanguage, setAnswerLanguage] = useState(() => loadWorkspaceAiAnswerLanguage(locale));
  const [copyDone, setCopyDone] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [sourceLang, setSourceLang] = useState(defaultLangPair.source);
  const [targetLang, setTargetLang] = useState(defaultLangPair.target);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState<TranslatePipelineProgress | null>(null);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translatedPdfBlob, setTranslatedPdfBlob] = useState<Blob | null>(null);
  const [translatedPdfName, setTranslatedPdfName] = useState<string | null>(null);
  const [translateCopyDone, setTranslateCopyDone] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return true;
    try {
      const savedTheme = window.localStorage.getItem('theme');
      // Default to light unless user explicitly chose dark.
      return savedTheme === 'dark';
    } catch {
      // ignore localStorage access errors
    }
    return false;
  });
  const voiceSegmentsRef = useRef<PdfSpeechSegment[]>([]);
  const pdfViewerIframeRefStable = pdfViewerIframeRef;

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const syncTheme = () => {
      try {
        const savedTheme = window.localStorage.getItem('theme');
        // Default to light unless user explicitly chose dark.
        setIsDarkTheme(savedTheme === 'dark');
        return;
      } catch {
        // ignore localStorage access errors
      }
      setIsDarkTheme(false);
    };

    syncTheme();
    window.addEventListener('storage', syncTheme);
    window.addEventListener('pdfcraft-theme-changed', syncTheme as EventListener);
    return () => {
      window.removeEventListener('storage', syncTheme);
      window.removeEventListener('pdfcraft-theme-changed', syncTheme as EventListener);
    };
  }, []);

  const speech = useDocumentSpeech({
    onBoundary: ({ charIndex, charLength }) => {
      const iframe = pdfViewerIframeRefStable?.current ?? null;
      if (charLength === 0) {
        clearReadAlongHighlight(iframe);
        return;
      }
      if (!voiceSegmentsRef.current.length) return;
      applyReadAlongHighlight(iframe, voiceSegmentsRef.current, charIndex, charLength);
    },
  });

  const summaryPreset = getWorkspaceSummaryDetailPreset(summaryTierId);
  const chatPreset = getWorkspaceChatTopKPreset(chatTierId);
  const speechLang = useMemo(
    () => getSpeechLangForWorkspaceAiAnswerLanguage(answerLanguage),
    [answerLanguage],
  );

  const voiceReady = Boolean(voiceText?.trim());
  const chatReady = documentId != null && Boolean(summaryText?.trim());

  const voiceStatusLabel = useMemo(() => {
    if (!speech.supported) return t('aiPanel.voice.unsupported');
    if (speech.isPaused) return t('aiPanel.voice.statusPaused');
    if (speech.isPlaying) return t('aiPanel.voice.statusPlaying');
    return t('aiPanel.voice.statusIdle');
  }, [speech.isPaused, speech.isPlaying, speech.supported, t]);

  useEffect(() => {
    setAiError(null);
    setAiHint(null);
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    voiceSegmentsRef.current = [];
    clearReadAlongHighlight(pdfViewerIframeRef?.current ?? null);

    if (!file) {
      setMessages([]);
      setSummaryText(null);
      setDocumentId(null);
      setVoiceText(null);
      return;
    }

    setVoiceText(null);
    setTranslatedText(null);
    setTranslatedPdfBlob(null);
    setTranslatedPdfName(null);
    setTranslateProgress(null);
    setSourceLang(defaultLangPair.source);
    setTargetLang(defaultLangPair.target);

    const persisted = loadPersistedWorkspaceAi(file);
    if (persisted) {
      setDocumentId(persisted.documentId);
      setSummaryText(persisted.summaryText);
      setMessages(persisted.messages ?? []);
      if (persisted.summaryTierId) setSummaryTierId(persisted.summaryTierId);
      if (persisted.chatTierId) setChatTierId(persisted.chatTierId);
      if (persisted.answerLanguage) setAnswerLanguage(persisted.answerLanguage);
      if (persisted.aiTab) setAiTab(persisted.aiTab);
    } else {
      setMessages([]);
      setSummaryText(null);
      setDocumentId(null);
      setSummaryTierId(WORKSPACE_DEFAULT_PRESET_TIER);
      setChatTierId(WORKSPACE_DEFAULT_PRESET_TIER);
    }
  }, [file, pdfViewerIframeRef, defaultLangPair.source, defaultLangPair.target]);

  useEffect(() => {
    if (!file || documentId == null || !summaryText?.trim()) return;
    savePersistedWorkspaceAi(file, {
      documentId,
      summaryText,
      summaryTierId,
      chatTierId,
      answerLanguage,
      messages,
      aiTab,
    });
  }, [file, documentId, summaryText, summaryTierId, chatTierId, answerLanguage, messages, aiTab]);

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
          messages: [],
          aiTab,
        });
      }
      saveWorkspaceAiAnswerLanguage(answerLanguage, locale);
    },
    [file, summaryTierId, chatTierId, answerLanguage, aiTab, locale],
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

  const prepareVoiceText = useCallback(async () => {
    if (!file) return;
    setIsPreparingVoice(true);
    setAiError(null);
    setAiHint(null);
    speech.stop();
    setVoiceText(null);
    voiceSegmentsRef.current = [];
    clearReadAlongHighlight(pdfViewerIframeRef?.current ?? null);

    try {
      const { text, segments } = await buildPdfSpeechIndex(file);
      if (text.trim()) {
        voiceSegmentsRef.current = segments;
        setVoiceText(text);
        return;
      }

      const { text: apiText } = await summarizeWorkspaceDocument(file, {
        detail: summaryPreset.detail,
        userKey: WORKSPACE_AI_USER_KEY,
        language: answerLanguage,
      });
      if (apiText.trim()) {
        voiceSegmentsRef.current = [];
        setVoiceText(apiText);
        setAiHint(t('aiVoicePage.fallbackReadHint'));
        return;
      }
      setAiError(t('aiVoicePage.noExtractableText'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (isPdfNoExtractableTextError(msg)) {
        try {
          const { text: retryText, segments } = await buildPdfSpeechIndex(file);
          if (retryText.trim()) {
            voiceSegmentsRef.current = segments;
            setVoiceText(retryText);
            return;
          }
        } catch {
          // ignore
        }
        setAiError(t('aiVoicePage.noExtractableText'));
        return;
      }
      setAiError(msg || t('aiPanel.summaryError'));
    } finally {
      setIsPreparingVoice(false);
    }
  }, [file, summaryPreset.detail, answerLanguage, pdfViewerIframeRef, speech, t]);

  useEffect(() => {
    if (aiTab !== 'voice' || !file || voiceReady || isPreparingVoice) return;
    void prepareVoiceText();
  }, [aiTab, file, voiceReady, isPreparingVoice, prepareVoiceText]);

  const handleAnswerLanguageChange = useCallback(
    (language: string) => {
      setAnswerLanguage(language);
      saveWorkspaceAiAnswerLanguage(language, locale);
      const nextSpeechLang = getSpeechLangForWorkspaceAiAnswerLanguage(language);
      if ((speech.isActive || speech.isSynthSpeaking()) && voiceText?.trim()) {
        speech.continueAtRate(voiceRate, voiceText, nextSpeechLang);
      }
    },
    [locale, speech, voiceText, voiceRate],
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
      if (!voiceText?.trim()) {
        setAiError(t('aiVoicePage.noExtractableText'));
        return;
      }
      if (!speech.supported) {
        setAiError(t('aiPanel.voice.unsupported'));
        return;
      }
      setAiError(null);
      speech.speakFresh(voiceText, speechLang, rate);
    },
    [voiceText, speech, speechLang, t],
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
      if (!voiceText?.trim()) return;
      if (!(speech.isActive || speech.isSynthSpeaking())) return;
      speech.continueAtRate(rate, voiceText, speechLang);
    },
    [speech, speechLang, voiceText],
  );

  const runTranslate = useCallback(async () => {
    if (!file) {
      setAiError(t('aiPanel.noFile'));
      return;
    }
    setIsTranslating(true);
    setAiError(null);
    setAiHint(null);
    setTranslateProgress(null);
    setTranslatedText(null);
    setTranslatedPdfBlob(null);
    setTranslatedPdfName(null);
    try {
      const result = await runWorkspaceTranslatePipeline({
        file,
        sourceLang,
        targetLang,
        onProgress: setTranslateProgress,
      });
      setTranslatedText(result.translatedText);
      setTranslatedPdfBlob(result.pdfBlob);
      setTranslatedPdfName(result.pdfFileName);
      if (result.ocrApplied) {
        setAiHint(t('aiPanel.translate.ocrApplied'));
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t('aiPanel.translate.error'));
    } finally {
      setIsTranslating(false);
      setTranslateProgress(null);
    }
  }, [file, sourceLang, targetLang, t]);

  const handleCopyTranslated = useCallback(async () => {
    if (!translatedText?.trim()) return;
    try {
      await navigator.clipboard.writeText(translatedText);
      setTranslateCopyDone(true);
      window.setTimeout(() => setTranslateCopyDone(false), 2000);
    } catch {
      setAiError(t('aiPanel.copyFailed'));
    }
  }, [translatedText, t]);

  const handleDownloadTranslatedPdf = useCallback(() => {
    if (!translatedPdfBlob) return;
    const url = URL.createObjectURL(translatedPdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = translatedPdfName || 'translated.pdf';
    a.click();
    URL.revokeObjectURL(url);
  }, [translatedPdfBlob, translatedPdfName]);

  const handleApplyTranslatedToWorkspace = useCallback(() => {
    if (!translatedPdfBlob || !onTranslatedFile) return;
    const next = new File(
      [translatedPdfBlob],
      translatedPdfName || 'translated.pdf',
      { type: 'application/pdf' },
    );
    onTranslatedFile(next);
    setAiHint(t('aiPanel.translate.applied'));
  }, [translatedPdfBlob, translatedPdfName, onTranslatedFile, t]);

  const translateProgressLabel = useMemo(() => {
    if (!translateProgress) return null;
    const { stage } = translateProgress;
    if (stage === 'check') return t('aiPanel.translate.stageCheck');
    if (stage === 'ocr') return t('aiPanel.translate.stageOcr');
    if (stage === 'translate') return t('aiPanel.translate.stageTranslate');
    if (stage === 'pdf') return t('aiPanel.translate.stagePdf');
    return t('aiPanel.translate.stageDone');
  }, [translateProgress, t]);

  const tabs: AiTab[] = ['summary', 'chat', 'translate', 'voice'];
  const panelRootTone = isDarkTheme
    ? 'bg-[#0B1118] border-[#263241] shadow-[-8px_0_32px_rgba(0,0,0,0.35)]'
    : 'bg-[#F3F5F8] border-[#DDE3EA] shadow-[-4px_0_16px_rgba(15,23,42,0.06)]';
  const panelHeaderTone = isDarkTheme
    ? 'bg-[#0B1118] border-[#263241]'
    : 'bg-[#F8FAFC] border-[#DDE3EA]';
  const panelTextMain = isDarkTheme ? 'text-white/90' : 'text-[hsl(var(--color-foreground))]';
  const panelTextMuted = isDarkTheme ? 'text-[#94A3B8]' : 'text-[#6B7280]';
  const panelCardTone = isDarkTheme
    ? 'border-[#263241] bg-[#111820]'
    : 'border-[#E2E8F0] bg-[#F9FAFB]';
  const panelSoftTone = isDarkTheme ? 'bg-[#111820] border-[#263241]' : 'bg-[#EEF2F6] border-[#E2E8F0]';
  const inputTone = isDarkTheme
    ? 'border-[#263241] bg-[#0F141B] text-[#F8FAFC] placeholder:text-[#94A3B8]'
    : 'border-[#E5E7EB] bg-white text-[hsl(var(--color-foreground))] placeholder:text-[hsl(var(--color-muted-foreground))]';
  const hintTone = isDarkTheme
    ? 'border-amber-500/30 bg-amber-500/10 text-amber-100/90'
    : 'border-[#F8D8A8] bg-[#FFF7ED] text-[#B45309]';
  const errorTone = isDarkTheme
    ? 'border-red-500/25 bg-red-500/10 text-red-200/90'
    : 'border-[#FBCACA] bg-[#FFF1F2] text-[#B91C1C]';

  return (
    <aside
      className={`relative w-[min(100%,440px)] min-w-[380px] shrink-0 flex flex-col rounded-none overflow-hidden border-l ${panelRootTone}`}
      aria-label={t('aiPanel.title')}
    >
      <div className={`px-4 pt-3 pb-2 border-b shrink-0 space-y-2.5 ${panelHeaderTone}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <WorkspaceAIIcon size="sm" />
            <span className={`text-[12px] font-semibold ${panelTextMain}`}>{t('aiPanel.title')}</span>
            <span className="shrink-0 rounded-full bg-[hsl(var(--color-primary)/0.2)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-300">
              AI
            </span>
          </div>
          <WorkspaceAIPanelCollapseButton
            onClick={onClose}
            aria-label={t('inlineTools.close')}
            title={t('inlineTools.close')}
            theme={isDarkTheme ? 'dark' : 'light'}
          />
        </div>

        {file ? (
          <p className={`flex items-center gap-1.5 text-[13px] font-medium truncate min-w-0 ${panelTextMain}`}>
            <FileText className="shrink-0 h-3.5 w-3.5 opacity-70" aria-hidden />
            <span className="truncate">{file.name}</span>
            {pageCount > 0 && (
              <span className={`shrink-0 text-[11px] font-normal ${panelTextMuted}`}>
                · {t('aiPanel.pageDocument', { count: pageCount })}
              </span>
            )}
          </p>
        ) : (
          <p className={`text-[12px] ${panelTextMuted}`}>{t('aiPanel.noFile')}</p>
        )}

        <div className="flex flex-wrap items-center gap-1 text-[11px] pb-0.5">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                speech.stop();
                clearReadAlongHighlight(pdfViewerIframeRef?.current ?? null);
                setAiTab(tab);
              }}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                aiTab === tab
                  ? `${isDarkTheme ? 'text-white bg-[rgba(239,68,68,0.18)] border-[#EF4444]' : 'text-[hsl(var(--color-foreground))] bg-[hsl(var(--color-primary)/0.16)] border-[hsl(var(--color-primary)/0.3)]'} border`
                  : tab === 'chat' && !chatReady
                      ? 'text-[#6b7280] hover:text-[#9CA3AF]'
                      : `${isDarkTheme ? 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#111820]' : 'text-[#6B7280] hover:text-[hsl(var(--color-foreground))] hover:bg-[#EEF2F6]'}`
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
        <div className={`mx-4 mb-2 rounded-lg border px-3 py-2 text-[11px] shrink-0 ${hintTone}`}>
          {aiHint}
        </div>
      )}
      {aiError && (
        <div className={`mx-4 mb-2 rounded-lg border px-3 py-2 text-[11px] shrink-0 ${errorTone}`}>
          {aiError}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col px-4 pt-3 pb-4">
        {aiTab === 'summary' && (
          <div className="flex-1 min-h-0 flex flex-col gap-2.5">
            <div className={`shrink-0 rounded-2xl border px-4 py-4 space-y-3 ${panelCardTone}`}>
              <WorkspaceAiLanguageSelect
                compact
                variant={isDarkTheme ? 'dark' : 'light'}
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
                isDarkTheme={isDarkTheme}
              />
              <Button
                size="sm"
                onClick={() => void runSummary()}
                disabled={!file || isSummarizing}
                className="w-full h-10 text-[11px] font-semibold bg-gradient-to-br from-[#EF4444] to-[#DC2626] text-white border border-transparent rounded-xl"
              >
                {isSummarizing ? (
                  <Loader2 className={`h-4 w-4 animate-spin ${AI_UI.spinner}`} aria-hidden />
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    {t('aiPanel.generateSummary')}
                  </span>
                )}
              </Button>
            </div>

            <div className="flex-1 min-h-0 flex flex-col gap-1.5">
              <AiSectionTitle>
                <span className={isDarkTheme ? 'text-[#FF5A5F]' : 'text-[hsl(var(--color-primary))]'}>{t('aiPanel.summaryByAi')}</span>
              </AiSectionTitle>

              <div
                className={`flex-1 min-h-0 flex flex-col rounded-xl border overflow-hidden ${
                  summaryText
                    ? panelCardTone
                    : panelSoftTone
                }`}
              >
                {isSummarizing ? (
                  <AiCenteredSpinner className="min-h-[140px]" size="h-9 w-9" />
                ) : summaryText ? (
                  <>
                    <div className="flex-1 overflow-auto p-3.5 scrollbar-thin">
                      <WorkspaceAiMarkdown content={summaryText} variant={isDarkTheme ? 'dark' : 'light'} />
                    </div>
                    <div className={`flex gap-2 border-t p-2 shrink-0 ${panelSoftTone}`}>
                      <button
                        type="button"
                        onClick={() => void handleCopySummary()}
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
                        onClick={() => void handleExportSummaryPdf()}
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
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-[120px] text-center gap-2">
                    <Sparkles className={`h-8 w-8 ${AI_UI.iconMuted}`} aria-hidden />
                    <p className={`text-[11px] max-w-[240px] leading-relaxed ${panelTextMuted}`}>
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
            <div className={`shrink-0 rounded-2xl border px-4 py-4 space-y-3 ${panelCardTone}`}>
              <WorkspaceAiLanguageSelect
                compact
                variant={isDarkTheme ? 'dark' : 'light'}
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
                  isDarkTheme={isDarkTheme}
                />
              )}
            </div>

            <AiSectionTitle>{t('aiPanel.askDocument')}</AiSectionTitle>

            <div className="flex-1 overflow-auto space-y-3 pr-1 min-h-0">
              {!chatReady && (
                <div className={`rounded-xl border ${panelSoftTone} p-3 space-y-2.5`}>
                  <p className={`text-[11px] leading-relaxed ${panelTextMuted}`}>{t('aiPanel.runSummaryForChat')}</p>
                  <Button
                    size="sm"
                    onClick={() => setAiTab('summary')}
                    disabled={!file || isSummarizing}
                    className={`w-full h-9 text-[12px] ${AI_UI.gradientBtn}`}
                  >
                    {t('aiPanel.goToSummaryTab')}
                  </Button>
                </div>
              )}
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
            <div
              className={`pt-3 border-t flex items-end gap-2 shrink-0 ${isDarkTheme ? 'border-[#263241]' : 'border-[#E5E7EB]'} ${!chatReady ? 'pointer-events-none opacity-60' : ''}`}
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
                className={`flex-1 min-w-0 resize-none rounded-lg border px-3 py-2 text-[12px] focus:outline-none focus:ring-2 ${AI_UI.focusRing} disabled:opacity-50 read-only:cursor-not-allowed ${inputTone}`}
              />
              <Button
                size="sm"
                onClick={() => void handleSendMessage()}
                disabled={!chatReady || !file || isAiThinking || !chatInput.trim()}
                className="h-[52px] px-4 text-[12px] bg-[#EF4444] hover:bg-[#DC2626] text-white border border-transparent"
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
            <div className={`shrink-0 rounded-2xl border px-4 py-4 ${panelCardTone}`}>
              <WorkspaceAiLanguageSelect
                compact
                variant={isDarkTheme ? 'dark' : 'light'}
                label={t('aiPanel.answerLanguage.label')}
                value={answerLanguage}
                onChange={handleAnswerLanguageChange}
                disabled={speech.isPlaying && !speech.isPaused}
              />
            </div>
            {!file ? (
              <div className="flex-1 flex items-center justify-center px-2">
                <p className={`text-[12px] ${panelTextMuted}`}>{t('aiPanel.noFile')}</p>
              </div>
            ) : isPreparingVoice ? (
              <AiCenteredSpinner className="flex-1 min-h-[200px]" size="h-9 w-9" />
            ) : !voiceReady ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-2 gap-3">
                <div
                  className={`h-20 w-20 rounded-full flex items-center justify-center ${AI_UI.playerIconRing}`}
                >
                  <Volume2 className={`h-9 w-9 ${AI_UI.playerIcon}`} />
                </div>
                <div className="space-y-1.5 max-w-[280px]">
                  <p className={`text-[13px] font-medium ${panelTextMain}`}>{t('aiVoicePage.prepareFailedTitle')}</p>
                  <p className={`text-[11px] leading-relaxed ${panelTextMuted}`}>
                    {aiError ?? t('aiVoicePage.noExtractableText')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col gap-4">
                <div className={`rounded-2xl border p-5 flex flex-col items-center gap-4 ${AI_UI.playerShell}`}>
                  <div
                    className={`flex items-end justify-center gap-1 h-10 ${
                      speech.isPlaying ? '' : 'opacity-30'
                    }`}
                    aria-hidden
                  >
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className={`w-1 rounded-full ${AI_UI.waveBar} ${
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
                    className={`h-[72px] w-[72px] rounded-full flex items-center justify-center text-white hover:scale-[1.03] active:scale-[0.98] transition-transform disabled:opacity-40 ${AI_UI.playerBtn}`}
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
                    <p className={`text-[12px] font-medium ${AI_UI.playerStatus}`}>{voiceStatusLabel}</p>
                    {file && speech.isActive && (
                      <p className={`text-[10px] truncate px-2 ${panelTextMuted}`}>
                        {t('aiPanel.voice.nowReading', { name: file.name })}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className={segmentLabelClass(isDarkTheme)}>{t('aiPanel.voice.speed')}</p>
                  <div className="flex gap-1.5" role="radiogroup" aria-label={t('aiPanel.voice.speed')}>
                    {([0.85, 1, 1.15, 1.3] as const).map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => handleVoiceSpeedChange(rate)}
                        aria-pressed={voiceRate === rate}
                        className={`${SEGMENT_PILL_BASE} ${segmentPillClass(voiceRate === rate, isDarkTheme)}`}
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
                  disabled={!speech.isActive && !speech.isSynthSpeaking()}
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
          <div className="flex-1 min-h-0 flex flex-col gap-2.5">
            <div className={`shrink-0 rounded-2xl border px-4 py-4 space-y-3 ${panelCardTone}`}>
              <div className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <label className={`text-[11px] font-medium ${panelTextMain}`}>
                    {t('aiTranslatePage.fromLabel')}
                  </label>
                  <select
                    value={sourceLang}
                    disabled={isTranslating}
                    onChange={(e) => setSourceLang(e.target.value)}
                    className={`mt-1 w-full rounded-lg border px-2.5 py-2 text-[12px] ${inputTone}`}
                  >
                    {TRANSLATE_LANGUAGE_OPTIONS.map((lang) => (
                      <option key={`from-${lang.code}`} value={lang.code}>
                        {lang.nativeName}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={isTranslating}
                  onClick={() => {
                    setSourceLang(targetLang);
                    setTargetLang(sourceLang);
                  }}
                  className={`mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-40 ${inputTone}`}
                  aria-label={t('aiTranslatePage.swapLanguages')}
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <label className={`text-[11px] font-medium ${panelTextMain}`}>
                    {t('aiTranslatePage.toLabel')}
                  </label>
                  <select
                    value={targetLang}
                    disabled={isTranslating}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className={`mt-1 w-full rounded-lg border px-2.5 py-2 text-[12px] ${inputTone}`}
                  >
                    {TRANSLATE_LANGUAGE_OPTIONS.map((lang) => (
                      <option key={`to-${lang.code}`} value={lang.code}>
                        {lang.nativeName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <TranslatePipelineTiles
                progress={translateProgress}
                isTranslating={isTranslating}
                hasResult={Boolean(translatedText || translatedPdfBlob)}
                isDarkTheme={isDarkTheme}
                t={t}
              />
              <Button
                size="sm"
                onClick={() => void runTranslate()}
                disabled={!file || isTranslating}
                className="w-full h-10 text-[11px] font-semibold bg-gradient-to-br from-[#EF4444] to-[#DC2626] text-white border border-transparent rounded-xl"
              >
                {isTranslating ? (
                  <Loader2 className={`h-4 w-4 animate-spin ${AI_UI.spinner}`} aria-hidden />
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Languages className="h-3.5 w-3.5" />
                    {t('aiPanel.translate.run')}
                  </span>
                )}
              </Button>
              {isTranslating && translateProgressLabel && (
                <div className="space-y-1">
                  <p className={`text-[10px] ${panelTextMuted}`}>{translateProgressLabel}</p>
                  <div className={`h-1.5 rounded-full overflow-hidden ${isDarkTheme ? 'bg-[#1E293B]' : 'bg-[#E2E8F0]'}`}>
                    <div
                      className="h-full bg-[#EF4444] transition-all duration-300"
                      style={{ width: `${translateProgress?.percent ?? 0}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 flex flex-col gap-1.5">
              <AiSectionTitle>
                <span className={isDarkTheme ? 'text-[#FF5A5F]' : 'text-[hsl(var(--color-primary))]'}>
                  {t('aiTranslatePage.translatedText')}
                </span>
              </AiSectionTitle>
              <div
                className={`flex-1 min-h-0 flex flex-col rounded-xl border overflow-hidden ${
                  translatedText ? panelCardTone : panelSoftTone
                }`}
              >
                {isTranslating ? (
                  <AiCenteredSpinner className="min-h-[140px]" size="h-9 w-9" />
                ) : translatedText || translatedPdfBlob ? (
                  <>
                    {translatedText ? (
                      <div className="flex-1 overflow-auto p-3.5 scrollbar-thin">
                        <pre className={`text-[11px] whitespace-pre-wrap font-sans leading-relaxed ${panelTextMain}`}>
                          {translatedText}
                        </pre>
                      </div>
                    ) : (
                      <div className={`flex-1 flex items-center justify-center p-4 text-center text-[11px] ${panelTextMuted}`}>
                        {t('aiPanel.translate.pdfReady')}
                      </div>
                    )}
                    <div className={`flex flex-wrap gap-2 border-t p-2 shrink-0 ${panelSoftTone}`}>
                      <button
                        type="button"
                        onClick={() => void handleCopyTranslated()}
                        className={`flex-1 min-w-[88px] inline-flex items-center justify-center gap-1.5 rounded-lg border py-2 text-[11px] font-medium hover:border-[hsl(var(--color-primary)/0.35)] transition-all ${inputTone}`}
                      >
                        {translateCopyDone ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {translateCopyDone ? t('aiPanel.copied') : t('aiPanel.copy')}
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadTranslatedPdf}
                        disabled={!translatedPdfBlob}
                        className={`flex-1 min-w-[88px] inline-flex items-center justify-center gap-1.5 rounded-lg border py-2 text-[11px] font-medium hover:border-[hsl(var(--color-primary)/0.35)] transition-all disabled:opacity-50 ${inputTone}`}
                      >
                        <FileDown className="h-3.5 w-3.5" />
                        {t('aiTranslatePage.exportPdf')}
                      </button>
                      {onTranslatedFile && (
                        <button
                          type="button"
                          onClick={handleApplyTranslatedToWorkspace}
                          disabled={!translatedPdfBlob}
                          className={`w-full inline-flex items-center justify-center gap-1.5 rounded-lg border py-2 text-[11px] font-medium hover:border-[hsl(var(--color-primary)/0.35)] transition-all disabled:opacity-50 ${inputTone}`}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          {t('aiPanel.translate.applyToWorkspace')}
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-[120px] text-center gap-2">
                    <Languages className={`h-8 w-8 ${AI_UI.iconMuted}`} aria-hidden />
                    <p className={`text-[11px] max-w-[260px] leading-relaxed ${panelTextMuted}`}>
                      {t('aiTranslatePage.placeholder')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

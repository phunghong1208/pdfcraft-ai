'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  Loader2,
  Copy,
  Check,
  Download,
  Sparkles,
  Send,
  Volume2,
  Play,
  Pause,
  Square,
  ArrowLeftRight,
} from 'lucide-react';
import { AiCenteredSpinner } from '@/components/ai/AiCenteredSpinner';
import { AI_UI } from '@/lib/ai-ui-classes';
import {
  isPdfNoExtractableTextError,
  buildPdfSpeechIndex,
  type PdfSpeechSegment,
} from '@/lib/pdf/extract-pdf-text';
import {
  applyReadAlongHighlight,
  clearReadAlongHighlight,
} from '@/lib/pdf/pdf-read-along-highlight';
import { useDocumentSpeech } from '@/lib/hooks/useDocumentSpeech';
import { EditPDFTool } from '@/components/tools/edit-pdf/EditPDFTool';
import { WorkspaceAiMarkdown } from '@/components/workspace/WorkspaceAiMarkdown';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { WorkspaceAiLanguageSelect, type LanguageItem } from '@/components/workspace/WorkspaceAiLanguageSelect';
import {
  loadWorkspaceAiAnswerLanguage,
  saveWorkspaceAiAnswerLanguage,
} from '@/lib/workspace-ai-language-preference';
import {
  WORKSPACE_SUMMARY_DETAIL_PRESETS,
  WORKSPACE_CHAT_TOP_K_PRESETS,
  WORKSPACE_DEFAULT_PRESET_TIER,
  WORKSPACE_AI_USER_KEY,
  chatWithWorkspaceDocument,
  summarizeWorkspaceDocument,
  isWorkspaceChatNoContextAnswer,
  getWorkspaceChatTopKPreset,
  getWorkspaceSummaryDetailPreset,
  getSpeechLangForWorkspaceAiAnswerLanguage,
  type WorkspacePresetTierId,
} from '@/services/workspaceAiApi';
import { summarizePdf } from '@/services/aiApi';
import {
  TRANSLATE_LANGUAGE_OPTIONS,
  getDefaultTranslateLanguagePair,
  translateDocument,
  type TranslateOutputType,
} from '@/services/translateDocsApi';
import { textToPDF, type FontId } from '@/lib/pdf/processors/text-to-pdf';
import {
  getWorkspaceFileKey,
  loadPersistedWorkspaceAi,
  savePersistedWorkspaceAi,
  type WorkspaceAiChatMessage,
} from '@/lib/workspace-ai-persistence';

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

type OcrTextResult = {
  outputType: 'text';
  text: string;
  fileName?: string;
};

type OcrPdfResult = {
  outputType: 'pdf';
  fileName: string;
  size?: number;
};

type OcrResult = OcrTextResult | OcrPdfResult;

type TranslateResultMeta =
  | { outputType: TranslateOutputType; textLength: number }
  | { outputType: TranslateOutputType; fileName: string };

type AiToolResult = SummaryResult | OcrResult | TranslateResultMeta | null;

function isOcrResult(result: AiToolResult): result is OcrResult {
  return (
    result != null &&
    typeof result === 'object' &&
    'outputType' in result &&
    (result.outputType === 'text' || result.outputType === 'pdf')
  );
}

function isOcrTextResult(result: AiToolResult): result is OcrTextResult {
  return isOcrResult(result) && result.outputType === 'text';
}

const VOICE_SPEEDS = [0.85, 1, 1.15, 1.3] as const;

const OCR_LANGUAGE_ITEMS: LanguageItem[] = [
  { apiName: 'vie+eng', nativeName: 'Tiếng Việt + English' },
  { apiName: 'eng', nativeName: 'English' },
  { apiName: 'jpn+eng', nativeName: '日本語 + English' },
  { apiName: 'kor+eng', nativeName: '한국어 + English' },
  { apiName: 'chi_sim+eng', nativeName: '简体中文 + English' },
  { apiName: 'chi_tra+eng', nativeName: '繁體中文 + English' },
  { apiName: 'fra+eng', nativeName: 'Français + English' },
  { apiName: 'deu+eng', nativeName: 'Deutsch + English' },
  { apiName: 'spa+eng', nativeName: 'Español + English' },
  { apiName: 'por+eng', nativeName: 'Português + English' },
  { apiName: 'ita+eng', nativeName: 'Italiano + English' },
  { apiName: 'ind+eng', nativeName: 'Bahasa Indonesia + English' },
  { apiName: 'ron+eng', nativeName: 'Română + English' },
];

const SUMMARY_STORAGE_KEY = 'pdfcraft-ai-summary-last';
const PDF_PREVIEW_HEIGHT = 'h-[220px]';
const TRANSLATE_PREVIEW_PANEL = 'flex-1 min-h-[min(50vh,520px)] w-full';
const AI_MODEL_LABEL =
  process.env.NEXT_PUBLIC_WORKSPACE_AI_MODEL_LABEL?.trim() || 'PDFCraft Document AI';
function countSummaryWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const segments = trimmed.split(/\s+/).filter(Boolean);
  if (segments.length > 1) return segments.length;
  return Math.max(1, Math.ceil(trimmed.length / 6));
}

function formatSummaryTime(ms: number, locale: string): string {
  return new Date(ms).toLocaleTimeString(locale === 'vi' ? 'vi-VN' : undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

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

function getSummaryTextFromResult(result: AiToolResult): string {
  if (!result || typeof result !== 'object' || isOcrResult(result) || 'outputType' in result) {
    return '';
  }
  return (result.summary ?? result.markdown ?? '').trim();
}

/** Nút primary đỏ (pill) — icon Sparkles giống panel workspace */
function AiGradientButton({
  busy,
  label,
  showSparkles = true,
  disabled,
  onClick,
  className = 'mt-3 w-full',
}: {
  busy: boolean;
  label: string;
  showSparkles?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="primary"
      size="md"
      className={`${className} ${AI_UI.gradientBtn}`}
      onClick={onClick}
      disabled={disabled}
    >
      {busy ? (
        <Loader2 className={`h-5 w-5 animate-spin shrink-0 ${AI_UI.spinner}`} aria-hidden />
      ) : (
        <span className="inline-flex items-center justify-center gap-1.5">
          {showSparkles ? <Sparkles className="h-4 w-4 shrink-0" strokeWidth={2.25} /> : null}
          <span>{label}</span>
        </span>
      )}
    </Button>
  );
}

export default function AIToolPageClient({ title, description, actionLabel, actionType }: AIToolPageClientProps) {
  const locale = useLocale();
  const t = useTranslations('workspace');
  const tWorkspace = t;
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AiToolResult>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [summaryTierId, setSummaryTierId] = useState<WorkspacePresetTierId>(WORKSPACE_DEFAULT_PRESET_TIER);
  const [answerLanguage, setAnswerLanguage] = useState(() => loadWorkspaceAiAnswerLanguage(locale));
  const [restoredHint, setRestoredHint] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);
  const [summaryGeneratedAt, setSummaryGeneratedAt] = useState<number | null>(null);
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const [documentId, setDocumentId] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<WorkspaceAiChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatTierId, setChatTierId] = useState<WorkspacePresetTierId>(WORKSPACE_DEFAULT_PRESET_TIER);
  const [isPreparingChat, setIsPreparingChat] = useState(false);
  const [isChatThinking, setIsChatThinking] = useState(false);
  const [chatHint, setChatHint] = useState<string | null>(null);
  const [voiceSummaryText, setVoiceSummaryText] = useState<string | null>(null);
  const [isPreparingVoice, setIsPreparingVoice] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const [voiceRate, setVoiceRate] = useState(1);
  const defaultTranslatePair = getDefaultTranslateLanguagePair(locale);
  const [sourceLang, setSourceLang] = useState(defaultTranslatePair.source);
  const [targetLang, setTargetLang] = useState(defaultTranslatePair.target);
  const [translateOutputType, setTranslateOutputType] = useState<TranslateOutputType>('keep_layout');
  const [translatedBlob, setTranslatedBlob] = useState<Blob | null>(null);
  const [translatedFileName, setTranslatedFileName] = useState<string | null>(null);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translateCopyDone, setTranslateCopyDone] = useState(false);
  const [isExportingTranslatedPdf, setIsExportingTranslatedPdf] = useState(false);
  const [ocrResultBlob, setOcrResultBlob] = useState<Blob | null>(null);
  const [ocrResultFileName, setOcrResultFileName] = useState<string | null>(null);
  const [ocrLanguages, setOcrLanguages] = useState('vie+eng');
  const [ocrOutputType, setOcrOutputType] = useState<'pdf' | 'text'>('pdf');
  const [ocrDeskew, setOcrDeskew] = useState(true);
  const [ocrClean, setOcrClean] = useState(true);
  const [ocrRemoveBg, setOcrRemoveBg] = useState(false);
  const [ocrForceOcr, setOcrForceOcr] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrCopyDone, setOcrCopyDone] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState(false);

  const voicePdfIframeRef = useRef<HTMLIFrameElement | null>(null);
  const voiceSegmentsRef = useRef<PdfSpeechSegment[]>([]);

  const handleVoicePdfIframeRef = useCallback((iframe: HTMLIFrameElement | null) => {
    voicePdfIframeRef.current = iframe;
  }, []);

  const speech = useDocumentSpeech({
    onBoundary: ({ charIndex, charLength }) => {
      const iframe = voicePdfIframeRef.current;
      if (charLength === 0) {
        clearReadAlongHighlight(iframe);
        return;
      }
      if (!voiceSegmentsRef.current.length) return;
      applyReadAlongHighlight(iframe, voiceSegmentsRef.current, charIndex, charLength);
    },
  });

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  const translatedPreviewUrl = useMemo(
    () => (translatedBlob ? URL.createObjectURL(translatedBlob) : ''),
    [translatedBlob],
  );
  const ocrPreviewUrl = useMemo(
    () => (ocrResultBlob ? URL.createObjectURL(ocrResultBlob) : ''),
    [ocrResultBlob],
  );
  const isSmartOcrPage = actionType === 'smartOcr';
  const isSummaryPage = actionType === 'summary';
  const isChatPage = actionType === 'chat';
  const isVoicePage = actionType === 'voice';
  const isTranslatePage = actionType === 'translate';
  const isDenseAiPage = isSummaryPage || isChatPage || isVoicePage || isTranslatePage || isSmartOcrPage;
  const speechLang = useMemo(
    () => getSpeechLangForWorkspaceAiAnswerLanguage(answerLanguage),
    [answerLanguage],
  );
  const voiceReady = Boolean(voiceSummaryText?.trim());
  const chatReady = documentId != null;
  const chatPreset = getWorkspaceChatTopKPreset(chatTierId);
  const summaryPreset = getWorkspaceSummaryDetailPreset(summaryTierId);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (translatedPreviewUrl) URL.revokeObjectURL(translatedPreviewUrl);
    };
  }, [translatedPreviewUrl]);

  useEffect(() => {
    return () => {
      if (ocrPreviewUrl) URL.revokeObjectURL(ocrPreviewUrl);
    };
  }, [ocrPreviewUrl]);

  useEffect(() => {
    setAnswerLanguage(loadWorkspaceAiAnswerLanguage(locale));
  }, [locale]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncTheme = () => {
      try {
        setIsDarkTheme(window.localStorage.getItem('theme') === 'dark');
      } catch {
        setIsDarkTheme(false);
      }
    };
    syncTheme();
    window.addEventListener('storage', syncTheme);
    window.addEventListener('pdfcraft-theme-changed', syncTheme as EventListener);
    return () => {
      window.removeEventListener('storage', syncTheme);
      window.removeEventListener('pdfcraft-theme-changed', syncTheme as EventListener);
    };
  }, []);

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
    setSummaryGeneratedAt(stored.savedAt);
    setRestoredHint(
      t('aiSummaryPage.restoredFileHint', { name: stored.fileName }),
    );
  }, [actionType, t]);

  /** Khôi phục tóm tắt sau HMR / reload khi request đã lưu sessionStorage */
  useEffect(() => {
    if (actionType !== 'summary' || loading) return;
    if (getSummaryTextFromResult(result)) return;
    const stored = loadStoredSummary();
    if (!stored?.summary.trim()) return;
    setResult({
      summary: stored.summary,
      markdown: stored.summary,
      document_id: stored.documentId,
      documentId: stored.documentId,
      fileName: stored.fileName,
    });
    setSummaryGeneratedAt(stored.savedAt);
    setRestoredHint((prev) =>
      prev ??
      t('aiSummaryPage.restoredAt', { time: formatSummaryTime(stored.savedAt, locale) }),
    );
  }, [actionType, loading, result, locale, t]);

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
    setSummaryGeneratedAt(stored.savedAt);
    setRestoredHint(t('aiSummaryPage.restoredAt', { time: formatSummaryTime(stored.savedAt, locale) }));
  }, [locale, t]);

  const handleFileSelect = useCallback(
    (next: File | null) => {
      setFile(next);
      setError(null);
      setRestoredHint(null);
      setChatHint(null);
      setVoiceHint(null);
      speech.stop();
      voiceSegmentsRef.current = [];
      clearReadAlongHighlight(voicePdfIframeRef.current);
      setTranslatedBlob(null);
      setTranslatedFileName(null);
      setTranslatedText(null);
      setTranslateCopyDone(false);
      setOcrResultBlob(null);
      setOcrResultFileName(null);
      if (!next) {
        setResult(null);
        setDocumentId(null);
        setChatMessages([]);
        setVoiceSummaryText(null);
        return;
      }
      setResult(null);
      setDocumentId(null);
      setVoiceSummaryText(null);
      if (actionType === 'summary') {
        setChatMessages([]);
        restoreSummaryForFile(next);
      } else if (actionType === 'chat') {
        const stored = loadPersistedWorkspaceAi(next);
        if (stored) {
          setDocumentId(stored.documentId);
          setChatMessages(stored.messages ?? []);
          if (stored.chatTierId) setChatTierId(stored.chatTierId);
          if (stored.answerLanguage) setAnswerLanguage(stored.answerLanguage);
          setChatHint(t('aiChatPage.documentReady'));
          setRestoredHint(t('aiChatPage.restoredFileHint', { name: next.name }));
        } else {
          setChatMessages([]);
        }
      } else {
        setChatMessages([]);
      }
      if (actionType === 'voice') {
        setVoiceHint(null);
        setRestoredHint(null);
      }
    },
    [actionType, restoreSummaryForFile, speech, t],
  );

  const applyVoiceReadiness = useCallback(
    (text: string, newDocumentId: number | null, hintKey: 'fallbackReadHint' | null) => {
      setVoiceSummaryText(text);
      setDocumentId(newDocumentId);
      setError(null);
      setVoiceHint(hintKey ? t(`aiVoicePage.${hintKey}`) : null);
      saveWorkspaceAiAnswerLanguage(answerLanguage, locale);
      if (newDocumentId != null) {
        savePersistedWorkspaceAi(file!, {
          documentId: newDocumentId,
          summaryText: text,
          summaryTierId,
          answerLanguage,
        });
      }
    },
    [answerLanguage, file, locale, summaryTierId, t],
  );

  const prepareVoiceDocument = useCallback(async () => {
    if (!file) return;
    setIsPreparingVoice(true);
    setError(null);
      setVoiceHint(null);
      speech.stop();
      clearReadAlongHighlight(voicePdfIframeRef.current);
      voiceSegmentsRef.current = [];
      setVoiceSummaryText(null);
      setDocumentId(null);

    try {
      const { text, segments } = await buildPdfSpeechIndex(file);
      if (text.trim()) {
        voiceSegmentsRef.current = segments;
        applyVoiceReadiness(text, null, null);
        return;
      }

      const { text: apiText, documentId: newId } = await summarizeWorkspaceDocument(file, {
        detail: summaryPreset.detail,
        userKey: WORKSPACE_AI_USER_KEY,
        language: answerLanguage,
      });
      if (!apiText.trim()) {
        setError(t('aiVoicePage.noExtractableText'));
        return;
      }
      voiceSegmentsRef.current = [];
      applyVoiceReadiness(apiText, newId, 'fallbackReadHint');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (isPdfNoExtractableTextError(msg)) {
        try {
          const { text: retryText, segments } = await buildPdfSpeechIndex(file);
          if (retryText.trim()) {
            voiceSegmentsRef.current = segments;
            applyVoiceReadiness(retryText, null, null);
            return;
          }
        } catch {
          // ignore
        }
        setError(t('aiVoicePage.noExtractableText'));
        return;
      }
      setError(msg || t('aiPanel.summaryError'));
    } finally {
      setIsPreparingVoice(false);
    }
  }, [file, summaryPreset.detail, answerLanguage, applyVoiceReadiness, speech, t]);

  const voiceFileKey = file ? getWorkspaceFileKey(file) : '';

  useEffect(() => {
    if (!isVoicePage || !file) return;
    void prepareVoiceDocument();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chuẩn bị lại khi đổi file
  }, [isVoicePage, voiceFileKey]);

  useEffect(() => {
    if (!isChatPage || !file || documentId == null) return;
    const existing = loadPersistedWorkspaceAi(file);
    const summaryText = existing?.summaryText;
    if (!summaryText?.trim()) return;
    savePersistedWorkspaceAi(file, {
      documentId,
      summaryText,
      summaryTierId,
      chatTierId,
      answerLanguage,
      messages: chatMessages,
      aiTab: 'chat',
    });
  }, [
    isChatPage,
    file,
    documentId,
    summaryTierId,
    chatTierId,
    answerLanguage,
    chatMessages,
  ]);

  const voiceStatusLabel = useMemo(() => {
    if (!speech.supported) return t('aiPanel.voice.unsupported');
    if (speech.isPaused) return t('aiPanel.voice.statusPaused');
    if (speech.isPlaying) return t('aiPanel.voice.statusPlaying');
    return t('aiPanel.voice.statusIdle');
  }, [speech.isPaused, speech.isPlaying, speech.supported, t]);

  const startVoiceReading = useCallback(
    (rate: number) => {
      const text = voiceSummaryText?.trim();
      if (!text) {
        setError(t('aiVoicePage.noExtractableText'));
        return;
      }
      if (!speech.supported) {
        setError(t('aiPanel.voice.unsupported'));
        return;
      }
      setError(null);
      speech.speakFresh(text, speechLang, rate);
    },
    [voiceSummaryText, speech, speechLang, t],
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
      if (!voiceSummaryText?.trim()) return;
      if (!(speech.isActive || speech.isSynthSpeaking())) return;
      speech.continueAtRate(rate, voiceSummaryText, speechLang);
    },
    [speech, speechLang, voiceSummaryText],
  );

  const prepareChatDocument = useCallback(async () => {
    if (!file) return;
    setIsPreparingChat(true);
    setError(null);
    setChatHint(null);
    setDocumentId(null);
    setChatMessages([]);
    try {
      const { text, documentId: newId } = await summarizeWorkspaceDocument(file, {
        detail: summaryPreset.detail,
        userKey: WORKSPACE_AI_USER_KEY,
        language: answerLanguage,
      });
      if (newId == null) {
        setError(t('aiPanel.summaryMissingDocumentId'));
        return;
      }
      setDocumentId(newId);
      savePersistedWorkspaceAi(file, {
        documentId: newId,
        summaryText: text,
        summaryTierId,
        chatTierId,
        answerLanguage,
        messages: [],
        aiTab: 'chat',
      });
      saveWorkspaceAiAnswerLanguage(answerLanguage, locale);
      setChatHint(t('aiChatPage.documentReady'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('aiPanel.summaryError'));
    } finally {
      setIsPreparingChat(false);
    }
  }, [file, summaryPreset.detail, answerLanguage, summaryTierId, chatTierId, locale, t]);

  const handleSendChatMessage = useCallback(async () => {
    const content = chatInput.trim();
    if (!content || isChatThinking || !file) return;
    if (documentId == null) {
      setError(t('aiPanel.noDocumentId'));
      setChatHint(t('aiPanel.runSummaryForChat'));
      return;
    }

    setChatMessages((prev) => [...prev, { role: 'user', text: content }]);
    setChatInput('');
    setIsChatThinking(true);
    setError(null);
    setChatHint(null);

    try {
      const chatOpts = {
        question: content,
        topK: chatPreset.topK,
        userKey: WORKSPACE_AI_USER_KEY,
        language: answerLanguage,
      };

      let activeDocId = documentId;
      let answer = await chatWithWorkspaceDocument({ ...chatOpts, documentId: activeDocId });

      if (isWorkspaceChatNoContextAnswer(answer)) {
        setChatHint(t('aiPanel.chatReindexing'));
        setDocumentId(null);
        const refreshed = await summarizeWorkspaceDocument(file, {
          detail: summaryPreset.detail,
          userKey: WORKSPACE_AI_USER_KEY,
          language: answerLanguage,
        });
        if (refreshed.documentId != null) {
          activeDocId = refreshed.documentId;
          setDocumentId(refreshed.documentId);
          savePersistedWorkspaceAi(file, {
            documentId: refreshed.documentId,
            summaryText: refreshed.text,
            summaryTierId,
            chatTierId,
            answerLanguage,
            messages: chatMessages,
            aiTab: 'chat',
          });
          answer = await chatWithWorkspaceDocument({ ...chatOpts, documentId: activeDocId });
        }
      }

      if (isWorkspaceChatNoContextAnswer(answer)) {
        setError(t('aiPanel.chatNoContext'));
        setChatHint(t('aiPanel.chatNoContextHint'));
      }

      setChatMessages((prev) => [...prev, { role: 'assistant', text: answer }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('aiPanel.chatError');
      setError(msg);
      setChatMessages((prev) => [...prev, { role: 'assistant', text: msg }]);
    } finally {
      setIsChatThinking(false);
    }
  }, [
    chatInput,
    chatMessages,
    chatPreset.topK,
    documentId,
    file,
    isChatThinking,
    answerLanguage,
    summaryPreset.detail,
    summaryTierId,
    chatTierId,
    t,
  ]);

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
        const text = getSummaryTextFromResult(withMeta);
        if (!text) {
          throw new Error(
            'Không nhận được nội dung tóm tắt. Nếu PDF là bản scan, hãy dùng OCR thông minh trước.',
          );
        }
        const at = Date.now();
        setResult(withMeta);
        setSummaryGeneratedAt(at);
        saveStoredSummary(
          file,
          text,
          withMeta.document_id ?? withMeta.documentId ?? null,
          answerLanguage,
        );
        saveWorkspaceAiAnswerLanguage(answerLanguage, locale);
      } else if (actionType === 'translate') {
        const translated = await translateDocument(file, {
          sourceLang,
          targetLang,
          outputType: translateOutputType,
        });
        if (translated.kind === 'text') {
          setTranslatedText(translated.text);
          setTranslatedBlob(null);
          setTranslatedFileName(null);
          setResult({ outputType: translateOutputType, textLength: translated.text.length });
        } else {
          setTranslatedText(null);
          setTranslatedBlob(translated.blob);
          setTranslatedFileName(translated.fileName);
          setResult({ fileName: translated.fileName, outputType: translateOutputType });
        }
      } else if (actionType === 'smartOcr') {
        setOcrProgress(0);
        const estimatedMs = Math.max(8000, (file.size / 1024 / 1024) * 6000);
        let raf = 0;
        const start = Date.now();
        const tick = () => {
          const elapsed = Date.now() - start;
          const pct = Math.min(92, (elapsed / estimatedMs) * 90);
          setOcrProgress(Math.round(pct));
          if (pct < 92) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        try {
          const form = new FormData();
          form.append('file', file);
          form.append('languages', ocrLanguages);
          form.append('deskew', String(ocrDeskew));
          form.append('rotate_pages', 'true');
          form.append('remove_background', String(ocrRemoveBg));
          form.append('clean', String(ocrClean));
          form.append('force_ocr', String(ocrForceOcr));
          form.append('optimize', '1');
          form.append('output_format', ocrOutputType === 'text' ? 'text' : 'pdf');
          const res = await fetch('/api/ocr', { method: 'POST', body: form });
          if (!res.ok) {
            let detail = 'OCR failed.';
            try { const j = await res.json(); detail = j.detail || detail; } catch { /* */ }
            throw new Error(detail);
          }

          const baseName = file.name.replace(/\.pdf$/i, '');
          if (ocrOutputType === 'text') {
            const data = await res.json();
            const textBlob = new Blob([data.text], { type: 'text/plain' });
            setOcrResultBlob(textBlob);
            setOcrResultFileName(`${baseName}_ocr.pdf`);
            setResult({ text: data.text, fileName: data.fileName, outputType: 'text' });
          } else {
            const blob = await res.blob();
            const fileName = `${baseName}_ocr.pdf`;
            setOcrResultBlob(blob);
            setOcrResultFileName(fileName);
            setResult({ fileName, size: blob.size, outputType: 'pdf' });
          }
          setOcrProgress(100);
        } finally {
          cancelAnimationFrame(raf);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const summaryText = getSummaryTextFromResult(result);
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

  const handleDownloadSummary = useCallback(() => {
    if (!summaryText.trim()) return;
    try {
      const base = summarySourceName.replace(/\.pdf$/i, '') || 'document';
      const blob = new Blob([summaryText], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${base}-tom-tat.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('aiSummaryPage.downloadFailed'));
    }
  }, [summarySourceName, summaryText, t]);

  const translatedBaseName = useMemo(
    () => (file?.name.replace(/\.pdf$/i, '') || 'document'),
    [file?.name],
  );

  const handleDownloadTranslated = useCallback(() => {
    if (!translatedBlob) return;
    const url = URL.createObjectURL(translatedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = translatedFileName || 'translated.pdf';
    a.click();
    URL.revokeObjectURL(url);
  }, [translatedBlob, translatedFileName]);

  const handleCopyTranslated = useCallback(async () => {
    if (!translatedText?.trim()) return;
    try {
      await navigator.clipboard.writeText(translatedText);
      setTranslateCopyDone(true);
      window.setTimeout(() => setTranslateCopyDone(false), 2000);
    } catch {
      setError(t('aiPanel.copyFailed'));
    }
  }, [translatedText, t]);

  const handleDownloadTranslatedText = useCallback(() => {
    if (!translatedText?.trim() || !file) return;
    const blob = new Blob([translatedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${translatedBaseName}-translated-${targetLang}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [file, translatedBaseName, translatedText, targetLang]);

  const handleExportTranslatedPdf = useCallback(async () => {
    if (!translatedText?.trim() || !file) return;
    setIsExportingTranslatedPdf(true);
    setError(null);
    try {
      const fontByLang: Record<string, FontId> = {
        vi: 'noto-sans',
        ja: 'noto-sans-jp',
        ko: 'noto-sans-kr',
        zh: 'noto-sans-sc',
        'zh-TW': 'noto-sans-tc',
        ar: 'noto-sans-arabic',
      };
      const txtFile = new File(
        [translatedText],
        `${translatedBaseName}-translated-${targetLang}.txt`,
        { type: 'text/plain' },
      );
      const out = await textToPDF([txtFile], {
        fontId: fontByLang[targetLang] ?? 'noto-sans',
        preserveLineBreaks: true,
        wrapLines: true,
      });
      if (!out.success || !out.result) {
        throw new Error(out.error?.message ?? t('aiTranslatePage.exportPdfFailed'));
      }
      const blob = Array.isArray(out.result) ? out.result[0] : out.result;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${translatedBaseName}-translated-${targetLang}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('aiTranslatePage.exportPdfFailed'));
    } finally {
      setIsExportingTranslatedPdf(false);
    }
  }, [file, translatedBaseName, translatedText, targetLang, t]);

  const summaryWordCount = countSummaryWords(summaryText);
  const modelLabel = t('aiSummaryPage.modelLabel');

  const pickFileFromDrop = useCallback(
    (list: FileList | null) => {
      const next = list?.[0];
      if (next && (next.type === 'application/pdf' || next.name.toLowerCase().endsWith('.pdf'))) {
        handleFileSelect(next);
      }
    },
    [handleFileSelect],
  );

  return (
    <section
      className={`${
        isDenseAiPage ? 'pt-24 pb-10' : 'pt-28 pb-16'
      } bg-[hsl(var(--color-muted)/0.2)] min-h-[calc(100vh-220px)]`}
    >
      <div className="container mx-auto px-4 max-w-7xl">
        <div className={isDenseAiPage ? 'mb-4' : 'mb-6'}>
          <h1
            className={
              isDenseAiPage
                ? 'text-lg font-semibold tracking-tight text-[hsl(var(--color-foreground))]'
                : 'text-2xl md:text-3xl font-bold text-[hsl(var(--color-foreground))]'
            }
          >
            {title}
          </h1>
          <p
            className={
              isDenseAiPage
                ? 'mt-0.5 text-sm leading-snug text-[hsl(var(--color-muted-foreground))]'
                : 'mt-1.5 text-[hsl(var(--color-muted-foreground))]'
            }
          >
            {description}
          </p>
        </div>

        <div
          className={
            isDenseAiPage
              ? `grid grid-cols-1 xl:grid-cols-[minmax(300px,380px)_1fr] gap-6 ${isSummaryPage || isChatPage || isVoicePage || isTranslatePage || isSmartOcrPage ? 'items-stretch' : 'items-start'}`
              : 'grid grid-cols-1 lg:grid-cols-2 gap-6'
          }
        >
          <Card
            className={`border border-[hsl(var(--color-border)/0.7)] ${
              isDenseAiPage ? 'p-4 xl:sticky xl:top-28' : 'p-6'
            } ${isVoicePage ? 'flex flex-col min-h-[min(calc(100dvh-11rem),840px)]' : ''}`}
          >
            {isSummaryPage ? (
              <>
                <label
                  className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 cursor-pointer transition-all ${
                    uploadDragOver
                      ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary)/0.06)]'
                      : 'border-[hsl(var(--color-border))] hover:border-[hsl(var(--color-primary)/0.45)] hover:bg-[hsl(var(--color-muted)/0.25)]'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setUploadDragOver(true);
                  }}
                  onDragLeave={() => setUploadDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setUploadDragOver(false);
                    pickFileFromDrop(e.dataTransfer.files);
                  }}
                >
                  <span className="text-3xl leading-none select-none" aria-hidden>
                    📄✨
                  </span>
                  <span className="mt-3 text-[15px] font-semibold text-[hsl(var(--color-foreground))]">
                    {t('aiSummaryPage.uploadTitle')}
                  </span>
                  <span className="mt-1 text-center text-[12px] text-[hsl(var(--color-muted-foreground))] max-w-[240px] leading-snug">
                    {t('aiSummaryPage.uploadSubtitle')}
                  </span>
                  <span className="mt-3 text-[11px] font-medium text-[hsl(var(--color-primary))]">
                    {t('aiSummaryPage.uploadDropHint')}
                  </span>
                  <span className="mt-1 text-[10px] text-[hsl(var(--color-muted-foreground))]">
                    {t('aiSummaryPage.uploadFormats')}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,application/pdf"
                    onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                  />
                </label>

                {file && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.15)] px-3 py-2">
                    <FileText className="h-4 w-4 shrink-0 text-[hsl(var(--color-primary))]" />
                    <span className="text-[12px] truncate font-medium">{file.name}</span>
                  </div>
                )}

                <div className="mt-3 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.12)] p-3 space-y-3">
                  <WorkspaceAiLanguageSelect
                    compact
                    variant="light"
                    label={t('aiPanel.answerLanguage.label')}
                    value={answerLanguage}
                    onChange={(lang) => {
                      setAnswerLanguage(lang);
                      saveWorkspaceAiAnswerLanguage(lang, locale);
                    }}
                    disabled={loading}
                  />
                  <div>
                    <p className="text-[11px] font-medium text-[hsl(var(--color-foreground))] mb-1.5">
                      {t('aiPanel.summaryDetail.label')}
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
                          {t(`aiPanel.summaryDetail.${preset.id}.title`)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <AiGradientButton
                  busy={loading}
                  label={t('aiPanel.generateSummary')}
                  onClick={() => void handleRun()}
                  disabled={!file || loading}
                />

                {error && <p className="mt-2 text-[12px] text-red-500 leading-snug">{error}</p>}
                {!file && (
                  <p className="mt-2 text-[11px] text-[hsl(var(--color-muted-foreground))]">
                    {t('aiToolPage.selectFileFirst')}
                  </p>
                )}
              </>
            ) : isChatPage ? (
              <>
                <label
                  className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 cursor-pointer transition-all ${
                    uploadDragOver
                      ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary)/0.06)]'
                      : 'border-[hsl(var(--color-border))] hover:border-[hsl(var(--color-primary)/0.45)] hover:bg-[hsl(var(--color-muted)/0.25)]'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setUploadDragOver(true);
                  }}
                  onDragLeave={() => setUploadDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setUploadDragOver(false);
                    pickFileFromDrop(e.dataTransfer.files);
                  }}
                >
                  <span className="text-3xl leading-none select-none" aria-hidden>
                    📄💬
                  </span>
                  <span className="mt-3 text-[15px] font-semibold text-[hsl(var(--color-foreground))]">
                    {t('aiSummaryPage.uploadTitle')}
                  </span>
                  <span className="mt-1 text-center text-[12px] text-[hsl(var(--color-muted-foreground))] max-w-[240px] leading-snug">
                    {t('aiChatPage.uploadSubtitle')}
                  </span>
                  <span className="mt-3 text-[11px] font-medium text-[hsl(var(--color-primary))]">
                    {t('aiSummaryPage.uploadDropHint')}
                  </span>
                  <span className="mt-1 text-[10px] text-[hsl(var(--color-muted-foreground))]">
                    {t('aiSummaryPage.uploadFormats')}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,application/pdf"
                    onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                  />
                </label>

                {file && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.15)] px-3 py-2">
                    <FileText className="h-4 w-4 shrink-0 text-[hsl(var(--color-primary))]" />
                    <span className="text-[12px] truncate font-medium">{file.name}</span>
                  </div>
                )}

                <div className="mt-3 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.12)] p-3 space-y-3">
                  <WorkspaceAiLanguageSelect
                    compact
                    variant="light"
                    label={t('aiPanel.answerLanguage.label')}
                    value={answerLanguage}
                    onChange={(lang) => {
                      setAnswerLanguage(lang);
                      saveWorkspaceAiAnswerLanguage(lang, locale);
                    }}
                    disabled={isPreparingChat || isChatThinking}
                  />
                  {chatReady && (
                    <div>
                      <p className="text-[11px] font-medium text-[hsl(var(--color-foreground))] mb-1.5">
                        {t('aiPanel.chatContext.label')}
                      </p>
                      <div className="flex gap-1">
                        {WORKSPACE_CHAT_TOP_K_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            disabled={isPreparingChat || isChatThinking}
                            onClick={() => setChatTierId(preset.id)}
                            className={`flex-1 rounded-lg py-1.5 text-[11px] font-medium border transition-all disabled:opacity-40 ${
                              chatTierId === preset.id
                                ? 'bg-[hsl(var(--color-primary)/0.15)] border-[hsl(var(--color-primary)/0.4)] text-[hsl(var(--color-primary))]'
                                : 'border-[hsl(var(--color-border))] text-[hsl(var(--color-muted-foreground))] hover:bg-[hsl(var(--color-muted))]/50'
                            }`}
                          >
                            {t(`aiPanel.chatContext.${preset.id}.title`)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {!chatReady && file && (
                  <p className="mt-3 text-[11px] text-[hsl(var(--color-muted-foreground))] leading-snug">
                    {t('aiToolPage.prepareHint')}
                  </p>
                )}

                <AiGradientButton
                  busy={isPreparingChat}
                  label={
                    chatReady ? t('aiPanel.chatReady') : t('aiPanel.voice.prepareButton')
                  }
                  showSparkles={!chatReady}
                  onClick={() => void prepareChatDocument()}
                  disabled={!file || isPreparingChat || isChatThinking}
                />

                {chatHint && !error && (
                  <p className="mt-2 text-[11px] text-[hsl(var(--color-primary))] leading-snug">{chatHint}</p>
                )}
                {error && <p className="mt-2 text-[12px] text-red-500 leading-snug">{error}</p>}
                {restoredHint && (
                  <p className="mt-2 text-[11px] text-[hsl(var(--color-muted-foreground))] leading-snug">
                    {restoredHint}
                  </p>
                )}
                {!file && (
                  <p className="mt-2 text-[11px] text-[hsl(var(--color-muted-foreground))]">
                    {t('aiToolPage.selectFileFirst')}
                  </p>
                )}
              </>
            ) : isTranslatePage ? (
              <>
                <label
                  className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 cursor-pointer transition-all ${
                    uploadDragOver
                      ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary)/0.06)]'
                      : 'border-[hsl(var(--color-border))] hover:border-[hsl(var(--color-primary)/0.45)] hover:bg-[hsl(var(--color-muted)/0.25)]'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setUploadDragOver(true);
                  }}
                  onDragLeave={() => setUploadDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setUploadDragOver(false);
                    pickFileFromDrop(e.dataTransfer.files);
                  }}
                >
                  <span className="text-3xl leading-none select-none" aria-hidden>
                    📄🌐
                  </span>
                  <span className="mt-3 text-[15px] font-semibold text-[hsl(var(--color-foreground))]">
                    {t('aiTranslatePage.uploadTitle')}
                  </span>
                  <span className="mt-1 text-center text-[12px] text-[hsl(var(--color-muted-foreground))] max-w-[240px] leading-snug">
                    {t('aiTranslatePage.uploadSubtitle')}
                  </span>
                  <span className="mt-3 text-[11px] font-medium text-[hsl(var(--color-primary))]">
                    {t('aiTranslatePage.uploadDropHint')}
                  </span>
                  <span className="mt-1 text-[10px] text-[hsl(var(--color-muted-foreground))]">
                    {t('aiTranslatePage.uploadFormats')}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,application/pdf"
                    onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                  />
                </label>

                {file && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.15)] px-3 py-2">
                    <FileText className="h-4 w-4 shrink-0 text-[hsl(var(--color-primary))]" />
                    <span className="text-[12px] truncate font-medium">{file.name}</span>
                  </div>
                )}

                <div className="mt-3 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] p-3 space-y-3 shadow-sm">
                  <div className="flex items-end gap-2">
                    <div className="flex-1 min-w-0">
                      <label className="text-[11px] font-medium text-[hsl(var(--color-foreground))]">
                        {t('aiTranslatePage.fromLabel')}
                      </label>
                      <select
                        value={sourceLang}
                        disabled={loading}
                        onChange={(e) => setSourceLang(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] px-2.5 py-2 text-[12px]"
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
                      disabled={loading}
                      onClick={() => {
                        setSourceLang(targetLang);
                        setTargetLang(sourceLang);
                      }}
                      className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-border))] text-[hsl(var(--color-muted-foreground))] hover:bg-[hsl(var(--color-muted))]/50 disabled:opacity-40"
                      aria-label={t('aiTranslatePage.swapLanguages')}
                    >
                      <ArrowLeftRight className="h-4 w-4" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <label className="text-[11px] font-medium text-[hsl(var(--color-foreground))]">
                        {t('aiTranslatePage.toLabel')}
                      </label>
                      <select
                        value={targetLang}
                        disabled={loading}
                        onChange={(e) => setTargetLang(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] px-2.5 py-2 text-[12px]"
                      >
                        {TRANSLATE_LANGUAGE_OPTIONS.map((lang) => (
                          <option key={`to-${lang.code}`} value={lang.code}>
                            {lang.nativeName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-medium text-[hsl(var(--color-foreground))] mb-2">
                      {t('aiTranslatePage.outputTitle')}
                    </p>
                    <div className="space-y-2">
                      {(
                        [
                          {
                            id: 'keep_layout' as const,
                            title: t('aiTranslatePage.keepLayoutTitle'),
                            desc: t('aiTranslatePage.keepLayoutDesc'),
                          },
                          {
                            id: 'text_only' as const,
                            title: t('aiTranslatePage.textOnlyTitle'),
                            desc: t('aiTranslatePage.textOnlyDesc'),
                          },
                        ] as const
                      ).map((opt) => (
                        <label
                          key={opt.id}
                          className={`ai-choice-card${
                            translateOutputType === opt.id ? ' ai-choice-card--selected' : ''
                          }`}
                        >
                          <input
                            type="radio"
                            name="translate-output-type"
                            className="ai-choice-card__input"
                            checked={translateOutputType === opt.id}
                            disabled={loading}
                            onChange={() => setTranslateOutputType(opt.id)}
                          />
                          <span className="ai-choice-card__indicator" aria-hidden />
                          <span className="min-w-0">
                            <span className="block text-[12px] font-medium text-[hsl(var(--color-foreground))]">
                              {opt.title}
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-[hsl(var(--color-muted-foreground))]">
                              {opt.desc}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                </div>

                {loading && (
                  <p className="mt-2 text-[11px] text-[hsl(var(--color-muted-foreground))] leading-snug">
                    {t('aiTranslatePage.processingHint')}
                  </p>
                )}

                <AiGradientButton
                  busy={loading}
                  label={actionLabel}
                  onClick={() => void handleRun()}
                  disabled={!file || loading}
                />

                {error && <p className="mt-2 text-[12px] text-red-500 leading-snug">{error}</p>}
                {!file && (
                  <p className="mt-2 text-[11px] text-[hsl(var(--color-muted-foreground))]">
                    {t('aiToolPage.selectFileFirst')}
                  </p>
                )}
              </>
            ) : isVoicePage ? (
              <div className="flex flex-col gap-3 h-full min-h-0">
                <label
                  className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-3 py-4 cursor-pointer transition-all shrink-0 ${
                    uploadDragOver
                      ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary)/0.06)]'
                      : 'border-[hsl(var(--color-border))] hover:border-[hsl(var(--color-primary)/0.45)] hover:bg-[hsl(var(--color-muted)/0.25)]'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setUploadDragOver(true);
                  }}
                  onDragLeave={() => setUploadDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setUploadDragOver(false);
                    pickFileFromDrop(e.dataTransfer.files);
                  }}
                >
                  <span className="text-2xl leading-none select-none" aria-hidden>
                    📄🔊
                  </span>
                  <span className="mt-2 text-[14px] font-semibold text-[hsl(var(--color-foreground))]">
                    {t('aiSummaryPage.uploadTitle')}
                  </span>
                  <span className="mt-1 text-center text-[11px] text-[hsl(var(--color-muted-foreground))] leading-snug">
                    {t('aiVoicePage.uploadSubtitle')}
                  </span>
                  <span className="mt-2 text-[11px] font-medium text-[hsl(var(--color-primary))]">
                    {t('aiSummaryPage.uploadDropHint')}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,application/pdf"
                    onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                  />
                </label>

                {file && (
                  <div className="flex items-center gap-2 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.15)] px-3 py-2 shrink-0">
                    <FileText className="h-4 w-4 shrink-0 text-[hsl(var(--color-primary))]" />
                    <span className="text-[12px] truncate font-medium">{file.name}</span>
                  </div>
                )}

                <div
                  className={`flex-1 min-h-0 flex flex-col rounded-xl border p-3 shadow-sm ${AI_UI.cardBorder} ${AI_UI.cardBg}`}
                >
                  <WorkspaceAiLanguageSelect
                    compact
                    variant="light"
                    label={t('aiPanel.answerLanguage.label')}
                    value={answerLanguage}
                    onChange={(lang) => {
                      setAnswerLanguage(lang);
                      saveWorkspaceAiAnswerLanguage(lang, locale);
                      if ((speech.isActive || speech.isSynthSpeaking()) && voiceSummaryText?.trim()) {
                        speech.continueAtRate(
                          voiceRate,
                          voiceSummaryText,
                          getSpeechLangForWorkspaceAiAnswerLanguage(lang),
                        );
                      }
                    }}
                    disabled={isPreparingVoice || (speech.isPlaying && !speech.isPaused)}
                  />

                  <div className="my-3 border-t border-[hsl(var(--color-border)/0.55)] shrink-0" />

                  <div className="flex-1 min-h-0 flex flex-col">
                    <h3 className="text-sm font-semibold inline-flex items-center gap-1.5 text-[hsl(var(--color-foreground))] mb-2 shrink-0">
                      <Volume2 className={`h-3.5 w-3.5 ${AI_UI.icon}`} />
                      {t('aiVoicePage.listenTitle')}
                    </h3>

                    {!voiceReady ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center px-2 gap-2 min-h-[180px]">
                        {isPreparingVoice ? (
                          <AiCenteredSpinner className="flex-1 w-full" size="h-8 w-8" />
                        ) : error ? (
                          <>
                            <Volume2 className={`h-8 w-8 ${AI_UI.icon}`} />
                            <p className="text-[11px] font-medium text-red-400">{t('aiVoicePage.prepareFailedTitle')}</p>
                            <p className="text-[10px] text-red-300/90 leading-relaxed">{error}</p>
                          </>
                        ) : !file ? (
                          <p className="text-[11px] text-[hsl(var(--color-muted-foreground))] leading-relaxed">
                            {t('aiToolPage.selectFileFirst')}
                          </p>
                        ) : (
                          <AiCenteredSpinner className="flex-1 w-full" size="h-8 w-8" />
                        )}
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0 flex flex-col gap-3">
                        <div className={`rounded-xl border p-4 flex flex-col items-center gap-3 ${AI_UI.playerShell}`}>
                          <div
                            className={`flex items-end justify-center gap-1 h-8 ${
                              speech.isPlaying ? '' : 'opacity-30'
                            }`}
                            aria-hidden
                          >
                            {[0, 1, 2, 3, 4].map((i) => (
                              <span
                                key={i}
                                className={`w-1 rounded-full ${AI_UI.waveBar} ${
                                  speech.isPlaying ? 'h-5 animate-pulse' : 'h-1.5'
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
                            className={`h-14 w-14 rounded-full flex items-center justify-center text-white hover:scale-[1.03] active:scale-[0.98] transition-transform disabled:opacity-40 ${AI_UI.playerBtn}`}
                            aria-label={
                              speech.isPlaying
                                ? t('aiPanel.voice.pause')
                                : speech.isPaused
                                  ? t('aiPanel.voice.resume')
                                  : t('aiPanel.voice.play')
                            }
                          >
                            {speech.isPlaying ? (
                              <Pause className="h-6 w-6" />
                            ) : (
                              <Play className="h-6 w-6 ml-0.5" />
                            )}
                          </button>

                          <div className="text-center space-y-0.5 min-w-0 w-full">
                            <p className={`text-[11px] font-medium ${AI_UI.playerStatus}`}>
                              {voiceStatusLabel}
                            </p>
                            {file && speech.isPlaying && (
                              <p className="text-[10px] text-[hsl(var(--color-muted-foreground))] truncate px-2">
                                {t('aiPanel.voice.nowReading', { name: file.name })}
                              </p>
                            )}
                          </div>
                        </div>

                        <div>
                          <p className="text-[10px] font-medium text-[hsl(var(--color-foreground))] mb-1">
                            {t('aiPanel.voice.speed')}
                          </p>
                          <div className="flex gap-1" role="radiogroup" aria-label={t('aiPanel.voice.speed')}>
                            {VOICE_SPEEDS.map((rate) => (
                              <button
                                key={rate}
                                type="button"
                                onClick={() => handleVoiceSpeedChange(rate)}
                                aria-pressed={voiceRate === rate}
                                className={`flex-1 rounded-md py-1 text-[10px] font-medium border transition-all ${
                                  voiceRate === rate
                                    ? AI_UI.speedOn
                                    : 'border-[hsl(var(--color-border))] text-[hsl(var(--color-muted-foreground))] hover:bg-[hsl(var(--color-muted))]/50'
                                }`}
                              >
                                {rate}×
                              </button>
                            ))}
                          </div>
                        </div>

                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            speech.stop();
                            clearReadAlongHighlight(voicePdfIframeRef.current);
                          }}
                          disabled={!speech.isActive && !speech.isSynthSpeaking()}
                          className="w-full h-8 text-[11px]"
                        >
                          <Square className="h-3 w-3 mr-1" />
                          {t('aiPanel.voice.stop')}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {voiceHint && !error && (
                  <p className="text-[11px] text-[hsl(var(--color-primary))] leading-snug shrink-0">{voiceHint}</p>
                )}
                {error && !voiceReady && (
                  <p className="text-[11px] text-red-500 leading-snug shrink-0">{error}</p>
                )}
              </div>
            ) : isSmartOcrPage ? (
              <>
                <label
                  className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 cursor-pointer transition-all ${
                    uploadDragOver
                      ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary)/0.06)]'
                      : 'border-[hsl(var(--color-border))] hover:border-[hsl(var(--color-primary)/0.45)] hover:bg-[hsl(var(--color-muted)/0.25)]'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setUploadDragOver(true); }}
                  onDragLeave={() => setUploadDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setUploadDragOver(false); pickFileFromDrop(e.dataTransfer.files); }}
                >
                  <span className="text-3xl leading-none select-none" aria-hidden>📄🔍</span>
                  <span className="mt-3 text-[15px] font-semibold text-[hsl(var(--color-foreground))]">
                    {t('aiSummaryPage.uploadTitle')}
                  </span>
                  <span className="mt-1 text-center text-[12px] text-[hsl(var(--color-muted-foreground))] max-w-[240px] leading-snug">
                    {t('aiSummaryPage.uploadFormats')}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,application/pdf"
                    onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                  />
                </label>

                {file && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.15)] px-3 py-2">
                    <FileText className="h-4 w-4 shrink-0 text-[hsl(var(--color-primary))]" />
                    <span className="text-[12px] truncate font-medium">{file.name}</span>
                  </div>
                )}

                <div className="mt-3 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.12)] p-3 space-y-3">
                  <WorkspaceAiLanguageSelect
                    compact
                    variant="light"
                    label={t('tools.ocrPdf.language')}
                    value={ocrLanguages}
                    onChange={setOcrLanguages}
                    disabled={loading}
                    items={OCR_LANGUAGE_ITEMS}
                  />

                  <div>
                    <div className="flex gap-2">
                      {[
                        { id: 'pdf' as const, label: '📄 Searchable PDF' },
                        { id: 'text' as const, label: '📝 Extract Text' },
                      ].map((fmt) => (
                        <button
                          key={fmt.id}
                          type="button"
                          disabled={loading}
                          onClick={() => setOcrOutputType(fmt.id)}
                          className={`flex-1 rounded-lg py-2 text-[12px] font-medium border transition-all disabled:opacity-40 ${
                            ocrOutputType === fmt.id
                              ? 'bg-[hsl(var(--color-primary)/0.12)] border-[hsl(var(--color-primary)/0.4)] text-[hsl(var(--color-primary))]'
                              : 'border-[hsl(var(--color-border))] text-[hsl(var(--color-muted-foreground))] hover:bg-[hsl(var(--color-muted)/0.3)]'
                          }`}
                        >
                          {fmt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-auto pt-4">
                  <AiGradientButton
                    busy={loading}
                    label={actionLabel}
                    onClick={() => void handleRun()}
                    disabled={!file || loading}
                  />

                  {error && <p className="mt-2 text-[12px] text-red-500 leading-snug">{error}</p>}
                  {!file && (
                    <p className="mt-2 text-[11px] text-[hsl(var(--color-muted-foreground))]">
                      {t('aiToolPage.selectFileFirst')}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[hsl(var(--color-border))] p-8 cursor-pointer hover:border-[hsl(var(--color-primary)/0.5)] transition-colors">
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
                <Button
                  variant="primary"
                  size="lg"
                  className="mt-4 w-full"
                  onClick={() => void handleRun()}
                  disabled={!file || loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2 inline" /> : null}
                  {actionLabel}
                </Button>
                {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
              </>
            )}
          </Card>

          {isSummaryPage ? (
              <Card
                className={`p-4 border ${AI_UI.cardBorder} ${AI_UI.cardBg} flex flex-col min-h-[min(calc(100dvh-11rem),840px)] h-full shadow-sm`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2 mb-3 shrink-0">
                  <div>
                    <h3 className="text-base font-semibold text-[hsl(var(--color-foreground))]">
                      {t('aiPanel.summaryByAi')}
                    </h3>
                    {summaryText && !loading && summaryGeneratedAt && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[hsl(var(--color-muted-foreground))]">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${AI_UI.pill}`}>
                          {modelLabel}
                        </span>
                        <span>
                          {t('aiSummaryPage.generatedAt', {
                            time: formatSummaryTime(summaryGeneratedAt, locale),
                          })}
                        </span>
                        <span>·</span>
                        <span>{t('aiSummaryPage.wordCount', { count: summaryWordCount })}</span>
                      </div>
                    )}
                  </div>
                  {summaryText && !loading && (
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleCopySummary()}
                        className="gap-1.5 h-8 text-[12px]"
                      >
                        {copyDone ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copyDone ? t('aiPanel.copied') : t('aiPanel.copy')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadSummary}
                        className="gap-1.5 h-8 text-[12px]"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {t('aiSummaryPage.downloadSummary')}
                      </Button>
                    </div>
                  )}
                </div>

                {restoredHint && (
                  <p className="text-[11px] text-[hsl(var(--color-primary))] mb-2 shrink-0 leading-snug">
                    {restoredHint}
                  </p>
                )}

                <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[hsl(var(--color-border))] overflow-hidden bg-[hsl(var(--color-background))]">
                  {loading ? (
                    <AiCenteredSpinner className="min-h-[min(60vh,560px)]" size="h-9 w-9" />
                  ) : summaryText ? (
                    <div className="flex-1 overflow-auto p-4 md:p-5 scrollbar-thin min-h-[min(60vh,560px)]">
                      <WorkspaceAiMarkdown content={summaryText} variant="light" />
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8 text-center min-h-[min(55vh,480px)]">
                      <Sparkles className={`h-10 w-10 ${AI_UI.iconMuted}`} />
                      <p className="text-sm text-[hsl(var(--color-muted-foreground))] max-w-sm leading-relaxed">
                        {t('aiPanel.summaryPlaceholder')}
                      </p>
                    </div>
                  )}
                </div>
              </Card>
          ) : isChatPage ? (
              <Card
                className={`p-4 border ${AI_UI.cardBorder} ${AI_UI.cardBg} flex flex-col min-h-[min(calc(100dvh-11rem),840px)] h-full shadow-sm`}
              >
                <h3 className="text-base font-semibold text-[hsl(var(--color-foreground))] mb-3 shrink-0">
                  {t('aiPanel.askDocument')}
                </h3>

                <div
                  className={`flex-1 min-h-0 flex flex-col rounded-xl border border-[hsl(var(--color-border))] overflow-hidden bg-[hsl(var(--color-background))] ${
                    !chatReady ? 'opacity-95' : ''
                  }`}
                >
                  <div className="flex-1 min-h-0 flex flex-col">
                    {isPreparingChat ? (
                      <AiCenteredSpinner className="flex-1" size="h-9 w-9" />
                    ) : (
                      <div className="flex-1 overflow-auto p-3 space-y-2.5 scrollbar-thin">
                        {!chatReady && (
                          <div className="rounded-lg border border-dashed border-[hsl(var(--color-border))] p-4 text-center">
                            <p className="text-[12px] text-[hsl(var(--color-muted-foreground))] leading-relaxed">
                              {t('aiPanel.runSummaryForChat')}
                            </p>
                          </div>
                        )}
                        {chatMessages.map((m, idx) => (
                      <div
                        key={idx}
                        className={`rounded-xl px-3 py-2.5 ${
                          m.role === 'assistant'
                            ? AI_UI.assistantBubble
                            : AI_UI.userBubble
                        }`}
                      >
                        {m.role === 'assistant' ? (
                          <WorkspaceAiMarkdown content={m.text} variant="light" />
                        ) : (
                          <p className="text-[12px] leading-relaxed">{m.text}</p>
                        )}
                      </div>
                        ))}
                        {isChatThinking && (
                          <div className="flex justify-center py-6">
                            <Loader2 className={`h-6 w-6 animate-spin ${AI_UI.spinner}`} aria-hidden />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div
                    className={`p-3 border-t border-[hsl(var(--color-border))] flex items-end gap-2 shrink-0 bg-[hsl(var(--color-muted)/0.08)] ${
                      !chatReady ? 'pointer-events-none opacity-60' : ''
                    }`}
                  >
                    <textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (!chatReady) return;
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleSendChatMessage();
                        }
                      }}
                      rows={2}
                      readOnly={!chatReady}
                      placeholder={
                        chatReady ? t('aiPanel.placeholder') : t('aiPanel.chatReadonlyPlaceholder')
                      }
                      disabled={!file || isChatThinking || isPreparingChat}
                      className={`flex-1 min-w-0 resize-none rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] px-3 py-2 text-[12px] placeholder:text-[hsl(var(--color-muted-foreground))] focus:outline-none focus:ring-2 ${AI_UI.focusRing} disabled:opacity-50 read-only:cursor-not-allowed`}
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleSendChatMessage()}
                      disabled={!chatReady || !file || isChatThinking || isPreparingChat || !chatInput.trim()}
                      className={`h-[52px] px-3 ${AI_UI.gradientBtn}`}
                      aria-label={t('aiPanel.send')}
                    >
                      {isChatThinking ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {chatHint && !error && (
                  <p className="mt-2 text-[11px] text-[hsl(var(--color-primary))] shrink-0 leading-snug">{chatHint}</p>
                )}
              </Card>
          ) : isTranslatePage ? (
            <div className="flex flex-col gap-3 min-h-[min(70vh,760px)] h-full">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 items-stretch min-h-0">
                <Card className="p-3 border border-[hsl(var(--color-border)/0.7)] flex flex-col h-full min-h-0">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--color-muted-foreground))] mb-2 shrink-0">
                    {t('aiTranslatePage.originalPdf')}
                  </h2>
                  {previewUrl ? (
                    <iframe
                      src={previewUrl}
                      className={`rounded-lg border border-[hsl(var(--color-border))] ${TRANSLATE_PREVIEW_PANEL}`}
                      title={file?.name ?? 'Original PDF'}
                    />
                  ) : (
                    <div
                      className={`rounded-lg border border-dashed border-[hsl(var(--color-border))] flex items-center justify-center text-xs text-[hsl(var(--color-muted-foreground))] ${TRANSLATE_PREVIEW_PANEL}`}
                    >
                      {t('aiPanel.noFile')}
                    </div>
                  )}
                </Card>
                <Card className="p-3 border border-[hsl(var(--color-border)/0.7)] flex flex-col h-full min-h-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2 shrink-0">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--color-muted-foreground))]">
                      {translatedText ? t('aiTranslatePage.translatedText') : t('aiTranslatePage.translatedPdf')}
                    </h2>
                    {translatedText && !loading && (
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleCopyTranslated()}
                          className="gap-1.5 h-8 text-[12px]"
                        >
                          {translateCopyDone ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          {translateCopyDone ? t('aiTranslatePage.copied') : t('aiTranslatePage.copyTranslated')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleDownloadTranslatedText}
                          className="gap-1.5 h-8 text-[12px]"
                        >
                          <Download className="h-3.5 w-3.5" />
                          {t('aiTranslatePage.downloadText')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleExportTranslatedPdf()}
                          disabled={isExportingTranslatedPdf}
                          className="gap-1.5 h-8 text-[12px]"
                        >
                          {isExportingTranslatedPdf ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          {t('aiTranslatePage.exportPdf')}
                        </Button>
                      </div>
                    )}
                    {translatedBlob && !loading && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadTranslated}
                        className="gap-1.5 h-8 text-[12px]"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {t('aiTranslatePage.downloadTranslated')}
                      </Button>
                    )}
                  </div>
                  {loading ? (
                    <AiCenteredSpinner className={`rounded-lg border border-[hsl(var(--color-border))] ${TRANSLATE_PREVIEW_PANEL}`} size="h-9 w-9" />
                  ) : translatedText ? (
                    <pre className={`overflow-auto rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.15)] p-4 text-[12px] leading-relaxed text-[hsl(var(--color-foreground))] whitespace-pre-wrap font-sans ${TRANSLATE_PREVIEW_PANEL}`}>
                      {translatedText}
                    </pre>
                  ) : translatedPreviewUrl ? (
                    <iframe
                      src={translatedPreviewUrl}
                      className={`rounded-lg border border-[hsl(var(--color-border))] ${TRANSLATE_PREVIEW_PANEL}`}
                      title={translatedFileName ?? 'Translated PDF'}
                    />
                  ) : (
                    <div
                      className={`rounded-lg border border-dashed border-[hsl(var(--color-border))] flex items-center justify-center text-xs text-center text-[hsl(var(--color-muted-foreground))] px-4 ${TRANSLATE_PREVIEW_PANEL}`}
                    >
                      {t('aiTranslatePage.placeholder')}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          ) : isVoicePage ? (
            <Card className="p-0 border border-[hsl(var(--color-border)/0.7)] flex flex-col min-h-[min(calc(100dvh-11rem),840px)] h-full overflow-hidden">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--color-muted-foreground))] px-3 pt-3 pb-2 shrink-0">
                {t('aiPanel.previewPdf')}
              </h2>
              <div className="flex-1 min-h-0 relative">
                {file && previewUrl ? (
                  <EditPDFTool
                    key={previewUrl}
                    className="absolute inset-0 h-full"
                    immersive
                    theme={isDarkTheme ? 'dark' : 'light'}
                    sourceFile={file}
                    sourcePdfUrl={previewUrl}
                    onIframeRef={handleVoicePdfIframeRef}
                  />
                ) : (
                  <div className="absolute inset-0 m-3 rounded-lg border border-dashed border-[hsl(var(--color-border))] flex items-center justify-center text-xs text-[hsl(var(--color-muted-foreground))]">
                    {t('aiPanel.noFile')}
                  </div>
                )}
              </div>
            </Card>
          ) : isSmartOcrPage ? (
            <div className="flex flex-col gap-3 min-h-[min(70vh,760px)]">
              <Card className={`p-4 border ${AI_UI.cardBorder} ${AI_UI.cardBg} flex flex-col flex-1 min-h-0 shadow-sm`}>
                <div className="flex flex-wrap items-start justify-between gap-2 mb-3 shrink-0">
                  <div>
                    <h3 className="text-base font-semibold inline-flex items-center gap-1.5 text-[hsl(var(--color-foreground))]">
                      <Sparkles className={`h-4 w-4 ${AI_UI.icon}`} />
                      {t('tools.ocrPdf.result')}
                    </h3>
                    {isOcrResult(result) && !loading && ocrResultFileName && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[hsl(var(--color-muted-foreground))]">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${AI_UI.pill}`}>
                          OCRmyPDF
                        </span>
                        <span>{ocrResultFileName}</span>
                        {ocrResultBlob && (
                          <>
                            <span>·</span>
                            <span>{(ocrResultBlob.size / 1024).toFixed(0)} KB</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {isOcrResult(result) && !loading && (
                    <div className="flex flex-wrap gap-1.5">
                      {isOcrTextResult(result) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 h-8 text-[12px]"
                          onClick={async () => {
                            if (!result?.text) return;
                            try {
                              await navigator.clipboard.writeText(result.text);
                            } catch {
                              const ta = document.createElement('textarea');
                              ta.value = result.text;
                              ta.style.position = 'fixed';
                              ta.style.opacity = '0';
                              document.body.appendChild(ta);
                              ta.select();
                              document.execCommand('copy');
                              document.body.removeChild(ta);
                            }
                            setOcrCopyDone(true);
                            window.setTimeout(() => setOcrCopyDone(false), 2000);
                          }}
                        >
                          {ocrCopyDone ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          {ocrCopyDone ? t('aiPanel.copied') : t('aiPanel.copy')}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 h-8 text-[12px]"
                        onClick={async () => {
                          if (result.outputType === 'pdf' && ocrResultBlob) {
                            const url = URL.createObjectURL(ocrResultBlob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = ocrResultFileName || 'ocr_result.pdf';
                            a.click();
                            URL.revokeObjectURL(url);
                          } else if (result.outputType === 'text' && file) {
                            const form = new FormData();
                            form.append('file', file);
                            form.append('languages', ocrLanguages);
                            form.append('deskew', String(ocrDeskew));
                            form.append('rotate_pages', 'true');
                            form.append('remove_background', String(ocrRemoveBg));
                            form.append('clean', String(ocrClean));
                            form.append('force_ocr', String(ocrForceOcr));
                            form.append('optimize', '1');
                            form.append('output_format', 'pdf');
                            const res = await fetch('/api/ocr', { method: 'POST', body: form });
                            if (res.ok) {
                              const blob = await res.blob();
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = ocrResultFileName || 'ocr_result.pdf';
                              a.click();
                              URL.revokeObjectURL(url);
                            }
                          }
                        }}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download PDF
                      </Button>
                    </div>
                  )}
                </div>

                {loading && isSmartOcrPage ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-[min(50vh,520px)]">
                    <div className="w-full max-w-[280px]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[12px] font-medium text-[hsl(var(--color-foreground))]">
                          {ocrProgress < 100 ? 'Processing OCR...' : 'Done!'}
                        </span>
                        <span className="text-[12px] font-semibold text-[hsl(var(--color-primary))]">
                          {ocrProgress}%
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[hsl(var(--color-muted)/0.3)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[hsl(var(--color-primary))] transition-all duration-300 ease-out"
                          style={{ width: `${ocrProgress}%` }}
                        />
                      </div>
                      <p className="mt-2 text-[11px] text-[hsl(var(--color-muted-foreground))] text-center">
                        {ocrProgress < 30 ? t('tools.ocrPdf.progressAnalyzing') :
                         ocrProgress < 70 ? t('tools.ocrPdf.progressRecognizing') :
                         ocrProgress < 100 ? t('tools.ocrPdf.progressFinalizing') :
                         t('tools.ocrPdf.progressDone')}
                      </p>
                    </div>
                  </div>
                ) : loading ? (
                  <AiCenteredSpinner className="min-h-[min(50vh,520px)]" size="h-9 w-9" />
                ) : isOcrTextResult(result) ? (
                  <div className="flex-1 min-h-0 flex flex-col gap-3">
                    {ocrResultBlob && (
                      <div className="flex items-center gap-3 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.12)] px-3 py-2">
                        <FileText className="h-4 w-4 shrink-0 text-emerald-500" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium truncate">{ocrResultFileName}</p>
                          <p className="text-[11px] text-[hsl(var(--color-muted-foreground))]">
                            {(ocrResultBlob.size / 1024).toFixed(0)} KB · Searchable PDF
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] gap-1 shrink-0"
                          onClick={async () => {
                            if (!result?.text) return;
                            try {
                              await navigator.clipboard.writeText(result.text);
                            } catch {
                              const ta = document.createElement('textarea');
                              ta.value = result.text;
                              ta.style.position = 'fixed';
                              ta.style.opacity = '0';
                              document.body.appendChild(ta);
                              ta.select();
                              document.execCommand('copy');
                              document.body.removeChild(ta);
                            }
                          }}
                        >
                          <Copy className="h-3 w-3" />
                          Copy
                        </Button>
                      </div>
                    )}
                    <pre className="flex-1 min-h-[min(40vh,400px)] overflow-auto rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.08)] p-4 text-[13px] leading-relaxed text-[hsl(var(--color-foreground))] whitespace-pre-wrap font-[var(--font-sans)]">
                      {result.text}
                    </pre>
                  </div>
                ) : ocrPreviewUrl ? (
                  <div className="flex-1 min-h-0 flex flex-col gap-3">
                    {ocrResultBlob && (
                      <div className="flex items-center gap-3 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted)/0.12)] px-3 py-2">
                        <FileText className="h-4 w-4 shrink-0 text-emerald-500" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium truncate">{ocrResultFileName}</p>
                          <p className="text-[11px] text-[hsl(var(--color-muted-foreground))]">
                            {(ocrResultBlob.size / 1024).toFixed(0)} KB · Searchable PDF
                          </p>
                        </div>
                      </div>
                    )}
                    <iframe
                      src={ocrPreviewUrl}
                      className="w-full flex-1 rounded-lg border border-[hsl(var(--color-border))] min-h-[min(40vh,400px)]"
                      title={ocrResultFileName ?? 'OCR result'}
                    />
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center min-h-[min(40vh,400px)]">
                    <div className={`h-16 w-16 rounded-full flex items-center justify-center ${AI_UI.playerIconRing}`}>
                      <Sparkles className={`h-7 w-7 ${AI_UI.iconMuted}`} />
                    </div>
                    <p className="text-[13px] font-medium text-[hsl(var(--color-foreground))]">
                      {file ? t('tools.ocrPdf.readyToOcr') : t('tools.ocrPdf.noFileSelected')}
                    </p>
                    <p className="text-[11px] text-[hsl(var(--color-muted-foreground))] max-w-[280px] leading-relaxed">
                      {file
                        ? t('tools.ocrPdf.readyDesc')
                        : t('tools.ocrPdf.noFileDesc')}
                    </p>
                  </div>
                )}
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
                <h3 className="font-medium mb-2">Result</h3>
                <pre className="max-h-56 overflow-auto rounded-lg bg-[hsl(var(--color-muted)/0.5)] p-3 text-xs">
                  {result ? JSON.stringify(result, null, 2) : 'No result yet.'}
                </pre>
              </div>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}

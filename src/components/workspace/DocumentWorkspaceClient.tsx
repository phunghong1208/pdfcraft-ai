'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Bot, ScanText, PenSquare, ZoomIn, ZoomOut, Download, Maximize2, Minimize2, Eye, Highlighter, PanelRightOpen, PanelRightClose, ArrowLeft, Save, Share2, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EditPDFTool } from '@/components/tools/edit-pdf/EditPDFTool';
import { PageThumbnails } from '@/components/workspace/PageThumbnails';
import { type Locale } from '@/lib/i18n/config';
import { peekUploadedPdf, setUploadedPdf } from '@/lib/document-session';

interface DocumentWorkspaceClientProps {
  locale: Locale;
}

export function DocumentWorkspaceClient({ locale }: DocumentWorkspaceClientProps) {
  const router = useRouter();
  const hasInitialized = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [zoom, setZoom] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const editorIframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<'view' | 'edit' | 'annotate' | 'ocr' | 'ai'>('view');
  const [aiTab, setAiTab] = useState<'chat' | 'summary' | 'translate' | 'insights'>('chat');
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
    { role: 'assistant', text: 'This appears to be a 3-page document. I can summarize, translate, OCR, or extract tables.' },
  ]);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const initialFile = peekUploadedPdf();
    if (initialFile) {
      setFile(initialFile);
      setIsBootstrapping(false);
      return;
    }
    router.replace(`/${locale}`);
  }, [locale, router]);

  function handleFileChange(nextFile: File | null) {
    setFile(nextFile);
    if (!nextFile) return;
    setUploadedPdf(nextFile);
  }

  const modeItems = [
    { key: 'view' as const, label: 'View', icon: Eye },
    { key: 'edit' as const, label: 'Edit', icon: PenSquare },
    { key: 'annotate' as const, label: 'Annotate', icon: Highlighter },
    { key: 'ocr' as const, label: 'OCR', icon: ScanText },
    { key: 'ai' as const, label: 'AI', icon: Bot },
  ];

  const editorActive = workspaceMode !== 'view';
  const editorKey = file ? `${file.name}-${file.size}-${file.lastModified}-${workspaceMode}` : workspaceMode;
  const showRightPanel = !focusMode && isRightPanelOpen;

  useEffect(() => {
    if (workspaceMode === 'ai' || workspaceMode === 'ocr') {
      setIsRightPanelOpen(true);
    }
  }, [workspaceMode]);

  const handlePageSelect = useCallback((page: number) => {
    setCurrentPage(page);
    try {
      const iframe = editorIframeRef.current;
      const win = iframe?.contentWindow as Window & { PDFViewerApplication?: { page: number } } | null;
      if (win?.PDFViewerApplication) {
        win.PDFViewerApplication.page = page;
      }
    } catch {
      // cross-origin or not ready
    }
  }, []);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'pdfcraft-page-change' && typeof e.data.page === 'number') {
        setCurrentPage(e.data.page);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  function handleSendMessage() {
    const content = chatInput.trim();
    if (!content || isAiThinking) return;
    setMessages((prev) => [...prev, { role: 'user', text: content }]);
    setChatInput('');
    setIsAiThinking(true);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Got it. I am analyzing this page and preparing a concise answer with key points.' },
      ]);
      setIsAiThinking(false);
    }, 900);
  }

  return (
    <section
      className="min-h-screen text-white"
      style={{ background: 'linear-gradient(135deg, #1a1d24 0%, #13151a 50%, #1a1d24 100%)' }}
    >
      <div className="mx-auto max-w-[1800px] px-4 py-4">
        {isBootstrapping ? (
          <div className="p-6 border border-white/10 rounded-xl max-w-xl mx-auto text-center bg-black/20">
            <div className="h-8 w-8 rounded-full border-2 border-blue-400 border-t-transparent animate-spin mx-auto mb-3" />
            <p className="text-sm text-white/70">Opening document workspace...</p>
          </div>
        ) : (
          <>
            <div className="h-12 flex items-center justify-between border-b border-white/[0.06] mb-4 text-xs backdrop-blur-sm">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => router.push(`/${locale}`)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06] transition-all"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Workspace
                </button>
                <div className="w-px h-4 bg-white/10" />
                <div className="truncate text-sm font-medium text-white/90">{file?.name || 'DIEUKHOAN.pdf'}</div>
              </div>
              <div className="flex items-center gap-1">
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06] transition-all"><Save className="h-3.5 w-3.5" />Save</button>
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06] transition-all"><FileDown className="h-3.5 w-3.5" />Export</button>
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06] transition-all"><Share2 className="h-3.5 w-3.5" />Share</button>
              </div>
            </div>

            <div className="flex items-center justify-between mb-4 px-1">
              <div className="inline-flex items-center gap-0.5 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                {modeItems.map((mode) => {
                  const Icon = mode.icon;
                  const active = workspaceMode === mode.key;
                  return (
                    <button
                      key={mode.key}
                      type="button"
                      onClick={() => {
                        if (file) setUploadedPdf(file);
                        setWorkspaceMode(mode.key);
                      }}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs whitespace-nowrap rounded-lg transition-all ${
                        active
                          ? 'bg-blue-500/20 text-blue-300 shadow-sm shadow-blue-500/10'
                          : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {mode.label}
                    </button>
                  );
                })}
              </div>
              <div className="hidden md:flex items-center gap-1 text-xs">
                {!editorActive && (
                  <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06] mr-2">
                    <button className="inline-flex items-center p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/[0.06] transition-all" onClick={() => setZoom((z) => Math.max(50, z - 10))}>
                      <ZoomOut className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-11 text-center text-[11px] text-white/60 tabular-nums">{zoom}%</span>
                    <button className="inline-flex items-center p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/[0.06] transition-all" onClick={() => setZoom((z) => Math.min(200, z + 10))}>
                      <ZoomIn className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <button className="inline-flex items-center p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.06] transition-all" onClick={() => setFocusMode((prev) => !prev)}>
                  {focusMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </button>
                <button className="inline-flex items-center p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.06] transition-all" onClick={() => setIsRightPanelOpen((prev) => !prev)}>
                  {showRightPanel ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className={`grid grid-cols-1 gap-3 ${showRightPanel ? 'xl:grid-cols-[88px_minmax(0,1fr)_320px]' : 'xl:grid-cols-[88px_minmax(0,1fr)]'}`}>
              {!focusMode && (
                <aside className="h-[calc(100vh-140px)] py-2 text-[12px] text-white/70 overflow-y-auto scrollbar-thin rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <div className="px-2">
                    <label className="inline-flex w-full items-center justify-center rounded-lg border border-dashed border-white/10 px-2 py-2.5 cursor-pointer hover:bg-white/[0.04] hover:border-white/20 transition-all">
                      <Upload className="h-4 w-4 text-blue-400/80" />
                      <span className="sr-only">New PDF</span>
                      <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)} />
                    </label>
                  </div>
                  <div className="mt-3 mb-1 text-[9px] uppercase tracking-widest text-white/30 text-center font-medium">
                    Pages{pageCount > 0 && ` (${pageCount})`}
                  </div>
                  {previewUrl && (
                    <PageThumbnails
                      pdfUrl={previewUrl}
                      currentPage={currentPage}
                      onPageSelect={handlePageSelect}
                      onPageCountChange={setPageCount}
                    />
                  )}
                </aside>
              )}

              <div className="h-[calc(100vh-140px)] flex flex-col min-w-0">
                <div className="flex-1 min-h-0 px-6 pt-8 pb-6 bg-[#16181d] overflow-auto rounded-xl border border-white/[0.04]" style={{ backgroundImage: 'radial-gradient(ellipse at center, rgba(255,255,255,0.01) 0%, transparent 70%)' }}>
                  {editorActive ? (
                    <div className="h-full min-h-[60vh]">
                      <EditPDFTool
                        key={editorKey}
                        className="h-full"
                        immersive
                        onIframeRef={(ref) => { editorIframeRef.current = ref; }}
                      />
                    </div>
                  ) : (
                    previewUrl && (
                      <div className="h-full flex justify-center">
                        <iframe
                          src={previewUrl}
                          title="Document preview"
                          className="h-full w-full max-w-[1240px] bg-white rounded-md"
                          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.25), 0 24px 80px rgba(0,0,0,0.4)' }}
                        />
                      </div>
                    )
                  )}
                </div>
              </div>

              {showRightPanel && (
                <aside className="h-[calc(100vh-140px)] pl-4 pr-2 text-[12px] rounded-xl bg-white/[0.02] border border-white/[0.04] py-3">
                  <div className="pb-3 border-b border-white/[0.06]">
                    <div className="text-sm font-medium text-white/90">AI Assistant</div>
                    <div className="mt-2 flex items-center gap-2 text-[11px]">
                      {(['chat', 'summary', 'translate', 'insights'] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setAiTab(tab)}
                          className={`capitalize ${aiTab === tab ? 'text-blue-300' : 'text-white/60 hover:text-white/90'}`}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="text-[11px] text-white/55">Detected context</div>
                    <div className="mt-2 text-[12px] text-white/80">3-page Vietnamese policy document.</div>
                  </div>

                  <div className="py-3 space-y-2 text-white/80">
                    <button className="block w-full rounded-lg border border-white/[0.06] px-3 py-2 text-left hover:bg-white/[0.04] hover:border-white/10 transition-all">Summarize</button>
                    <button className="block w-full rounded-lg border border-white/[0.06] px-3 py-2 text-left hover:bg-white/[0.04] hover:border-white/10 transition-all">Translate</button>
                    <button className="block w-full rounded-lg border border-white/[0.06] px-3 py-2 text-left hover:bg-white/[0.04] hover:border-white/10 transition-all">Extract tables</button>
                    <button className="block w-full rounded-lg border border-white/[0.06] px-3 py-2 text-left hover:bg-white/[0.04] hover:border-white/10 transition-all">OCR</button>
                  </div>

                  <div className="h-[calc(100%-170px)] flex flex-col">
                    <div className="flex-1 overflow-auto space-y-2 pr-1">
                      {messages.map((m, idx) => (
                        <div key={idx} className={`${m.role === 'assistant' ? 'text-white/80' : 'text-blue-200'} text-[12px]`}>
                          {m.text}
                        </div>
                      ))}
                      {isAiThinking && <div className="text-[11px] text-blue-300 animate-pulse">Thinking...</div>}
                    </div>
                    <div className="pt-2 border-t border-white/[0.06] flex items-center gap-2">
                      <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Ask..."
                        className="flex-1 min-w-0 h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-[12px] placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-blue-400/30 focus:border-blue-400/20 transition-all"
                      />
                      <Button size="sm" onClick={handleSendMessage} className="h-8 px-2.5 text-[11px]">
                        Send
                      </Button>
                    </div>
                  </div>
                </aside>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

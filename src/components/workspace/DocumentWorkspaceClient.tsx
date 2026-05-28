'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
      style={{ background: 'radial-gradient(circle at top, #2c2f36 0%, #1d1f25 100%)' }}
    >
      <div className="mx-auto max-w-[1800px] px-4 py-4">
        {isBootstrapping ? (
          <div className="p-6 border border-white/10 rounded-xl max-w-xl mx-auto text-center bg-black/20">
            <div className="h-8 w-8 rounded-full border-2 border-blue-400 border-t-transparent animate-spin mx-auto mb-3" />
            <p className="text-sm text-white/70">Opening document workspace...</p>
          </div>
        ) : (
          <>
            <div className="h-11 flex items-center justify-between border-b border-white/10 mb-3 text-xs">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => router.push(`/${locale}`)}
                  className="inline-flex items-center gap-1.5 text-white/75 hover:text-white transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Workspace
                </button>
                <div className="text-white/30">|</div>
                <div className="truncate text-sm text-white/90">{file?.name || 'DIEUKHOAN.pdf'}</div>
              </div>
              <div className="flex items-center gap-2">
                <button className="inline-flex items-center gap-1.5 px-2 py-1 text-white/75 hover:text-white"><Save className="h-4 w-4" />Save</button>
                <button className="inline-flex items-center gap-1.5 px-2 py-1 text-white/75 hover:text-white"><FileDown className="h-4 w-4" />Export</button>
                <button className="inline-flex items-center gap-1.5 px-2 py-1 text-white/75 hover:text-white"><Share2 className="h-4 w-4" />Share</button>
              </div>
            </div>

            <div className="h-11 flex items-end justify-between border-b border-white/10 mb-3 px-1">
              <div className="flex items-end gap-5 overflow-x-auto">
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
                      className={`inline-flex items-center gap-1.5 pb-2 text-xs whitespace-nowrap border-b-2 transition-colors ${
                        active ? 'border-blue-400 text-blue-200' : 'border-transparent text-white/60 hover:text-white/85'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {mode.label}
                    </button>
                  );
                })}
              </div>
              <div className="hidden md:flex items-center gap-3 pb-2 text-xs">
                {!editorActive && (
                  <>
                  <button className="inline-flex items-center text-white/70 hover:text-white" onClick={() => setZoom((z) => Math.max(50, z - 10))}>
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <span className="w-12 text-center text-white/75">{zoom}%</span>
                  <button className="inline-flex items-center text-white/70 hover:text-white" onClick={() => setZoom((z) => Math.min(200, z + 10))}>
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button className="inline-flex items-center text-white/70 hover:text-white"><Download className="h-4 w-4" /></button>
                  </>
                )}
                <button className="inline-flex items-center text-white/70 hover:text-white" onClick={() => setFocusMode((prev) => !prev)}>
                  {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button className="inline-flex items-center text-white/70 hover:text-white" onClick={() => setIsRightPanelOpen((prev) => !prev)}>
                  {showRightPanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className={`grid grid-cols-1 gap-4 ${showRightPanel ? 'xl:grid-cols-[72px_minmax(0,1fr)_320px]' : 'xl:grid-cols-[72px_minmax(0,1fr)]'}`}>
              {!focusMode && (
                <aside className="h-[calc(100vh-130px)] py-1 text-[12px] text-white/70 overflow-y-auto scrollbar-thin">
                  <label className="inline-flex w-full items-center justify-center rounded-md border border-white/15 px-2 py-2 cursor-pointer hover:bg-white/5 transition-colors">
                    <Upload className="h-4 w-4 text-blue-300" />
                    <span className="sr-only">New PDF</span>
                    <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)} />
                  </label>
                  <div className="mt-4 text-[10px] uppercase tracking-wide text-white/40 text-center">
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

              <div className="h-[calc(100vh-130px)] flex flex-col min-w-0">
                <div className="flex-1 min-h-0 px-4 pt-12 pb-4 bg-[#1f2128] overflow-auto rounded-lg">
                  {editorActive ? (
                    <div className="h-full min-h-[60vh]">
                      <EditPDFTool key={editorKey} className="h-full" immersive />
                    </div>
                  ) : (
                    previewUrl && (
                      <div className="h-full flex justify-center">
                        <iframe
                          src={previewUrl}
                          title="Document preview"
                          className="h-full w-full max-w-[1240px] bg-white rounded-sm"
                          style={{ boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}
                        />
                      </div>
                    )
                  )}
                </div>
              </div>

              {showRightPanel && (
                <aside className="h-[calc(100vh-130px)] border-l border-white/10 pl-4 pr-2 text-[12px]">
                  <div className="pb-3 border-b border-white/10">
                    <div className="text-sm text-white/90">AI Assistant</div>
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

                  <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="text-[11px] text-white/55">Detected context</div>
                    <div className="mt-2 text-[12px] text-white/80">3-page Vietnamese policy document.</div>
                  </div>

                  <div className="py-3 space-y-2 text-white/80">
                    <button className="block w-full rounded-md border border-white/10 px-3 py-2 text-left hover:bg-white/5">Summarize</button>
                    <button className="block w-full rounded-md border border-white/10 px-3 py-2 text-left hover:bg-white/5">Translate</button>
                    <button className="block w-full rounded-md border border-white/10 px-3 py-2 text-left hover:bg-white/5">Extract tables</button>
                    <button className="block w-full rounded-md border border-white/10 px-3 py-2 text-left hover:bg-white/5">OCR</button>
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
                    <div className="pt-2 border-t border-white/10 flex items-center gap-2">
                      <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Ask..."
                        className="flex-1 min-w-0 h-8 rounded border border-white/15 bg-transparent px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-blue-400/40"
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

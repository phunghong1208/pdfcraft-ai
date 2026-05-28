'use client';

import { useMemo, useState } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { chatWithPdf, smartOcrPdf, summarizePdf, translatePdf, voiceReaderPdf } from '@/services/aiApi';

type AIActionType = 'summary' | 'translate' | 'chat' | 'smartOcr' | 'voice';

interface AIToolPageClientProps {
  title: string;
  description: string;
  actionLabel: string;
  actionType: AIActionType;
}

const ACTION_MAP: Record<AIActionType, (file: File) => Promise<unknown>> = {
  summary: summarizePdf,
  translate: translatePdf,
  chat: chatWithPdf,
  smartOcr: smartOcrPdf,
  voice: voiceReaderPdf,
};

export default function AIToolPageClient({ title, description, actionLabel, actionType }: AIToolPageClientProps) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);

  async function handleRun() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const runAction = ACTION_MAP[actionType];
      const data = await runAction(file);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="pt-28 pb-16 bg-[hsl(var(--color-muted)/0.2)] min-h-[calc(100vh-220px)]">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-[hsl(var(--color-foreground))]">{title}</h1>
          <p className="mt-2 text-[hsl(var(--color-muted-foreground))]">{description}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6 border border-[hsl(var(--color-border)/0.7)]">
            <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[hsl(var(--color-border))] p-8 cursor-pointer hover:border-[hsl(var(--color-primary)/0.5)] transition-colors">
              <Upload className="h-10 w-10 text-[hsl(var(--color-primary))]" />
              <span className="mt-3 font-medium">Upload PDF file</span>
              <span className="text-sm text-[hsl(var(--color-muted-foreground))]">Select one PDF for AI processing</span>
              <input
                type="file"
                className="hidden"
                accept=".pdf,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>

            {file && (
              <div className="mt-4 rounded-lg border border-[hsl(var(--color-border))] p-3 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="text-sm truncate">{file.name}</span>
              </div>
            )}

            <Button
              variant="primary"
              size="lg"
              className="mt-4 w-full"
              onClick={handleRun}
              disabled={!file || loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {actionLabel}
            </Button>

            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          </Card>

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
              <h3 className="font-medium mb-2">Server response</h3>
              <pre className="max-h-56 overflow-auto rounded-lg bg-[hsl(var(--color-muted)/0.5)] p-3 text-xs">
                {result ? JSON.stringify(result, null, 2) : 'No result yet'}
              </pre>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}

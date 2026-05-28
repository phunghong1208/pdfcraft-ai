import Link from 'next/link';
import { EditPDFTool } from '@/components/tools/edit-pdf/EditPDFTool';

export default async function EditorPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return (
    <main className="min-h-screen bg-[#12141a]">
      <div className="h-12 px-3 border-b border-white/10 flex items-center text-sm text-white/80">
        <Link href={`/${locale}/workspace`} className="hover:text-white">← Workspace</Link>
        <span className="mx-2 text-white/40">/</span>
        <span>PDF Editor</span>
      </div>
      <div className="h-[calc(100vh-48px)] p-2">
        <EditPDFTool className="h-full" immersive />
      </div>
    </main>
  );
}

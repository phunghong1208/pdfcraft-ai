import { type Locale } from '@/lib/i18n/config';
import { DocumentWorkspaceClient } from '@/components/workspace/DocumentWorkspaceClient';

export default async function WorkspacePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return (
    <main className="min-h-screen">
      <DocumentWorkspaceClient locale={locale as Locale} />
    </main>
  );
}

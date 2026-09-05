import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/admin-auth';
import { getArticle } from '@/lib/articles';
import { ArticleEditor } from '@/components/admin/article-editor';

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AuthenticatedEditor id={id} />;
}

async function AuthenticatedEditor({ id }: { id: string }) {
  await requireAdminPage(`/admin/articles/${encodeURIComponent(id)}`);
  const article = await getArticle(id);
  if (!article) notFound();
  return (
    <ArticleEditor
      initialArticle={article}
      initialSlug={article.slug}
      initialDate={article.date}
    />
  );
}

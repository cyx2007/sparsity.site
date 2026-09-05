import { requireAdminPage } from '@/lib/admin-auth';
import { ArticleEditor } from '@/components/admin/article-editor';

export const dynamic = 'force-dynamic';
export default async function NewArticlePage() {
  await requireAdminPage('/admin/new');
  return (
    <ArticleEditor
      initialArticle={null}
      initialSlug={`article-${crypto.randomUUID().slice(0, 8)}`}
      initialDate={new Date().toLocaleDateString('en-CA', {
        timeZone: 'Asia/Shanghai',
      })}
    />
  );
}

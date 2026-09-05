import { requireAdminPage } from '@/lib/admin-auth';
import { listArticles } from '@/lib/articles';
import { ArticleManager } from '@/components/admin/article-manager';

export const dynamic = 'force-dynamic';
export default async function AdminPage() {
  await requireAdminPage('/admin');
  return <ArticleManager articles={await listArticles()} />;
}

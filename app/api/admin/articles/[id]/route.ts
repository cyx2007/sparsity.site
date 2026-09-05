import { adminApi, apiResponse, readArticleBody } from '@/lib/admin-api';
import { getArticle, saveArticle } from '@/lib/articles';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return adminApi(request, async () => {
    const { id } = await context.params;
    const article = await getArticle(id);
    return article
      ? apiResponse({ article })
      : apiResponse({ error: '文章不存在。' }, 404);
  });
}
export async function PUT(request: Request, context: Context) {
  return adminApi(request, async () => {
    const { id } = await context.params;
    return apiResponse({
      article: await saveArticle(await readArticleBody(request), id),
    });
  });
}

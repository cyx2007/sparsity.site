import { adminApi, apiResponse, readArticleBody } from '@/lib/admin-api';
import { listArticles, saveArticle } from '@/lib/articles';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return adminApi(request, async () =>
    apiResponse({ articles: await listArticles() }),
  );
}
export async function POST(request: Request) {
  return adminApi(request, async () =>
    apiResponse(
      { article: await saveArticle(await readArticleBody(request)) },
      201,
    ),
  );
}

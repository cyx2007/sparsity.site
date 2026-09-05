import { notes } from './notes';
import { runtime } from './runtime';
import {
  articleReadingContent,
  cleanArticleHtml,
  validateArticle,
} from './article-content';
import { HttpError } from './admin-auth';
import type { Article, ArticleSummary } from './article-types';

type ArticleRow = Omit<Article, 'sample' | 'createdAt' | 'updatedAt'> & {
  sample: number;
  created_at: string;
  updated_at: string;
};
const summaryColumns =
  'id, slug, title, description, category, date, status, sample, revision, created_at, updated_at';

function decodeRow<T extends Omit<ArticleRow, 'html'> & { html?: string }>(
  row: T,
) {
  const { created_at, updated_at, sample, ...fields } = row;
  return {
    ...fields,
    sample: Boolean(sample),
    createdAt: created_at,
    updatedAt: updated_at,
  };
}

async function seedArticles() {
  const { DB } = runtime();
  const ready = await DB.prepare('SELECT value FROM settings WHERE key = ?')
    .bind('initial_articles')
    .first();
  if (ready) return;
  const now = new Date().toISOString();
  await DB.batch([
    ...notes.map((note) =>
      DB.prepare(`INSERT INTO articles
      (id, slug, title, description, category, date, html, status, sample, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, 1, ?, ?) ON CONFLICT DO NOTHING`).bind(
        `sample-${note.slug}`,
        note.slug,
        note.title,
        note.description,
        note.category,
        note.date,
        cleanArticleHtml(note.html),
        note.sample ? 1 : 0,
        now,
        now,
      ),
    ),
    DB.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING',
    ).bind('initial_articles', '1'),
  ]);
}

export async function listArticles(
  publishedOnly = false,
): Promise<ArticleSummary[]> {
  await seedArticles();
  const { results } = await runtime()
    .DB.prepare(
      `SELECT ${summaryColumns} FROM articles ${publishedOnly ? "WHERE status = 'published'" : ''} ORDER BY date DESC, created_at DESC, id ASC`,
    )
    .all<Omit<ArticleRow, 'html'>>();
  return results.map(decodeRow);
}

export async function getArticle(id: string): Promise<Article | null> {
  await seedArticles();
  const row = await runtime()
    .DB.prepare('SELECT * FROM articles WHERE id = ?')
    .bind(id)
    .first<ArticleRow>();
  return row ? decodeRow(row) : null;
}

export async function publishedArticles() {
  await seedArticles();
  const { results } = await runtime()
    .DB.prepare(
      "SELECT * FROM articles WHERE status = 'published' ORDER BY date DESC, created_at DESC, id ASC",
    )
    .all<ArticleRow>();
  return results.map((row) => ({
    ...decodeRow(row),
    ...articleReadingContent(row.html),
  }));
}

export async function saveArticle(
  value: unknown,
  id?: string,
): Promise<Article> {
  const data = validateArticle(value);
  await seedArticles();
  const { DB } = runtime();
  const now = new Date().toISOString();
  if (id) {
    const current = await getArticle(id);
    if (!current) throw new HttpError(404, '文章不存在。');
    if (current.slug !== data.slug)
      throw new HttpError(400, '已保存的文章地址不能修改。');
    const result = await DB.prepare(
      `UPDATE articles SET title = ?, description = ?, category = ?, date = ?, html = ?, status = ?, sample = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?`,
    )
      .bind(
        data.title,
        data.description,
        data.category,
        data.date,
        data.html,
        data.status,
        data.sample ? 1 : 0,
        now,
        id,
        data.revision,
      )
      .run();
    if (!result.meta.changes)
      throw new HttpError(
        409,
        '文章已在另一处更新。请保留当前内容，刷新后再编辑。',
      );
  } else {
    id = crypto.randomUUID();
    try {
      await DB.prepare(
        `INSERT INTO articles (id, slug, title, description, category, date, html, status, sample, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
        .bind(
          id,
          data.slug,
          data.title,
          data.description,
          data.category,
          data.date,
          data.html,
          data.status,
          data.sample ? 1 : 0,
          now,
          now,
        )
        .run();
    } catch (error) {
      if (String(error).includes('UNIQUE constraint failed'))
        throw new HttpError(409, '这个文章地址已被使用，请换一个。');
      throw error;
    }
  }
  return (await getArticle(id))!;
}

export type ArticleStatus = 'draft' | 'published' | 'archived';

export type Article = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  date: string;
  html: string;
  status: ArticleStatus;
  sample: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type ArticleSummary = Omit<Article, 'html'>;

export const statusLabels: Record<ArticleStatus, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
};

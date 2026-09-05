'use client';

import { useState } from 'react';
import { ArrowUpRight, FileText, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { statusLabels, type ArticleSummary } from '@/lib/article-types';

export function ArticleManager({ articles }: { articles: ArticleSummary[] }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const active = articles.filter((article) => article.status !== 'archived');
  const filtered = articles.filter(
    (article) =>
      (filter === 'all'
        ? article.status !== 'archived'
        : article.status === filter) &&
      `${article.title} ${article.category}`
        .toLowerCase()
        .includes(search.toLowerCase().trim()),
  );
  return (
    <main id="main-content" className="admin-main">
      <div className="manager-heading">
        <div>
          <h1>
            文章<span>{active.length}</span>
          </h1>
        </div>
        <Button
          className="admin-primary"
          render={<a href="/admin/new" aria-label="新建文章" />}
          nativeButton={false}
        >
          <Plus size={17} />
          新建文章
        </Button>
      </div>
      <div className="manager-controls">
        <Tabs
          value={filter}
          onValueChange={(value) => setFilter(String(value))}
        >
          <TabsList variant="line" className="manager-tabs">
            {(['all', 'published', 'draft', 'archived'] as const).map(
              (status) => (
                <TabsTrigger key={status} value={status}>
                  {status === 'all' ? '全部' : statusLabels[status]}
                  <span>
                    {status === 'all'
                      ? active.length
                      : articles.filter((article) => article.status === status)
                          .length}
                  </span>
                </TabsTrigger>
              ),
            )}
          </TabsList>
        </Tabs>
        <div className="manager-search">
          <Search size={16} />
          <Input
            aria-label="搜索文章"
            placeholder="搜索文章"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      <div className="manager-list">
        <div className="manager-column-labels" aria-hidden="true">
          <span>标题</span>
          <span>状态</span>
          <span>日期</span>
          <span />
        </div>
        {filtered.map((article) => (
          <a
            className="manager-row"
            href={`/admin/articles/${article.id}`}
            key={article.id}
          >
            <div className="manager-row-title">
              <h2>{article.title}</h2>
              <p>
                {article.category}
                {article.sample && ' · 示例'}
              </p>
            </div>
            <span className={`article-status status-${article.status}`}>
              <i />
              {statusLabels[article.status]}
            </span>
            <time dateTime={article.date}>
              {article.date.replaceAll('-', '.')}
            </time>
            <ArrowUpRight size={18} className="manager-row-arrow" />
          </a>
        ))}
        {filtered.length === 0 && (
          <div className="manager-empty">
            <FileText size={28} strokeWidth={1.2} />
            <h2>{search ? '没有找到文章' : '这里还没有文章'}</h2>
            {!search && (
              <Button
                variant="outline"
                render={<a href="/admin/new" aria-label="新建文章" />}
                nativeButton={false}
              >
                新建文章
              </Button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

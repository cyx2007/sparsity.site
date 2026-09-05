import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/site-shell';
import { notes, formatDate } from '@/lib/notes';

type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export function generateStaticParams() {
  return notes.map((note) => ({ slug: note.slug }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const note = notes.find((item) => item.slug === slug);
  return note
    ? {
        title: note.title,
        description: note.description,
        ...(note.sample ? { robots: { index: false, follow: true } } : {}),
      }
    : {};
}

export default async function NotePage({ params }: Props) {
  const { slug } = await params;
  const index = notes.findIndex((note) => note.slug === slug);
  const note = notes[index];
  if (!note) notFound();
  const previous = notes[index - 1];
  const next = notes[index + 1];
  return (
    <>
      <SiteHeader article />
      <main id="main-content" className="site-width article-main">
        <div className="article-breadcrumb">
          <a href="/#notes">
            <ArrowLeft size={15} strokeWidth={1.5} />
            所有札记
          </a>
          <span className="eyebrow">
            NOTE / {String(index + 1).padStart(3, '0')}
          </span>
        </div>
        <article>
          <header className="article-header">
            <p className="eyebrow accent">
              {note.category}
              {note.sample && (
                <span className="article-sample"> / 示例札记</span>
              )}
            </p>
            <h1>{note.title}</h1>
            <p className="article-deck">{note.description}</p>
            <div className="entry-metadata">
              <time dateTime={note.date}>{formatDate(note.date)}</time>
              <span className="meta-divider">/</span>
              <span>{note.minutes} 分钟阅读</span>
            </div>
          </header>
          <div className="article-layout">
            <aside className="article-margin">
              <nav className="desktop-toc" aria-label="文章目录">
                <p className="eyebrow">IN THIS NOTE</p>
                <p className="toc-title">本篇目录</p>
                <ol>
                  {note.headings.map((heading, i) => (
                    <li
                      key={heading.id}
                      className={heading.depth === 3 ? 'toc-nested' : undefined}
                    >
                      <a href={`#${heading.id}`}>
                        <span>{String(i + 1).padStart(2, '0')}</span>
                        {heading.text}
                      </a>
                    </li>
                  ))}
                </ol>
                <a className="toc-back" href="#main-content">
                  回到开篇 ↑
                </a>
              </nav>
              <details className="mobile-toc">
                <summary>
                  本篇目录
                  <ChevronDown size={16} />
                </summary>
                <nav aria-label="文章目录">
                  <ol>
                    {note.headings.map((heading) => (
                      <li key={heading.id}>
                        <a href={`#${heading.id}`}>{heading.text}</a>
                      </li>
                    ))}
                  </ol>
                </nav>
              </details>
            </aside>
            <div className="article-column">
              <div
                className="prose"
                dangerouslySetInnerHTML={{ __html: note.html }}
              />
              <div className="article-end">
                <span className="red-dot" />
                <span>写于 {formatDate(note.date)}</span>
              </div>
              <nav className="article-pagination" aria-label="相邻札记">
                {previous ? (
                  <a href={`/notes/${previous.slug}`}>
                    <span className="pagination-label">
                      <ArrowLeft size={14} />
                      较新一篇
                    </span>
                    <span className="pagination-title">{previous.title}</span>
                  </a>
                ) : (
                  <a href="/#notes">
                    <span className="pagination-label">
                      <ArrowLeft size={14} />
                      回到目录
                    </span>
                    <span className="pagination-title">看看其他札记</span>
                  </a>
                )}
                {next && (
                  <a className="pagination-next" href={`/notes/${next.slug}`}>
                    <span className="pagination-label">
                      较早一篇
                      <ArrowRight size={14} />
                    </span>
                    <span className="pagination-title">{next.title}</span>
                  </a>
                )}
              </nav>
            </div>
          </div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}

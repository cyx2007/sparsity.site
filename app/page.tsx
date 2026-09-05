import { ArrowUpRight } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/site-shell';
import { SparseField } from '@/components/sparse-field';
import { formatDate } from '@/lib/notes';
import { publishedArticles } from '@/lib/articles';

export const dynamic = 'force-dynamic';
export default async function Home() {
  const notes = await publishedArticles();
  const [featured, ...otherNotes] = notes;
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="site-width">
        <section className="masthead" aria-labelledby="site-title">
          <div className="masthead-copy">
            <h1 id="site-title">
              稀疏<span>札记</span>
              <i aria-hidden="true">.</i>
            </h1>
          </div>
          <div className="masthead-art" aria-hidden="true">
            <SparseField />
          </div>
        </section>
        <section
          id="notes"
          className="journal-grid"
          aria-labelledby="notes-heading"
        >
          <aside className="section-margin">
            <h2 id="notes-heading">
              近期文章
              <span className="note-count">
                {String(notes.length).padStart(2, '0')}
              </span>
            </h2>
          </aside>
          <div className="journal-entries">
            {featured ? (
              <article className="featured-note">
                <a className="featured-link" href={`/notes/${featured.slug}`}>
                  <div className="entry-topline">
                    <span className="eyebrow accent">最新文章</span>
                    <span className="small-meta">
                      {featured.category}
                      {featured.sample && ' · 示例'}
                    </span>
                  </div>
                  <h3>{featured.title}</h3>
                  <p className="featured-excerpt">{featured.description}</p>
                  <div className="entry-bottomline">
                    <span className="entry-metadata">
                      <time dateTime={featured.date}>
                        {formatDate(featured.date)}
                      </time>
                      <span className="meta-divider">/</span>
                      <span>{featured.minutes} 分钟阅读</span>
                    </span>
                    <span className="read-link">
                      阅读
                      <ArrowUpRight size={17} strokeWidth={1.5} />
                    </span>
                  </div>
                </a>
              </article>
            ) : (
              <div className="empty-journal">
                <h3>暂无文章</h3>
              </div>
            )}
            <div className="note-list">
              {otherNotes.map((note, index) => (
                <article className="note-row" key={note.slug}>
                  <span className="entry-index" aria-hidden="true">
                    {String(index + 2).padStart(2, '0')}
                  </span>
                  <a href={`/notes/${note.slug}`} className="note-link">
                    <div className="note-row-main">
                      <span className="note-row-category">
                        {note.category}
                        {note.sample && ' · 示例'}
                      </span>
                      <h3>{note.title}</h3>
                      <p>{note.description}</p>
                    </div>
                    <div className="note-row-end">
                      <time dateTime={note.date}>
                        {formatDate(
                          note.date,
                          note.date.slice(0, 4) === featured?.date.slice(0, 4),
                        )}
                      </time>
                      <ArrowUpRight
                        className="entry-arrow"
                        size={20}
                        strokeWidth={1.3}
                      />
                    </div>
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

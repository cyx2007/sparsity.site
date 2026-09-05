import { ArrowUpRight } from 'lucide-react';
import { site } from '@/lib/site';
import { notes } from '@/lib/notes';

export function SparseMark() {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 26 26"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="5" cy="5" r="2" />
      <circle cx="13" cy="5" r="2" />
      <circle cx="21" cy="5" r="2" />
      <circle cx="5" cy="13" r="2" />
      <circle cx="13" cy="13" r="2" />
      <circle cx="5" cy="21" r="2" />
      <circle className="mark-accent" cx="21" cy="21" r="2" />
    </svg>
  );
}

export function SiteHeader({ article = false }: { article?: boolean }) {
  return (
    <header className="site-header site-width">
      <a className="brand" href="/" aria-label="稀疏札记首页">
        <SparseMark />
        <span>
          sparsity<span className="brand-tld">.tech</span>
        </span>
      </a>
      <nav aria-label="主导航">
        <a
          className={!article ? 'nav-active' : ''}
          href={article ? '/#notes' : '#notes'}
          aria-current={!article ? 'page' : undefined}
        >
          札记
        </a>
        <a href="#about">关于</a>
        {site.links[0] && (
          <>
            <span className="nav-separator" aria-hidden="true" />
            <a
              className="header-external"
              href={site.links[0].href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {site.links[0].label}
              <ArrowUpRight size={14} />
            </a>
          </>
        )}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer id="about" className="site-footer site-width">
      <div className="footer-upper">
        <div className="footer-intro">
          <p className="eyebrow">02 / COLOPHON</p>
          <h2>
            写得少一点，
            <br />
            想得深一点。
          </h2>
          <p>
            这里是{site.name}，一处安放思考的地方。
            <br />
            记录技术与设计，也留意日常里的微小事物。
          </p>
        </div>
        {site.links.length > 0 && (
          <div className="footer-links">
            <span className="eyebrow">在别处 / ELSEWHERE</span>
            {site.links.map((link) => (
              <a
                href={link.href}
                key={link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
                <ArrowUpRight size={17} strokeWidth={1.5} />
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="footer-bottom">
        <a href="/" className="footer-wordmark">
          {site.name}
          <span>© {new Date().getFullYear()}</span>
        </a>
        {notes.some((note) => note.sample) && (
          <p className="sample-notice">标为「示例」的文章仅供阅读效果展示。</p>
        )}
        <span className="footer-signature">留一些空白给下一次。</span>
      </div>
    </footer>
  );
}

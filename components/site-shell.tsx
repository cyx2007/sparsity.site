import { site } from '@/lib/site';

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

export function SiteHeader({
  page = 'notes',
}: {
  page?: 'notes' | 'about' | 'article' | 'not-found';
}) {
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
          className={
            page === 'notes' || page === 'article' ? 'nav-active' : undefined
          }
          href="/"
          aria-current={page === 'notes' ? 'page' : undefined}
        >
          文章
        </a>
        <a
          className={page === 'about' ? 'nav-active' : undefined}
          href="/about"
          aria-current={page === 'about' ? 'page' : undefined}
        >
          关于
        </a>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer site-width">
      <a href="/" className="footer-wordmark">
        {site.name}
      </a>
      <span className="footer-copyright">© {new Date().getFullYear()}</span>
      <a href="/admin" className="footer-admin">
        管理
      </a>
    </footer>
  );
}

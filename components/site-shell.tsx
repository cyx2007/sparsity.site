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
      <nav className="footer-records" aria-label="网站备案信息">
        <a
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noopener noreferrer"
        >
          粤ICP备2026118989号-1
        </a>
        <a
          href="https://beian.mps.gov.cn/#/query/webSearch?code=44030002016095"
          target="_blank"
          rel="noopener noreferrer"
        >
          {/* oxlint-disable-next-line nextjs/no-img-element -- Keep the small official badge static and unmodified. */}
          <img
            src="/beian.png"
            width={18}
            height={20}
            alt=""
            aria-hidden="true"
          />
          <span>粤公网安备44030002016095号</span>
        </a>
      </nav>
    </footer>
  );
}

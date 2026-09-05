import { ArrowLeft } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/site-shell';

export default function NotFound() {
  return (
    <>
      <SiteHeader article />
      <main id="main-content" className="site-width not-found">
        <p className="eyebrow accent">404 / A BLANK PAGE</p>
        <h1>这一页，还是空白。</h1>
        <p>这篇札记可能已经搬走，或尚未写下。</p>
        <a href="/">
          <ArrowLeft size={16} />
          回到札记
        </a>
      </main>
      <SiteFooter />
    </>
  );
}

import { ArrowLeft } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/site-shell';

export default function NotFound() {
  return (
    <>
      <SiteHeader page="not-found" />
      <main id="main-content" className="site-width not-found">
        <p className="eyebrow accent">404</p>
        <h1>页面不存在</h1>
        <a href="/">
          <ArrowLeft size={16} />
          回到文章
        </a>
      </main>
      <SiteFooter />
    </>
  );
}

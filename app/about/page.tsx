import type { Metadata } from 'next';
import { ArrowUpRight } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/site-shell';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: '关于',
  description: `关于${site.name}。`,
};

export default function AboutPage() {
  return (
    <>
      <SiteHeader page="about" />
      <main id="main-content" className="site-width about-main">
        <h1>关于</h1>
        <div className="about-content">
          <h2>{site.name}</h2>
          <p className="about-domain">{site.domain}</p>
          {site.links.length > 0 && (
            <div className="about-links">
              {site.links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>{link.label}</span>
                  <span className="about-link-address">
                    {link.href.replace(/^https?:\/\//, '')}
                  </span>
                  <ArrowUpRight size={18} strokeWidth={1.5} />
                </a>
              ))}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

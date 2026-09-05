import type { Metadata } from 'next';
import { site } from '@/lib/site';
import '@fontsource-variable/noto-serif-sc/wght.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: `${site.name} — ${site.domain}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <a className="skip-link" href="#main-content">
          跳至正文
        </a>
        {children}
      </body>
    </html>
  );
}

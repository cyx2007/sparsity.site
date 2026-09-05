import type { Metadata } from 'next';
import { ArrowUpRight } from 'lucide-react';
import { SparseMark } from '@/components/site-shell';
import './admin.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: '管理',
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <a href="/admin" className="admin-brand">
          <SparseMark />
          <span>sparsity.tech</span>
          <span className="admin-brand-label">管理</span>
        </a>
        <a href="/" className="admin-visit">
          浏览网站
          <ArrowUpRight size={16} />
        </a>
      </header>
      {children}
    </div>
  );
}

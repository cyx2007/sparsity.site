'use client';

import { Button } from '@/components/ui/button';

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="admin-error">
      <h1>暂时无法载入</h1>
      <p>请稍后重试。</p>
      <Button onClick={reset}>重试</Button>
    </main>
  );
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  articleReadingContent,
  cleanArticleHtml,
  validateArticle,
} from '../lib/article-content.ts';
import { imageType } from '../lib/image-files.ts';

const article = {
  title: '一篇文章',
  slug: 'first-article',
  date: '2026-09-06',
  category: '随笔',
  description: '',
  html: '<p>新的正文。</p>',
  sample: false,
  status: 'draft',
  revision: 0,
};

await test('rich content strips scripts, event handlers, unsafe URLs and embedded documents', () => {
  const clean = cleanArticleHtml(
    '<script>alert(1)</script><svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg><iframe src="https://example.com"></iframe><p onclick="alert(1)">正文</p><a href="javascript:alert(1)">链接</a><img src="data:image/svg+xml,test"><img src="//example.com/image"><img src="https://example.com/photo.jpg" onerror="alert(1)" alt="照片">',
  );
  assert.doesNotMatch(
    clean,
    /<script|<svg|<iframe|onclick|onerror|javascript:|data:image|src="\/\//,
  );
  assert.match(clean, /正文/);
  assert.match(clean, /src="https:\/\/example.com\/photo.jpg"/);
  assert.match(clean, /alt="照片"/);
  assert.match(clean, /rel="noopener noreferrer"/);
});

await test('headings and image content retain meaningful reading structure', () => {
  const result = articleReadingContent(
    '<h1>起点</h1><h2>留白 &amp; 节奏</h2><p>正文</p><h2>留白 &amp; 节奏</h2><img src="/media/abcd.png" alt="图片"><h3>小节</h3>',
  );
  assert.deepEqual(
    result.headings.map((item) => item.id),
    ['起点', '留白-节奏', '留白-节奏-2', '小节'],
  );
  assert.match(result.html, /alt="图片"/);
  assert.equal(result.minutes, 1);
});

await test('article validation rejects bad dates, unsafe addresses and empty published content', () => {
  for (const patch of [
    { title: '' },
    { date: '2026-02-30' },
    { slug: '../admin' },
    { status: 'unknown' },
    { revision: -1 },
    { sample: 'false' },
    { status: 'published', html: '<script>hidden</script><p></p>' },
  ])
    assert.throws(() => validateArticle({ ...article, ...patch }));
  assert.equal(validateArticle(article).description, '新的正文。');
  assert.doesNotThrow(() =>
    validateArticle({
      ...article,
      status: 'published',
      html: '<img src="/media/valid.png" alt="图">',
    }),
  );
});

await test('file signatures reject disguised SVG and identify supported image formats', () => {
  assert.equal(
    imageType(new TextEncoder().encode('<svg onload="alert(1)"></svg>')),
    null,
  );
  assert.equal(
    imageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ?.type,
    'image/png',
  );
  assert.equal(
    imageType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))?.type,
    'image/jpeg',
  );
  assert.equal(
    imageType(new TextEncoder().encode('GIF89a'))?.type,
    'image/gif',
  );
});

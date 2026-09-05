import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../lib/markdown.ts';

await test('Chinese headings keep stable anchors and duplicates get distinct anchors', () => {
  const result = renderMarkdown(
    '## 空白也在表达\n\n段落。\n\n## 空白也在表达\n\n### A small thing',
  );
  assert.deepEqual(
    result.headings.map((heading) => heading.id),
    ['空白也在表达', '空白也在表达-2', 'a-small-thing'],
  );
  for (const heading of result.headings)
    assert.ok(result.html.includes(`id="${heading.id}"`));
});

await test('raw HTML and executable links never become active content', () => {
  const result = renderMarkdown(
    '<script>alert(1)</script>\n\n[click](javascript:alert%281%29)\n\n![image](data:text/html,test)\n\n[valid](https://example.com)',
  );
  assert.ok(!result.html.includes('<script>'));
  assert.ok(!result.html.includes('href="javascript:'));
  assert.ok(!result.html.includes('src="data:'));
  assert.ok(result.html.includes('href="https://example.com"'));
});

await test('formatting, code, local links and tables stay readable', () => {
  const result = renderMarkdown(
    '**重要**\n\n> 片刻\n\n```ts\nconst x = "<tag>";\n```\n\n[目录](#空白)\n\n| 名称 | 说明 |\n| --- | --- |\n| 札记 | 文字 |',
  );
  for (const tag of ['<strong>', '<blockquote>', '<pre>', '<table>'])
    assert.ok(result.html.includes(tag));
  assert.ok(result.html.includes('&lt;tag&gt;'));
  assert.ok(result.html.includes('href="#空白"'));
});

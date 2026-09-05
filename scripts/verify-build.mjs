import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const output = path.resolve('dist/client');
const home = readFileSync(path.join(output, 'index.html'), 'utf8');
assert.match(home, /lang="zh-CN"/);
assert.match(home, /稀疏/);
assert.match(home, /id="main-content"/);
const files = readdirSync('content/notes').filter((file) =>
  file.endsWith('.md'),
);
const pages = [{ route: '/', html: home }];
let published = 0;
for (const file of files) {
  const { data } = matter(
    readFileSync(path.join('content/notes', file), 'utf8'),
  );
  const slug = file.slice(0, -3);
  const target = path.join(output, 'notes', `${slug}.html`);
  if (data.draft === true) {
    assert.ok(!existsSync(target), `Draft leaked: ${file}`);
    continue;
  }
  const html = readFileSync(target, 'utf8');
  assert.ok(home.includes(`/notes/${slug}`), `Missing home link: ${slug}`);
  assert.ok(html.includes(data.title), `Missing title: ${slug}`);
  assert.ok(html.includes(data.description), `Missing description: ${slug}`);
  assert.match(html, /class="prose"/);
  assert.ok(
    html.includes('示例札记') === (data.sample === true),
    `Incorrect sample marker: ${slug}`,
  );
  pages.push({ route: `/notes/${slug}`, html });
  published++;
}
assert.ok(existsSync(path.join(output, '404.html')), 'Missing static 404 page');
assert.ok(
  !home.includes('Your site is taking shape'),
  'Starter content remains',
);
for (const page of pages) {
  assert.equal(
    [...page.html.matchAll(/<h1[ >]/g)].length,
    1,
    `Expected one h1: ${page.route}`,
  );
  for (const [, href] of page.html.matchAll(/(?:href|src)="([^"\\]*)"/g)) {
    if (!href.startsWith('/') && !href.startsWith('#')) continue;
    const url = new URL(href, `https://local.test${page.route}`);
    const local = path.join(
      output,
      decodeURIComponent(url.pathname),
      url.pathname.endsWith('/') ? 'index.html' : '',
    );
    assert.ok(
      existsSync(local) || existsSync(`${local}.html`),
      `Broken local link ${href} in ${page.route}`,
    );
    if (url.hash) {
      const target = readFileSync(
        existsSync(local) ? local : `${local}.html`,
        'utf8',
      );
      assert.ok(
        target.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`),
        `Missing anchor ${href} in ${page.route}`,
      );
    }
  }
}
console.log(
  `Verified homepage, ${published} complete articles, metadata, local links, heading anchors, sample labels and static 404.`,
);

import assert from 'node:assert/strict';

const origin = process.env.SITE_TEST_ORIGIN || 'http://localhost:4173';
assert.ok(
  ['localhost', '127.0.0.1'].includes(new URL(origin).hostname),
  'This test writes fixtures and must only run locally.',
);
const auth = {
  Cookie: '__sites_local_auth=1',
  'oai-authenticated-user-id': 'local_seedy',
  'oai-authenticated-user-email': 'seedy@sites.test',
};
const mutation = {
  ...auth,
  Origin: origin,
  'X-Requested-With': 'sparsity-admin',
};
async function request(path, options = {}) {
  return fetch(origin + path, { redirect: 'manual', ...options });
}
async function json(path, method, body, headers = mutation) {
  const response = await request(path, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    ...(response.headers.get('content-type')?.includes('application/json')
      ? JSON.parse(text)
      : { error: text }),
  };
}

assert.equal((await request('/api/admin/articles')).status, 401);
assert.equal((await request('/admin')).status, 307);
for (const path of ['/admin', '/admin/new'])
  assert.equal((await request(path, { headers: auth })).status, 200, path);
const listing = await (
  await request('/api/admin/articles', { headers: auth })
).json();
assert.ok(listing.articles.length >= 6);
const slug = `cms-check-${crypto.randomUUID().slice(0, 8)}`;
const draft = {
  title: '管理功能校验',
  slug,
  description: '',
  date: '2026-09-06',
  category: '测试',
  sample: false,
  html: '<h2>正文</h2><p>服务端保存验证。</p>',
  status: 'draft',
  revision: 0,
};
assert.equal(
  (
    await json('/api/admin/articles', 'POST', draft, {
      ...mutation,
      Origin: 'https://untrusted.example',
    })
  ).status,
  403,
);
assert.equal(
  (await json('/api/admin/articles', 'POST', { ...draft, date: '2026-02-30' }))
    .status,
  400,
);
const created = await json('/api/admin/articles', 'POST', draft);
assert.equal(created.status, 201, JSON.stringify(created));
const id = created.article.id;
assert.equal((await request(`/notes/${slug}`)).status, 404);
assert.equal((await json('/api/admin/articles', 'POST', draft)).status, 409);
const loaded = await (
  await request(`/api/admin/articles/${id}`, { headers: auth })
).json();
assert.equal(loaded.article.title, draft.title);
const badUpload = new FormData();
badUpload.set(
  'file',
  new Blob(['<svg onload="alert(1)"></svg>'], { type: 'image/png' }),
  'bad.png',
);
assert.equal(
  (
    await request('/api/admin/media', {
      method: 'POST',
      headers: mutation,
      body: badUpload,
    })
  ).status,
  415,
);
const upload = new FormData();
upload.set(
  'file',
  new Blob(
    [
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSAAAAABJRU5ErkJggg==',
        'base64',
      ),
    ],
    { type: 'image/png' },
  ),
  'test.png',
);
const imageResponse = await request('/api/admin/media', {
  method: 'POST',
  headers: mutation,
  body: upload,
});
assert.equal(imageResponse.status, 201);
const image = await imageResponse.json();
assert.equal((await request(image.url)).status, 404);
assert.equal((await request(image.url, { headers: auth })).status, 200);
const published = await json(`/api/admin/articles/${id}`, 'PUT', {
  ...created.article,
  status: 'published',
  html: `${draft.html}<script>alert(1)</script><img src="${image.url}" alt="校验图片">`,
});
assert.equal(published.status, 200, JSON.stringify(published));
assert.ok(!published.article.html.includes('<script'));
assert.equal((await request(`/notes/${slug}`)).status, 200);
assert.ok((await (await request('/')).text()).includes(`/notes/${slug}`));
assert.equal((await request(image.url)).status, 200);
assert.equal(
  (await json(`/api/admin/articles/${id}`, 'PUT', created.article)).status,
  409,
);
const archived = await json(`/api/admin/articles/${id}`, 'PUT', {
  ...published.article,
  status: 'archived',
});
assert.equal(archived.status, 200);
assert.equal((await request(`/notes/${slug}`)).status, 404);
assert.equal((await request(image.url)).status, 404);
assert.ok(!(await (await request('/')).text()).includes(`/notes/${slug}`));
const restored = await json(`/api/admin/articles/${id}`, 'PUT', {
  ...archived.article,
  status: 'draft',
});
assert.equal(restored.status, 200);
assert.equal((await request(`/notes/${slug}`)).status, 404);
await json(`/api/admin/articles/${id}`, 'PUT', {
  ...restored.article,
  status: 'archived',
});
console.log(
  'Verified authentication, CSRF checks, editor routes, validation, durable drafts, uploads, sanitization, publishing, revision conflicts, archiving and restoration.',
);
console.log(`Local fixture archived: ${id}`);

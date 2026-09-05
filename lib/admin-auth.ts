import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { runtime } from './runtime';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function adminIdentity(requestHeaders: Headers): Promise<string> {
  const localIdentity = runtime().localIdentity;
  if (localIdentity) {
    const id = localIdentity(requestHeaders);
    if (!id) throw new HttpError(401, '请先登录。');
    return id;
  }
  const id = requestHeaders.get('oai-authenticated-user-id');
  if (!id) throw new HttpError(401, '请先登录。');
  const { DB, SITE_OWNER_EMAIL } = runtime();
  const owner = await DB.prepare('SELECT value FROM settings WHERE key = ?')
    .bind('admin_user_id')
    .first<{ value: string }>();
  if (owner) {
    if (owner.value !== id) throw new HttpError(403, '此账号没有管理权限。');
    return id;
  }
  // The verified owner email bootstraps one site-scoped ID; later checks use only that ID.
  const email = requestHeaders
    .get('oai-authenticated-user-email')
    ?.trim()
    .toLowerCase();
  if (!SITE_OWNER_EMAIL || email !== SITE_OWNER_EMAIL.trim().toLowerCase())
    throw new HttpError(403, '此账号没有管理权限。');
  await DB.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING',
  )
    .bind('admin_user_id', id)
    .run();
  const pinned = await DB.prepare('SELECT value FROM settings WHERE key = ?')
    .bind('admin_user_id')
    .first<{ value: string }>();
  if (pinned?.value !== id) throw new HttpError(403, '此账号没有管理权限。');
  return id;
}

export async function requireAdminPage(returnTo: string) {
  try {
    return await adminIdentity(await headers());
  } catch (error) {
    if (error instanceof HttpError && error.status === 401)
      redirect(
        `${runtime().localIdentity ? '/auth/login' : '/signin-with-chatgpt'}?return_to=${encodeURIComponent(returnTo)}`,
      );
    if (error instanceof HttpError && error.status === 403) notFound();
    throw error;
  }
}

export function requireSameOrigin(request: Request) {
  if (
    request.headers.get('origin') !==
      (runtime().SITE_ORIGIN ?? new URL(request.url).origin) ||
    request.headers.get('x-requested-with') !== 'sparsity-admin'
  ) {
    throw new HttpError(403, '请求来源无效，请刷新页面后重试。');
  }
}

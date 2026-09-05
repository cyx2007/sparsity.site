import { adminIdentity, HttpError, requireSameOrigin } from './admin-auth';
import { InputError } from './article-content';

export function apiResponse(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function adminApi(
  request: Request,
  action: (userId: string) => Promise<Response>,
) {
  try {
    const id = await adminIdentity(request.headers);
    if (request.method !== 'GET') requireSameOrigin(request);
    return await action(id);
  } catch (error) {
    if (error instanceof HttpError)
      return apiResponse({ error: error.message }, error.status);
    if (error instanceof InputError)
      return apiResponse({ error: error.message }, 400);
    console.error('Admin request failed', error);
    return apiResponse({ error: '暂时无法保存，请稍后重试。' }, 500);
  }
}

export async function readArticleBody(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new HttpError(415, '请求格式无效。');
  const text = new TextDecoder().decode(
    await readLimitedBody(request, 1_100_000),
  );
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, '文章内容格式无效。');
  }
}

export async function readLimitedBody(request: Request, limit: number) {
  if (Number(request.headers.get('content-length')) > limit)
    throw new HttpError(413, '内容超过大小限制。');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '请求内容为空。');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw new HttpError(413, '内容超过大小限制。');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}

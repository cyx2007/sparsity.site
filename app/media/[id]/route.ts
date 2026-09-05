import { adminIdentity } from '@/lib/admin-auth';
import { runtime } from '@/lib/runtime';

export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}\.(?:png|jpg|webp|gif)$/.test(id))
    return new Response('Not found', { status: 404 });
  const { DB, MEDIA } = runtime();
  const published = await DB.prepare(
    "SELECT id FROM articles WHERE status = 'published' AND instr(html, ?) > 0 LIMIT 1",
  )
    .bind(`/media/${id}`)
    .first();
  if (!published) {
    try {
      await adminIdentity(request.headers);
    } catch {
      return new Response('Not found', {
        status: 404,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
  }
  const object = await MEDIA.get(id);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type':
        object.httpMetadata?.contentType ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=300',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}

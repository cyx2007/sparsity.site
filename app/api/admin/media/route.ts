import { adminApi, apiResponse, readLimitedBody } from '@/lib/admin-api';
import { HttpError } from '@/lib/admin-auth';
import { imageType, MAX_IMAGE_BYTES } from '@/lib/image-files';
import { runtime } from '@/lib/runtime';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return adminApi(request, async (userId) => {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.startsWith('multipart/form-data;'))
      throw new HttpError(415, '请选择图片文件。');
    const body = await readLimitedBody(request, MAX_IMAGE_BYTES + 65536);
    const form = await new Response(body, {
      headers: { 'Content-Type': contentType },
    }).formData();
    const file = form.get('file');
    if (
      !file ||
      typeof file === 'string' ||
      file.size === 0 ||
      file.size > MAX_IMAGE_BYTES
    )
      throw new HttpError(400, '请选择不超过 5 MB 的图片。');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const format = imageType(bytes);
    if (!format) throw new HttpError(415, '支持 JPG、PNG、WebP 和 GIF 图片。');
    const id = `${crypto.randomUUID()}.${format.extension}`;
    const { DB, MEDIA } = runtime();
    await MEDIA.put(id, bytes, { httpMetadata: { contentType: format.type } });
    try {
      await DB.prepare(
        'INSERT INTO media (id, filename, content_type, bytes, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
        .bind(
          id,
          file.name.slice(0, 200),
          format.type,
          bytes.length,
          userId,
          new Date().toISOString(),
        )
        .run();
    } catch (error) {
      await MEDIA.delete(id);
      throw error;
    }
    return apiResponse(
      { url: `/media/${id}`, name: file.name.slice(0, 200) },
      201,
    );
  });
}

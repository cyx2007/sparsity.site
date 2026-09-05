export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function imageType(bytes: Uint8Array) {
  const starts = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
    return { type: 'image/png', extension: 'png' };
  if (starts(0xff, 0xd8, 0xff)) return { type: 'image/jpeg', extension: 'jpg' };
  const ascii = new TextDecoder().decode(bytes.slice(0, 12));
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a'))
    return { type: 'image/gif', extension: 'gif' };
  if (ascii.startsWith('RIFF') && ascii.slice(8) === 'WEBP')
    return { type: 'image/webp', extension: 'webp' };
  return null;
}

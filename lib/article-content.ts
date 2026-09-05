import sanitizeHtml from 'sanitize-html';
import { decodeHTML } from 'entities';
import type { Heading } from './markdown';
import type { ArticleStatus } from './article-types';

export class InputError extends Error {}

export function plainText(html: string) {
  return decodeHTML(
    sanitizeHtml(html.replace(/<\/(?:p|h[1-6]|li|blockquote)>/gi, '$& '), {
      allowedTags: [],
      allowedAttributes: {},
    }),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanArticleHtml(source: string) {
  return sanitizeHtml(source, {
    allowedTags: [
      'p',
      'h2',
      'h3',
      'strong',
      'em',
      'u',
      's',
      'code',
      'pre',
      'blockquote',
      'ol',
      'ul',
      'li',
      'a',
      'img',
      'hr',
      'br',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'loading', 'decoding'],
      ol: ['start'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['https'] },
    allowProtocolRelative: false,
    transformTags: {
      h1: 'h2',
      h4: 'h3',
      h5: 'h3',
      h6: 'h3',
      a: (_tag, attributes) => ({
        tagName: 'a',
        attribs: {
          ...attributes,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      img: (_tag, attributes) => ({
        tagName: 'img',
        attribs: { ...attributes, loading: 'lazy', decoding: 'async' },
      }),
    },
    exclusiveFilter: (frame) =>
      frame.tag === 'img' &&
      !/^(?:https:\/\/|\/media\/[a-zA-Z0-9.-]+$)/.test(frame.attribs.src ?? ''),
  });
}

export function articleReadingContent(html: string) {
  const headings: Heading[] = [];
  const ids = new Map<string, number>();
  const clean = cleanArticleHtml(html).replace(
    /<h([23])>([\s\S]*?)<\/h\1>/g,
    (_match, depth: string, inner: string) => {
      const text = plainText(inner);
      const base =
        text
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, '-')
          .replace(/^-|-$/g, '') || 'section';
      const count = (ids.get(base) ?? 0) + 1;
      ids.set(base, count);
      const id = count === 1 ? base : `${base}-${count}`;
      headings.push({ id, text, depth: Number(depth) });
      return `<h${depth} id="${id}">${inner}</h${depth}>`;
    },
  );
  const text = plainText(clean);
  const chinese = text.match(/\p{Script=Han}/gu)?.length ?? 0;
  const words =
    text.replace(/\p{Script=Han}/gu, '').match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  return {
    html: clean,
    headings,
    minutes: Math.max(1, Math.ceil(chinese / 350 + words / 220)),
  };
}

export function validateArticle(value: unknown) {
  if (!value || typeof value !== 'object')
    throw new InputError('文章内容无效。');
  const data = value as Record<string, unknown>;
  const field = (key: string, name: string, max: number, optional = false) => {
    const value = data[key];
    if (
      typeof value !== 'string' ||
      (!optional && !value.trim()) ||
      value.length > max
    ) {
      throw new InputError(
        `${name}${optional ? '' : '不能为空，且'}最多 ${max} 个字符。`,
      );
    }
    return value.trim();
  };
  const title = field('title', '标题', 160);
  const slug = field('slug', '文章地址', 90);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new InputError('文章地址仅支持小写英文字母、数字和连字符。');
  const date = field('date', '日期', 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  )
    throw new InputError('请选择有效日期。');
  if (!['draft', 'published', 'archived'].includes(String(data.status)))
    throw new InputError('文章状态无效。');
  if (typeof data.sample !== 'boolean') throw new InputError('示例标记无效。');
  if (!Number.isSafeInteger(data.revision) || Number(data.revision) < 0)
    throw new InputError('文章版本无效，请刷新后重试。');
  const source = field('html', '正文', 250_000, true);
  const html = cleanArticleHtml(source);
  if (
    data.status === 'published' &&
    !plainText(html) &&
    !html.includes('<img ')
  )
    throw new InputError('请先填写正文或插入图片。');
  const description =
    field('description', '摘要', 300, true) || plainText(html).slice(0, 120);
  return {
    title,
    slug,
    date,
    html,
    description,
    category: field('category', '分类', 40, true) || '随笔',
    status: data.status as ArticleStatus,
    sample: data.sample,
    revision: Number(data.revision),
  };
}

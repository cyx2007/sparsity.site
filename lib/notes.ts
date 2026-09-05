import matter from 'gray-matter';
import { renderMarkdown, type Heading } from './markdown';

export type Note = {
  slug: string;
  title: string;
  description: string;
  date: string;
  category: string;
  sample: boolean;
  minutes: number;
  html: string;
  headings: Heading[];
};

const sources = import.meta.glob<string>('../content/notes/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export const notes: Note[] = Object.entries(sources)
  .flatMap(([path, raw]) => {
    const { data, content } = matter(raw);
    if (data.draft === true) return [];
    const slug = path.split('/').pop()!.replace(/\.md$/, '');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      throw new Error(
        `Invalid article filename: ${path}. Use lowercase words separated by hyphens.`,
      );
    for (const field of ['title', 'description', 'date', 'category']) {
      if (typeof data[field] !== 'string' || !data[field].trim())
        throw new Error(`${path}: missing or invalid ${field}`);
    }
    const date = data.date as string;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
    )
      throw new Error(`${path}: date must be a valid quoted YYYY-MM-DD date.`);
    if (!content.trim()) throw new Error(`${path}: article body is empty.`);
    for (const flag of ['draft', 'sample'])
      if (data[flag] !== undefined && typeof data[flag] !== 'boolean')
        throw new Error(`${path}: ${flag} must be true or false.`);
    const chinese =
      content.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)
        ?.length ?? 0;
    const words =
      content
        .replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu, '')
        .match(/[a-zA-Z0-9]+/g)?.length ?? 0;
    return [
      {
        slug,
        title: data.title as string,
        description: data.description as string,
        date,
        category: data.category as string,
        sample: data.sample === true,
        minutes: Math.max(1, Math.ceil(chinese / 350 + words / 220)),
        ...renderMarkdown(content),
      },
    ];
  })
  .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));

export function formatDate(date: string, short = false) {
  return (short ? date.slice(5) : date).replaceAll('-', '.');
}

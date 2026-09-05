import { Marked } from 'marked';

export type Heading = { id: string; text: string; depth: number };

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeUrl(value: string): boolean {
  // Only local paths, fragments, HTTP(S), and mailto are permitted in authored Markdown.
  return (
    /^(?:https?:\/\/|mailto:|\/|#|\.{1,2}\/)/i.test(value) &&
    !value.startsWith('//') &&
    !Array.from(value).some(
      (character) => character.charCodeAt(0) <= 32 || character === '\\',
    )
  );
}

export function renderMarkdown(source: string) {
  const headings: Heading[] = [];
  const headingIds = new Map<string, number>();
  const parser = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      heading({ tokens, depth, text }) {
        const base =
          text
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, '-')
            .replace(/^-|-$/g, '') || 'section';
        const count = (headingIds.get(base) ?? 0) + 1;
        headingIds.set(base, count);
        const id = count === 1 ? base : `${base}-${count}`;
        if (depth === 2 || depth === 3)
          headings.push({ id, text: text.replace(/[*_`]/g, ''), depth });
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>`;
      },
      html({ text }) {
        return escapeHtml(text);
      },
      link({ href, title, tokens }) {
        const label = this.parser.parseInline(tokens);
        if (!safeUrl(href)) return label;
        return `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ''}>${label}</a>`;
      },
      image({ href, title, text }) {
        if (!safeUrl(href) || href.startsWith('mailto:'))
          return escapeHtml(text);
        return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${title ? ` title="${escapeHtml(title)}"` : ''} loading="lazy" decoding="async" />`;
      },
    },
  });
  return { html: parser.parse(source, { async: false }), headings };
}

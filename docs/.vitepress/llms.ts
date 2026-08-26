// Builds the two artifacts a documentation site owes an AI agent: `llms.txt`,
// a routing index at the site root, and a plain-Markdown mirror of every page
// for those links to point at.
//
// Both are produced from the sidebar and the pages themselves at build time
// and never committed, so there is nothing to regenerate and nothing to drift.
// Add a page to the sidebar and it appears in the router.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

export interface SidebarLink {
  text: string;
  link: string;
}

export interface SidebarGroup {
  text: string;
  items: SidebarLink[];
}

const LANGUAGES: Record<string, string> = {
  '.ts': 'typescript',
  '.js': 'javascript',
  '.sql': 'sql',
  '.json': 'json',
};

/** Extracts a `// #region name` ... `// #endregion name` block. */
function region(source: string, name: string): string {
  const lines = source.split('\n');
  const start = lines.findIndex((l) => l.trim() === `// #region ${name}`);
  const end = lines.findIndex((l) => l.trim() === `// #endregion ${name}`);
  if (start === -1 || end === -1) {
    throw new Error(`region '${name}' not found`);
  }
  return lines.slice(start + 1, end).join('\n');
}

/**
 * Turns a VitePress page into standalone Markdown: frontmatter dropped, `<<<`
 * includes replaced by the file they point at, `v-pre` escapes unwrapped.
 * A mirror that still said `<<< @/snippets/run-a-query.ts` would be worse than
 * no mirror at all.
 */
export function toMarkdown(source: string, srcDir: string): string {
  const body = source.replace(/^---\n[\s\S]*?\n---\n+/, '');

  return body
    .split('\n')
    .map((line) => {
      const match = line.match(/^<<< @\/([^\s{#]+)(?:#([\w-]+))?(?:\{(\w+)\})?\s*$/);
      if (!match) {
        return line.replace(/<code v-pre>([\s\S]*?)<\/code>/g, (_, code) => `\`${code}\``);
      }

      const [, relativePath, regionName, explicitLanguage] = match;
      const absolute = resolve(srcDir, relativePath);
      const contents = readFileSync(absolute, 'utf-8');
      const extracted = regionName ? region(contents, regionName) : contents.trimEnd();
      const language = explicitLanguage ?? LANGUAGES[extname(absolute)] ?? '';

      return `\`\`\`${language}\n${extracted}\n\`\`\``;
    })
    .join('\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function description(source: string): string {
  const match = source.match(/^description:\s*"?(.*?)"?\s*$/m);
  return match ? match[1] : '';
}

/**
 * Source paths, relative to `srcDir`, that get a Markdown mirror. Used to
 * decide which pages may advertise `rel="alternate" type="text/markdown"`:
 * claiming a mirror that was never written would be worse than claiming none.
 */
export function mirroredPages(sidebar: SidebarGroup[]): Set<string> {
  return new Set(
    sidebar.flatMap((group) => group.items.map((item) => `${item.link.slice(1)}.md`)),
  );
}

export interface LlmsOptions {
  srcDir: string;
  outDir: string;
  baseUrl: string;
  summary: string;
  details: string;
  sidebar: SidebarGroup[];
  optional: SidebarLink[];
}

/**
 * Writes the Markdown mirrors into the build output and returns the routing
 * index, which the caller writes wherever it belongs. The same bytes are
 * served from the site root and committed at the repository root, so
 * `llms.txt` means one thing in both places.
 */
export function writeLlmsArtifacts(options: LlmsOptions): {
  index: string;
  mirrors: string[];
} {
  const { srcDir, outDir, baseUrl, sidebar } = options;
  const mirrors: string[] = [];
  const sections: string[] = [];

  for (const group of sidebar) {
    const lines: string[] = [`## ${group.text}`, ''];

    for (const item of group.items) {
      const source = readFileSync(join(srcDir, `${item.link}.md`), 'utf-8');
      const target = join(outDir, `${item.link}.md`);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, toMarkdown(source, srcDir), 'utf-8');
      mirrors.push(target);

      const note = description(source);
      lines.push(`- [${item.text}](${baseUrl}${item.link.slice(1)}.md)${note ? `: ${note}` : ''}`);
    }

    sections.push(lines.join('\n'));
  }

  sections.push(
    ['## Optional', '', ...options.optional.map((o) => `- [${o.text}](${o.link})`)].join('\n'),
  );

  const index = [
    '# aathena',
    '',
    `> ${options.summary}`,
    '',
    options.details,
    '',
    sections.join('\n\n'),
    '',
  ].join('\n');

  return { index, mirrors };
}

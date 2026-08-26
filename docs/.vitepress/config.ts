import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig } from 'vitepress';

import { mirroredPages, writeLlmsArtifacts, type SidebarGroup } from './llms';

// Project Pages serve under a path, not the domain root. Every asset URL is
// resolved against this, so it must match the repository name.
const BASE = '/aathena/';
const ORIGIN = 'https://bug3.github.io';


// One source for the sidebar, the nav and the llms.txt router. A page added
// here is a page the router knows about.
const SIDEBAR: SidebarGroup[] = [
    {
      text: 'Guide',
      items: [
        { text: 'Getting started', link: '/guide/getting-started' },
        { text: 'Writing queries', link: '/guide/writing-queries' },
        { text: 'Running queries', link: '/guide/running-queries' },
        { text: 'Partitions and views', link: '/guide/partitions' },
      ],
    },
    {
      text: 'Reference',
      items: [
        { text: 'API surface', link: '/reference/api' },
        { text: 'Configuration', link: '/reference/configuration' },
        { text: 'Type mapping', link: '/reference/type-mapping' },
        { text: 'Generated code', link: '/reference/generated-code' },
        { text: 'Query statistics', link: '/reference/query-statistics' },
        { text: 'CLI', link: '/reference/cli' },
      ],
    },
];

const MIRRORED = mirroredPages(SIDEBAR);

export default defineConfig({
  title: 'aathena',
  description:
    'Type-safe AWS Athena client.',
  base: BASE,
  lastUpdated: true,

  // GitHub Pages resolves `/guide/` to `/guide/index.html` but does not resolve
  // `/guide/foo` to `/guide/foo.html`. Clean URLs would 404 in production while
  // working in `docs:dev`, so they stay off.
  cleanUrls: false,

  sitemap: { hostname: `${ORIGIN}${BASE}` },

  head: [
    ['meta', { name: 'author', content: 'bug3' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'aathena' }],
    ['meta', { property: 'og:url', content: `${ORIGIN}${BASE}` }],
  ],

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/reference/api' },
      { text: 'npm', link: 'https://www.npmjs.com/package/aathena' },
    ],

    sidebar: SIDEBAR,

    socialLinks: [{ icon: 'github', link: 'https://github.com/bug3/aathena' }],

    editLink: {
      pattern: 'https://github.com/bug3/aathena/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    search: { provider: 'local' },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © bug3',
    },
  },

  // llms.txt v2 discovery: `describedby` points every page at the routing
  // index, `alternate` points it at its own Markdown twin. An agent that
  // landed on the HTML can reach both without guessing a URL.
  transformHead({ page }) {
    const head: [string, Record<string, string>][] = [
      ['link', { rel: 'describedby', href: `${ORIGIN}${BASE}llms.txt` }],
    ];

    if (MIRRORED.has(page)) {
      head.push([
        'link',
        { rel: 'alternate', type: 'text/markdown', href: `${ORIGIN}${BASE}${page}` },
      ]);
    }

    return head;
  },

  buildEnd(siteConfig) {
    const { index, mirrors } = writeLlmsArtifacts({
      srcDir: siteConfig.srcDir,
      outDir: siteConfig.outDir,
      baseUrl: `${ORIGIN}${BASE}`,
      summary:
        'Type-safe AWS Athena client.',
      details:
        'aathena reads your AWS Glue catalog and generates one typed TypeScript function per SQL file. Column names and types come from the catalog verbatim, parameters are validated before the query is submitted, and Parquet/ORC arrays, maps and structs are parsed back recursively.',
      sidebar: SIDEBAR,
      optional: [
        { text: 'GitHub repository', link: 'https://github.com/bug3/aathena' },
        { text: 'npm package', link: 'https://www.npmjs.com/package/aathena' },
      ],
    });
    // Served from the site root, and committed at the repository root so it
    // is visible on GitHub and ships in the tarball. CI fails if the two
    // diverge, which is the only thing keeping the committed copy honest.
    writeFileSync(join(siteConfig.outDir, 'llms.txt'), index, 'utf-8');
    writeFileSync(join(siteConfig.srcDir, '..', 'llms.txt'), index, 'utf-8');
    console.log(`  llms.txt and ${mirrors.length} Markdown mirrors written`);
  },
});

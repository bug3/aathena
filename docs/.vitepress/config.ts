import { defineConfig } from 'vitepress';

// Project Pages serve under a path, not the domain root. Every asset URL is
// resolved against this, so it must match the repository name.
const BASE = '/aathena/';
const ORIGIN = 'https://bug3.github.io';

export default defineConfig({
  title: 'aathena',
  description:
    'Type-safe Amazon Athena client and AWS Glue code generator for TypeScript.',
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
      { text: 'npm', link: 'https://www.npmjs.com/package/aathena' },
    ],

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
});

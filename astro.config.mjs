// @ts-check
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';

import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import pagefind from 'astro-pagefind';

import { katexPlugin } from './src/lib/markdown/katex-plugin.ts';

const SITE = 'https://entangledquantum.github.io';
const BASE = process.env.ANTHROPOCENE_BASE ?? '/anthropocene';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'ignore',

  markdown: {
    processor: satteri({
      features: {
        math: true,
        wikilinks: true,
        directive: true,
        headingAttributes: true,
        smartPunctuation: false,
      },
      mdastPlugins: [katexPlugin],
    }),
    shikiConfig: { theme: 'vitesse-dark', wrap: false },
  },

  integrations: [react(), mdx(), pagefind()],

  vite: {
    plugins: [tailwindcss()],
    worker: { format: 'es' },
    optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  },
});

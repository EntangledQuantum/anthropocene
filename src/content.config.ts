import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/** Content lives outside `src/` on purpose: it is portable, greppable, and
 *  versioned independently of the app that renders it. See AGENTS.md. */
const CONTENT = './content';

/** How deep into a subject a piece of content sits. A single lesson normally
 *  spans several tiers; `<Tier>` blocks fold the deeper ones away until asked
 *  for. This is what stops the platform bottoming out at Brilliant's ceiling. */
export const TIERS = ['foundation', 'core', 'advanced', 'frontier'] as const;
export type Tier = (typeof TIERS)[number];
const tier = z.enum(TIERS);

/** A slug: lowercase, digits, hyphens. Used for concept ids and lesson ids. */
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase-hyphenated slug');

/* ── concepts ──────────────────────────────────────────────────────────────
   The atomic unit of knowledge and the substrate for linking. Exactly one
   lesson may `teaches:` a given concept — that single-owner rule is what
   enforces "never re-teach a topic, link to it" (checked in scripts/check-content.ts).
   ──────────────────────────────────────────────────────────────────────── */
const concepts = defineCollection({
  loader: glob({ base: `${CONTENT}/concepts`, pattern: '**/*.yaml' }),
  schema: z.object({
    title: z.string(),
    /** One sentence, plain language. Shown in hovercards and the gap report. */
    blurb: z.string(),
    /** Formal notation associated with the concept, e.g. "\\Order(h^4)". */
    notation: z.string().optional(),
    tags: z.array(z.string()).default([]),
    /** Optional external reading. Not a substitute for a lesson. */
    references: z
      .array(z.object({ label: z.string(), url: z.string().url() }))
      .default([]),
  }),
});

/* ── paths ─────────────────────────────────────────────────────────────────
   A category. If you add a lesson under a category that has no path, the
   scaffolder creates one (`npm run new:path`).
   ──────────────────────────────────────────────────────────────────────── */
const paths = defineCollection({
  loader: glob({ base: `${CONTENT}/paths`, pattern: '**/path.yaml' }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string(),
    blurb: z.string(),
    /** Two-accent gradient key used for the path's chrome. */
    accent: z.enum(['magenta', 'cyan', 'iris', 'orchid', 'aqua']).default('magenta'),
    /** Ordered chapter directory names. Chapters not listed here still build,
     *  they just sort last — so a half-finished path is never a broken build. */
    chapters: z.array(z.string()).default([]),
    prerequisites: z.array(z.string()).default([]),
    status: z.enum(['draft', 'live']).default('draft'),
  }),
});

const chapters = defineCollection({
  loader: glob({ base: `${CONTENT}/paths`, pattern: '**/chapter.yaml' }),
  schema: z.object({
    title: z.string(),
    blurb: z.string(),
    /** The question this chapter exists to answer. Shown as the chapter's epigraph. */
    question: z.string().optional(),
    order: z.number().int(),
    status: z.enum(['draft', 'live']).default('draft'),
  }),
});

/* ── lessons ───────────────────────────────────────────────────────────── */
const lessons = defineCollection({
  loader: glob({ base: `${CONTENT}/paths`, pattern: '**/[0-9]*.mdx' }),
  schema: z.object({
    title: z.string(),
    /** One line shown in path listings and search results. */
    blurb: z.string(),
    order: z.number().int(),
    tier: tier.default('core'),
    /** Minutes of focused work, honestly estimated. Drives the daily XP goal. */
    minutes: z.number().int().positive().default(15),

    /** Concepts this lesson OWNS. Must be globally unique across all lessons. */
    teaches: z.array(slug).default([]),
    /** Concepts assumed. Each resolves to the lesson that teaches it; anything
     *  unresolved is reported as a gap rather than silently ignored. */
    requires: z.array(slug).default([]),

    /** Set `python` to opt this lesson into the lazily-loaded Pyodide runtime.
     *  Every other lesson ships zero Python bytes. */
    runtime: z.enum(['none', 'python']).default('none'),

    status: z.enum(['draft', 'live']).default('draft'),
    updated: z.coerce.date().optional(),
  }),
});

export const collections = { concepts, paths, chapters, lessons };

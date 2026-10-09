import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { CATEGORY_KEYS } from './lib/categories';

// Lab collection — each demo lives in its own folder under src/content/lab/.
// The folder holds:
//   - index.md       (frontmatter + body copy)
//   - hero.{png,jpg} (optional, referenced as `./hero.png` in frontmatter)
//   - any other images referenced by gallery entries
//
// Images are validated via the `image()` schema helper, which means they go
// through Astro's asset pipeline: responsive srcset, format negotiation
// (avif/webp), lazy loading hints, and CLS-preventing dimensions.
const lab = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './src/content/lab',
    // Strip `/index` so `dvd-shelf/index.md` becomes id `dvd-shelf` (not
    // `dvd-shelf/index`). Lets URLs and node-ids stay clean.
    generateId: ({ entry }) =>
      entry.replace(/\/?index\.md$/, '').replace(/\.md$/, ''),
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      blurb: z.string(),
      status: z.enum(['live', 'wip', 'parked']),
      // Brand categories. Chosen by what the project is FOR, not what it's
      // built with (see BRAND.md). Labels, glyphs and colours live in
      // src/lib/categories.ts.
      category: z.enum(CATEGORY_KEYS),
      // New for the instrument-style project page. All optional so entries
      // can be filled in gradually.
      year: z.number().int().optional(),
      role: z.string().optional(),
      demo: z.string().url().optional(), // embed URL or video for the "play it" block
      repo: z.string().url().optional(),
      next: z.string().optional(), // what's next / what I learned
      href: z.string().url().optional(),
      // Label for the main button. Defaults to the category's verb
      // (Play, Listen, Explore, Try) from src/lib/categories.ts.
      action: z.string().optional(),
      stack: z.array(z.string()).default([]),
      inspiration: z.string().optional(),
      // Hero image — shown large at the top of the detail page
      screenshot: image().optional(),
      // Extra images shown below the body. Each is { src, alt?, caption? }.
      gallery: z
        .array(
          z.object({
            src: image(),
            alt: z.string().optional(),
            caption: z.string().optional(),
          }),
        )
        .default([]),
      order: z.number().default(99),
      mapPosition: z.object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
      }),
      drift: z.object({
        ampX: z.number(),
        ampY: z.number(),
        freqX: z.number(),
        freqY: z.number(),
        phaseX: z.number(),
        phaseY: z.number(),
      }),
    }),
});

export const collections = { lab };

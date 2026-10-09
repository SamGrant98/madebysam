// Single source of truth for the brand categories.
// Everything that shows a category (tags, breadcrumbs, lab nodes, flood
// heroes, the content schema) reads from here, so adding or renaming a
// category happens in one place.
//
// Rule from BRAND.md: categorise by what a project is FOR, not what it's
// built with.

export type GlyphKind = 'dot' | 'bar' | 'chevron' | 'plus' | 'square';

// `as const` keeps these as literal strings ('sound', not just string),
// which lets zod's z.enum() in content.config.ts use the same list.
export const CATEGORY_KEYS = ['sound', 'movement', 'space', 'play'] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export interface CategoryInfo {
  label: string;
  glyph: GlyphKind;
  /** Signal colour: dots, fills, tags, flood backgrounds. Same on ink and paper. */
  color: string;
  /** Colour for small coloured text. Deep on paper, signal on ink. */
  textColor: string;
  /** What belongs here, for the about page and for deciding new projects. */
  covers: string;
  /** Default label for a project's main button (a project can set its own `action`). */
  verb: string;
}

export const CATEGORIES: Record<CategoryKey, CategoryInfo> = {
  sound: {
    label: 'Sound',
    glyph: 'bar',
    color: 'var(--cat-sound)',
    textColor: 'var(--cat-sound-text)',
    covers: 'DJing, AV, audio-reactive work, music tools',
    verb: 'Listen',
  },
  movement: {
    label: 'Movement',
    glyph: 'chevron',
    color: 'var(--cat-movement)',
    textColor: 'var(--cat-movement-text)',
    covers: 'Sport tech, cognitive training, body tracking',
    verb: 'Try',
  },
  space: {
    label: 'Space',
    glyph: 'plus',
    color: 'var(--cat-space)',
    textColor: 'var(--cat-space-text)',
    covers: 'VR, web AR, installations: work where the space is the point',
    verb: 'Explore',
  },
  play: {
    label: 'Play',
    glyph: 'square',
    color: 'var(--cat-play)',
    textColor: 'var(--cat-play-text)',
    covers: 'Games, toys, small tools',
    verb: 'Play',
  },
};

/** Brand orange is not a category, but it behaves like one for floods and glyphs. */
export const BRAND = {
  label: 'made by sam',
  glyph: 'dot' as GlyphKind,
  color: 'var(--orange)',
  textColor: 'var(--orange-text)',
};

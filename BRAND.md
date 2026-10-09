# BRAND.md · made by sam

Short rules for anyone (human or AI) building on this site. Full guidelines live in the Obsidian vault: `Work/Brand/02 Brand Guidelines.md`. Tokens live in `src/styles/global.css`.

## Concept
**Instruments. Precise tools for playful things.** Layout is strict and measured; interaction is where the fun lives. Everything responds, show the workings, label everything, colour always means something.

## Colour
- Mostly monochrome (~90%). Ink `#0D0D0F`, paper `#F3F2EE`. Never pure `#000` / `#FFF`.
- **Orange `#FF6601` is the brand** (links, focus, live, logo). It is not a category.
- **Categories:** Sound `--cat-sound` (purple) · Movement `--cat-movement` (green) · Space `--cat-space` (light blue) · Play `--cat-play` (yellow). Four max.
- **Signal vs text:** use the signal token (`--orange`, `--cat-*`) for dots, fills, tags, borders. Use the `-text` token (`--orange-text`, `--cat-*-text`) for small coloured text. The `-text` tokens swap to deep versions in light mode automatically.
- Text on any coloured fill is always ink.
- Category colour stays small (tags, lit dots, path segment, hover), one category per view, always paired with a label or glyph.

## Flood
- One full-bleed hero per page, in that page's colour. Project pages flood in their category; home and about flood orange; index pages never flood.
- Everything on a flood is `--flood-fg` (ink): text, accent word, path, tags, marks. Resting marks at `--flood-mark-opacity`.
- Live marker on a flood is an ink ring.

## Glyphs
Dot is the default mark. Where a category is in play, its glyph can replace the dot:
orange = dot · sound = vertical bar · movement = chevron · space = plus · play = square. Glyphs sit on the dot grid at dot scale.

## Type
- `--font-display`: Switzer Black (900), `--display-tracking` -0.04em. Headlines.
- `--font-body`: Switzer 400/500/700 (+ italic). Everything else.
- `--font-mono`: Martian Mono. Folder paths, tags, labels, metadata, numbers in UI.
- `--font-accent`: Melodrama Regular at `--accent-scale` (1.15×). **Only** for one word in a headline, big numbers/section markers, one voice line per page, or the wordmark. Never body, nav, buttons, labels or paths. One moment per screen.

## Grid & motifs
- 8px unit. Dot grid at 24px, 1.5px dots. The dot grid is the layout grid.
- Lit dots: dots near interaction brighten in orange (or the page's category colour).
- Topo/contour lines are plots, not decoration. Never behind body text.
- Folder paths (`made by sam / lab / sound / project`) are always the real location, in mono. The category segment takes its `-text` colour.

## Voice
Calm, confident, understated, dry humour. Short sentences, plain words. Avoid: the word "weird", em dashes, hype, over-sentimental copy.

## Accessibility
Colour never the only signal. Visible orange focus ring. Respect `prefers-reduced-motion`.

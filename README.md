# madebysam.dev

Personal site & creative web lab. Astro + TypeScript + OGL (WebGL).

## Develop

```sh
npm run dev      # local dev server (hot reload)
npm run build    # production build → dist/
npm run preview  # serve the build locally
npm run format   # prettier --write .
```

## Structure

```
src/
├── layouts/Base.astro        # shared layout (head, header, theme toggle, topo bg)
├── components/
│   ├── ThemeToggle.astro     # light/dark toggle
│   └── TopoCanvas.astro      # full-viewport WebGL background
├── scripts/topo.ts           # OGL renderer + topo fragment shader
├── styles/global.css         # CSS custom properties, reset, base type
└── pages/
    ├── index.astro           # landing
    ├── about.astro
    └── lab/index.astro       # experiments grid (empty for now)
```

## Deploy

Pushes to `main` auto-deploy via Vercel. Preview URLs are generated per branch.

## Adding an experiment

Drop a new file at `src/pages/lab/<slug>.astro`, use `Base` as the layout
(optionally with `showTopo={false}` if your experiment has its own background),
and add a card entry in `src/pages/lab/index.astro`.

---
title: DVD Shelf
blurb: A 3D shelf for your physical media. Drop in a CSV, browse in space.
status: live
category: three-d
href: https://dvd.madebysam.dev
stack:
  - Three.js
  - TypeScript
  - TMDB API
  - IndexedDB
  - Web Audio
  - Vercel
screenshot: ./dvd_shelf_hero.png
gallery:
  - src: ./dvd_shelf_screenshot_01.png
    alt: Default tower view — DVDs stacked spine-out
    caption: The default view. Your collection stacks spine-out — scroll the tower, click any DVD to bring it into focus.
order: 1
mapPosition:
  x: 0.74
  y: 0.36
drift:
  ampX: 1.4
  ampY: 1.0
  freqX: 0.55
  freqY: 0.7
  phaseX: 0
  phaseY: 1.4
---

## What it is

A 3D shelf renderer for your physical media collection. Upload a CSV (or use the demo collection) and your DVDs stack the way a real shelf would — spines forward, titles auto-fit in Georgia. Scroll the tower, click a DVD to focus on it, flip it to read your notes, search and filter the collection, see stats about what you own.

## How it works

Plain Three.js + an importmap, no build step. Each DVD is a textured box; spines are generated as canvas textures with the title auto-fit to width. Posters and backdrops come from TMDB via a serverless Vercel proxy so the API key never leaves the server. User-uploaded collections persist in IndexedDB so they survive reloads.

The atmospheric backdrop behind a focused DVD is a procedural radial gradient driven by the focused DVD's average colour — so every title sits in its own light.

## Why I built it

_[Your why — the moment / the itch / the question the demo answers]_

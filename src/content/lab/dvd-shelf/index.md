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

A 3D shelf visualiser for your physical media collection. Upload your collection as a CSV and your DVDs stack into a browsable tower, spines forward, just like a real shelf. Scroll through, click to focus, flip to read your notes, search and filter by what you own.

## Why I built it

When building up my DVD and physical media collection, I wanted a way to browse what I owned whilst away from home. I looked at apps like Letterboxd to track my collection but found myself wanting more of an experience.

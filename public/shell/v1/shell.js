// made by sam · lab app shell · v1
//
// Adds the brand path to a lab app: "made by sam / lab / play / dvd-shelf",
// each part a link back to the main site. Configured by data attributes on
// the <script> tag that loads this file:
//
//   data-app       the project's slug on madebysam.dev/lab (required)
//   data-category  sound | movement | space | play
//   data-theme     dark (light text) or light (dark text). Default: dark.
//
// When it's running it sets html.msd-shell-on, so an app can hide any
// fallback branding it had: html.msd-shell-on .old-byline { display: none }

const CATEGORIES = {
  //          on dark      on light
  sound:    ['#a274ff', '#713dc5'],
  movement: ['#00a456', '#00773d'],
  space:    ['#3cc8ff', '#006d90'],
  play:     ['#ffd619', '#766200'],
};

const script = document.querySelector('script[src*="/shell/v1/shell.js"]');
const cfg = script?.dataset ?? {};
const theme = cfg.theme === 'light' ? 'light' : 'dark';
// Links go back to whichever site served the shell: madebysam.dev in
// production, your local dev server when testing.
const home = script ? new URL(script.src).origin : 'https://madebysam.dev';
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, props = {}, text) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  if (text) node.textContent = text;
  return node;
}
function sep() {
  const s = el('span', { className: 'msd-shell__sep' }, '/');
  s.setAttribute('aria-hidden', 'true');
  return s;
}

function build() {
  if (document.querySelector('.msd-shell')) return;
  const nav = el('nav', { className: 'msd-shell' });
  nav.setAttribute('aria-label', 'made by sam');
  nav.dataset.theme = theme;

  nav.append(el('a', { className: 'msd-shell__brand', href: `${home}/` }, 'made by sam'));
  nav.append(sep(), el('a', { className: 'msd-shell__crumb', href: `${home}/lab` }, 'lab'));

  const cat = CATEGORIES[cfg.category];
  if (cat) {
    nav.style.setProperty('--msd-cat', theme === 'dark' ? cat[0] : cat[1]);
    const s = sep(); s.dataset.msdCat = '';
    // Categories aren't pages on the main site, so this crumb is a label.
    const c = el('span', { className: 'msd-shell__crumb msd-shell__crumb--cat' }, cfg.category);
    c.dataset.msdCat = '';
    nav.append(s, c);
  }
  if (cfg.app) {
    nav.append(sep(), el('a', {
      className: 'msd-shell__crumb msd-shell__crumb--here',
      href: `${home}/lab/${encodeURIComponent(cfg.app)}`,
      title: 'About this project',
    }, cfg.app));
  }

  // Leaving for the main site: fade out, then go (instant with reduced motion).
  nav.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || reduceMotion()) return;
    e.preventDefault();
    document.documentElement.classList.add('msd-leaving');
    setTimeout(() => { location.href = a.href; }, 400);
  });

  document.body.prepend(nav);
  document.documentElement.classList.add('msd-shell-on');
}

// Coming back with the browser's back button can restore a faded page.
addEventListener('pageshow', () => document.documentElement.classList.remove('msd-leaving'));

if (document.body) build();
else addEventListener('DOMContentLoaded', build);

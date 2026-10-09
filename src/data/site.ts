// Site-wide copy that changes often, kept out of the page templates so
// it's easy to find and edit. Anything left empty is hidden.
import type { CategoryKey } from '../lib/categories';

export const site = {
  email: 'samgrantarab@gmail.com',

  /**
   * The "Now" line on the home page: one line about what you're building
   * right now. Leave it empty ('') and the Now strip simply doesn't show.
   */
  now: '',

  /** Profile links. Empty url = not shown (about page + footer). */
  links: [
    { label: 'GitHub', url: '' },
    { label: 'LinkedIn', url: '' },
  ],

  about: {
    /** The big Melodrama line at the top of /about. DRAFT, Sam to confirm. */
    line: 'I build instruments: things you pick up and play.',
    intro:
      "I'm Sam, a creative technologist based in the UK with a background in game design and a career built across interactive experiences, immersive technology, and the web.",
    whatIDo: [
      'I design and develop across a broad range of disciplines: websites, mobile apps, VR experiences, web AR, historic and cultural exhibitions, and interactive installations. My work spans concept and prototyping through to deployment.',
      'Currently part of the creative technology team at SeymourPowell, a design and innovation consultancy in London. The lab is where I build independently, personal projects and experiments outside of client work.',
    ],
    spec: {
      role: 'creative technologist',
      at: 'SeymourPowell, London',
      also: 'SP Lab',
      based: 'UK',
      stack: ['JavaScript', 'TypeScript', 'Three.js', 'Unity (C#)', 'Meta Quest', 'Web AR'],
    },
    /** One line per category for "What I play with". DRAFT copy. */
    play: {
      sound: 'DJing, and visuals that react to music. Building toward tools for club sets.',
      movement: 'Sport, and how XR can train reaction and decision-making.',
      space: 'VR, web AR, exhibitions and installations you walk through.',
      play: 'Games, toys and small tools. Where the game design background shows.',
    } satisfies Record<CategoryKey, string>,
    /** Newest first. Leave `when` empty until you have the year. */
    log: [
      { when: 'now', what: 'building in the lab, madebysam.dev' },
      { when: '', what: 'creative technology, SeymourPowell' },
      { when: '', what: 'co-owner, SP Lab' },
      { when: '', what: 'video game design' },
    ],
  },
};

/** Only the links that have a url. */
export const profileLinks = site.links.filter((l) => l.url);

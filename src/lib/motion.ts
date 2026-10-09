// Motion helpers for scripts. CSS handles reduced motion on its own (see
// the prefers-reduced-motion block in global.css); scripts that move
// things themselves ask here.

const query = typeof window !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** True when the visitor has asked their OS for less motion. Live: reflects changes. */
export function reducedMotion(): boolean {
  return query?.matches ?? false;
}

/** 'smooth', or 'auto' (instant) when reduced motion is on. For scrollTo / scrollIntoView. */
export function scrollBehavior(): ScrollBehavior {
  return reducedMotion() ? 'auto' : 'smooth';
}

import { Renderer, Program, Mesh, Triangle } from 'ogl';

// Multi-peak topo shader. Up to MAX_PEAKS hills contribute elevation to the
// noise field. Two modes:
//   'follow' — single peak target tracks the mouse (original behaviour)
//   'locked' — N peaks fixed at caller-provided normalised viewport coords
//              (used by /lab to anchor the terrain into a map)
//
// Switching modes is smooth because each peak's screen position lerps from
// its current value to its new target every frame; no jump cuts.

const MAX_PEAKS = 8;

const vertex = /* glsl */ `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;

  uniform vec2  uResolution;
  uniform float uTime;
  uniform vec3  uBg;
  uniform vec3  uLine;

  const int MAX_PEAKS = ${MAX_PEAKS};
  // Each peak packs:  xy = screen-pixel position
  //                   z  = falloff coefficient (higher = narrower, sharper)
  //                   w  = per-peak elevation strength
  // This lets a single "central mountain" be wide + tall while landmark
  // hills can be narrow + subtle in the same render.
  uniform vec4  uPeaks[MAX_PEAKS];
  uniform int   uPeakCount;
  uniform float uPeakStrength;       // global multiplier for crossfading

  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
          dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
      mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
          dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  const mat2 kRot = mat2(0.8775826, 0.4794255, -0.4794255, 0.8775826);
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = kRot * p * 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 res = uResolution;
    vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);

    // Very gentle base noise — the terrain reads as mostly flat, with the
    // landmark + central peaks providing all the meaningful elevation.
    // Less noise = the landmark hills clearly own their territory rather
    // than fighting random ridges.
    float h = 0.3 * fbm(uv * 1.5);

    // Tiny static wiggle so the rings have a hand-drawn quality instead
    // of perfect mathematical curves.
    h += 0.003 * (noise(uv * 11.0) - 0.0);

    // Accumulate elevation from each active peak.
    for (int i = 0; i < MAX_PEAKS; i++) {
      if (i >= uPeakCount) break;
      vec4 pk = uPeaks[i];
      vec2 peakUv = (pk.xy - 0.5 * res) / min(res.x, res.y);
      float dist = length(uv - peakUv);
      float falloff = max(0.5, pk.z);
      float peakShape = 1.0 / (1.0 + dist * dist * falloff);
      h += pk.w * uPeakStrength * peakShape;
    }

    float bands = 8.0;
    float v = fract(h * bands);
    float edge = min(v, 1.0 - v);

    // Uniform AA across the whole map — lines stay the same thickness
    // everywhere instead of glowing near the central peak. Reads as
    // intentional cartography rather than emergent terrain.
    float aa = bands / min(res.x, res.y) * 1.2;

    // Two contour weights — major rings (every 5th) a touch thicker and
    // full-opacity; minors are slim and 25% dimmer.
    float minorLine = 1.0 - smoothstep(0.0, aa, edge);
    float majorLine = 1.0 - smoothstep(0.0, aa * 1.5, edge);
    float bandNum = floor(h * bands);
    float isMajor = step(mod(bandNum, 5.0), 0.5);
    float line = mix(minorLine * 0.75, majorLine, isMajor);

    vec3 col = mix(uBg, uLine, line);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '').trim();
  if (h.length < 6) return null;
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

type Mode = 'follow' | 'locked';
type Peak = {
  target: [number, number];
  current: [number, number];
  falloff: number;
  strength: number;
};
type NormPos = { x: number; y: number; falloff?: number; strength?: number };

// Defaults that match the original single-peak look — used in follow mode.
const DEFAULT_FALLOFF = 8.0;
const DEFAULT_STRENGTH = 0.55;

// Exposed controller. /lab calls setMode('locked') with peak positions; other
// pages can call setMode('follow') to return to the cursor-tracking behaviour.
// The `strength` option scales how dominant the peaks are — bump it for a
// single central "mountain" to feel taller; leave at 1 for natural follow.
export interface TopoController {
  setMode(mode: Mode, peaks?: NormPos[], opts?: { strength?: number }): void;
  setPeaks(peaks: NormPos[]): void;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Window { __topo?: TopoController; }
}

export function initTopoCanvas(canvas: HTMLCanvasElement): () => void {
  const renderer = new Renderer({
    canvas,
    dpr: Math.min(2, window.devicePixelRatio || 1),
    alpha: false,
    antialias: false,
  });
  const gl = renderer.gl;

  const geometry = new Triangle(gl);
  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      uResolution: { value: [window.innerWidth, window.innerHeight] },
      uTime: { value: 0 },
      uBg: { value: [0, 0, 0] },
      uLine: { value: [1, 1, 1] },
      uPeaks: { value: new Array(MAX_PEAKS * 4).fill(0) },
      uPeakCount: { value: 0 },
      uPeakStrength: { value: 1.0 },
    },
  });
  const mesh = new Mesh(gl, { geometry, program });

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    program.uniforms.uResolution.value = [w * renderer.dpr, h * renderer.dpr];
  }
  resize();
  window.addEventListener('resize', resize);

  // ----- Peak state -----
  // In follow mode there is exactly one peak whose target tracks the mouse.
  // In locked mode there are N peaks whose targets are caller-provided
  // normalised viewport coords (x, y in 0..1, y measured from the TOP).
  let mode: Mode = 'follow';
  const peaks: Peak[] = [];
  let lockedPositions: NormPos[] = [];

  // Start the mouse-tracking peak off-screen below the viewport so the
  // first paint doesn't show a hill where the cursor hasn't arrived yet.
  const initialOff = [
    window.innerWidth * 0.5 * renderer.dpr,
    -window.innerHeight * 0.6 * renderer.dpr,
  ] as [number, number];
  peaks.push({
    target: [...initialOff],
    current: [...initialOff],
    falloff: DEFAULT_FALLOFF,
    strength: DEFAULT_STRENGTH,
  });

  const mouseTarget: [number, number] = [...initialOff];
  function onPointer(e: PointerEvent) {
    mouseTarget[0] = e.clientX * renderer.dpr;
    mouseTarget[1] = (window.innerHeight - e.clientY) * renderer.dpr;
  }
  window.addEventListener('pointermove', onPointer);

  // Normalised (0..1, top-down) → screen pixel space the shader expects
  function denorm(p: NormPos): [number, number] {
    return [
      p.x * window.innerWidth * renderer.dpr,
      (1 - p.y) * window.innerHeight * renderer.dpr,
    ];
  }

  function setMode(next: Mode, newPeaks?: NormPos[], opts?: { strength?: number }) {
    mode = next;
    if (next === 'locked') {
      if (newPeaks) lockedPositions = newPeaks.slice();
      // New peaks emerge from wherever the existing first peak currently is
      // (typically the cursor) and disperse to their target positions.
      const spawn = peaks[0]?.current ?? initialOff;
      peaks.length = 0;
      for (const np of lockedPositions) {
        peaks.push({
          target: denorm(np),
          current: [...spawn],
          falloff: np.falloff ?? DEFAULT_FALLOFF,
          strength: np.strength ?? DEFAULT_STRENGTH,
        });
      }
    } else {
      // follow mode — single peak; inherits current value from peaks[0] so
      // the morph back is smooth.
      const spawn = peaks[0]?.current ?? [...initialOff];
      peaks.length = 0;
      peaks.push({
        target: [...mouseTarget],
        current: spawn,
        falloff: DEFAULT_FALLOFF,
        strength: DEFAULT_STRENGTH,
      });
    }
    // Optional global multiplier for crossfades — default 1.0.
    program.uniforms.uPeakStrength.value = opts?.strength ?? 1.0;
  }

  function setPeaks(newPeaks: NormPos[]) {
    setMode('locked', newPeaks);
  }

  window.__topo = { setMode, setPeaks };

  // Theme colours sync from CSS custom props (follows light/dark)
  function readColors() {
    const styles = getComputedStyle(document.documentElement);
    const bg = hexToRgb(styles.getPropertyValue('--color-bg'));
    const line = hexToRgb(styles.getPropertyValue('--color-fg'));
    if (bg) program.uniforms.uBg.value = bg;
    if (line) program.uniforms.uLine.value = line;
  }
  readColors();

  const themeObserver = new MutationObserver(readColors);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  const start = performance.now();
  let rafId = 0;
  const peakUniform = new Array(MAX_PEAKS * 4).fill(0) as number[];

  function loop() {
    // Refresh targets every frame:
    //  - follow → peak 0 tracks the mouse
    //  - locked → all peaks re-derive their target from normalised coords
    //             (so resize stays correct without explicit re-call)
    if (mode === 'follow' && peaks.length > 0) {
      peaks[0].target[0] = mouseTarget[0];
      peaks[0].target[1] = mouseTarget[1];
    } else if (mode === 'locked') {
      for (let i = 0; i < peaks.length && i < lockedPositions.length; i++) {
        const t = denorm(lockedPositions[i]);
        peaks[i].target[0] = t[0];
        peaks[i].target[1] = t[1];
      }
    }

    // Low lerp factor → smooth gliding pursuit (same feel as the original)
    for (const p of peaks) {
      p.current[0] += (p.target[0] - p.current[0]) * 0.045;
      p.current[1] += (p.target[1] - p.current[1]) * 0.045;
    }

    // Pack peaks into the flat vec4 uniform array (xy = pos, z = falloff, w = strength).
    for (let i = 0; i < MAX_PEAKS; i++) {
      const base = i * 4;
      if (i < peaks.length) {
        peakUniform[base]     = peaks[i].current[0];
        peakUniform[base + 1] = peaks[i].current[1];
        peakUniform[base + 2] = peaks[i].falloff;
        peakUniform[base + 3] = peaks[i].strength;
      } else {
        peakUniform[base]     = 0;
        peakUniform[base + 1] = 0;
        peakUniform[base + 2] = 1;
        peakUniform[base + 3] = 0;
      }
    }
    program.uniforms.uPeaks.value = peakUniform;
    program.uniforms.uPeakCount.value = Math.min(peaks.length, MAX_PEAKS);
    program.uniforms.uTime.value = (performance.now() - start) / 1000;

    renderer.render({ scene: mesh });
    rafId = requestAnimationFrame(loop);
  }
  loop();

  return () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onPointer);
    themeObserver.disconnect();
    if (window.__topo === (window.__topo as TopoController | undefined)) {
      delete window.__topo;
    }
  };
}

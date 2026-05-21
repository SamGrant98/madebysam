import { Renderer, Program, Mesh, Triangle } from 'ogl';

// Shader for the persistent background canvas. Crossfades between two
// renders driven by a single uMorph 0..1 uniform:
//
//   uMorph = 0  → home topo:   fbm contours + cursor-follow peak (full noise,
//                              ring-glow near mouse, original look).
//   uMorph = 1  → faded grid:  static cartesian grid, major/minor lines,
//                              dimmed — sits back as ambience for the /lab
//                              node-link network (drawn by DOM/SVG, not here).
//
// The crossfade uses staggered smoothsteps so the messy middle (where both
// would be at half-intensity) is brief.

const MAX_PEAKS = 1;

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
  uniform vec4  uPeaks[MAX_PEAKS]; // xy=px, z=falloff, w=strength (morph-scaled)
  uniform int   uPeakCount;
  uniform float uPeakAA;           // line widening near peak (faded by morph)
  uniform float uMorph;            // 0 = topo, 1 = grid

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

    // ---- Topo: fbm heightfield + mouse-follow peak ----
    float h = fbm(uv * 1.5);
    float peakShape = 0.0;
    for (int i = 0; i < MAX_PEAKS; i++) {
      if (i >= uPeakCount) break;
      vec4 pk = uPeaks[i];
      vec2 peakUv = (pk.xy - 0.5 * res) / min(res.x, res.y);
      float dist = length(uv - peakUv);
      float falloff = max(0.5, pk.z);
      float shape = 1.0 / (1.0 + dist * dist * falloff);
      h += pk.w * shape;
      peakShape = max(peakShape, shape * pk.w);
    }

    float bands = 8.0;
    float v = fract(h * bands);
    float edge = min(v, 1.0 - v);
    float baseAA = bands / min(res.x, res.y) * 1.5;
    float peakAA_active = uPeakAA * (1.0 - uMorph);
    float aa = baseAA * (1.0 + peakShape * peakAA_active);
    float minorLine = 1.0 - smoothstep(0.0, aa, edge);
    float majorLine = 1.0 - smoothstep(0.0, aa * 1.5, edge);
    float bandNum = floor(h * bands);
    float isMajor = step(mod(bandNum, 5.0), 0.5);
    float topoContour = mix(minorLine * 0.8, majorLine, isMajor);

    // ---- Grid: pixel-perfect cartesian, major every 5th ----
    float gridSpacing = 80.0;
    vec2 gPx = mod(gl_FragCoord.xy, gridSpacing);
    vec2 gNear = min(gPx, gridSpacing - gPx);
    float gDist = min(gNear.x, gNear.y);
    float gridMinor = 1.0 - smoothstep(0.0, 1.0, gDist);

    float majorSpacing = gridSpacing * 5.0;
    vec2 gPxM = mod(gl_FragCoord.xy, majorSpacing);
    vec2 gNearM = min(gPxM, majorSpacing - gPxM);
    float gDistM = min(gNearM.x, gNearM.y);
    float gridMajor = 1.0 - smoothstep(0.0, 1.5, gDistM);

    float gridFull = max(gridMinor * 0.32, gridMajor * 0.55);

    // ---- Crossfade ----
    // topo fades out across 0..0.7, grid fades in across 0.3..1.0 —
    // overlap window 0.3..0.7 keeps the screen from going blank in the middle.
    float topoFade = 1.0 - smoothstep(0.0, 0.7, uMorph);
    float gridFade = smoothstep(0.3, 1.0, uMorph);
    float line = topoContour * topoFade + gridFull * gridFade;

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

export interface TopoController {
  // Animate uMorph between current value and target over durationMs.
  //   target = 0  → topo (home/about default)
  //   target = 1  → grid (lab page)
  setMorph(target: number, durationMs?: number): void;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Window { __topo?: TopoController; }
}

const DEFAULT_PEAK_FALLOFF = 8.0;
const DEFAULT_PEAK_STRENGTH = 0.55;
const DEFAULT_PEAK_AA = 4.0;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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
      uPeakCount: { value: 1 },
      uPeakAA: { value: DEFAULT_PEAK_AA },
      uMorph: { value: 0 },
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

  // Single mouse-follow peak. Starts off-screen so first paint has no hill.
  const initialOff: [number, number] = [
    window.innerWidth * 0.5 * renderer.dpr,
    -window.innerHeight * 0.6 * renderer.dpr,
  ];
  const peakCurrent: [number, number] = [...initialOff];
  const peakTarget: [number, number] = [...initialOff];

  function onPointer(e: PointerEvent) {
    peakTarget[0] = e.clientX * renderer.dpr;
    peakTarget[1] = (window.innerHeight - e.clientY) * renderer.dpr;
  }
  window.addEventListener('pointermove', onPointer);

  // ---- Morph state ----
  let morphValue = 0;
  let morphTarget = 0;
  let morphFrom = 0;
  let morphStartTime = 0;
  let morphDuration = 0;

  function setMorph(target: number, durationMs = 1000) {
    const clamped = Math.max(0, Math.min(1, target));
    if (durationMs <= 0 || clamped === morphValue) {
      morphValue = clamped;
      morphTarget = clamped;
      return;
    }
    morphFrom = morphValue;
    morphTarget = clamped;
    morphStartTime = performance.now();
    morphDuration = durationMs;
  }

  window.__topo = { setMorph };

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
    // Advance morph animation
    if (morphValue !== morphTarget) {
      const elapsed = (performance.now() - morphStartTime) / morphDuration;
      if (elapsed >= 1) {
        morphValue = morphTarget;
      } else {
        morphValue = morphFrom + (morphTarget - morphFrom) * easeInOutCubic(elapsed);
      }
    }

    // Smooth pursuit for cursor peak
    peakCurrent[0] += (peakTarget[0] - peakCurrent[0]) * 0.045;
    peakCurrent[1] += (peakTarget[1] - peakCurrent[1]) * 0.045;

    // Mouse peak strength fades out as we morph to grid
    const effStrength = DEFAULT_PEAK_STRENGTH * (1 - morphValue);
    peakUniform[0] = peakCurrent[0];
    peakUniform[1] = peakCurrent[1];
    peakUniform[2] = DEFAULT_PEAK_FALLOFF;
    peakUniform[3] = effStrength;

    program.uniforms.uPeaks.value = peakUniform;
    program.uniforms.uMorph.value = morphValue;
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

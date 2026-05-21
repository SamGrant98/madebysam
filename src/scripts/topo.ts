import { Renderer, Program, Mesh, Triangle } from 'ogl';

// Multi-feature topo shader. Two feature types contribute to the heightfield:
//   PEAKS    — radial hills (1 / (1 + d² · falloff)) at fixed points.
//              Contours appear as concentric rings around each peak.
//   SEGMENTS — ridges along line segments (same kernel, but distance-to-
//              segment instead of distance-to-point). Contours flow PARALLEL
//              to the segment, reading as a road on a topographic map.
//
// /lab uses both: a peak at each landmark + segments connecting them, so the
// experiments form a visible network. The home/about pages use a single
// mouse-tracked peak with full base noise (original behaviour).

const MAX_PEAKS = 8;
const MAX_SEGS = 8;

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
  const int MAX_SEGS  = ${MAX_SEGS};

  // Each peak packs: xy = pixel pos, z = falloff, w = strength
  uniform vec4  uPeaks[MAX_PEAKS];
  uniform int   uPeakCount;

  // Segments pack endpoints (ax, ay, bx, by) + (falloff, strength) in a
  // parallel params array. Splitting to two arrays keeps the vec4 layout.
  uniform vec4  uSegments[MAX_SEGS];
  uniform vec2  uSegParams[MAX_SEGS];
  uniform int   uSegCount;

  uniform float uPeakStrength;   // global crossfade multiplier
  uniform float uNoiseScale;     // multiplier on the base fbm noise field
  uniform float uPeakAA;         // line widening near peaks (0 = uniform AA)

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

  float distSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float t = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
    return length(pa - ba * t);
  }

  void main() {
    vec2 res = uResolution;
    vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);

    float h = uNoiseScale * fbm(uv * 1.5);
    float maxShape = 0.0;

    // Peaks — radial hills
    for (int i = 0; i < MAX_PEAKS; i++) {
      if (i >= uPeakCount) break;
      vec4 pk = uPeaks[i];
      vec2 peakUv = (pk.xy - 0.5 * res) / min(res.x, res.y);
      float dist = length(uv - peakUv);
      float falloff = max(0.5, pk.z);
      float shape = 1.0 / (1.0 + dist * dist * falloff);
      h += pk.w * uPeakStrength * shape;
      maxShape = max(maxShape, shape * pk.w);
    }

    // Segments — ridges along a line; contours run parallel to the segment
    for (int i = 0; i < MAX_SEGS; i++) {
      if (i >= uSegCount) break;
      vec4 s = uSegments[i];
      vec2 sa = (s.xy - 0.5 * res) / min(res.x, res.y);
      vec2 sb = (s.zw - 0.5 * res) / min(res.x, res.y);
      float d = distSegment(uv, sa, sb);
      vec2 sp = uSegParams[i];
      float falloff = max(0.5, sp.x);
      float ridge = 1.0 / (1.0 + d * d * falloff);
      h += sp.y * uPeakStrength * ridge;
    }

    float bands = 8.0;
    float v = fract(h * bands);
    float edge = min(v, 1.0 - v);

    // Peak-widened AA: lines bloom near the cursor in follow mode;
    // uniform on the lab map (uPeakAA = 0) for a clean cartographic line.
    float baseAA = bands / min(res.x, res.y) * 1.5;
    float aa = baseAA * (1.0 + maxShape * uPeakStrength * uPeakAA);

    // Major rings every 5th — slightly thicker, full opacity. Minor are dim.
    float minorLine = 1.0 - smoothstep(0.0, aa, edge);
    float majorLine = 1.0 - smoothstep(0.0, aa * 1.5, edge);
    float bandNum = floor(h * bands);
    float isMajor = step(mod(bandNum, 5.0), 0.5);
    float line = mix(minorLine * 0.8, majorLine, isMajor);

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
type NormPos = { x: number; y: number; falloff?: number; strength?: number };
type NormSeg = {
  a: { x: number; y: number };
  b: { x: number; y: number };
  falloff?: number;
  strength?: number;
};

type Peak = {
  target: [number, number];
  current: [number, number];
  falloff: number;
  strength: number;
};
type Seg = {
  aTarget: [number, number];
  aCurrent: [number, number];
  bTarget: [number, number];
  bCurrent: [number, number];
  falloff: number;
  strength: number;
};

const DEFAULT_PEAK_FALLOFF = 8.0;
const DEFAULT_PEAK_STRENGTH = 0.55;
const DEFAULT_SEG_FALLOFF = 40.0;
const DEFAULT_SEG_STRENGTH = 0.4;

// Per-mode visual defaults — follow gets the original glow, locked is flat
// and cartographic.
const MODE_DEFAULTS: Record<Mode, { noiseScale: number; peakAA: number }> = {
  follow: { noiseScale: 1.0, peakAA: 4.0 },
  locked: { noiseScale: 0.5, peakAA: 0.0 },
};

export interface SetModeOpts {
  peaks?: NormPos[];
  segments?: NormSeg[];
  strength?: number;
  noiseScale?: number;
  peakAA?: number;
}

export interface TopoController {
  setMode(mode: Mode, opts?: SetModeOpts): void;
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
      uSegments: { value: new Array(MAX_SEGS * 4).fill(0) },
      uSegParams: { value: new Array(MAX_SEGS * 2).fill(0) },
      uSegCount: { value: 0 },
      uPeakStrength: { value: 1.0 },
      uNoiseScale: { value: MODE_DEFAULTS.follow.noiseScale },
      uPeakAA: { value: MODE_DEFAULTS.follow.peakAA },
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

  let mode: Mode = 'follow';
  const peaks: Peak[] = [];
  const segs: Seg[] = [];
  let lockedPeaks: NormPos[] = [];
  let lockedSegs: NormSeg[] = [];

  // First-paint cursor hidden below the viewport so no hill flashes on load
  const initialOff = [
    window.innerWidth * 0.5 * renderer.dpr,
    -window.innerHeight * 0.6 * renderer.dpr,
  ] as [number, number];
  peaks.push({
    target: [...initialOff],
    current: [...initialOff],
    falloff: DEFAULT_PEAK_FALLOFF,
    strength: DEFAULT_PEAK_STRENGTH,
  });

  const mouseTarget: [number, number] = [...initialOff];
  function onPointer(e: PointerEvent) {
    mouseTarget[0] = e.clientX * renderer.dpr;
    mouseTarget[1] = (window.innerHeight - e.clientY) * renderer.dpr;
  }
  window.addEventListener('pointermove', onPointer);

  function denorm(p: { x: number; y: number }): [number, number] {
    return [
      p.x * window.innerWidth * renderer.dpr,
      (1 - p.y) * window.innerHeight * renderer.dpr,
    ];
  }

  function setMode(next: Mode, opts?: SetModeOpts) {
    mode = next;
    const defaults = MODE_DEFAULTS[next];
    program.uniforms.uNoiseScale.value = opts?.noiseScale ?? defaults.noiseScale;
    program.uniforms.uPeakAA.value = opts?.peakAA ?? defaults.peakAA;
    program.uniforms.uPeakStrength.value = opts?.strength ?? 1.0;

    const spawn = peaks[0]?.current ?? initialOff;

    if (next === 'locked') {
      lockedPeaks = (opts?.peaks ?? []).slice();
      lockedSegs = (opts?.segments ?? []).slice();
      peaks.length = 0;
      segs.length = 0;
      // Peaks emerge from the current cursor/peak position and disperse out
      for (const np of lockedPeaks) {
        peaks.push({
          target: denorm(np),
          current: [...spawn],
          falloff: np.falloff ?? DEFAULT_PEAK_FALLOFF,
          strength: np.strength ?? DEFAULT_PEAK_STRENGTH,
        });
      }
      // Segments stretch out from the same spawn point — both endpoints
      // start collapsed there and extend to the nodes they connect.
      for (const ns of lockedSegs) {
        segs.push({
          aTarget: denorm(ns.a),
          aCurrent: [...spawn],
          bTarget: denorm(ns.b),
          bCurrent: [...spawn],
          falloff: ns.falloff ?? DEFAULT_SEG_FALLOFF,
          strength: ns.strength ?? DEFAULT_SEG_STRENGTH,
        });
      }
    } else {
      // follow — collapse to a single mouse-tracked peak; no segments
      peaks.length = 0;
      segs.length = 0;
      lockedPeaks = [];
      lockedSegs = [];
      peaks.push({
        target: [...mouseTarget],
        current: spawn,
        falloff: DEFAULT_PEAK_FALLOFF,
        strength: DEFAULT_PEAK_STRENGTH,
      });
    }
  }

  window.__topo = { setMode };

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
  const segUniform = new Array(MAX_SEGS * 4).fill(0) as number[];
  const segParamUniform = new Array(MAX_SEGS * 2).fill(0) as number[];

  function loop() {
    // Re-derive targets each frame so resize / scroll stay correct
    if (mode === 'follow' && peaks.length > 0) {
      peaks[0].target[0] = mouseTarget[0];
      peaks[0].target[1] = mouseTarget[1];
    } else if (mode === 'locked') {
      for (let i = 0; i < peaks.length && i < lockedPeaks.length; i++) {
        const t = denorm(lockedPeaks[i]);
        peaks[i].target[0] = t[0];
        peaks[i].target[1] = t[1];
      }
      for (let i = 0; i < segs.length && i < lockedSegs.length; i++) {
        const ta = denorm(lockedSegs[i].a);
        const tb = denorm(lockedSegs[i].b);
        segs[i].aTarget[0] = ta[0];
        segs[i].aTarget[1] = ta[1];
        segs[i].bTarget[0] = tb[0];
        segs[i].bTarget[1] = tb[1];
      }
    }

    const k = 0.045;
    for (const p of peaks) {
      p.current[0] += (p.target[0] - p.current[0]) * k;
      p.current[1] += (p.target[1] - p.current[1]) * k;
    }
    for (const s of segs) {
      s.aCurrent[0] += (s.aTarget[0] - s.aCurrent[0]) * k;
      s.aCurrent[1] += (s.aTarget[1] - s.aCurrent[1]) * k;
      s.bCurrent[0] += (s.bTarget[0] - s.bCurrent[0]) * k;
      s.bCurrent[1] += (s.bTarget[1] - s.bCurrent[1]) * k;
    }

    for (let i = 0; i < MAX_PEAKS; i++) {
      const b = i * 4;
      if (i < peaks.length) {
        peakUniform[b]     = peaks[i].current[0];
        peakUniform[b + 1] = peaks[i].current[1];
        peakUniform[b + 2] = peaks[i].falloff;
        peakUniform[b + 3] = peaks[i].strength;
      } else {
        peakUniform[b]     = 0;
        peakUniform[b + 1] = 0;
        peakUniform[b + 2] = 1;
        peakUniform[b + 3] = 0;
      }
    }
    for (let i = 0; i < MAX_SEGS; i++) {
      const b4 = i * 4;
      const b2 = i * 2;
      if (i < segs.length) {
        segUniform[b4]     = segs[i].aCurrent[0];
        segUniform[b4 + 1] = segs[i].aCurrent[1];
        segUniform[b4 + 2] = segs[i].bCurrent[0];
        segUniform[b4 + 3] = segs[i].bCurrent[1];
        segParamUniform[b2]     = segs[i].falloff;
        segParamUniform[b2 + 1] = segs[i].strength;
      } else {
        segUniform[b4]     = 0;
        segUniform[b4 + 1] = 0;
        segUniform[b4 + 2] = 0;
        segUniform[b4 + 3] = 0;
        segParamUniform[b2]     = 1;
        segParamUniform[b2 + 1] = 0;
      }
    }

    program.uniforms.uPeaks.value = peakUniform;
    program.uniforms.uPeakCount.value = Math.min(peaks.length, MAX_PEAKS);
    program.uniforms.uSegments.value = segUniform;
    program.uniforms.uSegParams.value = segParamUniform;
    program.uniforms.uSegCount.value = Math.min(segs.length, MAX_SEGS);
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

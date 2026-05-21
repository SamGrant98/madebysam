import { Renderer, Program, Mesh, Triangle } from 'ogl';

// Topo shader with a built-in morph from contour map → node-link network.
// A single uMorph uniform (0..1) drives the transition; the JS layer animates
// it and scales per-feature strengths in lockstep:
//
//   uMorph = 0   → home topo:  full noise, mouse-follow peak, no segments,
//                              no network lines.
//   uMorph = 0.5 → transition: half noise, segment RIDGES at peak strength
//                              (contour lines pull along each path), faint
//                              direct lines starting to appear.
//   uMorph = 1   → network:    minimal noise, segments fully faded, direct
//                              thin lines drawn between landmark dots, small
//                              "landmark" peaks anchor each dot.
//
// Because the canvas persists across Astro navigation, animating uMorph back
// to 0 from outside /lab smoothly dissolves the network back into the topo.

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

  uniform vec4  uPeaks[MAX_PEAKS];      // xy=pos, z=falloff, w=strength (already morph-scaled by JS)
  uniform int   uPeakCount;
  uniform vec4  uSegments[MAX_SEGS];    // (ax, ay, bx, by) px
  uniform vec2  uSegParams[MAX_SEGS];   // (falloff, strength — strength morph-scaled by JS)
  uniform int   uSegCount;

  uniform float uPeakStrength;    // global multiplier (kept for crossfades)
  uniform float uPeakAA;          // line-widening near peaks (0 = uniform)
  uniform float uMorph;           // 0 = topo, 1 = network

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

    // Noise field dims as we approach the network state — keeps a faint
    // texture under the network rather than going to dead black.
    float noiseScale = mix(1.0, 0.1, uMorph);
    float h = noiseScale * fbm(uv * 1.5);
    float maxShape = 0.0;

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

    // Segments sharpen as morph progresses — wider ridges flanking paths
    // mid-morph collapse toward the centreline near uMorph = 1.
    float segFalloffMult = mix(1.0, 4.0, uMorph);
    for (int i = 0; i < MAX_SEGS; i++) {
      if (i >= uSegCount) break;
      vec4 s = uSegments[i];
      vec2 sa = (s.xy - 0.5 * res) / min(res.x, res.y);
      vec2 sb = (s.zw - 0.5 * res) / min(res.x, res.y);
      float d = distSegment(uv, sa, sb);
      vec2 sp = uSegParams[i];
      float falloff = max(0.5, sp.x) * segFalloffMult;
      float ridge = 1.0 / (1.0 + d * d * falloff);
      h += sp.y * uPeakStrength * ridge;
    }

    float bands = 8.0;
    float v = fract(h * bands);
    float edge = min(v, 1.0 - v);

    // AA glow scales with (1 - uMorph) so the cursor halo fades out as the
    // map "resolves" into the network.
    float baseAA = bands / min(res.x, res.y) * 1.5;
    float peakAA_active = uPeakAA * (1.0 - uMorph);
    float aa = baseAA * (1.0 + maxShape * uPeakStrength * peakAA_active);

    float minorLine = 1.0 - smoothstep(0.0, aa, edge);
    float majorLine = 1.0 - smoothstep(0.0, aa * 1.5, edge);
    float bandNum = floor(h * bands);
    float isMajor = step(mod(bandNum, 5.0), 0.5);
    float contourLine = mix(minorLine * 0.8, majorLine, isMajor);

    // Direct network lines — render thin straight strokes between every
    // active segment's endpoints. They fade in during the second half of the
    // morph so the contour ridges have time to "lead the eye in" first.
    float networkLine = 0.0;
    float lineUv = 1.4 / min(res.x, res.y);
    for (int i = 0; i < MAX_SEGS; i++) {
      if (i >= uSegCount) break;
      vec4 s = uSegments[i];
      vec2 sa = (s.xy - 0.5 * res) / min(res.x, res.y);
      vec2 sb = (s.zw - 0.5 * res) / min(res.x, res.y);
      float d = distSegment(uv, sa, sb);
      networkLine = max(networkLine, smoothstep(lineUv, 0.0, d));
    }
    networkLine *= smoothstep(0.5, 1.0, uMorph) * 0.6;

    float totalLine = max(contourLine, networkLine);
    vec3 col = mix(uBg, uLine, totalLine);
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

type NormPos = { x: number; y: number; falloff?: number; strength?: number };
type NormSeg = {
  a: { x: number; y: number };
  b: { x: number; y: number };
  falloff?: number;
  strength?: number;
};

type PeakRole = 'mouse' | 'landmark';
type Peak = {
  target: [number, number];
  current: [number, number];
  falloff: number;
  baseStrength: number;
  role: PeakRole;
};
type Seg = {
  aTarget: [number, number];
  aCurrent: [number, number];
  bTarget: [number, number];
  bCurrent: [number, number];
  falloff: number;
  baseStrength: number;
};

const DEFAULT_PEAK_FALLOFF = 8.0;
const DEFAULT_PEAK_STRENGTH = 0.55;
const DEFAULT_SEG_FALLOFF = 28.0;
const DEFAULT_SEG_STRENGTH = 0.7;
const DEFAULT_PEAK_AA = 4.0;

export interface TopoController {
  // Configure landmark peaks and segments. Strengths supplied here are the
  // BASE strengths — actual contribution scales with morph value each frame.
  // Passing empty arrays (or omitted fields) clears the previous targets.
  setMorphTargets(opts: { peaks?: NormPos[]; segments?: NormSeg[] }): void;
  // Animate morph value (0 = topo, 1 = network) over the given duration.
  // Pass 0 for an instant set.
  setMorph(target: number, durationMs?: number): void;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Window { __topo?: TopoController; }
}

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
      uPeakCount: { value: 0 },
      uSegments: { value: new Array(MAX_SEGS * 4).fill(0) },
      uSegParams: { value: new Array(MAX_SEGS * 2).fill(0) },
      uSegCount: { value: 0 },
      uPeakStrength: { value: 1.0 },
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

  const peaks: Peak[] = [];
  const segs: Seg[] = [];
  let lockedPeaks: NormPos[] = [];
  let lockedSegs: NormSeg[] = [];

  // Mouse-follow peak — index 0, always present.
  const initialOff = [
    window.innerWidth * 0.5 * renderer.dpr,
    -window.innerHeight * 0.6 * renderer.dpr,
  ] as [number, number];
  peaks.push({
    target: [...initialOff],
    current: [...initialOff],
    falloff: DEFAULT_PEAK_FALLOFF,
    baseStrength: DEFAULT_PEAK_STRENGTH,
    role: 'mouse',
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

  function setMorphTargets(opts: { peaks?: NormPos[]; segments?: NormSeg[] }) {
    // Remove existing landmark peaks (keep the mouse-follow peak at idx 0)
    for (let i = peaks.length - 1; i >= 0; i--) {
      if (peaks[i].role === 'landmark') peaks.splice(i, 1);
    }
    const np = opts.peaks ?? [];
    lockedPeaks = np.slice();
    for (const p of np) {
      // Landmark peaks placed AT target — they fade in via strength scaling,
      // no need to fly in from the cursor (would look like swarming dots).
      const t = denorm(p);
      peaks.push({
        target: [...t],
        current: [...t],
        falloff: p.falloff ?? DEFAULT_PEAK_FALLOFF,
        baseStrength: p.strength ?? DEFAULT_PEAK_STRENGTH,
        role: 'landmark',
      });
    }
    const ns = opts.segments ?? [];
    lockedSegs = ns.slice();
    segs.length = 0;
    for (const s of ns) {
      const a = denorm(s.a);
      const b = denorm(s.b);
      segs.push({
        aTarget: [...a],
        aCurrent: [...a],
        bTarget: [...b],
        bCurrent: [...b],
        falloff: s.falloff ?? DEFAULT_SEG_FALLOFF,
        baseStrength: s.strength ?? DEFAULT_SEG_STRENGTH,
      });
    }
  }

  window.__topo = { setMorphTargets, setMorph };

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
    // Advance morph animation
    if (morphValue !== morphTarget) {
      const elapsed = (performance.now() - morphStartTime) / morphDuration;
      if (elapsed >= 1) {
        morphValue = morphTarget;
      } else {
        morphValue = morphFrom + (morphTarget - morphFrom) * easeInOutCubic(elapsed);
      }
    }
    const m = morphValue;

    // Per-frame strength scaling:
    //   mouseMul    — fades out as morph progresses (network state has no cursor peak)
    //   landmarkMul — fades in as morph progresses (small hills under each dot)
    //   ridgeMul    — bell curve, max at m=0.5 (ridges are TRANSITION state)
    const mouseMul = 1 - m;
    const landmarkMul = m;
    const ridgeMul = m * (1 - m) * 4;

    // Mouse target
    if (peaks.length > 0 && peaks[0].role === 'mouse') {
      peaks[0].target[0] = mouseTarget[0];
      peaks[0].target[1] = mouseTarget[1];
    }
    // Re-derive landmark targets on resize
    let landIdx = 0;
    for (const p of peaks) {
      if (p.role !== 'landmark') continue;
      const np = lockedPeaks[landIdx++];
      if (np) {
        const t = denorm(np);
        p.target[0] = t[0];
        p.target[1] = t[1];
      }
    }
    for (let i = 0; i < segs.length && i < lockedSegs.length; i++) {
      const ns = lockedSegs[i];
      const a = denorm(ns.a);
      const b = denorm(ns.b);
      segs[i].aTarget[0] = a[0];
      segs[i].aTarget[1] = a[1];
      segs[i].bTarget[0] = b[0];
      segs[i].bTarget[1] = b[1];
    }

    // Smooth position pursuit (mostly for the mouse peak — landmarks are at
    // target already, so this is a no-op for them)
    const k = 0.045;
    for (const p of peaks) {
      p.current[0] += (p.target[0] - p.current[0]) * k;
      p.current[1] += (p.target[1] - p.current[1]) * k;
    }

    // Pack peaks with morph-scaled strengths
    for (let i = 0; i < MAX_PEAKS; i++) {
      const b = i * 4;
      if (i < peaks.length) {
        const p = peaks[i];
        let eff = p.baseStrength;
        if (p.role === 'mouse') eff *= mouseMul;
        else if (p.role === 'landmark') eff *= landmarkMul;
        peakUniform[b]     = p.current[0];
        peakUniform[b + 1] = p.current[1];
        peakUniform[b + 2] = p.falloff;
        peakUniform[b + 3] = eff;
      } else {
        peakUniform[b]     = 0;
        peakUniform[b + 1] = 0;
        peakUniform[b + 2] = 1;
        peakUniform[b + 3] = 0;
      }
    }
    // Pack segments — JS scales strength by the bell curve so ridges only
    // peak mid-morph and fade at both ends.
    for (let i = 0; i < MAX_SEGS; i++) {
      const b4 = i * 4;
      const b2 = i * 2;
      if (i < segs.length) {
        const s = segs[i];
        segUniform[b4]     = s.aCurrent[0];
        segUniform[b4 + 1] = s.aCurrent[1];
        segUniform[b4 + 2] = s.bCurrent[0];
        segUniform[b4 + 3] = s.bCurrent[1];
        segParamUniform[b2]     = s.falloff;
        segParamUniform[b2 + 1] = s.baseStrength * ridgeMul;
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

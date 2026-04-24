import { Renderer, Program, Mesh, Triangle } from 'ogl';

const vertex = /* glsl */ `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;

  uniform vec2  uResolution;
  uniform vec2  uMouse;
  uniform float uTime;
  uniform vec3  uBg;
  uniform vec3  uLine;

  // IQ-style value noise
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

  // Fractal brownian motion — stacks noise octaves for organic shapes
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 res = uResolution;
    vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);
    vec2 mouse = (uMouse - 0.5 * res) / min(res.x, res.y);

    // Mouse warps the noise field — stronger near the cursor, fades with distance
    vec2 toMouse = uv - mouse;
    float d = length(toMouse);
    float warpAmt = 0.35 / (1.0 + d * d * 10.0);
    uv -= normalize(toMouse + 1e-6) * warpAmt;

    // Slow drift so the map is never fully still
    uv += vec2(uTime * 0.015, uTime * 0.008);

    float n = fbm(uv * 2.2);

    // fract() turns smooth noise into repeating bands — the contour trick
    float bands = 9.0;
    float v = fract(n * bands);
    float edge = min(v, 1.0 - v);

    // Antialiased line via fwidth — keeps lines crisp at any DPR
    float aa = fwidth(n * bands) * 1.4;
    float line = 1.0 - smoothstep(0.0, aa, edge);

    vec3 col = mix(uBg, uLine, line);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim();
  if (h.length < 6) return [0, 0, 0];
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
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
      uResolution: { value: [canvas.clientWidth, canvas.clientHeight] },
      uMouse: { value: [0, 0] },
      uTime: { value: 0 },
      uBg: { value: [1, 1, 1] },
      uLine: { value: [0, 0, 0] },
    },
  });
  const mesh = new Mesh(gl, { geometry, program });

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h);
    program.uniforms.uResolution.value = [w * renderer.dpr, h * renderer.dpr];
  }
  resize();
  window.addEventListener('resize', resize);

  // Smoothed mouse — the raw position is target, `current` is what the shader uses
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };

  function onPointer(e: PointerEvent) {
    target.x = e.clientX * renderer.dpr;
    target.y = (window.innerHeight - e.clientY) * renderer.dpr; // flip Y for GL coords
  }
  window.addEventListener('pointermove', onPointer);

  // Pull theme colors from CSS custom properties so the shader follows light/dark
  function readColors() {
    const styles = getComputedStyle(document.documentElement);
    const bg = hexToRgb(styles.getPropertyValue('--color-bg'));
    const line = hexToRgb(styles.getPropertyValue('--color-fg'));
    program.uniforms.uBg.value = bg;
    program.uniforms.uLine.value = line;
  }
  readColors();

  const themeObserver = new MutationObserver(readColors);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  const start = performance.now();
  let rafId = 0;
  function loop() {
    current.x += (target.x - current.x) * 0.08;
    current.y += (target.y - current.y) * 0.08;
    program.uniforms.uMouse.value = [current.x, current.y];
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
  };
}

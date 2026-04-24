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

  // Rotating each octave breaks up axis-aligned artifacts → organic flowing curves
  const mat2 kRot = mat2(0.8775826, 0.4794255, -0.4794255, 0.8775826); // ~27.5° rotation
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
    vec2 mouse = (uMouse - 0.5 * res) / min(res.x, res.y);

    // Base terrain — static fbm noise field
    float h = fbm(uv * 1.5);

    // Cursor adds a soft elevation peak so contour lines form rings around it
    float dist = length(uv - mouse);
    float peakShape = 1.0 / (1.0 + dist * dist * 8.0); // 0..1, 1 at cursor
    h += 0.6 * peakShape;

    // fract() → repeating bands → contour lines
    float bands = 8.0;
    float v = fract(h * bands);
    float edge = min(v, 1.0 - v);

    // Adaptive AA — baseline tight AA for crisp lines, wider near the cursor
    // where rings crowd together. Pure math, no derivatives required.
    float baseAA = bands / min(res.x, res.y) * 1.5;
    float aa = baseAA * (1.0 + peakShape * 4.0);
    float line = 1.0 - smoothstep(0.0, aa, edge);

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
      uMouse: { value: [0, 0] },
      uTime: { value: 0 },
      uBg: { value: [0, 0, 0] },
      uLine: { value: [1, 1, 1] },
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

  // Start the peak off-screen (below the viewport) so the initial frame has
  // no visible cursor hill — it'll glide in when the user first moves the mouse.
  const offX = window.innerWidth * 0.5 * renderer.dpr;
  const offY = -window.innerHeight * 0.6 * renderer.dpr;
  const target = { x: offX, y: offY };
  const current = { x: offX, y: offY };
  function onPointer(e: PointerEvent) {
    target.x = e.clientX * renderer.dpr;
    target.y = (window.innerHeight - e.clientY) * renderer.dpr;
  }
  window.addEventListener('pointermove', onPointer);

  // Pull theme colors from CSS custom properties so the shader follows light/dark
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
  function loop() {
    // Low lerp factor → smooth, gliding cursor pursuit
    current.x += (target.x - current.x) * 0.045;
    current.y += (target.y - current.y) * 0.045;
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

import { useEffect, useRef, useState } from 'react';

/* ─────────────────────────────────────────────────────────────────────────
   The landing-page background: a Lorenz attractor drawn as a few smooth
   ribbons, drifting and reacting to scroll.

   Chosen because it is the subject matter rather than decoration bolted on —
   the Lorenz system is the canonical example of why numerical integration is
   hard, so the thing behind the headline is the thing the site teaches. It is
   integrated with RK4 because forward Euler visibly distorts the attractor,
   which would be an embarrassing thing to ship here.

   Deliberately a small number of CONTINUOUS lines rather than a dense point
   cloud. An earlier version drew 90k individual points; it was legible as an
   image but it read as visual noise next to body text, and a busy background
   beside prose is the thing this design is supposed to avoid.

   MONOCHROME, on purpose. An earlier pass swept the whole palette along each
   curve, which made an elegant object look cheap — several unrelated hues at
   once reads as decoration. One hue with luminance varying along a travelling
   pulse reads as light. The motion carries the interest that colour was
   failing to carry: glowing heads run along each trajectory and fade behind
   themselves, so the attractor looks lit rather than painted.

   Raw WebGL2 rather than three.js: this is a handful of static curves and one
   camera, and 600 KB of scene graph would be a poor trade for a background.
   ───────────────────────────────────────────────────────────────────────── */

const TRAILS = 5;          // separate trajectories
const STEPS = 5200;        // points per trajectory
const DT = 0.0042;

const SIGMA = 10, RHO = 28, BETA = 8 / 3;

interface Ribbon { positions: Float32Array; nexts: Float32Array; sides: Float32Array; shades: Float32Array; seeds: Float32Array; counts: number[]; offsets: number[] }

/** Integrates the trajectories and expands each into a triangle strip. */
function buildRibbons(): Ribbon {
  const vertsPerTrail = STEPS * 2;
  const total = vertsPerTrail * TRAILS;

  const positions = new Float32Array(total * 3);
  const nexts = new Float32Array(total * 3);
  const sides = new Float32Array(total);
  const shades = new Float32Array(total);
  const seeds = new Float32Array(total);
  const counts: number[] = [];
  const offsets: number[] = [];

  const f = (a: number, b: number, c: number) =>
    [SIGMA * (b - a), a * (RHO - c) - b, a * b - BETA * c] as const;

  let v = 0;
  for (let trail = 0; trail < TRAILS; trail++) {
    offsets.push(v);

    // Nearby initial conditions: they track together, then separate. That
    // divergence is the attractor's whole point, and it is what gives the
    // ribbons their layered structure.
    let x = 0.9 + trail * 0.0009;
    let y = 0.4;
    let z = 1.2;

    // Discard the transient so every ribbon starts on the attractor itself.
    for (let i = 0; i < 1500; i++) {
      const k1 = f(x, y, z);
      const k2 = f(x + (DT / 2) * k1[0], y + (DT / 2) * k1[1], z + (DT / 2) * k1[2]);
      const k3 = f(x + (DT / 2) * k2[0], y + (DT / 2) * k2[1], z + (DT / 2) * k2[2]);
      const k4 = f(x + DT * k3[0], y + DT * k3[1], z + DT * k3[2]);
      x += (DT / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      y += (DT / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      z += (DT / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    }

    const path = new Float32Array(STEPS * 3);
    for (let i = 0; i < STEPS; i++) {
      path[i * 3] = x;
      path[i * 3 + 1] = y;
      path[i * 3 + 2] = z - 25;          // centre the attractor body

      const k1 = f(x, y, z);
      const k2 = f(x + (DT / 2) * k1[0], y + (DT / 2) * k1[1], z + (DT / 2) * k1[2]);
      const k3 = f(x + (DT / 2) * k2[0], y + (DT / 2) * k2[1], z + (DT / 2) * k2[2]);
      const k4 = f(x + DT * k3[0], y + DT * k3[1], z + DT * k3[2]);
      x += (DT / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      y += (DT / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      z += (DT / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    }

    // Two vertices per path point, offset either side of the curve in the
    // shader. The last point reuses its own position as `next`, giving a
    // zero-length tangent that the shader falls back on.
    for (let i = 0; i < STEPS; i++) {
      const j = Math.min(i + 1, STEPS - 1);
      for (const side of [1, -1]) {
        positions[v * 3] = path[i * 3];
        positions[v * 3 + 1] = path[i * 3 + 1];
        positions[v * 3 + 2] = path[i * 3 + 2];
        nexts[v * 3] = path[j * 3];
        nexts[v * 3 + 1] = path[j * 3 + 1];
        nexts[v * 3 + 2] = path[j * 3 + 2];
        sides[v] = side;
        shades[v] = i / STEPS;
        seeds[v] = trail * 0.37;      // desynchronise the pulses per trajectory
        v++;
      }
    }
    counts.push(vertsPerTrail);
  }

  return { positions, nexts, sides, shades, seeds, counts, offsets };
}

const VERT = `#version 300 es
in vec3 a_pos;
in vec3 a_next;
in float a_side;
in float a_shade;
in float a_seed;

uniform mat4 u_mvp;
uniform float u_width;     // half-width in clip units
uniform float u_aspect;

out float v_shade;
out float v_depth;
out float v_seed;

void main() {
  vec4 clip = u_mvp * vec4(a_pos, 1.0);
  vec4 clipNext = u_mvp * vec4(a_next, 1.0);

  // Expand perpendicular to the curve in SCREEN space, so the ribbon keeps a
  // constant visual width regardless of depth. Aspect correction keeps it from
  // going oval on a wide viewport.
  vec2 ndc = clip.xy / max(clip.w, 1e-4);
  vec2 ndcNext = clipNext.xy / max(clipNext.w, 1e-4);
  vec2 delta = (ndcNext - ndc) * vec2(u_aspect, 1.0);

  vec2 dir = length(delta) > 1e-6 ? normalize(delta) : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x) / vec2(u_aspect, 1.0);

  clip.xy += normal * a_side * u_width * clip.w;
  gl_Position = clip;

  v_shade = a_shade;
  v_seed = a_seed;
  v_depth = clamp(1.0 - (clip.w - 24.0) / 74.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

in float v_shade;
in float v_depth;
in float v_seed;
out vec4 outColor;

uniform float u_fade;
uniform float u_time;

/* Monochrome. One hue, and the only thing that varies is how hot it is —
   deep magenta at rest, rising through rose to near-white at a pulse head.
   Varying luminance within a single hue reads as light; varying hue reads as
   paint, and paint is what made the previous version look cheap. */
const vec3 EMBER = vec3(0.62, 0.10, 0.30);   // resting line
const vec3 FLARE = vec3(1.00, 0.72, 0.86);   // pulse head

const float PULSES = 3.0;    // travelling glows per trajectory
const float SPEED  = 0.055;
const float TAIL   = 11.0;   // higher = shorter, sharper tail

void main() {
  // Position within a repeating pulse cycle. 0 at the head, rising along the
  // tail behind it, so exp(-p * TAIL) gives a comet that fades backwards.
  float p = fract((v_shade - u_time * SPEED) * PULSES + v_seed);
  float comet = exp(-p * TAIL);

  vec3 col = mix(EMBER, FLARE, comet);

  // The resting line is barely there; the pulse is what you actually see.
  float base = 0.035 + 0.10 * v_depth;
  float glow = comet * (0.30 + 0.55 * v_depth);
  float a = (base + glow) * u_fade;

  outColor = vec4(col * a, a);
}`;

function mvp(aspect: number, yaw: number, pitch: number, dist: number): Float32Array {
  const fov = 1.05, near = 0.1, far = 400;
  const f = 1 / Math.tan(fov / 2);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);

  const r = [cy, sp * sy, -cp * sy, 0, cp, sp, sy, -sp * cy, cp * cy];

  const m = new Float32Array(16);
  const p00 = f / aspect, p11 = f;
  const p22 = (far + near) / (near - far), p23 = (2 * far * near) / (near - far);

  m[0] = p00 * r[0];  m[1] = p11 * r[3];  m[2] = p22 * r[6];          m[3] = -r[6];
  m[4] = p00 * r[1];  m[5] = p11 * r[4];  m[6] = p22 * r[7];          m[7] = -r[7];
  m[8] = p00 * r[2];  m[9] = p11 * r[5];  m[10] = p22 * r[8];         m[11] = -r[8];
  m[12] = 0;          m[13] = 0;          m[14] = p22 * -dist + p23;  m[15] = dist;
  return m;
}

export default function AttractorField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ok, setOk] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true });
    if (!gl) { setOk(false); return; }

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { setOk(false); return; }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { setOk(false); return; }

    const rib = buildRibbons();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const bind = (data: Float32Array, name: string, size: number) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      return buf;
    };
    const buffers = [
      bind(rib.positions, 'a_pos', 3),
      bind(rib.nexts, 'a_next', 3),
      bind(rib.sides, 'a_side', 1),
      bind(rib.shades, 'a_shade', 1),
      bind(rib.seeds, 'a_seed', 1),
    ];

    const uMvp = gl.getUniformLocation(prog, 'u_mvp');
    const uWidth = gl.getUniformLocation(prog, 'u_width');
    const uAspect = gl.getUniformLocation(prog, 'u_aspect');
    const uFade = gl.getUniformLocation(prog, 'u_fade');
    const uTime = gl.getUniformLocation(prog, 'u_time');

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const W = Math.round(canvas.clientWidth * dpr);
      const H = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W; canvas.height = H;
        gl.viewport(0, 0, W, H);
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    let scrollTarget = 0;
    let scrollEased = 0;
    const onScroll = () => {
      const max = Math.max(document.body.scrollHeight - window.innerHeight, 1);
      scrollTarget = Math.min(window.scrollY / max, 1);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    let raf = 0;
    const t0 = performance.now();
    let fade = 0;

    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      scrollEased += (scrollTarget - scrollEased) * 0.06;
      fade = Math.min(fade + 0.011, 1);

      resize();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const aspect = canvas.width / Math.max(canvas.height, 1);
      const yaw = reduced ? 0.7 : 0.7 + t * 0.035 + scrollEased * 2.2;
      const pitch = -0.2 + scrollEased * 0.5;
      const dist = 58 - scrollEased * 14;

      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniformMatrix4fv(uMvp, false, mvp(aspect, yaw, pitch, dist));
      gl.uniform1f(uWidth, 0.0016);
      gl.uniform1f(uAspect, aspect);
      gl.uniform1f(uFade, fade * (1 - scrollEased * 0.6));
      // Frozen under reduced-motion: the pulses become static highlights.
      gl.uniform1f(uTime, reduced ? 0.0 : t);

      for (let i = 0; i < rib.counts.length; i++) {
        gl.drawArrays(gl.TRIANGLE_STRIP, rib.offsets[i], rib.counts[i]);
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      ro.disconnect();
      gl.deleteProgram(prog);
      for (const b of buffers) gl.deleteBuffer(b);
      gl.deleteVertexArray(vao);
    };
  }, []);

  if (!ok) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        maskImage:
          'radial-gradient(82% 88% at 76% 30%, #000 24%, transparent 78%), linear-gradient(90deg, transparent 0%, transparent 38%, #000 60%)',
        WebkitMaskImage:
          'radial-gradient(82% 88% at 76% 30%, #000 24%, transparent 78%), linear-gradient(90deg, transparent 0%, transparent 38%, #000 60%)',
        maskComposite: 'intersect',
        WebkitMaskComposite: 'source-in',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', left: '28%', top: 0, width: '86%', height: '100%', display: 'block' }}
      />
    </div>
  );
}

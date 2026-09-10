import { useEffect, useRef, useState } from 'react';

/* ─────────────────────────────────────────────────────────────────────────
   The landing-page background: a Lorenz attractor, drifting and reacting to
   scroll.

   Chosen because it is the subject matter rather than decoration bolted on.
   The Lorenz system is the canonical example of why numerical integration is
   hard — deterministic, bounded, and impossible to predict far ahead — so the
   thing behind the headline is the thing the site teaches.

   Written against raw WebGL2 rather than three.js: this is a static point
   cloud with one rotating camera, and pulling ~600 KB of scene graph onto the
   landing page to draw it would be a poor trade for a background.
   ───────────────────────────────────────────────────────────────────────── */

const N = 90_000;      // integration steps, one point each
const DT = 0.0035;

/** Classic Lorenz parameters — the ones that give the butterfly. */
const SIGMA = 10, RHO = 28, BETA = 8 / 3;

function buildAttractor(): { positions: Float32Array; shades: Float32Array } {
  const positions = new Float32Array(N * 3);
  const shades = new Float32Array(N);

  let x = 0.9, y = 0, z = 1.2;

  // RK4 on the Lorenz system. Euler visibly distorts the attractor's shape at
  // this step size, which would be an embarrassing thing to ship on the
  // landing page of a numerical-methods site.
  const f = (a: number, b: number, c: number) =>
    [SIGMA * (b - a), a * (RHO - c) - b, a * b - BETA * c] as const;

  for (let i = 0; i < N; i++) {
    const k1 = f(x, y, z);
    const k2 = f(x + (DT / 2) * k1[0], y + (DT / 2) * k1[1], z + (DT / 2) * k1[2]);
    const k3 = f(x + (DT / 2) * k2[0], y + (DT / 2) * k2[1], z + (DT / 2) * k2[2]);
    const k4 = f(x + DT * k3[0], y + DT * k3[1], z + DT * k3[2]);

    x += (DT / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    y += (DT / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    z += (DT / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z - 25;    // centre the body of the attractor
    shades[i] = i / N;                // colour along the trajectory, not by position
  }
  return { positions, shades };
}

const VERT = `#version 300 es
in vec3 a_pos;
in float a_shade;

uniform mat4 u_mvp;
uniform float u_size;
uniform float u_reveal;

out float v_shade;
out float v_depth;

void main() {
  vec4 clip = u_mvp * vec4(a_pos, 1.0);
  gl_Position = clip;

  // Perspective-correct point size, clamped so near points do not become blobs.
  float d = max(clip.w, 0.001);
  gl_PointSize = clamp(u_size / d, 1.0, 5.5);

  v_shade = a_shade;
  v_depth = clamp(1.0 - (d - 20.0) / 70.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

in float v_shade;
in float v_depth;
out vec4 outColor;

uniform float u_fade;

vec3 iridescent(float t) {
  vec3 magenta = vec3(1.000, 0.302, 0.620);
  vec3 iris    = vec3(0.655, 0.545, 0.980);
  vec3 cyan    = vec3(0.361, 0.882, 0.902);
  vec3 aqua    = vec3(0.604, 0.961, 0.941);
  t = fract(t);
  if (t < 0.34) return mix(magenta, iris, t / 0.34);
  if (t < 0.68) return mix(iris, cyan, (t - 0.34) / 0.34);
  return mix(cyan, aqua, (t - 0.68) / 0.32);
}

void main() {
  // Round, soft-edged points. Square points read as noise at this density.
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;
  float soft = 1.0 - smoothstep(0.16, 0.5, r);

  vec3 col = iridescent(v_shade * 1.6);
  float a = soft * (0.12 + 0.46 * v_depth) * u_fade;
  outColor = vec4(col * a, a);
}`;

/** Column-major perspective * lookAt * rotateY, built by hand to avoid a
 *  matrix library for four multiplications. */
function mvp(aspect: number, yaw: number, pitch: number, dist: number): Float32Array {
  const fov = 1.05, near = 0.1, far = 400;
  const f = 1 / Math.tan(fov / 2);

  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);

  // rotate about Y then X, then translate away from the camera
  const r = [
    cy, sp * sy, -cp * sy,
    0, cp, sp,
    sy, -sp * cy, cp * cy,
  ];

  const m = new Float32Array(16);
  const p00 = f / aspect, p11 = f;
  const p22 = (far + near) / (near - far), p23 = (2 * far * near) / (near - far);

  m[0] = p00 * r[0];  m[1] = p11 * r[3];  m[2] = p22 * r[6];             m[3] = -r[6];
  m[4] = p00 * r[1];  m[5] = p11 * r[4];  m[6] = p22 * r[7];             m[7] = -r[7];
  m[8] = p00 * r[2];  m[9] = p11 * r[5];  m[10] = p22 * r[8];            m[11] = -r[8];
  m[12] = 0;          m[13] = 0;          m[14] = p22 * -dist + p23;     m[15] = dist;
  return m;
}

export default function AttractorField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ok, setOk] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true });
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

    const { positions, shades } = buildAttractor();

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

    const shadeBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, shadeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, shades, gl.STATIC_DRAW);
    const aShade = gl.getAttribLocation(prog, 'a_shade');
    gl.enableVertexAttribArray(aShade);
    gl.vertexAttribPointer(aShade, 1, gl.FLOAT, false, 0, 0);

    const uMvp = gl.getUniformLocation(prog, 'u_mvp');
    const uSize = gl.getUniformLocation(prog, 'u_size');
    const uFade = gl.getUniformLocation(prog, 'u_fade');

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied, additive-ish glow

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    let dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const W = Math.round(w * dpr), H = Math.round(h * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W; canvas.height = H;
        gl.viewport(0, 0, W, H);
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    // Scroll drives the camera. Smoothed, because raw scroll position makes
    // the motion feel jittery and cheap.
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
      fade = Math.min(fade + 0.012, 1);          // gentle fade-in on load

      resize();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const yaw = reduced ? 0.7 : 0.7 + t * 0.045 + scrollEased * 2.4;
      const pitch = -0.22 + scrollEased * 0.55;
      const dist = 56 - scrollEased * 16;

      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniformMatrix4fv(uMvp, false, mvp(canvas.width / Math.max(canvas.height, 1), yaw, pitch, dist));
      gl.uniform1f(uSize, 260 * dpr);
      // Fades out as the reader scrolls into the text, so it never competes.
      gl.uniform1f(uFade, fade * (1 - scrollEased * 0.55));
      gl.drawArrays(gl.POINTS, 0, N);

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      ro.disconnect();
      gl.deleteProgram(prog);
      gl.deleteBuffer(posBuf);
      gl.deleteBuffer(shadeBuf);
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
        // Held off the reading column so the text never sits on top of detail.
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

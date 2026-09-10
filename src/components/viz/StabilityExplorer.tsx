import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Panel, Readout, ReadoutRow } from './controls.tsx';
import { formatValue } from './chart-core.ts';
import { createShaderSurface, observeSize, type ShaderSurface } from './gl/webgl.ts';

/* ─────────────────────────────────────────────────────────────────────────
   The stability region of a one-step method, drawn per-pixel on the GPU.

   Every linear multistep and Runge–Kutta method applied to y' = λy collapses
   to a single complex number: the amplification factor R(z), where z = hλ.
   The method is stable exactly where |R(z)| ≤ 1, and that set is a REGION IN
   THE COMPLEX PLANE — a shape, not an inequality.

   This is the object that makes "explicit methods have a step size limit" and
   "no explicit method is A-stable" stop being rules to memorise. You drag z
   around and watch the trajectory on the right respond: cross the boundary
   and it explodes; move onto the imaginary axis and watch every explicit
   region pull away from it.

   Per-pixel on the GPU is the right tool here — the structure that matters
   (how the boundary curves, where it pinches near the imaginary axis) lives
   at a resolution a coarse CPU grid would erase.
   ───────────────────────────────────────────────────────────────────────── */

const FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform vec2  u_domainX;   // Re range
uniform vec2  u_domainY;   // Im range
uniform float u_method;
uniform vec2  u_marker;    // current z, in domain coords
uniform vec2  u_px;        // pixel size in domain units

// Complex arithmetic on vec2.
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { float d = dot(b, b); return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / d; }

/* Amplification factor R(z) per method.
   Explicit RK methods truncate exp(z); implicit ones are rational, which is
   what lets their region cover the whole left half-plane. */
float amplification(vec2 z, float method) {
  vec2 one = vec2(1.0, 0.0);
  vec2 r;

  if (method < 0.5) {
    r = one + z;                                        // forward Euler
  } else if (method < 1.5) {
    vec2 z2 = cmul(z, z);
    r = one + z + 0.5 * z2;                             // RK2 (midpoint / Heun)
  } else if (method < 2.5) {
    vec2 z2 = cmul(z, z);
    vec2 z3 = cmul(z2, z);
    vec2 z4 = cmul(z3, z);
    r = one + z + 0.5 * z2 + z3 / 6.0 + z4 / 24.0;      // RK4
  } else if (method < 3.5) {
    r = cdiv(one, one - z);                             // backward Euler
  } else {
    r = cdiv(one + 0.5 * z, one - 0.5 * z);             // implicit trapezoid
  }
  return length(r);
}

vec3 iridescent(float t) {
  vec3 magenta = vec3(1.000, 0.302, 0.620);
  vec3 iris    = vec3(0.655, 0.545, 0.980);
  vec3 cyan    = vec3(0.361, 0.882, 0.902);
  vec3 aqua    = vec3(0.604, 0.961, 0.941);
  t = clamp(t, 0.0, 1.0);
  if (t < 0.34) return mix(magenta, iris, t / 0.34);
  if (t < 0.68) return mix(iris, cyan, (t - 0.34) / 0.34);
  return mix(cyan, aqua, (t - 0.68) / 0.32);
}

void main() {
  vec2 z = vec2(
    mix(u_domainX.x, u_domainX.y, v_uv.x),
    mix(u_domainY.x, u_domainY.y, v_uv.y)
  );

  float mag = amplification(z, u_method);

  vec3 col;
  float alpha;

  if (mag <= 1.0) {
    // Inside: brighter toward the strongly-damping core, so the shape reads
    // as a basin rather than a flat blob.
    col = iridescent(1.0 - mag);
    alpha = 0.20 + 0.55 * (1.0 - mag);
  } else {
    // Outside: dark, with a faint falloff showing HOW unstable.
    float over = clamp((mag - 1.0) * 0.75, 0.0, 1.0);
    col = mix(vec3(0.10, 0.07, 0.15), vec3(0.32, 0.05, 0.14), over);
    alpha = 0.16 + 0.22 * over;
  }

  // Sharp |R| = 1 contour. Width follows the local gradient so the line stays
  // one pixel wide wherever the boundary happens to be steep or shallow.
  float gx = amplification(z + vec2(u_px.x, 0.0), u_method) - amplification(z - vec2(u_px.x, 0.0), u_method);
  float gy = amplification(z + vec2(0.0, u_px.y), u_method) - amplification(z - vec2(0.0, u_px.y), u_method);
  float grad = max(length(vec2(gx, gy)) * 0.5, 1e-5);
  float edge = 1.0 - smoothstep(0.0, grad * 1.6, abs(mag - 1.0));
  col = mix(col, vec3(1.0), edge * 0.92);
  alpha = max(alpha, edge * 0.95);

  // Axes.
  float axis = max(
    1.0 - smoothstep(0.0, u_px.x * 1.1, abs(z.x)),
    1.0 - smoothstep(0.0, u_px.y * 1.1, abs(z.y))
  );
  col = mix(col, vec3(0.72, 0.68, 0.82), axis * 0.7);
  alpha = max(alpha, axis * 0.6);

  // Marker crosshair at the currently selected z.
  vec2 d = (z - u_marker) / vec2(u_px.x, u_px.y);
  float ring = abs(length(d) - 7.0);
  float dot0 = length(d);
  float marker = max(1.0 - smoothstep(0.0, 1.6, ring), 1.0 - smoothstep(0.0, 2.6, dot0));
  col = mix(col, vec3(1.0, 0.92, 0.98), marker);
  alpha = max(alpha, marker);

  outColor = vec4(col * alpha, alpha);
}`;

interface MethodSpec {
  key: string;
  label: string;
  /** Shader branch index. */
  code: number;
  /** R(z) on the CPU, for the readouts and the trajectory. */
  R: (re: number, im: number) => [number, number];
  aStable: boolean;
  note: string;
}

const cdiv = (a: [number, number], b: [number, number]): [number, number] => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const cmul = (a: [number, number], b: [number, number]): [number, number] => [
  a[0] * b[0] - a[1] * b[1],
  a[0] * b[1] + a[1] * b[0],
];

const METHODS: MethodSpec[] = [
  {
    key: 'forward-euler', label: 'Forward Euler', code: 0, aStable: false,
    R: (re, im) => [1 + re, im],
    note: 'A disc of radius 1 centred at −1. Touches the imaginary axis only at the origin, so an undamped oscillator is unstable at every step size.',
  },
  {
    key: 'rk2', label: 'RK2', code: 1, aStable: false,
    R: (re, im) => {
      const z: [number, number] = [re, im];
      const z2 = cmul(z, z);
      return [1 + re + 0.5 * z2[0], im + 0.5 * z2[1]];
    },
    note: 'Bulges further left than Euler, and still pinches to the origin on the imaginary axis.',
  },
  {
    key: 'rk4', label: 'RK4', code: 2, aStable: false,
    R: (re, im) => {
      const z: [number, number] = [re, im];
      const z2 = cmul(z, z);
      const z3 = cmul(z2, z);
      const z4 = cmul(z3, z);
      return [
        1 + re + z2[0] / 2 + z3[0] / 6 + z4[0] / 24,
        im + z2[1] / 2 + z3[1] / 6 + z4[1] / 24,
      ];
    },
    note: 'The famous lobed shape. Crucially it DOES cover a stretch of the imaginary axis (to about ±2.83i), which is why RK4 can integrate an oscillator at all.',
  },
  {
    key: 'backward-euler', label: 'Backward Euler', code: 3, aStable: true,
    R: (re, im) => cdiv([1, 0], [1 - re, -im]),
    note: 'Stable everywhere EXCEPT a disc in the right half-plane. It covers the entire left half-plane: A-stable, no step-size limit at all.',
  },
  {
    key: 'trapezoid', label: 'Implicit trapezoid', code: 4, aStable: true,
    R: (re, im) => cdiv([1 + re / 2, im / 2], [1 - re / 2, -im / 2]),
    note: 'Stable in exactly the left half-plane. A-stable, but |R| → 1 as z → −∞, so violently stiff modes ring instead of damping — it is not L-stable.',
  },
];

const DOMAIN_X: [number, number] = [-4.2, 2.2];
const DOMAIN_Y: [number, number] = [-3.2, 3.2];

export interface StabilityExplorerProps {
  /** Method keys offered. */
  methods?: string[];
  initial?: string;
  /** Starting z = hλ. */
  z?: [number, number];
  height?: number;
  caption?: string;
}

export default function StabilityExplorer({
  methods = METHODS.map((m) => m.key),
  initial,
  z: z0 = [-0.8, 1.4],
  height = 420,
  caption,
}: StabilityExplorerProps) {
  const available = METHODS.filter((m) => methods.includes(m.key));
  const [methodKey, setMethodKey] = useState(initial ?? available[0].key);
  const method = available.find((m) => m.key === methodKey) ?? available[0];

  const [z, setZ] = useState<[number, number]>(z0);
  const [dragging, setDragging] = useState(false);
  const [supported, setSupported] = useState(true);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<ShaderSurface | null>(null);
  const sizeRef = useRef({ w: 640, h: height });

  /* ── shader surface ────────────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const surface = createShaderSurface(canvas, FRAG);
    if (!surface) { setSupported(false); return; }
    surfaceRef.current = surface;

    const stop = observeSize(wrap, (w, h) => {
      sizeRef.current = { w, h };
      surface.resize(w, h);
      render();
    });
    render();

    return () => { stop(); surface.destroy(); surfaceRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const render = useCallback(() => {
    const s = surfaceRef.current;
    if (!s) return;
    const { w, h } = sizeRef.current;
    s.set('u_domainX', DOMAIN_X);
    s.set('u_domainY', DOMAIN_Y);
    s.set('u_method', method.code);
    s.set('u_marker', z);
    s.set('u_px', [
      (DOMAIN_X[1] - DOMAIN_X[0]) / Math.max(w, 1),
      (DOMAIN_Y[1] - DOMAIN_Y[0]) / Math.max(h, 1),
    ]);
    s.draw();
  }, [method, z]);

  useEffect(() => { render(); }, [render]);

  /* ── dragging z around the plane ───────────────────────────────────────── */
  const toDomain = (clientX: number, clientY: number): [number, number] => {
    const r = wrapRef.current!.getBoundingClientRect();
    const u = (clientX - r.left) / r.width;
    const v = 1 - (clientY - r.top) / r.height;   // shader v_uv has +y up
    return [
      DOMAIN_X[0] + u * (DOMAIN_X[1] - DOMAIN_X[0]),
      DOMAIN_Y[0] + v * (DOMAIN_Y[1] - DOMAIN_Y[0]),
    ];
  };

  const onPointer = (e: React.PointerEvent) => {
    if (!wrapRef.current) return;
    setZ(toDomain(e.clientX, e.clientY));
  };

  /* ── derived quantities ────────────────────────────────────────────────── */
  const [rRe, rIm] = method.R(z[0], z[1]);
  const mag = Math.hypot(rRe, rIm);
  const stable = mag <= 1;

  /** y_{n+1} = R·y_n, real part — what the learner would actually see plotted. */
  const trajectory = useMemo(() => {
    const pts: number[] = [];
    let cur: [number, number] = [1, 0];
    for (let n = 0; n <= 28; n++) {
      pts.push(cur[0]);
      cur = cmul(cur, [rRe, rIm]);
      if (!Number.isFinite(cur[0]) || Math.abs(cur[0]) > 1e6) break;
    }
    return pts;
  }, [rRe, rIm]);

  const trajMax = Math.max(1, ...trajectory.map(Math.abs));

  return (
    <figure className="not-prose" style={{ margin: '2.5rem 0' }}>
      <Panel
        title="stability region — drag anywhere in the plane"
        right={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {available.map((m) => (
              <Button key={m.key} active={m.key === methodKey} onClick={() => setMethodKey(m.key)} accent="magenta">
                {m.label}
              </Button>
            ))}
          </div>
        }
      >
        {!supported && (
          <p style={{ color: 'var(--sig-warn)', margin: '0 0 12px' }}>
            This view needs WebGL2, which this browser did not provide.
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.55fr) minmax(0,1fr)', gap: 16 }}>
          {/* the plane */}
          <div
            ref={wrapRef}
            onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); setDragging(true); onPointer(e); }}
            onPointerMove={(e) => { if (dragging) onPointer(e); }}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            style={{
              position: 'relative', height, cursor: dragging ? 'grabbing' : 'crosshair',
              border: '1px solid var(--color-rule)', borderRadius: 'var(--radius-hud)',
              overflow: 'hidden', touchAction: 'none',
              background: 'color-mix(in oklab, var(--color-abyss) 80%, transparent)',
            }}
          >
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

            {/* Tick labels. Without a scale the region is a pretty shape;
                with one you can read off that Euler's disc ends at −2. */}
            <svg
              width="100%" height="100%"
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              aria-hidden="true"
            >
              {[-4, -3, -2, -1, 1, 2].map((v) => {
                const u = (v - DOMAIN_X[0]) / (DOMAIN_X[1] - DOMAIN_X[0]);
                const yMid = (1 - (0 - DOMAIN_Y[0]) / (DOMAIN_Y[1] - DOMAIN_Y[0])) * 100;
                return (
                  <text
                    key={`x${v}`} x={`${u * 100}%`} y={`${yMid}%`} dy="14"
                    textAnchor="middle" fill="var(--color-ink-faint)"
                    fontSize="11" fontFamily="var(--font-mono)"
                  >{v}</text>
                );
              })}
              {[-3, -2, -1, 1, 2, 3].map((v) => {
                const vv = 1 - (v - DOMAIN_Y[0]) / (DOMAIN_Y[1] - DOMAIN_Y[0]);
                const xMid = ((0 - DOMAIN_X[0]) / (DOMAIN_X[1] - DOMAIN_X[0])) * 100;
                return (
                  <text
                    key={`y${v}`} x={`${xMid}%`} y={`${vv * 100}%`} dx="7" dy="4"
                    fill="var(--color-ink-faint)" fontSize="11" fontFamily="var(--font-mono)"
                  >{v}i</text>
                );
              })}
            </svg>

            <span className="hud-label" style={{ position: 'absolute', left: 10, bottom: 8, pointerEvents: 'none' }}>
              Re(hλ)
            </span>
            <span className="hud-label" style={{ position: 'absolute', left: 10, top: 8, pointerEvents: 'none' }}>
              Im(hλ)
            </span>
            <span
              className="hud-label"
              style={{
                position: 'absolute', right: 10, top: 8, pointerEvents: 'none',
                color: stable ? 'var(--sig-ok)' : 'var(--color-magenta)',
              }}
            >
              {stable ? 'stable here' : 'unstable here'}
            </span>
          </div>

          {/* what that point does to a solution */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="hud-label">resulting solution — yₙ₊₁ = R·yₙ</span>
            <div
              style={{
                position: 'relative', flex: 1, minHeight: 180,
                border: '1px solid var(--color-rule)', borderRadius: 'var(--radius-hud)',
                background: 'color-mix(in oklab, var(--color-abyss) 80%, transparent)',
                padding: '10px 8px',
              }}
            >
              <svg width="100%" height="100%" viewBox="0 0 240 180" preserveAspectRatio="none" style={{ display: 'block' }}>
                <line x1={0} y1={90} x2={240} y2={90} stroke="var(--color-rule-bright)" strokeWidth={1} />
                {trajectory.map((v, i) => {
                  const x = (i / 28) * 240;
                  const y = 90 - (v / trajMax) * 78;
                  return (
                    <g key={i}>
                      <line x1={x} y1={90} x2={x} y2={y} stroke={stable ? 'var(--color-cyan)' : 'var(--color-magenta)'} strokeWidth={1} strokeOpacity={0.45} />
                      <circle cx={x} cy={y} r={2.6} fill={stable ? 'var(--color-cyan)' : 'var(--color-magenta)'} />
                    </g>
                  );
                })}
              </svg>
            </div>
            <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.55, color: 'var(--color-ink-faint)' }}>
              {stable
                ? mag < 0.999
                  ? 'Decays toward zero, as the true solution does.'
                  : 'Sits exactly on the boundary — neither growing nor decaying.'
                : 'Grows without bound. The true solution decays; this one runs away.'}
            </p>
          </div>
        </div>

        <ReadoutRow>
          <Readout label="z = hλ" value={`${formatValue(z[0], 3)} ${z[1] >= 0 ? '+' : '−'} ${formatValue(Math.abs(z[1]), 3)}i`} accent="ink" />
          <Readout label="|R(z)|" value={formatValue(mag, 4)} accent={stable ? 'ok' : 'magenta'} />
          <Readout label="verdict" value={stable ? 'stable' : 'unstable'} accent={stable ? 'ok' : 'magenta'} />
          <Readout label="A-stable?" value={method.aStable ? 'yes' : 'no'} accent={method.aStable ? 'ok' : 'warn'} />
        </ReadoutRow>

        <p style={{ margin: '14px 0 0', fontSize: '0.98rem', lineHeight: 1.6, color: 'var(--color-ink-soft)' }}>
          {method.note}
        </p>
      </Panel>

      {caption && (
        <figcaption style={{ marginTop: 10, fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--color-ink-faint)' }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

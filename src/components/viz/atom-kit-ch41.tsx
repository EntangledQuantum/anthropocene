/**
 * Chapter 41's small kit: a hydrogen cloud painted per pixel on the GPU, under
 * a scene's SVG stage.
 *
 * `CloudStage` shades |ψ_nlm|² on the x–z plane through the nucleus (z up),
 * the slice every textbook draws. The dark shells and dark lines are where ψ
 * is exactly zero, and they are one pixel wide: a coarse CPU grid would smear
 * the thin 4p shells into grey, which is the point of doing it per pixel.
 *
 * The GLSL builds R_nl from the same Laguerre recurrence and Y_lm from the same
 * Legendre recurrence as src/lib/physics/hydrogen.ts, and takes both
 * normalising constants from it. Nothing it paints is printed as a number;
 * every number a scene prints comes from hydrogen.ts. On the y = 0 slice
 * cos mφ is ±1, so m ≥ 0 is drawn exactly; the sin-type harmonics (m < 0) are
 * zero on this plane and are not offered.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createShaderSurface, observeSize, type ShaderSurface } from './gl/webgl.ts';
import { C, type StageApi } from './scene.tsx';
import { A0_PM, radialNorm, sliceMax, ylmNorm } from '../../lib/physics/hydrogen.ts';

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform vec4 u_map;      // world = (v - a) / b per axis, view px
uniform vec2 u_view;
uniform int u_n;
uniform int u_l;
uniform int u_m;
uniform float u_rnorm;   // radialNorm(n, l) from hydrogen.ts
uniform float u_ynorm;   // ylmNorm(l, m) from hydrogen.ts
uniform float u_scale;   // 1 / (largest density on the slice)
uniform float u_gamma;

float laguerre(int k, float a, float x) {
  if (k == 0) return 1.0;
  float prev = 1.0;
  float cur = 1.0 + a - x;
  for (int j = 1; j < 10; j++) {
    if (j >= k) break;
    float fj = float(j);
    float nx = ((2.0 * fj + 1.0 + a - x) * cur - (fj + a) * prev) / (fj + 1.0);
    prev = cur;
    cur = nx;
  }
  return cur;
}

float legendre(int l, int m, float x) {
  float pmm = 1.0;
  float s = sqrt(max(0.0, 1.0 - x * x));
  for (int i = 1; i <= 8; i++) {
    if (i > m) break;
    pmm *= (2.0 * float(i) - 1.0) * s;
  }
  if (l == m) return pmm;
  float pm1 = x * (2.0 * float(m) + 1.0) * pmm;
  if (l == m + 1) return pm1;
  float pl = 0.0;
  for (int k = 2; k <= 10; k++) {
    int kk = m + k;
    if (kk > l) break;
    pl = ((2.0 * float(kk) - 1.0) * x * pm1 - (float(kk + m) - 1.0) * pmm) / float(kk - m);
    pmm = pm1;
    pm1 = pl;
  }
  return pl;
}

void main() {
  vec2 v = vec2(v_uv.x * u_view.x, (1.0 - v_uv.y) * u_view.y);
  vec2 p = vec2((v.x - u_map.x) / u_map.y, (v.y - u_map.z) / u_map.w);
  float r = length(p);
  float rho = 2.0 * r / float(u_n);
  float rl = 1.0;
  for (int i = 0; i < 10; i++) { if (i >= u_l) break; rl *= rho; }
  float R = u_rnorm * exp(-0.5 * rho) * rl * laguerre(u_n - u_l - 1, 2.0 * float(u_l) + 1.0, rho);
  float ct = r > 1e-9 ? p.y / r : 1.0;
  float Y = u_ynorm * legendre(u_l, u_m, ct);
  float d = R * R * Y * Y * u_scale;
  float t = pow(clamp(d, 0.0, 1.0), u_gamma);
  vec3 bg = vec3(0.082, 0.075, 0.106);
  vec3 iris = vec3(0.561, 0.612, 0.961);
  vec3 col = mix(bg, iris * 0.9, t);
  col = mix(col, vec3(0.90, 0.92, 1.0), smoothstep(0.8, 1.0, t) * 0.45);
  outColor = vec4(col, 1.0);
}`;

export interface CloudState { n: number; l: number; m?: number }

/** A stage whose background is the hydrogen cloud for (n, l, m). World units
 *  are Bohr radii; x across, z up. `half` is the half-width the brightness is
 *  normalised over (use the stage's y half-range). */
export function CloudStage({ state, half, gamma = 0.42, stage }: {
  state: CloudState;
  half: number;
  gamma?: number;
  stage: (capture: (s: StageApi) => void) => ReactNode;
}) {
  const { n, l } = state;
  const m = Math.max(0, state.m ?? 0);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const surf = useRef<ShaderSurface | null>(null);
  const api = useRef<StageApi | null>(null);
  const size = useRef<[number, number]>([0, 0]);
  const peak = useMemo(() => sliceMax(n, l, m, half * 1.9), [n, l, m, half]);

  const draw = () => {
    const g = surf.current, s = api.current;
    if (!g || !s) return;
    const [w, h] = size.current;
    if (w > 0) g.resize(w, h);
    const x0 = s.sx(0), x1 = s.sx(1), y0 = s.sy(0), y1 = s.sy(1);
    g.set('u_map', [x0, x1 - x0, y0, y1 - y0]);
    g.set('u_view', [s.W, s.H]);
    g.setInt('u_n', n);
    g.setInt('u_l', l);
    g.setInt('u_m', m);
    g.set('u_rnorm', radialNorm(n, l));
    g.set('u_ynorm', ylmNorm(l, m));
    g.set('u_scale', peak > 0 ? 1 / peak : 1);
    g.set('u_gamma', gamma);
    g.draw();
  };

  useEffect(() => {
    if (!canvas.current || !wrap.current) return;
    surf.current = createShaderSurface(canvas.current, FRAG);
    const stop = observeSize(wrap.current, (w, h) => { size.current = [w, h]; draw(); });
    return () => { stop(); surf.current?.destroy(); surf.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(draw);

  return <div ref={wrap} style={{ position: 'relative' }}>
    <canvas ref={canvas} aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 6 }} />
    <div style={{ position: 'relative' }}>{stage((s) => { api.current = s; })}</div>
  </div>;
}

/** The nucleus: a small rose dot (charge-sign colour, as in chapter 21). */
export function Nucleus({ s }: { s: StageApi }) {
  return <g pointerEvents="none">
    <circle cx={s.sx(0)} cy={s.sy(0)} r={4} fill="var(--color-rose)" stroke="var(--color-surface)" strokeWidth={1.5} />
  </g>;
}

/** A length bar in picometres, bottom-left of the stage. Picks a round length
 *  close to a fifth of the view height. */
export function PmScaleBar({ s }: { s: StageApi }) {
  const spanPm = (s.y[1] - s.y[0]) * A0_PM;
  const target = spanPm / 5;
  const pm = [10, 20, 50, 100, 200, 500, 1000, 2000].reduce((b, c) => (Math.abs(c - target) < Math.abs(b - target) ? c : b));
  const a0 = pm / A0_PM;
  const x0 = s.x[0] + (s.x[1] - s.x[0]) * 0.04, y0 = s.y[0] + (s.y[1] - s.y[0]) * 0.06;
  return <g pointerEvents="none">
    <line x1={s.sx(x0)} x2={s.sx(x0 + a0)} y1={s.sy(y0)} y2={s.sy(y0)} stroke={C.ink} strokeWidth={2} />
    <line x1={s.sx(x0)} x2={s.sx(x0)} y1={s.sy(y0) - 4} y2={s.sy(y0) + 4} stroke={C.ink} strokeWidth={2} />
    <line x1={s.sx(x0 + a0)} x2={s.sx(x0 + a0)} y1={s.sy(y0) - 4} y2={s.sy(y0) + 4} stroke={C.ink} strokeWidth={2} />
    <text x={s.sx(x0 + a0 / 2)} y={s.sy(y0) - 9} textAnchor="middle" fontSize={12} fill={C.ink} fontFamily="var(--font-mono)">{pm} pm</text>
  </g>;
}

/** What the brightness means. */
export function CloudKey() {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
    <span style={{ width: 70, height: 10, borderRadius: 3, background: 'linear-gradient(90deg, var(--color-surface), var(--color-iris))', border: '1px solid var(--color-rule-bright)' }} />
    <span>chance per unit volume, |ψ|²: a slice through the nucleus</span>
  </span>;
}

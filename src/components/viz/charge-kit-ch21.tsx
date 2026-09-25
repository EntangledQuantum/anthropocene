/**
 * Chapter 21's small kit: a charge glyph, and the per-pixel field shading that
 * sits under a scene's SVG stage.
 *
 * Charge sign has its own pair of colours (rose +, violet −) so it never
 * collides with the fixed physics palette: force stays amber, field orchid.
 *
 * `FieldShade` evaluates |E| per pixel on the GPU and paints its log, with a
 * thin contour every factor of two. The dead spot where two fields cancel is a
 * pinhole a coarse CPU grid would blur away, and the spacing of the contours is
 * how a learner sees 1/r² against 1/r³. The GLSL sums k q r̂ / r² exactly as
 * `fieldAt` in src/lib/physics/fields.ts does; nothing it paints is printed as a
 * number, and every number a scene prints comes from charges-ch21.ts.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { createShaderSurface, observeSize, type ShaderSurface } from './gl/webgl.ts';
import { C, type StageApi } from './scene.tsx';

export const POS = 'var(--color-rose)';
export const NEG = 'var(--color-violet)';

export function ChargeDot({ s, at, q, label, r = 13, faint }: {
  s: StageApi; at: readonly [number, number]; q: number; label?: string; r?: number; faint?: boolean;
}) {
  const cx = s.sx(at[0]), cy = s.sy(at[1]);
  const col = q >= 0 ? POS : NEG;
  return <g opacity={faint ? 0.45 : 1} pointerEvents="none">
    <circle cx={cx} cy={cy} r={r} fill={C.surface} stroke={col} strokeWidth={2.5} />
    <line x1={cx - r * 0.45} x2={cx + r * 0.45} y1={cy} y2={cy} stroke={col} strokeWidth={2.5} />
    {q >= 0 && <line x1={cx} x2={cx} y1={cy - r * 0.45} y2={cy + r * 0.45} stroke={col} strokeWidth={2.5} />}
    {label && <text x={cx} y={cy - r - 8} textAnchor="middle" fontSize={14} fontWeight={600} fill={col}
      stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{label}</text>}
  </g>;
}

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform vec4 u_map;      // world = (vx - a) / b, (vy - c) / d, in view px
uniform vec2 u_view;     // view width, height
uniform vec3 u_src[4];   // x, y, q
uniform int u_n;
uniform vec2 u_range;    // log2|E| shown dark .. bright
void main() {
  vec2 v = vec2(v_uv.x * u_view.x, (1.0 - v_uv.y) * u_view.y);
  vec2 p = vec2((v.x - u_map.x) / u_map.y, (v.y - u_map.z) / u_map.w);
  vec2 e = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    if (i >= u_n) break;
    vec2 d = p - u_src[i].xy;
    float r2 = dot(d, d) + 1e-6;
    e += u_src[i].z * d / (r2 * sqrt(r2));
  }
  float l = log2(length(e) + 1e-30);
  float t = clamp((l - u_range.x) / (u_range.y - u_range.x), 0.0, 1.0);
  vec3 bg = vec3(0.082, 0.075, 0.106);
  vec3 orchid = vec3(0.812, 0.486, 0.910);
  vec3 col = mix(bg, orchid * 0.62, pow(t, 1.35));
  // one contour per factor of two, faded where they crowd into a blur
  float w = fwidth(l);
  float f = abs(fract(l + 0.5) - 0.5) / max(w, 1e-4);
  float band = (1.0 - clamp(f, 0.0, 1.0)) * (1.0 - smoothstep(0.25, 0.6, w)) * step(u_range.x, l);
  col += vec3(0.30, 0.22, 0.34) * band;
  outColor = vec4(col, 1.0);
}`;

/**
 * A stage with a GPU-shaded field underneath. `charges` are in the stage's
 * world units with q in any consistent unit: only ratios and logs are painted.
 * `range` is the log2 |E| span from darkest to brightest, in the same units.
 */
export function ShadedStage({ charges, range, stage }: {
  charges: readonly { x: number; y: number; q: number }[];
  range: readonly [number, number];
  /** Render the Stage; call `capture(s)` inside its children so the shading
   *  uses the stage's exact world-to-view map. */
  stage: (capture: (s: StageApi) => void) => ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const surf = useRef<ShaderSurface | null>(null);
  const api = useRef<StageApi | null>(null);
  const size = useRef<[number, number]>([0, 0]);

  const draw = () => {
    const g = surf.current, s = api.current;
    if (!g || !s) return;
    const [w, h] = size.current;
    if (w > 0) g.resize(w, h);
    const x0 = s.sx(0), x1 = s.sx(1), y0 = s.sy(0), y1 = s.sy(1);
    g.set('u_map', [x0, x1 - x0, y0, y1 - y0]);
    g.set('u_view', [s.W, s.H]);
    const flat = new Float32Array(12);
    charges.slice(0, 4).forEach((c, i) => { flat[i * 3] = c.x; flat[i * 3 + 1] = c.y; flat[i * 3 + 2] = c.q; });
    g.setArray('u_src', flat, 3);
    g.setInt('u_n', Math.min(4, charges.length));
    g.set('u_range', [range[0], range[1]]);
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

/** The legend the shading needs: what dark and bright mean, and the contour step. */
export function ShadeKey() {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
    <span style={{ width: 70, height: 10, borderRadius: 3, background: 'linear-gradient(90deg, var(--color-surface), color-mix(in srgb, var(--color-orchid) 62%, var(--color-surface)))', border: '1px solid var(--color-rule-bright)' }} />
    <span>weak to strong field; each contour is a factor of 2</span>
  </span>;
}

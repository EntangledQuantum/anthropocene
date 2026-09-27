/**
 * Chapter 28's small kit: the current glyph (dot out of the page, cross into
 * it), a stage whose field is painted per pixel on the GPU, and the side
 * section of a coil.
 *
 * `FieldLinesStage` paints two things for a set of long straight wires seen
 * end-on. The shading is |B|, log-scaled. The thin lines are the magnetic
 * field lines themselves, drawn exactly as the level sets of the vector
 * potential A_z = −(μ₀/2π) Σ I ln r. In a 2D magnetostatic field the lines are
 * those level sets, and with equal steps in A their crowding is |B|, so the
 * spacing is honest, not decorative. Around one wire they are circles packed
 * tighter near it (1/r); round two wires they close round both or round each.
 * Nothing painted is printed as a number: every number a scene prints comes
 * from src/lib/physics/biot.ts.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { biotSavart, type Path3 } from '../../lib/physics/biot.ts';
import { createShaderSurface, observeSize, type ShaderSurface } from './gl/webgl.ts';
import { Arrow, C, type StageApi } from './scene.tsx';

/** A wire seen end-on. I > 0 comes out of the page (dot), I < 0 goes in (cross). */
export function CurrentMark({ s, at, I, label, r = 12, faint, color = C.ink }: {
  s: StageApi; at: readonly [number, number]; I: number; label?: string; r?: number; faint?: boolean; color?: string;
}) {
  const cx = s.sx(at[0]), cy = s.sy(at[1]);
  const k = r * 0.5;
  return <g opacity={faint ? 0.45 : 1} pointerEvents="none">
    <circle cx={cx} cy={cy} r={r} fill={C.surface} stroke={color} strokeWidth={2.4} />
    {I >= 0
      ? <circle cx={cx} cy={cy} r={r * 0.28} fill={color} />
      : <path d={`M${cx - k},${cy - k}L${cx + k},${cy + k}M${cx - k},${cy + k}L${cx + k},${cy - k}`} stroke={color} strokeWidth={2.4} />}
    {label && <text x={cx} y={cy - r - 8} textAnchor="middle" fontSize={14} fontWeight={600} fill={color}
      stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{label}</text>}
  </g>;
}

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform vec4 u_map;      // world = (vx - a) / b, (vy - c) / d
uniform vec2 u_view;
uniform vec3 u_src[4];   // x, y, I   (world units, amperes)
uniform int u_n;
uniform vec2 u_range;    // log2 |B| shown dark .. bright (units: A per world unit)
uniform float u_step;    // A_z step between field lines (A)
uniform float u_lines;   // 0 hides the lines
void main() {
  vec2 v = vec2(v_uv.x * u_view.x, (1.0 - v_uv.y) * u_view.y);
  vec2 p = vec2((v.x - u_map.x) / u_map.y, (v.y - u_map.z) / u_map.w);
  vec2 b = vec2(0.0);
  float A = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= u_n) break;
    vec2 d = p - u_src[i].xy;
    float r2 = dot(d, d) + 1e-6;
    b += u_src[i].z * vec2(-d.y, d.x) / r2;
    A -= u_src[i].z * 0.5 * log(r2);
  }
  float l = log2(length(b) + 1e-30);
  float t = clamp((l - u_range.x) / (u_range.y - u_range.x), 0.0, 1.0);
  vec3 bg = vec3(0.082, 0.075, 0.106);
  vec3 orchid = vec3(0.812, 0.486, 0.910);
  vec3 col = mix(bg, orchid * 0.5, pow(t, 1.4));
  float q = A / u_step;
  float w = fwidth(q);
  float f = abs(fract(q + 0.5) - 0.5) / max(w, 1e-4);
  float line = (1.0 - clamp(f * 0.8, 0.0, 1.0)) * (1.0 - smoothstep(0.3, 0.7, w));
  col = mix(col, orchid * 0.95, 0.75 * line * u_lines);
  outColor = vec4(col, 1.0);
}`;

/**
 * A stage over the per-pixel field of long wires. Wires are given in the
 * stage's world units (e.g. cm) with I in amperes. `range` is the log2 |B|
 * span painted dark to bright, where |B| is measured in A per world unit
 * (multiply by μ₀/2π, and by 100 for cm, to get tesla). `lineStep` is the A_z
 * step between field lines, in amperes: one line per `lineStep` of I ln r.
 */
export function FieldLinesStage({ wires, range = [-4, 2], lineStep = 0.5, lines = true, stage }: {
  wires: readonly { x: number; y: number; I: number }[];
  range?: readonly [number, number];
  lineStep?: number;
  lines?: boolean;
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
    wires.slice(0, 4).forEach((c, i) => { flat[i * 3] = c.x; flat[i * 3 + 1] = c.y; flat[i * 3 + 2] = c.I; });
    g.setArray('u_src', flat, 3);
    g.setInt('u_n', Math.min(4, wires.length));
    g.set('u_range', [range[0], range[1]]);
    g.set('u_step', lineStep);
    g.set('u_lines', lines ? 1 : 0);
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

/** The legend the painted field needs. */
export function FieldKey({ lines = true }: { lines?: boolean }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
    <span style={{ width: 70, height: 10, borderRadius: 3, background: 'linear-gradient(90deg, var(--color-surface), color-mix(in srgb, var(--color-orchid) 50%, var(--color-surface)))', border: '1px solid var(--color-rule-bright)' }} />
    <span>weak to strong field{lines ? '; thin lines: field lines, crowded where it is strong' : ''}</span>
  </span>;
}

/** A 5 cm (or any) scale bar in the lower-left of a stage. */
export function ScaleBar({ s, at, length, label }: { s: StageApi; at: readonly [number, number]; length: number; label: string }) {
  return <g pointerEvents="none">
    <line x1={s.sx(at[0])} x2={s.sx(at[0] + length)} y1={s.sy(at[1])} y2={s.sy(at[1])} stroke={C.soft} strokeWidth={2} />
    <text x={s.sx(at[0] + length / 2)} y={s.sy(at[1]) - 7} textAnchor="middle" fontSize={12} fill={C.soft} fontFamily="var(--font-mono)">{label}</text>
  </g>;
}

/* ── coils, seen in a side section (axis along x, lengths in cm) ─────────── */

/** One coil's turns crossing the page: dots on one side, crosses on the
 *  other. `I > 0` comes out at the top, so the field inside points right. */
export function CoilSection({ s, xs, R, I, color = C.ink, r = 5 }: {
  s: StageApi; xs: readonly number[]; R: number; I: number; color?: string; r?: number;
}) {
  return <g>
    {xs.map((x, k) => <g key={k}>
      <CurrentMark s={s} at={[x, R]} I={I} r={r} color={color} />
      <CurrentMark s={s} at={[x, -R]} I={-I} r={r} color={color} />
    </g>)}
  </g>;
}

/** Field arrows over a coil section, from the numerical Biot–Savart sum.
 *  Coil paths are in metres; the grid is in cm. Arrow length grows with |B|
 *  up to `full` tesla; fainter where weaker. */
export function coilArrows(paths: readonly Path3[], xs: readonly number[], ys: readonly number[]) {
  const out: { at: [number, number]; b: [number, number] }[] = [];
  for (const x of xs) for (const y of ys) {
    const B = biotSavart(paths, [x / 100, y / 100, 0]);
    out.push({ at: [x, y], b: [B[0], B[1]] });
  }
  return out;
}

export function FieldArrows({ s, arrows, full, maxLen }: {
  s: StageApi; arrows: readonly { at: [number, number]; b: [number, number] }[]; full: number; maxLen: number;
}) {
  return <g pointerEvents="none">
    {arrows.map(({ at, b }, i) => {
      const m = Math.hypot(b[0], b[1]);
      if (m < full * 0.03) return <circle key={i} cx={s.sx(at[0])} cy={s.sy(at[1])} r={1.3} fill={C.faint} />;
      const L = maxLen * Math.min(1, Math.sqrt(m / full));
      const u = [b[0] / m, b[1] / m];
      return <g key={i} opacity={0.35 + 0.65 * Math.min(1, m / full)}>
        <Arrow s={s} from={[at[0] - u[0] * L / 2, at[1] - u[1] * L / 2]} to={[at[0] + u[0] * L / 2, at[1] + u[1] * L / 2]} color={C.field} width={1.8} />
      </g>;
    })}
  </g>;
}

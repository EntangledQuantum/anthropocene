/**
 * Chapter 22's shared drawing: rods of charge seen end-on, the field lines
 * leaving them, and a Gaussian sleeve with its flux ticks.
 *
 * Every scene in the chapter uses rods (1/r fields), because only then is the
 * loop in the picture the honest cross-section of a closed surface. See the
 * header of src/lib/physics/gauss.ts. Charge sign colours match chapter 21:
 * rose for +, violet for −.
 */
import { useMemo } from 'react';
import { normalFieldAlong, rodField, rodFieldLines, type Loop, type Rod } from '../../lib/physics/gauss.ts';
import type { Vec2 } from '../../lib/physics/vectors.ts';
import { Arrow, C, type StageApi } from './scene.tsx';

export const POS = 'var(--color-rose)';
export const NEG = 'var(--color-violet)';

/** A rod seen end-on, labelled with its charge per metre in nC/m. */
export function RodDot({ s, at, q, label, r = 12 }: { s: StageApi; at: Vec2; q: number; label?: string; r?: number }) {
  const cx = s.sx(at[0]), cy = s.sy(at[1]);
  const col = q >= 0 ? POS : NEG;
  return <g pointerEvents="none">
    <circle cx={cx} cy={cy} r={r} fill={C.surface} stroke={col} strokeWidth={2.5} />
    <line x1={cx - r * 0.45} x2={cx + r * 0.45} y1={cy} y2={cy} stroke={col} strokeWidth={2.5} />
    {q >= 0 && <line x1={cx} x2={cx} y1={cy - r * 0.45} y2={cy + r * 0.45} stroke={col} strokeWidth={2.5} />}
    {label && <text x={cx + r + 5} y={cy - r + 2} fontSize={14} fontWeight={600} fill={col}
      stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{label}</text>}
  </g>;
}

/** A small charge on a conductor's surface: a dot with a plus. */
export function ChargeSpeck({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x},${y})`}>
    <circle r={5} fill={C.surface} stroke={POS} strokeWidth={1.6} />
    <path d="M-2.6,0H2.6M0,-2.6V2.6" stroke={POS} strokeWidth={1.4} />
  </g>;
}

export const signed = (q: number) => `${q > 0 ? '+' : q < 0 ? '−' : ''}${Math.abs(q)}`;

/** Field lines from the positive rods, 6 per nC/m. Memoised on the rods. */
export function RodFieldLines({ s, rods, opacity = 0.42 }: { s: StageApi; rods: readonly Rod[]; opacity?: number }) {
  const key = JSON.stringify(rods);
  const bounds = { x0: s.x[0] - 0.2, x1: s.x[1] + 0.2, y0: s.y[0] - 0.2, y1: s.y[1] + 0.2 };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lines = useMemo(() => rodFieldLines(rods, bounds), [key, s.x[0], s.x[1], s.y[0], s.y[1]]);
  return <g opacity={opacity} pointerEvents="none">
    {lines.map((l, i) => <path key={i} fill="none" stroke={C.field} strokeWidth={1.3}
      d={l.map((p, k) => `${k ? 'L' : 'M'}${s.sx(p[0]).toFixed(1)},${s.sy(p[1]).toFixed(1)}`).join('')} />)}
  </g>;
}

/** The sleeve itself: a dashed closed curve. */
export function SleevePath({ s, loop, color = C.ink }: { s: StageApi; loop: Loop; color?: string }) {
  const d = loop.map((p, i) => `${i ? 'L' : 'M'}${s.sx(p[0]).toFixed(1)},${s.sy(p[1]).toFixed(1)}`).join('') + 'Z';
  return <path d={d} fill="color-mix(in srgb, var(--color-ink) 4%, transparent)" stroke={color} strokeWidth={2.2} strokeDasharray="8 5" pointerEvents="none" />;
}

/** The part of the field that pierces the sleeve, as arrows along the normal:
 *  outward ones point out, inward ones point in. `perNC` is metres of arrow
 *  per N/C, and arrows are clipped at `max` metres. */
export function FluxTicks({ s, rods, loop, count = 36, perNC, max = 0.4 }: {
  s: StageApi; rods: readonly Rod[]; loop: Loop; count?: number; perNC: number; max?: number;
}) {
  const all = normalFieldAlong(rods, loop);
  const step = Math.max(1, Math.floor(all.length / count));
  const ticks = all.filter((_, i) => i % step === 0);
  return <g pointerEvents="none">
    {ticks.map((t, i) => {
      const L = Math.max(-max, Math.min(max, t.en * perNC));
      if (Math.abs(L) < 0.012) return null;
      const from: Vec2 = L > 0 ? t.at : [t.at[0] - t.n[0] * L, t.at[1] - t.n[1] * L];
      const to: Vec2 = L > 0 ? [t.at[0] + t.n[0] * L, t.at[1] + t.n[1] * L] : t.at;
      return <Arrow key={i} s={s} from={from} to={to} color={C.field} width={2} />;
    })}
  </g>;
}

/** Min and max of the outward field along the sleeve, N/C. */
export function fieldRange(rods: readonly Rod[], loop: Loop): [number, number] {
  const en = normalFieldAlong(rods, loop).map((t) => t.en);
  return [Math.min(...en), Math.max(...en)];
}

export const fmtRange = ([lo, hi]: [number, number]) => {
  const a = Math.round(lo), b = Math.round(hi);
  return Math.abs(hi - lo) < Math.max(0.5, 0.01 * Math.abs(hi)) ? `${b}` : `${a} to ${b}`;
};

/** Where the rim handle of an ellipse sleeve sits: on the curve, at 45°. */
export const rimOf = (cx: number, cy: number, a: number, b: number): Vec2 => [cx + a * Math.SQRT1_2, cy + b * Math.SQRT1_2];
/** Semi-axes from a rim handle dragged to p. */
export const axesFromRim = (cx: number, cy: number, p: Vec2, lo = 0.12, hi = 2.6): [number, number] => [
  Math.min(hi, Math.max(lo, Math.abs(p[0] - cx) * Math.SQRT2)),
  Math.min(hi, Math.max(lo, Math.abs(p[1] - cy) * Math.SQRT2)),
];

/** Field lines of the tube, traced from just outside its wall. */
export function TubeLines({ s, tube, radius, lambda }: { s: StageApi; tube: Rod[]; radius: number; lambda: number }) {
  const n = Math.round(lambda * 6);
  const lines = useMemo(() => Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * (i + 0.5)) / n;
    // Traced along the tube's own summed field from just outside the wall.
    const out: Vec2[] = [[(radius + 0.03) * Math.cos(a), (radius + 0.03) * Math.sin(a)]];
    for (let k = 0; k < 40; k++) {
      const [x, y] = out[out.length - 1];
      const [ex, ey] = rodField(tube, x, y);
      const m = Math.hypot(ex, ey) || 1;
      out.push([x + (ex / m) * 0.06, y + (ey / m) * 0.06]);
    }
    return out;
  }), [tube, n, radius]);
  return <g opacity={0.42} pointerEvents="none">
    {lines.map((l, i) => <path key={i} fill="none" stroke={C.field} strokeWidth={1.3}
      d={l.map((p, k) => `${k ? 'L' : 'M'}${s.sx(p[0]).toFixed(1)},${s.sy(p[1]).toFixed(1)}`).join('')} />)}
  </g>;
}

/** A charged tube's wall, seen end-on: a rose ring with plus marks. Centred on the origin. */
export function TubeRing({ s, radius }: { s: StageApi; radius: number }) {
  return <g pointerEvents="none">
    <circle cx={s.sx(0)} cy={s.sy(0)} r={s.len(radius)} fill="none" stroke={POS} strokeWidth={4} />
    {Array.from({ length: 16 }, (_, i) => {
      const a = (2 * Math.PI * i) / 16;
      const x = s.sx(radius * Math.cos(a)), y = s.sy(radius * Math.sin(a));
      return <path key={i} d={`M${x - 3.5},${y}H${x + 3.5}M${x},${y - 3.5}V${y + 3.5}`} stroke={C.surface} strokeWidth={2} />;
    })}
  </g>;
}

/* ── the copper bar of lesson 2 ─────────────────────────────────────────── */

/** The teardrop bar both conductor scenes share, so the second continues the first. */
export const DROP = { cx: -0.35, cy: 0, rho: 0.6 } as const;
export const DROP_CHARGES = 48;
export const METAL_FILL = 'color-mix(in srgb, var(--color-amber) 14%, var(--color-surface))';
export const METAL_LINE = 'color-mix(in srgb, var(--color-amber) 55%, var(--color-ink-soft))';

export function metalPath(s: StageApi, poly: Loop): string {
  return poly.map((p, i) => `${i ? 'L' : 'M'}${s.sx(p[0]).toFixed(1)},${s.sy(p[1]).toFixed(1)}`).join('') + 'Z';
}

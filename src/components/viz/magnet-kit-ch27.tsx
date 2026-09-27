/**
 * Chapter 27's small kit: the field notation, and an arrow a render loop can
 * move without going through React.
 *
 *   <FieldMarks>   B into the page as crosses (the tail of an arrow flying
 *                  away from you), out of the page as dots (its tip coming at
 *                  you). Orchid, the fixed field colour. Their boldness grows
 *                  with the field strength so a stronger field reads as one.
 *   <LoopArrow>    an SVG arrow with a ref; `placeArrow` moves it per frame.
 *   <WireEnd>      a wire seen end-on: ⊙ current out of the page, ⊗ into it.
 *
 * Every number these scenes print comes from src/lib/physics/magnetism.ts.
 */
import { forwardRef } from 'react';
import { C, type StageApi } from './scene.tsx';

export function FieldMarks({ s, x, y, into, strength = 1, gap = 4, label }: {
  s: StageApi;
  x: readonly [number, number];
  y: readonly [number, number];
  into: boolean;
  /** 0..1: how bold the marks are drawn. */
  strength?: number;
  /** World spacing between marks. */
  gap?: number;
  label?: string;
}) {
  const marks: [number, number][] = [];
  for (let i = x[0] + gap / 2; i < x[1]; i += gap) for (let j = y[0] + gap / 2; j < y[1]; j += gap) marks.push([i, j]);
  const r = Math.min(7, s.len(gap) * 0.18);
  const op = 0.3 + 0.6 * Math.max(0, Math.min(1, strength));
  const w = 1.2 + 1.6 * Math.max(0, Math.min(1, strength));
  return <g pointerEvents="none">
    <g stroke={C.field} fill={C.field} strokeWidth={w} opacity={op}>
      {marks.map(([a, b], k) => {
        const cx = s.sx(a), cy = s.sy(b);
        return into
          ? <g key={k}><line x1={cx - r} y1={cy - r} x2={cx + r} y2={cy + r} /><line x1={cx - r} y1={cy + r} x2={cx + r} y2={cy - r} /></g>
          : <g key={k}><circle cx={cx} cy={cy} r={r} fill="none" /><circle cx={cx} cy={cy} r={1.8} stroke="none" /></g>;
      })}
    </g>
    {label && <text x={s.sx(x[1]) - 8} y={s.sy(y[1]) + 20} textAnchor="end" fontSize={14} fontWeight={600} fill={C.field}
      stroke="var(--color-surface)" strokeWidth={5} paintOrder="stroke">{label}</text>}
  </g>;
}

/** An arrow whose geometry a render loop sets directly. */
export const LoopArrow = forwardRef<SVGGElement, { color: string; width?: number }>(function LoopArrow({ color, width = 3 }, ref) {
  return <g ref={ref} style={{ display: 'none' }} pointerEvents="none">
    <line stroke={color} strokeWidth={width} strokeLinecap="round" />
    <path fill={color} />
  </g>;
});

/** Move a LoopArrow, in view coordinates. Hides it when too short to draw. */
export function placeArrow(g: SVGGElement | null, x1: number, y1: number, x2: number, y2: number) {
  if (!g) return;
  const L = Math.hypot(x2 - x1, y2 - y1);
  if (L < 4) { g.style.display = 'none'; return; }
  g.style.display = '';
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L, h = Math.min(12, L * 0.5);
  const bx = x2 - ux * h, by = y2 - uy * h;
  const line = g.children[0] as SVGLineElement, head = g.children[1] as SVGPathElement;
  line.setAttribute('x1', `${x1}`); line.setAttribute('y1', `${y1}`);
  line.setAttribute('x2', `${bx}`); line.setAttribute('y2', `${by}`);
  head.setAttribute('d', `M${x2},${y2}L${bx - uy * h * 0.55},${by + ux * h * 0.55}L${bx + uy * h * 0.55},${by - ux * h * 0.55}Z`);
}

/** A wire seen end-on. `out` true: current toward you (dot); false: away (cross). */
export function WireEnd({ cx, cy, out, r = 11 }: { cx: number; cy: number; out: boolean; r?: number }) {
  return <g pointerEvents="none">
    <circle cx={cx} cy={cy} r={r} fill={C.surface} stroke={C.ink} strokeWidth={2.2} />
    {out
      ? <circle cx={cx} cy={cy} r={3} fill={C.ink} />
      : <g stroke={C.ink} strokeWidth={2}><line x1={cx - r * 0.55} y1={cy - r * 0.55} x2={cx + r * 0.55} y2={cy + r * 0.55} /><line x1={cx - r * 0.55} y1={cy + r * 0.55} x2={cx + r * 0.55} y2={cy - r * 0.55} /></g>}
  </g>;
}

/** 1.00 × 10⁶ style, for speeds. */
export function sci3(v: number): string {
  const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  if (v === 0) return '0';
  let e = Math.floor(Math.log10(Math.abs(v)));
  let m = v / 10 ** e;
  if (+m.toFixed(3) >= 10) { m /= 10; e += 1; }
  return `${m.toFixed(3)} × 10${`${e}`.split('').map((c) => SUP[c]).join('')}`;
}

/* ── the coil between two poles, seen along its axle ─────────────────── */

/** The poles of a magnet at the stage's left (N) and right (S) edges and the
 *  uniform field between them, drawn as orchid lines running across the page. */
export function PolesAndField({ s, x, y, label = 'B' }: {
  s: StageApi; x: readonly [number, number]; y: readonly [number, number]; label?: string;
}) {
  const rows: number[] = [];
  for (let j = y[0] + 1; j < y[1] - 0.5; j += 1.6) rows.push(j);
  const pw = 1.6;
  return <g pointerEvents="none">
    {rows.map((j) => {
      const x1 = s.sx(x[0] + pw + 0.3), x2 = s.sx(x[1] - pw - 0.3), yy = s.sy(j), mid = (x1 + x2) / 2;
      return <g key={j} stroke={C.field} strokeOpacity={0.45} fill={C.field} fillOpacity={0.6}>
        <line x1={x1} x2={x2} y1={yy} y2={yy} strokeWidth={1.4} />
        <path d={`M${mid + 7},${yy}L${mid - 3},${yy - 4.5}L${mid - 3},${yy + 4.5}Z`} stroke="none" />
      </g>;
    })}
    {[[x[0], 'N'], [x[1] - pw, 'S']].map(([x0, n]) => <g key={n as string}>
      <rect x={s.sx(x0 as number)} y={s.sy(y[1])} width={s.len(pw)} height={s.sy(y[0]) - s.sy(y[1])} rx={4}
        fill={C.surface} stroke={C.soft} strokeWidth={1.5} />
      <text x={s.sx((x0 as number) + pw / 2)} y={s.sy((y[0] + y[1]) / 2) + 6} textAnchor="middle" fontSize={18} fontWeight={600} fill={C.soft}>{n}</text>
    </g>)}
    <text x={s.sx(x[1] - pw - 0.6)} y={s.sy(y[1]) + 18} textAnchor="end" fontSize={14} fontWeight={600} fill={C.field}
      stroke="var(--color-surface)" strokeWidth={5} paintOrder="stroke">{label}</text>
  </g>;
}

/**
 * The coil edge-on: a bar through the axle (the two short ends overlap in
 * this view), its two long sides as wire ends. `theta` is the angle from the
 * field (+x) to the coil's moment μ. `sign` +1 sends current out of the page
 * along the side at +u = (−sin θ, cos θ). Forces come in from loopSides, N.
 */
export function CoilEdgeOn({ s, theta, half, sign, forces, perN, showMu = true }: {
  s: StageApi; theta: number; half: number; sign: 1 | -1;
  /** Force on the +u side and the −u side, [fx, fy] in N. */
  forces: [readonly [number, number], readonly [number, number]];
  /** Stage units of arrow per newton. */
  perN: number;
  showMu?: boolean;
}) {
  const u = [-Math.sin(theta), Math.cos(theta)];
  const ends = [[u[0] * half, u[1] * half], [-u[0] * half, -u[1] * half]];
  const mu = [Math.cos(theta) * sign, Math.sin(theta) * sign];
  const r = Math.max(9, s.len(half) * 0.16);
  return <g pointerEvents="none">
    {/* lines of action: the lever arm is the horizontal gap from the axle */}
    {ends.map(([ex], k) => <line key={`a${k}`} x1={s.sx(ex)} x2={s.sx(ex)} y1={s.sy(-half * 1.9)} y2={s.sy(half * 1.9)}
      stroke={C.force} strokeOpacity={0.3} strokeDasharray="4 5" />)}
    <line x1={s.sx(ends[0][0])} y1={s.sy(ends[0][1])} x2={s.sx(ends[1][0])} y2={s.sy(ends[1][1])} stroke={C.soft} strokeWidth={7} strokeLinecap="round" />
    {showMu && <g>
      <line x1={s.sx(0)} y1={s.sy(0)} x2={s.sx(mu[0] * half * 0.95)} y2={s.sy(mu[1] * half * 0.95)} stroke={C.ink} strokeWidth={2} strokeDasharray="5 4" />
      <text x={s.sx(mu[0] * half * 1.15)} y={s.sy(mu[1] * half * 1.15) + 5} textAnchor="middle" fontSize={15} fontWeight={600} fill={C.ink}
        stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">μ</text>
    </g>}
    <circle cx={s.sx(0)} cy={s.sy(0)} r={5} fill={C.surface} stroke={C.ink} strokeWidth={2} />
    {ends.map(([ex, ey], k) => {
      const f = forces[k];
      const x1 = s.sx(ex), y1 = s.sy(ey), x2 = s.sx(ex + f[0] * perN), y2 = s.sy(ey + f[1] * perN);
      const L = Math.hypot(x2 - x1, y2 - y1);
      const ux = (x2 - x1) / (L || 1), uy = (y2 - y1) / (L || 1), h = Math.min(12, L * 0.5);
      const bx = x2 - ux * h, by = y2 - uy * h;
      return <g key={k}>
        {L > 4 && <g>
          <line x1={x1 + ux * r} y1={y1 + uy * r} x2={bx} y2={by} stroke={C.force} strokeWidth={3.5} strokeLinecap="round" />
          <path d={`M${x2},${y2}L${bx - uy * h * 0.55},${by + ux * h * 0.55}L${bx + uy * h * 0.55},${by - ux * h * 0.55}Z`} fill={C.force} />
        </g>}
        <WireEnd cx={x1} cy={y1} out={(k === 0) === (sign === 1)} r={r} />
      </g>;
    })}
  </g>;
}

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

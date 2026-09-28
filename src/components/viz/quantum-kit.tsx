/**
 * Small drawing pieces shared by chapter 40's scenes (a well, a wall, an
 * energy line, a wave drawn on its own energy line). Physics lives in
 * src/lib/physics/quantum1d.ts; this file only draws.
 */
import { useEffect, useId, useRef } from 'react';
import { C, type StageApi } from './scene.tsx';

/** Run `cb(dtSeconds)` every animation frame. The callback is read from a ref, so it may close over fresh props. */
export function useFrame(cb: (dt: number) => void) {
  const f = useRef(cb);
  f.current = cb;
  useEffect(() => {
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      f.current(dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}

/** An id safe to use in url(#…). A scene can appear twice on a page (once hidden in a
 *  Predict payoff), so every pattern or clip id must be unique per instance. */
export function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

/** Keep a curve's samples up to where it first leaves [lo, hi], ending exactly on the edge. */
export function truncateAt(xs: number[], ys: number[], lo: number, hi: number): { xs: number[]; ys: number[] } {
  const ox: number[] = [], oy: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    const y = ys[i];
    if (y >= lo && y <= hi) { ox.push(xs[i]); oy.push(y); continue; }
    if (i > 0) {
      const edge = y > hi ? hi : lo, y0 = ys[i - 1];
      const t = (edge - y0) / (y - y0);
      ox.push(xs[i - 1] + t * (xs[i] - xs[i - 1])); oy.push(edge);
    }
    break;
  }
  return { xs: ox, ys: oy };
}

/** SVG polyline points for world samples. */
export function pts(s: StageApi, xs: ArrayLike<number>, ys: ArrayLike<number>): string {
  let out = '';
  for (let i = 0; i < xs.length; i++) out += `${s.sx(xs[i]).toFixed(1)},${s.sy(ys[i]).toFixed(1)} `;
  return out;
}

/** An unclimbable wall: a hatched block between x0 and x1, from y0 to y1. */
export function Wall({ s, x0, x1, y0, y1, id }: { s: StageApi; x0: number; x1: number; y0: number; y1: number; id: string }) {
  const X0 = s.sx(Math.min(x0, x1)), X1 = s.sx(Math.max(x0, x1)), Y0 = s.sy(y1), Y1 = s.sy(y0);
  return <g>
    <defs>
      <pattern id={id} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1={0} y1={0} x2={0} y2={8} stroke={C.faint} strokeWidth={1.4} />
      </pattern>
    </defs>
    <rect x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} fill={`url(#${id})`} opacity={0.7} />
    <line x1={x0 < x1 ? X1 : X0} x2={x0 < x1 ? X1 : X0} y1={Y0} y2={Y1} stroke={C.soft} strokeWidth={2.5} />
  </g>;
}

/** The dashed energy line, with its value. */
export function EnergyLine({ s, E, from, to, label, solid, color = C.energy }: {
  s: StageApi; E: number; from: number; to: number; label?: string; solid?: boolean; color?: string;
}) {
  return <g>
    <line x1={s.sx(from)} x2={s.sx(to)} y1={s.sy(E)} y2={s.sy(E)} stroke={color} strokeWidth={2}
      strokeDasharray={solid ? undefined : '8 6'} />
    {label && <text x={s.sx(to) + 8} y={s.sy(E) + 5} fontSize={14} fontWeight={600} fill={color}
      stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{label}</text>}
  </g>;
}

/** A fraction as a readable percentage: 16.9%, 1.02%, 0.0025%. */
export function pct(T: number): string {
  const p = T * 100;
  if (p >= 10) return `${p.toFixed(1)}%`;
  if (p >= 0.1) return `${p.toFixed(2)}%`;
  return `${p.toPrecision(2)}%`;
}

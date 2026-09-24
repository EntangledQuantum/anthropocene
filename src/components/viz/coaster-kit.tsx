/**
 * Drawing pieces shared by chapter 7's coaster scenes: the rail, the cart, a
 * height ruler, a flag, and a frame loop that lives in refs.
 *
 * Not a widget. Each scene built on it is its own small island with one or
 * two controls. The physics is all in src/lib/physics/coaster-ch7.ts; this
 * file only turns rail positions into pixels.
 *
 * Every scene draws on a `Stage` with `equal` scaling, so a 30° stretch of
 * rail is drawn at 30° and the cart tilts with it truthfully.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { C, type StageApi } from './scene.tsx';
import type { Track } from '../../lib/physics/coaster-ch7.ts';

/** Stage height that makes an `equal` stage show exactly this x range. */
export function fitHeight(x: readonly [number, number], y: readonly [number, number]): number {
  return Math.round(24 + ((y[1] - y[0]) * 616) / (x[1] - x[0]));
}

/** A requestAnimationFrame loop driven from refs. React never hears a frame. */
export function useFrames(fn: (dt: number, now: number) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ref.current(dt, now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}

/** The rail, with the ground shaded underneath it down to `floor`. */
export function Rail({ s, track, floor = -0.1, from, to }: {
  s: StageApi; track: Track; floor?: number; from?: number; to?: number;
}) {
  const [a, b] = [from ?? track.shape.x[0], to ?? track.shape.x[1]];
  const n = 260;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n;
    pts.push(`${s.sx(x).toFixed(1)},${s.sy(track.h(x)).toFixed(1)}`);
  }
  const line = `M${pts.join('L')}`;
  const area = `${line}L${s.sx(b).toFixed(1)},${s.sy(floor).toFixed(1)}L${s.sx(a).toFixed(1)},${s.sy(floor).toFixed(1)}Z`;
  return <g>
    <path d={area} fill="var(--color-rule)" opacity={0.35} />
    <path d={line} fill="none" stroke={C.soft} strokeWidth={3} strokeLinejoin="round" />
    {/* buffers at both ends */}
    <line x1={s.sx(a)} x2={s.sx(a)} y1={s.sy(track.h(a))} y2={s.sy(track.h(a)) - 16} stroke={C.soft} strokeWidth={4} />
    <line x1={s.sx(b)} x2={s.sx(b)} y1={s.sy(track.h(b))} y2={s.sy(track.h(b)) - 16} stroke={C.soft} strokeWidth={4} />
  </g>;
}

/** SVG transform that sits the cart on the rail at distance `at` along it. */
export function cartPose(s: StageApi, track: Track, at: number): string {
  const x = track.xAt(at);
  const deg = (-track.angleAt(at) * 180) / Math.PI;
  return `translate(${s.sx(x).toFixed(2)},${s.sy(track.h(x)).toFixed(2)}) rotate(${deg.toFixed(2)})`;
}

export interface CartRefs {
  g: RefObject<SVGGElement | null>;
  shaft: RefObject<SVGLineElement | null>;
  head: RefObject<SVGPathElement | null>;
}

export function useCartRefs(): CartRefs {
  return { g: useRef<SVGGElement>(null), shaft: useRef<SVGLineElement>(null), head: useRef<SVGPathElement>(null) };
}

/** A small cart, drawn at the origin and placed by `cartPose`. The amber
 *  arrow along the rail is the push, set imperatively by `setPush`. */
export function Cart({ refs, pose, label, color = C.ink }: {
  refs: CartRefs; pose: string; label?: string; color?: string;
}) {
  return <g ref={refs.g} transform={pose}>
    <line ref={refs.shaft} x1={0} y1={-12} x2={0} y2={-12} stroke={C.force} strokeWidth={3.5} strokeLinecap="round" />
    <path ref={refs.head} d="" fill={C.force} />
    <rect x={-15} y={-21} width={30} height={13} rx={3} fill={C.surface} stroke={color} strokeWidth={2} />
    <circle cx={-8} cy={-5} r={4} fill={C.surface} stroke={color} strokeWidth={1.8} />
    <circle cx={8} cy={-5} r={4} fill={C.surface} stroke={color} strokeWidth={1.8} />
    {label && <text x={0} y={-11} textAnchor="middle" fontSize={10} fontWeight={600} fill={color}>{label}</text>}
  </g>;
}

/** Push arrow along the rail, in the cart's own frame: `px` pixels, signed. */
export function setPush(refs: CartRefs, px: number) {
  const sh = refs.shaft.current, hd = refs.head.current;
  if (!sh || !hd) return;
  if (Math.abs(px) < 3) { sh.setAttribute('x2', '0'); hd.setAttribute('d', ''); return; }
  const dir = Math.sign(px);
  const start = dir * 16; // from the cart's nose, so the arrow is not hidden
  const end = start + px;
  sh.setAttribute('x1', String(start));
  sh.setAttribute('x2', String(end - dir * 9));
  hd.setAttribute('d', `M${end},-12L${end - dir * 11},-17.5L${end - dir * 11},-6.5Z`);
}

/** A vertical height scale on the left, in metres, with an optional second
 *  scale on the right in joules (U = m g h, measured from `zero`). */
export function HeightRuler({ s, ticks, joules }: {
  s: StageApi; ticks: number[];
  joules?: { mass: number; g: number; zero?: number; ticks: number[] };
}) {
  const xl = s.sx(s.x[0]) + 34;
  const xr = s.sx(s.x[1]) - 40;
  const top = s.sy(Math.max(...ticks)), bot = s.sy(Math.min(...ticks));
  return <g fontFamily="var(--font-mono)" fontSize={11.5} fill={C.faint}>
    <line x1={xl} x2={xl} y1={top} y2={bot} stroke={C.rule} />
    {ticks.map((h) => <g key={h}>
      <line x1={xl - 4} x2={xl} y1={s.sy(h)} y2={s.sy(h)} stroke={C.rule} />
      <text x={xl - 7} y={s.sy(h) + 4} textAnchor="end">{h.toFixed(1)}</text>
    </g>)}
    <text x={xl - 7} y={top - 10} textAnchor="end" fontFamily="var(--font-sans)" fontSize={12}>m</text>
    {joules && (() => {
      const z = joules.zero ?? 0;
      const hOf = (U: number) => z + U / (joules.mass * joules.g);
      const js = joules.ticks.filter((U) => hOf(U) >= s.y[0] && hOf(U) <= s.y[1]);
      return <g>
        <line x1={xr} x2={xr} y1={s.sy(hOf(js[js.length - 1] ?? 0))} y2={s.sy(hOf(js[0] ?? 0))} stroke={C.rule} />
        {js.map((U) => <g key={U}>
          <line x1={xr} x2={xr + 4} y1={s.sy(hOf(U))} y2={s.sy(hOf(U))} stroke={C.rule} />
          <text x={xr + 7} y={s.sy(hOf(U)) + 4} textAnchor="start">{U}</text>
        </g>)}
        <text x={xr + 7} y={s.sy(hOf(js[js.length - 1] ?? 0)) - 12} textAnchor="start" fontFamily="var(--font-sans)" fontSize={12}>U (J)</text>
      </g>;
    })()}
  </g>;
}

/** A flag planted on the rail at horizontal position x. */
export function Flag({ s, track, x, color = C.position, label }: {
  s: StageApi; track: Track; x: number; color?: string; label?: string;
}) {
  const px = s.sx(x), py = s.sy(track.h(x));
  return <g pointerEvents="none">
    <line x1={px} x2={px} y1={py} y2={py - 34} stroke={color} strokeWidth={2} />
    <path d={`M${px},${py - 34}L${px + 16},${py - 28}L${px},${py - 22}Z`} fill={color} />
    {label && <text x={px + 20} y={py - 26} fontSize={12.5} fill={color}
      stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{label}</text>}
  </g>;
}

/** The dashed total-energy line: the chapter's reusable picture. */
export function EnergyLine({ s, height, label, from, to }: {
  s: StageApi; height: number; label?: string; from?: number; to?: number;
}) {
  const a = s.sx(from ?? s.x[0] + 0.9), b = s.sx(to ?? s.x[1] - 0.6), y = s.sy(height);
  return <g pointerEvents="none">
    <line x1={a} x2={b} y1={y} y2={y} stroke={C.energy} strokeWidth={2} strokeDasharray="8 6" />
    {label && <text x={b} y={y - 7} textAnchor="end" fontSize={13} fontWeight={600} fill={C.energy}
      stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{label}</text>}
  </g>;
}

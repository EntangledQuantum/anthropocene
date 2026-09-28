/**
 * Chapter 26's drawing kit: a bulb that glows by the power it takes, a battery
 * symbol, and charge dots that flow along wires at a speed proportional to the
 * current. Shared by ThreeBulbs, LevelTheJunction, RechargeTheFlash and
 * DrainTheFlash. It draws; it computes nothing. Every number comes from
 * src/lib/physics/circuits.ts.
 *
 * Dots are laid out at one fixed spacing on every wire and move at a speed
 * proportional to that wire's current. Dot flux is then proportional to current,
 * so at a junction the dots arriving per second equal the dots leaving per
 * second: Kirchhoff's junction rule, visible.
 */
import { useEffect, useRef } from 'react';
import { C } from './scene.tsx';

export type Pt = readonly [number, number];

/** Brightness 0..1 from power: square root so a quarter of the power still reads
 *  as clearly lit but clearly dimmer. */
export const glowOf = (p: number, pMax: number) => Math.sqrt(Math.max(0, Math.min(1, p / pMax)));

export function Bulb({ x, y, power, pMax, label, off }: {
  x: number; y: number; power: number; pMax: number; label?: string; off?: boolean;
}) {
  const b = off ? 0 : glowOf(power, pMax);
  const gid = `glow-${Math.round(x)}-${Math.round(y)}`;
  return <g>
    <defs>
      <radialGradient id={gid}>
        <stop offset="0%" stopColor={C.energy} stopOpacity={0.9 * b} />
        <stop offset="45%" stopColor={C.energy} stopOpacity={0.35 * b} />
        <stop offset="100%" stopColor={C.energy} stopOpacity={0} />
      </radialGradient>
    </defs>
    {b > 0.01 && <circle cx={x} cy={y} r={18 + 40 * b} fill={`url(#${gid})`} pointerEvents="none" />}
    <circle cx={x} cy={y} r={16} fill={C.surface} stroke={b > 0.01 ? C.energy : C.faint} strokeWidth={2} />
    <path d={`M${x - 8},${y + 5} L${x - 4},${y - 5} L${x},${y + 5} L${x + 4},${y - 5} L${x + 8},${y + 5}`}
      fill="none" stroke={b > 0.01 ? C.ink : C.ghost} strokeOpacity={0.35 + 0.65 * b} strokeWidth={1.8} />
    {label && <text x={x} y={y - 22} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.ink}
      stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{label}</text>}
  </g>;
}

/** A battery drawn vertically: + plate on top. */
export function Battery({ x, y, label }: { x: number; y: number; label: string }) {
  return <g>
    <rect x={x - 20} y={y - 12} width={40} height={24} fill={C.surface} />
    <line x1={x - 18} x2={x + 18} y1={y - 6} y2={y - 6} stroke={C.ink} strokeWidth={3} />
    <line x1={x - 9} x2={x + 9} y1={y + 6} y2={y + 6} stroke={C.ink} strokeWidth={5} />
    <text x={x + 24} y={y - 8} fontSize={13} fill={C.soft}>+</text>
    <text x={x - 26} y={y + 5} textAnchor="end" fontSize={14} fill={C.ink}>{label}</text>
  </g>;
}

export function Wire({ pts, dashed, faint }: { pts: readonly Pt[]; dashed?: boolean; faint?: boolean }) {
  return <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none"
    stroke={faint ? C.ghost : C.soft} strokeWidth={faint ? 1.5 : 2.5} strokeDasharray={dashed ? '5 5' : undefined} strokeLinejoin="round" />;
}

function lengthOf(pts: readonly Pt[]) {
  let L = 0;
  for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  return L;
}

function pointAt(pts: readonly Pt[], s: number): Pt {
  for (let k = 1; k < pts.length; k++) {
    const d = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    if (s <= d || k === pts.length - 1) {
      const f = d > 0 ? Math.min(1, s / d) : 0;
      return [pts[k - 1][0] + f * (pts[k][0] - pts[k - 1][0]), pts[k - 1][1] + f * (pts[k][1] - pts[k - 1][1])];
    }
    s -= d;
  }
  return pts[pts.length - 1];
}

const SPACING = 18;

/**
 * Charge dots on a set of wires. `paths` maps an element id to its polyline,
 * drawn from the element's node a to node b; `currents` gives the current a → b
 * in amps. Dots move at `pxPerAmp` px/s per amp. The loop lives in refs: React
 * renders the circles once per wiring and never per frame.
 */
export function FlowDots({ paths, currents, pxPerAmp }: {
  paths: Record<string, readonly Pt[]>; currents: Record<string, number>; pxPerAmp: number;
}) {
  const cur = useRef(currents);
  cur.current = currents;
  const geom = useRef(paths);
  geom.current = paths;
  const phase = useRef<Record<string, number>>({});
  const dots = useRef<Record<string, (SVGCircleElement | null)[]>>({});
  const ids = Object.keys(paths);
  const key = ids.join('|');

  useEffect(() => {
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      for (const id of Object.keys(geom.current)) {
        const pts = geom.current[id];
        const L = lengthOf(pts);
        const n = Math.max(1, Math.floor(L / SPACING));
        const gap = L / n;
        const ph = ((phase.current[id] ?? 0) + (cur.current[id] ?? 0) * pxPerAmp * dt) % gap;
        phase.current[id] = ph < 0 ? ph + gap : ph;
        const els = dots.current[id] ?? [];
        for (let k = 0; k < els.length; k++) {
          const el = els[k];
          if (!el) continue;
          const [x, y] = pointAt(pts, (k * gap + phase.current[id]) % L);
          el.setAttribute('cx', x.toFixed(1));
          el.setAttribute('cy', y.toFixed(1));
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // the wiring (key) decides which circles exist; geometry and currents are read from refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pxPerAmp]);

  return <g pointerEvents="none">
    {ids.map((id) => {
      const L = lengthOf(paths[id]);
      const n = Math.max(1, Math.floor(L / SPACING));
      dots.current[id] = dots.current[id]?.slice(0, n) ?? [];
      return Array.from({ length: n }, (_, k) => {
        const [x, y] = pointAt(paths[id], k * (L / n));
        return <circle key={`${id}-${k}`} ref={(el) => { (dots.current[id] ??= [])[k] = el; }}
          cx={x} cy={y} r={2.6} fill={C.velocity} opacity={Math.abs(currents[id] ?? 0) > 1e-6 ? 0.9 : 0.25} />;
      });
    })}
  </g>;
}

/** Amps, readable: 0.333 → "0.33". */
export const amps = (i: number) => Math.abs(i).toFixed(2);
export const watts = (p: number) => p.toFixed(2);

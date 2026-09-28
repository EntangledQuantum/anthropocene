/**
 * Small pieces shared by chapter 33's ray scenes, all drawn inside a scene-kit
 * <Stage> in world coordinates.
 *
 *   GlowDefs   the blur filter every ray uses for its glow (one per scene)
 *   Ray        a line of light whose glow is its brightness, 0–1
 *   Normal     the dashed line square to a surface, through a point on it
 *   AngleArc   an arc between two directions, with its label
 *   Medium     a tinted slab of water or glass, labelled with its index
 *   Eye        an eye glyph looking along a direction
 *
 * Light is drawn in ink (white) with a glow: it is the one thing in these
 * scenes with no physics colour of its own, and brightness is its meaning.
 * The normal and the angle arcs are soft grey, drawn under everything else.
 */
import { useId } from 'react';
import { C, type StageApi, type Vec } from './scene.tsx';

export const LIGHT = 'var(--color-ink)';
export const WATER_FILL = 'color-mix(in oklab, var(--color-iris) 13%, var(--color-surface))';
export const GLASS_FILL = 'color-mix(in oklab, var(--color-aqua) 9%, var(--color-surface))';

/** Returns the filter id to pass to <Ray glow>. Render `defs` inside the SVG. */
export function useGlow() {
  const id = `glow${useId().replace(/:/g, '')}`;
  const defs = <defs>
    <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4" />
    </filter>
  </defs>;
  return { id, defs };
}

export function Ray({ s, from, to, b = 1, glow, arrow = true, dash }: {
  s: StageApi; from: Vec; to: Vec;
  /** Brightness 0–1: sets the glow and the core's opacity. */
  b?: number;
  /** Filter id from useGlow. */
  glow: string;
  /** A small head halfway along, to show which way the light goes. */
  arrow?: boolean;
  dash?: string;
}) {
  const x1 = s.sx(from[0]), y1 = s.sy(from[1]), x2 = s.sx(to[0]), y2 = s.sy(to[1]);
  const L = Math.hypot(x2 - x1, y2 - y1);
  if (L < 1 || b <= 0.002) return null;
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L;
  const mx = (x1 + x2) / 2 + ux * 6, my = (y1 + y2) / 2 + uy * 6;
  const core = 0.25 + 0.75 * Math.min(1, b);
  return <g>
    {!dash && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={LIGHT} strokeWidth={9} strokeLinecap="round"
      opacity={0.55 * Math.min(1, b)} filter={`url(#${glow})`} />}
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={LIGHT} strokeWidth={dash ? 1.6 : 2.4} strokeLinecap="round"
      strokeDasharray={dash} opacity={dash ? 0.7 : core} />
    {arrow && !dash && L > 40 && <path d={`M${mx},${my}L${mx - ux * 11 - uy * 5},${my - uy * 11 + ux * 5}L${mx - ux * 11 + uy * 5},${my - uy * 11 - ux * 5}Z`}
      fill={LIGHT} opacity={core} />}
  </g>;
}

/** A vertical normal through (x, y0), `len` world units each way. */
export function Normal({ s, at, len }: { s: StageApi; at: Vec; len: number }) {
  return <g>
    <line x1={s.sx(at[0])} x2={s.sx(at[0])} y1={s.sy(at[1] + len)} y2={s.sy(at[1] - len)}
      stroke={C.faint} strokeWidth={1.3} strokeDasharray="5 5" />
    <text x={s.sx(at[0]) - 6} y={s.sy(at[1] + len) + 12} textAnchor="end" fontSize={12} fill={C.faint}>normal</text>
  </g>;
}

/** Arc at `at` from world angle a0 to a1 (radians, from +x, counter-clockwise). */
export function AngleArc({ s, at, a0, a1, r, label, color = C.soft }: {
  s: StageApi; at: Vec; a0: number; a1: number;
  /** Radius in view px. */
  r: number; label?: string; color?: string;
}) {
  const cx = s.sx(at[0]), cy = s.sy(at[1]);
  const p = (a: number, rr = r) => [cx + rr * Math.cos(a), cy - rr * Math.sin(a)] as const;
  const [xa, ya] = p(a0), [xb, yb] = p(a1);
  const sweep = a1 > a0 ? 0 : 1;
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  const [lx, ly] = p((a0 + a1) / 2, r + 16);
  if (Math.abs(a1 - a0) < 0.01) return null;
  return <g>
    <path d={`M${xa},${ya}A${r},${r} 0 ${large} ${sweep} ${xb},${yb}`} fill="none" stroke={color} strokeWidth={1.6} />
    {label && <text x={lx} y={ly + 5} textAnchor="middle" fontSize={13} fill={color}
      stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke" fontFamily="var(--font-mono)">{label}</text>}
  </g>;
}

export function Medium({ s, x, y, fill, label, labelAt }: {
  s: StageApi; x: readonly [number, number]; y: readonly [number, number]; fill: string;
  label?: string; labelAt?: Vec;
}) {
  const at = labelAt ?? [x[0], y[0]];
  return <g>
    <rect x={s.sx(x[0])} y={s.sy(y[1])} width={s.sx(x[1]) - s.sx(x[0])} height={s.sy(y[0]) - s.sy(y[1])} fill={fill} />
    <line x1={s.sx(x[0])} x2={s.sx(x[1])} y1={s.sy(y[1])} y2={s.sy(y[1])} stroke={C.rule} strokeWidth={2} />
    {label && <text x={s.sx(at[0]) + 8} y={s.sy(at[1]) - 8} fontSize={13} fill={C.soft}>{label}</text>}
  </g>;
}

/** An eye at `at`, looking toward `toward`. */
export function Eye({ s, at, toward }: { s: StageApi; at: Vec; toward: Vec }) {
  const cx = s.sx(at[0]), cy = s.sy(at[1]);
  const a = Math.atan2(s.sy(toward[1]) - cy, s.sx(toward[0]) - cx) * (180 / Math.PI);
  return <g transform={`translate(${cx},${cy}) rotate(${a})`} pointerEvents="none">
    <path d="M-16,0 Q0,-13 16,0 Q0,13 -16,0 Z" fill={C.surface} stroke={C.ink} strokeWidth={1.8} />
    <circle cx={7} cy={0} r={5} fill={C.ink} />
  </g>;
}

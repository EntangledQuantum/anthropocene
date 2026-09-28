/**
 * Small pieces shared by chapter 34's mirror and lens scenes, all drawn inside
 * a scene-kit <Stage> in world coordinates.
 *
 *   Beam        a thin line of light (dashed: a backward extension, not light)
 *   ArrowMark   an object or image drawn as an upright or inverted arrow
 *   Lens        a converging lens: a biconvex shape standing on the axis
 *   Glass       a flat mirror seen edge-on, silvered on the back
 *   Person      a simple standing figure, eye marked
 *   AxisScale   a ruler along the optical axis, so every distance has a scale
 *
 * Light is ink (white), as in chapter 33: it has no physics colour of its own.
 * The object is position-iris, solid; its image is iris too, solid when real
 * and dashed when virtual, so "virtual" is always the same visual word.
 */
import { C, type StageApi, type Vec } from './scene.tsx';

export const LIGHT = 'var(--color-ink)';
export const GLASS_FILL = 'color-mix(in oklab, var(--color-aqua) 16%, var(--color-surface))';

export function Beam({ s, from, to, dash, opacity = 0.75, width = 1.3, color = LIGHT }: {
  s: StageApi; from: Vec; to: Vec; dash?: boolean; opacity?: number; width?: number; color?: string;
}) {
  return <line x1={s.sx(from[0])} y1={s.sy(from[1])} x2={s.sx(to[0])} y2={s.sy(to[1])}
    stroke={color} strokeWidth={width} strokeDasharray={dash ? '4 4' : undefined}
    opacity={dash ? opacity * 0.8 : opacity} strokeLinecap="round" pointerEvents="none" />;
}

/** A vertical arrow from (x, 0) to (x, h): an object or its image. */
export function ArrowMark({ s, x, h, virtual, label, color = C.position, base = 0 }: {
  s: StageApi; x: number; h: number; virtual?: boolean; label?: string; color?: string; base?: number;
}) {
  const X = s.sx(x), Y0 = s.sy(base), Y1 = s.sy(base + h);
  const L = Math.abs(Y1 - Y0);
  if (L < 2) return null;
  const dir = Y1 < Y0 ? -1 : 1;
  const head = Math.min(11, L * 0.45);
  return <g pointerEvents="none">
    <line x1={X} y1={Y0} x2={X} y2={Y1 - dir * head} stroke={color} strokeWidth={3}
      strokeDasharray={virtual ? '6 4' : undefined} strokeLinecap="round" />
    <path d={`M${X},${Y1}L${X - 7},${Y1 - dir * head}L${X + 7},${Y1 - dir * head}Z`}
      fill={virtual ? 'none' : color} stroke={color} strokeWidth={virtual ? 1.8 : 0} />
    {label && <text x={X} y={Y1 + (dir < 0 ? -9 : 20)} textAnchor="middle" fontSize={13} fill={color}
      stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{label}</text>}
  </g>;
}

/** A converging lens at x = 0, half-aperture R, with its two focal points marked. */
export function Lens({ s, R, f, cover }: { s: StageApi; R: number; f: number; cover?: 'top' | 'bottom' }) {
  const X = s.sx(0), T = s.sy(R), B = s.sy(-R);
  const bulge = 11;
  return <g pointerEvents="none">
    <path d={`M${X},${T} Q${X + bulge * 2},${(T + B) / 2} ${X},${B} Q${X - bulge * 2},${(T + B) / 2} ${X},${T} Z`}
      fill={GLASS_FILL} stroke={C.energy} strokeWidth={1.6} />
    {cover && <rect x={X - 9} y={cover === 'top' ? T - 4 : s.sy(0)} width={18} height={(B - T) / 2 + 4}
      rx={2} fill="var(--color-raised)" stroke={C.soft} strokeWidth={1.5} />}
    {[-f, f].map((x) => <g key={x}>
      <circle cx={s.sx(x)} cy={s.sy(0)} r={3.5} fill={C.energy} />
      <text x={s.sx(x)} y={s.sy(0) + 18} textAnchor="middle" fontSize={12} fill={C.energy}>F</text>
    </g>)}
  </g>;
}

/** A flat mirror from a to b, seen edge-on, silvered on the side away from `front`. */
export function Glass({ s, a, b, front }: { s: StageApi; a: Vec; b: Vec; front: Vec }) {
  const ax = s.sx(a[0]), ay = s.sy(a[1]), bx = s.sx(b[0]), by = s.sy(b[1]);
  const L = Math.hypot(bx - ax, by - ay);
  if (L < 1) return null;
  const ux = (bx - ax) / L, uy = (by - ay) / L;
  let nx = -uy, ny = ux;
  if ((s.sx(front[0]) - ax) * nx + (s.sy(front[1]) - ay) * ny > 0) { nx = -nx; ny = -ny; }
  const hatch = [];
  for (let t = 6; t < L; t += 9) {
    const px = ax + ux * t, py = ay + uy * t;
    hatch.push(<line key={t} x1={px} y1={py} x2={px + nx * 7 - ux * 5} y2={py + ny * 7 - uy * 5} stroke={C.faint} strokeWidth={1} />);
  }
  return <g pointerEvents="none">
    {hatch}
    <line x1={ax} y1={ay} x2={bx} y2={by} stroke={C.energy} strokeWidth={4} strokeLinecap="round" />
  </g>;
}

/**
 * A standing figure at x, feet at y = 0, `height` tall, facing +x or −x.
 * `band` shades the part of the body the viewer can see.
 */
export function Person({ s, x, height, eye, facing = 1, dashed, band }: {
  s: StageApi; x: number; height: number; eye: number; facing?: 1 | -1; dashed?: boolean;
  band?: readonly [number, number];
}) {
  const u = height / 1.8;
  const stroke = dashed ? C.faint : C.soft;
  const da = dashed ? '5 4' : undefined;
  const headR = 0.11 * u, headC = height - headR;
  const neck = height - 2 * headR, hip = 0.95 * u, sh = neck - 0.08 * u;
  const P = (dx: number, y: number) => `${s.sx(x + dx * facing)},${s.sy(y)}`;
  const path = `M${P(-0.1 * u, 0)}L${P(0, hip)}L${P(0.1 * u, 0)}M${P(0, hip)}L${P(0, neck)}` +
    `M${P(-0.14 * u, sh - 0.55 * u)}L${P(0, sh)}L${P(0.14 * u, sh - 0.55 * u)}`;
  return <g pointerEvents="none">
    {band && band[1] > band[0] && <rect x={s.sx(x) - s.len(0.22 * u)} width={s.len(0.44 * u)}
      y={s.sy(Math.min(height, band[1]))} height={Math.max(0, s.sy(Math.max(0, band[0])) - s.sy(Math.min(height, band[1])))}
      fill={C.position} opacity={0.22} rx={3} />}
    <path d={path} fill="none" stroke={stroke} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={da} />
    <circle cx={s.sx(x)} cy={s.sy(headC)} r={s.len(headR)} fill="none" stroke={stroke} strokeWidth={3} strokeDasharray={da} />
    <circle cx={s.sx(x + 0.055 * u * facing)} cy={s.sy(eye)} r={2.6} fill={dashed ? C.faint : C.ink} />
  </g>;
}

/** Ticks along y = 0 every `step`, labelled every `every`, in `unit`. */
export function AxisScale({ s, from, to, step, every, unit }: {
  s: StageApi; from: number; to: number; step: number; every: number; unit: string;
}) {
  const ticks = [];
  for (let v = Math.ceil(from / step) * step; v <= to + 1e-9; v += step) {
    const major = Math.abs(v / every - Math.round(v / every)) < 1e-6;
    ticks.push(<g key={v}>
      <line x1={s.sx(v)} x2={s.sx(v)} y1={s.sy(0)} y2={s.sy(0) + (major ? 7 : 4)} stroke={C.faint} strokeWidth={1} />
      {major && v !== 0 && <text x={s.sx(v)} y={s.sy(0) + 34} textAnchor="middle" fontSize={11} fill={C.faint}
        fontFamily="var(--font-mono)">{Math.abs(v)}</text>}
    </g>);
  }
  return <g pointerEvents="none">
    <line x1={s.sx(from)} x2={s.sx(to)} y1={s.sy(0)} y2={s.sy(0)} stroke={C.rule} strokeWidth={1.2} />
    {ticks}
    <text x={s.sx(to)} y={s.sy(0) + 34} textAnchor="end" fontSize={11} fill={C.faint}>{unit} from the lens</text>
  </g>;
}

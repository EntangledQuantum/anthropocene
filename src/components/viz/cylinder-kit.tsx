/**
 * Chapter 19's shared drawing bits: a gas in a cylinder, the flame or ice
 * under it, and an energy arrow crossing its boundary. Pixel coordinates on
 * the scene's own SVG. Kept here so the chapter's scenes speak one dialect;
 * the physics lives in src/lib/physics/thermo.ts.
 *
 * The gas glows aqua in proportion to its temperature: aqua is energy, and
 * for an ideal gas the internal energy is the temperature times n·Cv.
 */
import { C } from './scene.tsx';

export const HEAT_FLAME = 'var(--color-rose)';
export const ICE_FILL = 'color-mix(in srgb, var(--color-ink) 18%, var(--color-surface))';

/** Gas fill: brighter aqua as it warms from `lo` to `hi` kelvin. */
export function gasFill(T: number, lo: number, hi: number): string {
  const f = Math.max(0, Math.min(1, (T - lo) / (hi - lo)));
  return `color-mix(in srgb, var(--color-aqua) ${(8 + 52 * f).toFixed(0)}%, var(--color-surface))`;
}

/** An arrow in pixel coordinates. */
export function PxArrow({ x1, y1, x2, y2, color = C.energy, width = 3, label, anchor = 'middle', dx = 0, dy = -10 }: {
  x1: number; y1: number; x2: number; y2: number; color?: string; width?: number; label?: string;
  anchor?: 'start' | 'middle' | 'end'; dx?: number; dy?: number;
}) {
  const L = Math.hypot(x2 - x1, y2 - y1);
  if (L < 2) return null;
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L, h = Math.min(12, L * 0.5);
  const bx = x2 - ux * h, by = y2 - uy * h;
  return <g>
    <line x1={x1} y1={y1} x2={bx} y2={by} stroke={color} strokeWidth={width} strokeLinecap="round" />
    <path d={`M${x2},${y2}L${bx - uy * h * 0.55},${by + ux * h * 0.55}L${bx + uy * h * 0.55},${by - ux * h * 0.55}Z`} fill={color} />
    {label && <text x={(x1 + x2) / 2 + dx} y={(y1 + y2) / 2 + dy} textAnchor={anchor} fontSize={13} fontWeight={600} fill={color}
      stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{label}</text>}
  </g>;
}

/** A flame under a floor at `y`, centred on `cx`. */
export function Flame({ cx, y, size = 1 }: { cx: number; y: number; size?: number }) {
  const s = size;
  return <g>
    {[-22, 0, 22].map((dx) => (
      <path key={dx} d={`M${cx + dx * s - 9 * s},${y + 26 * s} Q${cx + dx * s - 10 * s},${y + 10 * s} ${cx + dx * s},${y + 2 * s} Q${cx + dx * s + 10 * s},${y + 10 * s} ${cx + dx * s + 9 * s},${y + 26 * s} Z`}
        fill={HEAT_FLAME} opacity={0.85} />
    ))}
    <line x1={cx - 40 * s} x2={cx + 40 * s} y1={y + 28 * s} y2={y + 28 * s} stroke={C.faint} strokeWidth={3} />
  </g>;
}

/** Ice cubes pressed against a floor at `y`. */
export function Ice({ cx, y }: { cx: number; y: number }) {
  return <g>
    {[-30, 0, 30].map((dx) => (
      <rect key={dx} x={cx + dx - 12} y={y + 3} width={24} height={20} rx={3} fill={ICE_FILL} stroke={C.soft} strokeWidth={1.5} />
    ))}
  </g>;
}

/**
 * An upright cylinder: walls, floor, the gas below a piston at `gasTop`.
 * `lid` draws a bolted lid instead of a free piston. `load` stacks a block on
 * the piston. Temperature is printed in the gas.
 */
export function Cylinder({ x, w, bottom, top, gasTop, T, fill, lid, load, caption }: {
  x: number; w: number; bottom: number; top: number; gasTop: number; T: number; fill: string;
  lid?: boolean; load?: string; caption?: string;
}) {
  return <g>
    <rect x={x} y={gasTop} width={w} height={bottom - gasTop} fill={fill} />
    <text x={x + w / 2} y={(gasTop + bottom) / 2 + 6} textAnchor="middle" fontSize={17} fontFamily="var(--font-mono)" fill={C.ink}>
      {T.toFixed(1)} K
    </text>
    {lid ? <g>
      <rect x={x - 8} y={gasTop - 14} width={w + 16} height={14} rx={2} fill={C.surface} stroke={C.ink} strokeWidth={2} />
      {[x + 10, x + w - 10].map((bx) => <circle key={bx} cx={bx} cy={gasTop - 7} r={3.5} fill={C.soft} />)}
    </g> : <g>
      <rect x={x + 2} y={gasTop - 14} width={w - 4} height={14} rx={2} fill={C.surface} stroke={C.ink} strokeWidth={2} />
      {load && <g>
        <rect x={x + w / 2 - 34} y={gasTop - 50} width={68} height={36} rx={3} fill={C.surface} stroke={C.soft} strokeWidth={1.5} />
        <text x={x + w / 2} y={gasTop - 27} textAnchor="middle" fontSize={12} fill={C.soft}>{load}</text>
      </g>}
    </g>}
    <line x1={x} y1={top} x2={x} y2={bottom} stroke={C.soft} strokeWidth={3} />
    <line x1={x + w} y1={top} x2={x + w} y2={bottom} stroke={C.soft} strokeWidth={3} />
    <line x1={x - 2} y1={bottom} x2={x + w + 2} y2={bottom} stroke={C.soft} strokeWidth={4} />
    {caption && <text x={x + w / 2} y={top - 10} textAnchor="middle" fontSize={13} fill={C.soft}>{caption}</text>}
  </g>;
}

export const joules = (E: number) => `${Math.abs(E) < 0.5 ? '0' : E.toFixed(0)}`;

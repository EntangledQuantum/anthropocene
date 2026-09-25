/**
 * Chapter 24's small kit: the parallel-plate capacitor drawn from its state.
 *
 * `CapacitorPicture` draws two plates side by side (the + plate on the left),
 * the free charge on them as dots, the field lines across the gap, and, when
 * there is a slab, the glass with its turned molecules and bound charge.
 * Everything is counted from `capacitor.ts`, on one scale: `lineE` is the
 * field that earns one line across the full plate height, and one dot is the
 * charge that starts one such line in air (ε₀ · lineE · A). So beside the air
 * every dot sends a line across; beside the glass there are κ times as many
 * dots, and all but one in κ end on the glass's bound charge.
 *
 * World coordinates: x in millimetres (the plates sit at x = 0 and x = gap),
 * y in plate heights of 1/10 (the plates run from y = 0 to y = 10). The gap is
 * drawn hugely enlarged against the 10 cm plates, and every scene says so.
 */
import type { ReactNode } from 'react';
import { EPS0, boundCharge, chargeSplit, field, type Cap } from '../../lib/physics/capacitor.ts';
import { C, type StageApi } from './scene.tsx';

export const POS = 'var(--color-rose)';
export const NEG = 'var(--color-violet)';
export const PLATE_H = 10;
const DOT_GAP_PX = 7.5;

/** Evenly spaced dots along a plate face; crowded dots stack in extra columns outward. */
function dotColumn(s: StageApi, n: number, y0: number, y1: number, xFacePx: number, outward: 1 | -1, color: string, key: string) {
  if (n <= 0 || y1 <= y0) return null;
  const spanPx = s.sy(y0) - s.sy(y1);
  const cols = Math.max(1, Math.ceil((n * DOT_GAP_PX) / spanPx));
  const perCol = Math.ceil(n / cols);
  const out: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const col = Math.floor(i / perCol), row = i % perCol;
    const inCol = Math.min(perCol, n - col * perCol);
    const y = y0 + ((row + 0.5) / inCol) * (y1 - y0);
    out.push(<circle key={`${key}${i}`} cx={xFacePx + outward * (4 + col * 7)} cy={s.sy(y)} r={3} fill={color} />);
  }
  return out;
}

/** Pseudo-random but fixed per molecule, so the glass does not shimmer. */
const jitter = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function CapacitorPicture({ s, c, lineE, shade = 0, slabParked }: {
  s: StageApi;
  c: Cap;
  /** Field, V/m, that earns one line across the whole plate height. */
  lineE: number;
  /** Aqua wash in the gap, 0..1: the energy density on the scene's own scale. */
  shade?: number;
  /** Draw an unused slab parked to the right of the plates. */
  slabParked?: boolean;
}) {
  const gap = c.gap * 1000;
  const E = field(c);
  const qDot = EPS0 * lineE * c.area;
  const split = chargeSplit(c);
  const yGlass = PLATE_H * c.fill; // glass occupies y in [yGlass − H, yGlass]
  const nAir = Math.round(split.air / qDot);
  const nGlass = Math.round(split.glass / qDot);
  const nBound = Math.round(boundCharge(c) / qDot);
  const nLines = Math.round(Math.abs(E) / lineE);
  const x0 = s.sx(0), x1 = s.sx(gap);
  const plateW = 8;
  const hasSlab = c.kappa > 1;

  const slab = (sx0: number, sx1: number, top: number, inField: boolean) => {
    const cols = Math.max(2, Math.min(4, Math.floor((sx1 - sx0) / 26)));
    const mol: ReactNode[] = [];
    let k = 0;
    for (let yy = top - PLATE_H + 0.6; yy < top - 0.3; yy += 1.1) {
      for (let j = 0; j < cols; j++, k++) {
        const cx = sx0 + ((j + 0.5) / cols) * (sx1 - sx0);
        const inside = inField && yy > 0 && yy < PLATE_H && E > 0;
        const a = inside ? (jitter(k) - 0.5) * 0.5 : jitter(k) * Math.PI * 2;
        const dx = Math.cos(a) * 7, dy = -Math.sin(a) * 7;
        const cy = s.sy(yy);
        mol.push(<g key={`m${k}`} opacity={0.8}>
          <line x1={cx - dx} y1={cy - dy} x2={cx + dx} y2={cy + dy} stroke={C.faint} strokeWidth={1.2} />
          <circle cx={cx - dx} cy={cy - dy} r={2.2} fill={NEG} />
          <circle cx={cx + dx} cy={cy + dy} r={2.2} fill={POS} />
        </g>);
      }
    }
    return <g>
      <rect x={sx0} y={s.sy(top)} width={sx1 - sx0} height={s.sy(top - PLATE_H) - s.sy(top)} rx={2}
        fill="color-mix(in oklab, var(--color-iris) 12%, transparent)" stroke={C.faint} strokeWidth={1.2} />
      {mol}
    </g>;
  };

  return <g>
    {shade > 0 && <rect x={x0} y={s.sy(PLATE_H)} width={x1 - x0} height={s.sy(0) - s.sy(PLATE_H)}
      fill={C.energy} opacity={Math.min(1, shade) * 0.55} />}
    {hasSlab && slab(x0 + 2, x1 - 2, yGlass, true)}
    {slabParked && slab(x1 + 60, x1 + 60 + Math.max(60, x1 - x0), PLATE_H, false)}
    {/* field lines: evenly spread over the whole plate, the same density beside glass and air */}
    {E > 0 && Array.from({ length: nLines }, (_, i) => {
      const y = s.sy(((i + 0.5) / nLines) * PLATE_H);
      const mid = (x0 + x1) / 2;
      return <g key={`l${i}`}>
        <line x1={x0 + 3} x2={x1 - 3} y1={y} y2={y} stroke={C.field} strokeWidth={1.6} opacity={0.9} />
        <path d={`M${mid + 5},${y}L${mid - 3},${y - 4}L${mid - 3},${y + 4}Z`} fill={C.field} />
      </g>;
    })}
    {/* bound charge on the glass faces: − beside the + plate, + beside the − plate */}
    {hasSlab && dotColumn(s, nBound, Math.max(0, yGlass - PLATE_H), Math.min(PLATE_H, yGlass), x0 + 2, 1, NEG, 'bl')}
    {hasSlab && dotColumn(s, nBound, Math.max(0, yGlass - PLATE_H), Math.min(PLATE_H, yGlass), x1 - 2, -1, POS, 'br')}
    {/* the plates */}
    <rect x={x0 - plateW} y={s.sy(PLATE_H)} width={plateW} height={s.sy(0) - s.sy(PLATE_H)} fill={C.surface} stroke={C.soft} strokeWidth={1.5} />
    <rect x={x1} y={s.sy(PLATE_H)} width={plateW} height={s.sy(0) - s.sy(PLATE_H)} fill={C.surface} stroke={C.soft} strokeWidth={1.5} />
    {/* free charge on the plates: dots pile up beside the glass */}
    {dotColumn(s, nAir, Math.min(PLATE_H, Math.max(0, yGlass)), PLATE_H, x0 - 1, -1, POS, 'fa+')}
    {dotColumn(s, nAir, Math.min(PLATE_H, Math.max(0, yGlass)), PLATE_H, x1 + 1, 1, NEG, 'fa-')}
    {hasSlab && dotColumn(s, nGlass, 0, Math.min(PLATE_H, yGlass), x0 - 1, -1, POS, 'fg+')}
    {hasSlab && dotColumn(s, nGlass, 0, Math.min(PLATE_H, yGlass), x1 + 1, 1, NEG, 'fg-')}
  </g>;
}

/** A dimension line under the gap: "2.0 mm". */
export function GapLabel({ s, gap, y = -0.55 }: { s: StageApi; gap: number; y?: number }) {
  const a = s.sx(0), b = s.sx(gap), yy = s.sy(y);
  return <g>
    <line x1={a} x2={b} y1={yy} y2={yy} stroke={C.faint} strokeWidth={1} />
    <line x1={a} x2={a} y1={yy - 4} y2={yy + 4} stroke={C.faint} />
    <line x1={b} x2={b} y1={yy - 4} y2={yy + 4} stroke={C.faint} />
    <text x={(a + b) / 2} y={yy + 16} textAnchor="middle" fontSize={13} fill={C.soft} fontFamily="var(--font-mono)">{gap.toFixed(1)} mm</text>
  </g>;
}

/** Plate labels, "+" over the left plate and "−" over the right. */
export function PlateSigns({ s, gap }: { s: StageApi; gap: number }) {
  return <g fontSize={16} fontWeight={700} textAnchor="middle">
    <text x={s.sx(0) - 4} y={s.sy(PLATE_H) - 8} fill={POS}>+</text>
    <text x={s.sx(gap) + 4} y={s.sy(PLATE_H) - 8} fill={NEG}>−</text>
  </g>;
}

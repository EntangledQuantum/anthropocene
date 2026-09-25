/**
 * The chapter 11 world: a plank lying on two trestles, and a painter on it.
 * Drawing only — every number comes from src/lib/physics/statics.ts. Shared by
 * TorquesAnywhere and WalkThePlank, which are the same picture asked two
 * different questions.
 */
import { Arrow, C, type StageApi } from './scene.tsx';

/** Height of the plank's underside above the floor, m. */
export const TRESTLE_H = 0.8;
export const PLANK_T = 0.08;
/** Newtons → metres of arrow. */
export const KF = 0.00068;

export function Trestle({ s, x }: { s: StageApi; x: number }) {
  const top = s.sy(TRESTLE_H), foot = s.sy(0);
  const cx = s.sx(x), half = s.len(0.22), cap = s.len(0.16);
  return <g stroke={C.faint} strokeWidth={2} fill="none">
    <line x1={cx - cap} x2={cx + cap} y1={top} y2={top} strokeWidth={3} />
    <line x1={cx - cap * 0.6} y1={top} x2={cx - half} y2={foot} />
    <line x1={cx + cap * 0.6} y1={top} x2={cx + half} y2={foot} />
  </g>;
}

export function PlankBar({ s, length }: { s: StageApi; length: number }) {
  return <rect x={s.sx(0)} y={s.sy(TRESTLE_H + PLANK_T)} width={s.len(length)} height={s.len(PLANK_T)} rx={3}
    fill={C.surface} stroke={C.soft} strokeWidth={2} />;
}

/** Height of a standing figure's middle, where the drag handle goes. */
export const PAINTER_MID = TRESTLE_H + PLANK_T + 0.45;

export function Painter({ s, x, label }: { s: StageApi; x: number; label?: string }) {
  const feet = TRESTLE_H + PLANK_T;
  const cx = s.sx(x);
  return <g>
    <rect x={cx - s.len(0.13)} y={s.sy(feet + 0.84)} width={s.len(0.26)} height={s.len(0.84)} rx={s.len(0.1)}
      fill={C.surface} stroke={C.soft} strokeWidth={2} />
    <circle cx={cx} cy={s.sy(feet + 1.0)} r={s.len(0.12)} fill={C.surface} stroke={C.soft} strokeWidth={2} />
    {label && <text x={cx} y={s.sy(feet + 1.18)} textAnchor="middle" fontSize={13} fill={C.soft}>{label}</text>}
  </g>;
}

/** A force on the plank, drawn where it acts: a push down from above ends
 *  below the plank with its tail at the plank; a push up from a trestle ends
 *  at the plank's underside. Draw these BEFORE the plank so it covers the tails.
 *  The label sits beside the shaft, clear of the plank. */
export function PlankForce({ s, x, push, label, side = 1 }: {
  s: StageApi; x: number; push: number; label: string; side?: 1 | -1;
}) {
  const n = Math.abs(push) * KF;
  const up = push > 0;
  const from: readonly [number, number] = up ? [x, TRESTLE_H - n] : [x, TRESTLE_H + PLANK_T];
  const to: readonly [number, number] = up ? [x, TRESTLE_H] : [x, TRESTLE_H - n + PLANK_T];
  const my = up ? TRESTLE_H - n * 0.55 : TRESTLE_H + PLANK_T - n * 0.6;
  return <g>
    <Arrow s={s} from={from} to={to} color={C.force} />
    <text x={s.sx(x) + side * 9} y={s.sy(my) + 5} textAnchor={side > 0 ? 'start' : 'end'} fontSize={14} fontWeight={600} fill={C.force}
      stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{label}</text>
  </g>;
}

/** Plank tick marks every half metre from its left end. */
export function PlankTicks({ s, length }: { s: StageApi; length: number }) {
  const y = s.sy(0);
  const ticks: number[] = [];
  for (let d = 0; d <= length + 1e-9; d += 0.5) ticks.push(d);
  return <g>
    {ticks.map((d) => <g key={d}>
      <line x1={s.sx(d)} x2={s.sx(d)} y1={y} y2={y + 6} stroke={C.faint} />
      <text x={s.sx(d)} y={y + 20} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{d}</text>
    </g>)}
    <text x={s.sx(length) + 16} y={y + 20} fontSize={12} fill={C.faint}>m</text>
  </g>;
}

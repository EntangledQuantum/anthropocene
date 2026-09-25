/**
 * A wire clamped at a far wall and pulled at its near end, drawn along x with
 * the world unit = one millimetre of stretch. Only the last part of the wire
 * is shown; the rest, back to the clamp, is behind the break mark. Drawing
 * only — every number comes from src/lib/physics/statics.ts. Shared by
 * MatchTheStretch and WireSpringBack.
 */
import { C, type StageApi } from './scene.tsx';

export function HWire({ s, y, end, from, thick, label }: {
  s: StageApi; y: number; end: number; from: number; thick: number; label: string;
}) {
  const bx = s.sx(from) + 34;
  return <g>
    <line x1={s.sx(from)} x2={s.sx(from)} y1={s.sy(y) - 16} y2={s.sy(y) + 16} stroke={C.faint} strokeWidth={3} />
    {[-12, -4, 4, 12].map((d) => <line key={d} x1={s.sx(from)} y1={s.sy(y) + d} x2={s.sx(from) - 8} y2={s.sy(y) + d + 6} stroke={C.faint} />)}
    <line x1={s.sx(from)} x2={bx - 6} y1={s.sy(y)} y2={s.sy(y)} stroke={C.soft} strokeWidth={thick} />
    <line x1={bx + 6} x2={s.sx(end)} y1={s.sy(y)} y2={s.sy(y)} stroke={C.soft} strokeWidth={thick} />
    <path d={`M${bx - 10},${s.sy(y) + 9}L${bx - 2},${s.sy(y) - 9}M${bx + 2},${s.sy(y) + 9}L${bx + 10},${s.sy(y) - 9}`} stroke={C.faint} strokeWidth={1.5} />
    <text x={s.sx(from) + 6} y={s.sy(y) - 18} fontSize={12} fill={C.faint}>{label}</text>
    <rect x={s.sx(end) - 5} y={s.sy(y) - 11} width={10} height={22} rx={2} fill={C.surface} stroke={C.ink} strokeWidth={2} />
  </g>;
}

/** A millimetre scale along x at height y: minor ticks every `minor`, labels every `major`. */
export function MmScale({ s, y, to, minor, major }: { s: StageApi; y: number; to: number; minor: number; major: number }) {
  const ticks: number[] = [];
  for (let v = 0; v <= to + 1e-9; v += minor) ticks.push(+v.toFixed(6));
  const isMajor = (v: number) => Math.abs(v / major - Math.round(v / major)) < 1e-6;
  return <g>
    <line x1={s.sx(0)} x2={s.sx(to)} y1={s.sy(y)} y2={s.sy(y)} stroke={C.faint} />
    {ticks.map((v) => <g key={v}>
      <line x1={s.sx(v)} x2={s.sx(v)} y1={s.sy(y)} y2={s.sy(y) + (isMajor(v) ? 9 : 5)} stroke={C.faint} />
      {isMajor(v) && <text x={s.sx(v)} y={s.sy(y) + 23} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{+v.toFixed(2)}</text>}
    </g>)}
    <text x={s.sx(0) - 12} y={s.sy(y) + 23} textAnchor="end" fontSize={12} fill={C.faint}>stretch, mm</text>
  </g>;
}

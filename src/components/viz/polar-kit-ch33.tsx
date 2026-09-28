/**
 * Pieces shared by chapter 33's polarisation scenes. The beam runs left to
 * right across the stage; everything that shows the light's field is drawn
 * face-on, as if you looked back down the beam.
 *
 *   Beam        a horizontal band of light whose glow is its brightness
 *   Lamp        a bulb, glowing
 *   Unpolarised the lamp's field: arrows in every direction at once
 *   FieldArrow  the field after a filter: a double-headed orchid arrow
 *   Filter      a polarising filter, face-on, its slots along its axis
 *   Screen      where the light lands, glowing as bright as it arrives
 *   AxisKnob    a draggable knob on a filter's rim that turns it
 *
 * Angles are degrees from vertical, clockwise as you look at the stage. The
 * field is orchid, as every field on this path is.
 */
import { C, Handle, type StageApi, type Vec } from './scene.tsx';
import { LIGHT } from './optics-kit-ch33.tsx';

const rad = (d: number) => (d * Math.PI) / 180;
/** World unit vector along a filter axis at `deg` from vertical, clockwise. */
export const axisDir = (deg: number): Vec => [Math.sin(rad(deg)), Math.cos(rad(deg))];

export function Beam({ s, x0, x1, y, b, glow }: { s: StageApi; x0: number; x1: number; y: number; b: number; glow: string }) {
  if (b <= 0.002) return null;
  return <g>
    <line x1={s.sx(x0)} x2={s.sx(x1)} y1={s.sy(y)} y2={s.sy(y)} stroke={LIGHT} strokeWidth={22} opacity={0.5 * Math.min(1, b)} filter={`url(#${glow})`} />
    <line x1={s.sx(x0)} x2={s.sx(x1)} y1={s.sy(y)} y2={s.sy(y)} stroke={LIGHT} strokeWidth={3} opacity={0.2 + 0.8 * Math.min(1, b)} />
  </g>;
}

export function Lamp({ s, at, glow, on = true }: { s: StageApi; at: Vec; glow: string; on?: boolean }) {
  return <g>
    {on && <circle cx={s.sx(at[0])} cy={s.sy(at[1])} r={24} fill={LIGHT} opacity={0.55} filter={`url(#${glow})`} />}
    <circle cx={s.sx(at[0])} cy={s.sy(at[1])} r={15} fill={on ? LIGHT : C.surface} stroke={C.ink} strokeWidth={2} opacity={on ? 0.95 : 1} />
    <text x={s.sx(at[0])} y={s.sy(at[1]) + 42} textAnchor="middle" fontSize={12} fill={C.faint}>lamp</text>
  </g>;
}

export function FieldArrow({ s, at, deg, len, dim, dash }: { s: StageApi; at: Vec; deg: number; len: number; dim?: boolean; dash?: string }) {
  if (len < 1.5) return null;
  const [ux, uy] = axisDir(deg);
  const a: Vec = [at[0] - ux * len, at[1] - uy * len], b: Vec = [at[0] + ux * len, at[1] + uy * len];
  const head = (p: Vec, q: Vec) => {
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const vx = (q[0] - p[0]) / L, vy = (q[1] - p[1]) / L, h = Math.min(9, len * 0.5);
    const bx = q[0] - vx * h, by = q[1] - vy * h;
    return `M${s.sx(q[0])},${s.sy(q[1])}L${s.sx(bx - vy * h * 0.55)},${s.sy(by + vx * h * 0.55)}L${s.sx(bx + vy * h * 0.55)},${s.sy(by - vx * h * 0.55)}Z`;
  };
  const op = dim ? 0.45 : 1;
  return <g opacity={op}>
    <line x1={s.sx(a[0])} y1={s.sy(a[1])} x2={s.sx(b[0])} y2={s.sy(b[1])} stroke={C.field} strokeWidth={dim ? 2 : 3} strokeDasharray={dash} />
    {!dash && <path d={head(a, b)} fill={C.field} />}
    {!dash && <path d={head(b, a)} fill={C.field} />}
  </g>;
}

export function Unpolarised({ s, at, len }: { s: StageApi; at: Vec; len: number }) {
  return <g>{[0, 30, 60, 90, 120, 150].map((d) => <FieldArrow key={d} s={s} at={at} deg={d} len={len} />)}</g>;
}

export function Filter({ s, at, r, deg, label, slots = true }: { s: StageApi; at: Vec; r: number; deg: number; label?: string; slots?: boolean }) {
  const [ux, uy] = axisDir(deg);
  const px = uy, py = -ux; // across the axis
  const lines = slots ? [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75] : [0];
  return <g>
    <circle cx={s.sx(at[0])} cy={s.sy(at[1])} r={r} fill="color-mix(in oklab, var(--color-ink-ghost) 30%, var(--color-surface))" stroke={C.soft} strokeWidth={2} opacity={0.92} />
    {lines.map((o) => {
      const h = r * Math.sqrt(1 - o * o) * 0.94;
      const cx = at[0] + px * o * r, cy = at[1] + py * o * r;
      return <line key={o} x1={s.sx(cx - ux * h)} y1={s.sy(cy - uy * h)} x2={s.sx(cx + ux * h)} y2={s.sy(cy + uy * h)}
        stroke={o === 0 ? C.ink : C.faint} strokeWidth={o === 0 ? 2 : 1.2} />;
    })}
    {label && <text x={s.sx(at[0])} y={s.sy(at[1] - r) + 18} textAnchor="middle" fontSize={12} fill={C.faint}>{label}</text>}
  </g>;
}

export function Screen({ s, at, b, glow, h = 110 }: { s: StageApi; at: Vec; b: number; glow: string; h?: number }) {
  return <g>
    {b > 0.002 && <circle cx={s.sx(at[0])} cy={s.sy(at[1])} r={30} fill={LIGHT} opacity={0.75 * Math.min(1, b)} filter={`url(#${glow})`} />}
    <rect x={s.sx(at[0]) - 5} y={s.sy(at[1] + h / 2)} width={10} height={h} rx={2} fill="none" stroke={C.soft} strokeWidth={2} />
    <text x={s.sx(at[0])} y={s.sy(at[1] - h / 2) + 18} textAnchor="middle" fontSize={12} fill={C.faint}>screen</text>
  </g>;
}

/** A knob on the rim of the filter at `at`, radius r; reports the new axis angle in [−90, 90]. */
export function AxisKnob({ s, at, r, deg, onChange, label }: {
  s: StageApi; at: Vec; r: number; deg: number; onChange: (deg: number) => void; label: string;
}) {
  const [ux, uy] = axisDir(deg);
  return <Handle s={s} at={[at[0] + ux * r, at[1] + uy * r]} step={2} color={C.ink} label={label}
    onChange={(p) => {
      let d = (Math.atan2(p[0] - at[0], p[1] - at[1]) * 180) / Math.PI;
      if (d > 90) d -= 180;
      if (d < -90) d += 180;
      onChange(Math.round(d));
    }} />;
}

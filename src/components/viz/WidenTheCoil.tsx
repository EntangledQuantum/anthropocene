import { useMemo, useState } from 'react';
import { MU0, biotSavart, coilRings, siUnit, turnPositions } from '../../lib/physics/biot.ts';
import { C, Handle, Meter, SceneCard, Stage } from './scene.tsx';
import { CoilSection, FieldArrows, ScaleBar, coilArrows } from './magnet-kit-ch28.tsx';

/**
 * A coil cut lengthwise: its turns cross the page as dots along the top and
 * crosses along the bottom. Drag the top of the coil to make it wider or
 * narrower; the number of turns, the length and the current stay fixed.
 *
 * Every arrow and number is the numerical Biot–Savart sum over the actual
 * rings (`coilRings`, `biotSavart` in biot.ts). The field in the middle
 * barely moves as the coil widens, because it is μ₀nI, and n and I did not
 * change. The companion strip under the coil is the field along the axis: a
 * flat plateau inside that halves at each mouth and dies outside. Widening
 * shortens the plateau at the ends, which is the honest limit of "long".
 *
 * Ungraded: a payoff to play with.
 */
export interface WidenTheCoilProps {
  prompt?: string;
  turns?: number;
  /** cm */
  length?: number;
  /** A */
  current?: number;
  /** Starting radius, cm. */
  radius?: number;
}

const XS = Array.from({ length: 17 }, (_, i) => -16 + i * 2);
const YS = [-5.8, -4.6, -3.4, -2.2, -1, 0, 1, 2.2, 3.4, 4.6, 5.8];

export default function WidenTheCoil({ prompt, turns = 30, length = 30, current = 2, radius = 1.2 }: WidenTheCoilProps) {
  const [R, setR] = useState(radius);
  const xs = turnPositions(turns, length);
  const rings = useMemo(() => coilRings(turns, length / 100, R / 100, current, 0, 40), [turns, length, R, current]);
  const arrows = useMemo(() => coilArrows(rings, XS, YS).filter(({ at }) =>
    !xs.some((x) => Math.abs(x - at[0]) < 0.8 && Math.abs(Math.abs(at[1]) - R) < 0.8)), [rings, xs, R]);
  const mid = biotSavart(rings, [0, 0, 0])[0];
  const ideal = MU0 * (turns / (length / 100)) * current;
  const profile = useMemo(() => Array.from({ length: 73 }, (_, i) => {
    const x = -18 + i * 0.5;
    return [x, biotSavart(rings, [x / 100, 0, 0])[0]] as const;
  }), [rings]);

  // the companion strip: B on the axis against position
  const PW = 640, PH = 120, pl = 52, pr = 16, pt = 12, pb = 28;
  const px = (x: number) => pl + ((x + 18) / 36) * (PW - pl - pr);
  const py = (b: number) => PH - pb - (b / (ideal * 1.25)) * (PH - pt - pb);

  return (
    <SceneCard prompt={prompt}
      footer={<div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'end' }}>
        <Meter label="Coil radius" value={R.toFixed(1)} unit="cm" color={C.position} />
        <Meter label="Field in the middle" value={siUnit(mid, 'T')} color={C.field} />
        <Meter label="Turns, length, current" value={`${turns} · ${length} cm · ${current} A`} color={C.faint} />
      </div>}>
      <Stage x={[-18, 18]} y={[-6.5, 6.5]} height={280} equal
        label={`A coil of ${turns} turns, ${length} centimetres long, radius ${R.toFixed(1)} centimetres, carrying ${current} amperes. Field in the middle ${siUnit(mid, 'tesla')}.`}>
        {(s) => <>
          <line x1={s.sx(-18)} x2={s.sx(18)} y1={s.sy(0)} y2={s.sy(0)} stroke={C.grid} strokeDasharray="3 6" />
          <FieldArrows s={s} arrows={arrows} full={ideal} maxLen={1.7} />
          <CoilSection s={s} xs={xs} R={R} I={1} r={5} />
          <ScaleBar s={s} at={[-17.5, -6]} length={5} label="5 cm" />
          <Handle s={s} at={[xs[0], R]} color={C.position} step={0.2} r={9} label="Top of the coil: drag up to widen"
            onChange={(p) => setR(Math.max(0.6, Math.min(4.6, p[1])))} />
        </>}
      </Stage>
      <svg viewBox={`0 0 ${PW} ${PH}`} style={{ width: '100%', display: 'block', marginTop: 6 }} role="img"
        aria-label="Field along the axis against position: flat inside the coil, half at each end, near zero outside.">
        {[0, 0.5, 1].map((f) => <g key={f}>
          <line x1={pl} x2={PW - pr} y1={py(f * ideal)} y2={py(f * ideal)} stroke={C.grid} />
          <text x={pl - 6} y={py(f * ideal) + 4} textAnchor="end" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{(f * ideal * 1000).toFixed(2)}</text>
        </g>)}
        {[-15, -10, -5, 0, 5, 10, 15].map((x) => <text key={x} x={px(x)} y={PH - 10} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{x}</text>)}
        <rect x={px(-length / 2)} y={pt} width={px(length / 2) - px(-length / 2)} height={PH - pt - pb} fill="var(--color-iris)" fillOpacity={0.06} />
        <polyline fill="none" stroke={C.field} strokeWidth={2.4} points={profile.map(([x, b]) => `${px(x).toFixed(1)},${py(b).toFixed(1)}`).join(' ')} />
        <text x={pl + 6} y={pt + 11} fontSize={12} fill={C.soft}>field on the axis (mT)</text>
        <text x={PW - pr} y={pt + 11} textAnchor="end" fontSize={12} fill={C.soft}>position (cm) · shaded: inside the coil</text>
      </svg>
    </SceneCard>
  );
}

import { useState } from 'react';
import { NANO, dipole, eField, si, type Charge } from '../../lib/physics/charges-ch21.ts';
import { Arrow, C, Handle, Meter, SceneCard, Stage, type Vec } from './scene.tsx';
import { ChargeDot, ShadeKey, ShadedStage } from './charge-kit-ch21.tsx';

/**
 * A dipole, +1 and −1 nC two centimetres apart, and a probe you slide out
 * along its axis. The GPU shading paints |E| with a contour every factor of
 * two, so the falloff is visible as contour spacing: between 10 and 20 cm the
 * probe crosses three contours (×1/8), not two. One button removes the −
 * charge, and the same walk crosses two (×1/4).
 *
 * Ungraded: the payoff of a prediction. Physics: `dipole`, `eField` from
 * charges-ch21.ts; the 1/r³ claim is pinned in charges-ch21.test.ts.
 */
export interface WalkFromTheDipoleProps {
  prompt?: string;
}

const CM = 0.01;
const SEP = 2;      // cm between the charges
const PER = 0.011;  // probe arrow cm per N/C

export default function WalkFromTheDipole({ prompt }: WalkFromTheDipoleProps) {
  const [x, setX] = useState(10);
  const [pair, setPair] = useState(true);

  const cm: Charge[] = pair ? dipole(1, SEP) : [dipole(1, SEP)[0]];
  const siC = cm.map((c) => ({ x: c.x * CM, y: c.y * CM, q: c.q * NANO }));
  const E = eField(siC, x * CM, 0);
  const Em = Math.hypot(E[0], E[1]);

  const arrows: { at: Vec; u: Vec }[] = [];
  for (let gx = -9; gx <= 33; gx += 3) {
    for (let gy = -9; gy <= 9; gy += 3) {
      if (cm.some((c) => Math.hypot(c.x - gx, c.y - gy) < 1.8) || Math.abs(gy) < 1) continue;
      const e = eField(siC, gx * CM, gy * CM);
      const m = Math.hypot(e[0], e[1]);
      if (m > 0) arrows.push({ at: [gx, gy], u: [e[0] / m, e[1] / m] });
    }
  }
  const len = Math.min(7, Em * PER);

  return (
    <SceneCard prompt={prompt}
      footer={<div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'end' }}>
        <Meter label="Probe distance from the centre" value={`${x.toFixed(1)} cm`} color={C.position} />
        <Meter label="Field at the probe" value={si(Em, 'N/C')} color={C.field} />
        <button type="button" className="anth-btn" onClick={() => setPair(!pair)}>
          {pair ? 'Remove the − charge' : 'Put the − charge back'}
        </button>
      </div>}>
      <ShadedStage charges={cm} range={[-13, 0]} stage={(capture) =>
        <Stage x={[-8, 32]} y={[-10, 10]} height={300} equal
          label={`${pair ? 'A dipole' : 'A single +1 nC charge'}; the probe is ${x.toFixed(1)} cm out along the axis, where the field is ${si(Em, 'N/C')}.`}>
          {(s) => { capture(s); return <>
            {arrows.map((a, i) => <g key={i} opacity={0.55}>
              <Arrow s={s} from={[a.at[0] - a.u[0] * 0.65, a.at[1] - a.u[1] * 0.65]} to={[a.at[0] + a.u[0] * 0.65, a.at[1] + a.u[1] * 0.65]} color={C.field} width={1.5} />
            </g>)}
            <line x1={s.sx(0)} x2={s.sx(32)} y1={s.sy(0)} y2={s.sy(0)} stroke={C.rule} strokeWidth={1.5} />
            {[5, 10, 15, 20, 25, 30].map((t) => <g key={t}>
              <line x1={s.sx(t)} x2={s.sx(t)} y1={s.sy(0) - 5} y2={s.sy(0) + 5} stroke={t % 10 ? C.faint : C.soft} strokeWidth={t % 10 ? 1 : 2} />
              <text x={s.sx(t)} y={s.sy(0) + 20} textAnchor="middle" fontSize={12} fill={C.soft} fontFamily="var(--font-mono)"
                stroke="var(--color-surface)" strokeWidth={3} paintOrder="stroke">{t} cm</text>
            </g>)}
            {len > 0.2 && <Arrow s={s} from={[x, 0]} to={[x + (E[0] / Em) * len, (E[1] / Em) * len]} color={C.field} width={4} />}
            {cm.map((c, i) => <ChargeDot key={i} s={s} at={[c.x, c.y]} q={c.q} r={9} />)}
            <Handle s={s} at={[x, 0]} color={C.position} step={0.5} label="The probe: slide it along the axis"
              onChange={(q) => setX(Math.max(4, Math.min(31, q[0])))} />
          </>; }}
        </Stage>} />
      <p className="hud-label" style={{ margin: '8px 0 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span>{pair ? '+1 and −1 nC, 2 cm apart' : '+1 nC alone'} · arrows: the field's direction</span>
        <ShadeKey />
      </p>
    </SceneCard>
  );
}

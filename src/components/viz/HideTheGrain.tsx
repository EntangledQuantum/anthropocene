import { useState } from 'react';
import { K, NANO, directionWord, eField, si, type Charge } from '../../lib/physics/charges-ch21.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { ChargeDot, ShadeKey, ShadedStage } from './charge-kit-ch21.tsx';

/**
 * A big fixed charge, a dust grain, and a small charge of the other sign that
 * you drag. The shading under the arrows is |E| per pixel on the GPU: bright
 * where the field is strong, dark where it is weak, with a contour every
 * factor of two. Two fields superpose into one, and where they cancel the map
 * has a dark pinhole: the dead spot. It moves as you drag.
 *
 * Graded (`id`): put the dead spot on the grain. The small charge has to sit on
 * the segment from the big one to the grain, a fraction 1 − √(|q|/|Q|) of the
 * way (`cancelFraction`, pinned in charges-ch21.test.ts). The check itself only
 * asks `eField` how big the field at the grain is.
 */
export interface HideTheGrainProps {
  id?: string;
  prompt?: string;
  /** The fixed charge: cm, nC. */
  big?: { x: number; y: number; q: number };
  /** The charge you drag, nC. */
  small?: number;
  start?: [number, number];
  grain?: [number, number];
  /** Fraction of the big charge's own field at the grain that still counts as zero. */
  tolerance?: number;
  explanation?: string;
}

const CM = 0.01;
const REL = K * NANO / (CM * CM); // N/C for 1 nC at 1 cm: the shader's unit
const RANGE = [-9, 3] as const;

export default function HideTheGrain({
  id, prompt, big = { x: -10, y: -4, q: 9 }, small = -1, start = [6, -9], grain = [8, 5], tolerance = 0.12, explanation,
}: HideTheGrainProps) {
  const task = useTask(id, 'hide-the-grain');
  const [p, setP] = useState<Vec>(start);

  const world = [big, { x: p[0], y: p[1], q: small }];
  const si_: Charge[] = world.map((c) => ({ x: c.x * CM, y: c.y * CM, q: c.q * NANO }));
  const Eg = eField(si_, grain[0] * CM, grain[1] * CM);
  const EgMag = Math.hypot(Eg[0], Eg[1]);
  const alone = Math.hypot(...eField([si_[0]], grain[0] * CM, grain[1] * CM));
  const dead = EgMag <= tolerance * alone;

  const arrows: { at: Vec; u: Vec; o: number }[] = [];
  for (let x = -21; x <= 19; x += 3) {
    for (let y = -12; y <= 12; y += 3) {
      if (world.some((c) => Math.hypot(c.x - x, c.y - y) < 2) || Math.hypot(grain[0] - x, grain[1] - y) < 2) continue;
      const e = eField(si_, x * CM, y * CM);
      const m = Math.hypot(e[0], e[1]);
      if (m === 0) continue;
      const t = Math.min(1, Math.max(0, (Math.log2(m / REL) - RANGE[0]) / (RANGE[1] - RANGE[0])));
      arrows.push({ at: [x, y], u: [e[0] / m, e[1] / m], o: 0.3 + 0.7 * t });
    }
  }
  const PER = 2.5 / 1000; // arrow cm per N/C at the grain
  const gl = Math.min(9, EgMag * PER);

  const clamp = (q: Vec): Vec => {
    let x = Math.max(-20, Math.min(18, q[0]));
    let y = Math.max(-11.5, Math.min(11.5, q[1]));
    const d = Math.hypot(x - big.x, y - big.y);
    if (d < 2.5) { x = big.x + ((x - big.x) / (d || 1)) * 2.5; y = big.y + ((y - big.y) / (d || 1)) * 2.5; }
    return [x, y];
  };

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'end' }}>
          <Meter label="Field at the grain" value={EgMag < 1e-6 * alone ? '0 N/C' : si(EgMag, 'N/C')} color={C.field} />
          <Meter label="From the big charge alone" value={si(alone, 'N/C')} color={C.faint} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(dead, { p })}
          miss={`The field at the grain is ${si(EgMag, 'N/C')}, pointing ${directionWord(Eg)}. The grain is still pushed.`}
          hit={explanation} />}
      </div>}>
      <ShadedStage charges={world} range={RANGE} stage={(capture) =>
        <Stage x={[-22, 20]} y={[-13, 13]} height={360} equal
          label={`Field map. Fixed +${big.q} nC charge, your ${small} nC charge at ${p[0].toFixed(1)}, ${p[1].toFixed(1)} cm. Field at the grain ${si(EgMag, 'N/C')}.`}>
          {(s) => { capture(s); return <>
            {arrows.map((a, i) => <g key={i} opacity={a.o}>
              <Arrow s={s} from={[a.at[0] - a.u[0] * 0.7, a.at[1] - a.u[1] * 0.7]} to={[a.at[0] + a.u[0] * 0.7, a.at[1] + a.u[1] * 0.7]} color={C.field} width={1.6} />
            </g>)}
            <line x1={s.sx(-20)} x2={s.sx(-15)} y1={s.sy(-12)} y2={s.sy(-12)} stroke={C.soft} strokeWidth={2} />
            <text x={s.sx(-17.5)} y={s.sy(-12) - 7} textAnchor="middle" fontSize={12} fill={C.soft} fontFamily="var(--font-mono)">5 cm</text>
            <circle cx={s.sx(grain[0])} cy={s.sy(grain[1])} r={4.5} fill={C.ink} />
            <text x={s.sx(grain[0]) + 10} y={s.sy(grain[1]) + 18} fontSize={13} fill={C.ink}
              stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">dust grain</text>
            {gl > 0.25 && <Arrow s={s} from={grain} to={[grain[0] + (Eg[0] / EgMag) * gl, grain[1] + (Eg[1] / EgMag) * gl]} color={C.field} width={4} />}
            <ChargeDot s={s} at={[big.x, big.y]} q={big.q} label={`+${big.q} nC`} />
            <Handle s={s} at={p} color={NEGC} step={0.2} r={12} label={`Your ${small} nC charge: drag it`}
              onChange={(q) => { setP(clamp(q)); task.touch(); }} />
            <ChargeDot s={s} at={p} q={small} label={`${small < 0 ? '−' : '+'}${Math.abs(small)} nC`} />
          </>; }}
        </Stage>} />
      <p className="hud-label" style={{ margin: '8px 0 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span>Arrows: the field's direction; thick arrow: the field at the grain</span>
        <ShadeKey />
      </p>
    </SceneCard>
  );
}

const NEGC = 'var(--color-violet)';

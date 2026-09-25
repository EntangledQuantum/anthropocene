import { useState } from 'react';
import { MICRO, NANO, eField, forceOn, mN, sci, type Charge } from '../../lib/physics/charges-ch21.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { ChargeDot } from './charge-kit-ch21.tsx';

/**
 * A charged sphere and one marked spot near it. The orchid arrow at the spot
 * is the field there: the force it would put on each nanocoulomb. It is drawn
 * whether or not anything sits at the spot, and it never changes.
 *
 * Ungraded (`probes`): put beads of different charge on the spot. The amber
 * force arrow flips and stretches with q; F/q stays put.
 * Graded (`id` + `guess`): a bead of charge `guess` sits on the spot. Drag the
 * tip of the white arrow to the force you expect on it. Physics: forceOn and
 * eField from charges-ch21.ts, on the same arrow scale as the field.
 */
export interface SwapTheProbeProps {
  id?: string;
  prompt?: string;
  /** The sphere's charge, µC. */
  source?: number;
  /** The spot, cm from the sphere. */
  spot?: [number, number];
  /** Bead charges on offer, nC. */
  probes?: number[];
  /** Graded: the bead whose force you draw, nC. */
  guess?: number;
  /** Arrow cm per millinewton. */
  scale?: number;
  explanation?: string;
}

const CM = 0.01;
const fmtQ = (q: number) => `${q > 0 ? '+' : '−'}${Math.abs(q)} nC`;

export default function SwapTheProbe({
  id, prompt, source = 2, spot = [12, 9], probes = [-2, -1, 1, 2, 3], guess, scale = 4, explanation,
}: SwapTheProbeProps) {
  const graded = Boolean(id && guess !== undefined);
  const task = useTask(graded ? id : undefined, 'swap-the-probe');
  const [probe, setProbe] = useState<number | null>(graded ? guess! : 1);
  const src: Charge[] = [{ x: 0, y: 0, q: source * MICRO }];
  const E = eField(src, spot[0] * CM, spot[1] * CM);
  const perNC: Vec = [E[0] * NANO, E[1] * NANO]; // newtons per nanocoulomb
  const F = probe === null ? null : forceOn(src, probe * NANO, spot[0] * CM, spot[1] * CM);
  const tipOf = (f: readonly [number, number]): Vec => [spot[0] + f[0] * 1000 * scale, spot[1] + f[1] * 1000 * scale];

  const [tip, setTip] = useState<Vec>([spot[0] + 3, spot[1] - 2]);
  const guessF: Vec = [(tip[0] - spot[0]) / (1000 * scale), (tip[1] - spot[1]) / (1000 * scale)];
  const trueTip = F ? tipOf(F) : spot;
  const Fmag = F ? Math.hypot(F[0], F[1]) : 0;
  const err = Math.hypot(tip[0] - trueTip[0], tip[1] - trueTip[1]);
  const hit = graded && err <= 0.15 * Math.hypot(trueTip[0] - spot[0], trueTip[1] - spot[1]);

  const r = Math.hypot(spot[0], spot[1]);
  const gMag = Math.hypot(guessF[0], guessF[1]);
  const cos = gMag > 0 ? (guessF[0] * spot[0] + guessF[1] * spot[1]) / (gMag * r) : 0;
  const gDir = cos > 0.7 ? 'away from the sphere' : cos < -0.7 ? 'toward the sphere' : 'across the line to the sphere';
  const showTrue = !graded || task.done;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        {!graded && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {probes.map((q) => <button key={q} type="button" className="anth-btn" aria-pressed={probe === q}
            style={probe === q ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : undefined}
            onClick={() => setProbe(q)}>{fmtQ(q)} bead</button>)}
          <button type="button" className="anth-btn" aria-pressed={probe === null}
            style={probe === null ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : undefined}
            onClick={() => setProbe(null)}>No bead</button>
        </div>}
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Bead on the spot" value={probe === null ? 'none' : fmtQ(probe)} />
          {graded
            ? <Meter label="Your arrow" value={mN(gMag)} color={C.ink} />
            : <Meter label="Force on the bead" value={F ? mN(Fmag) : 'none'} color={C.force} />}
          <Meter label="Field here, F / q" value={sci(Math.hypot(E[0], E[1]), 'N/C')} color={C.field} />
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { tip })}
          miss={`A ${fmtQ(guess!)} bead here is pulled ${mN(Fmag)} toward the sphere. Your arrow is ${mN(gMag)}, pointing ${gDir}.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-8, 32]} y={[-5, 17]} height={250} equal
        label={`A +${source} microcoulomb sphere. At the marked spot the field is ${sci(Math.hypot(E[0], E[1]), 'N/C')}, pointing away from it.`}>
        {(s) => <>
          <line x1={s.sx(0)} y1={s.sy(0)} x2={s.sx(spot[0] * 2.2)} y2={s.sy(spot[1] * 2.2)} stroke={C.grid} strokeDasharray="3 6" />
          <line x1={s.sx(0)} x2={s.sx(0)} y1={s.sy(-1.4)} y2={s.sy(-7)} stroke={C.ghost} strokeWidth={4} />
          <ChargeDot s={s} at={[0, 0]} q={source} r={s.len(1.4)} />
          <text x={s.sx(0) - s.len(1.4) - 8} y={s.sy(0) + 5} textAnchor="end" fontSize={14} fontWeight={600} fill={C.soft}>+{source} µC</text>
          {showTrue && F && <Arrow s={s} from={spot} to={trueTip} color={C.force} width={5}
            label={`F ${mN(Fmag)}`} labelSide={-1} />}
          <Arrow s={s} from={spot} to={tipOf(perNC)} color={C.field} width={2.5}
            label={`E: ${mN(Math.hypot(...perNC))} per nC`} labelSide={1} />
          {probe !== null
            ? <ChargeDot s={s} at={spot} q={probe} r={10} />
            : <circle cx={s.sx(spot[0])} cy={s.sy(spot[1])} r={6} fill="none" stroke={C.soft} strokeDasharray="2 3" />}
          {probe !== null && <text x={s.sx(spot[0]) + 14} y={s.sy(spot[1]) + 22} fontSize={12} fill={C.soft}>{fmtQ(probe)}</text>}
          {graded && <>
            <Arrow s={s} from={spot} to={tip} color={C.ink} width={3} dash="7 5" />
            <Handle s={s} at={tip} color={C.ink} step={0.25} label="Your force arrow: drag its tip"
              onChange={(q) => { setTip(q); task.touch(); }} />
          </>}
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        The spot is {r.toFixed(0)} cm from the sphere · orchid: the field, the force on each nC · amber: the force on the bead{graded ? ' · white: your arrow' : ''}
      </p>
    </SceneCard>
  );
}

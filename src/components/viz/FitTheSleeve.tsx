import { useMemo, useState } from 'react';
import { NANO, ellipseLoop, fluxThroughLoop, perimeter, rodField, tubeRods } from '../../lib/physics/gauss.ts';
import type { Vec2 } from '../../lib/physics/vectors.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { FluxTicks, SleevePath, TubeLines, TubeRing, axesFromRim, fieldRange, fmtRange, rimOf } from './gauss-kit.tsx';

/**
 * The charged tube again, a probe outside it whose reading is hidden, and a
 * sleeve you place (centre handle) and shape (rim handle). Gauss's law always
 * gives the flux; it only hands you the FIELD when the sleeve is one on which
 * the field is the same everywhere. Fit that sleeve through the probe.
 *
 * The ticks show the field piercing the sleeve, and they go even only when
 * the sleeve is concentric. Graded with `id`: centre on the axis, round, and
 * through the probe. Physics from gauss.ts; gauss.test.ts pins E = Φ / 2πr.
 */
export interface FitTheSleeveProps {
  id?: string;
  prompt?: string;
  /** Tube charge, nC/m, and radius, m. */
  lambda?: number;
  radius?: number;
  /** Probe position, m. */
  probe?: [number, number];
  explanation?: string;
}

const TOL = 0.06;

export default function FitTheSleeve({ id, prompt, lambda = 3, radius = 0.6, probe = [1.0, 0.6], explanation }: FitTheSleeveProps) {
  const task = useTask(id, 'fit-the-sleeve');
  const tube = useMemo(() => tubeRods(0, 0, radius, lambda * NANO), [lambda, radius]);
  const [c, setC] = useState<Vec2>([0.55, -0.35]);
  const [ab, setAb] = useState<[number, number]>([0.55, 0.4]);

  const loop = ellipseLoop(c[0], c[1], ab[0], ab[1]);
  const flux = fluxThroughLoop(tube, loop);
  const range = fieldRange(tube, loop);
  const rp = Math.hypot(probe[0], probe[1]);
  const off = Math.hypot(c[0], c[1]);
  const round = Math.abs(ab[0] - ab[1]) < TOL;
  const through = Math.abs(ab[0] - rp) < TOL && Math.abs(ab[1] - rp) < TOL;
  const hit = off < TOL && round && through;
  const eProbe = Math.hypot(...rodField(tube, probe[0], probe[1]));

  const miss = off >= TOL
    ? `The sleeve's centre is ${off.toFixed(2)} m off the tube's axis, so the field piercing it runs from ${fmtRange(range)} N/C: no single value to read off.`
    : !round
      ? `The sleeve is centred but oval, ${(2 * ab[0]).toFixed(2)} m by ${(2 * ab[1]).toFixed(2)} m, so the field piercing it runs from ${fmtRange(range)} N/C.`
      : `The field is ${range[1].toFixed(1)} N/C all round this sleeve, but the sleeve passes ${Math.abs(ab[0] - rp).toFixed(2)} m ${ab[0] < rp ? 'inside' : 'outside'} the probe. That is the field there, not at the probe.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          <Meter label="Flux out of the sleeve" value={flux.toFixed(0)} unit="N·m²/C" color={C.field} />
          <Meter label="Field piercing the sleeve" value={fmtRange(range)} unit="N/C" />
          <Meter label="Flux ÷ sleeve area" value={(flux / perimeter(loop)).toFixed(1)} unit="N/C" />
          <Meter label="Probe reads" value={task.done ? eProbe.toFixed(1) : 'covered'} unit={task.done ? 'N/C' : undefined} color={C.field} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { c, ab })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-2.4, 2.4]} y={[-1.4, 1.4]} height={340} equal
        label={`A charged tube and a sleeve centred ${off.toFixed(2)} m from its axis. Field piercing the sleeve ${fmtRange(range)} N/C.`}>
        {(s) => <>
          <TubeLines s={s} tube={tube} radius={radius} lambda={lambda} />
          <TubeRing s={s} radius={radius} />
          <SleevePath s={s} loop={loop} />
          <FluxTicks s={s} rods={tube} loop={loop} perNC={0.006} count={40} />
          <g pointerEvents="none">
            <rect x={s.sx(probe[0]) - 7} y={s.sy(probe[1]) - 7} width={14} height={14} rx={2} fill={C.surface} stroke={C.ink} strokeWidth={2} />
            <text x={s.sx(probe[0]) + 12} y={s.sy(probe[1]) - 10} fontSize={13} fill={C.soft}
              stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">probe</text>
          </g>
          <Handle s={s} at={c} step={0.02} label="Sleeve centre: drag to move the sleeve" color={C.soft} r={7}
            onChange={(p) => { setC([Math.min(2, Math.max(-2, p[0])), Math.min(1.2, Math.max(-1.2, p[1]))]); task.touch(); }} />
          <Handle s={s} at={rimOf(c[0], c[1], ab[0], ab[1])} step={0.02} label="Sleeve rim: drag to stretch or squash" color={C.ink}
            onChange={(p) => { setAb(axesFromRim(c[0], c[1], p)); task.touch(); }} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        A tube carrying {lambda} nC per metre, seen end-on, and a closed sleeve 1 m long · ticks: the field piercing the sleeve
      </p>
    </SceneCard>
  );
}

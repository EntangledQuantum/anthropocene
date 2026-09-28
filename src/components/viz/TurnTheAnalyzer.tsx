import { useState } from 'react';
import { DEG, alongAxis, throughFilters } from '../../lib/physics/light.ts';
import { C, CheckBar, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { useGlow } from './optics-kit-ch33.tsx';
import { AxisKnob, Beam, FieldArrow, Filter, Lamp, Screen, Unpolarised, axisDir } from './polar-kit-ch33.tsx';

/**
 * A lamp, a first filter with its slots vertical, and a second filter you turn
 * by its rim. Between the filters the field is a single vertical arrow. After
 * the second filter it lies along that filter's slots, as long as the part of
 * the vertical arrow along them (the dotted line is the projection), and the
 * screen glows with the square of that length.
 *
 * Numbers: `throughFilters` and `alongAxis` in light.ts. Graded with `id`
 * and `target`: turn until the second filter passes that fraction.
 */
export interface TurnTheAnalyzerProps {
  id?: string;
  prompt?: string;
  /** Fraction of the light reaching the second filter that it should pass. */
  target?: number;
  tolerance?: number;
  start?: number;
  explanation?: string;
}

const Y = 138, R = 56, LEN = 44;
const X = { lamp: 34, star: 100, f1: 190, e1: 290, f2: 392, e2: 492, screen: 588 };

export default function TurnTheAnalyzer({ id, prompt, target, tolerance = 0.02, start = 0, explanation }: TurnTheAnalyzerProps) {
  const graded = Boolean(id && target !== undefined);
  const task = useTask(graded ? id : undefined, 'turn-the-analyzer');
  const [deg, setDeg] = useState(start);
  const { id: glow, defs } = useGlow();
  const [I1, I2] = throughFilters(1, [0, deg * DEG]);
  const frac = I2 / I1;
  const amp = alongAxis(1, deg * DEG);
  const ok = graded && Math.abs(frac - target!) <= tolerance;
  const [ux, uy] = axisDir(deg);
  const tip = [X.e2 + ux * LEN * amp, Y + uy * LEN * amp];

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <span style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Angle between the filters" value={Math.abs(deg).toFixed(0)} unit="°" />
          <Meter label="Field through the second" value={(amp * 100).toFixed(0)} unit="%" color={C.field} />
          <Meter label="Light through the second" value={(frac * 100).toFixed(0)} unit="%" color={C.energy} />
        </span>
        {graded && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(ok, { deg })}
          miss={`At ${Math.abs(deg).toFixed(0)}° the second filter passes ${(frac * 100).toFixed(0)}% of the light reaching it, not ${(target! * 100).toFixed(0)}%.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[0, 616]} y={[0, 276]} height={300}
        label={`Two polarising filters at ${Math.abs(deg).toFixed(0)} degrees. The second passes ${(frac * 100).toFixed(0)} percent of the light reaching it.`}>
        {(s) => <>
          {defs}
          <Beam s={s} x0={X.lamp} x1={X.f1} y={Y} b={1} glow={glow} />
          <Beam s={s} x0={X.f1} x1={X.f2} y={Y} b={I1} glow={glow} />
          <Beam s={s} x0={X.f2} x1={X.screen} y={Y} b={I2} glow={glow} />
          <Lamp s={s} at={[X.lamp, Y]} glow={glow} />
          <Unpolarised s={s} at={[X.star, Y]} len={26} />
          <Filter s={s} at={[X.f1, Y]} r={R} deg={0} label="first" />
          <FieldArrow s={s} at={[X.e1, Y]} deg={0} len={LEN} />
          <Filter s={s} at={[X.f2, Y]} r={R} deg={deg} label="second" />
          {/* what arrived, and the part of it along the second filter's slots */}
          <FieldArrow s={s} at={[X.e2, Y]} deg={0} len={LEN} dim dash="3 5" />
          <line x1={s.sx(X.e2)} y1={s.sy(Y + LEN)} x2={s.sx(tip[0])} y2={s.sy(tip[1])} stroke={C.faint} strokeWidth={1.2} strokeDasharray="2 3" />
          <FieldArrow s={s} at={[X.e2, Y]} deg={deg} len={LEN * amp} />
          <Screen s={s} at={[X.screen, Y]} b={I2 * 2} glow={glow} />
          <text x={s.sx(X.e1)} y={s.sy(Y - LEN) + 24} textAnchor="middle" fontSize={12} fill={C.faint}>field</text>
          <AxisKnob s={s} at={[X.f2, Y]} r={R} deg={deg} label="Second filter: turn it by its rim"
            onChange={(d) => { setDeg(d); task.touch(); }} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Looking back down the beam · lines on a filter: its slots · orchid: the light’s electric field · dashed: the field that arrived
      </p>
    </SceneCard>
  );
}

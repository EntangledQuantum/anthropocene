import { useState } from 'react';
import { DEG, throughFilters } from '../../lib/physics/light.ts';
import { C, Meter, SceneCard, Stage } from './scene.tsx';
import { useGlow } from './optics-kit-ch33.tsx';
import { AxisKnob, Beam, FieldArrow, Filter, Lamp, Screen, Unpolarised } from './polar-kit-ch33.tsx';

/**
 * Two crossed filters, vertical then horizontal, and a third slipped between
 * them that you turn by its rim. The field after each filter is drawn at its
 * true angle and length, so you watch the middle filter turn the field part of
 * the way, and the last filter find something along its slots to pass.
 *
 * Ungraded: the payoff of the "third filter" bet. Numbers: `throughFilters`.
 */
export interface CrossedFiltersProps {
  prompt?: string;
  start?: number;
}

const Y = 138, R = 46, LEN = 38;
const X = { lamp: 30, star: 86, f1: 158, e1: 232, fm: 312, em: 392, f3: 470, e3: 540, screen: 596 };

export default function CrossedFilters({ prompt, start = 45 }: CrossedFiltersProps) {
  const [deg, setDeg] = useState(start);
  const { id: glow, defs } = useGlow();
  const [I1, I2, I3] = throughFilters(1, [0, deg * DEG, 90 * DEG]);

  return (
    <SceneCard prompt={prompt}
      footer={<span style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <Meter label="Middle filter" value={deg.toFixed(0)} unit="°" />
        <Meter label="After the middle filter" value={(I2 * 100).toFixed(1)} unit="% of the lamp" color={C.energy} />
        <Meter label="Reaching the screen" value={(I3 * 100).toFixed(1)} unit="% of the lamp" color={C.energy} />
      </span>}>
      <Stage x={[0, 616]} y={[0, 276]} height={300}
        label={`Crossed filters with a third between them at ${deg.toFixed(0)} degrees. ${(I3 * 100).toFixed(1)} percent of the lamp's light reaches the screen.`}>
        {(s) => <>
          {defs}
          <Beam s={s} x0={X.lamp} x1={X.f1} y={Y} b={1} glow={glow} />
          <Beam s={s} x0={X.f1} x1={X.fm} y={Y} b={I1} glow={glow} />
          <Beam s={s} x0={X.fm} x1={X.f3} y={Y} b={I2} glow={glow} />
          <Beam s={s} x0={X.f3} x1={X.screen} y={Y} b={I3} glow={glow} />
          <Lamp s={s} at={[X.lamp, Y]} glow={glow} />
          <Unpolarised s={s} at={[X.star, Y]} len={22} />
          <Filter s={s} at={[X.f1, Y]} r={R} deg={0} label="first" />
          <FieldArrow s={s} at={[X.e1, Y]} deg={0} len={LEN} />
          <Filter s={s} at={[X.fm, Y]} r={R} deg={deg} label="middle" />
          <FieldArrow s={s} at={[X.em, Y]} deg={deg} len={LEN * Math.sqrt(I2 / I1)} />
          <Filter s={s} at={[X.f3, Y]} r={R} deg={90} label="last" />
          <FieldArrow s={s} at={[X.e3, Y]} deg={90} len={LEN * Math.sqrt(I3 / I1)} />
          <Screen s={s} at={[X.screen, Y]} b={I3 * 4} glow={glow} />
          <AxisKnob s={s} at={[X.fm, Y]} r={R} deg={deg} label="Middle filter: turn it by its rim" onChange={setDeg} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Looking back down the beam · lines on a filter: its slots · orchid: the field after each filter, to scale
      </p>
    </SceneCard>
  );
}

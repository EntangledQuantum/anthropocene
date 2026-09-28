import { useState } from 'react';
import { CORK_DIPPERS, TANK } from '../../lib/physics/interference.ts';
import { C, SceneCard, Stage } from './scene.tsx';
import { Dipper, LambdaBar, RippleStage, WaterKey } from './ripple-kit-ch35.tsx';

/**
 * A ripple tank with two dippers on its left wall and one button. With one
 * dipper running, every patch of water rises and falls. Start the second and
 * the grey lines of still water appear, fanning out from between the dippers:
 * places where a crest from one always meets a trough from the other.
 *
 * Ungraded: this is the payoff of the opening bet, a picture to play with.
 */
export interface TwoDipperTankProps {
  prompt?: string;
}

export default function TwoDipperTank({ prompt }: TwoDipperTankProps) {
  const [both, setBoth] = useState(false);
  const [upper, lower] = CORK_DIPPERS;
  const spec = {
    sources: both ? CORK_DIPPERS : [{ ...lower }, { ...upper, amp: 0 }],
    lambda: TANK.lambda, freq: TANK.freq, water: [-0.8, 60] as const,
  };
  return (
    <SceneCard prompt={prompt}
      footer={<div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="anth-btn" onClick={() => setBoth((b) => !b)}
          style={{ padding: '9px 18px', fontSize: 15 }}>
          {both ? 'Stop the upper dipper' : 'Start the upper dipper'}
        </button>
        <span className="hud-label" style={{ marginLeft: 'auto' }}><WaterKey /></span>
      </div>}>
      <RippleStage spec={spec} stage={(capture) =>
        <Stage x={[-1.5, 30]} y={[-11, 11]} height={340} equal
          label={`Ripple tank seen from above, ${both ? 'both dippers' : 'one dipper'} running, wavelength ${TANK.lambda} cm.`}>
          {(s) => { capture(s); return <>
            <line x1={s.sx(-0.8)} x2={s.sx(-0.8)} y1={s.sy(-11)} y2={s.sy(11)} stroke={C.rule} strokeWidth={2} />
            <Dipper s={s} at={[upper.x, upper.y]} label={both ? 'upper dipper' : 'upper dipper, off'} faint={!both} />
            <Dipper s={s} at={[lower.x, lower.y]} label="lower dipper" />
            <LambdaBar s={s} at={[1, -9.6]} lambda={TANK.lambda} unit="cm" />
          </>; }}
        </Stage>} />
    </SceneCard>
  );
}

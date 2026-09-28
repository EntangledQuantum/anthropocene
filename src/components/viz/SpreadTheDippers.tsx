import { useRef, useState } from 'react';
import {
  SPREAD, TANK, bobAmplitude, pathDifference, singleHeight, stepsOutOfStep, type Source,
} from '../../lib/physics/interference.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { Dipper, LambdaBar, RippleStage, WaterKey, type RippleSpec } from './ripple-kit-ch35.tsx';

/**
 * One dipper is bolted to the wall; you slide the other along it. A leaf
 * floats out in the tank where it cannot be moved. As the dippers spread, the
 * quiet lines multiply and swing, and one of them can be brought onto the
 * leaf. The pattern is the thing you steer here, not the probe.
 *
 * Graded (`id`): leave the leaf bobbing less than a tenth of the most it can.
 * The one quiet setting in range is pinned in interference.test.ts.
 */
export interface SpreadTheDippersProps {
  id?: string;
  prompt?: string;
  explanation?: string;
}

const QUIET = 0.2;

export default function SpreadTheDippers({ id, prompt, explanation }: SpreadTheDippersProps) {
  const task = useTask(id, 'spread-the-dippers');
  const [b, setB] = useState(SPREAD.bStart);
  const bob = useRef<SVGCircleElement>(null);
  const A = SPREAD.a, leaf = SPREAD.leaf;
  const B: Source = { x: 0, y: b };
  const spec: RippleSpec = { sources: [A, B], lambda: TANK.lambda, freq: TANK.freq, water: [-0.8, 60] };
  const amp = bobAmplitude([A, B], leaf, TANK.lambda);
  const delta = pathDifference(A, B, leaf);
  const { waves, offHalf } = stepsOutOfStep(Math.abs(delta), TANK.lambda);
  const d = b - A.y;

  const onFrame = (t: number) => {
    const h = singleHeight(A, leaf, t, TANK.lambda, TANK.freq) + singleHeight(B, leaf, t, TANK.lambda, TANK.freq);
    if (bob.current) bob.current.setAttribute('r', String(8 + 3 * h));
  };

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'end' }}>
          <Meter label="Leaf bobs up and down by" value={`±${amp.toFixed(2)}`} unit="cm" color={C.position} />
          <Meter label="Dippers apart" value={d.toFixed(2)} unit="cm" />
          <span className="hud-label" style={{ marginLeft: 'auto' }}><WaterKey /></span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(amp <= QUIET, { b, amp })}
          miss={`The leaf still bobs ±${amp.toFixed(2)} cm. Its two ripples travel paths ${Math.abs(delta).toFixed(2)} cm different, ${waves.toFixed(2)} λ, which is ${offHalf.toFixed(2)} λ from a half.`}
          hit={<>{`At ${d.toFixed(2)} cm apart the leaf is ${Math.abs(delta).toFixed(2)} cm farther from one dipper: ${waves.toFixed(2)} λ. `}{explanation}</>} />}
      </div>}>
      <RippleStage spec={spec} onFrame={onFrame} stage={(capture) =>
        <Stage x={[-1.5, 30]} y={[-11, 11]} height={340} equal
          label={`Ripple tank from above. Dippers ${d.toFixed(2)} cm apart; the leaf bobs ±${amp.toFixed(2)} cm.`}>
          {(s) => { capture(s); return <>
            <line x1={s.sx(-0.8)} x2={s.sx(-0.8)} y1={s.sy(-11)} y2={s.sy(11)} stroke={C.rule} strokeWidth={2} />
            <line x1={s.sx(0)} x2={s.sx(0)} y1={s.sy(SPREAD.bRange[0])} y2={s.sy(SPREAD.bRange[1])}
              stroke={C.soft} strokeWidth={1.5} strokeDasharray="4 4" />
            <Dipper s={s} at={[A.x, A.y]} label="bolted" />
            <Handle s={s} at={[0, b]} color={C.ink} step={0.05} r={11} label="The sliding dipper: drag it along the wall"
              clamp={(q) => [0, Math.max(SPREAD.bRange[0], Math.min(SPREAD.bRange[1], q[1]))]}
              onChange={(q) => { setB(q[1]); task.touch(); }} />
            <circle cx={s.sx(leaf[0])} cy={s.sy(leaf[1])} r={13} fill={C.surface} stroke={C.position} strokeWidth={2.5} pointerEvents="none" />
            <circle ref={bob} cx={s.sx(leaf[0])} cy={s.sy(leaf[1])} r={8} fill={C.position} opacity={0.9} pointerEvents="none" />
            <text x={s.sx(leaf[0])} y={s.sy(leaf[1]) - 20} textAnchor="middle" fontSize={13} fill={C.position}
              stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">leaf</text>
            <LambdaBar s={s} at={[1, -9.6]} lambda={TANK.lambda} unit="cm" />
          </>; }}
        </Stage>} />
    </SceneCard>
  );
}

import { useRef, useState } from 'react';
import { CART_MASS, G, SIM_DT, ledger, startAt, stepCart, trackOf, withZeroShifted, type CartState } from '../../lib/physics/coaster-ch7.ts';
import { C, Handle, Meter, SceneCard, Stage, type StageApi } from './scene.tsx';
import { Cart, EnergyLine, HeightRuler, Rail, cartPose, fitHeight, useCartRefs, useFrames } from './coaster-kit.tsx';

/**
 * A cart swings in a valley. You drag the level where U = 0.
 *
 * The run is computed on `withZeroShifted(track, −m g z)`, the landscape with
 * the new floor, so this is not a relabelling trick: the physics really is
 * re-run with every U changed. The cart does not notice. The right-hand scale
 * in joules slides with the zero, the U and E readouts change, and the speed,
 * the push, the turning points and the timing do not.
 */
export interface SlideTheZeroProps {
  prompt?: string;
}

const X: [number, number] = [-0.8, 4.9];
const Y: [number, number] = [-0.35, 1.7];
const START_X = 0.45;
const MG = CART_MASS * G;

export default function SlideTheZero({ prompt }: SlideTheZeroProps) {
  const base = trackOf('zeroValley');
  const [zero, setZero] = useState(0);
  const zeroRef = useRef(0);
  const st = useRef<CartState>(startAt(base, START_X));
  const stage = useRef<StageApi | null>(null);
  const cart = useCartRefs();
  const lastShown = useRef(0);
  const [shown, setShown] = useState({ U: 0, K: 0, v: 0 });

  useFrames((dt, now) => {
    const s = stage.current;
    if (!s) return;
    const track = withZeroShifted(base, -MG * zeroRef.current);
    const n = Math.round(dt / SIM_DT);
    for (let k = 0; k < n; k++) st.current = stepCart(track, st.current, SIM_DT);
    cart.g.current?.setAttribute('transform', cartPose(s, base, st.current.s));
    if (now - lastShown.current > 120) {
      lastShown.current = now;
      const l = ledger(track, st.current);
      setShown({ U: l.U, K: l.K, v: Math.abs(st.current.v) });
    }
  });

  const shifted = withZeroShifted(base, -MG * zero);
  const E = shifted.land.U(base.sAt(START_X));
  const hE = base.h(START_X);
  const H = fitHeight(X, Y);
  const jTicks = [-30, -20, -10, 0, 10, 20, 30, 40];

  return (
    <SceneCard prompt={prompt}
      footer={<span style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <Meter label="Potential energy U" value={shown.U.toFixed(1)} unit="J" color={C.energy} />
        <Meter label="Kinetic energy K" value={shown.K.toFixed(1)} unit="J" color={C.energy} />
        <Meter label="Total E" value={E.toFixed(1)} unit="J" color={C.energy} />
        <Meter label="Speed" value={shown.v.toFixed(2)} unit="m/s" color={C.velocity} />
      </span>}>
      <Stage x={X} y={Y} height={H} equal label={`A cart swinging in a valley. U is zero at ${zero.toFixed(2)} metres.`}>
        {(s) => {
          stage.current = s;
          return <>
            <Rail s={s} track={base} floor={-0.3} />
            <HeightRuler s={s} ticks={[0, 0.5, 1, 1.5]} joules={{ mass: CART_MASS, g: G, zero, ticks: jTicks }} />
            <EnergyLine s={s} height={hE} label="E" from={0} to={4} />
            <line x1={s.sx(X[0]) + 40} x2={s.sx(X[1]) - 44} y1={s.sy(zero)} y2={s.sy(zero)} stroke={C.ink} strokeWidth={1.5} strokeDasharray="3 5" />
            <text x={s.sx(X[0] + 0.62) + 30} y={s.sy(zero) + 20} fontSize={13} fill={C.ink}
              stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">U = 0 here</text>
            <Cart refs={cart} pose={cartPose(s, base, st.current.s)} />
            <Handle s={s} at={[X[0] + 0.62, zero]} step={0.05} label="The level where U is zero: drag up or down"
              onChange={(p) => { const z = Math.min(1.5, Math.max(-0.3, p[1])); zeroRef.current = z; setZero(z); }} />
          </>;
        }}
      </Stage>
    </SceneCard>
  );
}

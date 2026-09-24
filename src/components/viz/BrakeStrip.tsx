import { useRef, useState } from 'react';
import { CART_MASS, G, SIM_DT, ledger, startAt, stepCart, trackOf, type Brake, type CartState } from '../../lib/physics/coaster-ch7.ts';
import { C, Meter, SceneCard, Stage, type StageApi } from './scene.tsx';
import { Cart, EnergyLine, HeightRuler, Rail, cartPose, fitHeight, useCartRefs, useFrames } from './coaster-kit.tsx';

/**
 * A valley with a brake strip on its flat floor. Every time the cart slides
 * over the strip, friction turns some of its mechanical energy into heat.
 *
 * The dashed line is the mechanical energy K + U, drawn as a height. It steps
 * down on each crossing; the strip warms by exactly what the line lost. Two
 * controls only: which strip, and let go. Ungraded: it is the payoff under a
 * <Predict> about what the strip length changes.
 *
 * Physics: `stepCart` with a `Brake` (exact work–energy bookkeeping on a flat
 * strip) from src/lib/physics/coaster-ch7.ts.
 */
export interface BrakeStripProps {
  prompt?: string;
  /** Coefficient of kinetic friction on the strip. */
  mu?: number;
}

const TRACK = 'brakeValley';
const START_X = 0.5;
const X: [number, number] = [-0.8, 6.7];
const Y: [number, number] = [-0.1, 1.45];
const LENGTHS = [0.5, 1.0];

export default function BrakeStrip({ prompt, mu = 0.3 }: BrakeStripProps) {
  const track = trackOf(TRACK);
  const [len, setLen] = useState(LENGTHS[0]);
  const brakeOf = (L: number): Brake => ({ from: track.sAt(3 - L / 2), to: track.sAt(3 + L / 2), force: mu * CART_MASS * G });
  const brake = useRef<Brake>(brakeOf(len));
  const st = useRef<CartState>(startAt(track, START_X));
  const go = useRef(false);
  const stage = useRef<StageApi | null>(null);
  const cart = useCartRefs();
  const line = useRef<SVGGElement>(null);
  const glow = useRef<SVGRectElement>(null);
  const lastShown = useRef(0);
  const E0 = ledger(track, startAt(track, START_X)).total;
  const floorU = CART_MASS * G * track.h(3);
  const [shown, setShown] = useState({ mech: E0, heat: 0, crossings: 0, on: false });

  useFrames((dt, now) => {
    const s = stage.current;
    if (!s) return;
    if (go.current) {
      const n = Math.round(dt / SIM_DT);
      for (let k = 0; k < n; k++) st.current = stepCart(track, st.current, SIM_DT, brake.current);
      if (st.current.v === 0 && st.current.t > 0.5) go.current = false;
    }
    const l = ledger(track, st.current);
    cart.g.current?.setAttribute('transform', cartPose(s, track, st.current.s));
    // The mechanical-energy line, as a height: U = m g h.
    line.current?.setAttribute('transform', `translate(0,${(s.sy(l.mech / (CART_MASS * G)) - s.sy(E0 / (CART_MASS * G))).toFixed(2)})`);
    glow.current?.setAttribute('opacity', (0.85 * l.heat / (E0 - floorU)).toFixed(3));
    if (now - lastShown.current > 120) {
      lastShown.current = now;
      setShown({ mech: l.mech, heat: l.heat, crossings: st.current.crossings, on: go.current });
    }
  });

  const reset = (L = len) => {
    brake.current = brakeOf(L);
    st.current = startAt(track, START_X);
    go.current = false;
  };

  const H = fitHeight(X, Y);
  return (
    <SceneCard prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn anth-btn-primary" disabled={shown.on}
            onClick={() => { reset(); go.current = true; }}>Let go</button>
          <span style={{ display: 'inline-flex', gap: 6 }} role="group" aria-label="Strip length">
            {LENGTHS.map((L) => <button key={L} type="button" className="anth-btn" aria-pressed={len === L}
              style={len === L ? { borderColor: C.ink, color: C.ink } : { color: C.faint }}
              onClick={() => { setLen(L); reset(L); }}>{L.toFixed(1)} m strip</button>)}
          </span>
        </div>
        <span style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Mechanical K + U" value={shown.mech.toFixed(2)} unit="J" color={C.energy} />
          <Meter label="Heat in the strip" value={shown.heat.toFixed(2)} unit="J" color={C.energy} />
          <Meter label="Sum" value={(shown.mech + shown.heat).toFixed(2)} unit="J" color={C.ink} />
          <Meter label="Crossings" value={String(shown.crossings)} />
        </span>
      </div>}>
      <Stage x={X} y={Y} height={H} equal label={`A valley with a ${len} metre brake strip on its floor`}>
        {(s) => {
          stage.current = s;
          const a = s.sx(3 - len / 2), b = s.sx(3 + len / 2), y = s.sy(track.h(3));
          return <>
            <Rail s={s} track={track} />
            <HeightRuler s={s} ticks={[0, 0.5, 1]} joules={{ mass: CART_MASS, g: G, ticks: [0, 5, 10, 15, 20] }} />
            <rect x={a} y={y - 3} width={b - a} height={9} fill={C.faint} rx={2} />
            <rect ref={glow} x={a - 2} y={y - 5} width={b - a + 4} height={13} fill={C.energy} rx={3} opacity={0} />
            <text x={(a + b) / 2} y={y + 24} textAnchor="middle" fontSize={12.5} fill={C.soft}>brake strip, μ = {mu}</text>
            <g ref={line}><EnergyLine s={s} height={E0 / (CART_MASS * G)} label="K + U" from={0} to={6} /></g>
            <Cart refs={cart} pose={cartPose(s, track, st.current.s)} />
          </>;
        }}
      </Stage>
    </SceneCard>
  );
}

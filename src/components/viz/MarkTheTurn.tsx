import { useRef, useState } from 'react';
import { CART_MASS, G, SIM_DT, ledger, startAt, stepCart, trackOf, turnAhead, type CartState } from '../../lib/physics/coaster-ch7.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';
import { Cart, EnergyLine, Flag, HeightRuler, Rail, cartPose, fitHeight, useCartRefs, useFrames } from './coaster-kit.tsx';

/**
 * A cart is already moving: 3 m/s, rolling down a steep wall into a valley
 * whose far side is a long gentle rise. Plant a flag where it will turn round.
 *
 * The energy line is hidden until you run it. The budget is on the screen, in
 * joules on both scales: the cart has U and K now, and it turns where U alone
 * equals the total. After the run the dashed line appears and meets the rail
 * at both turning points, which sit at one height and very different
 * distances. Physics: `turnAhead` (turning points of the energy line) and the
 * same Verlet run.
 */
export interface MarkTheTurnProps {
  id?: string;
  prompt?: string;
  explanation?: string;
  /** Height tolerance for the flag, metres. */
  tolerance?: number;
}

const TRACK = 'lopsided';
const X0 = 0.7;
const V0 = 3;
const X: [number, number] = [-0.8, 7.2];
const Y: [number, number] = [-0.1, 1.95];
const RANGE: [number, number] = [1.9, 6.3];

export default function MarkTheTurn({ id, prompt, explanation, tolerance = 0.06 }: MarkTheTurnProps) {
  const task = useTask(id, 'mark-the-turn');
  const track = trackOf(TRACK);
  const [flag, setFlag] = useState(3.0);
  const [ran, setRan] = useState(false);
  const [running, setRunning] = useState(false);
  const st = useRef<CartState>(startAt(track, X0, V0));
  const go = useRef(false);
  const pending = useRef<null | (() => void)>(null);
  const stage = useRef<StageApi | null>(null);
  const cart = useCartRefs();

  const start = ledger(track, startAt(track, X0, V0));
  const turn = turnAhead(track, X0, V0);
  const hFlag = track.h(flag);
  const good = Math.abs(hFlag - turn.height!) <= tolerance;

  useFrames((dt) => {
    const s = stage.current;
    if (!s) return;
    if (go.current) {
      const n = Math.round(dt / SIM_DT);
      for (let k = 0; k < n; k++) {
        const prev = st.current;
        st.current = stepCart(track, prev, SIM_DT);
        if (prev.v > 0 && st.current.v <= 0 && pending.current) { pending.current(); pending.current = null; }
      }
    }
    cart.g.current?.setAttribute('transform', cartPose(s, track, st.current.s));
  });

  const move = (nx: number) => {
    setFlag(Math.min(RANGE[1], Math.max(RANGE[0], nx)));
    st.current = startAt(track, X0, V0);
    go.current = false;
    pending.current = null;
    setRan(false);
    setRunning(false);
    task.touch();
  };

  const run = () => {
    st.current = startAt(track, X0, V0);
    go.current = true;
    setRunning(true);
    pending.current = () => { setRunning(false); setRan(true); task.check(good, { flagHeight: hFlag }); };
  };

  const Uflag = CART_MASS * G * hFlag;
  const H = fitHeight(X, Y);
  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Cart now: U" value={start.U.toFixed(1)} unit="J" color={C.energy} />
          <Meter label="Cart now: K" value={start.K.toFixed(1)} unit="J" color={C.energy} />
          <Meter label="Flag height" value={hFlag.toFixed(2)} unit="m" color={C.position} />
          <Meter label="U at the flag" value={Uflag.toFixed(1)} unit="J" color={C.energy} />
        </div>
        {id ? <CheckBar verdict={task.verdict} done={task.done} label="Run it" disabled={running} onCheck={run}
          miss={`It turned at ${turn.height!.toFixed(2)} m, where U is ${(CART_MASS * G * turn.height!).toFixed(1)} J. Your flag is at ${hFlag.toFixed(2)} m (${Uflag.toFixed(1)} J).`}
          hit={explanation} />
          : <button type="button" className="anth-btn anth-btn-primary" onClick={run}>Run it</button>}
      </div>}>
      <Stage x={X} y={Y} height={H} equal label={`A valley with a steep left wall and a long right rise. The flag is ${hFlag.toFixed(2)} metres up.`}>
        {(s) => {
          stage.current = s;
          return <>
            <Rail s={s} track={track} />
            <HeightRuler s={s} ticks={[0, 0.5, 1, 1.5]} joules={{ mass: CART_MASS, g: G, ticks: [0, 10, 20, 30] }} />
            {ran && <EnergyLine s={s} height={turn.height!} label={`E = ${turn.E.toFixed(1)} J`} from={0} to={6.4} />}
            {!running && !ran && (() => {
              const a = track.angleAt(track.sAt(X0));
              const p: [number, number] = [X0 + 0.28 * Math.cos(a), track.h(X0) + 0.28 * Math.sin(a) + 0.12];
              return <Arrow s={s} from={[X0, track.h(X0) + 0.12]} to={[p[0] + Math.cos(a) * 0.35, p[1] + Math.sin(a) * 0.35]}
                color={C.velocity} label={`${V0} m/s`} />;
            })()}
            <Flag s={s} track={track} x={flag} />
            <Cart refs={cart} pose={cartPose(s, track, st.current.s)} />
            <Handle s={s} at={[flag, track.h(flag) + 0.5]} step={0.02} label="Flag: drag along the right-hand rise"
              onChange={(p) => move(p[0])} color={C.position} />
          </>;
        }}
      </Stage>
    </SceneCard>
  );
}

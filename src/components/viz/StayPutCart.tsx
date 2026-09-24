import { useMemo, useRef, useState } from 'react';
import { SIM_DT, driftFromRest, pushAt, startAt, stepCart, trackOf, type CartState } from '../../lib/physics/coaster-ch7.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';
import { Cart, HeightRuler, Rail, cartPose, fitHeight, setPush, useCartRefs, useFrames } from './coaster-kit.tsx';

/**
 * Place the cart where it will stay when you let go.
 *
 * The track has one exactly flat stretch, and it is high up. Its lowest point,
 * at the right-hand end, still tilts, so a cart left there rolls. The push
 * arrow stays hidden until you let go: the decision is read from the shape of
 * the rail, not from a readout.
 *
 * Graded on a measured run: the cart "stays" if it moves less than a
 * centimetre in three seconds (`driftFromRest`), the same run you then watch.
 */
export interface StayPutCartProps {
  id?: string;
  prompt?: string;
  explanation?: string;
}

const TRACK = 'stayPut';
const X: [number, number] = [-0.75, 6.25];
const Y: [number, number] = [-0.1, 2.4];
const RANGE: [number, number] = [0.1, 5.6];
const PX_PER_N = 3;

export default function StayPutCart({ id, prompt, explanation }: StayPutCartProps) {
  const task = useTask(id, 'stay-put-cart');
  const track = trackOf(TRACK);
  const [x, setX] = useState(5.2);
  const [live, setLive] = useState(false);
  const st = useRef<CartState>(startAt(track, 5.2));
  const running = useRef(false);
  const stage = useRef<StageApi | null>(null);
  const cart = useCartRefs();

  useFrames((dt) => {
    const s = stage.current;
    if (!s) return;
    if (running.current) {
      const n = Math.round(dt / SIM_DT);
      for (let k = 0; k < n; k++) st.current = stepCart(track, st.current, SIM_DT);
      if (st.current.t > 6) running.current = false;
    }
    cart.g.current?.setAttribute('transform', cartPose(s, track, st.current.s));
    setPush(cart, live ? pushAt(track, st.current.s) * PX_PER_N : 0);
  });

  const place = (nx: number) => {
    const cx = Math.min(RANGE[1], Math.max(RANGE[0], nx));
    setX(cx);
    st.current = startAt(track, cx);
    running.current = false;
    setLive(false);
    task.touch();
  };

  const s0 = track.sAt(x);
  const F = pushAt(track, s0);
  const deg = Math.abs((track.angleAt(s0) * 180) / Math.PI);
  const drift = useMemo(() => driftFromRest(track, x), [track, x]);
  const stays = drift < 0.01;

  const letGo = () => {
    st.current = startAt(track, x);
    running.current = true;
    setLive(true);
    task.check(stays, { x, drift });
  };

  const H = fitHeight(X, Y);
  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
          <Meter label="Height" value={track.h(x).toFixed(2)} unit="m" color={C.position} />
          {live && <Meter label="Push along the rail" value={Math.abs(F).toFixed(2)} unit="N" color={C.force} />}
        </div>
        {id ? <CheckBar verdict={task.verdict} done={task.done} label="Let go" onCheck={letGo}
          miss={`Here the rail still tilts ${deg.toFixed(1)}°, a ${Math.abs(F).toFixed(1)} N push along it, so the cart rolls.`}
          hit={explanation} />
          : <button type="button" className="anth-btn anth-btn-primary" onClick={letGo}>Let go</button>}
      </div>}>
      <Stage x={X} y={Y} height={H} equal label={`A coaster track. The cart is ${track.h(x).toFixed(2)} metres up.`}>
        {(s) => {
          stage.current = s;
          return <>
            <Rail s={s} track={track} />
            <HeightRuler s={s} ticks={[0, 0.5, 1, 1.5, 2]} />
            <Cart refs={cart} pose={cartPose(s, track, st.current.s)} />
            <Handle s={s} at={[x, track.h(x) + 0.5]} step={0.05} label="Cart position: drag along the track"
              onChange={(p) => place(p[0])} color={C.position} />
          </>;
        }}
      </Stage>
    </SceneCard>
  );
}

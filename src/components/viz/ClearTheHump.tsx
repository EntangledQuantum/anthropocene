import { useMemo, useRef, useState } from 'react';
import { SIM_DT, clearsAt, startAt, stepCart, trackOf, type CartState } from '../../lib/physics/coaster-ch7.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';
import { Cart, EnergyLine, Flag, HeightRuler, Rail, cartPose, fitHeight, useCartRefs, useFrames } from './coaster-kit.tsx';

/**
 * Choose where on the left-hand hill to let the cart go, so that it just gets
 * over the 1.2 m hump on the far side of a deep valley.
 *
 * The verdict waits for the run: it lands when the cart crosses the top or
 * turns back. Both come from `clearsAt`, which reads the turning points off
 * the energy line, and the animation is the same Verlet run. Once solved, the
 * dashed energy line appears at the start height: the picture the next step
 * names.
 */
export interface ClearTheHumpProps {
  id?: string;
  prompt?: string;
  explanation?: string;
  /** Most height to spare that still counts as "just", metres. */
  spare?: number;
}

const TRACK = 'hump';
const TOP_X = 3.8;
const X: [number, number] = [-0.75, 7.45];
const Y: [number, number] = [-0.1, 2.65];
const RANGE: [number, number] = [0.05, 2.0];

export default function ClearTheHump({ id, prompt, explanation, spare = 0.2 }: ClearTheHumpProps) {
  const task = useTask(id, 'clear-the-hump');
  const track = trackOf(TRACK);
  const topH = track.h(TOP_X);
  const [x, setX] = useState(0.35);
  const [running, setRunning] = useState(false);
  const st = useRef<CartState>(startAt(track, 0.35));
  const go = useRef(false);
  const pending = useRef<null | (() => void)>(null);
  const stage = useRef<StageApi | null>(null);
  const cart = useCartRefs();

  const out = useMemo(() => clearsAt(track, x, TOP_X), [track, x]);
  const extra = out.startHeight - topH;
  const good = out.cleared && extra <= spare;

  useFrames((dt) => {
    const s = stage.current;
    if (!s) return;
    if (go.current) {
      const n = Math.round(dt / SIM_DT);
      const sTop = track.sAt(TOP_X);
      for (let k = 0; k < n; k++) {
        const prev = st.current;
        st.current = stepCart(track, prev, SIM_DT);
        const crossed = prev.s < sTop && st.current.s >= sTop;
        const turned = prev.v > 0 && st.current.v <= 0;
        if ((crossed || turned) && pending.current) { pending.current(); pending.current = null; }
      }
    }
    cart.g.current?.setAttribute('transform', cartPose(s, track, st.current.s));
  });

  const place = (nx: number) => {
    const cx = Math.min(RANGE[1], Math.max(RANGE[0], nx));
    setX(cx);
    st.current = startAt(track, cx);
    go.current = false;
    pending.current = null;
    setRunning(false);
    task.touch();
  };

  const letGo = () => {
    st.current = startAt(track, x);
    go.current = true;
    setRunning(true);
    pending.current = () => { setRunning(false); task.check(good, { startHeight: out.startHeight }); };
  };

  const miss = !out.cleared
    ? `It turned back at ${out.turnHeight!.toFixed(2)} m, ${(topH - out.turnHeight!).toFixed(2)} m below the top of the hump.`
    : `It cleared the top with ${extra.toFixed(2)} m of height to spare.`;

  const H = fitHeight(X, Y);
  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <Meter label="Start height" value={out.startHeight.toFixed(2)} unit="m" color={C.position} />
        {id ? <CheckBar verdict={task.verdict} done={task.done} label="Let go" disabled={running} onCheck={letGo} miss={miss} hit={explanation} />
          : <button type="button" className="anth-btn anth-btn-primary" onClick={letGo}>Let go</button>}
      </div>}>
      <Stage x={X} y={Y} height={H} equal label={`A coaster track with a ${topH.toFixed(1)} metre hump. Start height ${out.startHeight.toFixed(2)} metres.`}>
        {(s) => {
          stage.current = s;
          return <>
            <Rail s={s} track={track} />
            <HeightRuler s={s} ticks={[0, 0.5, 1, 1.5, 2, 2.5]} />
            <line x1={s.sx(TOP_X) - 30} x2={s.sx(TOP_X) + 30} y1={s.sy(topH)} y2={s.sy(topH)} stroke={C.faint} strokeWidth={1.2} />
            <text x={s.sx(TOP_X)} y={s.sy(topH) - 10} textAnchor="middle" fontSize={12.5} fill={C.soft}>top {topH.toFixed(2)} m</text>
            <Flag s={s} track={track} x={6.7} label="finish" color={C.soft} />
            {task.done && <EnergyLine s={s} height={out.startHeight} label="E: the start height" from={0} to={7.2} />}
            <Cart refs={cart} pose={cartPose(s, track, st.current.s)} />
            <Handle s={s} at={[x, track.h(x) + 0.5]} step={0.01} label="Start position on the left hill: drag along the track"
              onChange={(p) => place(p[0])} color={C.position} />
          </>;
        }}
      </Stage>
    </SceneCard>
  );
}

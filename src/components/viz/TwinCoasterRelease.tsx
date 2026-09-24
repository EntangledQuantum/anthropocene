import { useRef, useState } from 'react';
import { SIM_DT, pushAt, startAt, stepCart, trackOf, type CartState } from '../../lib/physics/coaster-ch7.ts';
import { C, Meter, SceneCard, Stage, type StageApi } from './scene.tsx';
import { Cart, HeightRuler, Rail, cartPose, fitHeight, setPush, useCartRefs, useFrames } from './coaster-kit.tsx';

/**
 * Two carts on two lanes, one button: let both go at the same instant.
 *
 * Each lane is its own rail, so the comparison is clean: same moment, same
 * gravity, different place. The amber arrow on each cart is its push along
 * the rail (−dU/ds), and the strip underneath traces both speeds against
 * time, so "who picks up speed faster" and "who arrives faster" can both be
 * read off one run. Ungraded: it is the payoff under a <Predict>.
 */
export interface TwinCoasterReleaseProps {
  prompt?: string;
  /** Exactly two lanes. */
  lanes: { track: string; startX: number; label: string }[];
  /** Horizontal position of the finish line on every lane, m. */
  finishX: number;
}

const X: [number, number] = [-0.7, 5.5];
const Y: [number, number] = [-0.12, 1.8];
const SPAN_T = 4;
const VMAX = 6;
const PX_PER_N = 3;

export default function TwinCoasterRelease({ prompt, lanes, finishX }: TwinCoasterReleaseProps) {
  const tracks = lanes.map((l) => trackOf(l.track));
  const fresh = () => lanes.map((l, i) => startAt(tracks[i], l.startX));
  const st = useRef<CartState[]>(fresh());
  const done = useRef<({ t: number; v: number } | null)[]>(lanes.map(() => null));
  const running = useRef(false);
  const trace = useRef<[number, number][][]>(lanes.map(() => [[0, 0]]));
  const stage = useRef<StageApi | null>(null);
  const carts = [useCartRefs(), useCartRefs()];
  const lines = [useRef<SVGPolylineElement>(null), useRef<SVGPolylineElement>(null)];
  const [shown, setShown] = useState({ v: lanes.map(() => 0), done: lanes.map(() => null as null | { t: number; v: number }), on: false });
  const lastShown = useRef(0);

  const tx = (t: number) => 46 + (t / SPAN_T) * (640 - 58);
  const ty = (v: number) => 118 - (v / VMAX) * 100;

  const paint = () => {
    const s = stage.current;
    if (!s) return;
    lanes.forEach((_, i) => {
      const g = carts[i].g.current;
      if (g) g.setAttribute('transform', cartPose(s, tracks[i], st.current[i].s));
      setPush(carts[i], running.current && !done.current[i] ? pushAt(tracks[i], st.current[i].s) * PX_PER_N : 0);
      lines[i].current?.setAttribute('points', trace.current[i].map(([t, v]) => `${tx(t).toFixed(1)},${ty(v).toFixed(1)}`).join(' '));
    });
  };

  useFrames((dt, now) => {
    if (running.current) {
      const n = Math.round(dt / SIM_DT);
      lanes.forEach((_, i) => {
        if (done.current[i]) return;
        const sF = tracks[i].sAt(finishX);
        for (let k = 0; k < n; k++) {
          st.current[i] = stepCart(tracks[i], st.current[i], SIM_DT);
          if (st.current[i].s >= sF) { done.current[i] = { t: st.current[i].t, v: st.current[i].v }; break; }
        }
        const c = st.current[i];
        if (c.t <= SPAN_T) trace.current[i].push([c.t, Math.abs(c.v)]);
      });
      if (done.current.every(Boolean) || st.current.every((c) => c.t > 12)) running.current = false;
    }
    paint();
    if (now - lastShown.current > 120) {
      lastShown.current = now;
      setShown({ v: st.current.map((c) => Math.abs(c.v)), done: [...done.current], on: running.current });
    }
  });

  const reset = () => {
    st.current = fresh();
    done.current = lanes.map(() => null);
    trace.current = lanes.map(() => [[0, 0]]);
    running.current = false;
    paint();
  };

  const H = fitHeight(X, Y);
  return (
    <SceneCard prompt={prompt}
      footer={<div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="anth-btn anth-btn-primary" disabled={shown.on}
          onClick={() => { reset(); running.current = true; }}>Let go</button>
        <button type="button" className="anth-btn" onClick={reset}>Start over</button>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          {lanes.map((l, i) => <Meter key={l.label} label={shown.done[i] ? `${l.label} arrived at ${shown.done[i]!.t.toFixed(2)} s` : `${l.label} speed`}
            value={(shown.done[i]?.v ?? shown.v[i]).toFixed(2)} unit="m/s" color={C.velocity} />)}
        </span>
      </div>}>
      {lanes.map((l, i) => (
        <div key={l.label} style={{ position: 'relative' }}>
          <Stage x={X} y={Y} height={H} equal label={`Lane ${l.label}: a cart on a coaster track`}>
            {(s) => {
              stage.current = s;
              const tr = tracks[i];
              return <>
                <Rail s={s} track={tr} />
                <HeightRuler s={s} ticks={[0, 0.5, 1, 1.5]} />
                <line x1={s.sx(finishX)} x2={s.sx(finishX)} y1={s.sy(tr.h(finishX))} y2={s.sy(tr.h(finishX)) - 44}
                  stroke={C.faint} strokeWidth={1.5} strokeDasharray="4 4" />
                <text x={s.sx(finishX)} y={s.sy(tr.h(finishX)) - 50} textAnchor="middle" fontSize={12} fill={C.faint}>finish</text>
                <text x={s.sx(X[0]) + 50} y={24} fontSize={15} fontWeight={600} fill={C.ink}>{l.label}</text>
                <Cart refs={carts[i]} pose={cartPose(s, tr, st.current[i].s)} />
              </>;
            }}
          </Stage>
        </div>
      ))}
      <svg viewBox="0 0 640 146" style={{ width: '100%', display: 'block', marginTop: 6 }} role="img"
        aria-label="Speed of each cart against time">
        {[0, 2, 4, 6].map((v) => <g key={v}>
          <line x1={46} x2={628} y1={ty(v)} y2={ty(v)} stroke={C.grid} />
          <text x={40} y={ty(v) + 4} textAnchor="end" fontSize={11.5} fill={C.faint} fontFamily="var(--font-mono)">{v}</text>
        </g>)}
        {[0, 1, 2, 3, 4].map((t) => <text key={t} x={tx(t)} y={136} textAnchor="middle" fontSize={11.5} fill={C.faint} fontFamily="var(--font-mono)">{t}</text>)}
        <text x={50} y={12} fontSize={12.5} fill={C.faint}>speed (m/s)</text>
        <text x={628} y={112} textAnchor="end" fontSize={12.5} fill={C.faint}>time (s)</text>
        {lanes.map((l, i) => <polyline key={l.label} ref={lines[i]} points="" fill="none" stroke={C.velocity}
          strokeWidth={2.5} strokeDasharray={i === 1 ? '7 5' : undefined} />)}
        {lanes.map((l, i) => <g key={`k${l.label}`}>
          <line x1={420 + i * 110} x2={446 + i * 110} y1={12 - 4} y2={12 - 4} stroke={C.velocity} strokeWidth={2.5} strokeDasharray={i === 1 ? '7 5' : undefined} />
          <text x={452 + i * 110} y={12} fontSize={12.5} fill={C.soft}>{l.label}</text>
        </g>)}
      </svg>
    </SceneCard>
  );
}

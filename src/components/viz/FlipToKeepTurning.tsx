import { useEffect, useRef, useState } from 'react';
import { loopSides, loopTorque, motorStep, type MotorParams, type MotorState } from '../../lib/physics/magnetism.ts';
import { C, CheckBar, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';
import { LoopArrow, PolesAndField, WireEnd, placeArrow } from './magnet-kit-ch27.tsx';
import { COIL } from './TurnTheCoil.tsx';

/**
 * The same coil, now free on its axle and let go from edge-on. With the
 * current fixed it swings toward upright, overshoots, and rocks back: a
 * compass needle, not a motor. One control, a button that reverses the
 * current. Reverse it each time the coil passes upright and the forces flip
 * with it, so every half turn is driven forward. That is a commutator.
 * Reverse it at the wrong moment and the torque brakes the coil.
 *
 * Graded (`id`): make three full turns. Motion: `motorStep` (magnetism.ts),
 * whose tests show a fixed current only rocks and perfect reversal spins.
 */
export interface FlipToKeepTurningProps {
  id?: string;
  prompt?: string;
  /** Full turns needed. */
  turns?: number;
  explanation?: string;
}

const P: MotorParams = { N: COIL.N, I: COIL.I, A: COIL.w * COIL.len, B: COIL.B, inertia: 2.4e-3, damping: 4e-3 };
const DT = 1 / 600;
const SLOW = 0.6; // the coil runs at 0.6× real time
const HALF = 2.6;
const PER_N = 2.4;
const TH0 = -Math.PI / 2;

export default function FlipToKeepTurning({ id, prompt, turns = 3, explanation }: FlipToKeepTurningProps) {
  const task = useTask(id, 'flip-to-keep-turning');
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  const state = useRef<MotorState>({ theta: TH0, omega: 0, t: 0 });
  const sign = useRef<1 | -1>(1);
  const best = useRef(0);
  const flips = useRef(0);
  const [shown, setShown] = useState({ theta: TH0, omega: 0, sign: 1 as 1 | -1, turns: 0, flips: 0 });
  const api = useRef<StageApi | null>(null);

  const reset = () => {
    state.current = { theta: TH0, omega: 0, t: 0 };
    sign.current = 1; best.current = 0; flips.current = 0;
    setShown({ theta: TH0, omega: 0, sign: 1, turns: 0, flips: 0 });
    task.touch();
  };
  const flip = () => {
    sign.current = sign.current === 1 ? -1 : 1; flips.current += 1; task.touch();
    setShown((v) => ({ ...v, sign: sign.current, flips: flips.current }));
  };

  // the coil is moved through refs; React only hears about it at ~8 Hz
  const bar = useRef<SVGLineElement>(null);
  const muLine = useRef<SVGLineElement>(null);
  const muText = useRef<SVGTextElement>(null);
  const endG = [useRef<SVGGElement>(null), useRef<SVGGElement>(null)];
  const actG = [useRef<SVGLineElement>(null), useRef<SVGLineElement>(null)];
  const fG = [useRef<SVGGElement>(null), useRef<SVGGElement>(null)];
  const draw = (theta: number) => {
    const st = api.current;
    if (!st || !bar.current) return;
    const sg = sign.current;
    const sides = loopSides(COIL.N, COIL.I * sg, COIL.w, COIL.len, COIL.B, theta).sides;
    const u = [-Math.sin(theta), Math.cos(theta)];
    const ends = [[u[0] * HALF, u[1] * HALF], [-u[0] * HALF, -u[1] * HALF]];
    bar.current.setAttribute('x1', `${st.sx(ends[0][0])}`); bar.current.setAttribute('y1', `${st.sy(ends[0][1])}`);
    bar.current.setAttribute('x2', `${st.sx(ends[1][0])}`); bar.current.setAttribute('y2', `${st.sy(ends[1][1])}`);
    const mu = [Math.cos(theta) * sg * HALF, Math.sin(theta) * sg * HALF];
    muLine.current?.setAttribute('x2', `${st.sx(mu[0] * 0.95)}`); muLine.current?.setAttribute('y2', `${st.sy(mu[1] * 0.95)}`);
    muText.current?.setAttribute('x', `${st.sx(mu[0] * 1.15)}`); muText.current?.setAttribute('y', `${st.sy(mu[1] * 1.15) + 5}`);
    ends.forEach(([ex, ey], k) => {
      endG[k].current?.setAttribute('transform', `translate(${st.sx(ex)},${st.sy(ey)})`);
      actG[k].current?.setAttribute('x1', `${st.sx(ex)}`); actG[k].current?.setAttribute('x2', `${st.sx(ex)}`);
      const F = sides[k].F;
      const off = 0.42 * Math.sign(F[1] || 1);
      placeArrow(fG[k].current, st.sx(ex), st.sy(ey + off), st.sx(ex + F[0] * PER_N), st.sy(ey + F[1] * PER_N));
    });
  };

  useEffect(() => { draw(state.current.theta); });

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05) * SLOW;
      last = now;
      const n = Math.round(dt / DT);
      let s = state.current;
      for (let k = 0; k < n; k++) s = motorStep(s, P, sign.current, DT);
      state.current = s;
      best.current = Math.max(best.current, Math.abs(s.theta - TH0) / (2 * Math.PI));
      draw(s.theta);
      if (now - lastShown > 120) {
        lastShown = now;
        setShown({ theta: s.theta, omega: s.omega, sign: sign.current, turns: best.current, flips: flips.current });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tau = -shown.sign * loopTorque(P.N, P.I, P.A, P.B, shown.theta);
  const whole = Math.floor(shown.turns + 1e-9);
  const rocking = Math.abs(shown.omega) < 2;
  const drive = Math.abs(tau) < 1e-3 ? 'none' : tau * shown.omega >= 0 ? 'driving it on' : 'braking it';
  const miss = `The coil has made ${whole} of ${turns} full turns${rocking ? ' and is rocking about upright, where the torque vanishes' : ''}.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" style={{ padding: '10px 20px', fontSize: 15 }} onClick={flip}>Reverse the current</button>
          <button type="button" className="anth-btn" onClick={reset}>Start over</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Full turns" value={`${whole}`} />
            <Meter label="Torque" value={Math.abs(tau).toFixed(3)} unit={`N·m, ${drive}`} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={live && task.done}
          onCheck={() => task.check(shown.turns >= turns, { turns: shown.turns, flips: shown.flips })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-7.5, 7.5]} y={[-4.6, 4.6]} height={360} equal
        label={`Coil on an axle between magnet poles. ${whole} full turns so far.`}>
        {(s) => {
          api.current = s;
          return <>
            <PolesAndField s={s} x={[-7.9, 7.9]} y={[-4.4, 4.4]} label="B, 0.50 T" />
            <line x1={s.sx(0)} x2={s.sx(0)} y1={s.sy(3.9)} y2={s.sy(-3.9)} stroke={C.ok} strokeOpacity={0.5} strokeDasharray="2 6" />
            <text x={s.sx(0.2)} y={s.sy(3.7)} fontSize={12} fill={C.ok} fillOpacity={0.85}>upright</text>
            {[0, 1].map((k) => <line key={`a${k}`} ref={actG[k]} y1={s.sy(-HALF * 1.6)} y2={s.sy(HALF * 1.6)}
              stroke={C.force} strokeOpacity={0.3} strokeDasharray="4 5" />)}
            <line ref={bar} stroke={C.soft} strokeWidth={7} strokeLinecap="round" />
            <line ref={muLine} x1={s.sx(0)} y1={s.sy(0)} stroke={C.ink} strokeWidth={2} strokeDasharray="5 4" />
            <text ref={muText} textAnchor="middle" fontSize={15} fontWeight={600} fill={C.ink}
              stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">μ</text>
            <circle cx={s.sx(0)} cy={s.sy(0)} r={5} fill={C.surface} stroke={C.ink} strokeWidth={2} />
            <LoopArrow ref={fG[0]} color={C.force} width={3.5} />
            <LoopArrow ref={fG[1]} color={C.force} width={3.5} />
            {[0, 1].map((k) => <g key={`e${k}`} ref={endG[k]}><WireEnd cx={0} cy={0} out={(k === 0) === (shown.sign === 1)} r={11} /></g>)}
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        The coil from before, free on its axle and let go · ⊙ current toward you, ⊗ away · amber: force on each side · shown at 0.6× speed
      </p>
    </SceneCard>
  );
}

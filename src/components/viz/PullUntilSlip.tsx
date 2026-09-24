import { useEffect, useRef, useState } from 'react';
import { level, readBlock, slideStep, type SlideState } from '../../lib/physics/friction.ts';
import { Arrow, Body, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';

/**
 * A crate on a floor and one control: the tip of your pull.
 *
 * Friction answers back. Below the grip limit the amber friction arrow is
 * exactly as long as your white pull, whatever you choose; at the limit the
 * crate breaks free and friction drops to a smaller, fixed value. The strip
 * underneath is the same run as a graph of friction against pull: a 45° line,
 * a cliff, a floor.
 *
 * With `id`, the scene grades itself: pull as hard as you can without the
 * crate moving. Physics: `readBlock` / `slideStep` from friction.ts.
 */
export interface PullUntilSlipProps {
  id?: string;
  prompt?: string;
  mass?: number;
  muS?: number;
  muK?: number;
  /** Starting pull, newtons. */
  start?: number;
  /** How far below the grip limit still counts, newtons. */
  tolerance?: number;
  explanation?: string;
}

const DT = 1 / 240;
const MAX = 30; // N
const K = 0.087; // metres of arrow per newton
const HATCH = 0.4;

export default function PullUntilSlip({
  id, prompt, mass = 4, muS = 0.5, muK = 0.35, start = 5, tolerance = 1.5, explanation,
}: PullUntilSlipProps) {
  const task = useTask(id, 'pull-until-slip');
  const surf = level(muS, muK);
  const st = useRef<SlideState>({ s: 0, v: 0 });
  const pullRef = useRef(start);
  const hatch = useRef<SVGGElement>(null);
  const trail = useRef<Vec[]>([]);
  const [pull, setPullState] = useState(start);
  const [shown, setShown] = useState({ v: 0, broke: null as number | null });
  const brokeRef = useRef<number | null>(null);
  const pxPerM = useRef(1);

  const r = readBlock(mass, surf, pull, st.current.v);

  const record = (p: number) => {
    const f = Math.abs(readBlock(mass, surf, p, st.current.v).friction);
    const last = trail.current[trail.current.length - 1];
    if (!last || Math.abs(last[0] - p) > 0.05 || Math.abs(last[1] - f) > 0.05) trail.current.push([p, f]);
    if (trail.current.length > 800) trail.current.shift();
  };

  const setPull = (p: number) => {
    pullRef.current = p;
    setPullState(p);
    record(p);
    task.touch();
  };

  const reset = () => {
    st.current = { s: 0, v: 0 };
    brokeRef.current = null;
    trail.current = [];
    pullRef.current = start;
    setPullState(start);
    record(start);
    setShown({ v: 0, broke: null });
  };

  useEffect(reset, [mass, muS, muK, start]);

  // The loop lives in refs; React hears about it at ~8 Hz.
  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const s = st.current;
      for (let k = 0; k < Math.round(dt / DT); k++) {
        const wasStill = s.v === 0;
        slideStep(s, mass, surf, pullRef.current, DT);
        // Record what friction could give when it gave out: the grip limit.
        if (wasStill && s.v !== 0 && brokeRef.current === null) brokeRef.current = readBlock(mass, surf, pullRef.current, 0).ceiling;
      }
      const off = ((s.s % HATCH) + HATCH) % HATCH;
      hatch.current?.setAttribute('transform', `translate(${-off * pxPerM.current},0)`);
      if (now - lastShown > 120) {
        lastShown = now;
        record(pullRef.current);
        setShown({ v: s.v, broke: brokeRef.current });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [mass, muS, muK]);

  const moving = shown.v !== 0 || !r.stuck;
  const hitNow = r.stuck && shown.v === 0 && pull >= r.ceiling - tolerance;
  const miss = moving
    ? `Friction gave out at ${(shown.broke ?? r.ceiling).toFixed(1)} N and the crate is sliding at ${Math.abs(shown.v).toFixed(1)} m/s. Start over and stop short of that.`
    : `Friction is matching your ${pull.toFixed(1)} N and has not run out. The floor has more to give.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
          <Meter label="Your pull" value={pull.toFixed(1)} unit="N" />
          <Meter label="Friction" value={Math.abs(r.friction).toFixed(1)} unit="N" color={C.force} />
          <Meter label="Speed" value={Math.abs(shown.v).toFixed(2)} unit="m/s" color={C.velocity} />
          <button type="button" className="anth-btn" style={{ marginLeft: 'auto' }} onClick={() => { reset(); task.touch(); }}>Start over</button>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hitNow, { pull, stuck: r.stuck })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-3.4, 3.4]} y={[-0.32, 1.48]} height={190} ground equal
        label={`Crate of ${mass} kilograms. Your pull ${pull.toFixed(1)} newtons, friction ${Math.abs(r.friction).toFixed(1)} newtons, ${moving ? 'sliding' : 'not moving'}.`}>
        {(s) => {
          pxPerM.current = s.len(1);
          return <>
            <g ref={hatch}>
              {Array.from({ length: 22 }, (_, i) => -4.2 + i * HATCH).map((x) => (
                <line key={x} x1={s.sx(x)} y1={s.sy(-0.03)} x2={s.sx(x - 0.12)} y2={s.sy(-0.22)} stroke={C.grid} strokeWidth={1.5} />
              ))}
            </g>
            <Body s={s} at={[0, 0.45]} w={0.9} h={0.9} label={`${mass} kg`} />
            {shown.broke !== null && <g>
              <line x1={s.sx(-0.45 - shown.broke * K)} x2={s.sx(-0.45 - shown.broke * K)} y1={s.sy(0.02)} y2={s.sy(0.42)} stroke={C.faint} strokeDasharray="4 3" strokeWidth={1.5} />
              <text x={s.sx(-0.45 - shown.broke * K)} y={s.sy(0.5)} textAnchor="middle" fontSize={12} fill={C.faint}>gave out at {shown.broke.toFixed(1)} N</text>
            </g>}
            <Arrow s={s} from={[-0.45, 0.1]} to={[-0.45 + r.friction * K, 0.1]} color={C.force} />
            <text x={s.sx(-0.45)} y={s.sy(0.24)} textAnchor="end" fontSize={14} fontWeight={600} fill={C.force}>friction {Math.abs(r.friction).toFixed(1)} N</text>
            <Arrow s={s} from={[0.45, 0.45]} to={[0.45 + pull * K, 0.45]} color={C.ink} />
            <text x={s.sx(0.55)} y={s.sy(0.62)} fontSize={14} fontWeight={600} fill={C.ink}>your pull {pull.toFixed(1)} N</text>
            {shown.v !== 0 && <Arrow s={s} from={[-0.3, 1.25]} to={[-0.3 + Math.min(shown.v, 8) * 0.3, 1.25]} color={C.velocity} label={`v = ${shown.v.toFixed(1)} m/s`} />}
            <Handle s={s} at={[0.45 + pull * K, 0.45]} step={0.03} label="Your pull: drag its tip"
              clamp={(p) => [Math.min(0.45 + MAX * K, Math.max(0.45, p[0])), 0.45]}
              onChange={(p) => setPull(Math.round(((p[0] - 0.45) / K) * 10) / 10)} />
          </>;
        }}
      </Stage>
      <Stage x={[0, MAX]} y={[0, 30]} height={170} axes={{ x: 'your pull (N)', y: 'friction (N)', yTicks: [0, 10, 20, 30] }}
        label="Friction against your pull, for this run">
        {(s) => <>
          <polyline fill="none" stroke={C.force} strokeWidth={2.5} strokeLinejoin="round"
            points={trail.current.map(([x, y]) => `${s.sx(x)},${s.sy(y)}`).join(' ')} />
          <circle cx={s.sx(pull)} cy={s.sy(Math.abs(r.friction))} r={5} fill={C.force} />
        </>}
      </Stage>
    </SceneCard>
  );
}

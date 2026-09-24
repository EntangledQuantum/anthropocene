import { useEffect, useMemo, useRef, useState } from 'react';
import { SLED, sledForces, sledLedgerAt, sledRun } from '../../lib/physics/work-scenes-ch06.ts';
import { Arrow, Body, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';

/**
 * A sled, a rope and a flag 8 m away. The rope always pulls 60 N; the one
 * thing you choose is its angle, by dragging the hand. Pull, and the sled runs
 * to the flag (or stops short) on the motion `sledRun` integrates.
 *
 * The rope's arrow is split into the piece along the ground (solid) and the
 * piece across it (dashed). Only the solid piece ever shows up in the speed,
 * and the ledger under the stage makes that a sum: each force's work, and the
 * measured change in ½mv² beside them.
 *
 * `mu` = 0 is ice, where flat is best and straight up does nothing. On snow
 * (`mu` > 0) friction grows with how hard the runners press, so a tilt up
 * trades a little rope work for a lot less snow work.
 *
 * Graded with `id` and `target`: arrive at `target` m/s (± `tolerance`), or,
 * with `beat`, faster than `target`.
 */
export interface RopeSledProps {
  id?: string;
  prompt?: string;
  mu?: number;
  startAngle?: number;
  target?: number;
  beat?: boolean;
  tolerance?: number;
  explanation?: string;
}

const ROPE = 1.7;          // m, sled to hand
const F_SCALE = 1.3 / 60;  // m of arrow per newton
const AY = 0.36;           // rope attach height
const PLAY = 0.6;          // slow motion, so the run can be watched
type Phase = 'ready' | 'running' | 'done';

export default function RopeSled({ id, prompt, mu = 0, startAngle = 30, target, beat, tolerance = 0.2, explanation }: RopeSledProps) {
  const graded = Boolean(id && target !== undefined);
  const task = useTask(graded ? id : undefined, 'rope-sled');
  const [angle, setAngle] = useState(startAngle);
  const [phase, setPhase] = useState<Phase>('ready');
  const [shown, setShown] = useState<{ x: number; v: number }>({ x: 0, v: SLED.v0 });
  const opts = useMemo(() => ({ mass: SLED.mass, pull: SLED.pull, v0: SLED.v0, distance: SLED.distance, mu, angleDeg: angle }), [mu, angle]);
  const forces = sledForces(opts);
  const run = useMemo(() => sledRun(opts), [opts]);
  const group = useRef<SVGGElement>(null);
  const stage = useRef<StageApi | null>(null);
  const surface = mu > 0 ? 'snow' : 'ice';

  useEffect(() => {
    if (phase !== 'running') return;
    let raf = 0, lastShown = 0, i = 0;
    const t0 = performance.now();
    const states = run.states, end = states[states.length - 1];
    const frame = (now: number) => {
      const t = ((now - t0) / 1000) * PLAY;
      while (i < states.length - 2 && states[i + 1].t < t) i++;
      const a = states[i], b = states[Math.min(i + 1, states.length - 1)];
      const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
      const x = a.x + f * (b.x - a.x), v = a.v + f * (b.v - a.v);
      if (t >= end.t) {
        setShown({ x: end.x, v: end.v }); setPhase('done');
        return;
      }
      if (group.current && stage.current) group.current.setAttribute('transform', `translate(${stage.current.len(x)},0)`);
      if (now - lastShown > 120) { lastShown = now; setShown({ x, v }); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, run]);

  const pull = () => { setShown({ x: 0, v: SLED.v0 }); setPhase('running'); task.touch(); };
  const aim = (p: Vec) => {
    let deg = (Math.atan2(p[1] - AY, p[0]) * 180) / Math.PI;
    if (deg < 0) deg = deg > -90 ? 0 : 180;
    const snapped = Math.round(deg / 5) * 5;
    if (snapped === angle) return;
    setAngle(snapped);
    if (phase === 'done') { setPhase('ready'); setShown({ x: 0, v: SLED.v0 }); }
    task.touch();
  };

  const rad = (angle * Math.PI) / 180;
  const hand: Vec = [ROPE * Math.cos(rad), AY + ROPE * Math.sin(rad)];
  const tip: Vec = [forces.rope[0] * F_SCALE, AY + forces.rope[1] * F_SCALE];
  const fPar = forces.split.fParallel;
  const ledger = sledLedgerAt(opts, shown.x);
  const dK = 0.5 * SLED.mass * (shown.v * shown.v - SLED.v0 * SLED.v0);
  const finished = phase === 'done';

  const vEnd = run.vEnd;
  const hit = run.reached && (beat ? vEnd > target! : Math.abs(vEnd - target!) <= tolerance);
  const along = `${Math.abs(fPar).toFixed(0)} N of your pull lies along the ${surface}${fPar < -0.5 ? ', pointing back' : ''}.`;
  const miss = !finished ? 'Pull first, then check.'
    : !run.reached ? `It stopped ${run.x.toFixed(1)} m out, short of the flag. ${along}`
    : beat ? `${vEnd.toFixed(2)} m/s at the flag, ${(target! - vEnd).toFixed(2)} m/s short of ${target} m/s. Rope ${fmtJ(run.ropeWork)}, ${surface} ${fmtJ(run.surfaceWork)}.`
    : `${vEnd.toFixed(2)} m/s at the flag, ${Math.abs(vEnd - target!).toFixed(2)} m/s ${vEnd > target! ? 'above' : 'below'} ${target} m/s. ${along}`;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" style={{ padding: '10px 20px', fontSize: 15 }} onClick={pull} disabled={phase === 'running'}>
            {finished ? 'Pull again' : 'Pull'}
          </button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Speed" value={shown.v.toFixed(2)} unit="m/s" color={C.velocity} />
            <Meter label={`Along the ${surface}`} value={fPar.toFixed(0)} unit="N" color={C.force} />
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(finished && hit, { angle, vEnd })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-1.2, 9.6]} y={[-0.9, 3.1]} height={250} equal ground
        label={`Sled on ${surface}, rope at ${angle} degrees, speed ${shown.v.toFixed(1)} metres per second`}>
        {(s) => { stage.current = s; return <>
          {mu > 0 && Array.from({ length: 44 }, (_, k) => <circle key={k} cx={s.sx(-1 + k * 0.25)} cy={s.sy(-0.08 - (k % 3) * 0.07)} r={1.6} fill={C.faint} />)}
          <text x={s.sx(-1.1)} y={s.sy(-0.62)} fontSize={13} fill={C.faint}>{surface}</text>
          <line x1={s.sx(0)} x2={s.sx(0)} y1={s.sy(0)} y2={s.sy(-0.3)} stroke={C.faint} />
          <text x={s.sx(0)} y={s.sy(-0.62)} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">0 m</text>
          <line x1={s.sx(8)} x2={s.sx(8)} y1={s.sy(0)} y2={s.sy(1.5)} stroke={C.soft} strokeWidth={2} />
          <path d={`M${s.sx(8)},${s.sy(1.5)}L${s.sx(8.55)},${s.sy(1.32)}L${s.sx(8)},${s.sy(1.14)}Z`} fill={C.position} />
          <text x={s.sx(8)} y={s.sy(-0.62)} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">8 m</text>
          {finished && <g opacity={0.45}>
            <Body s={s} at={[run.x, 0.2]} w={1.1} h={0.28} color={C.faint} />
            <line x1={s.sx(run.x - 0.6)} x2={s.sx(run.x + 0.62)} y1={s.sy(0.03)} y2={s.sy(0.03)} stroke={C.faint} strokeWidth={3} strokeLinecap="round" />
          </g>}
          {finished && <text x={s.sx(Math.min(run.x, 7.2))} y={s.sy(1.9)} textAnchor="middle" fontSize={14} fill={run.reached ? C.velocity : C.warn}>
            {run.reached ? `${run.vEnd.toFixed(2)} m/s at the flag` : run.turnsBack ? `stopped at ${run.x.toFixed(1)} m, then pulled back` : `stopped at ${run.x.toFixed(1)} m`}
          </text>}
          <g ref={group} transform={`translate(${s.len(phase === 'running' ? shown.x : 0)},0)`}>
            <line x1={s.sx(-0.6)} x2={s.sx(0.62)} y1={s.sy(0.03)} y2={s.sy(0.03)} stroke={C.soft} strokeWidth={3} strokeLinecap="round" />
            <Body s={s} at={[0, 0.2]} w={1.1} h={0.28} />
            <line x1={s.sx(0)} y1={s.sy(AY)} x2={s.sx(hand[0])} y2={s.sy(hand[1])} stroke={C.faint} strokeWidth={1.5} />
            <Arrow s={s} from={[0, AY]} to={tip} color={C.force} />
            {Math.abs(fPar) > 0.5 && phase !== 'running' && <Arrow s={s} from={[0, AY]} to={[fPar * F_SCALE, AY]} color={C.force} width={5} label={`${Math.abs(fPar).toFixed(0)} N along`} labelSide={fPar > 0 ? 1 : -1} />}
            {Math.abs(fPar) > 0.5 && phase === 'running' && <Arrow s={s} from={[0, AY]} to={[fPar * F_SCALE, AY]} color={C.force} width={5} />}
            <line x1={s.sx(fPar * F_SCALE)} y1={s.sy(AY)} x2={s.sx(tip[0])} y2={s.sy(tip[1])} stroke={C.force} strokeWidth={1.5} strokeDasharray="4 4" />
            {phase !== 'running' && <>
              <text x={s.sx(hand[0]) + (angle > 100 ? -16 : 16)} y={s.sy(hand[1]) - 12} textAnchor={angle > 100 ? 'end' : 'start'} fontSize={13} fill={C.force} fontWeight={600}>
                rope 60 N <tspan fill={C.soft} fontWeight={400} fontFamily="var(--font-mono)">at {angle}°</tspan>
              </text>
              <Handle s={s} at={hand} onChange={aim} step={0.25} label="Rope angle: drag the hand" />
            </>}
          </g>
        </>; }}
      </Stage>
      <Ledger rows={[
        { label: "Rope's work", value: ledger.rope, color: C.force },
        ...(mu > 0 ? [{ label: "Snow's work", value: ledger.surface, color: C.force }] : []),
        { label: 'Change in ½mv²', value: dK, color: C.energy },
      ]} />
    </SceneCard>
  );
}

const fmtJ = (w: number) => `${w >= 0 ? '+' : '−'}${Math.abs(w).toFixed(0)} J`;

/** Signed bars from a shared zero: right is energy in, left is energy out. */
export function Ledger({ rows, span = 500 }: { rows: { label: string; value: number; color: string }[]; span?: number }) {
  const W = 640, L = 140, Z = 430, half = 185, rowH = 24;
  const H = rows.length * rowH + 22;
  const px = (w: number) => (Math.max(-span, Math.min(span, w)) / span) * half;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', marginTop: 8 }} role="img"
      aria-label={rows.map((r) => `${r.label} ${r.value.toFixed(0)} joules`).join(', ')}>
      <line x1={Z} x2={Z} y1={0} y2={H - 18} stroke={C.rule} />
      {[-span, span].map((v) => <text key={v} x={Z + px(v)} y={H - 4} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{v > 0 ? '+' : '−'}{span} J</text>)}
      <text x={Z} y={H - 4} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">0</text>
      {rows.map((r, i) => {
        const y = i * rowH + 4, w = px(r.value);
        return <g key={r.label}>
          <text x={L - 8} y={y + 14} textAnchor="end" fontSize={13} fill={C.soft}>{r.label}</text>
          <rect x={Math.min(Z, Z + w)} y={y + 2} width={Math.abs(w)} height={rowH - 8} fill={r.color} opacity={0.75} rx={2} />
          <text x={L + 76} y={y + 14} textAnchor="end" fontSize={13} fill={r.color} fontFamily="var(--font-mono)">{fmtJ(r.value)}</text>
        </g>;
      })}
    </svg>
  );
}

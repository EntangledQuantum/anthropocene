import { useEffect, useMemo, useRef, useState } from 'react';
import { CAR, brakeRun, brakeWorkOver, speedPassing } from '../../lib/physics/work-scenes-ch06.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';

/**
 * A car, a road and a cone. Drag the car's velocity arrow to choose how fast
 * it is going when the brakes lock, then brake. The skid mark it leaves is
 * the distance `brakeRun` integrates: a steady 6000 N against 1200 kg.
 *
 * A faint mark shows the one fact given: from 10 m/s it stops in 10 m. The
 * learner's linear guess (four times the room, four times the speed) puts the
 * car through the cone at speed, which is the lesson: the brakes remove a
 * fixed energy per metre, and ½mv² grows as v².
 *
 * Graded with `id`: stop at most `window` metres short of the cone, not past it.
 */
export interface BrakeToStopProps {
  id?: string;
  prompt?: string;
  start?: number;
  window?: number;
  explanation?: string;
}

const V_SCALE = 0.9;   // m of arrow per m/s
const ROAD_END = 47;   // last metre drawn
const CAR_L = 4.2;
const PLAY = 1.4;      // a braking car is slow to watch at real speed
type Phase = 'ready' | 'running' | 'done';

export default function BrakeToStop({ id, prompt, start = 12, window = 4, explanation }: BrakeToStopProps) {
  const task = useTask(id, 'brake-to-stop');
  const [speed, setSpeed] = useState(start);
  const [phase, setPhase] = useState<Phase>('ready');
  const [shown, setShown] = useState({ x: 0, v: start });
  const run = useMemo(() => brakeRun(speed), [speed]);
  const car = useRef<SVGGElement>(null);
  const skid = useRef<SVGRectElement>(null);
  const stage = useRef<StageApi | null>(null);
  const cone = CAR.cone;

  useEffect(() => {
    if (phase !== 'running') return;
    let raf = 0, lastShown = 0, i = 0;
    const t0 = performance.now();
    const st = run.states, end = st[st.length - 1];
    const frame = (now: number) => {
      const t = ((now - t0) / 1000) * PLAY;
      while (i < st.length - 2 && st[i + 1].t < t) i++;
      const p = st[i], q = st[Math.min(i + 1, st.length - 1)];
      const f = q.t > p.t ? Math.min(1, Math.max(0, (t - p.t) / (q.t - p.t))) : 1;
      const x = p.x + f * (q.x - p.x), v = p.v + f * (q.v - p.v);
      if (t >= end.t) { setShown({ x: run.distance, v: 0 }); setPhase('done'); return; }
      const s = stage.current;
      if (s && car.current) car.current.setAttribute('transform', `translate(${s.len(Math.min(x, ROAD_END))},0)`);
      if (s && skid.current) skid.current.setAttribute('width', String(s.len(Math.min(x, ROAD_END))));
      if (now - lastShown > 120) { lastShown = now; setShown({ x, v }); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, run]);

  const brake = () => { setShown({ x: 0, v: speed }); setPhase('running'); task.touch(); };
  const aim = (p: Vec) => {
    const v = Math.max(1, Math.min(30, Math.round(p[0] / V_SCALE)));
    if (v === speed) return;
    setSpeed(v); setPhase('ready'); setShown({ x: 0, v }); task.touch();
  };

  const finished = phase === 'done';
  const d = run.distance;
  const hitCone = finished && d > cone + 1e-6;
  const atCone = speedPassing(run.states, cone);
  const shownX = phase === 'ready' ? 0 : Math.min(shown.x, ROAD_END);
  const brakeWork = brakeWorkOver(shown.x);
  const ok = finished && d <= cone + 1e-6 && d >= cone - window;
  const miss = !finished ? 'Brake first, then check.'
    : hitCone ? `From ${speed} m/s it skids ${d.toFixed(1)} m and reaches the cone still doing ${atCone.toFixed(1)} m/s.`
    : `From ${speed} m/s it stops in ${d.toFixed(1)} m, ${(cone - d).toFixed(1)} m short of the cone. It could have been going faster.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" style={{ padding: '10px 20px', fontSize: 15 }} onClick={brake} disabled={phase === 'running'}>
            {finished ? 'Brake again' : 'Brake'}
          </button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Speed" value={shown.v.toFixed(1)} unit="m/s" color={C.velocity} />
            <Meter label="Skid" value={shown.x.toFixed(1)} unit="m" color={C.position} />
            <Meter label="Brakes' work" value={`${brakeWork < -0.5 ? '−' : ''}${Math.abs(brakeWork / 1000).toFixed(0)}`} unit="kJ" color={C.energy} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(ok, { speed, d })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-7, 50]} y={[-2.2, 4.4]} height={190}
        label={`Car braking from ${speed} metres per second; cone at ${cone} metres`}>
        {(s) => { stage.current = s; const px = (m: number) => s.len(m); return <>
          <rect x={s.sx(-7)} y={s.sy(0)} width={s.len(57)} height={px(0.5)} fill={C.grid} opacity={0.5} />
          <line x1={s.sx(-7)} x2={s.sx(50)} y1={s.sy(0)} y2={s.sy(0)} stroke={C.rule} strokeWidth={2} />
          {[0, 10, 20, 30, 40].map((m) => <g key={m}>
            <line x1={s.sx(m)} x2={s.sx(m)} y1={s.sy(0)} y2={s.sy(-0.7)} stroke={C.faint} />
            <text x={s.sx(m)} y={s.sy(-1.6)} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{m} m</text>
          </g>)}
          <rect x={s.sx(0)} y={s.sy(0.28)} width={s.len(10)} height={px(0.22)} fill={C.faint} opacity={0.35} />
          <text x={s.sx(5)} y={s.sy(0.9)} textAnchor="middle" fontSize={12} fill={C.faint}>from 10 m/s</text>
          <rect ref={skid} x={s.sx(0)} y={s.sy(0.28)} width={s.len(shownX)} height={px(0.22)} fill={C.ink} opacity={0.7} />
          <g transform={hitCone ? `rotate(62 ${s.sx(cone + 0.5)} ${s.sy(0)})` : undefined}>
            <path d={`M${s.sx(cone - 0.6)},${s.sy(0)}L${s.sx(cone)},${s.sy(0)} L${s.sx(cone)},${s.sy(0)} L${s.sx(cone + 0.6)},${s.sy(0)} L${s.sx(cone)},${s.sy(0) - px(1.6)}Z`} fill={C.warn} />
          </g>
          <g ref={car} transform={`translate(${s.len(shownX)},0)`}>
            <rect x={s.sx(-CAR_L)} y={s.sy(0) - px(1.25)} width={px(CAR_L)} height={px(0.8)} rx={3} fill={C.surface} stroke={C.ink} strokeWidth={2} />
            <path d={`M${s.sx(-3.2)},${s.sy(0) - px(1.25)}L${s.sx(-2.6)},${s.sy(0) - px(1.85)}L${s.sx(-1.3)},${s.sy(0) - px(1.85)}L${s.sx(-0.7)},${s.sy(0) - px(1.25)}`} fill="none" stroke={C.ink} strokeWidth={2} />
            {[-3.3, -0.9].map((w) => <circle key={w} cx={s.sx(w)} cy={s.sy(0) - px(0.42)} r={px(0.42)} fill={C.surface} stroke={C.soft} strokeWidth={2} />)}
          </g>
          {finished && <text x={s.sx(Math.min(d, 49))} y={s.sy(3.7)} textAnchor={d > 30 ? 'end' : 'middle'} fontSize={14} fill={hitCone ? C.warn : C.position}>
            {d > ROAD_END ? `stopped after ${d.toFixed(1)} m, off the road ahead` : `stopped in ${d.toFixed(1)} m`}
          </text>}
          {phase !== 'running' && <>
            <Arrow s={s} from={[0, 3]} to={[speed * V_SCALE, 3]} color={C.velocity} label={`${speed} m/s`} labelSide={1} />
            <Handle s={s} at={[speed * V_SCALE, 3]} onChange={aim} step={V_SCALE} color={C.velocity} label="Speed when the brakes lock: drag the arrow tip" />
          </>}
        </>; }}
      </Stage>
    </SceneCard>
  );
}

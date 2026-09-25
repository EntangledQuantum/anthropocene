import { useEffect, useRef, useState } from 'react';
import {
  DRIFT, deg, driftGL, driftTargetAngle, driftTick, idealAngle, lagAfterTicks, pendulumStep, periodExcessPercent, rad,
} from '../../lib/physics/periodic-ch14.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * A real 25 cm pendulum and, on the same pivot, the small-angle clock: a ghost
 * bob that swings as θ₀cos(ω₀t) whatever θ₀ is. Drag the real bob to a release
 * angle and let both go for ten ticks of the ideal clock.
 *
 * The real bob integrates θ'' = −(g/L) sin θ (`pendulumStep`, RK4). At small
 * angles the two stay together; at large ones the real bob falls behind.
 * Graded: find the angle where, after ten ticks, it is half a cycle behind,
 * on the far side as the ghost arrives home. The target is computed from the
 * exact period (`driftTargetAngle`), about 51°.
 */
export interface PendulumDriftProps {
  id?: string;
  prompt?: string;
  /** Degrees. */
  start?: number;
  /** Degrees either side of the target that count. */
  tolerance?: number;
  explanation?: string;
}

const MIN = 5, MAX = 100, SUB = 1 / 1000;

export default function PendulumDrift({ id, prompt, start = 20, tolerance = 4, explanation }: PendulumDriftProps) {
  const task = useTask(id, 'pendulum-drift');
  const [angle, setAngle] = useState(start);
  const [phase, setPhase] = useState<'set' | 'run' | 'done'>('set');
  const [ticks, setTicks] = useState(0);
  const stage = useRef<StageApi | null>(null);
  const sim = useRef({ t: 0, th: rad(start), w: 0, th0: rad(start), on: false });
  const els = useRef<Record<string, SVGElement | null>>({});

  const place = (key: string, th: number) => {
    const s = stage.current;
    if (!s) return;
    const x = s.sx(Math.sin(th)), y = s.sy(-Math.cos(th));
    els.current[`${key}-rod`]?.setAttribute('x2', String(x));
    els.current[`${key}-rod`]?.setAttribute('y2', String(y));
    els.current[`${key}-bob`]?.setAttribute('transform', `translate(${x},${y})`);
  };

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const end = DRIFT.ticks * driftTick;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const m = sim.current;
      if (m.on) {
        const target = Math.min(m.t + dt, end);
        while (m.t < target - 1e-12) {
          const h = Math.min(SUB, target - m.t);
          [m.th, m.w] = pendulumStep(m.th, m.w, driftGL, 0, h);
          m.t += h;
        }
        if (m.t >= end - 1e-9) { m.on = false; setPhase('done'); }
      }
      place('real', m.th);
      place('ideal', idealAngle(m.th0, m.t));
      if (now - lastShown > 125) { lastShown = now; setTicks(Math.floor(m.t / driftTick + 1e-6)); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const setRelease = (d: number) => {
    setAngle(d);
    sim.current = { t: 0, th: rad(d), w: 0, th0: rad(d), on: false };
    setPhase('set'); setTicks(0); task.touch();
  };
  const release = () => { sim.current = { t: 0, th: rad(angle), w: 0, th0: rad(angle), on: true }; setPhase('run'); setTicks(0); task.touch(); };

  const lag = lagAfterTicks(rad(angle));
  const target = deg(driftTargetAngle());
  const hit = phase === 'done' && Math.abs(angle - target) <= tolerance;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={release} disabled={phase === 'run'}>Release both</button>
          <button type="button" className="anth-btn" onClick={() => setRelease(angle)}>Reset</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Release angle" value={`${angle}°`} color={C.position} />
            <Meter label="Ideal clock ticks" value={`${ticks} / ${DRIFT.ticks}`} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { angle })}
          miss={phase !== 'done'
            ? `The clock has ticked ${ticks} of ${DRIFT.ticks} times. Release and let it finish first.`
            : `From ${angle}°, the real bob ends ${lag.toFixed(2)} of a cycle behind, not 0.50: its period is ${periodExcessPercent(rad(angle)).toFixed(1)}% longer than the ideal clock's.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-1.2, 1.2]} y={[-1.12, 0.6]} height={380} equal
        label={`Pendulum released at ${angle} degrees beside the small-angle clock`}>
        {(s) => {
          stage.current = s;
          const th0 = rad(angle);
          const arc = (r: number, a: number, b: number) =>
            `M${s.sx(r * Math.sin(a))},${s.sy(-r * Math.cos(a))}A${s.len(r)},${s.len(r)} 0 0 0 ${s.sx(r * Math.sin(b))},${s.sy(-r * Math.cos(b))}`;
          return <>
            <line x1={s.sx(-0.35)} x2={s.sx(0.35)} y1={s.sy(0)} y2={s.sy(0)} stroke={C.rule} strokeWidth={3} />
            <line x1={s.sx(0)} x2={s.sx(0)} y1={s.sy(0)} y2={s.sy(-1.12)} stroke={C.grid} strokeDasharray="2 6" />
            <path d={arc(1, th0, -th0)} fill="none" stroke={C.grid} strokeDasharray="3 5" />
            <path d={arc(0.22, th0, 0)} fill="none" stroke={C.faint} />
            <text x={s.sx(-0.04)} y={s.sy(-0.26)} textAnchor="end" fontSize={13} fill={C.soft}>{angle}°</text>
            {/* the ideal clock, a ghost */}
            <line ref={(el) => { els.current['ideal-rod'] = el; }} x1={s.sx(0)} y1={s.sy(0)} x2={s.sx(Math.sin(th0))} y2={s.sy(-Math.cos(th0))}
              stroke={C.faint} strokeWidth={1.4} strokeDasharray="5 5" />
            <g ref={(el) => { els.current['ideal-bob'] = el; }} transform={`translate(${s.sx(Math.sin(th0))},${s.sy(-Math.cos(th0))})`}>
              <circle r={15} fill="none" stroke={C.faint} strokeWidth={2} strokeDasharray="4 4" />
            </g>
            {/* the real pendulum */}
            <line ref={(el) => { els.current['real-rod'] = el; }} x1={s.sx(0)} y1={s.sy(0)} x2={s.sx(Math.sin(th0))} y2={s.sy(-Math.cos(th0))}
              stroke={C.soft} strokeWidth={1.8} />
            <g ref={(el) => { els.current['real-bob'] = el; }} transform={`translate(${s.sx(Math.sin(th0))},${s.sy(-Math.cos(th0))})`}>
              <circle r={11} fill={C.surface} stroke={C.position} strokeWidth={2.5} />
            </g>
            <circle cx={s.sx(0)} cy={s.sy(0)} r={4} fill={C.soft} />
            <g fontSize={13}>
              <line x1={s.sx(-1.44)} x2={s.sx(-1.34)} y1={s.sy(0.5)} y2={s.sy(0.5)} stroke={C.faint} strokeDasharray="5 5" strokeWidth={1.6} />
              <text x={s.sx(-1.3)} y={s.sy(0.5) + 4} fill={C.soft}>ideal clock: same period at any angle</text>
              <circle cx={s.sx(-1.39)} cy={s.sy(0.38)} r={6} fill={C.surface} stroke={C.position} strokeWidth={2} />
              <text x={s.sx(-1.3)} y={s.sy(0.38) + 4} fill={C.soft}>real pendulum, 25 cm</text>
            </g>
            {phase !== 'run' && <Handle s={s} at={[Math.sin(th0), -Math.cos(th0)]} color={C.position} step={0.02}
              label="Real bob: drag to set the release angle"
              onChange={(p) => {
                const d = Math.round(deg(Math.atan2(p[0], -p[1])));
                setRelease(Math.max(MIN, Math.min(MAX, d)));
              }} />}
          </>;
        }}
      </Stage>
    </SceneCard>
  );
}

import { useState } from 'react';
import { BEACH, fastestEntry, pathAngles, pathTime, pathTimeSlope } from '../../lib/physics/light.ts';
import { Body, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { AngleArc, Medium, Normal, WATER_FILL } from './optics-kit-ch33.tsx';

/**
 * A lifeguard on the sand, a swimmer out in the water, and one control: the
 * point where the lifeguard hits the waterline. Running is fast and swimming
 * is slow, so the straight line is not the quickest route, and neither is the
 * shortest swim.
 *
 * The time is `pathTime`, the optimum `fastestEntry` (bisection on dT/dx).
 * Every entry point tried leaves a dot on the strip underneath. Once solved,
 * the normal and both angles appear with sin θ₁ / sin θ₂ beside the ratio of
 * the speeds: Snell's law, found as the answer to a race.
 */
export interface LifeguardDashProps {
  id?: string;
  prompt?: string;
  /** m/s on sand and in water. */
  run?: number;
  swim?: number;
  /** Metres from the best entry point that count. */
  tolerance?: number;
  explanation?: string;
}

const { A, B } = BEACH;
const X0 = 26;

export default function LifeguardDash({ id, prompt, run = BEACH.run, swim = BEACH.swim, tolerance = 1.5, explanation }: LifeguardDashProps) {
  const task = useTask(id, 'lifeguard-dash');
  const [x, setX] = useState(X0);
  const [tried, setTried] = useState<number[]>([X0]);
  const best = fastestEntry(A, B, run, swim);
  const T = pathTime(A, B, x, run, swim), Tbest = pathTime(A, B, best, run, swim);
  const ok = Math.abs(x - best) <= tolerance;
  // The reveal is drawn at the true best route, so its sines are exact.
  const { theta1, theta2 } = pathAngles(A, B, best);
  const later = pathTimeSlope(A, B, x, run, swim) < 0 ? 'further along the beach' : 'back toward the chair';
  const tMax = pathTime(A, B, 0, run, swim);

  const set = (p: Vec) => {
    const v = Math.round(Math.max(0, Math.min(54, p[0])) * 2) / 2;
    setX(v);
    setTried((a) => (a.includes(v) ? a : [...a, v]));
    task.touch();
  };

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <span style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Time to the swimmer" value={T.toFixed(2)} unit="s" />
          <Meter label="Run" value={Math.hypot(x - A[0], A[1]).toFixed(1)} unit="m" color={C.position} />
          <Meter label="Swim" value={Math.hypot(B[0] - x, B[1]).toFixed(1)} unit="m" color={C.position} />
          {task.done && <Meter label="Best route: sin θ₁ / sin θ₂" value={(Math.sin(theta1) / Math.sin(theta2)).toFixed(2)} color={C.ok} />}
          {task.done && <Meter label="run / swim speed" value={(run / swim).toFixed(2)} color={C.ok} />}
        </span>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(ok, { x })}
          miss={`This route takes ${T.toFixed(2)} s, ${(T - Tbest).toFixed(2)} s slower than the best one. Entering the water ${later} saves time.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-8, 58]} y={[-17, 19]} height={360} equal
        label={`Beach. The lifeguard enters the water ${x.toFixed(1)} metres along and reaches the swimmer in ${T.toFixed(2)} seconds.`}>
        {(s) => <>
          <rect x={s.sx(s.x[0])} y={s.sy(19)} width={s.sx(s.x[1]) - s.sx(s.x[0])} height={s.sy(0) - s.sy(19)} fill="color-mix(in oklab, var(--color-amber) 7%, var(--color-surface))" />
          <Medium s={s} x={[s.x[0], s.x[1]]} y={[-17, 0]} fill={WATER_FILL} />
          <text x={s.sx(s.x[1]) - 8} y={s.sy(0) - 8} textAnchor="end" fontSize={13} fill={C.soft}>sand: run at {run} m/s</text>
          <text x={s.sx(s.x[1]) - 8} y={s.sy(0) + 20} textAnchor="end" fontSize={13} fill={C.soft}>water: swim at {swim} m/s</text>
          <line x1={s.sx(A[0])} y1={s.sy(A[1])} x2={s.sx(B[0])} y2={s.sy(B[1])} stroke={C.ghost} strokeDasharray="3 6" strokeWidth={1.5} />
          {task.done && <>
            <path d={`M${s.sx(A[0])},${s.sy(A[1])}L${s.sx(best)},${s.sy(0)}L${s.sx(B[0])},${s.sy(B[1])}`} fill="none" stroke={C.ok} strokeWidth={1.6} strokeDasharray="6 5" />
            <Normal s={s} at={[best, 0]} len={10} />
            <AngleArc s={s} at={[best, 0]} a0={Math.PI / 2} a1={Math.PI / 2 + theta1} r={46} label={`θ₁ ${(theta1 * 180 / Math.PI).toFixed(0)}°`} />
            <AngleArc s={s} at={[best, 0]} a0={-Math.PI / 2} a1={-Math.PI / 2 + theta2} r={46} label={`θ₂ ${(theta2 * 180 / Math.PI).toFixed(0)}°`} />
          </>}
          <path d={`M${s.sx(A[0])},${s.sy(A[1])}L${s.sx(x)},${s.sy(0)}L${s.sx(B[0])},${s.sy(B[1])}`} fill="none" stroke={C.position} strokeWidth={3} strokeLinejoin="round" />
          <Body s={s} at={A} w={2.6} round color={C.ink} />
          <text x={s.sx(A[0]) + 22} y={s.sy(A[1]) + 5} fontSize={13} fill={C.ink}>lifeguard</text>
          <Body s={s} at={B} w={2.6} round color={C.ink} />
          <text x={s.sx(B[0]) - 22} y={s.sy(B[1]) + 5} textAnchor="end" fontSize={13} fill={C.ink}>swimmer</text>
          <Handle s={s} at={[x, 0]} step={0.5} label="Where you enter the water: drag along the waterline" clamp={(p) => [p[0], 0]} onChange={set} color={C.position} />
        </>}
      </Stage>
      <Stage x={[0, 54]} y={[Tbest - 0.6, tMax + 0.2]} height={170} axes={{ x: 'where you enter the water (m)', y: 'time (s)', yTicks: [16, 18, 20, 22, 24], xTicks: [0, 10, 20, 30, 40, 50] }}
        label="Time to the swimmer for every entry point you have tried">
        {(p) => tried.map((v) => <circle key={v} cx={p.sx(v)} cy={p.sy(pathTime(A, B, v, run, swim))} r={v === x ? 6 : 4}
          fill={v === x ? C.position : C.surface} stroke={C.position} strokeWidth={2} />)}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Iris: your route · dotted: the straight line{task.done ? ' · dashed green: the best route' : ''} · each dot below is a route you tried
      </p>
    </SceneCard>
  );
}

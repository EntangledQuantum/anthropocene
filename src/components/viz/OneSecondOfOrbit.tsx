import { useEffect, useState } from 'react';
import { GM_EARTH, ISS_ALTITUDE, R_EARTH, circularSpeed, fallInTime, gravityAt, sagBelowTangent } from '../../lib/physics/orbits.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';

/**
 * One second of orbit, seen side-on at 400 km up.
 *
 * The dashed line is where the ball would go with no gravity. The grey curve
 * is the Earth's curvature at that height: how far "level" drops below the
 * straight line as you go along it. The iris curve is the ball's actual path.
 * The ball's dot marks where it is after exactly one second, and it can only
 * move sideways: whatever the speed, one second of falling is 4.35 m.
 *
 * Drag the ball until it sits on the curve: then the ground has fallen away
 * exactly as far as the ball fell, and the height has not changed. That speed
 * is √(g r). Vertical is in metres, horizontal in kilometres: the picture is
 * stretched about a thousand times vertically, and says so.
 *
 * With `id`, graded. Physics: `fallInTime`, `sagBelowTangent` from orbits.ts.
 */
export interface OneSecondOfOrbitProps {
  id?: string;
  prompt?: string;
  /** Starting sideways speed, km/s. */
  start?: number;
  /** km/s either side of the circular speed that counts. */
  tolerance?: number;
  explanation?: string;
}

const r = R_EARTH + ISS_ALTITUDE;
const g = gravityAt(GM_EARTH, r);
const FALL = fallInTime(g, 1); // metres in the first second, at any speed
const VC = circularSpeed(GM_EARTH, r) / 1000;
const XMAX = 12;

export default function OneSecondOfOrbit({ id, prompt, start = 5, tolerance = 0.06, explanation }: OneSecondOfOrbitProps) {
  const task = useTask(id, 'one-second-of-orbit');
  // The saved verdict is read during render; show it only after hydration so the
  // server's "Check" and the client's first render agree (React #418 otherwise).
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  const [v, setV] = useState(start); // km/s, which is also km travelled in the second
  const drop = sagBelowTangent(r, v * 1000);
  const gap = drop - FALL; // positive: the ball ends higher than it started
  const hit = Math.abs(v - VC) <= tolerance;

  const curve = (f: (d: number) => number) => {
    const pts: string[] = [];
    for (let i = 0; i <= 120; i++) { const d = (i / 120) * XMAX; pts.push(`${d},${f(d)}`); }
    return pts;
  };

  const miss = `At ${v.toFixed(2)} km/s the ground has dropped ${drop.toFixed(2)} m while the ball fell ${FALL.toFixed(2)} m. ` +
    (gap < 0 ? `It ends the second ${(-gap).toFixed(2)} m lower than it started.` : `It ends the second ${gap.toFixed(2)} m higher: climbing away.`);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Meter label="Sideways speed" value={v.toFixed(2)} unit="km/s" color={C.velocity} />
          <Meter label="Ball fell in 1 s" value={FALL.toFixed(2)} unit="m" color={C.position} />
          <Meter label="Ground dropped" value={drop.toFixed(2)} unit="m" />
        </div>
        {id && <CheckBar verdict={task.verdict} done={live && task.done} onCheck={() => task.check(hit, { v })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[0, XMAX]} y={[-8, 1.2]} height={330}
        axes={{ x: 'distance along the straight line (km)', y: 'height compared with the start (m)', yTicks: [-8, -6, -4, -2, 0] }}
        label={`Side view. The ball after one second is ${v.toFixed(2)} kilometres along and has fallen ${FALL.toFixed(2)} metres; the ground there has dropped ${drop.toFixed(2)} metres.`}>
        {(s) => {
          const path = (pts: string[]) => pts.map((p) => p.split(',').map(Number)).filter(([, y]) => y >= -8)
            .map(([x, y], i) => `${i ? 'L' : 'M'}${s.sx(x)},${s.sy(y)}`).join('');
          const ballY = -FALL;
          const groundY = -drop;
          return <>
            <line x1={s.sx(0)} x2={s.sx(XMAX)} y1={s.sy(0)} y2={s.sy(0)} stroke={C.soft} strokeWidth={1.5} strokeDasharray="6 5" />
            <text x={s.sx(XMAX) - 4} y={s.sy(0) - 8} textAnchor="end" fontSize={13} fill={C.soft}>straight on, if nothing pulled</text>
            <path d={path(curve((d) => -sagBelowTangent(r, d * 1000)))} fill="none" stroke={C.ink} strokeWidth={3} />
            <path d={path(curve((d) => -fallInTime(g, d / v)))} fill="none" stroke={C.position} strokeWidth={2.2} />
            {Math.abs(gap) > 0.03 && <line x1={s.sx(v)} x2={s.sx(v)} y1={s.sy(ballY)} y2={s.sy(groundY)} stroke={C.warn} strokeWidth={2} strokeDasharray="3 3" />}
            <circle cx={s.sx(0)} cy={s.sy(0)} r={5} fill={C.ink} />
            <text x={s.sx(0) + 8} y={s.sy(0) + 18} fontSize={12} fill={C.faint}>t = 0</text>
            <text x={s.sx(v)} y={s.sy(ballY) + 26} textAnchor="middle" fontSize={13} fill={C.position}>t = 1 s</text>
            <Handle s={s} at={[v, ballY]} color={C.position} step={0.01} label="The ball after one second: drag sideways"
              clamp={(p) => [Math.min(11.5, Math.max(2, Math.round(p[0] * 100) / 100)), ballY]}
              onChange={(p) => { setV(p[0]); task.touch(); }} />
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        side view, vertical stretched about 1,000 times · white: level ground 400 km up, curving away · iris: the ball's path
      </p>
    </SceneCard>
  );
}

import { useId, useState } from 'react';
import { gridReading } from '../../lib/physics/language-ch1.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';

/**
 * One arrow, pinned. The grid under it turns: drag the handle on axis 1.
 *
 * The dashed legs are the components drawn as arrows, a₁ along ê₁ and then
 * a₂ along ê₂, and they always land on the tip. Everything that mentions an
 * axis changes as you turn; the arrow and its length do not move at all.
 *
 * Graded when `id` is set: turn until the first component is as large as it
 * can be. It peaks at the arrow's full length, above where it started, with
 * the second component at zero.
 *
 * Physics: `gridReading` in language-ch1.ts over `componentsIn` from vectors.ts.
 */
export interface TurnTheGridProps {
  id?: string;
  prompt?: string;
  /** The arrow, in square-grid coordinates. */
  arrow?: [number, number];
  label?: string;
  /** Starting grid angle, degrees. */
  startDeg?: number;
  /** How close to the full length counts, as a fraction of it. */
  tolerance?: number;
  explanation?: string;
}

const R = 2.6; // handle radius, world units

export default function TurnTheGrid({ id, prompt, arrow = [4, 3], label = 'A', startDeg = 0, tolerance = 0.004, explanation }: TurnTheGridProps) {
  const task = useTask(id, 'turn-the-grid');
  const clip = `ttg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [theta, setTheta] = useState((startDeg * Math.PI) / 180);
  const g = gridReading(arrow, theta);
  const deg = ((((theta * 180) / Math.PI) % 360) + 360) % 360;
  const best = g.a1 >= g.length * (1 - tolerance);

  const leg1: Vec = [g.e1[0] * g.a1, g.e1[1] * g.a1];
  const handleAt: Vec = [g.e1[0] * R, g.e1[1] * R];

  return (
    <SceneCard id={id} prompt={prompt}
      footer={
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <Meter label="Along ê₁" value={g.a1.toFixed(2)} color={C.ink} />
            <Meter label="Along ê₂" value={g.a2.toFixed(2)} color={C.ink} />
            <Meter label={`Length of ${label}`} value={g.length.toFixed(2)} color={C.position} />
            <Meter label="Grid turned" value={`${deg.toFixed(0)}°`} color={C.soft} />
          </div>
          {id && <CheckBar verdict={task.verdict} done={task.done}
            onCheck={() => task.check(best, { deg })}
            miss={`The first component reads ${g.a1.toFixed(2)}, and ${Math.abs(g.a2).toFixed(2)} of ${label} still lies along ê₂.`}
            hit={explanation} />}
        </div>
      }>
      <Stage x={[-4, 7]} y={[-3, 6]} height={360} equal
        label={`Arrow ${label} fixed. Grid turned ${deg.toFixed(0)} degrees. Components ${g.a1.toFixed(2)} and ${g.a2.toFixed(2)}.`}>
        {(s) => {
          const lines = [];
          for (let k = -14; k <= 14; k++) {
            for (const [u, v] of [[g.e1, g.e2], [g.e2, g.e1]] as const) {
              const p0: Vec = [u[0] * k - v[0] * 20, u[1] * k - v[1] * 20];
              const p1: Vec = [u[0] * k + v[0] * 20, u[1] * k + v[1] * 20];
              lines.push(<line key={`${k}-${u === g.e1 ? 1 : 2}`} x1={s.sx(p0[0])} y1={s.sy(p0[1])} x2={s.sx(p1[0])} y2={s.sy(p1[1])}
                stroke={k === 0 ? C.rule : C.grid} strokeWidth={k === 0 ? 1.6 : 1} />);
            }
          }
          const tip = arrow as Vec;
          return <>
            <clipPath id={clip}><rect x={0} y={0} width={s.W} height={s.H} /></clipPath>
            <g clipPath={`url(#${clip})`}>{lines}</g>
            <circle cx={s.sx(0)} cy={s.sy(0)} r={s.len(R)} fill="none" stroke={C.faint} strokeDasharray="2 6" />
            {/* the components, as arrows that add up to the tip */}
            <Arrow s={s} from={[0, 0]} to={leg1} color={C.soft} width={2} dash="6 5" />
            <Arrow s={s} from={leg1} to={tip} color={C.soft} width={2} dash="6 5" />
            <Arrow s={s} from={[0, 0]} to={g.e1} color={C.ink} width={3} label="ê₁" labelSide={-1} />
            <Arrow s={s} from={[0, 0]} to={g.e2} color={C.ink} width={3} label="ê₂" />
            <Arrow s={s} from={[0, 0]} to={tip} color={C.position} width={4.5} label={label} />
            <Handle s={s} at={handleAt} r={10} step={0.12} color={C.ink} label="Turn the grid: drag around the origin"
              onChange={(p) => { if (task.done) return; setTheta(Math.atan2(p[1], p[0])); task.touch(); }} />
            <text x={s.sx(handleAt[0] - g.e2[0] * 0.55)} y={s.sy(handleAt[1] - g.e2[1] * 0.55) + 5} textAnchor="middle" fontSize={13} fill={C.soft}
              stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">turn</text>
          </>;
        }}
      </Stage>
    </SceneCard>
  );
}

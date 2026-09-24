import { useState } from 'react';
import { accelerationOn, netForceOn, type Force } from '../../lib/physics/dynamics.ts';
import { mag2 } from '../../lib/physics/vectors.ts';
import { Arrow, Body, C, CheckBar, Handle, SceneCard, Stage, useTask, type Vec } from './scene.tsx';

/**
 * Some forces are fixed. One is yours: drag its tip until the object stops
 * accelerating. The magenta acceleration arrow is the thing to kill, and it
 * is computed, not drawn — `netForceOn` / `accelerationOn` from dynamics.ts.
 *
 * Equilibrium turns out to be arrows that close a loop, every one of them
 * still fully present. The answer usually points where none of the given
 * forces point, which is the surprise.
 */
export interface CancelTheArrowProps {
  id: string;
  prompt?: string;
  mass?: number;
  /** The fixed forces, newtons, +y up. */
  fixed: { label: string; fx: number; fy: number }[];
  /** Where your force starts. */
  start?: [number, number];
  /** Largest force the stage shows, newtons. */
  span?: number;
  /** Net-force magnitude that counts as zero, newtons. */
  tolerance?: number;
  bodyLabel?: string;
  explanation?: string;
}

export default function CancelTheArrow({
  id, prompt, mass = 8, fixed, start = [10, 0], span = 36, tolerance = 1, bodyLabel = 'crate', explanation,
}: CancelTheArrowProps) {
  const task = useTask(id, 'cancel-the-arrow');
  const [mine, setMine] = useState<Vec>(start);

  const forces: Force[] = [
    ...fixed.map((f, i) => ({ id: `f${i}`, on: 'body', by: f.label, kind: 'applied' as const, vec: [f.fx, f.fy] as const })),
    { id: 'mine', on: 'body', by: 'you', kind: 'applied', vec: mine },
  ];
  const net = netForceOn('body', forces);
  const a = accelerationOn('body', mass, forces);
  const netMag = mag2(net);
  // The acceleration is drawn as m·a on the force scale, so its length is the
  // net force — but it carries its own colour and its own unit in the label.

  const clamp = (p: Vec): Vec => {
    const m = Math.hypot(p[0], p[1]);
    return m > span ? [p[0] / m * span, p[1] / m * span] : p;
  };
  const dir = (v: Vec) => {
    const deg = (Math.atan2(v[1], v[0]) * 180) / Math.PI;
    const names = ['right', 'up-right', 'up', 'up-left', 'left', 'down-left', 'down', 'down-right'];
    return names[((Math.round(deg / 45) % 8) + 8) % 8];
  };

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<CheckBar
        verdict={task.verdict} done={task.done}
        onCheck={() => task.check(netMag <= tolerance, { mine })}
        miss={`The forces still add to ${netMag.toFixed(1)} N, pointing ${dir(net)}. The ${bodyLabel} accelerates.`}
        hit={explanation}
      />}>
      <Stage x={[-span, span]} y={[-span * 0.72, span * 0.72]} height={360} equal
        label={`Force diagram. Your force is ${mag2(mine).toFixed(0)} newtons. Net force ${netMag.toFixed(1)} newtons.`}>
        {(s) => <>
          <Body s={s} at={[0, 0]} w={span * 0.16} h={span * 0.16} />
          {fixed.map((f, i) => (
            <Arrow key={i} s={s} from={[0, 0]} to={[f.fx, f.fy]} color={C.force} label={`${f.label} ${Math.hypot(f.fx, f.fy).toFixed(0)} N`} />
          ))}
          <Arrow s={s} from={[0, 0]} to={mine} color={C.ink} label={`you ${mag2(mine).toFixed(0)} N`} />
          {netMag > 0.3 && <Arrow s={s} from={[0, 0]} to={[a[0] * mass, a[1] * mass]} color={C.accel} width={4} dash="7 5"
            label={`a = ${mag2(a).toFixed(2)} m/s²`} />}
          {task.done && (() => {
            // The reusable picture: the same arrows laid tip to tail close a loop.
            let p: Vec = [span * 1.05, -span * 0.3];
            const chain = [...fixed.map((f) => [f.fx, f.fy] as Vec), mine];
            return chain.map((v, i) => {
              const q: Vec = [p[0] + v[0] * 0.5, p[1] + v[1] * 0.5];
              const el = <Arrow key={`c${i}`} s={s} from={p} to={q} width={2} color={i < fixed.length ? C.force : C.ink} />;
              p = q;
              return el;
            });
          })()}
          <Handle s={s} at={mine} onChange={(p) => { setMine(clamp(p)); task.touch(); }} step={1} label="Your force: drag its tip" />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        {bodyLabel}, {mass} kg · amber: fixed forces · white: yours · dashed magenta: the acceleration it gets
      </p>
    </SceneCard>
  );
}

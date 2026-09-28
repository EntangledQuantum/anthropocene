import { useEffect, useState } from 'react';
import { CH29_PIPE, pipeDragCoefficient, ringOnFallingMagnet, terminalSpeed } from '../../lib/physics/induction.ts';
import { Arrow, C, CheckBar, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * The copper pipe, frozen mid-fall and cut open. The magnet (north pole down)
 * falls at its terminal speed between two rings of the pipe, one just below
 * it and one just above. Click a ring to set which way its current runs; the
 * ring then shows the magnetic poles that current gives it. Check draws the
 * force each ring actually puts on the magnet with the chosen currents
 * (ringOnFallingMagnet, src/lib/physics/induction.ts). Right when both rings
 * brake the magnet — which is the direction Lenz's law gives.
 *
 * Graded with `id`.
 */
export interface RingsThatFightProps {
  id: string;
  prompt?: string;
  explanation?: string;
}

const A = CH29_PIPE.a * 1000; // mm
const RING_Z = CH29_PIPE.a;   // each ring one radius from the magnet's centre
const DZ = 0.004;             // ring height, m
const V = terminalSpeed(CH29_PIPE.M, pipeDragCoefficient('copper'));
const TRUE = { lower: Math.sign(ringOnFallingMagnet(-RING_Z, V, DZ).I) as 1 | -1, upper: Math.sign(ringOnFallingMagnet(RING_Z, V, DZ).I) as 1 | -1 };
const MM_PER_MN = 0.55;

type Dir = 0 | 1 | -1; // +1: current makes the ring's own field point up (north face on top)

export default function RingsThatFight({ id, prompt, explanation }: RingsThatFightProps) {
  const task = useTask(id, 'rings-that-fight');
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  const [dir, setDir] = useState<{ lower: Dir; upper: Dir }>({ lower: 0, upper: 0 });
  const shownForces = live && (task.verdict !== 'none' || task.done);

  const force = (which: 'lower' | 'upper', d: Dir) =>
    d === 0 ? 0 : ringOnFallingMagnet(which === 'lower' ? -RING_Z : RING_Z, V, DZ, 'copper', CH29_PIPE, d).force * 1000; // mN

  const flip = (which: 'lower' | 'upper') => {
    setDir((p) => ({ ...p, [which]: p[which] === 1 ? -1 : 1 }));
    task.touch();
  };

  const ok = dir.lower === TRUE.lower && dir.upper === TRUE.upper;
  const faceToward = (which: 'lower' | 'upper', d: Dir) => (which === 'lower' ? (d === 1 ? 'N' : 'S') : (d === 1 ? 'S' : 'N'));
  const magnetFace = (which: 'lower' | 'upper') => (which === 'lower' ? 'N' : 'S');
  const missFor = (which: 'lower' | 'upper') => {
    const d = dir[which];
    if (d === 0) return `The ${which} ring has no current set yet.`;
    const F = force(which, d);
    const verb = faceToward(which, d) === magnetFace(which) ? 'pushes' : 'pulls';
    return `The ${which} ring shows ${faceToward(which, d)} to the magnet's ${magnetFace(which)} and ${verb} it down with ${Math.abs(F).toFixed(0)} mN, speeding the fall.`;
  };
  const miss = dir.lower === 0 || dir.upper === 0
    ? missFor(dir.lower === 0 ? 'lower' : 'upper')
    : dir.lower !== TRUE.lower ? missFor('lower') : missFor('upper');

  const ring = (s: StageApi, which: 'lower' | 'upper') => {
    const yc = (which === 'lower' ? -1 : 1) * A, d = dir[which];
    const x0 = s.sx(-A - 1.6), x1 = s.sx(A + 1.6), y0 = s.sy(yc + 2), y1 = s.sy(yc - 2);
    const mark = (xw: number, out: boolean) => {
      const cx = s.sx(xw), cy = s.sy(yc);
      return <g>
        <circle cx={cx} cy={cy} r={10} fill={C.surface} stroke={C.velocity} strokeWidth={2} />
        {out ? <circle cx={cx} cy={cy} r={3} fill={C.velocity} />
          : <g stroke={C.velocity} strokeWidth={2}><line x1={cx - 5.5} y1={cy - 5.5} x2={cx + 5.5} y2={cy + 5.5} /><line x1={cx - 5.5} y1={cy + 5.5} x2={cx + 5.5} y2={cy - 5.5} /></g>}
      </g>;
    };
    return <g role="button" tabIndex={0} aria-label={`The ${which} ring: click to reverse its current`} style={{ cursor: 'pointer' }}
      onClick={() => flip(which)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(which); } }}>
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={3} fill={C.velocity} fillOpacity={d ? 0.12 : 0.07}
        stroke={C.velocity} strokeOpacity={0.55} strokeDasharray={d ? undefined : '4 4'} />
      {d !== 0 && <>
        {/* +1: field up; the right wall's current goes into the page */}
        {mark(-A, d === 1)}
        {mark(A, d === -1)}
        <text x={s.sx(A + 4.5)} y={s.sy(yc + 2.2) + 5} fontSize={15} fontWeight={700} fill={C.ink}>{d === 1 ? 'N' : 'S'}</text>
        <text x={s.sx(A + 4.5)} y={s.sy(yc - 2.2) + 5} fontSize={15} fontWeight={700} fill={C.soft}>{d === 1 ? 'S' : 'N'}</text>
      </>}
      {d === 0 && <text x={s.sx(A + 4.5)} y={s.sy(yc) + 5} fontSize={13} fill={C.faint}>click to set</text>}
      <text x={s.sx(-A - 3)} y={s.sy(yc) + 5} fontSize={13} textAnchor="end" fill={C.soft}>{which} ring</text>
    </g>;
  };

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<CheckBar verdict={task.verdict} done={live && task.done} miss={miss} hit={explanation}
        onCheck={() => task.check(ok, { dir })} />}>
      <Stage x={[-30, 30]} y={[-19, 19]} height={380} equal
        label={`A magnet, north pole down, falling at ${(V * 100).toFixed(1)} centimetres per second inside a copper pipe, between two rings of the pipe.`}>
        {(s) => <>
          {/* the pipe wall, cut open */}
          {[-1, 1].map((k) => <rect key={k} x={s.sx(k > 0 ? A : -A - 0.9)} y={s.sy(19)} width={s.len(0.9)} height={s.sy(-19) - s.sy(19)} fill={C.grid} stroke={C.soft} strokeWidth={1} />)}
          {ring(s, 'lower')}
          {ring(s, 'upper')}
          {/* the magnet, north pole down */}
          <rect x={s.sx(-6)} y={s.sy(6)} width={s.len(12)} height={s.len(12)} fill={C.surface} stroke={C.ink} strokeWidth={2} />
          <rect x={s.sx(-6) + 2} y={s.sy(6) + 2} width={s.len(12) - 4} height={s.len(6) - 2} fill={C.grid} />
          <text x={s.sx(0)} y={s.sy(3) + 5} textAnchor="middle" fontSize={15} fontWeight={700} fill={C.soft}>S</text>
          <text x={s.sx(0)} y={s.sy(-3) + 5} textAnchor="middle" fontSize={15} fontWeight={700} fill={C.ink}>N</text>
          <Arrow s={s} from={[-24, 4]} to={[-24, -4]} color={C.velocity} />
          <text x={s.sx(-24)} y={s.sy(-6) + 8} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.velocity}>{`falling ${(V * 100).toFixed(1)} cm/s`}</text>
          {shownForces && (['lower', 'upper'] as const).map((w, i) => {
            const F = force(w, dir[w]);
            if (!F) return null;
            const x = i === 0 ? -2.5 : 2.5;
            return <g key={w} pointerEvents="none"><Arrow s={s} from={[x, 0]} to={[x, F * MM_PER_MN]} color={C.force} width={3.5}
              label={`${Math.abs(F).toFixed(0)} mN`} labelSide={i === 0 ? 1 : -1} /></g>;
          })}
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Cut-away of the copper pipe, to scale · cyan ⊙ out of the page, ⊗ into it: the ring's current · letters: the poles that current gives the ring{shownForces ? ' · amber: each ring’s force on the magnet' : ''}
      </p>
    </SceneCard>
  );
}

import { useMemo, useRef, useState } from 'react';
import { INFINITE_WELL, countNodes, eigenEnergies, farWallMiss, normalise, shootBox, tallWallTail } from '../../lib/physics/quantum1d.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { EnergyLine, Wall, pts, truncateAt, useSvgId } from './quantum-kit.tsx';

/**
 * An electron in a 1 nm box with walls it can never climb. One control: the
 * energy line. At each energy the wave is shot from the left wall, where it
 * must be zero, and marched across the box by the Schrödinger equation
 * (`shootBox`, Numerov). The right wall demands zero too. At almost every
 * energy the wave arrives with something left over, and inside an unclimbable
 * wall any leftover runs away (`tallWallTail`). Only at a few energies does it
 * land on zero and fit. The wave is drawn on its own energy line.
 *
 * With `id` and `target`, the scene grades itself: find the energy at which
 * the wave fits as level `target`.
 */
export interface RaiseTheLevelProps {
  id?: string;
  prompt?: string;
  /** Starting energy, eV. */
  start?: number;
  /** Graded: the level to find (1 = lowest). */
  target?: number;
  explanation?: string;
}

const L = 1;
const E_MAX = 3.7;
const SCALE = 0.42;       // eV of picture per unit of normalised ψ (nm^-1/2)
const TAIL = 0.14;        // nm of wall shown
const KAPPA = 22;         // how steeply the picture shows the runaway, per nm
const FIT = 0.05;         // |ψ at far wall| / peak that counts as landing on zero
const Y: [number, number] = [-0.95, 4.35];

export default function RaiseTheLevel({ id, prompt, start = 0, target, explanation }: RaiseTheLevelProps) {
  const graded = Boolean(id && target);
  const task = useTask(graded ? id : undefined, 'raise-the-level');
  const [E, setE] = useState(start);
  const found = useRef<Set<number>>(new Set());
  const uid = useSvgId('rtl');
  const levels = useMemo(() => eigenEnergies(INFINITE_WELL, 0, L, 3, { Emax: E_MAX, scan: 800, steps: 800 }), []);

  const shot = useMemo(() => {
    const s = shootBox(E, L, 300);
    return { xs: s.xs, psi: normalise(s.xs, s.psi), miss: farWallMiss(s), nodes: countNodes(s.psi) };
  }, [E]);
  const fits = Math.abs(shot.miss) < FIT;
  const level = shot.nodes + 1;
  if (fits) found.current.add(level);

  const end = shot.psi[shot.psi.length - 1];
  const tail = useMemo(() => {
    const xs = Array.from({ length: 41 }, (_, i) => L + (i / 40) * TAIL);
    return truncateAt(xs, xs.map((x) => E + SCALE * tallWallTail(end, x - L, KAPPA)), Y[0], Y[1]);
  }, [end, E]);

  const hit = fits && level === target;
  const sign = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;
  const miss = !fits
    ? `At ${E.toFixed(2)} eV the wave reaches the far wall at ${sign(shot.miss)} of its peak, not zero, and runs away inside the wall.`
    : `At ${E.toFixed(2)} eV the wave fits with ${shot.nodes} crossing${shot.nodes === 1 ? '' : 's'}: that is level ${level}. ${level < (target ?? 0) ? 'The next one is higher.' : 'Look lower.'}`;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Energy" value={E.toFixed(2)} unit="eV" color={C.energy} />
          <Meter label="Wave at the far wall" value={fits ? '0.00' : sign(shot.miss)} unit="of its peak" color={fits ? C.ok : C.warn} />
          <Meter label="Fits?" value={fits ? `yes, level ${level}` : 'no'} color={fits ? C.ok : C.soft} />
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(hit, { E })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-0.3, 1.3]} y={Y} height={380} axes={{ x: 'position (nm)', y: 'energy (eV)', xTicks: [0, 0.5, 1], yTicks: [0, 1, 2, 3, 4] }}
        label={`A box one nanometre wide. Energy ${E.toFixed(2)} electronvolts. ${fits ? `The wave fits as level ${level}.` : 'The wave misses the far wall.'}`}>
        {(s) => <>
          <Wall s={s} id={`${uid}-l`} x0={-0.14} x1={0} y0={Y[0]} y1={Y[1]} />
          <Wall s={s} id={`${uid}-r`} x0={L + TAIL} x1={L} y0={Y[0]} y1={Y[1]} />
          {levels.filter((_, i) => found.current.has(i + 1)).map((El, i) => (
            <g key={i}>
              <line x1={s.sx(0)} x2={s.sx(L)} y1={s.sy(El)} y2={s.sy(El)} stroke={C.ok} strokeWidth={1.2} opacity={0.7} />
              <text x={s.sx(0) + 6} y={s.sy(El) - 6} fontSize={12} fill={C.ok}>level {i + 1} · {El.toFixed(2)} eV</text>
            </g>
          ))}
          <EnergyLine s={s} E={E} from={0} to={L} solid={fits} color={fits ? C.ok : C.energy} />
          <polyline points={pts(s, shot.xs, shot.psi.map((v) => E + SCALE * v))} fill="none" stroke={C.position} strokeWidth={3} strokeLinejoin="round" />
          {!fits && <polyline points={pts(s, tail.xs, tail.ys)} fill="none" stroke={C.warn} strokeWidth={3} />}
          <circle cx={s.sx(L)} cy={s.sy(E + SCALE * end)} r={5} fill={fits ? C.ok : C.warn} />
          <Handle s={s} at={[-0.22, E]} step={0.01} color={C.energy} label="Energy line: drag up or down"
            clamp={(p) => [-0.22, Math.min(E_MAX, Math.max(0, p[1]))]}
            onChange={(p) => { setE(Math.round(p[1] * 1000) / 1000); task.touch(); }} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Electron in a 1 nm box · the wave is drawn on its energy line · dashed: the energy you chose · hatched: walls it cannot climb
      </p>
    </SceneCard>
  );
}

import { useMemo, useState } from 'react';
import { NANO, contains, ellipseLoop, enclosedLambda, fluxThroughLoop, gaussFlux, nearestOnLoop, rodsFromNano } from '../../lib/physics/gauss.ts';
import type { Vec2 } from '../../lib/physics/vectors.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { FluxTicks, RodDot, RodFieldLines, SleevePath, axesFromRim, fieldRange, fmtRange, rimOf, signed } from './gauss-kit.tsx';

/**
 * Long charged rods seen end-on, and a closed sleeve around some of them,
 * also seen end-on. Two handles: the centre moves the sleeve, the rim
 * stretches and squashes it. The orchid ticks are the field piercing the
 * sleeve; the meter is their total, the flux, integrated numerically around
 * the loop by `fluxThroughLoop` (never computed from the enclosed charge).
 *
 * Graded with `id` + `target` (nC/m to wrap): shape the sleeve so the flux
 * out of it is what that much charge gives. `covered` hides the flux meter
 * until it is solved, so the learner has to reason from the rods.
 */
export interface SqueezeTheSleeveProps {
  id?: string;
  prompt?: string;
  /** Rods, x and y in metres, q in nC per metre. */
  rods: { x: number; y: number; q: number }[];
  /** Starting sleeve: centre and semi-axes, metres. */
  start?: { cx: number; cy: number; a: number; b: number };
  /** Charge per metre the sleeve should wrap, nC/m. */
  target?: number;
  covered?: boolean;
  explanation?: string;
}

const X: [number, number] = [-2.4, 2.4];
const Y: [number, number] = [-1.3, 1.3];

export default function SqueezeTheSleeve({ id, prompt, rods: rodsIn, start = { cx: 0, cy: 0, a: 0.5, b: 0.5 }, target, covered, explanation }: SqueezeTheSleeveProps) {
  const graded = Boolean(id && target !== undefined);
  const task = useTask(graded ? id : undefined, 'squeeze-the-sleeve');
  const rods = useMemo(() => rodsFromNano(rodsIn), [JSON.stringify(rodsIn)]);
  const [c, setC] = useState<Vec2>([start.cx, start.cy]);
  const [ab, setAb] = useState<[number, number]>([start.a, start.b]);

  const loop = ellipseLoop(c[0], c[1], ab[0], ab[1]);
  const flux = fluxThroughLoop(rods, loop);
  const range = fieldRange(rods, loop);
  const want = target !== undefined ? gaussFlux(target * NANO) : 0;
  const hit = graded && Math.abs(flux - want) < 0.03 * Math.abs(want) + 2;
  const straddling = rods.some((r) => nearestOnLoop(loop, [r.x, r.y]).d < 0.05);
  const inside = rodsIn.filter((r) => contains(loop, r.x, r.y));
  const wraps = inside.length === 0 ? 'no rod at all' : `the ${inside.map((r) => signed(r.q)).join(' and ')} rod${inside.length > 1 ? 's' : ''}`;
  const enc = enclosedLambda(rods, loop) / NANO;
  const show = !covered || task.done;

  const miss = straddling
    ? `A rod sits on the sleeve itself, so only part of its field is counted: ${flux.toFixed(0)} N·m²/C.`
    : `${flux.toFixed(0)} N·m²/C leaves this sleeve: it wraps ${wraps}, ${signed(+enc.toFixed(2))} nC in each metre.`;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          <Meter label="Flux out of the sleeve" value={show ? flux.toFixed(0) : 'covered'} unit={show ? 'N·m²/C' : undefined} color={C.field} />
          <Meter label="Field piercing the sleeve" value={fmtRange(range)} unit="N/C" />
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { c, ab, flux })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={X} y={Y} height={330} equal
        label={`Rods seen end-on and a sleeve around ${wraps}. Flux ${show ? flux.toFixed(0) : 'hidden'}.`}>
        {(s) => <>
          <RodFieldLines s={s} rods={rods} />
          <SleevePath s={s} loop={loop} />
          <FluxTicks s={s} rods={rods} loop={loop} perNC={0.006} />
          {rodsIn.map((r, i) => <RodDot key={i} s={s} at={[r.x, r.y]} q={r.q} label={rodsIn.length > 1 ? signed(r.q) : undefined} />)}
          <Handle s={s} at={c} step={0.05} label="Sleeve centre: drag to move the sleeve" color={C.soft} r={7}
            onChange={(p) => { setC([Math.min(2.2, Math.max(-2.2, p[0])), Math.min(1.2, Math.max(-1.2, p[1]))]); task.touch(); }} />
          <Handle s={s} at={rimOf(c[0], c[1], ab[0], ab[1])} step={0.05} label="Sleeve rim: drag to stretch or squash" color={C.ink}
            onChange={(p) => { setAb(axesFromRim(c[0], c[1], p)); task.touch(); }} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Rods and a closed sleeve 1 m long, seen end-on; charges in nC per metre · orchid ticks: the field piercing the sleeve, out or in
      </p>
    </SceneCard>
  );
}

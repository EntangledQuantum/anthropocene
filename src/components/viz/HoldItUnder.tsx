import { useRef, useState } from 'react';
import { blockFaceForces, blockPolygon, hydrostaticPressure, pressureForceOnPolygon, type Vec2 } from '../../lib/physics/fluids.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { PushArrow, WATER_FILL, WATER_LINE, polyPath } from './fluid-kit.tsx';

/**
 * A cube held in a deep tank by your hand; drag it up and down. The water
 * pushes on every face, drawn as amber arrows whose length is the local
 * pressure: they all grow as you go deeper. The thick arrow is their sum,
 * found by integrating pressure over the surface (`pressureForceOnPolygon`),
 * and it stops growing the moment the top face goes under.
 *
 * The strip underneath keeps the score as you explore: the push on the
 * bottom face climbs without end; the net push goes flat.
 * Graded with `id`: find the shallowest place where the net push stops growing.
 */
export interface HoldItUnderProps {
  id?: string;
  prompt?: string;
  /** Cube side, m. */
  side?: number;
  explanation?: string;
}

const DEEP = 2.0;          // deepest the top face can go, m
const PER_PA = 0.02 / 1000; // arrow metres per pascal
const PER_N = 0.0009;       // net arrow metres per newton

export default function HoldItUnder({ id, prompt, side = 0.4, explanation }: HoldItUnderProps) {
  const task = useTask(id, 'hold-it-under');
  const [top, setTop] = useState(-0.3); // depth of the top face; negative = above the surface
  const trace = useRef(new Map<number, { up: number; net: number }>());

  const L = side;
  const f = blockFaceForces(top, side, side, L);
  const net = pressureForceOnPolygon(blockPolygon(0, -top, side, side), 0, undefined, undefined, L)[1];
  trace.current.set(Math.round(top * 100) / 100, { up: f.up, net });
  const fullNet = side * side * L * 1000 * 9.81;
  const under = top >= 0;

  const faces: { at: Vec2; dir: Vec2; p: number }[] = [];
  const h = side, cy = -top - h / 2;
  for (const u of [-0.3, 0, 0.3]) {
    faces.push({ at: [u * side, -top], dir: [0, -1], p: hydrostaticPressure(top) });
    faces.push({ at: [u * side, -top - h], dir: [0, 1], p: hydrostaticPressure(top + h) });
    const y = cy + u * h;
    faces.push({ at: [-side / 2, y], dir: [1, 0], p: hydrostaticPressure(-y) });
    faces.push({ at: [side / 2, y], dir: [-1, 0], p: hydrostaticPressure(-y) });
  }

  const pts = [...trace.current.entries()].sort((a, b) => a[0] - b[0]);
  const N = (x: number) => `${x.toFixed(0)} N`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Push up on the bottom" value={N(f.up)} color={C.force} />
          <Meter label="Push down on the top" value={N(f.down)} color={C.force} />
          <Meter label="Net push of the water" value={N(net)} color={C.force} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(top >= -0.005 && top <= 0.05, { top })}
          miss={under
            ? `The top face is ${top.toFixed(2)} m under. The net push here, ${N(net)}, was already ${N(fullNet)} when the top face reached the surface.`
            : `The top face is still ${(-top).toFixed(2)} m above the water. The net push is ${N(net)}, and it still grows as the block goes down.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-1.1, 1.1]} y={[-2.55, 0.5]} height={380} equal label={`A cube ${side} m on a side, its top face ${under ? `${top.toFixed(2)} m under` : `${(-top).toFixed(2)} m above`} the surface. Net push of the water ${N(net)} upward.`}>
        {(s) => <>
          <rect x={s.sx(-1.6)} y={s.sy(0)} width={s.len(3.2)} height={s.sy(-2.5) - s.sy(0)} fill={WATER_FILL} />
          <line x1={s.sx(-1.6)} x2={s.sx(1.6)} y1={s.sy(0)} y2={s.sy(0)} stroke={WATER_LINE} strokeWidth={2} />
          {[0.5, 1, 1.5, 2].map((d) => <g key={d}>
            <line x1={s.sx(-1.02)} x2={s.sx(-0.94)} y1={s.sy(-d)} y2={s.sy(-d)} stroke={C.faint} />
            <text x={s.sx(-0.92)} y={s.sy(-d) + 4} fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{d} m</text>
          </g>)}
          <text x={s.sx(-1.02)} y={s.sy(0) - 8} fontSize={12} fill={C.faint}>depth</text>
          {/* your arm */}
          <line x1={s.sx(0)} x2={s.sx(0)} y1={s.sy(0.5)} y2={s.sy(-top)} stroke={C.ghost} strokeWidth={5} strokeLinecap="round" />
          <path d={polyPath(s, blockPolygon(0, -top, side, side))} fill={C.surface} stroke={C.ink} strokeWidth={2} />
          {faces.map((q, i) => <PushArrow key={i} s={s} at={[q.at[0] - q.dir[0] * 0.01, q.at[1] - q.dir[1] * 0.01]} dir={q.dir} len={q.p * PER_PA} />)}
          {net > 1 && <Arrow s={s} from={[0.45, cy]} to={[0.45, cy + net * PER_N]} color={C.force} width={5} label={`net ${N(net)}`} labelSide={-1} />}
          <Handle s={s} at={[0, cy]} color={C.ink} step={0.02} label="Your hand on the block: drag up or down"
            onChange={(p) => { setTop(Math.min(DEEP, Math.max(-0.36, -(p[1] + h / 2)))); task.touch(); }} />
        </>}
      </Stage>
      <Stage x={[-0.4, DEEP]} y={[0, 3500]} height={170} axes={{ x: 'depth of the top face (m)', y: 'push (N)', yTicks: [0, 1000, 2000, 3000] }}
        label="Push on the bottom face and net push, against depth, where you have been">
        {(p) => {
          const line = (k: 'up' | 'net') => pts.map(([t, v], i) => `${i ? 'L' : 'M'}${p.sx(t).toFixed(1)},${p.sy(v[k]).toFixed(1)}`).join('');
          return <>
            <path d={line('up')} fill="none" stroke={C.force} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.7} />
            <path d={line('net')} fill="none" stroke={C.force} strokeWidth={3} />
            <circle cx={p.sx(top)} cy={p.sy(net)} r={4} fill={C.force} />
            <text x={p.sx(DEEP) - 4} y={p.sy(3200)} textAnchor="end" fontSize={12} fill={C.soft}>dashed: bottom face · solid: net</text>
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        A {side} m cube in fresh water · amber arrows: the water's push on each face, as long as the pressure there
      </p>
    </SceneCard>
  );
}

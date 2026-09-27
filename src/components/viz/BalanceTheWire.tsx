import { useState } from 'react';
import { forcePerLength, siUnit, type Wire } from '../../lib/physics/biot.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { CurrentMark, FieldKey, FieldLinesStage, ScaleBar } from './magnet-kit-ch28.tsx';

/**
 * Long parallel wires seen end-on, all on one line, with their field painted
 * per pixel. One wire is yours: slide it along the line and, if allowed,
 * reverse its current. Amber arrows are the push or pull on a wire per metre
 * of its length, from `forcePerLength` in biot.ts.
 *
 * Ungraded (no `id`): the force on every wire is drawn, so the third-law pair
 * and the attraction of like currents are simply there to see.
 * Graded (`id` + `probe`): make the probe wire feel no force. The tempting
 * moves are to reverse your current "to oppose" (which adds to the pull) and
 * to place it by the inverse-square rule (which overshoots): the pull falls
 * as 1/d.
 */
export interface BalanceTheWireProps {
  id?: string;
  prompt?: string;
  /** Wires on the line y = 0: position in cm, current in A (+ out of the page). */
  wires: { x: number; I: number; label: string }[];
  /** Index of the wire you move. */
  mover: number;
  /** Index of the wire whose force is shown and graded. Omit to show all. */
  probe?: number;
  /** Show a button to reverse the mover's current. */
  flip?: boolean;
  /** x range of the line, cm. */
  span?: [number, number];
  /** cm of arrow per µN/m of force. */
  arrowScale?: number;
  /** Net force that still counts as zero, as a fraction of the probe's largest single push. */
  tolerance?: number;
  explanation?: string;
}

const GAP = 2.5; // cm: wires cannot touch
const H = 320;

export default function BalanceTheWire({
  id, prompt, wires, mover, probe, flip = false, span = [-10, 14], arrowScale = 0.012, tolerance = 0.06, explanation,
}: BalanceTheWireProps) {
  const task = useTask(id && probe !== undefined ? id : undefined, 'balance-the-wire');
  const [x, setX] = useState(wires[mover].x);
  const [sign, setSign] = useState(1);

  const world = wires.map((w, i) => (i === mover ? { ...w, x, I: w.I * sign } : w));
  const si: Wire[] = world.map((w) => ({ x: w.x / 100, y: 0, I: w.I }));
  const forceOn = (i: number) => forcePerLength(si, i)[0];
  const partOn = (i: number, j: number) => forcePerLength([si[i], si[j]], 0)[0];
  const shownOn = probe !== undefined ? [probe] : world.map((_, i) => i);
  const measured = probe ?? mover;
  const net = forceOn(measured);
  const parts = world.map((_, j) => (j === measured ? 0 : partOn(measured, j)));
  const biggest = Math.max(...parts.map(Math.abs));
  const balanced = Math.abs(net) <= tolerance * biggest;

  const half = ((span[1] - span[0]) * (H - 24)) / (640 - 24) / 2;
  const toLen = (f: number) => {
    const L = f * 1e6 * arrowScale; // cm
    const cap = half * 0.8;
    return Math.max(-cap, Math.min(cap, L));
  };
  const clamp = (p: Vec): Vec => {
    let nx = Math.max(span[0] + 1, Math.min(span[1] - 1, p[0]));
    for (const [i, w] of wires.entries()) {
      if (i === mover || Math.abs(nx - w.x) >= GAP) continue;
      nx = w.x + (nx >= w.x ? GAP : -GAP);
    }
    return [nx, 0];
  };
  const word = (f: number) => (f < 0 ? 'left' : 'right');
  const maxI = Math.max(...world.map((w) => Math.abs(w.I)));
  const pm = world[measured];

  const missLine = () => {
    const bits = world.flatMap((w, j) => {
      if (j === measured) return [];
      const same = Math.sign(w.I) === Math.sign(pm.I);
      return [`${w.label} ${same ? 'pulls' : 'pushes'} it ${word(parts[j])} with ${siUnit(Math.abs(parts[j]), 'N', 2)} per metre`];
    });
    return `${pm.label} is still pushed ${word(net)} with ${siUnit(Math.abs(net), 'N', 2)} per metre: ${bits.join(', ')}.`;
  };

  return (
    <SceneCard id={id && probe !== undefined ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'end' }}>
          {flip && <button type="button" className="anth-btn" onClick={() => { setSign(-sign); task.touch(); }}>
            Reverse {wires[mover].label}’s current
          </button>}
          <Meter label={`Force on ${pm.label}, per metre`} color={C.force}
            value={Math.abs(net) < 1e-12 ? '0' : `${siUnit(Math.abs(net), 'N', 2)}`} unit={Math.abs(net) < 1e-12 ? '' : word(net)} />
          <Meter label={`${wires[mover].label} to the nearest wire`} value={`${Math.min(...world.filter((_, i) => i !== mover).map((w) => Math.abs(w.x - x))).toFixed(1)} cm`} />
        </div>
        {id && probe !== undefined && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(balanced, { x, sign })}
          miss={missLine()} hit={explanation} />}
      </div>}>
      <FieldLinesStage wires={world.map((w) => ({ x: w.x, y: 0, I: w.I }))}
        range={[Math.log2(maxI / (span[1] - span[0])), Math.log2(maxI / 1.2)]} lineStep={0.35 * maxI} stage={(capture) =>
        <Stage x={span} y={[-half, half]} height={H} equal
          label={`Parallel wires seen end on. ${world.map((w) => `${w.label}: ${Math.abs(w.I)} amperes ${w.I < 0 ? 'into' : 'out of'} the page at ${w.x.toFixed(1)} cm`).join('; ')}. Net force on ${pm.label} ${siUnit(Math.abs(net), 'N', 2)} per metre.`}>
          {(s) => { capture(s); return <>
            <line x1={s.sx(span[0])} x2={s.sx(span[1])} y1={s.sy(0)} y2={s.sy(0)} stroke={C.grid} strokeDasharray="3 6" />
            <ScaleBar s={s} at={[span[0] + 1, -half * 0.85]} length={span[1] - span[0] > 40 ? 10 : 2} label={span[1] - span[0] > 40 ? '10 cm' : '2 cm'} />
            {shownOn.map((i) => {
              const w = world[i];
              const f = forceOn(i);
              const y0 = half * 0.34;
              return <g key={i}>
                {probe !== undefined && world.map((_, j) => j === i ? null : (
                  <Arrow key={j} s={s} from={[w.x, -y0]} to={[w.x + toLen(parts[j]), -y0]} color={C.force} width={2} dash="5 4"
                    label={`from ${world[j].label}`} labelSide={-1} />
                ))}
                <Arrow s={s} from={[w.x, y0]} to={[w.x + toLen(f), y0]} color={C.force} width={4}
                  label={Math.abs(f) < 1e-12 ? undefined : siUnit(Math.abs(f), 'N/m', 2)} />
                {Math.abs(toLen(f)) < 0.3 && <circle cx={s.sx(w.x)} cy={s.sy(y0)} r={4} fill={C.force} />}
              </g>;
            })}
            <Handle s={s} at={[x, 0]} color={C.position} step={0.5} r={17} label={`Wire ${wires[mover].label}: drag it along the line`}
              onChange={(p) => { setX(clamp(p)[0]); task.touch(); }} />
            {world.map((w, i) => <CurrentMark key={i} s={s} at={[w.x, 0]} I={w.I} r={13} label={`${w.label} · ${Math.abs(w.I)} A`} />)}
          </>; }}
        </Stage>} />
      <p className="hud-label" style={{ margin: '8px 0 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span>Dot: current out of the page · cross: into it · amber: force per metre of wire{probe !== undefined ? ' (dashed: each wire’s share)' : ''}</span>
        <FieldKey />
      </p>
    </SceneCard>
  );
}

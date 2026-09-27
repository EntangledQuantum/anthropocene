import { useState } from 'react';
import { loadState, parallel, shortCircuitCurrent, type Cell } from '../../lib/physics/current.ts';
import { C, CheckBar, Handle, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { CellLoop, RAIL } from './circuit-kit-ch25.tsx';

/**
 * The same worn cell, its bulbs taken out, and a thick copper strap ready to
 * join the rails. Underneath, the (I, V) points the bulbs gave. One control:
 * mark on the current axis where you think the terminals reach zero volts.
 * Check joins the strap: the voltmeter falls to zero, the ammeter reads the
 * short-circuit current, and the cell's internal resistance glows.
 *
 * The cell does not deliver infinite current into zero resistance: its own
 * resistance sets the limit, ε/r. Graded with `id`: the mark within
 * `tolerance` (a fraction). Physics: `loadState`, `shortCircuitCurrent`.
 */
export interface ShortTheCellProps {
  id?: string;
  prompt?: string;
  emf?: number;
  r?: number;
  bulb?: number;
  /** How many bulbs' worth of points to show. */
  points?: number;
  mark0?: number;
  tolerance?: number;
  explanation?: string;
}

const AXIS_I = 4;

export default function ShortTheCell({
  id, prompt, emf = 1.5, r = 0.5, bulb = 3, points = 4, mark0 = 1.5, tolerance = 0.08, explanation,
}: ShortTheCellProps) {
  const cell: Cell = { emf, r };
  const task = useTask(id, 'short-the-cell');
  const [mark, setMark] = useState(mark0);
  const [shorted, setShorted] = useState(false);
  const Isc = shortCircuitCurrent(cell);
  const s = shorted ? loadState(cell, 0) : loadState(cell, Infinity);
  const peak = (emf * emf) / (4 * r);
  const pts = Array.from({ length: points + 1 }, (_, k) => loadState(cell, parallel(bulb, k)));
  const ok = Math.abs(mark - Isc) / Isc <= tolerance;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={id && <CheckBar verdict={task.verdict} done={task.done} label="Short it"
        onCheck={() => { setShorted(true); task.check(ok, { mark }); }}
        miss={`Shorted, the cell drives ${Isc.toFixed(2)} A and its terminals read ${s.V.toFixed(2)} V. Your mark is at ${mark.toFixed(2)} A.`}
        hit={explanation} />}>
      <CellLoop cell={cell} I={s.I} V={s.V} heat={shorted ? s.Pcell / peak : 0} Imax={AXIS_I}
        label={shorted ? `The cell is shorted: ${s.I.toFixed(2)} amps, terminals at ${s.V.toFixed(2)} volts.` : 'The cell with nothing connected, and a copper strap beside the rails.'}>
        {shorted
          ? <rect x={426} y={RAIL.top - 4} width={12} height={RAIL.bot - RAIL.top + 8} rx={3} fill={C.faint} stroke={C.ink} strokeWidth={1.5} />
          : <rect x={450} y={RAIL.top + 40} width={12} height={RAIL.bot - RAIL.top - 60} rx={3} fill={C.faint} stroke={C.soft} strokeWidth={1.5}
              transform={`rotate(28 456 ${(RAIL.top + RAIL.bot) / 2})`} />}
        <text x={470} y={RAIL.bot - 10} fontSize={13} fill={C.soft}>{shorted ? 'strap across the rails' : 'thick copper strap'}</text>
      </CellLoop>
      <Stage x={[0, AXIS_I]} y={[0, emf * 1.4]} height={180}
        axes={{ x: 'current (A)', y: 'terminal voltage (V)', yTicks: [0, 0.5, 1, 1.5, 2].filter((v) => v <= emf * 1.4) }}
        label={`The points from zero to ${points} bulbs, and your mark at ${mark.toFixed(2)} amps`}>
        {(p) => <>
          {shorted && <line x1={p.sx(0)} y1={p.sy(emf)} x2={p.sx(Isc)} y2={p.sy(0)} stroke={C.soft} strokeDasharray="5 5" />}
          {pts.map((q, k) => <g key={k}>
            <circle cx={p.sx(q.I)} cy={p.sy(q.V)} r={5} fill={C.surface} stroke={C.ink} strokeWidth={2} />
            <text x={p.sx(q.I) + 9} y={p.sy(q.V) - 8} fontSize={12} fill={C.soft}>{k === 0 ? 'no bulbs' : `${k}`}</text>
          </g>)}
          {shorted && <circle cx={p.sx(Isc)} cy={p.sy(0)} r={7} fill={C.ink} />}
          <text x={p.sx(mark)} y={p.sy(0) - 18} textAnchor="middle" fontSize={13} fill={C.position}>your mark</text>
          <Handle s={p} at={[mark, 0]} color={C.position} step={0.05} label="Your mark: drag along the current axis"
            clamp={(v: Vec) => [Math.max(0, Math.min(AXIS_I, v[0])), 0]}
            onChange={(v) => { setMark(Math.round(v[0] * 100) / 100); setShorted(false); task.touch(); }} />
        </>}
      </Stage>
    </SceneCard>
  );
}

import { useState } from 'react';
import { loadState, parallel, type Cell } from '../../lib/physics/current.ts';
import { C, Meter, SceneCard, Stage } from './scene.tsx';
import { CellLoop, Lamp, RAIL, WASTE } from './circuit-kit-ch25.tsx';

/**
 * A worn torch cell, opened up to show its pump and its internal resistance,
 * with a voltmeter on its terminals. One control: screw bulbs in, in
 * parallel, one at a time. Every bulb pulls more current, the terminals sag,
 * and every bulb already lit dims. Each (I, V) you visit lands as a point on
 * the strip underneath, and the points fall on a straight line.
 *
 * Ungraded: the payoff of the opening bet. Physics: `loadState` in current.ts.
 */
export interface SagTheBatteryProps {
  prompt?: string;
  emf?: number;
  r?: number;
  /** Resistance of one bulb, Ω. */
  bulb?: number;
  slots?: number;
}

const SLOT_X = [310, 390, 470, 550];
/** Full scale for current, A: fixed, so the axis gives nothing away. */
const AXIS_I = 4;

export default function SagTheBattery({ prompt, emf = 1.5, r = 0.5, bulb = 3, slots = 4 }: SagTheBatteryProps) {
  const cell: Cell = { emf, r };
  const [n, setN] = useState(0);
  const [seen, setSeen] = useState<number[]>([0]);
  const s = loadState(cell, parallel(bulb, n));
  const bright = (s.V * s.V) / bulb / ((emf * emf) / bulb);   // each bulb, against an ideal cell
  const peak = (emf * emf) / (4 * r);

  const go = (k: number) => {
    const next = Math.max(0, Math.min(slots, k));
    setN(next);
    setSeen((a) => (a.includes(next) ? a : [...a, next]));
  };

  return (
    <SceneCard prompt={prompt}
      footer={<div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="anth-btn" onClick={() => go(n + 1)} disabled={n >= slots}>Screw in a bulb</button>
        <button type="button" className="anth-btn" onClick={() => go(n - 1)} disabled={n <= 0}>Take one out</button>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Terminals" value={s.V.toFixed(2)} unit="V" />
          <Meter label="Current" value={s.I.toFixed(2)} unit="A" />
          <Meter label="Lost inside, Ir" value={s.lost.toFixed(2)} unit="V" color={WASTE} />
        </span>
      </div>}>
      <CellLoop cell={cell} I={s.I} V={s.V} heat={s.Pcell / peak} Imax={AXIS_I}
        label={`A ${emf} volt cell with ${n} bulb${n === 1 ? '' : 's'} in parallel. Its terminals read ${s.V.toFixed(2)} volts.`}>
        {SLOT_X.slice(0, slots).map((x, i) => {
          const lit = i < n;
          return <g key={x}>
            <line x1={x} x2={x} y1={RAIL.top} y2={168} stroke={lit ? C.soft : C.ghost} strokeWidth={2} strokeDasharray={lit ? undefined : '4 4'} />
            <line x1={x} x2={x} y1={206} y2={RAIL.bot} stroke={lit ? C.soft : C.ghost} strokeWidth={2} strokeDasharray={lit ? undefined : '4 4'} />
            {lit ? <Lamp cx={x} cy={186} glow={bright} />
              : <circle cx={x} cy={186} r={18} fill="none" stroke={C.ghost} strokeDasharray="4 4" />}
          </g>;
        })}
        <text x={RAIL.x1} y={RAIL.top - 10} textAnchor="end" fontSize={13} fill={C.soft}>{bulb} Ω bulbs, in parallel</text>
      </CellLoop>
      <Stage x={[0, AXIS_I]} y={[0, emf * 1.4]} height={170}
        axes={{ x: 'current (A)', y: 'terminal voltage (V)', yTicks: [0, 0.5, 1, 1.5, 2].filter((v) => v <= emf * 1.4) }}
        label="Terminal voltage against current, one point for every number of bulbs you have tried">
        {(p) => <>
          <line x1={p.sx(0)} x2={p.sx(AXIS_I)} y1={p.sy(emf)} y2={p.sy(emf)} stroke={C.energy} strokeDasharray="5 5" />
          <text x={p.sx(AXIS_I) - 4} y={p.sy(emf) - 6} textAnchor="end" fontSize={12} fill={C.energy}>ε = {emf} V</text>
          {seen.map((k) => {
            const q = loadState(cell, parallel(bulb, k));
            return <g key={k}>
              <circle cx={p.sx(q.I)} cy={p.sy(q.V)} r={k === n ? 7 : 5} fill={k === n ? C.ink : C.surface} stroke={C.ink} strokeWidth={2} />
              <text x={p.sx(q.I) + 10} y={p.sy(q.V) - 8} fontSize={12} fill={C.soft}>{k === 0 ? 'no bulbs' : `${k}`}</text>
            </g>;
          })}
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        A worn {emf} V cell, opened up: the pump is the emf, the zigzag is the resistance of its own chemistry
      </p>
    </SceneCard>
  );
}

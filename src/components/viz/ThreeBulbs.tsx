import { useState } from 'react';
import { CH26_BULB, CH26_EMF, readTrio, type TrioSlot } from '../../lib/physics/circuits.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { Battery, Bulb, FlowDots, Wire, amps, watts, type Pt } from './circuit-kit.tsx';

/**
 * Three identical bulbs on an ideal 6 V battery: A in line, B and C side by
 * side after it. Each bulb glows by the power it takes; cyan dots flow along
 * every wire at a speed proportional to its current, so at the junction the
 * dots arriving match the dots leaving.
 *
 * With `spare`, a fourth bulb D can be screwed into one of four empty sockets
 * (click a socket). Graded with `id`: make A brighter. Only the socket beside
 * B and C does it, because a third parallel path lowers the circuit's
 * resistance. Physics: readTrio / solveCircuit in circuits.ts (nodal analysis).
 */
export interface ThreeBulbsProps {
  id?: string;
  prompt?: string;
  /** Offer the spare bulb D and its four sockets. */
  spare?: boolean;
  explanation?: string;
}

// node positions of the drawing (see TRIO_NODE in circuits.ts)
const TOP = 96, BOT = 266, ABOVE = 40;
const X = { bat: 60, tap: 130, aL: 190, aR: 290, j: 370, c: 470, s: 570 };
const P = {
  T0: [X.bat, TOP], T1: [X.tap, TOP], T2: [X.aL, TOP], T3: [X.aR, TOP], T5: [X.j, TOP], T6: [X.c, TOP], T7: [X.s, TOP],
  P2: [X.aL, ABOVE], P3: [X.aR, ABOVE],
  B0: [X.bat, BOT], B1: [X.tap, BOT], B5: [X.j, BOT], B6: [X.c, BOT], B7: [X.s, BOT],
} as const satisfies Record<string, Pt>;
const MID = (TOP + BOT) / 2;

/** Polylines from each element's node a to node b, matching trioCircuit. */
function pathsFor(slot: TrioSlot): Record<string, readonly Pt[]> {
  const p: Record<string, readonly Pt[]> = {
    bat: [P.T0, P.B0], t01: [P.T0, P.T1], t12: [P.T1, P.T2], A: [P.T2, P.T3],
    B: [P.T5, P.B5], t56: [P.T5, P.T6], C: [P.T6, P.B6], b65: [P.B6, P.B5], b51: [P.B5, P.B1], b10: [P.B1, P.B0],
  };
  if (slot === 'series') p.D = [P.T3, P.T5]; else p.t35 = [P.T3, P.T5];
  if (slot === 'branch') Object.assign(p, { t67: [P.T6, P.T7], D: [P.T7, P.B7], b76: [P.B7, P.B6] });
  if (slot === 'battery') p.D = [P.T1, P.B1];
  if (slot === 'alongA') Object.assign(p, { p2: [P.T2, P.P2], D: [P.P2, P.P3], p3: [P.P3, P.T3] });
  return p;
}

/** Where each socket sits, and the empty branch drawn faint to reach it. */
const SOCKETS: { slot: Exclude<TrioSlot, 'none'>; at: Pt; stub?: Pt[]; name: string }[] = [
  { slot: 'series', at: [(X.aR + X.j) / 2, TOP], name: 'in line with A' },
  { slot: 'alongA', at: [(X.aL + X.aR) / 2, ABOVE], stub: [P.T2, P.P2, P.P3, P.T3], name: 'alongside A' },
  { slot: 'branch', at: [X.s, MID], stub: [P.T6, P.T7, P.B7, P.B6], name: 'beside B and C' },
  { slot: 'battery', at: [X.tap, MID], stub: [P.T1, P.B1], name: 'straight across the battery' },
];

const P_MAX = CH26_EMF ** 2 / CH26_BULB; // one bulb alone on the battery

export default function ThreeBulbs({ id, prompt, spare = false, explanation }: ThreeBulbsProps) {
  const task = useTask(spare ? id : undefined, 'three-bulbs');
  const [slot, setSlot] = useState<TrioSlot>('none');
  const r = readTrio(slot);
  const base = readTrio('none');
  const paths = pathsFor(slot);
  const currents = Object.fromEntries(Object.keys(paths).map((k) => [k, r.sol.i[k]]));

  const place = (s: TrioSlot) => { setSlot((cur) => (cur === s ? 'none' : s)); task.touch(); };

  const bulbAt = (name: string): Pt => {
    if (name === 'A') return [(X.aL + X.aR) / 2, TOP];
    if (name === 'B') return [X.j, MID];
    if (name === 'C') return [X.c, MID];
    return SOCKETS.find((s) => s.slot === slot)!.at;
  };
  const horizontal = (name: string) => name === 'A' || (name === 'D' && (slot === 'series' || slot === 'alongA'));
  const readout = (name: string) => {
    const [x, y] = bulbAt(name);
    const side = name === 'D' && slot === 'alongA';
    const vert = !horizontal(name);
    const tx = side ? x + 64 : vert ? x + 22 : x;
    const ty = side ? y - 4 : vert ? y - 12 : y + 36;
    const anchor = vert ? 'start' : 'middle';
    return <text key={`t${name}`} x={tx} y={ty} textAnchor={anchor} fontSize={12.5} fontFamily="var(--font-mono)" fill={C.soft}
      stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">
      {vert && <tspan x={tx} fontFamily="var(--font-sans)" fontSize={14} fontWeight={600} fill={C.ink}>{name}</tspan>}
      <tspan x={tx} dy={vert ? 16 : 0} fill={C.energy}>{watts(r.power[name])} W</tspan>
      <tspan x={tx} dy={15} fill={C.velocity}>{amps(r.current[name])} A</tspan>
    </text>;
  };

  const pA = r.power.A, pA0 = base.power.A;
  const miss = slot === 'none'
    ? `D is still unscrewed. A glows at ${watts(pA)} W.`
    : slot === 'battery'
      ? `A is unchanged at ${watts(pA)} W. D sits straight across the ideal battery and draws its own ${amps(r.current.D)} A; the battery now supplies ${amps(r.batteryI)} A.`
      : `A has dropped from ${watts(pA0)} W to ${watts(pA)} W: ${slot === 'series'
        ? `D in line adds resistance to the only path, and the current through A falls to ${amps(r.current.A)} A.`
        : `A and D now split the current, and A has ${(r.current.A * CH26_BULB).toFixed(1)} V across it instead of ${(base.current.A * CH26_BULB).toFixed(1)} V.`}`;

  const bulbs = ['A', 'B', 'C', ...(slot !== 'none' ? ['D'] : [])];

  return (
    <SceneCard id={spare ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
          <Meter label="Battery current" value={amps(r.batteryI)} unit="A" color={C.velocity} />
          <Meter label="Battery output" value={watts(r.batteryP)} unit="W" color={C.energy} />
          <Meter label="Bulb A" value={watts(pA)} unit="W" color={C.energy} />
          {spare && slot !== 'none' && <button type="button" className="anth-btn" style={{ marginLeft: 'auto' }}
            onClick={() => place(slot)}>Unscrew D</button>}
        </div>
        {spare && id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(slot === 'branch', { slot, pA })} miss={miss} hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 310" role="img" style={{ width: '100%', display: 'block', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Circuit. Bulb A ${watts(pA)} watts, B ${watts(r.power.B)} watts, C ${watts(r.power.C)} watts. Battery current ${amps(r.batteryI)} amps.`}>
        {spare && SOCKETS.filter((s) => s.stub && s.slot !== slot).map((s) => <Wire key={s.slot} pts={s.stub!} dashed faint />)}
        {Object.entries(paths).map(([k, pts]) => <Wire key={k} pts={pts} />)}
        <FlowDots paths={paths} currents={currents} pxPerAmp={150} />
        <Battery x={X.bat} y={MID} label={`${CH26_EMF} V`} />
        {bulbs.map((b) => <Bulb key={b} x={bulbAt(b)[0]} y={bulbAt(b)[1]} power={r.power[b]} pMax={P_MAX}
          label={b === 'D' && slot === 'alongA' ? 'D' : undefined} />)}
        {/* horizontal bulbs carry their letter below-left so the readout sits under them */}
        <text x={(X.aL + X.aR) / 2 - 30} y={TOP - 14} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.ink}>A</text>
        {slot === 'series' && <text x={(X.aR + X.j) / 2 - 30} y={TOP - 14} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.ink}>D</text>}
        {bulbs.map(readout)}
        {spare && SOCKETS.filter((s) => s.slot !== slot).map((s) => (
          <g key={s.slot} role="button" tabIndex={0} aria-label={`Screw D in ${s.name}`} style={{ cursor: 'pointer' }}
            onClick={() => place(s.slot)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); place(s.slot); } }}>
            <circle cx={s.at[0]} cy={s.at[1]} r={22} fill="transparent" />
            <circle cx={s.at[0]} cy={s.at[1]} r={15} fill={C.surface} stroke="var(--color-accent)" strokeWidth={1.8} strokeDasharray="4 3" />
            <text x={s.at[0]} y={s.at[1] + 5} textAnchor="middle" fontSize={15} fill="var(--color-accent)">+</text>
          </g>
        ))}
        {spare && slot === 'none' && <g>
          <Bulb x={608} y={28} power={0} pMax={P_MAX} off />
          <text x={586} y={33} textAnchor="end" fontSize={13} fill={C.faint}>spare D</text>
        </g>}
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Identical {CH26_BULB} Ω bulbs · ideal {CH26_EMF} V battery · glow and watts: power · cyan dots: current, speed ∝ amps
        {spare ? ' · dashed rings: empty sockets' : ''}
      </p>
    </SceneCard>
  );
}

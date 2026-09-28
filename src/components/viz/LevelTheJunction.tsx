import { useState } from 'react';
import { CH26_BULB, CH26_EMF, junctionFlows } from '../../lib/physics/circuits.ts';
import { C, CheckBar, Handle, Meter, SceneCard, useTask, type StageApi } from './scene.tsx';
import { Bulb, amps, watts } from './circuit-kit.tsx';

/**
 * The three-bulb circuit redrawn so that height is potential: every wire is
 * level (one potential along it), the battery lifts charge 6 V, and each bulb
 * is a drop. Heights make the loop rule automatic: any way round the loop you
 * climb 6 V and descend 6 V.
 *
 * The junction wire is yours to raise or lower. What sets it is the junction
 * rule: the current arriving down A must equal the current leaving down B and
 * C. Graded with `id`: balance it (it sits at a third of the battery, not half).
 * Physics: junctionFlows in circuits.ts; the balanced height is the one the
 * nodal solver finds (circuits.test.ts).
 */
export interface LevelTheJunctionProps {
  id?: string;
  prompt?: string;
  /** Starting junction potential, V. */
  start?: number;
  /** Net junction current that counts as balanced, A. */
  tolerance?: number;
  explanation?: string;
}

const Y0 = 292, K = 38;                       // px at 0 V, px per volt
const XB = 120, XA = 240, XBB = 390, XC = 540, XH = 465;
const api: StageApi = { sx: (x) => x, sy: (v) => Y0 - v * K, len: (d) => d, W: 640, H: 330, x: [0, 640], y: [0, CH26_EMF] };
const P_MAX = CH26_EMF ** 2 / CH26_BULB;
const LO = 0.4, HI = CH26_EMF - 0.4;

function Drop({ x, from, to, i, p, name }: { x: number; from: number; to: number; i: number; p: number; name: string }) {
  const y1 = api.sy(from), y2 = api.sy(to), ym = (y1 + y2) / 2;
  const w = 1.5 + 10 * Math.min(1, Math.abs(i) / 0.5);
  return <g>
    <line x1={x} x2={x} y1={y1} y2={y2} stroke={C.soft} strokeWidth={2.5} />
    <Bulb x={x} y={ym} power={p} pMax={P_MAX} />
    <text x={x - 26} y={ym + 5} textAnchor="end" fontSize={14} fontWeight={600} fill={C.ink}>{name}</text>
    {/* the current flowing down this drop, width ∝ amps */}
    <line x1={x + 30} x2={x + 30} y1={ym - 22} y2={ym + 14} stroke={C.velocity} strokeWidth={w} opacity={0.85} />
    <path d={`M${x + 30 - 5 - w / 2},${ym + 12} L${x + 30 + 5 + w / 2},${ym + 12} L${x + 30},${ym + 24} Z`} fill={C.velocity} />
    <text x={x + 44} y={ym - 2} fontSize={12.5} fontFamily="var(--font-mono)" fill={C.velocity}>{amps(i)} A</text>
    <text x={x + 44} y={ym + 14} fontSize={12.5} fontFamily="var(--font-mono)" fill={C.energy}>{watts(p)} W</text>
  </g>;
}

export default function LevelTheJunction({ id, prompt, start = 4.5, tolerance = 0.01, explanation }: LevelTheJunctionProps) {
  const task = useTask(id, 'level-the-junction');
  const [vm, setVm] = useState(start);
  const f = junctionFlows(vm);
  const yj = api.sy(vm), yTop = api.sy(CH26_EMF);
  const ok = Math.abs(f.net) <= tolerance;
  const state = ok ? 'balanced: as much leaves as arrives'
    : f.net < 0 ? `draining: ${amps(-f.net)} A more leaves than arrives` : `piling up: ${amps(f.net)} A more arrives than leaves`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Junction potential" value={vm.toFixed(2)} unit="V" color={C.position} />
          <Meter label="Arriving through A" value={amps(f.inA)} unit="A" color={C.velocity} />
          <Meter label="Leaving through B and C" value={amps(f.out)} unit="A" color={C.velocity} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(ok, { vm })}
          miss={`${amps(f.inA)} A arrives at the junction and ${amps(f.out)} A leaves it: it would ${f.net < 0 ? 'lose' : 'gain'} charge at ${amps(Math.abs(f.net))} A every second.`}
          hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 330" role="img" style={{ width: '100%', display: 'block', touchAction: 'none', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Potential picture of the circuit. Junction at ${vm.toFixed(2)} volts. ${amps(f.inA)} amps arrive, ${amps(f.out)} amps leave.`}>
        {/* potential scale */}
        {Array.from({ length: CH26_EMF + 1 }, (_, v) => <g key={v}>
          <line x1={58} x2={600} y1={api.sy(v)} y2={api.sy(v)} stroke={C.grid} />
          <text x={50} y={api.sy(v) + 4} textAnchor="end" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{v}</text>
        </g>)}
        <text x={14} y={api.sy(CH26_EMF) - 18} fontSize={13} fill={C.soft}>potential (V)</text>

        {/* bottom wire at 0 V, top wire at 6 V, the junction wire at vm */}
        <line x1={XB} x2={XC} y1={Y0} y2={Y0} stroke={C.soft} strokeWidth={2.5} />
        <line x1={XB} x2={XA} y1={yTop} y2={yTop} stroke={C.soft} strokeWidth={2.5} />
        <line x1={XA} x2={XC} y1={yj} y2={yj} stroke={C.position} strokeWidth={3.5} />

        {/* the battery: a lift of 6 V */}
        <line x1={XB} x2={XB} y1={Y0} y2={yTop} stroke={C.soft} strokeWidth={2.5} />
        <rect x={XB - 18} y={(Y0 + yTop) / 2 - 12} width={36} height={24} fill={C.surface} />
        <line x1={XB - 16} x2={XB + 16} y1={(Y0 + yTop) / 2 - 6} y2={(Y0 + yTop) / 2 - 6} stroke={C.ink} strokeWidth={3} />
        <line x1={XB - 8} x2={XB + 8} y1={(Y0 + yTop) / 2 + 6} y2={(Y0 + yTop) / 2 + 6} stroke={C.ink} strokeWidth={5} />
        <text x={XB + 24} y={(Y0 + yTop) / 2 + 5} fontSize={13} fill={C.ink}>battery</text>

        <Drop x={XA} from={CH26_EMF} to={vm} i={f.inA} p={f.pA} name="A" />
        <Drop x={XBB} from={vm} to={0} i={f.outB} p={f.pB} name="B" />
        <Drop x={XC} from={vm} to={0} i={f.outC} p={f.pC} name="C" />

        <circle cx={XA} cy={yj} r={5} fill={ok ? C.ok : C.warn} />
        <text x={XA + 12} y={vm >= CH26_EMF / 2 ? yj + 22 : yj - 10} fontSize={13} fill={ok ? C.ok : C.warn}
          stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">junction {state}</text>

        <Handle s={api} at={[XH, vm]} step={0.1} color={C.position} label="Junction potential: drag up or down"
          clamp={(p) => [XH, p[1]]}
          onChange={(p) => { setVm(Math.round(Math.max(LO, Math.min(HI, p[1])) * 20) / 20); task.touch(); }} />
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Height is potential · the violet wire is the junction joining A to B and C · identical {CH26_BULB} Ω bulbs, ideal {CH26_EMF} V battery
      </p>
    </SceneCard>
  );
}

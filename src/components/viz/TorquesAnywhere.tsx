import { useState } from 'react';
import { plankForces, torqueLedger, type Plank } from '../../lib/physics/statics.ts';
import { C, CheckBar, Handle, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { Painter, PlankBar, PlankForce, PlankTicks, Trestle } from './plank-ch11.tsx';

/**
 * The plank and painter at rest, and one thing to move: the point you take
 * torques about. Under the picture is the ledger a person would write, one
 * line per force, from `torqueLedger` in statics.ts. The two trestle pushes
 * are unknown until the point sits on the line of action of one of them;
 * then that push has no arm, drops out, and the other follows from a single
 * line of arithmetic. Once solved, every push is shown and the ledger's sum
 * reads zero wherever the point is dragged.
 */
export interface TorquesAnywhereProps {
  id?: string;
  prompt?: string;
  plank?: Plank;
  painterMass?: number;
  painterX?: number;
  xA?: number;
  xB?: number;
  start?: [number, number];
  explanation?: string;
}

const ON_LINE = 0.06;

export default function TorquesAnywhere({
  id, prompt, plank = { mass: 30, length: 4 }, painterMass = 60, painterX = 2.8, xA = 0.5, xB = 3, start = [1.3, 1.7], explanation,
}: TorquesAnywhereProps) {
  const task = useTask(id, 'torques-anywhere');
  const [ref, setRef] = useState<Vec>(start);
  const forces = plankForces(plank, { label: 'painter', mass: painterMass, x: painterX }, xA, xB);
  const ledger = torqueLedger(ref, forces);
  const known = task.done || !id;
  const unknown = (label: string) => !known && label.includes('trestle');
  const onA = Math.abs(ref[0] - xA) < ON_LINE, onB = Math.abs(ref[0] - xB) < ON_LINE;
  const armA = Math.abs(ref[0] - xA), armB = Math.abs(ref[0] - xB);
  const sum = ledger.reduce((a, l) => a + l.torque, 0);
  const push = (label: string) => forces.find((f) => f.label === label)!.vec[1];
  const sign = (t: number) => (Math.abs(t) < 0.05 ? '0' : `${t > 0 ? '+' : '−'}${Math.abs(t).toFixed(0)}`);
  const lines = forces.map((f) => f.at![0]);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={id ? <CheckBar verdict={task.verdict} done={task.done}
        onCheck={() => task.check(onA || onB, { ref })}
        miss={`About this point both trestle pushes have arms, ${armA.toFixed(2)} m and ${armB.toFixed(2)} m: one equation, two unknowns.`}
        hit={<>{explanation} {onB ? `About the right trestle: the left push is ${push('left trestle').toFixed(0)} N.` : `About the left trestle: the right push is ${push('right trestle').toFixed(0)} N.`}</>} /> : undefined}>
      <Stage x={[-0.3, plank.length + 0.4]} y={[-0.36, 2.2]} height={300} equal
        label={`Plank on two trestles with a painter. The torque reference point is at ${ref[0].toFixed(2)} metres.`}>
        {(s) => <>
          <line x1={0} x2={s.W} y1={s.sy(0)} y2={s.sy(0)} stroke={C.rule} strokeWidth={2} />
          <PlankTicks s={s} length={plank.length} />
          {lines.map((x, i) => <line key={i} x1={s.sx(x)} x2={s.sx(x)} y1={s.sy(2.15)} y2={s.sy(-0.02)} stroke={C.ghost} strokeDasharray="4 5" />)}
          <Trestle s={s} x={xA} />
          <Trestle s={s} x={xB} />
          {forces.map((f) => {
            const x = f.at![0];
            const txt = unknown(f.label!) ? '?' : `${Math.abs(f.vec[1]).toFixed(0)} N`;
            const side = f.label === 'right trestle' ? (painterX > xB ? -1 : 1) : f.label === 'painter' ? (painterX > xB ? 1 : -1) : -1;
            return <PlankForce key={f.id} s={s} x={x} push={f.vec[1]} label={f.label === 'plank' ? `plank ${txt}` : txt} side={side} />;
          })}
          <PlankBar s={s} length={plank.length} />
          <Painter s={s} x={painterX} label={`${painterMass} kg`} />
          <line x1={s.sx(Math.min(ref[0], ...lines))} x2={s.sx(Math.max(ref[0], ...lines))} y1={s.sy(ref[1])} y2={s.sy(ref[1])} stroke={C.position} strokeDasharray="3 4" />
          {lines.map((x, i) => <circle key={i} cx={s.sx(x)} cy={s.sy(ref[1])} r={3} fill={C.position} />)}
          <Handle s={s} at={ref} step={0.05} color={C.position} label="Torque reference point: drag anywhere"
            onChange={(p) => { setRef([Math.max(-0.2, Math.min(plank.length + 0.3, p[0])), Math.max(-0.2, Math.min(2.1, p[1]))]); task.touch(); }} />
        </>}
      </Stage>
      <table className="readout" style={{ width: '100%', marginTop: 10, fontSize: 14, borderCollapse: 'collapse' }}>
        <thead><tr style={{ color: C.faint, textAlign: 'right' }}>
          <th style={{ textAlign: 'left', fontWeight: 400 }}>Torque about the point</th><th style={{ fontWeight: 400 }}>force</th><th style={{ fontWeight: 400 }}>arm</th><th style={{ fontWeight: 400 }}>torque, N·m</th>
        </tr></thead>
        <tbody>
          {ledger.map((l, i) => {
            const f = forces[i];
            const hidden = unknown(l.label);
            const arm = Math.abs(ref[0] - f.at![0]);
            return <tr key={l.id} style={{ textAlign: 'right', borderTop: '1px solid var(--color-rule)' }}>
              <td style={{ textAlign: 'left', color: C.soft, fontFamily: 'var(--font-sans)' }}>{l.label}</td>
              <td style={{ color: C.force }}>{hidden ? '?' : `${Math.abs(f.vec[1]).toFixed(0)} N`}</td>
              <td style={{ color: C.position }}>{arm.toFixed(2)} m</td>
              <td>{hidden ? (arm < ON_LINE ? '0' : `? × ${arm.toFixed(2)}`) : sign(l.torque)}</td>
            </tr>;
          })}
          <tr style={{ textAlign: 'right', borderTop: '1px solid var(--color-rule-bright)' }}>
            <td style={{ textAlign: 'left', color: C.ink, fontFamily: 'var(--font-sans)' }}>sum</td><td /><td />
            <td style={{ color: C.ink }}>{known ? sign(sum) : '0, since it is at rest'}</td>
          </tr>
        </tbody>
      </table>
      <p className="hud-label" style={{ margin: '8px 0 0' }}>anticlockwise torque counts positive · dashed: each force’s line of action</p>
    </SceneCard>
  );
}

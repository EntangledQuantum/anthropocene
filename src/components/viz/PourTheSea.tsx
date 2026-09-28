import { useState } from 'react';
import { bandVelocity, bestFilling, electronsIn, occupiedK, ringShells, seaCurrent } from '../../lib/physics/solids.ts';
import { Arrow, C, CheckBar, Meter, SceneCard, Stage, useTask } from './scene.tsx';

/**
 * One band of a 13-atom ring, drawn state by state. Each state is a way of
 * moving through the crystal: left of centre it moves left, right of centre
 * right, fastest half-way up the band. Each holds two electrons. Pour in
 * electrons and they fill from the bottom; every one of them is moving,
 * yet the arrows cancel and no current flows. Hold the push and every
 * electron shifts one state to the right. That tips the balance, unless
 * there is no empty state to shift into.
 *
 * Graded with `id`: find the filling at which the push drives the most
 * current. Physics: occupiedK / seaCurrent / bestFilling in
 * src/lib/physics/solids.ts.
 */
export interface PourTheSeaProps {
  id?: string;
  prompt?: string;
  explanation?: string;
}

const N = 13;
const SHELLS = ringShells(N).length;
const DK = (2 * Math.PI) / N;
const KS = Array.from({ length: N }, (_, i) => (i - (N - 1) / 2) * DK);
const E = (k: number) => -2 * Math.cos(k);
const wrap = (k: number) => {
  let x = k;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x <= -Math.PI) x += 2 * Math.PI;
  return x;
};

export default function PourTheSea({ id, prompt, explanation }: PourTheSeaProps) {
  const task = useTask(id, 'pour-the-sea');
  const [filled, setFilled] = useState(1);
  const [push, setPush] = useState(false);
  const steps = push ? 1 : 0;
  const occ = occupiedK(N, filled, steps).map(wrap);
  const count = (k: number) => occ.filter((q) => Math.abs(q - k) < 1e-6).length;
  const I = seaCurrent(N, filled, steps);
  const ne = electronsIn(N, filled);
  const pour = (d: number) => { setFilled((f) => Math.min(SHELLS, Math.max(0, f + d))); task.touch(); };
  const hold = (on: boolean) => setPush(on);
  const Ipushed = seaCurrent(N, filled, 1);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={() => pour(1)} disabled={filled >= SHELLS}>Pour in electrons</button>
          <button type="button" className="anth-btn" onClick={() => pour(-1)} disabled={filled <= 0}>Drain some</button>
          <button type="button" className="anth-btn"
            style={{ borderColor: push ? C.force : undefined, color: push ? C.force : undefined }}
            onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); hold(true); }}
            onPointerUp={() => hold(false)} onPointerCancel={() => hold(false)}
            onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); hold(true); } }}
            onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') hold(false); }}>
            {push ? 'Pushing…' : 'Hold to push'}
          </button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Electrons per atom" value={(ne / N).toFixed(2)} />
            <Meter label="Current" value={Math.abs(I) < 1e-9 ? '0.0' : I.toFixed(1)} unit="units" color={C.velocity} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(filled === bestFilling(N), { filled })}
          miss={filled === SHELLS
            ? 'Two per atom fills every state. The push shifts the sea onto itself, and the current stays at 0.0.'
            : `With ${(ne / N).toFixed(2)} electrons per atom, the push drives ${Ipushed.toFixed(1)} units. Another filling drives more.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-Math.PI - 0.25, Math.PI + 0.25]} y={[-2.6, 2.9]} height={330} label={`A band holding ${ne} electrons, ${push ? 'pushed' : 'not pushed'}; current ${I.toFixed(1)}`}
        axes={{ y: 'energy (eV)', xTicks: [], yTicks: [-2, -1, 0, 1, 2] }}>
        {(s) => {
          const curve: string[] = [];
          for (let i = 0; i <= 120; i++) { const k = -Math.PI + (2 * Math.PI * i) / 120; curve.push(`${s.sx(k).toFixed(1)},${s.sy(E(k)).toFixed(1)}`); }
          return <>
            <polyline points={curve.join(' ')} fill="none" stroke={C.energy} strokeWidth={1.5} opacity={0.5} />
            <text x={s.sx(-Math.PI)} y={s.sy(-2.45)} fontSize={13} fill={C.soft}>← states moving left</text>
            <text x={s.sx(Math.PI)} y={s.sy(-2.45)} textAnchor="end" fontSize={13} fill={C.soft}>states moving right →</text>
            {KS.map((k) => {
              const n = count(k);
              const x = s.sx(k), y = s.sy(E(k));
              const v = bandVelocity(k);
              return <g key={k}>
                <rect x={x - 15} y={y - 9} width={30} height={18} rx={9} fill={C.surface} stroke={C.rule} strokeWidth={1.2} />
                {[0, 1].map((j) => <circle key={j} cx={x - 6 + 12 * j} cy={y} r={4.6}
                  fill={j < n ? C.velocity : 'none'} stroke={j < n ? C.velocity : C.ghost} strokeWidth={1.3} />)}
                {n > 0 && Math.abs(v) > 0.05 && <Arrow s={s} from={[k, E(k) + 0.32]} to={[k + 0.2 * v, E(k) + 0.32]} color={C.velocity} width={2} />}
              </g>;
            })}
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Each pill is one state of motion and holds two electrons · cyan arrows: how fast and which way the electrons in it move
      </p>
    </SceneCard>
  );
}

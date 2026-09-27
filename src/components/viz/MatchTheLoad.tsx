import { useState } from 'react';
import { loadPower, loadState, type Cell } from '../../lib/physics/current.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { CellLoop, Lamp, RAIL, WASTE, viewStage } from './circuit-kit-ch25.tsx';

/**
 * The worn cell driving one lamp whose resistance you choose. One control:
 * slide the contact along the load's resistance track. The lamp glows with
 * the power it takes; a bar splits the pump's output into what reaches the
 * lamp and what heats the cell; every resistance you try leaves a dot on the
 * power strip underneath.
 *
 * Less resistance draws more current but spends more of it inside the cell;
 * more resistance wastes less but draws too little. The peak sits at R = r.
 * Graded with `id`: R within `tolerance` (a fraction) of r.
 * Physics: `loadState`, `loadPower` in src/lib/physics/current.ts.
 */
export interface MatchTheLoadProps {
  id?: string;
  prompt?: string;
  emf?: number;
  r?: number;
  R0?: number;
  tolerance?: number;
  explanation?: string;
}

const R_MAX = 3, R_MIN = 0.05, TX0 = 290, TX1 = 590, TY = 252;

export default function MatchTheLoad({
  id, prompt, emf = 1.5, r = 0.5, R0 = 2.5, tolerance = 0.12, explanation,
}: MatchTheLoadProps) {
  const cell: Cell = { emf, r };
  const task = useTask(id, 'match-the-load');
  const [R, setR] = useState(R0);
  const [tried, setTried] = useState<number[]>([R0]);
  const s = loadState(cell, R);
  const peak = (emf * emf) / (4 * r);
  const pumpMax = (emf * emf) / r;
  const tx = (v: number) => TX0 + ((v - 0) / R_MAX) * (TX1 - TX0);
  const vs = viewStage(300);
  const ok = Math.abs(R - r) / r <= tolerance;
  const lower = loadPower(cell, R * 0.97) > s.Pload;

  const set = (p: Vec) => {
    const v = Math.round(Math.max(R_MIN, Math.min(R_MAX, ((p[0] - TX0) / (TX1 - TX0)) * R_MAX)) * 100) / 100;
    setR(v);
    setTried((a) => (a.some((x) => Math.abs(x - v) < 0.02) ? a : [...a, v]));
    task.touch();
  };

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <span style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Load" value={R.toFixed(2)} unit="Ω" />
          <Meter label="Current" value={s.I.toFixed(2)} unit="A" />
          <Meter label="Power into the lamp" value={s.Pload.toFixed(3)} unit="W" color={C.energy} />
          <Meter label="Heating the cell" value={s.Pcell.toFixed(3)} unit="W" color={WASTE} />
        </span>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(ok, { R })}
          miss={`At ${R.toFixed(2)} Ω the lamp takes ${s.Pload.toFixed(3)} W, and from here the power rises as the resistance goes ${lower ? 'down' : 'up'}.`}
          hit={explanation} />}
      </div>}>
      <CellLoop cell={cell} I={s.I} V={s.V} heat={s.Pcell / peak} Imax={4}
        label={`The cell driving a ${R.toFixed(2)} ohm lamp, which takes ${s.Pload.toFixed(2)} watts.`}>
        <line x1={440} x2={440} y1={RAIL.top} y2={132} stroke={C.soft} strokeWidth={2} />
        <line x1={440} x2={440} y1={172} y2={RAIL.bot} stroke={C.soft} strokeWidth={2} />
        <Lamp cx={440} cy={152} glow={s.Pload / peak} r={20} />
        <text x={470} y={157} fontSize={13} fill={C.soft} fontFamily="var(--font-mono)">R = {R.toFixed(2)} Ω</text>
        {/* the resistance track */}
        <line x1={TX0} x2={TX1} y1={TY} y2={TY} stroke={C.rule} strokeWidth={6} strokeLinecap="round" />
        {[0, 1, 2, 3].map((v) => <g key={v}>
          <line x1={tx(v)} x2={tx(v)} y1={TY + 6} y2={TY + 12} stroke={C.faint} />
          <text x={tx(v)} y={TY - 10} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{v} Ω</text>
        </g>)}
        <Handle s={vs} at={[tx(R), TY]} step={(0.01 * (TX1 - TX0)) / R_MAX} label="Load resistance: slide the contact"
          clamp={(p) => [p[0], TY]} onChange={set} />
      </CellLoop>
      <svg viewBox="0 0 640 44" style={{ width: '100%', display: 'block', fontFamily: 'var(--font-sans)' }} role="img"
        aria-label={`The pump delivers ${s.Ppump.toFixed(2)} watts: ${s.Pload.toFixed(2)} to the lamp, ${s.Pcell.toFixed(2)} heating the cell.`}>
        <text x={12} y={27} fontSize={13} fill={C.soft}>the pump’s output</text>
        <rect x={140} y={12} width={480} height={20} rx={3} fill="none" stroke={C.rule} />
        <rect x={140} y={12} width={(480 * s.Pload) / pumpMax} height={20} fill={C.energy} opacity={0.75} />
        <rect x={140 + (480 * s.Pload) / pumpMax} y={12} width={(480 * s.Pcell) / pumpMax} height={20} fill={WASTE} opacity={0.75} />
      </svg>
      <Stage x={[0, R_MAX]} y={[0, peak * 1.25]} height={150} axes={{ x: 'load resistance (Ω)', y: 'power into the lamp (W)' }}
        label="Power into the lamp for every resistance you have tried">
        {(p) => tried.map((v) => <circle key={v} cx={p.sx(v)} cy={p.sy(loadPower(cell, v))} r={v === R ? 6 : 4}
          fill={v === R ? C.energy : C.surface} stroke={C.energy} strokeWidth={2} />)}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        The same worn cell, ε = {emf} V, r = {r} Ω · aqua: power reaching the lamp · rose: power heating the cell
      </p>
    </SceneCard>
  );
}

import { useEffect, useRef, useState } from 'react';
import { engineLedger, smallestRunningDump } from '../../lib/physics/entropy.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';

/**
 * An engine between a hot bath and a cold one. Each cycle it takes 1000 J
 * from the hot side; you choose how much it dumps into the cold side, and the
 * rest comes out as work turning the flywheel.
 *
 * Under the picture is the entropy ledger. Heat leaving the hot bath takes
 * Qh/Th with it, heat arriving in the cold bath brings Qc/Tc, and work carries
 * none. When the total would fall, the engine stalls: the flywheel stops and
 * the work arrow goes dead. The widths of the three arrows are the three
 * energies, so the first law is visible as arrows that add up.
 *
 * Graded with `id`: shrink the dump to the smallest that still runs.
 * Physics: `engineLedger` in src/lib/physics/entropy.ts.
 */
export interface ShrinkTheDumpProps {
  id?: string;
  prompt?: string;
  /** Hot and cold bath temperatures, K. */
  Th?: number;
  Tc?: number;
  hotLabel?: string;
  coldLabel?: string;
  /** Starting dump, J. */
  start?: number;
  explanation?: string;
}

const QH = 1000;
const STEP = 5;
const PX_PER_J = 0.036;

export default function ShrinkTheDump({
  id, prompt, Th = 600, Tc = 300, hotLabel = 'hot bath', coldLabel = 'cold bath', start = 800, explanation,
}: ShrinkTheDumpProps) {
  const task = useTask(id, 'shrink-the-dump');
  const [Qc, setQc] = useState(start);
  const L = engineLedger(QH, Qc, Th, Tc);
  const wheel = useRef<SVGGElement>(null);
  const speed = useRef(0);
  speed.current = L.runs ? L.W / QH : 0;

  useEffect(() => {
    let raf = 0, last = performance.now(), ang = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ang = (ang + dt * 360 * speed.current) % 360;
      wheel.current?.setAttribute('transform', `rotate(${ang.toFixed(1)})`);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const best = smallestRunningDump(QH, Th, Tc, STEP);
  const hit = L.runs && Qc - best <= 2 * STEP;
  const f = (v: number) => v.toFixed(2);
  const miss = !L.runs
    ? `A ${Qc} J dump brings ${f(L.dSCold)} J/K into the ${coldLabel}, but the ${hotLabel} lost ${f(-L.dSHot)} J/K. The engine stalls.`
    : `It runs, with ${Qc} J going to the ${coldLabel} and ${f(L.dSTotal)} J/K to spare in the ledger. More of the heat could be work.`;

  const ex = 320, ey = 162, er = 34;
  const wQh = QH * PX_PER_J, wQc = Math.max(Qc * PX_PER_J, 1), wW = Math.max(L.W * PX_PER_J, 1);
  const workColor = L.runs ? C.force : C.faint;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 15, color: C.soft }}>
            Heat dumped
            <input type="range" min={0} max={QH} step={STEP} value={Qc} aria-label={`Heat dumped into the ${coldLabel} each cycle, joules`}
              onChange={(e) => { setQc(+e.target.value); task.touch(); }} style={{ width: 180 }} />
            <span className="readout" style={{ minWidth: 62 }}>{Qc} J</span>
          </label>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <Meter label={`${hotLabel} loses`} value={f(-L.dSHot)} unit="J/K" />
            <Meter label={`${coldLabel} gains`} value={f(L.dSCold)} unit="J/K" />
            <Meter label="Total entropy" value={`${L.dSTotal >= 0 ? '+' : '−'}${f(Math.abs(L.dSTotal))}`} unit="J/K" color={L.runs ? C.ok : C.warn} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { Qc })} miss={miss} hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 320" role="img" style={{ width: '100%', display: 'block', fontFamily: 'var(--font-sans)' }}
        aria-label={`Engine between ${hotLabel} at ${Th} K and ${coldLabel} at ${Tc} K. Takes ${QH} J, dumps ${Qc} J, ${L.runs ? `delivers ${L.W} J of work` : 'stalled'}.`}>
        {/* baths */}
        <rect x={130} y={8} width={380} height={58} rx={6} fill="color-mix(in oklab, var(--color-rose) 16%, var(--color-surface))" stroke={C.rule} />
        <text x={146} y={34} fontSize={15} fill={C.ink}>{hotLabel}</text>
        <text x={146} y={54} fontSize={13} fill={C.soft} fontFamily="var(--font-mono)">{Th} K</text>
        <rect x={130} y={254} width={380} height={58} rx={6} fill="color-mix(in oklab, var(--color-cyan) 12%, var(--color-surface))" stroke={C.rule} />
        <text x={146} y={280} fontSize={15} fill={C.ink}>{coldLabel}</text>
        <text x={146} y={300} fontSize={13} fill={C.soft} fontFamily="var(--font-mono)">{Tc} K</text>

        {/* heat in */}
        <line x1={ex} x2={ex} y1={66} y2={ey - er - 12} stroke={C.energy} strokeWidth={wQh} />
        <path d={`M${ex - wQh / 2 - 6},${ey - er - 12}L${ex + wQh / 2 + 6},${ey - er - 12}L${ex},${ey - er}Z`} fill={C.energy} />
        <text x={ex + wQh / 2 + 12} y={100} fontSize={14} fill={C.energy} fontWeight={600}>{QH} J of heat in</text>

        {/* heat dumped */}
        {Qc > 0 && <>
          <line x1={ex} x2={ex} y1={ey + er} y2={242} stroke={C.energy} strokeWidth={wQc} />
          <path d={`M${ex - wQc / 2 - 6},${242}L${ex + wQc / 2 + 6},${242}L${ex},${254}Z`} fill={C.energy} />
        </>}
        <text x={ex + Math.max(wQc, 2) / 2 + 12} y={226} fontSize={14} fill={C.energy} fontWeight={600}>{Qc} J dumped</text>

        {/* work out */}
        {L.W > 0 && <>
          <line x1={ex + er} x2={520} y1={ey} y2={ey} stroke={workColor} strokeWidth={wW} strokeDasharray={L.runs ? undefined : '6 6'} />
          <path d={`M520,${ey - wW / 2 - 6}L520,${ey + wW / 2 + 6}L534,${ey}Z`} fill={workColor} />
        </>}
        <text x={440} y={ey - Math.max(wW, 2) / 2 - 10} fontSize={14} fill={workColor} fontWeight={600} textAnchor="middle">
          {L.runs ? `${L.W} J of work` : 'stalled'}
        </text>

        {/* the engine: a flywheel */}
        <circle cx={ex} cy={ey} r={er} fill={C.surface} stroke={L.runs ? C.ink : C.warn} strokeWidth={2.5} />
        <g transform={`translate(${ex},${ey})`}>
          <g ref={wheel}>
            {[0, 60, 120].map((a) => (
              <line key={a} x1={-er + 6} x2={er - 6} y1={0} y2={0} stroke={C.soft} strokeWidth={2} transform={`rotate(${a})`} />
            ))}
          </g>
        </g>
        <text x={ex - er - 10} y={ey + 5} fontSize={14} fill={C.soft} textAnchor="end">engine</text>
        <text x={620} y={ey + 5} fontSize={14} fill={C.soft} textAnchor="end">{L.runs ? `${(L.efficiency * 100).toFixed(1)}%` : ''}</text>
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Arrow widths are energy per cycle · heat in aqua, work in amber · the engine ends each cycle as it began, so only the baths change entropy
      </p>
    </SceneCard>
  );
}

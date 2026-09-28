import { useRef, useState } from 'react';
import { CH30_RL, CH30_SPARK, coilEnergy, energyFraction, rlFinal, rlStep } from '../../lib/physics/inductance.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { Battery, Wire } from './circuit-kit.tsx';
import { Coil, FlowDots, KnifeSwitch, Lamp, glowOf, useFrame, useSetter, type Pt } from './coil-kit-ch30.tsx';

/**
 * A 24 H coil and a lamp on a battery, and a switch you close and then open.
 * The coil will not let its current stop, so the moment the switch opens the
 * current jumps the gap as a spark, carrying off everything the field held.
 * Graded: open it when the field holds a given share of its full energy.
 * Everyone's first instinct is half the current; that is a quarter of the energy.
 *
 * Physics: `rlStep`, `coilEnergy`, `energyFraction` in src/lib/physics/inductance.ts.
 */
export interface LetTheCoilGoProps {
  id?: string;
  prompt?: string;
  /** Share of the full-current field energy to release, 0..1. */
  target?: number;
  tolerance?: number;
  explanation?: string;
}

const TOP = 60, BOT = 226, XB = 60, XS1 = 136, XS2 = 190, X1 = 270, X2 = 430, XL = 584;
const PATH: Record<string, readonly Pt[]> = { loop: [[XB, BOT], [XB, TOP], [XL, TOP], [XL, BOT], [XB, BOT]] };
/** The spark gap's resistance while it conducts, Ω: the current dies in about 0.1 s. */
const R_GAP = 228;

type Phase = 'idle' | 'closed' | 'released';

export default function LetTheCoilGo({ id, prompt, target = CH30_SPARK.target, tolerance = CH30_SPARK.tolerance, explanation }: LetTheCoilGoProps) {
  const task = useTask(id, 'let-the-coil-go');
  const { emf, R } = CH30_RL;
  const L = CH30_SPARK.L;
  const Ifull = rlFinal(emf, R);
  const Ufull = coilEnergy(L, Ifull);
  const run = useRef({ phase: 'idle' as Phase, t: 0, I: 0, since: 0 });
  const currents = useRef<Record<string, number>>({ loop: 0 });
  const glow = useSetter(), field = useSetter();
  const spark = useRef<SVGGElement>(null);
  const halo = useRef<SVGCircleElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [opened, setOpened] = useState<{ I: number; t: number } | null>(null);
  const [shown, setShown] = useState({ I: 0, t: 0 });
  const last = useRef(0);

  useFrame((dt, now) => {
    const r = run.current;
    if (r.phase === 'closed') { r.I = rlStep(r.I, dt, emf, R, L); r.t += dt; }
    if (r.phase === 'released') { r.I = rlStep(r.I, dt, 0, R + R_GAP, L); r.since += dt; }
    currents.current.loop = r.I;
    glow.current?.(glowOf(r.I, Ifull));
    field.current?.(r.I / Ifull);
    const s = spark.current;
    if (s) {
      const show = r.phase === 'released' && opened ? energyFraction(opened.I, Ifull) * Math.max(0, 1 - r.since / 0.9) : 0;
      s.setAttribute('opacity', Math.min(1, show * 2.2).toFixed(3));
      halo.current?.setAttribute('r', (8 + 40 * Math.sqrt(show)).toFixed(1));
    }
    if (now - last.current > 120) { last.current = now; setShown({ I: r.I, t: r.t }); }
  });

  const act = () => {
    const r = run.current;
    if (r.phase === 'idle') { r.phase = 'closed'; setPhase('closed'); task.touch(); return; }
    if (r.phase === 'closed') { r.phase = 'released'; r.since = 0; setOpened({ I: r.I, t: r.t }); setPhase('released'); return; }
    run.current = { phase: 'idle', t: 0, I: 0, since: 0 };
    setOpened(null); setPhase('idle'); task.touch();
  };

  const f = opened ? energyFraction(opened.I, Ifull) : 0;
  const U = opened ? coilEnergy(L, opened.I) : 0;
  const pct = (v: number) => `${Math.round(100 * v)}%`;
  const BX = 250, BW = 250;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={act}>
            {phase === 'idle' ? 'Close the switch' : phase === 'closed' ? 'Open the switch' : 'Start over'}
          </button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Since closing" value={(opened ? opened.t : shown.t).toFixed(2)} unit="s" />
            <Meter label="Current" value={shown.I.toFixed(3)} unit="A" color={C.velocity} />
            <Meter label="Released" value={opened ? U.toFixed(2) : '–'} unit="J" color={C.energy} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(!!opened && Math.abs(f - target) <= tolerance, { f })}
          miss={!opened
            ? 'The switch has not been opened yet, so nothing has been released.'
            : `You opened at ${opened.I.toFixed(2)} A, ${pct(opened.I / Ifull)} of full current. The field held ${U.toFixed(2)} J: ${pct(f)} of the ${Ufull.toFixed(1)} J it holds at full current.`}
          hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 280" role="img" style={{ width: '100%', display: 'block', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Battery, switch, a ${L} henry coil and a lamp in series. Current ${shown.I.toFixed(2)} amps.${opened ? ` Opened at ${opened.I.toFixed(2)} amps, releasing ${U.toFixed(2)} joules.` : ''}`}>
        <Wire pts={[[XB, TOP], [XS1, TOP]]} />
        <Wire pts={[[XS2, TOP], [XL, TOP], [XL, BOT], [XB, BOT], [XB, TOP]]} />
        <FlowDots paths={PATH} currents={currents} pxPerAmp={180} />
        <rect x={XS1 - 4} y={TOP - 6} width={XS2 - XS1 + 8} height={12} fill={C.surface} />
        <KnifeSwitch x1={XS1} x2={XS2} y={TOP} closed={phase === 'closed'} onToggle={phase === 'released' ? undefined : act} />
        <g ref={spark} opacity={0} pointerEvents="none">
          <circle ref={halo} cx={XS2 - 4} cy={TOP - 12} r={8} fill={C.energy} opacity={0.4} />
          <path d={`M${XS2 - 8},${TOP - 24} l6,6 l-5,3 l7,6 l-4,3 l4,6`} fill="none" stroke="var(--color-ink)" strokeWidth={2.4} strokeLinejoin="round" />
        </g>
        <Battery x={XB} y={(TOP + BOT) / 2} label={`${emf} V`} />
        <rect x={X1 - 6} y={TOP - 26} width={X2 - X1 + 12} height={52} fill={C.surface} />
        <Coil x1={X1} x2={X2} y={TOP} r={22} turns={9} field={field} />
        <text x={(X1 + X2) / 2} y={TOP + 44} textAnchor="middle" fontSize={13} fill={C.soft}>coil, {L} H</text>
        <Lamp x={XL} y={(TOP + BOT) / 2} glow={glow} />
        <text x={XL - 24} y={(TOP + BOT) / 2 + 5} textAnchor="end" fontSize={13} fill={C.soft}>lamp, {R} Ω</text>

        {opened && <g>
          {[{ y: 132, v: opened.I / Ifull, color: C.velocity, name: 'current when opened' },
            { y: 178, v: f, color: C.energy, name: 'field energy when opened' }].map((b) => <g key={b.name}>
            <text x={BX} y={b.y - 8} fontSize={13} fill={C.soft}>{b.name}</text>
            <rect x={BX} y={b.y} width={BW} height={14} fill="none" stroke={C.rule} />
            <rect x={BX} y={b.y} width={BW * b.v} height={14} fill={b.color} opacity={0.85} />
            <line x1={BX + BW * target} x2={BX + BW * target} y1={b.y - 3} y2={b.y + 17} stroke={C.ink} strokeDasharray={b.color === C.energy ? '3 3' : undefined} opacity={b.color === C.energy ? 1 : 0} />
            <text x={BX + BW + 8} y={b.y + 12} fontSize={12.5} fill={C.ink} fontFamily="var(--font-mono)">{pct(b.v)}</text>
          </g>)}
          <text x={BX + BW * target} y={210} textAnchor="middle" fontSize={12} fill={C.faint}>target {pct(target)}</text>
        </g>}
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Full current {Ifull.toFixed(2)} A · cyan dots: current · orchid lines: the coil’s field · bars appear once you open the switch
      </p>
    </SceneCard>
  );
}

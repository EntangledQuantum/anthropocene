import { useRef, useState } from 'react';
import { CH30_RL, CH30_TWIN_L, twinStep, type TwinState } from '../../lib/physics/inductance.ts';
import { C, Meter, SceneCard } from './scene.tsx';
import { Battery, Wire } from './circuit-kit.tsx';
import { Coil, FlowDots, KnifeSwitch, Lamp, glowOf, useFrame, useSetter, type Pt } from './coil-kit-ch30.tsx';

/**
 * Two identical lamps on one battery. Lamp A sits alone in its branch; lamp B
 * shares its branch with a coil of plain copper. Close the switch: A lights at
 * once, B comes up slowly, and both end equally bright, because the coil only
 * fights change. Open it: the coil keeps its current going round through both
 * lamps, backwards through A, and the pair fade together.
 *
 * Ungraded: the payoff of the opening bet. Physics: `twinStep` in
 * src/lib/physics/inductance.ts.
 */
export interface CloseOnTheCoilProps {
  prompt?: string;
}

const TOP = 70, BOT = 262, XB = 70, XS1 = 128, XS2 = 176, XA = 330, XC = 540;
const PATHS: Record<string, readonly Pt[]> = {
  bat: [[XB, BOT], [XB, TOP]],
  feed: [[XB, TOP], [XA, TOP]],
  A: [[XA, TOP], [XA, BOT]],
  top: [[XA, TOP], [XC, TOP]],
  B: [[XC, TOP], [XC, BOT]],
  bot: [[XC, BOT], [XA, BOT]],
  ret: [[XA, BOT], [XB, BOT]],
};

export default function CloseOnTheCoil({ prompt }: CloseOnTheCoilProps) {
  const { emf, R } = CH30_RL;
  const Ifull = emf / R;
  const state = useRef<TwinState>({ closed: false, iA: 0, iB: 0 });
  const clock = useRef(0);
  const currents = useRef<Record<string, number>>({});
  const glowA = useSetter(), glowB = useSetter(), field = useSetter();
  const [closed, setClosed] = useState(false);
  const [shown, setShown] = useState({ iA: 0, iB: 0, t: 0 });
  const lastShown = useRef(0);

  useFrame((dt, now) => {
    const s = twinStep(state.current, dt, emf, R, CH30_TWIN_L);
    state.current = s;
    clock.current += dt;
    const main = s.closed ? s.iA + s.iB : 0;
    currents.current = { bat: main, feed: main, ret: main, A: s.iA, top: s.iB, B: s.iB, bot: s.iB };
    glowA.current?.(glowOf(s.iA, Ifull));
    glowB.current?.(glowOf(s.iB, Ifull));
    field.current?.(s.iB / Ifull);
    if (now - lastShown.current > 120) {
      lastShown.current = now;
      setShown({ iA: s.iA, iB: s.iB, t: clock.current });
    }
  });

  const toggle = () => {
    state.current = { ...state.current, closed: !state.current.closed };
    clock.current = 0;
    setClosed(state.current.closed);
  };

  const amps = (i: number) => `${i < -1e-3 ? '−' : ''}${Math.abs(i).toFixed(2)}`;

  return (
    <SceneCard prompt={prompt}
      footer={<div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="anth-btn" onClick={toggle}>{closed ? 'Open the switch' : 'Close the switch'}</button>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label={closed ? 'Since closing' : 'Since opening'} value={shown.t.toFixed(1)} unit="s" />
          <Meter label="Lamp A" value={amps(shown.iA)} unit="A" color={C.velocity} />
          <Meter label="Lamp B, with the coil" value={amps(shown.iB)} unit="A" color={C.velocity} />
        </span>
      </div>}>
      <svg viewBox="0 0 640 300" role="img" style={{ width: '100%', display: 'block', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Battery, switch and two lamps in parallel; lamp B has a coil in its branch. Switch ${closed ? 'closed' : 'open'}. Lamp A ${amps(shown.iA)} amps, lamp B ${amps(shown.iB)} amps.`}>
        <Wire pts={[[XB, TOP], [XS1, TOP]]} />
        <Wire pts={[[XS2, TOP], [XC, TOP], [XC, BOT], [XB, BOT], [XB, TOP]]} />
        <Wire pts={[[XA, TOP], [XA, BOT]]} />
        <FlowDots paths={PATHS} currents={currents} pxPerAmp={170} />
        <rect x={XS1 - 4} y={TOP - 6} width={XS2 - XS1 + 8} height={12} fill={C.surface} />
        <KnifeSwitch x1={XS1} x2={XS2} y={TOP} closed={closed} onToggle={toggle} />
        <Battery x={XB} y={(TOP + BOT) / 2} label={`${emf} V`} />
        <Lamp x={XA} y={(TOP + BOT) / 2} glow={glowA} label="A" />
        <g transform={`rotate(90 ${XC} 128)`}>
          <rect x={XC - 58} y={128 - 26} width={116} height={52} fill={C.surface} />
          <Coil x1={XC - 50} x2={XC + 50} y={128} r={20} turns={8} field={field} />
        </g>
        <text x={XC + 30} y={132} fontSize={13} fill={C.soft}>coil, {CH30_TWIN_L} H</text>
        <text x={XC + 30} y={148} fontSize={12} fill={C.faint}>plain copper, no resistance</text>
        <Lamp x={XC} y={214} glow={glowB} label="B" />
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Identical {R} Ω lamps · cyan dots: current, speed ∝ amps · orchid lines: the coil’s magnetic field
      </p>
    </SceneCard>
  );
}

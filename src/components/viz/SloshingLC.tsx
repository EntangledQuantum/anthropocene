import { useRef, useState } from 'react';
import { CH30_LC, capEnergy, coilEnergy, coilShare, lcPeakCurrent, lcRelease, lcStep, type LcState } from '../../lib/physics/inductance.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { Wire } from './circuit-kit.tsx';
import { POS, NEG } from './capacitor-kit-ch24.tsx';
import { Coil, EnergyBar, FlowDots, useFrame, useSetter, type Pt } from './coil-kit-ch30.tsx';

/**
 * A charged capacitor wired straight across a coil. Release it and the charge
 * sloshes: out of the plates, round through the coil, onto the plates the other
 * way up, and back. The two energy bars trade places like a spring's potential
 * and a cart's kinetic energy; the strip underneath is the charge on the top
 * plate against time.
 *
 * With `id`, graded: freeze the loop at a moment when all the energy is in the
 * coil. The bars stay hidden until you freeze it. With two `volts`, the learner
 * can charge to either, and the previous run stays on the strip as a ghost.
 *
 * Physics: `lcStep` (velocity Verlet) in src/lib/physics/inductance.ts.
 */
export interface SloshingLCProps {
  id?: string;
  prompt?: string;
  /** Charging voltages offered, one button each. */
  volts?: number[];
  /** Least share of the energy in the coil that counts, 0..1. */
  share?: number;
  explanation?: string;
}

const TOP = 50, BOT = 214, XC = 110, XL = 380, P1 = 120, P2 = 144, PW = 76;
const PATH: Record<string, readonly Pt[]> = { loop: [[XC, P1], [XC, TOP], [XL, TOP], [XL, BOT], [XC, BOT], [XC, P2]] };
const TL = 70, TR = 620, TT = 262, TB = 382, TMS = 100;
const SUB = 6, SIGNS = 4, SIGN_X = [-32, -19, 19, 32];

export default function SloshingLC({ id, prompt, volts = [CH30_LC.V0], share = 0.92, explanation }: SloshingLCProps) {
  const task = useTask(id, 'sloshing-lc');
  const { L, C: Cap, slow } = CH30_LC;
  const Vmax = Math.max(...volts);
  const Qmax = Cap * Vmax;
  const Emax = capEnergy(Qmax, Cap);
  const Imax = lcPeakCurrent(Vmax, L, Cap);
  const tx = (ms: number) => TL + (ms / TMS) * (TR - TL);
  const ty = (q: number) => (TT + TB) / 2 - (q / Qmax) * ((TB - TT) / 2);

  const [V, setV] = useState(volts[0]);
  const s = useRef<LcState>(lcRelease(volts[0], Cap));
  const running = useRef(false);
  const pts = useRef('');
  const [phase, setPhase] = useState<'idle' | 'running' | 'frozen'>('idle');
  const [ghost, setGhost] = useState('');
  const [frozen, setFrozen] = useState<LcState | null>(null);
  const [shown, setShown] = useState({ q: s.current.q, I: 0 });
  const currents = useRef<Record<string, number>>({ loop: 0 });
  const field = useSetter(), barC = useSetter(), barL = useSetter();
  const line = useRef<SVGPolylineElement>(null);
  const plus = useRef<(SVGTextElement | null)[]>([]);
  const minus = useRef<(SVGTextElement | null)[]>([]);
  const efield = useRef<SVGGElement>(null);
  const last = useRef(0);
  const hideBars = !!id && phase !== 'frozen';

  useFrame((dt, now) => {
    let st = s.current;
    if (running.current) {
      const h = dt / slow / SUB;
      for (let k = 0; k < SUB; k++) st = lcStep(st, h, L, Cap);
      s.current = st;
      if (st.t * 1000 <= TMS) { pts.current += ` ${tx(st.t * 1000).toFixed(1)},${ty(st.q).toFixed(1)}`; line.current?.setAttribute('points', pts.current); }
    }
    currents.current.loop = running.current ? -st.I : 0;
    field.current?.(st.I / Imax);
    barC.current?.(capEnergy(st.q, Cap) / Emax);
    barL.current?.(coilEnergy(L, st.I) / Emax);
    const n = Math.round((SIGNS * Math.abs(st.q)) / Qmax);
    for (let k = 0; k < SIGNS; k++) {
      const top = plus.current[k], bot = minus.current[k];
      if (!top || !bot) continue;
      top.setAttribute('opacity', k < n ? '1' : '0');
      bot.setAttribute('opacity', k < n ? '1' : '0');
      top.textContent = st.q >= 0 ? '+' : '−';
      bot.textContent = st.q >= 0 ? '−' : '+';
      top.setAttribute('fill', st.q >= 0 ? POS : NEG);
      bot.setAttribute('fill', st.q >= 0 ? NEG : POS);
    }
    efield.current?.setAttribute('opacity', Math.min(1, Math.abs(st.q) / Qmax).toFixed(3));
    if (now - last.current > 120) { last.current = now; setShown({ q: st.q, I: st.I }); }
  });

  const release = (v: number) => {
    if (pts.current) setGhost(pts.current);
    s.current = lcRelease(v, Cap);
    pts.current = `${tx(0)},${ty(s.current.q)}`;
    line.current?.setAttribute('points', pts.current);
    running.current = true;
    setV(v); setFrozen(null); setPhase('running'); task.touch();
  };
  const freeze = () => { running.current = false; setFrozen({ ...s.current }); setPhase('frozen'); };

  const mC = (q: number) => (q * 1000).toFixed(2);
  const pct = (x: number) => `${Math.round(100 * x)}%`;
  const inCoil = frozen ? coilShare(frozen, L, Cap) : 0;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {volts.map((v) => <button key={v} type="button" className="anth-btn" onClick={() => release(v)}>
            {volts.length > 1 ? `Charge to ${v} V and release` : phase === 'idle' ? 'Release' : 'Charge and release again'}
          </button>)}
          {id && <button type="button" className="anth-btn" onClick={freeze} disabled={phase !== 'running'}>Freeze</button>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Charge on top plate" value={mC(shown.q)} unit="mC" color={C.position} />
            <Meter label="Current" value={shown.I.toFixed(3)} unit="A" color={C.velocity} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(!!frozen && inCoil >= share, { inCoil })}
          miss={!frozen
            ? 'The charge is still sloshing. Freeze it first.'
            : `Frozen with ${pct(1 - inCoil)} of the energy still in the capacitor, which holds ${mC(Math.abs(frozen.q))} mC of its ${mC(Cap * V)} mC.`}
          hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 420" role="img" style={{ width: '100%', display: 'block', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`A capacitor across a coil. Charge on the top plate ${mC(shown.q)} millicoulombs, current ${shown.I.toFixed(3)} amps.`}>
        <Wire pts={[[XC, P1], [XC, TOP], [XL, TOP], [XL, BOT], [XC, BOT], [XC, P2]]} />
        <FlowDots paths={PATH} currents={currents} pxPerAmp={1400} />
        {/* capacitor */}
        <g ref={efield} opacity={1}>
          {[-26, -10, 10, 26].map((dx) => <line key={dx} x1={XC + dx} x2={XC + dx} y1={P1 + 4} y2={P2 - 4} stroke={C.field} strokeWidth={1.6} />)}
        </g>
        <line x1={XC - PW / 2} x2={XC + PW / 2} y1={P1} y2={P1} stroke={C.ink} strokeWidth={4} />
        <line x1={XC - PW / 2} x2={XC + PW / 2} y1={P2} y2={P2} stroke={C.ink} strokeWidth={4} />
        {Array.from({ length: SIGNS }, (_, k) => <g key={k}>
          <text ref={(el) => { plus.current[k] = el; }} x={XC + SIGN_X[k]} y={P1 - 6} textAnchor="middle" fontSize={15} fontWeight={700} fill={POS}>+</text>
          <text ref={(el) => { minus.current[k] = el; }} x={XC + SIGN_X[k]} y={P2 + 17} textAnchor="middle" fontSize={15} fontWeight={700} fill={NEG}>−</text>
        </g>)}
        <text x={XC - PW / 2 - 8} y={P1 + 17} textAnchor="end" fontSize={13} fill={C.soft}>{Cap * 1e6} µF</text>
        {/* coil */}
        <g transform={`rotate(90 ${XL} ${(TOP + BOT) / 2})`}>
          <rect x={XL - 58} y={(TOP + BOT) / 2 - 26} width={116} height={52} fill={C.surface} />
          <Coil x1={XL - 50} x2={XL + 50} y={(TOP + BOT) / 2} r={20} turns={8} field={field} reach={8} />
        </g>
        <text x={XL + 30} y={(TOP + BOT) / 2 + 5} fontSize={13} fill={C.soft}>{L} H</text>
        {/* energy bars */}
        <g opacity={hideBars ? 0 : 1}>
          <EnergyBar x={478} y={TOP} h={140} label="capacitor" sub="½q²/C" fill={barC} />
          <EnergyBar x={568} y={TOP} h={140} label="coil" sub="½LI²" fill={barL} />
          <text x={560} y={TOP - 12} textAnchor="middle" fontSize={12} fill={C.faint}>energy, {Math.round(Emax * 1000)} mJ full scale</text>
        </g>
        {hideBars && <text x={563} y={TOP + 66} textAnchor="middle" fontSize={13} fill={C.faint}>
          <tspan x={563}>energy bars</tspan><tspan x={563} dy={17}>shown when frozen</tspan></text>}
        {/* the strip: charge on the top plate against time */}
        {[-Qmax, 0, Qmax].map((q) => <g key={q}>
          <line x1={TL} x2={TR} y1={ty(q)} y2={ty(q)} stroke={q === 0 ? C.rule : C.grid} />
          <text x={TL - 8} y={ty(q) + 4} textAnchor="end" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{mC(q)}</text>
        </g>)}
        {[0, 20, 40, 60, 80, 100].map((ms) => <text key={ms} x={tx(ms)} y={TB + 17} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{ms}</text>)}
        <text x={TL + 4} y={TT - 8} fontSize={13} fill={C.soft}>charge on the top plate (mC)</text>
        <text x={TR} y={TB + 32} textAnchor="end" fontSize={13} fill={C.soft}>time (ms), shown {slow}× slower</text>
        {ghost && <polyline points={ghost} fill="none" stroke={C.faint} strokeWidth={2} strokeDasharray="4 4" />}
        <polyline ref={line} points="" fill="none" stroke={C.position} strokeWidth={2.5} />
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Ideal wires, no resistance · cyan dots: current · orchid: electric field in the gap, magnetic field in the coil
      </p>
    </SceneCard>
  );
}

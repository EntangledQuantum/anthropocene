import { useRef, useState } from 'react';
import { CH30_CORE, CH30_RL, coreInductance, rlFinal, rlHalfTime, rlStep } from '../../lib/physics/inductance.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { Battery, Wire } from './circuit-kit.tsx';
import { Coil, DragX, FlowDots, KnifeSwitch, Lamp, glowOf, useFrame, useSetter, type Pt } from './coil-kit-ch30.tsx';

/**
 * A lamp in series with a coil whose iron core slides in and out. Slide the
 * core, close the switch, and the trace underneath marks the moment the
 * current reaches half its final value. Graded: make that moment land on the
 * target. More core, more inductance, a slower lamp; the final brightness
 * never changes.
 *
 * Physics: `coreInductance`, `rlStep`, `rlHalfTime` in src/lib/physics/inductance.ts.
 */
export interface DelayTheLampProps {
  id?: string;
  prompt?: string;
  /** Seconds after closing at which the current should reach half its final value. */
  halfAt?: number;
  tolerance?: number;
  explanation?: string;
}

const TOP = 50, BOT = 190, XB = 60, XS1 = 108, XS2 = 152, X1 = 230, X2 = 390, AX = 118, XL = 600, LAMP_Y = 120;
const SPAN = 160;
const PATH: Record<string, readonly Pt[]> = {
  loop: [[XB, BOT], [XB, TOP], [X1, TOP], [X1, AX - 22], [X2, AX - 22], [X2, TOP], [XL, TOP], [XL, BOT], [XB, BOT]],
};
// the trace
const TL = 70, TR = 620, TT = 238, TB = 360, TMAX = 5;
const tx = (t: number) => TL + (t / TMAX) * (TR - TL);

export default function DelayTheLamp({ id, prompt, halfAt = CH30_CORE.halfAt, tolerance = 0.06, explanation }: DelayTheLampProps) {
  const task = useTask(id, 'delay-the-lamp');
  const { emf, R } = CH30_RL;
  const Ifull = rlFinal(emf, R);
  const ty = (I: number) => TB - (I / Ifull) * (TB - TT);
  const [x, setX] = useState<number>(CH30_CORE.start);
  const L = coreInductance(x, CH30_CORE.Lair, CH30_CORE.Lfull);
  const Lref = useRef(L);
  Lref.current = L;
  const [closed, setClosed] = useState(false);
  const run = useRef({ on: false, t: 0, I: 0, pts: '' as string, half: NaN });
  const currents = useRef<Record<string, number>>({ loop: 0 });
  const glow = useSetter(), field = useSetter();
  const line = useRef<SVGPolylineElement>(null);
  const [shown, setShown] = useState({ I: 0, t: 0, half: NaN });
  const last = useRef(0);

  useFrame((dt, now) => {
    const r = run.current;
    if (r.on && r.t < TMAX) {
      const I0 = r.I;
      r.I = rlStep(r.I, dt, emf, R, Lref.current);
      r.t += dt;
      if (I0 < Ifull / 2 && r.I >= Ifull / 2) r.half = r.t - dt * (r.I - Ifull / 2) / (r.I - I0);
      r.pts += ` ${tx(r.t).toFixed(1)},${ty(r.I).toFixed(1)}`;
      line.current?.setAttribute('points', r.pts);
    }
    currents.current.loop = r.on ? r.I : 0;
    glow.current?.(glowOf(r.I, Ifull));
    field.current?.(r.I / Ifull);
    if (now - last.current > 120) { last.current = now; setShown({ I: r.I, t: r.t, half: r.half }); }
  });

  const reset = () => {
    run.current = { on: false, t: 0, I: 0, pts: `${tx(0)},${ty(0)}`, half: NaN };
    line.current?.setAttribute('points', run.current.pts);
    setClosed(false);
  };
  const toggle = () => {
    if (closed) { reset(); return; }
    run.current = { on: true, t: 0, I: 0, pts: `${tx(0)},${ty(0)}`, half: NaN };
    setClosed(true);
    task.touch();
  };

  const th = rlHalfTime(L, R);
  const off = th - halfAt;
  const coreLeft = X1 + (1 - x) * SPAN;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={toggle}>{closed ? 'Open and start over' : 'Close the switch'}</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Coil" value={L.toFixed(1)} unit="H" color={C.field} />
            <Meter label="Current" value={shown.I.toFixed(3)} unit="A" color={C.velocity} />
            <Meter label="Half-way at" value={Number.isFinite(shown.half) ? shown.half.toFixed(2) : '–'} unit="s" />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(Math.abs(off) <= tolerance, { L, th })}
          miss={`With ${L.toFixed(1)} H the current reaches half at ${th.toFixed(2)} s, ${Math.abs(off).toFixed(2)} s ${off < 0 ? 'too soon' : 'too late'}.`}
          hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 390" role="img" style={{ width: '100%', display: 'block', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Battery, switch, a ${L.toFixed(1)} henry coil with a sliding iron core, and a lamp. Current ${shown.I.toFixed(2)} amps.`}>
        <Wire pts={[[XB, TOP], [XS1, TOP]]} />
        <Wire pts={[[XS2, TOP], [X1, TOP]]} />
        <Wire pts={[[X2, TOP], [XL, TOP], [XL, BOT], [XB, BOT], [XB, TOP]]} />
        <FlowDots paths={PATH} currents={currents} pxPerAmp={180} />
        <rect x={XS1 - 4} y={TOP - 6} width={XS2 - XS1 + 8} height={12} fill={C.surface} />
        <KnifeSwitch x1={XS1} x2={XS2} y={TOP} closed={closed} onToggle={toggle} />
        <Battery x={XB} y={(TOP + BOT) / 2} label={`${emf} V`} />
        <Coil x1={X1} x2={X2} y={AX} lead={AX - 22 - TOP} core={[coreLeft, coreLeft + SPAN]} field={field} />
        <text x={X1 - 12} y={AX + 48} fontSize={13} fill={C.soft}>coil</text>
        <text x={coreLeft + SPAN - 4} y={AX + 44} textAnchor="end" fontSize={13} fill={C.faint}>iron core</text>
        <DragX x={coreLeft + SPAN} y={AX} lo={X2} hi={X2 + SPAN} disabled={closed} label="Iron core position"
          onChange={(v) => { setX(1 - (v - X2) / SPAN); task.touch(); }} />
        <Lamp x={XL} y={LAMP_Y} glow={glow} />
        <text x={XL - 4} y={LAMP_Y + 38} textAnchor="middle" fontSize={13} fill={C.soft}>lamp, {R} Ω</text>

        {/* the trace: current against time */}
        {[0, Ifull / 2, Ifull].map((I) => <g key={I}>
          <line x1={TL} x2={TR} y1={ty(I)} y2={ty(I)} stroke={C.grid} strokeDasharray={I === Ifull / 2 ? '5 5' : undefined} />
          <text x={TL - 8} y={ty(I) + 4} textAnchor="end" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{I.toFixed(2)}</text>
        </g>)}
        {Array.from({ length: TMAX + 1 }, (_, t) => <text key={t} x={tx(t)} y={TB + 17} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{t}</text>)}
        <line x1={tx(halfAt)} x2={tx(halfAt)} y1={TT - 4} y2={TB} stroke={C.ink} strokeDasharray="4 4" />
        <text x={tx(halfAt) + 6} y={TT + 8} fontSize={12.5} fill={C.ink}>target {halfAt.toFixed(1)} s</text>
        <text x={TR} y={ty(Ifull / 2) - 6} textAnchor="end" fontSize={12.5} fill={C.faint}>half of full current</text>
        <text x={TL + 4} y={TT - 8} fontSize={13} fill={C.soft}>current (A)</text>
        <text x={TR} y={TB + 32} textAnchor="end" fontSize={13} fill={C.soft}>time since closing (s)</text>
        <polyline ref={line} points={`${tx(0)},${ty(0)}`} fill="none" stroke={C.velocity} strokeWidth={2.5} />
        {Number.isFinite(shown.half) && <circle cx={tx(shown.half)} cy={ty(Ifull / 2)} r={5} fill={C.velocity} />}
      </svg>
    </SceneCard>
  );
}

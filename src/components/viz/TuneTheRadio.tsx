import { useRef, useState } from 'react';
import {
  CH30_RADIO, coreForInductance, coreInductance, inductanceForFrequency, lcFrequency, tankResponse,
} from '../../lib/physics/inductance.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { Wire } from './circuit-kit.tsx';
import { Coil, DragX, FlowDots, useFrame, useSetter, type Pt } from './coil-kit-ch30.tsx';

/**
 * An AM radio's tuning tank: a 200 pF capacitor across a coil with a ferrite
 * slug. Slide the slug and the tank's own frequency 1/(2π√(LC)) moves along
 * the dial. The station drives the tank all the time; it only rings hard when
 * its own frequency matches, so the signal bar is the resonance curve from
 * chapter 14. Graded: bring the station in.
 *
 * Physics: `coreInductance`, `lcFrequency`, `tankResponse` in src/lib/physics/inductance.ts.
 */
export interface TuneTheRadioProps {
  id?: string;
  prompt?: string;
  explanation?: string;
}

const TOP = 58, AX = 150, X1 = 170, X2 = 290, SPAN = 120, CP = 230;
const PATH: Record<string, readonly Pt[]> = {
  loop: [[CP - 8, TOP], [X1, TOP], [X1, AX - 20], [X2, AX - 20], [X2, TOP], [CP + 8, TOP]],
};
const DL = 400, DR = 620, DY = 100, FLO = 500e3, FHI = 1700e3;
const dx = (f: number) => DL + ((Math.min(FHI, Math.max(FLO, f)) - FLO) / (FHI - FLO)) * (DR - DL);
/** The station's carrier, drawn this many times per second. */
const SHOWN_HZ = 1.2;

export default function TuneTheRadio({ id, prompt, explanation }: TuneTheRadioProps) {
  const task = useTask(id, 'tune-the-radio');
  const { C: Cap, Lair, Lfull, Q, startHz, stationHz } = CH30_RADIO;
  const [x, setX] = useState(() => coreForInductance(inductanceForFrequency(startHz, Cap), Lair, Lfull));
  const L = coreInductance(x, Lair, Lfull);
  const f0 = lcFrequency(L, Cap);
  const signal = tankResponse(stationHz, f0, Q);
  const sig = useRef(signal);
  sig.current = signal;
  const phase = useRef(0);
  const currents = useRef<Record<string, number>>({ loop: 0 });
  const field = useSetter();

  useFrame((dt) => {
    phase.current += 2 * Math.PI * SHOWN_HZ * dt;
    const i = sig.current * Math.cos(phase.current);
    currents.current.loop = i;
    field.current?.(i);
  });

  const slugRight = X2 + (1 - x) * SPAN;
  const kHz = (f: number) => (f / 1e3).toFixed(0);
  const off = f0 - stationHz;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
          <Meter label="Coil" value={(L * 1e6).toFixed(0)} unit="µH" color={C.field} />
          <Meter label="Tank rings at" value={kHz(f0)} unit="kHz" />
          <Meter label="Signal" value={`${Math.round(100 * signal)}`} unit="%" color={C.energy} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(signal >= Math.SQRT1_2, { L, f0 })}
          miss={`The tank rings at ${kHz(f0)} kHz with ${(L * 1e6).toFixed(0)} µH, ${kHz(Math.abs(off))} kHz ${off < 0 ? 'below' : 'above'} the station. Signal ${Math.round(100 * signal)}%.`}
          hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 250" role="img" style={{ width: '100%', display: 'block', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Tuning tank: ${(L * 1e6).toFixed(0)} microhenry coil and ${Cap * 1e12} picofarad capacitor, ringing at ${kHz(f0)} kilohertz. Station at ${kHz(stationHz)} kilohertz. Signal ${Math.round(100 * signal)} percent.`}>
        <Wire pts={[[X1, TOP], [CP - 8, TOP]]} />
        <Wire pts={[[CP + 8, TOP], [X2, TOP]]} />
        <FlowDots paths={PATH} currents={currents} pxPerAmp={180} />
        <line x1={CP - 8} x2={CP - 8} y1={TOP - 20} y2={TOP + 20} stroke={C.ink} strokeWidth={4} />
        <line x1={CP + 8} x2={CP + 8} y1={TOP - 20} y2={TOP + 20} stroke={C.ink} strokeWidth={4} />
        <text x={CP} y={TOP - 28} textAnchor="middle" fontSize={13} fill={C.soft}>{Cap * 1e12} pF</text>
        <Coil x1={X1} x2={X2} y={AX} r={20} turns={8} lead={AX - 20 - TOP} core={[slugRight - SPAN, slugRight]} field={field} reach={8} />
        <text x={X1 - 16} y={AX + 5} textAnchor="end" fontSize={13} fill={C.soft}>coil</text>
        <text x={slugRight - 4} y={AX + 40} textAnchor="end" fontSize={13} fill={C.faint}>ferrite slug</text>
        <DragX x={slugRight} y={AX} lo={X2} hi={X2 + SPAN} step={1} label="Ferrite slug position"
          onChange={(v) => { setX(1 - (v - X2) / SPAN); task.touch(); }} />

        {/* the dial */}
        <line x1={DL} x2={DR} y1={DY} y2={DY} stroke={C.rule} strokeWidth={2} />
        {[500, 700, 900, 1100, 1300, 1500, 1700].map((k) => <g key={k}>
          <line x1={dx(k * 1e3)} x2={dx(k * 1e3)} y1={DY - 6} y2={DY + 6} stroke={C.faint} />
          <text x={dx(k * 1e3)} y={DY + 22} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{k}</text>
        </g>)}
        <text x={DR} y={DY + 40} textAnchor="end" fontSize={13} fill={C.soft}>kHz</text>
        <line x1={dx(stationHz)} x2={dx(stationHz)} y1={DY - 26} y2={DY} stroke={C.energy} strokeWidth={2} strokeDasharray="4 3" />
        <text x={dx(stationHz)} y={DY - 32} textAnchor="middle" fontSize={13} fill={C.energy}>station</text>
        <path d={`M${dx(f0)},${DY + 2} l-7,-16 l14,0 z`} fill={C.ink} />
        <text x={DL} y={DY - 50} fontSize={13} fill={C.soft}>tuning dial: where the tank rings</text>

        {/* signal */}
        <text x={DL} y={176} fontSize={13} fill={C.soft}>signal from the station</text>
        <rect x={DL} y={184} width={DR - DL} height={14} fill="none" stroke={C.rule} />
        <rect x={DL} y={184} width={(DR - DL) * signal} height={14} fill={C.energy} opacity={0.85} />
        <line x1={DL + (DR - DL) * Math.SQRT1_2} x2={DL + (DR - DL) * Math.SQRT1_2} y1={180} y2={202} stroke={C.ink} strokeDasharray="3 3" />
        <text x={DL + (DR - DL) * Math.SQRT1_2} y={216} textAnchor="middle" fontSize={12} fill={C.faint}>clear above here</text>
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Tank Q = {Q} · cyan dots: the current the station drives in the tank, drawn about a million times slower
      </p>
    </SceneCard>
  );
}

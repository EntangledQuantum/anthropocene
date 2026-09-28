import { useRef, useState } from 'react';
import { RADIO, capForFrequency, reception, tunedFrequency } from '../../lib/physics/ac.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';

/**
 * An AM radio's tuner: a 250 µH coil and a variable capacitor, the kind with
 * a stack of half-moon plates that swing into a fixed stack. One control:
 * turn the knob. More overlap is more capacitance, and the circuit rings at
 * 1/(2π√(LC)).
 *
 * Right, the dial: four stations on the AM band, each drawn as a bar as tall
 * as the current it drives in the tuner, relative to being tuned exactly
 * (`reception`). The faint curve is the tuner's response across the band.
 *
 * Graded (`id` + `target`, Hz): tune in that station.
 * Physics: reception / tunedFrequency / capForFrequency in ac.ts.
 */
export interface TurnTheTuningDialProps {
  id?: string;
  prompt?: string;
  /** The station to tune in, Hz. */
  target?: number;
  /** The station the dial starts on, Hz. */
  startOn?: number;
  explanation?: string;
}

const DC = { x: 130, y: 165, r: 92 };                 // the capacitor, seen end-on
const B = { x0: 300, x1: 620, y0: 250, y1: 60 };      // the band
const FLO = 0.45e6, FHI = 1.65e6;
const bx = (f: number) => B.x0 + ((f - FLO) / (FHI - FLO)) * (B.x1 - B.x0);
const by = (r: number) => B.y0 - r * (B.y0 - B.y1);
const capAt = (a: number) => RADIO.cMin + (RADIO.cMax - RADIO.cMin) * (1 - a / 180); // a: degrees swung out
const angleFor = (c: number) => 180 * (1 - (c - RADIO.cMin) / (RADIO.cMax - RADIO.cMin));
const rad = (d: number) => (d * Math.PI) / 180;

function halfMoon(mid: number, r: number) {
  const a = rad(mid - 90), b = rad(mid + 90);
  return `M${DC.x},${DC.y} L${DC.x + r * Math.cos(a)},${DC.y - r * Math.sin(a)} A${r},${r} 0 0 0 ${DC.x + r * Math.cos(b)},${DC.y - r * Math.sin(b)} Z`;
}

export default function TurnTheTuningDial({ id, prompt, target, startOn = 1.2e6, explanation }: TurnTheTuningDialProps) {
  const graded = Boolean(id && target);
  const task = useTask(graded ? id : undefined, 'turn-the-tuning-dial');
  const [a, setA] = useState(() => angleFor(capForFrequency(startOn)));
  const drag = useRef(false);
  const cap = capAt(a), f = tunedFrequency(cap);
  const heard = RADIO.stations.map((s) => ({ s, r: reception(s, cap) }));
  const loudest = heard.reduce((m, h) => (h.r > m.r ? h : m));
  const got = target ? reception(target, cap) : 0;
  const hit = got >= 0.85;
  const set = (v: number) => { setA(Math.max(0, Math.min(180, v))); task.touch(); };

  const curve = Array.from({ length: 241 }, (_, k) => {
    const ff = FLO + ((FHI - FLO) * k) / 240;
    return `${bx(ff).toFixed(1)},${by(reception(ff, cap)).toFixed(1)}`;
  }).join(' ');
  const knob = [DC.x + (DC.r + 14) * Math.cos(rad(a)), DC.y - (DC.r + 14) * Math.sin(rad(a))];

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Capacitance" value={(cap * 1e12).toFixed(0)} unit="pF" />
          <Meter label="Tuner rings at" value={(f / 1e6).toFixed(3)} unit="MHz" />
          <Meter label="Loudest station" value={loudest.r > 0.3 ? (loudest.s / 1e6).toFixed(2) : '—'} unit={loudest.r > 0.3 ? 'MHz' : ''} color={C.energy} />
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { pF: cap * 1e12 })}
          miss={`At ${(cap * 1e12).toFixed(0)} pF the tuner rings at ${(f / 1e6).toFixed(2)} MHz, and the ${(target! / 1e6).toFixed(2)} MHz station comes through at ${(got * 100).toFixed(0)} % of full.${loudest.r > 0.5 && loudest.s !== target ? ` You are hearing ${(loudest.s / 1e6).toFixed(2)} MHz.` : ''}`}
          hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 330" role="img" style={{ width: '100%', display: 'block', touchAction: 'none', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Tuning capacitor at ${(cap * 1e12).toFixed(0)} picofarads; tuner rings at ${(f / 1e6).toFixed(2)} megahertz`}>
        {/* the variable capacitor, end-on: fixed plates and the plates you swing */}
        <path d={halfMoon(0, DC.r)} fill={C.field} fillOpacity={0.14} stroke={C.soft} strokeWidth={1.5} />
        <path d={halfMoon(a, DC.r - 6)} fill={C.field} fillOpacity={0.32} stroke={C.field} strokeWidth={2} />
        <circle cx={DC.x} cy={DC.y} r={6} fill={C.surface} stroke={C.ink} strokeWidth={2} />
        <line x1={DC.x} y1={DC.y} x2={knob[0]} y2={knob[1]} stroke={C.ink} strokeWidth={1.2} strokeDasharray="3 4" />
        <text x={DC.x + DC.r + 6} y={DC.y + 4} fontSize={12} fill={C.faint}>fixed</text>
        <text x={DC.x} y={DC.y + DC.r + 30} textAnchor="middle" fontSize={12} fill={C.faint}>overlap is capacitance · coil: 250 µH</text>
        <circle cx={knob[0]} cy={knob[1]} r={20} fill="transparent" style={{ cursor: 'grab' }}
          tabIndex={0} role="slider" aria-label="Tuning knob" aria-valuetext={`${(cap * 1e12).toFixed(0)} picofarads`}
          onPointerDown={(e) => { drag.current = true; (e.target as Element).setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const svg = (e.target as SVGElement).ownerSVGElement!, ctm = svg.getScreenCTM();
            if (!ctm) return;
            const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
            let d = (Math.atan2(DC.y - p.y, p.x - DC.x) * 180) / Math.PI;
            if (d < -90) d = 180; else if (d < 0) d = 0;
            set(d);
          }}
          onPointerUp={() => { drag.current = false; }}
          onKeyDown={(e) => {
            const d = { ArrowRight: -1, ArrowDown: -1, ArrowLeft: 1, ArrowUp: 1 }[e.key];
            if (d === undefined) return;
            e.preventDefault(); set(a + d);
          }} />
        <circle cx={knob[0]} cy={knob[1]} r={10} fill={C.surface} stroke={C.ink} strokeWidth={2.5} pointerEvents="none" />

        {/* the band */}
        {[0, 0.5, 1].map((r) => <g key={r}>
          <line x1={B.x0} x2={B.x1} y1={by(r)} y2={by(r)} stroke={r === 0 ? C.rule : C.grid} />
          <text x={B.x0 - 6} y={by(r) + 4} textAnchor="end" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{r * 100}%</text>
        </g>)}
        <text x={B.x0} y={B.y1 - 14} fontSize={12} fill={C.soft}>how loud each station comes through</text>
        {[0.5, 0.75, 1.0, 1.25, 1.5].map((m) => <text key={m} x={bx(m * 1e6)} y={B.y0 + 16} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{m.toFixed(2)}</text>)}
        <text x={B.x1} y={B.y0 + 32} textAnchor="end" fontSize={11} fill={C.faint}>MHz</text>
        <polyline points={curve} fill="none" stroke={C.soft} strokeWidth={1.3} strokeOpacity={0.6} />
        {heard.map(({ s, r }) => <g key={s}>
          <rect x={bx(s) - 9} y={by(r)} width={18} height={Math.max(1, B.y0 - by(r))} fill={C.energy} fillOpacity={0.25 + 0.6 * r} />
          <text x={bx(s)} y={B.y0 + 50} textAnchor="middle" fontSize={12} fill={s === target ? C.ink : C.faint} fontWeight={s === target ? 600 : 400}>
            {s === target ? 'wanted' : 'station'}</text>
        </g>)}
        <line x1={bx(f)} x2={bx(f)} y1={B.y1} y2={B.y0} stroke={C.field} strokeWidth={1.5} strokeDasharray="4 4" />
        <text x={bx(f)} y={B.y1 - 2} textAnchor="middle" fontSize={11} fill={C.field}>tuned here</text>
      </svg>
    </SceneCard>
  );
}

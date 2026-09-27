import { useRef, useState } from 'react';
import { FERMI_SPEED_COPPER, driftSpeed, driftTime, mm2, signalTime } from '../../lib/physics/current.ts';
import { C, Meter, SceneCard } from './scene.tsx';
import { ElectronWindow, Lamp, useLoop } from './circuit-kit-ch25.tsx';

/**
 * A lamp at the end of a 2 m cord, and a switch. Flip it: the lamp lights at
 * once, while a magnified piece of the cord next to the switch shows what the
 * electrons are doing. They dart about at random as before, and the whole
 * crowd creeps toward the lamp at 0.05 mm/s. Follow the tagged one.
 *
 * Ungraded: the payoff of the opening bet. Physics: `driftSpeed`,
 * `driftTime`, `signalTime` in src/lib/physics/current.ts.
 */
export interface SwitchOnTheLampProps {
  prompt?: string;
  /** Lamp current, A. */
  current?: number;
  /** Copper cross-section, mm². */
  area?: number;
  /** Cord length, m. */
  length?: number;
}

export default function SwitchOnTheLamp({ prompt, current = 0.5, area = 0.75, length = 2 }: SwitchOnTheLampProps) {
  const vd = driftSpeed(current, mm2(area));          // m/s
  const trip = driftTime(length, vd);                   // s
  const ns = signalTime(length) * 1e9;
  const [on, setOn] = useState(false);
  const drift = useRef(0);
  const tOn = useRef(0);

  useLoop((dt) => {
    if (!on) return false;
    tOn.current += dt;
    return true;
  });

  const flip = () => {
    const next = !on;
    setOn(next);
    drift.current = next ? vd * 1000 : 0;
  };
  const gone = vd * tOn.current * 1000; // mm

  const wire = on ? C.field : C.soft;
  return (
    <SceneCard prompt={prompt}
      footer={<div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="anth-btn" onClick={flip}>{on ? 'Switch off' : 'Flip the switch'}</button>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Switched on for" value={tOn.current.toFixed(1)} unit="s" />
          <Meter label="Tagged electron has moved" value={gone.toFixed(3)} unit="mm" color={C.position} />
          <Meter label="Its trip to the lamp" value={(trip / 3600).toFixed(1)} unit="hours" color={C.position} />
        </span>
      </div>}>
      <svg viewBox="0 0 640 200" role="img" style={{ width: '100%', display: 'block', fontFamily: 'var(--font-sans)' }}
        aria-label={`A cell, a switch and a lamp on ${length} metres of cord. The switch is ${on ? 'on and the lamp is lit' : 'off'}.`}>
        {/* the loop of cord */}
        <path d="M70,70 L70,40 L150,40 M196,40 L560,40 L560,82 M560,120 L560,160 L70,160 L70,112"
          fill="none" stroke={wire} strokeWidth={on ? 3 : 2} />
        {/* the cell */}
        <line x1={52} x2={88} y1={80} y2={80} stroke={C.ink} strokeWidth={2.5} />
        <line x1={60} x2={80} y1={92} y2={92} stroke={C.ink} strokeWidth={5} />
        <line x1={70} x2={70} y1={70} y2={80} stroke={wire} strokeWidth={2} />
        <line x1={70} x2={70} y1={92} y2={112} stroke={wire} strokeWidth={2} />
        <text x={96} y={92} fontSize={13} fill={C.soft}>cell</text>
        {/* the switch */}
        <circle cx={150} cy={40} r={3.5} fill={C.ink} />
        <circle cx={196} cy={40} r={3.5} fill={C.ink} />
        <line x1={150} y1={40} x2={on ? 196 : 188} y2={on ? 40 : 18} stroke={C.ink} strokeWidth={2.5} strokeLinecap="round"
          style={{ cursor: 'pointer' }} onClick={flip} />
        <text x={173} y={64} textAnchor="middle" fontSize={13} fill={C.soft}>switch</text>
        {/* the lamp */}
        <Lamp cx={560} cy={100} glow={on ? 1 : 0} />
        <text x={592} y={105} fontSize={13} fill={C.soft}>lamp</text>
        <text x={380} y={150} textAnchor="middle" fontSize={13} fill={C.soft}>{length} m of copper cord, {area} mm² · {current} A when lit</text>
        {on && <text x={380} y={32} textAnchor="middle" fontSize={13} fill={C.field}>field along the whole cord, set up in about {ns.toFixed(0)} ns</text>}
        {/* the tagged electron, and the patch we magnify */}
        <circle cx={214} cy={40} r={4} fill={C.position} />
        <rect x={204} y={32} width={20} height={16} fill="none" stroke={C.position} strokeWidth={1.2} />
        <line x1={204} y1={48} x2={0} y2={200} stroke={C.position} strokeWidth={0.8} strokeDasharray="3 4" />
        <line x1={224} y1={48} x2={640} y2={200} stroke={C.position} strokeWidth={0.8} strokeDasharray="3 4" />
      </svg>
      <ElectronWindow drift={drift} spanMm={0.5} scaleMm={0.1}
        label={`Magnified cord beside the switch. The electrons ${on ? `drift toward the lamp at ${(vd * 1000).toFixed(3)} millimetres per second` : 'dart about with no drift'}.`} />
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Magnified 0.5 mm of cord beside the switch · drift to scale · the random darting really runs at about {(FERMI_SPEED_COPPER / 1000).toFixed(0)} km/s, drawn slowed
      </p>
    </SceneCard>
  );
}

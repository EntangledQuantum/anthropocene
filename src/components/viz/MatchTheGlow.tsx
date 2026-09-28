import { useEffect, useRef, useState } from 'react';
import { HEATER_R, MAINS, dcEquivalent, sinePowerInResistor } from '../../lib/physics/ac.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { Battery, Bulb, Wire } from './circuit-kit.tsx';

/**
 * Two identical 100 Ω heaters. The left one is on the mains, a sine that
 * peaks at 325 V; the right one is on a battery whose voltage you set. One
 * control. The glow of each is its average power (a heater's filament is too
 * slow to follow 100 pulses a second).
 *
 * The strip underneath is one cycle of the mains heater's power, v²/R, which
 * pulses between 0 and 1058 W; the battery heater's power is a flat line
 * across it. The mains average is measured by integrating over the cycle
 * (sinePowerInResistor), never typed in.
 *
 * Graded (`id`): make the battery heater glow exactly as bright.
 */
export interface MatchTheGlowProps {
  id?: string;
  prompt?: string;
  start?: number;
  explanation?: string;
}

const VMAX = 400, PMAX = 1100;
const ST = { x0: 70, x1: 620, y0: 332, y1: 226 };
const px = (f: number) => ST.x0 + f * (ST.x1 - ST.x0);
const py = (p: number) => ST.y0 - (p / PMAX) * (ST.y0 - ST.y1);

export default function MatchTheGlow({ id, prompt, start = 100, explanation }: MatchTheGlowProps) {
  const task = useTask(id, 'match-the-glow');
  const [V, setV] = useState(start);
  const pAC = sinePowerInResistor(MAINS.peak, HEATER_R, MAINS.hz);
  const pDC = (V * V) / HEATER_R;
  const want = dcEquivalent(MAINS.peak);
  const hit = Math.abs(pDC - pAC) / pAC <= 0.025;
  const cursor = useRef<SVGLineElement>(null);

  // a cursor sweeping the cycle, slowed 100×, so the pulses read as time
  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      const x = px(((now / 2000) % 1)).toFixed(1);
      cursor.current?.setAttribute('x1', x); cursor.current?.setAttribute('x2', x);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const hump = Array.from({ length: 161 }, (_, k) => {
    const f = k / 160;
    return `${px(f).toFixed(1)},${py((MAINS.peak * Math.sin(2 * Math.PI * f)) ** 2 / HEATER_R).toFixed(1)}`;
  }).join(' ');

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 220px' }}>
            <span className="hud-label">Battery voltage</span>
            <input type="range" className="anth-slider" min={0} max={VMAX} step={1} value={V} aria-label="Battery voltage, volts"
              onChange={(e) => { setV(+e.target.value); task.touch(); }} />
          </label>
          <span style={{ display: 'flex', gap: 22 }}>
            <Meter label="Battery" value={V.toFixed(0)} unit="V" color={C.position} />
            <Meter label="Mains heater, average" value={pAC.toFixed(0)} unit="W" color={C.energy} />
            <Meter label="Battery heater" value={pDC.toFixed(0)} unit="W" color={C.energy} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { V })}
          miss={`At ${V} V the battery heater takes ${pDC.toFixed(0)} W; the mains heater averages ${pAC.toFixed(0)} W. The battery heater is ${pDC > pAC ? 'brighter' : 'dimmer'}.`}
          hit={explanation?.replace('{v}', want.toFixed(0))} />}
      </div>}>
      <svg viewBox="0 0 640 370" role="img" style={{ width: '100%', display: 'block', fontFamily: 'var(--font-sans)' }}
        aria-label={`Mains heater averaging ${pAC.toFixed(0)} watts; battery heater at ${V} volts taking ${pDC.toFixed(0)} watts`}>
        {/* the mains loop */}
        <Wire pts={[[70, 110], [70, 40], [190, 40], [190, 74]]} />
        <Wire pts={[[190, 106], [190, 150], [70, 150], [70, 130]]} />
        <circle cx={70} cy={120} r={18} fill={C.surface} stroke={C.ink} strokeWidth={2} />
        <path d="M59,120 C63,110 67,110 70,120 C73,130 77,130 81,120" fill="none" stroke={C.ink} strokeWidth={2} />
        <text x={96} y={172} textAnchor="middle" fontSize={13} fill={C.position}>mains: peaks at ±{MAINS.peak.toFixed(0)} V</text>
        <Bulb x={190} y={90} power={pAC} pMax={PMAX} label="heater" />
        {/* the battery loop */}
        <Wire pts={[[400, 110], [400, 40], [520, 40], [520, 74]]} />
        <Wire pts={[[520, 106], [520, 150], [400, 150], [400, 130]]} />
        <Battery x={400} y={120} label={`${V} V`} />
        <Bulb x={520} y={90} power={pDC} pMax={PMAX} label="heater" />
        <text x={460} y={172} textAnchor="middle" fontSize={13} fill={C.position}>steady battery</text>

        {/* one cycle of power */}
        {[0, 250, 500, 750, 1000].map((p) => <g key={p}>
          <line x1={ST.x0} x2={ST.x1} y1={py(p)} y2={py(p)} stroke={p === 0 ? C.rule : C.grid} />
          <text x={ST.x0 - 8} y={py(p) + 4} textAnchor="end" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{p}</text>
        </g>)}
        {[0, 5, 10, 15, 20].map((t) => <text key={t} x={px(t / 20)} y={ST.y0 + 15} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{t}</text>)}
        <text x={ST.x0} y={ST.y1 - 10} fontSize={12} fill={C.soft}>power into each heater (W), over one 20 ms cycle</text>
        <text x={ST.x1} y={ST.y0 + 30} textAnchor="end" fontSize={11} fill={C.faint}>ms</text>
        <polyline points={hump} fill="none" stroke={C.energy} strokeWidth={2.2} />
        <line x1={ST.x0} x2={ST.x1} y1={py(Math.min(pDC, PMAX))} y2={py(Math.min(pDC, PMAX))} stroke={C.energy} strokeWidth={2.5} strokeDasharray="8 5" />
        <text x={px(0.5)} y={py(Math.min(pDC, PMAX)) - 6} textAnchor="middle" fontSize={12} fill={C.energy}
          stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">battery heater</text>
        <text x={px(0.02)} y={py(1010)} textAnchor="start" fontSize={12} fill={C.energy}
          stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">mains heater</text>
        <line ref={cursor} x1={ST.x0} x2={ST.x0} y1={ST.y1} y2={ST.y0} stroke={C.faint} strokeWidth={1} />
      </svg>
    </SceneCard>
  );
}

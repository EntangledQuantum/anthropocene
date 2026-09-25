import { useRef, useState } from 'react';
import { MATERIALS, warmTogether, type Lump } from '../../lib/physics/heat.ts';
import { Arrow, C, CheckBar, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { Burner, HEAT, Thermometer, useSim } from './heat-kit-ch17.tsx';

/**
 * An iron pot of water on a flame, with its thermometer covered. One control:
 * hold to heat. The only instrument is the energy meter, so the learner must
 * turn a temperature rise into joules with Q = mcΔT, and remember that the
 * pot is warming too.
 *
 * Once solved, the energy bar splits into the water's share and the pot's.
 * Physics: `warmTogether` in heat.ts (water and pot stay at one temperature).
 */
export interface HeatThePotProps {
  id?: string;
  prompt?: string;
  waterKg?: number;
  potKg?: number;
  T0?: number;
  target?: number;
  tolerance?: number;
  /** Flame power, W. */
  power?: number;
  explanation?: string;
}

const SPEED = 10;   // playback, × life
const Q_MAX = 400;  // kJ on the bar

export default function HeatThePot({
  id, prompt, waterKg = 2, potKg = 1.5, T0 = 20, target = 50, tolerance = 1, power = 2000, explanation,
}: HeatThePotProps) {
  const task = useTask(id, 'heat-the-pot');
  const Q = useRef(0);
  const heating = useRef(false);
  const [on, setOn] = useState(false);

  useSim((dt) => {
    if (!heating.current) return false;
    Q.current = Math.min(Q_MAX * 1000, Q.current + power * SPEED * dt);
    return true;
  });

  const parts: Lump[] = [{ m: waterKg, c: MATERIALS.water.c, T: T0 }, { m: potKg, c: MATERIALS.iron.c, T: T0 }];
  const { T, shares } = warmTogether(parts, Q.current);
  const reveal = task.done;
  const off = T - target;

  const heat = (v: boolean) => { heating.current = v; setOn(v); if (v) task.touch(); };
  const reset = () => { Q.current = 0; heat(false); task.touch(); };

  const level = (waterKg * 1000) / 314; // cm, a 20 cm pot

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn"
            style={{ padding: '10px 20px', fontSize: 15, borderColor: on ? HEAT : undefined, color: on ? HEAT : undefined }}
            onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); heat(true); }}
            onPointerUp={() => heat(false)} onPointerCancel={() => heat(false)}
            onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); heat(true); } }}
            onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') heat(false); }}>
            {on ? 'Heating…' : 'Hold to heat'}
          </button>
          <button type="button" className="anth-btn" onClick={reset}>Pour it out, start over</button>
          <span style={{ marginLeft: 'auto' }}>
            <Meter label="Energy from the flame" value={(Q.current / 1000).toFixed(1)} unit="kJ" color={HEAT} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(!on && Q.current > 0 && Math.abs(off) <= tolerance, { Q: Q.current, T })}
          miss={Q.current === 0 ? 'The flame has not given anything yet.'
            : `The water is at ${T.toFixed(1)} °C, ${Math.abs(off).toFixed(1)} °C ${off < 0 ? 'short of' : 'past'} ${target} °C. ${(shares[1] / 1000).toFixed(1)} kJ of your ${(Q.current / 1000).toFixed(1)} kJ went into the iron pot.${off > 0 ? ' Nothing here cools it, so start over.' : ''}`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-26, 26]} y={[-6, 22]} height={250} equal
        label={`An iron pot holding ${waterKg} kilograms of water over a flame. ${(Q.current / 1000).toFixed(0)} kilojoules delivered.`}>
        {(s) => <>
          <rect x={s.sx(-10)} y={s.sy(level)} width={s.len(20)} height={s.sy(0) - s.sy(level)} fill="var(--color-cyan)" opacity={0.16} />
          <line x1={s.sx(-10)} x2={s.sx(10)} y1={s.sy(level)} y2={s.sy(level)} stroke="var(--color-cyan)" strokeWidth={1.5} opacity={0.7} />
          <path d={`M${s.sx(-10.5)},${s.sy(12)}L${s.sx(-10.5)},${s.sy(-0.5)}L${s.sx(10.5)},${s.sy(-0.5)}L${s.sx(10.5)},${s.sy(12)}`}
            fill="none" stroke={C.ink} strokeWidth={s.len(1)} strokeLinejoin="round" />
          <line x1={s.sx(10.5)} x2={s.sx(17)} y1={s.sy(10)} y2={s.sy(10)} stroke={C.ink} strokeWidth={s.len(0.9)} strokeLinecap="round" />
          <text x={s.sx(0)} y={s.sy(14)} textAnchor="middle" fontSize={13} fill={C.soft}>iron pot {potKg} kg · water {waterKg} kg</text>
          <Burner x={s.sx(0)} y={s.sy(-4.2)} w={s.len(16)} on={on} />
          {on && [-6, 0, 6].map((x) => <Arrow key={x} s={s} from={[x, -3.4]} to={[x, level * 0.55]} color={HEAT} width={3.5} />)}
          <Thermometer x={s.sx(-19)} y={s.sy(0)} h={130} T={T} lo={0} hi={100} step={20} label="water and pot" covered={!reveal} />
        </>}
      </Stage>
      <Stage x={[0, Q_MAX]} y={[0, 1]} height={78} axes={{ x: 'energy from the flame (kJ)', yTicks: [] }}
        label="Energy delivered so far">
        {(p) => {
          const w = shares[0] / 1000;
          return <>
            <rect x={p.sx(0)} y={p.sy(0.8)} width={p.sx(Q.current / 1000) - p.sx(0)} height={p.sy(0.2) - p.sy(0.8)} fill={HEAT} opacity={0.35} />
            {reveal && <>
              <rect x={p.sx(w)} y={p.sy(0.8)} width={p.sx(Q.current / 1000) - p.sx(w)} height={p.sy(0.2) - p.sy(0.8)} fill={C.ink} opacity={0.55} />
              <text x={p.sx(w / 2)} y={p.sy(0.5) + 4} textAnchor="middle" fontSize={12} fill={C.ink}>into the water {w.toFixed(0)} kJ</text>
              <text x={p.sx(Q.current / 1000) + 6} y={p.sy(0.5) + 4} fontSize={12} fill={C.ink}>into the pot {(shares[1] / 1000).toFixed(0)} kJ</text>
            </>}
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        {(power / 1000).toFixed(0)} kW flame, played {SPEED}× faster than life · water and pot start at {T0} °C and stay level with each other
      </p>
    </SceneCard>
  );
}

import { useRef, useState } from 'react';
import { heatWater, type Water } from '../../lib/physics/heat.ts';
import { Arrow, C, Meter, SceneCard, Stage } from './scene.tsx';
import { Burner, HEAT, Thermometer, useSim } from './heat-kit-ch17.tsx';

/**
 * A block of ice from the freezer on a hot plate that delivers a steady
 * power. Switch it on and watch three things together: the thermometer, the
 * block shrinking into meltwater, and the temperature trace underneath. The
 * trace climbs, then runs flat for eight times as long as the climb took,
 * while the heat keeps pouring in. Ungraded: it is the payoff of a bet.
 *
 * Physics: `heatWater` in heat.ts, one enthalpy function with a step at 0 °C.
 */
export interface MeltTheIceProps {
  prompt?: string;
  iceKg?: number;
  T0?: number;
  /** Hot-plate power, W. */
  power?: number;
}

const SPEED = 10;
const T_END = 240;              // s of simulated time
const AREA = 196;               // cm², a 14 cm square beaker
const RHO_W = 0.001, RHO_I = 0.000917; // kg/cm³

export default function MeltTheIce({ prompt, iceKg = 1, T0 = -20, power = 2090 }: MeltTheIceProps) {
  const start = (): Water => ({ m: iceKg, ice: iceKg, T: T0 });
  const w = useRef<Water>(start());
  const t = useRef(0);
  const trace = useRef<[number, number][]>([[0, T0]]);
  const heating = useRef(false);
  const [on, setOn] = useState(false);

  useSim((dt) => {
    if (!heating.current) return false;
    const h = Math.min(dt * SPEED, T_END - t.current);
    w.current = heatWater(w.current, power * h);
    t.current += h;
    trace.current.push([t.current, w.current.T]);
    if (t.current >= T_END) { heating.current = false; setOn(false); }
    return true;
  });

  const toggle = () => { if (t.current >= T_END) return; heating.current = !heating.current; setOn(heating.current); };
  const reset = () => { heating.current = false; setOn(false); w.current = start(); t.current = 0; trace.current = [[0, T0]]; };

  const { ice, T, m } = w.current;
  const liquid = m - ice;
  const a = Math.cbrt(ice / RHO_I); // cm, side of the shrinking block
  // Float the block if the meltwater is deep enough; otherwise it sits on the bottom.
  const floatLevel = (liquid / RHO_W + ice / RHO_W) / AREA;
  const draft = ice > 0 ? ice / (RHO_W * a * a) : 0;
  const floats = ice > 0 && draft < floatLevel;
  const level = ice <= 0 ? liquid / RHO_W / AREA : floats ? floatLevel : Math.min(liquid / RHO_W / (AREA - a * a), a);
  const iceBottom = floats ? floatLevel - draft : 0;
  const energy = power * t.current;

  return (
    <SceneCard prompt={prompt}
      footer={<div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="anth-btn" onClick={toggle} disabled={t.current >= T_END}
          style={{ borderColor: on ? HEAT : undefined, color: on ? HEAT : undefined }}>
          {on ? 'Switch the plate off' : t.current > 0 ? 'Switch it back on' : 'Switch the plate on'}
        </button>
        <button type="button" className="anth-btn" onClick={reset}>Fresh ice</button>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Time" value={t.current.toFixed(0)} unit="s" />
          <Meter label="Heat put in" value={(energy / 1000).toFixed(0)} unit="kJ" color={HEAT} />
          <Meter label="Ice left" value={(ice * 1000).toFixed(0)} unit="g" />
        </span>
      </div>}>
      <Stage x={[-24, 24]} y={[-6, 21]} height={240} equal
        label={`A beaker holding ${(ice * 1000).toFixed(0)} grams of ice and ${(liquid * 1000).toFixed(0)} grams of water at ${T.toFixed(1)} degrees.`}>
        {(s) => <>
          {level > 0.02 && <rect x={s.sx(-7)} y={s.sy(level)} width={s.len(14)} height={s.sy(0) - s.sy(level)} fill="var(--color-cyan)" opacity={0.16} />}
          {ice > 0 && <rect x={s.sx(-a / 2)} y={s.sy(iceBottom + a)} width={s.len(a)} height={s.len(a)} rx={3}
            fill={C.ink} opacity={0.2} stroke={C.ink} strokeWidth={1.5} />}
          {ice > 0 && a > 3 && <text x={s.sx(0)} y={s.sy(iceBottom + a / 2) + 5} textAnchor="middle" fontSize={13} fill={C.ink}>ice</text>}
          <path d={`M${s.sx(-7)},${s.sy(15)}L${s.sx(-7)},${s.sy(0)}L${s.sx(7)},${s.sy(0)}L${s.sx(7)},${s.sy(15)}`} fill="none" stroke={C.soft} strokeWidth={2} />
          <Burner x={s.sx(0)} y={s.sy(-2.2)} w={s.len(14)} on={on} />
          {on && [-4, 0, 4].map((x) => <Arrow key={x} s={s} from={[x, -1.6]} to={[x, 1.6]} color={HEAT} width={3.5} />)}
          <Thermometer x={s.sx(-15)} y={s.sy(0)} h={140} T={T} lo={-20} hi={40} step={10} label="in the beaker" />
          <text x={s.sx(12)} y={s.sy(-3.6)} fontSize={12} fill={C.faint}>{(power / 1000).toFixed(2)} kW plate</text>
        </>}
      </Stage>
      <Stage x={[0, T_END]} y={[-20, 40]} height={170} axes={{ x: 'time (s)', y: 'temperature (°C)', yTicks: [-20, 0, 20, 40] }}
        label="Temperature against time while the plate is on">
        {(p) => <path d={trace.current.map(([tt, TT], i) => `${i ? 'L' : 'M'}${p.sx(tt).toFixed(1)},${p.sy(TT).toFixed(1)}`).join('')}
          fill="none" stroke={C.ink} strokeWidth={2.5} />}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        {iceKg} kg of ice from a {T0} °C freezer · the plate delivers the same power throughout · played {SPEED}× faster than life
      </p>
    </SceneCard>
  );
}

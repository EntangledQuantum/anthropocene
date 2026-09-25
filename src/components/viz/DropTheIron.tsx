import { useRef, useState } from 'react';
import { MATERIALS, exchange, type Lump } from '../../lib/physics/heat.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { HEAT, Thermometer, useSim } from './heat-kit-ch17.tsx';

/**
 * A hot iron block hangs over a beaker of water. Drop it, and heat pours from
 * the block into the water (aqua arrows, as thick as the current) until the
 * two thermometers agree; then the pipe shuts. Underneath, both temperatures
 * against time: the iron plunges, the water barely stirs.
 *
 * One control: drag the water level before you drop. With `id` and `target`,
 * the scene grades itself: the mix must settle on the target temperature.
 * Physics: `exchange` in heat.ts, solved exactly, so the heat the iron has
 * lost and the heat the water has gained are the same number at every instant.
 */
export interface DropTheIronProps {
  id?: string;
  prompt?: string;
  ironKg?: number;
  ironT?: number;
  waterKg?: number;
  waterT?: number;
  /** Final temperature to hit, °C. Makes the scene graded (with `id`). */
  target?: number;
  tolerance?: number;
  explanation?: string;
}

const AREA = 100;          // cm², beaker cross-section
const PLATE_W = 8;         // cm; the block is an 8 × 8 cm slab
const G = 7.5;             // W/K between block and stirred water
const SPEED = 25;          // playback, × life
const T_END = 300;         // s of simulated time on the strip

export default function DropTheIron({
  id, prompt, ironKg = 1, ironT = 100, waterKg: w0 = 1, waterT = 20, target, tolerance = 1, explanation,
}: DropTheIronProps) {
  const graded = Boolean(id && target !== undefined);
  const task = useTask(graded ? id : undefined, 'drop-the-iron');
  const [waterKg, setWaterKg] = useState(w0);
  const [dropped, setDropped] = useState(false);
  const t = useRef(0);

  const iron: Lump = { m: ironKg, c: MATERIALS.iron.c, T: ironT };
  const water: Lump = { m: waterKg, c: MATERIALS.water.c, T: waterT };
  const ex = exchange(iron, water, G);
  const plateH = (ironKg / MATERIALS.iron.rho) * 1e6 / (PLATE_W * PLATE_W); // cm

  useSim((dt) => {
    if (!dropped || t.current >= T_END) return false;
    t.current = Math.min(T_END, t.current + dt * SPEED);
    return true;
  });

  const now = dropped ? ex.at(t.current) : { Ta: ironT, Tb: waterT, Q: 0, P: 0 };
  const settled = dropped && t.current >= Math.min(T_END, 6 * ex.tau);
  const level = (waterKg * 1000 + (dropped ? ironKg / MATERIALS.iron.rho * 1e6 : 0)) / AREA;
  const P0 = G * (ironT - waterT);

  const drop = () => { t.current = 0; setDropped(true); task.touch(); };
  const reset = () => { t.current = 0; setDropped(false); task.touch(); };

  const trace = (which: 'Ta' | 'Tb', sx: (v: number) => number, sy: (v: number) => number) => {
    if (!dropped) return '';
    let d = '';
    const n = 90;
    for (let i = 0; i <= n; i++) {
      const tt = (t.current * i) / n;
      d += `${i ? 'L' : 'M'}${sx(tt).toFixed(1)},${sy(ex.at(tt)[which]).toFixed(1)}`;
    }
    return d;
  };

  const off = ex.Tf - (target ?? 0);
  const hitNow = graded && settled && Math.abs(off) <= tolerance;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {dropped
            ? <button type="button" className="anth-btn" onClick={reset}>Lift it out and reheat</button>
            : <button type="button" className="anth-btn" onClick={drop}>Drop the iron</button>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Water" value={(waterKg * 1000).toFixed(0)} unit="g" />
            <Meter label="Heat into the water" value={(now.Q / 1000).toFixed(1)} unit="kJ" color={HEAT} />
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hitNow, { waterKg, Tf: ex.Tf })}
          miss={!dropped ? 'Nothing has happened yet: drop the iron in first.'
            : !settled ? 'Still exchanging heat. Let the thermometers agree, then check.'
              : `With ${(waterKg * 1000).toFixed(0)} g of water it settled at ${ex.Tf.toFixed(1)} °C, ${Math.abs(off).toFixed(1)} °C ${off > 0 ? 'above' : 'below'} the ${target} °C target.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-30, 30]} y={[-3, 30]} height={300} equal
        label={`A ${ironKg} kilogram iron block at ${now.Ta.toFixed(0)} degrees ${dropped ? 'in' : 'above'} ${(waterKg * 1000).toFixed(0)} grams of water at ${now.Tb.toFixed(0)} degrees.`}>
        {(s) => {
          const bx = s.sx(-PLATE_W / 2), bw = s.len(PLATE_W), bh = s.len(plateH);
          const blockBottom = dropped ? 0.15 : 22;
          return <>
            {/* the water, then the beaker around it */}
            <rect x={s.sx(-5)} y={s.sy(level)} width={s.len(10)} height={s.sy(0) - s.sy(level)} fill="var(--color-cyan)" opacity={0.16} />
            <line x1={s.sx(-5)} x2={s.sx(5)} y1={s.sy(level)} y2={s.sy(level)} stroke="var(--color-cyan)" strokeWidth={1.5} opacity={0.7} />
            <path d={`M${s.sx(-5)},${s.sy(20)}L${s.sx(-5)},${s.sy(0)}L${s.sx(5)},${s.sy(0)}L${s.sx(5)},${s.sy(20)}`} fill="none" stroke={C.soft} strokeWidth={2} />
            {/* the block, on a string until it drops */}
            {!dropped && <line x1={s.sx(0)} x2={s.sx(0)} y1={s.sy(29.5)} y2={s.sy(blockBottom + plateH)} stroke={C.faint} />}
            <rect x={bx} y={s.sy(blockBottom + plateH)} width={bw} height={bh} rx={2}
              fill={C.surface} stroke={C.ink} strokeWidth={2} />
            {!dropped && <text x={s.sx(PLATE_W / 2 + 1)} y={s.sy(blockBottom + plateH / 2) + 4} fontSize={13} fill={C.soft}>iron, {ironKg} kg</text>}
            {/* heat leaving the block: as thick as the current */}
            {dropped && now.P > P0 * 0.02 && [-2.5, 0, 2.5].map((x) => (
              <Arrow key={x} s={s} from={[x, blockBottom + plateH + 0.3]} to={[x, blockBottom + plateH + 0.8 + 3.2 * Math.sqrt(now.P / P0)]}
                color={HEAT} width={1.5 + 4 * (now.P / P0)} />
            ))}
            {dropped && <text x={s.sx(0)} y={s.sy(23)} textAnchor="middle" fontSize={13} fill={now.P > P0 * 0.02 ? HEAT : C.faint}>
              {now.P > P0 * 0.02 ? `heat ${now.P.toFixed(0)} W` : 'no more heat flows'}
            </text>}
            <Thermometer x={s.sx(-15)} y={s.sy(1)} h={170} T={now.Ta} lo={0} hi={100} step={20} label="iron" />
            <Thermometer x={s.sx(15)} y={s.sy(1)} h={170} T={now.Tb} lo={0} hi={100} step={20} label="water" />
            {graded && !dropped && <Handle s={s} at={[5, waterKg * 1000 / AREA]} color="var(--color-cyan)" step={0.1}
              label="Water level: drag up or down"
              onChange={(p) => { setWaterKg(Math.round(Math.min(1.5, Math.max(0.1, (p[1] * AREA) / 1000)) * 100) / 100); task.touch(); }} />}
          </>;
        }}
      </Stage>
      <Stage x={[0, T_END]} y={[0, 112]} height={170} axes={{ x: 'time (s)', y: 'temperature (°C)', yTicks: [0, 20, 40, 60, 80, 100] }}
        label="Temperature of the iron and the water against time">
        {(p) => <>
          {target !== undefined && <g>
            <line x1={p.sx(0)} x2={p.sx(T_END)} y1={p.sy(target)} y2={p.sy(target)} stroke={C.ink} strokeDasharray="5 5" />
            <text x={p.sx(T_END) - 4} y={p.sy(target) - 6} textAnchor="end" fontSize={12} fill={C.ink}>target {target} °C</text>
          </g>}
          <path d={trace('Ta', p.sx, p.sy)} fill="none" stroke={C.ink} strokeWidth={2.5} />
          <path d={trace('Tb', p.sx, p.sy)} fill="none" stroke={C.soft} strokeWidth={2.5} strokeDasharray="6 4" />
          <line x1={p.sx(T_END * 0.55)} x2={p.sx(T_END * 0.6)} y1={p.sy(104)} y2={p.sy(104)} stroke={C.ink} strokeWidth={2.5} />
          <text x={p.sx(T_END * 0.61)} y={p.sy(104) + 4} fontSize={12} fill={C.ink}>iron</text>
          <line x1={p.sx(T_END * 0.72)} x2={p.sx(T_END * 0.77)} y1={p.sy(104)} y2={p.sy(104)} stroke={C.soft} strokeWidth={2.5} strokeDasharray="6 4" />
          <text x={p.sx(T_END * 0.78)} y={p.sy(104) + 4} fontSize={12} fill={C.soft}>water</text>
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        {ironKg} kg of iron · water stirred, starting at {waterT} °C · played {SPEED}× faster than life · aqua: heat on its way from the iron to the water
      </p>
    </SceneCard>
  );
}

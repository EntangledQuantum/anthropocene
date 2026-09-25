import { useRef, useState } from 'react';
import { drinkSettles, stepDrink, type Drink } from '../../lib/physics/heat.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { HEAT, Thermometer, useSim } from './heat-kit-ch17.tsx';

/**
 * A glass of warm lemonade and a tray of ice cubes at 0 °C. One control: drag
 * how many cubes go in. Drop them, and heat flows from the drink into the ice
 * (aqua arrows) while the cubes shrink and the thermometer falls, traced
 * underneath. Too many cubes and the drink sticks at 0 °C with ice floating;
 * too few and it stays warm.
 *
 * Graded with `id`: the drink must settle inside `band` with no ice left.
 * Physics: `stepDrink` (animation, enthalpy conserved every step) and
 * `drinkSettles` (the verdict, straight from the energy budget) in heat.ts.
 */
export interface ChillTheDrinkProps {
  id?: string;
  prompt?: string;
  drinkKg?: number;
  drinkT?: number;
  cubeKg?: number;
  maxCubes?: number;
  cubes?: number;
  /** Acceptable final temperatures, °C. */
  band?: [number, number];
  explanation?: string;
}

const G_CUBE = 3;           // W/K per fresh cube
const T_END = 30 * 60;      // s on the strip
const SPEED = 225;          // playback, × life
const AREA = 38;            // cm², a 7 cm glass
const RHO_I = 0.000917;     // kg/cm³

export default function ChillTheDrink({
  id, prompt, drinkKg = 0.3, drinkT = 25, cubeKg = 0.02, maxCubes = 12, cubes: n0 = 8, band = [5, 10], explanation,
}: ChillTheDrinkProps) {
  const task = useTask(id, 'chill-the-drink');
  const [n, setN] = useState(n0);
  const [dropped, setDropped] = useState(false);
  const d = useRef<Drink>({ liquid: drinkKg, T: drinkT, ice: 0 });
  const t = useRef(0);
  const trace = useRef<[number, number][]>([[0, drinkT]]);

  useSim((dt) => {
    if (!dropped || t.current >= T_END) return false;
    const h = Math.min(dt * SPEED, T_END - t.current);
    for (let k = 0; k < 20; k++) d.current = stepDrink(d.current, G_CUBE * n, n * cubeKg, h / 20);
    t.current += h;
    trace.current.push([t.current, d.current.T]);
    return true;
  });

  const drop = () => {
    d.current = { liquid: drinkKg, T: drinkT, ice: n * cubeKg };
    t.current = 0; trace.current = [[0, drinkT]];
    setDropped(true); task.touch();
  };
  const reset = () => {
    d.current = { liquid: drinkKg, T: drinkT, ice: 0 };
    t.current = 0; trace.current = [[0, drinkT]];
    setDropped(false); task.touch();
  };

  const settled = dropped && t.current >= T_END;
  const end = drinkSettles(drinkKg, drinkT, n * cubeKg);
  const ok = end.ice <= 1e-9 && end.T >= band[0] && end.T <= band[1];
  const { T, ice, liquid } = d.current;
  const perCube = n > 0 ? ice / n : 0;
  const a = Math.cbrt(perCube / RHO_I);             // cm, side of each cube now
  const level = ((liquid + ice) * 1000) / AREA;      // floating ice displaces its own mass
  const P = dropped && ice > 0 ? G_CUBE * n * Math.cbrt((ice / (n * cubeKg)) ** 2) * T : 0;
  const P0 = G_CUBE * n * drinkT;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {dropped
            ? <button type="button" className="anth-btn" onClick={reset}>Pour a fresh glass</button>
            : <button type="button" className="anth-btn" onClick={drop} disabled={n === 0}>Drop them in</button>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Cubes" value={String(n)} unit={`× ${cubeKg * 1000} g`} />
            <Meter label="Ice left" value={(ice * 1000).toFixed(0)} unit="g" />
            <Meter label="Time" value={(t.current / 60).toFixed(0)} unit="min" />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(settled && ok, { n, T: end.T, ice: end.ice })}
          miss={!dropped ? 'The ice is still on the tray: drop it in first.'
            : !settled ? 'Still melting. Let it settle, then check.'
              : end.ice > 1e-9 ? `Stuck at 0 °C with ${(end.ice * 1000).toFixed(0)} g of ice still floating: more than the drink can melt.`
                : `${n} cube${n === 1 ? '' : 's'} settled the drink at ${end.T.toFixed(1)} °C, ${end.T > band[1] ? 'above' : 'below'} the ${band[0]}–${band[1]} °C you wanted.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-30, 30]} y={[-3, 21]} height={250} equal
        label={`A glass of ${drinkKg * 1000} grams of drink at ${T.toFixed(1)} degrees${dropped ? ` with ${(ice * 1000).toFixed(0)} grams of ice` : `, and ${n} ice cubes on the tray`}.`}>
        {(s) => {
          const gx = -17;
          return <>
            {/* the drink and its floating cubes */}
            <rect x={s.sx(gx - 3.5)} y={s.sy(level)} width={s.len(7)} height={s.sy(0) - s.sy(level)} fill="var(--color-cyan)" opacity={0.16} />
            {dropped && ice > 0 && Array.from({ length: n }, (_, i) => {
              const row = Math.floor(i / 2), col = i % 2;
              const cx = gx + (col ? 1.6 : -1.6);
              const top = level + a * 0.1 - row * (a + 0.2);
              return <rect key={i} x={s.sx(cx - a / 2)} y={s.sy(top)} width={s.len(a)} height={s.len(a)} rx={2}
                fill={C.ink} opacity={0.25} stroke={C.ink} strokeWidth={1.2} />;
            })}
            {P > P0 * 0.03 && [-1, 1].map((k) => (
              <Arrow key={k} s={s} from={[gx + k * 2.6, Math.max(1, level - 7)]} to={[gx + k * 1.8, Math.max(2, level - 3.5)]}
                color={HEAT} width={1.5 + 3.5 * (P / P0)} />
            ))}
            <path d={`M${s.sx(gx - 3.8)},${s.sy(16)}L${s.sx(gx - 3.5)},${s.sy(0)}L${s.sx(gx + 3.5)},${s.sy(0)}L${s.sx(gx + 3.8)},${s.sy(16)}`}
              fill="none" stroke={C.soft} strokeWidth={2} />
            <Thermometer x={s.sx(-27)} y={s.sy(0)} h={140} T={T} lo={0} hi={30} step={5} label="drink" />
            {/* the tray, holding whatever has not gone in */}
            <line x1={s.sx(-6)} x2={s.sx(-6 + maxCubes * 3)} y1={s.sy(14)} y2={s.sy(14)} stroke={C.soft} strokeWidth={2} />
            <text x={s.sx(-6)} y={s.sy(19.4)} fontSize={12} fill={C.faint}>ice tray, 0 °C</text>
            {Array.from({ length: maxCubes }, (_, i) => (
              <rect key={i} x={s.sx(-6 + i * 3 + 0.15)} y={s.sy(16.8)} width={s.len(2.7)} height={s.len(2.7)} rx={2}
                fill={!dropped && i < n ? C.ink : 'none'} opacity={!dropped && i < n ? 0.3 : 1}
                stroke={!dropped && i < n ? C.ink : C.ghost} strokeDasharray={!dropped && i < n ? undefined : '3 3'} strokeWidth={1.2} />
            ))}
            {!dropped && <Handle s={s} at={[-6 + n * 3, 12]} color={C.ink} step={3} label="Number of ice cubes: drag along the tray"
              onChange={(p) => { setN(Math.round(Math.min(maxCubes, Math.max(0, (p[0] + 6) / 3)))); task.touch(); }} />}
          </>;
        }}
      </Stage>
      <Stage x={[0, 30]} y={[0, 30]} height={160} axes={{ x: 'time (min)', y: 'drink (°C)', yTicks: [0, 10, 20, 30] }}
        label="Drink temperature against time">
        {(p) => <>
          <rect x={p.sx(0)} y={p.sy(band[1])} width={p.sx(30) - p.sx(0)} height={p.sy(band[0]) - p.sy(band[1])} fill={C.ok} opacity={0.1} />
          <text x={p.sx(30) - 4} y={p.sy(band[1]) - 5} textAnchor="end" fontSize={12} fill={C.ok}>{band[0]}–{band[1]} °C</text>
          <path d={trace.current.map(([tt, TT], i) => `${i ? 'L' : 'M'}${p.sx(tt / 60).toFixed(1)},${p.sy(TT).toFixed(1)}`).join('')}
            fill="none" stroke={C.ink} strokeWidth={2.5} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        {drinkKg * 1000} g of drink at {drinkT} °C · cubes of {cubeKg * 1000} g at 0 °C · played {SPEED}× faster than life
      </p>
    </SceneCard>
  );
}

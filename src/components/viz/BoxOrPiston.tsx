import { useEffect, useRef, useState } from 'react';
import {
  CH19_GAS, CH19_P, CH19_ROOM, CH19_V0, cylinderAt, heatAtFixedPressure, heatAtFixedVolume, type Cylinder as Cyl,
} from '../../lib/physics/thermo.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { Cylinder, Flame, PxArrow, gasFill, joules } from './cylinder-kit.tsx';

/**
 * Two cylinders, each holding one mole of air at 300 K, each over its own
 * flame. The left one is bolted shut; the right one carries a free, loaded
 * piston that holds its pressure at 100 kPa. Hold a flame to heat that gas.
 *
 * The heat meters are the point: the same temperature rise costs the free
 * piston more, and the difference is exactly the work it did lifting the
 * load. Graded with `id`: warm both by `rise` kelvin.
 * Physics: heatAtFixedVolume / heatAtFixedPressure in thermo.ts.
 */
export interface BoxOrPistonProps {
  id?: string;
  prompt?: string;
  /** Temperature rise to reach in both, K. */
  rise?: number;
  tolerance?: number;
  explanation?: string;
}

const POWER = 100;           // W, each flame
const PX_PER_L = 6;
const BOTTOM = 290;
type Pair = { box: Cyl; pis: Cyl };
const fresh = (): Pair => ({ box: cylinderAt(CH19_ROOM, CH19_V0), pis: cylinderAt(CH19_ROOM, CH19_V0) });

export default function BoxOrPiston({ id, prompt, rise = 30, tolerance = 2, explanation }: BoxOrPistonProps) {
  const task = useTask(id, 'box-or-piston');
  const sim = useRef<Pair>(fresh());
  const on = useRef({ box: false, pis: false });
  const [shown, setShown] = useState<Pair & { onBox: boolean; onPis: boolean }>({ ...fresh(), onBox: false, onPis: false });
  const publish = () => setShown({ ...sim.current, onBox: on.current.box, onPis: on.current.pis });

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const s = sim.current;
      if (on.current.box) s.box = heatAtFixedVolume(CH19_GAS, s.box, POWER * dt);
      if (on.current.pis) s.pis = heatAtFixedPressure(CH19_GAS, s.pis, POWER * dt, CH19_P);
      if (now - lastShown > 100) { lastShown = now; publish(); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const heat = (which: 'box' | 'pis', v: boolean) => { on.current[which] = v; task.touch(); publish(); };
  const reset = () => { sim.current = fresh(); on.current = { box: false, pis: false }; task.touch(); publish(); };

  const dBox = shown.box.T - CH19_ROOM, dPis = shown.pis.T - CH19_ROOM;
  const offBox = dBox - rise, offPis = dPis - rise;
  const ok = !shown.onBox && !shown.onPis && Math.abs(offBox) <= tolerance && Math.abs(offPis) <= tolerance;
  const say = (name: string, d: number, off: number) =>
    `${name} is ${d.toFixed(1)} K warmer, ${Math.abs(off).toFixed(1)} K ${off < 0 ? 'short of' : 'past'} ${rise} K.`;
  const miss = shown.onBox || shown.onPis ? 'A flame is still lit. Let go first, then check.'
    : [Math.abs(offBox) > tolerance ? say('The box', dBox, offBox) : '', Math.abs(offPis) > tolerance ? say('The piston’s gas', dPis, offPis) : '',
      offBox > tolerance || offPis > tolerance ? 'Nothing here cools it, so start over.' : ''].filter(Boolean).join(' ');

  const holdButton = (which: 'box' | 'pis', label: string) => {
    const lit = which === 'box' ? shown.onBox : shown.onPis;
    return <button type="button" className="anth-btn"
      style={{ padding: '9px 16px', borderColor: lit ? 'var(--color-rose)' : undefined, color: lit ? 'var(--color-rose)' : undefined }}
      onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); heat(which, true); }}
      onPointerUp={() => heat(which, false)} onPointerCancel={() => heat(which, false)}
      onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); heat(which, true); } }}
      onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') heat(which, false); }}>
      {lit ? 'Heating…' : label}
    </button>;
  };

  const col = (c: Cyl, x: number, lid: boolean, lit: boolean) => {
    const gasTop = BOTTOM - (c.V / 1e-3) * PX_PER_L;
    return <g>
      <Cylinder x={x} w={150} bottom={BOTTOM} top={lid ? gasTop - 7 : 60} gasTop={gasTop} T={c.T} fill={gasFill(c.T, 290, 340)} lid={lid}
        load={lid ? undefined : 'load'} caption={lid ? 'bolted lid' : 'free piston, 100 kPa'} />
      {lit && <Flame cx={x + 75} y={BOTTOM + 2} size={0.8} />}
      {lit && <PxArrow x1={x - 34} y1={BOTTOM - 4} x2={x - 34} y2={BOTTOM - 70} label="heat in" anchor="end" dx={-8} dy={0} />}
      {lit && !lid && <PxArrow x1={x + 150 + 30} y1={gasTop - 10} x2={x + 150 + 30} y2={gasTop - 70} label="work out" anchor="start" dx={8} dy={0} />}
    </g>;
  };

  const meters = (c: Cyl, color: string) => <span style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
    <Meter label="Warmer by" value={(c.T - CH19_ROOM).toFixed(1)} unit="K" />
    <Meter label="Heat in" value={joules(c.Q)} unit="J" color={color} />
    <Meter label="Work out" value={joules(c.W)} unit="J" color={color} />
  </span>;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ display: 'grid', gap: 10 }}>{holdButton('box', 'Hold: flame under the box')}{meters(shown.box, C.energy)}</div>
          <div style={{ display: 'grid', gap: 10 }}>{holdButton('pis', 'Hold: flame under the piston')}{meters(shown.pis, C.energy)}</div>
        </div>
        <div><button type="button" className="anth-btn" onClick={reset}>Start over</button></div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(ok, { box: dBox, piston: dPis })} miss={miss} hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 330" role="img" style={{ width: '100%', display: 'block', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Bolted box at ${shown.box.T.toFixed(1)} kelvin; free piston at ${shown.pis.T.toFixed(1)} kelvin.`}>
        {col(shown.box, 85, true, shown.onBox)}
        {col(shown.pis, 405, false, shown.onPis)}
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        One mole of air in each, starting at 300 K · each flame gives 100 J every second · insulated walls
      </p>
    </SceneCard>
  );
}

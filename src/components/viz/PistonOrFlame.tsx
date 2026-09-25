import { useEffect, useRef, useState } from 'react';
import {
  CH19_GAS, CH19_ROOM, CH19_V0, cylinderAt, cylinderPressure, heatAtFixedVolume, movePiston, type Cylinder as Cyl,
} from '../../lib/physics/thermo.ts';
import { C, CheckBar, Handle, Meter, SceneCard, useTask, type StageApi } from './scene.tsx';
import { Cylinder, Flame, PxArrow, gasFill, joules } from './cylinder-kit.tsx';

/**
 * One mole of air in an insulated cylinder. Energy has two doors: the flame
 * under the floor (heat, a fixed budget of joules) and the piston you drag
 * (work). The meters keep the first-law ledger as you go.
 *
 * Graded with `id`: end at `target` kelvin, with the flame (if any) burnt out.
 * With `flame = 0` the only door is the piston, so warming the gas means
 * squeezing it. With a budget, holding the temperature means letting every
 * joule back out as work.
 * Physics: heatAtFixedVolume / movePiston in thermo.ts (exact along the adiabat).
 */
export interface PistonOrFlameProps {
  id?: string;
  prompt?: string;
  /** Joules the flame gives once lit. 0 hides the flame. */
  flame?: number;
  /** Temperature to end at, K. */
  target?: number;
  tolerance?: number;
  explanation?: string;
}

const POWER = 80;          // W
const BOTTOM = 300, X = 230, WID = 160, K = 6;   // px, px per litre
const VMIN = 12, VMAX = 40;                     // L
const ROD_X = X + WID / 2;
// world for the handle: x in px, y in litres of gas
const api: StageApi = {
  sx: (x) => x, sy: (V) => BOTTOM - V * K, len: (d) => d, W: 640, H: 340, x: [0, 640], y: [0, VMAX],
};

export default function PistonOrFlame({ id, prompt, flame = 0, target = CH19_ROOM, tolerance = 1.5, explanation }: PistonOrFlameProps) {
  const task = useTask(id, 'piston-or-flame');
  const sim = useRef<{ c: Cyl; left: number; lit: boolean; moved: number; dir: number }>(
    { c: cylinderAt(CH19_ROOM, CH19_V0), left: flame, lit: false, moved: 0, dir: 0 });
  const [shown, setShown] = useState({ c: sim.current.c, left: flame, lit: false, dir: 0 });
  const publish = () => {
    const s = sim.current;
    setShown({ c: s.c, left: s.left, lit: s.lit, dir: performance.now() - s.moved < 350 ? s.dir : 0 });
  };

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const s = sim.current;
      if (s.lit) {
        const dQ = Math.min(POWER * dt, s.left);
        s.c = heatAtFixedVolume(CH19_GAS, s.c, dQ);
        s.left -= dQ;
        if (s.left <= 1e-9) { s.left = 0; s.lit = false; }
      }
      if (now - lastShown > 100) { lastShown = now; publish(); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const drag = (V: number) => {
    const s = sim.current;
    const V2 = Math.max(VMIN, Math.min(VMAX, V)) * 1e-3;
    if (Math.abs(V2 - s.c.V) < 1e-9) return;
    s.dir = Math.sign(V2 - s.c.V);
    s.moved = performance.now();
    s.c = movePiston(CH19_GAS, s.c, V2);
    task.touch();
    publish();
  };
  const light = () => { sim.current.lit = true; task.touch(); publish(); };
  const reset = () => {
    sim.current = { c: cylinderAt(CH19_ROOM, CH19_V0), left: flame, lit: false, moved: 0, dir: 0 };
    task.touch(); publish();
  };

  const { c } = shown;
  const V = c.V / 1e-3;
  const gasTop = api.sy(V);
  const dU = c.Q - c.W;
  const off = c.T - target;
  const spent = flame === 0 || shown.left === 0;
  const ok = spent && !shown.lit && Math.abs(off) <= tolerance;
  const miss = !spent
    ? `The flame still has ${joules(shown.left)} J to give. ${shown.lit ? 'Let it burn out' : 'Light it and let it burn out'} first.`
    : `The gas is at ${c.T.toFixed(1)} K, ${Math.abs(off).toFixed(1)} K ${off < 0 ? 'below' : 'above'} ${target} K. ` + (flame > 0
      ? (off > 0 ? `${joules(CH19_GAS.n * CH19_GAS.cv * off)} J of the flame’s ${flame} J is still in the gas.`
        : `The gas has done ${joules(-CH19_GAS.n * CH19_GAS.cv * off)} J more work than the flame gave it.`)
      : `The piston has done ${joules(-c.W)} J of work on it so far.`);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {flame > 0 && <button type="button" className="anth-btn" onClick={light} disabled={shown.lit || shown.left === 0}
            style={{ borderColor: shown.lit ? 'var(--color-rose)' : undefined, color: shown.lit ? 'var(--color-rose)' : undefined }}>
            {shown.lit ? `Burning… ${joules(shown.left)} J left` : shown.left === 0 ? 'Flame burnt out' : `Light the flame (${flame} J)`}
          </button>}
          <button type="button" className="anth-btn" onClick={reset}>Start over</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <Meter label="Heat in, Q" value={joules(c.Q)} unit="J" color={C.energy} />
            <Meter label="Work by the gas, W" value={joules(c.W)} unit="J" color={C.energy} />
            <Meter label="Change in U" value={joules(dU)} unit="J" color={C.energy} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(ok, { T: c.T, Q: c.Q, W: c.W })} miss={miss} hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 340" role="img" style={{ width: '100%', display: 'block', touchAction: 'none', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Cylinder of air at ${c.T.toFixed(1)} kelvin, ${V.toFixed(1)} litres, ${(cylinderPressure(CH19_GAS, c) / 1000).toFixed(0)} kilopascals.`}>
        {/* volume scale on the wall */}
        {[10, 20, 30, 40].map((v) => <g key={v}>
          <line x1={X - 14} x2={X - 4} y1={api.sy(v)} y2={api.sy(v)} stroke={C.faint} strokeWidth={1.5} />
          <text x={X - 18} y={api.sy(v) + 4} textAnchor="end" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{v} L</text>
        </g>)}
        <line x1={ROD_X} x2={ROD_X} y1={gasTop - 14} y2={gasTop - 44} stroke={C.soft} strokeWidth={5} strokeLinecap="round" />
        <Cylinder x={X} w={WID} bottom={BOTTOM} top={api.sy(VMAX) - 6} gasTop={gasTop} T={c.T} fill={gasFill(c.T, 250, 360)} />
        {flame > 0 && (shown.lit ? <Flame cx={ROD_X} y={BOTTOM + 2} size={0.8} />
          : <line x1={ROD_X - 32} x2={ROD_X + 32} y1={BOTTOM + 24} y2={BOTTOM + 24} stroke={C.faint} strokeWidth={3} />)}
        {shown.lit && <PxArrow x1={X + WID + 40} y1={BOTTOM - 4} x2={X + WID + 40} y2={BOTTOM - 70} label="heat in" anchor="start" dx={10} dy={0} />}
        {shown.dir !== 0 && (shown.dir > 0
          ? <PxArrow x1={ROD_X + 40} y1={gasTop - 20} x2={ROD_X + 40} y2={gasTop - 70} label="work out" anchor="start" dx={10} dy={0} />
          : <PxArrow x1={ROD_X + 40} y1={gasTop - 70} x2={ROD_X + 40} y2={gasTop - 20} label="work in" anchor="start" dx={10} dy={0} />)}
        <text x={X + WID + 40} y={api.sy(VMAX) + 4} fontSize={13} fill={C.faint}>{(cylinderPressure(CH19_GAS, c) / 1000).toFixed(0)} kPa inside</text>
        {target !== CH19_ROOM && <text x={X + WID + 40} y={api.sy(VMAX) + 24} fontSize={13} fill={C.ink}>target {target} K</text>}
        <Handle s={api} at={[ROD_X, V + 44 / K]} onChange={(p) => drag(p[1] - 44 / K)} step={0.25}
          clamp={(p) => [ROD_X, p[1]]} color={C.ink} label="Piston: drag up or down" />
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        One mole of air · insulated walls · drag the handle on the piston rod{flame > 0 ? ` · the flame gives ${POWER} J each second until its ${flame} J are spent` : ' · no flame'}
      </p>
    </SceneCard>
  );
}

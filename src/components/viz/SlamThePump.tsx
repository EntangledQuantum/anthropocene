import { useEffect, useRef, useState } from 'react';
import {
  CH19_ROOM, PUMP_G, PUMP_GAS, PUMP_V0, PUMP_V1, adiabatPressure, cylinderAt, cylinderPressure, leakyStep, pressureAt,
  type Cylinder as Cyl,
} from '../../lib/physics/thermo.ts';
import { C, CheckBar, Handle, Meter, SceneCard, useTask, type StageApi } from './scene.tsx';
import { PxArrow, gasFill } from './cylinder-kit.tsx';

/**
 * A bicycle pump with a thumb over the valve: 0.3 L of room air, and a
 * plunger you drag in to the stop at 0.1 L. The barrel is ordinary metal, so
 * heat leaks out through it (time constant 1.5 s). Below, the same run on the
 * p–V plane, sharing the pump's volume axis, with the isotherm and the
 * adiabat through the start for reference.
 *
 * How fast you push decides which curve the air follows. Graded with `id`:
 * get the air to `target` kelvin.
 * Physics: leakyStep in thermo.ts: heat through the walls, then the move.
 */
export interface SlamThePumpProps {
  id?: string;
  prompt?: string;
  /** Temperature to reach, K. */
  target?: number;
  explanation?: string;
}

const X0 = 90, PXL = 1500;     // barrel's closed end, px per litre
const vx = (V: number) => X0 + (V / 1e-3) * PXL;   // V in m³ → px
const PB = 330, PT = 170, PMAX = 500;       // the plane under the pump
const py = (p: number) => PB - (p / 1000 / PMAX) * (PB - PT);
const BY = 70, BH = 56;                               // barrel centre line, height
const DT = 1 / 1000;
// the handle lives in litres along x
const api: StageApi = { sx: (V) => X0 + V * PXL, sy: () => BY, len: (d) => d * PXL, W: 640, H: 360, x: [0, 0.35], y: [0, 1] };
const S0 = { p: pressureAt(PUMP_GAS, CH19_ROOM, PUMP_V0), V: PUMP_V0 };
const curve = (f: (V: number) => number) => Array.from({ length: 41 }, (_, i) => {
  const V = PUMP_V0 + (PUMP_V1 - PUMP_V0) * (i / 40);
  return `${vx(V).toFixed(1)},${py(f(V)).toFixed(1)}`;
}).join(' ');
const ISO = curve((V) => pressureAt(PUMP_GAS, CH19_ROOM, V));
const ADI = curve((V) => adiabatPressure(PUMP_GAS, S0, V));

interface Run { c: Cyl; target: number; peak: number; t0: number; t1: number; trace: [number, number][]; last: number }
const fresh = (): Run => ({ c: cylinderAt(CH19_ROOM, PUMP_V0), target: PUMP_V0, peak: CH19_ROOM, t0: 0, t1: 0, trace: [[PUMP_V0, S0.p]], last: 0 });

export default function SlamThePump({ id, prompt, target = 430, explanation }: SlamThePumpProps) {
  const task = useTask(id, 'slam-the-pump');
  const run = useRef<Run>(fresh());
  const [shown, setShown] = useState({ T: CH19_ROOM, V: PUMP_V0, peak: CH19_ROOM, Q: 0, stroke: 0 });
  const publish = () => {
    const r = run.current;
    setShown({ T: r.c.T, V: r.c.V, peak: r.peak, Q: r.c.Q, stroke: r.t1 && r.t0 ? r.t1 - r.t0 : 0 });
  };

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const r = run.current;
      const n = Math.max(1, Math.round(dt / DT));
      const V0 = r.c.V;
      for (let k = 1; k <= n; k++) {
        r.c = leakyStep(PUMP_GAS, r.c, V0 + (r.target - V0) * (k / n), PUMP_G, CH19_ROOM, dt / n);
        r.peak = Math.max(r.peak, r.c.T);
      }
      const t = now / 1000;
      if (!r.t0 && r.c.V < 0.97 * PUMP_V0) r.t0 = t;
      if (r.t0 && !r.t1 && r.c.V <= PUMP_V1 * 1.02) r.t1 = t;
      if (t - r.last > 0.01 && (!r.t1 || t - r.t1 < 4)) { r.last = t; r.trace.push([r.c.V, cylinderPressure(PUMP_GAS, r.c)]); }
      if (now - lastShown > 100) { lastShown = now; publish(); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const [handleV, setHandleV] = useState(PUMP_V0 / 1e-3);
  const drag = (V: number) => {
    const v = Math.max(PUMP_V1 / 1e-3, Math.min(PUMP_V0 / 1e-3, V));
    setHandleV(v);
    run.current.target = v * 1e-3;
    task.touch();
  };
  const reset = () => { run.current = fresh(); setHandleV(PUMP_V0 / 1e-3); task.touch(); publish(); };

  const ok = shown.peak >= target;
  const miss = shown.V > PUMP_V1 * 1.05 && shown.peak < target
    ? `The plunger is at ${(shown.V / 1e-3).toFixed(2)} L and the air peaked at ${shown.peak.toFixed(0)} K. Push it to the stop at 0.10 L.`
    : `The air peaked at ${shown.peak.toFixed(0)} K, ${(target - shown.peak).toFixed(0)} K short. The stroke took ${shown.stroke.toFixed(1)} s, and ${(-shown.Q).toFixed(1)} J leaked out through the barrel.`;

  const px = vx(handleV * 1e-3);
  const trace = run.current.trace.map(([V, p]) => `${vx(V).toFixed(1)},${py(p).toFixed(1)}`).join(' ');
  const hot = shown.T > CH19_ROOM + 3;
  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={reset}>Let it back out</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <Meter label="Air now" value={shown.T.toFixed(0)} unit="K" />
            <Meter label="Hottest" value={shown.peak.toFixed(0)} unit="K" color={C.energy} />
            <Meter label="Stroke time" value={shown.stroke ? shown.stroke.toFixed(2) : '–'} unit="s" />
            <Meter label="Heat out so far" value={(-shown.Q).toFixed(1)} unit="J" color={C.energy} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(ok, { peak: shown.peak, stroke: shown.stroke })} miss={miss} hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 360" role="img" style={{ width: '100%', display: 'block', touchAction: 'none', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Pump at ${handleV.toFixed(2)} litres, air at ${shown.T.toFixed(0)} kelvin, hottest ${shown.peak.toFixed(0)} kelvin.`}>
        {/* the barrel, closed end on the left with a thumb over the valve */}
        <rect x={X0} y={BY - BH / 2} width={px - X0} height={BH} fill={gasFill(shown.T, 290, 470)} />
        <text x={(X0 + px) / 2} y={BY + 6} textAnchor="middle" fontSize={16} fontFamily="var(--font-mono)" fill={C.ink}>{shown.T.toFixed(0)} K</text>
        <line x1={X0} x2={vx(PUMP_V0) + 60} y1={BY - BH / 2} y2={BY - BH / 2} stroke={C.soft} strokeWidth={3} />
        <line x1={X0} x2={vx(PUMP_V0) + 60} y1={BY + BH / 2} y2={BY + BH / 2} stroke={C.soft} strokeWidth={3} />
        <line x1={X0} x2={X0} y1={BY - BH / 2} y2={BY + BH / 2} stroke={C.soft} strokeWidth={4} />
        <ellipse cx={X0 - 16} cy={BY} rx={14} ry={20} fill={C.surface} stroke={C.faint} strokeWidth={2} />
        <text x={X0 - 16} y={BY + 44} textAnchor="middle" fontSize={11} fill={C.faint}>thumb</text>
        <line x1={vx(PUMP_V1)} x2={vx(PUMP_V1)} y1={BY + BH / 2} y2={BY + BH / 2 + 8} stroke={C.faint} strokeWidth={2} />
        <text x={vx(PUMP_V1)} y={BY + BH / 2 + 20} textAnchor="middle" fontSize={11} fill={C.faint}>stop</text>
        <rect x={px} y={BY - BH / 2 + 3} width={10} height={BH - 6} fill={C.surface} stroke={C.ink} strokeWidth={2} />
        <line x1={px + 10} x2={px + 70} y1={BY} y2={BY} stroke={C.soft} strokeWidth={5} />
        {hot && [0.3, 0.6].map((f) => {
          const x = X0 + (px - X0) * f;
          return <PxArrow key={f} x1={x} y1={BY - BH / 2 - 2} x2={x} y2={BY - BH / 2 - 26} width={2}
            label={f === 0.3 ? 'heat out' : undefined} anchor="end" dx={-8} dy={0} />;
        })}
        <Handle s={api} at={[handleV + 70 / PXL, 0.5]} onChange={(p) => drag(p[0] - 70 / PXL)} step={0.01}
          clamp={(p) => [p[0], 0.5]} color={C.ink} label="Pump handle: drag left to squeeze" />

        {/* the same run on the p–V plane, sharing the volume axis */}
        {[0, 100, 200, 300, 400, 500].map((p) => <g key={p}>
          <line x1={vx(PUMP_V1) - 10} x2={vx(PUMP_V0) + 10} y1={py(p * 1000)} y2={py(p * 1000)} stroke={C.grid} />
          <text x={vx(PUMP_V1) - 16} y={py(p * 1000) + 4} textAnchor="end" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{p}</text>
        </g>)}
        {[0.1, 0.15, 0.2, 0.25, 0.3].map((V) => (
          <text key={V} x={vx(V * 1e-3)} y={PB + 16} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{V}</text>
        ))}
        <text x={vx(PUMP_V0) + 12} y={PB + 16} fontSize={12} fill={C.soft}>V (L)</text>
        <text x={vx(PUMP_V1) - 44} y={PT - 10} fontSize={12} fill={C.soft}>p (kPa)</text>
        <polyline points={ISO} fill="none" stroke={C.soft} strokeWidth={1.5} strokeDasharray="6 5" />
        <polyline points={ADI} fill="none" stroke={C.soft} strokeWidth={1.5} strokeDasharray="2 4" />
        <text x={vx(0.2e-3)} y={py(pressureAt(PUMP_GAS, CH19_ROOM, 0.2e-3)) + 28} fontSize={12} fill={C.soft}>isotherm, 300 K</text>
        <text x={vx(PUMP_V1) + 6} y={py(adiabatPressure(PUMP_GAS, S0, PUMP_V1)) - 6} fontSize={12} fill={C.soft}>adiabat, no heat</text>
        <polyline points={trace} fill="none" stroke={C.position} strokeWidth={2.5} strokeLinejoin="round" />
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        0.30 L of air at 300 K · metal barrel: heat leaks out, time constant 1.5 s · iris: the path this run took
      </p>
    </SceneCard>
  );
}

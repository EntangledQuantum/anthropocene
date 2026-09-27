import { useEffect, useRef, useState } from 'react';
import {
  AIR_BREAKDOWN, GLASS, atBreakdown, cap, energy, energyDensity, field, si, sparks, voltage, type Cap,
} from '../../lib/physics/capacitor.ts';
import { C, CheckBar, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { CapacitorPicture, GapLabel, PLATE_H } from './capacitor-kit-ch24.tsx';

/**
 * A 1 mm gap, a charger that pushes a steady current while you hold the
 * button, and a sheet of glass you can put in or take out. Charge it as full
 * as you dare. The aqua wash in the gap is the energy per cubic centimetre,
 * ½ κ ε₀ E²: the energy lives there, in the field. Past the breakdown field
 * the gap sparks and everything is dumped.
 *
 * Air gives way at 3 MV/m, when the gap holds 0.40 mJ. Glass takes 10 MV/m
 * and stores κ times more per unit field squared: 22 mJ. So a target of
 * 10 mJ is impossible in air and easy in glass, if you stop in time.
 *
 * Graded with `id`: hold at least `target` joules, not sparked, charger off.
 * Loop in refs; React hears at ~10 Hz. Physics: capacitor.ts.
 */
export interface ChargeBeforeTheSparkProps {
  id?: string;
  prompt?: string;
  /** Energy to store, J. */
  target?: number;
  /** Start with the glass in. */
  glass?: boolean;
  explanation?: string;
}

const AREA = 0.01;
const GAP = 1e-3;
const CURRENT = 0.6e-6; // amperes while held
const LINE_E = 1.5e6;

type Snap = { q: number; glass: boolean; charging: boolean; spark: null | { V: number; U: number; glass: boolean } };

export default function ChargeBeforeTheSpark({ id, prompt, target = 10e-3, glass: glass0 = false, explanation }: ChargeBeforeTheSparkProps) {
  const task = useTask(id, 'charge-before-the-spark');
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  const st = useRef<Snap>({ q: 0, glass: glass0, charging: false, spark: null });
  const [shown, setShown] = useState<Snap>(st.current);
  const publish = () => setShown({ ...st.current });

  const capOf = (sn: Snap): Cap => cap(AREA, GAP, sn.q, GLASS.kappa, sn.glass ? 1 : 0);

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const s = st.current;
      if (!s.spark) {
        if (s.charging) s.q += CURRENT * dt;
        const c = capOf(s);
        if (sparks(c)) {
          // A frame can overshoot; the gap gave way the instant the field reached its limit.
          const at = s.charging ? atBreakdown(c) : c;
          s.spark = { V: voltage(at), U: energy(at), glass: s.glass };
          s.q = 0;
          s.charging = false;
          lastShown = 0;
        }
      }
      if (now - lastShown > 100) { lastShown = now; publish(); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const hold = (on: boolean) => { st.current.charging = on && !st.current.spark; publish(); task.touch(); };
  const toggleGlass = () => { st.current.glass = !st.current.glass; publish(); task.touch(); };
  const reset = () => { st.current = { q: 0, glass: st.current.glass, charging: false, spark: null }; publish(); task.touch(); };

  const c = capOf(shown);
  const V = voltage(c), E = field(c), U = energy(c);
  const limit = shown.glass ? GLASS.breakdown : AIR_BREAKDOWN;
  const uRef = target / (AREA * GAP);
  const hit = !shown.spark && !shown.charging && U >= target;
  const sp = shown.spark;
  const miss = sp
    ? `It sparked at ${si(sp.V, 'V')}, holding ${si(sp.U, 'J')}: ${sp.glass ? 'glass' : 'air'} gives way at ${(sp.glass ? GLASS.breakdown : AIR_BREAKDOWN) / 1e6} MV/m. Start over.`
    : shown.charging ? 'Still charging. Let go first, then check.'
      : `Holding ${si(U, 'J')} at ${si(V, 'V')}. The target is ${si(target, 'J')}.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" disabled={Boolean(sp)}
            style={{ padding: '10px 20px', fontSize: 15, borderColor: shown.charging ? C.energy : undefined, color: shown.charging ? C.energy : undefined }}
            onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); hold(true); }}
            onPointerUp={() => hold(false)} onPointerCancel={() => hold(false)}
            onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); hold(true); } }}
            onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') hold(false); }}>
            {shown.charging ? 'Charging…' : 'Hold to charge'}
          </button>
          <button type="button" className="anth-btn" onClick={toggleGlass}>{shown.glass ? 'Take the glass out' : 'Slide the glass in'}</button>
          <button type="button" className="anth-btn" onClick={reset}>Start over</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Voltage" value={si(V, 'V')} color={C.ink} />
            <Meter label={`Field, sparks at ${limit / 1e6}`} value={`${(E / 1e6).toFixed(2)}`} unit="MV/m" color={C.field} />
            <Meter label="Stored" value={si(U, 'J')} color={C.energy} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={live && task.done}
          onCheck={() => task.check(hit, { U, glass: shown.glass, sparked: Boolean(sp) })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-4, 4]} y={[-1.8, 13]} height={320}
        label={`A 1 millimetre gap ${shown.glass ? 'filled with glass' : 'of air'}, at ${si(V, 'V')}, storing ${si(U, 'J')}.${sp ? ' It has sparked.' : ''}`}>
        {(s) => {
          const xb = -3.2, yRail = 12;
          const wire = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${s.sx(x)},${s.sy(y)}`).join('');
          const zig = Array.from({ length: 9 }, (_, i) => [i / 8, 5 + (i % 2 ? 0.7 : -0.7) * (i === 0 || i === 8 ? 0 : 1)] as const);
          return <>
            <path d={wire([[0, 5], [xb, 5], [xb, 6.8]])} fill="none" stroke={C.faint} strokeWidth={1.8} />
            <path d={wire([[xb, 9.2], [xb, yRail], [1, yRail], [1, PLATE_H]])} fill="none" stroke={C.faint} strokeWidth={1.8} />
            <circle cx={s.sx(xb)} cy={s.sy(8)} r={16} fill={C.surface} stroke={shown.charging ? C.energy : C.soft} strokeWidth={2} />
            <path d={`M${s.sx(xb)},${s.sy(8) + 9}L${s.sx(xb)},${s.sy(8) - 7}M${s.sx(xb) - 5},${s.sy(8) - 2}L${s.sx(xb)},${s.sy(8) - 9}L${s.sx(xb) + 5},${s.sy(8) - 2}`}
              fill="none" stroke={shown.charging ? C.energy : C.soft} strokeWidth={2} />
            <text x={s.sx(xb) - 24} y={s.sy(8) + 5} textAnchor="end" fontSize={13} fill={C.soft}>charger</text>
            <CapacitorPicture s={s} c={c} lineE={LINE_E} shade={energyDensity(E, shown.glass ? GLASS.kappa : 1) / uRef} slabParked={!shown.glass} />
            <GapLabel s={s} gap={1} y={-0.5} />
            {sp && <path d={zig.map(([t, y], i) => `${i ? 'L' : 'M'}${s.sx(t)},${s.sy(y)}`).join('')}
              fill="none" stroke={C.warn} strokeWidth={3} strokeLinejoin="round" />}
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        10 cm plates, 1 mm gap drawn enlarged · aqua wash: energy per cm³, full at {si(uRef * 1e-6, 'J')} per cm³ · orchid: field lines · rose and violet dots: charge
      </p>
    </SceneCard>
  );
}

import { useEffect, useRef, useState } from 'react';
import { CH26_FLASH, CH26_LAMP_R, capEnergy, chargeStep, energyGoneAt } from '../../lib/physics/circuits.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { Bulb, FlowDots, Wire, type Pt } from './circuit-kit.tsx';

/**
 * The flash capacitor, full at 300 V, and a 10 kΩ lamp across it behind a
 * switch you hold closed. While you hold, the capacitor empties through the
 * lamp: the lamp glows by the power it takes, V²/R, and dims as the voltage
 * falls. The strip traces the voltage against the time the switch was closed.
 *
 * Graded with `id`: let exactly half the stored energy out. Energy goes as V²,
 * so that happens at 71 % of the voltage, not 50 %. The scene shows voltage and
 * charge only; the energy appears in the verdict.
 * Physics: chargeStep with emf 0 (exact exponential) and energyGoneAt, circuits.ts.
 */
export interface DrainTheFlashProps {
  id?: string;
  prompt?: string;
  /** Target fraction of the stored energy to let out. */
  target?: number;
  tolerance?: number;
  explanation?: string;
}

const { emf: V0, C: CAP } = CH26_FLASH;
const R = CH26_LAMP_R;
const U0 = capEnergy(CAP, V0);
const TOP = 40, BOT = 164, XC = 150, XL = 470, XS = 300;
const SPAN = 6, TX0 = 60, TX1 = 620, TY0 = 290, TY1 = 196;
const tx = (t: number) => TX0 + (t / SPAN) * (TX1 - TX0);
const ty = (v: number) => TY0 - (v / V0) * (TY0 - TY1);

export default function DrainTheFlash({ id, prompt, target = 0.5, tolerance = 0.04, explanation }: DrainTheFlashProps) {
  const task = useTask(id, 'drain-the-flash');
  const sim = useRef({ v: V0, t: 0, closed: false, hist: [[0, V0]] as number[][] });
  const line = useRef<SVGPolylineElement>(null);
  const [shown, setShown] = useState({ v: V0, closed: false });

  const publish = () => setShown({ v: sim.current.v, closed: sim.current.closed });

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const s = sim.current;
      if (s.closed) {
        s.v = chargeStep(s.v, dt, 0, R, CAP).v;
        s.t += dt;
        if (s.t <= SPAN) s.hist.push([s.t, s.v]);
        line.current?.setAttribute('points', s.hist.map(([t, v]) => `${tx(t).toFixed(1)},${ty(v).toFixed(1)}`).join(' '));
      }
      if (now - lastShown > 100) { lastShown = now; publish(); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const hold = (on: boolean) => { sim.current.closed = on; task.touch(); publish(); };
  const recharge = () => {
    sim.current = { v: V0, t: 0, closed: false, hist: [[0, V0]] };
    line.current?.setAttribute('points', `${tx(0)},${ty(V0)}`);
    task.touch(); publish();
  };

  const v = shown.v;
  const I = shown.closed ? v / R : 0;
  const gone = energyGoneAt(v, V0);
  const ok = !shown.closed && Math.abs(gone - target) <= tolerance;
  const miss = shown.closed ? 'The switch is still closed.'
    : v >= V0 - 1e-9 ? `The switch has not been closed yet: all ${U0.toFixed(2)} J is still in the capacitor.`
      : `You opened the switch at ${v.toFixed(0)} V, ${((v / V0) * 100).toFixed(0)} % of the voltage. The capacitor still holds ${capEnergy(CAP, v).toFixed(2)} J of ${U0.toFixed(2)} J: ${(gone * 100).toFixed(0)} % of the energy has gone into the lamp.`;
  const nq = Math.round((v / V0) * 10);
  const loop: Record<string, readonly Pt[]> = {
    top: [[XC, TOP + 50], [XC, TOP], [XL, TOP], [XL, (TOP + BOT) / 2]],
    bot: [[XL, (TOP + BOT) / 2], [XL, BOT], [XC, BOT], [XC, TOP + 66]],
  };

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn"
            style={{ padding: '10px 20px', fontSize: 15, borderColor: shown.closed ? C.energy : undefined, color: shown.closed ? C.energy : undefined }}
            onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); hold(true); }}
            onPointerUp={() => hold(false)} onPointerCancel={() => hold(false)}
            onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); hold(true); } }}
            onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') hold(false); }}>
            {shown.closed ? 'Switch closed…' : 'Hold the switch closed'}
          </button>
          <button type="button" className="anth-btn" onClick={recharge}>Recharge to 300 V</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 20 }}>
            <Meter label="Capacitor" value={v.toFixed(0)} unit="V" color={C.position} />
            <Meter label="Charge" value={(CAP * v * 1000).toFixed(1)} unit="mC" color={C.field} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(ok, { v, gone })} miss={miss} hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 310" role="img" style={{ width: '100%', display: 'block', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Capacitor at ${v.toFixed(0)} volts discharging through a lamp. Switch ${shown.closed ? 'closed' : 'open'}.`}>
        {Object.values(loop).map((p, j) => <Wire key={j} pts={p} />)}
        {/* the switch: a gap in the top wire, bridged while held */}
        <rect x={XS - 26} y={TOP - 6} width={52} height={12} fill={C.surface} />
        <circle cx={XS - 22} cy={TOP} r={3.5} fill={C.soft} />
        <circle cx={XS + 22} cy={TOP} r={3.5} fill={C.soft} />
        <line x1={XS - 22} y1={TOP} x2={XS + 22} y2={shown.closed ? TOP : TOP - 22} stroke={C.ink} strokeWidth={3} strokeLinecap="round" />
        <text x={XS} y={TOP + 26} textAnchor="middle" fontSize={12} fill={C.faint}>switch</text>
        <FlowDots paths={loop} currents={{ top: I, bot: I }} pxPerAmp={2400} />
        {/* capacitor */}
        <rect x={XC - 32} y={TOP + 50} width={64} height={16} fill={C.surface} />
        <line x1={XC - 30} x2={XC + 30} y1={TOP + 50} y2={TOP + 50} stroke={C.ink} strokeWidth={3} />
        <line x1={XC - 30} x2={XC + 30} y1={TOP + 66} y2={TOP + 66} stroke={C.ink} strokeWidth={3} />
        {Array.from({ length: nq }, (_, j) => <g key={j}>
          <text x={XC - 27 + j * 6} y={TOP + 45} fontSize={10} fill={C.field}>+</text>
          <text x={XC - 27 + j * 6} y={TOP + 78} fontSize={10} fill={C.field}>−</text>
        </g>)}
        <text x={XC - 40} y={TOP + 62} textAnchor="end" fontSize={12} fill={C.faint}>200 µF</text>
        <Bulb x={XL} y={(TOP + BOT) / 2} power={I * I * R} pMax={V0 * V0 / R} />
        <text x={XL + 26} y={(TOP + BOT) / 2 + 5} fontSize={12} fill={C.faint}>lamp, 10 kΩ</text>

        {/* the trace */}
        {[0, 75, 150, 225, 300].map((u) => <g key={u}>
          <line x1={TX0} x2={TX1} y1={ty(u)} y2={ty(u)} stroke={C.grid} />
          <text x={TX0 - 6} y={ty(u) + 4} textAnchor="end" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{u}</text>
        </g>)}
        {Array.from({ length: SPAN + 1 }, (_, t) => <text key={t} x={tx(t)} y={TY0 + 14} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{t}</text>)}
        <text x={TX0 + 4} y={TY1 - 6} fontSize={12} fill={C.soft}>capacitor (V)</text>
        <text x={TX1} y={TY1 - 6} textAnchor="end" fontSize={12} fill={C.soft}>seconds the switch was closed</text>
        <polyline ref={line} points={`${tx(0)},${ty(V0)}`} fill="none" stroke={C.position} strokeWidth={2.5} />
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Charged to {V0} V, it holds {U0.toFixed(0)} J · the lamp glows by the power it takes · cyan dots: current, speed ∝ amps
      </p>
    </SceneCard>
  );
}

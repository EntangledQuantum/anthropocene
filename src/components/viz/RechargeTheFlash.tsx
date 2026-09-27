import { useEffect, useRef, useState } from 'react';
import { CH26_FLASH, capEnergy, chargeStep, timeToFraction } from '../../lib/physics/circuits.ts';
import { C, CheckBar, Handle, Meter, SceneCard, useTask, type StageApi } from './scene.tsx';
import { Battery, FlowDots, Wire, type Pt } from './circuit-kit.tsx';

/**
 * A camera flash: a 300 V supply charges a 200 µF capacitor through a
 * resistance wire. The resistance is set by where the sliding contact touches
 * the wire. Fire the flash and the capacitor empties at once; then it refills,
 * quickly at first and ever more slowly, and the ready lamp lights at 95 %.
 * The strip below traces the capacitor's voltage since the last firing.
 *
 * Graded with `id` and `target`: set R so the flash is ready `target` seconds
 * after firing. With `ledger`, three meters keep the energy books of the
 * charge since the last firing. Physics: chargeStep / timeToFraction in
 * circuits.ts; the loop steps the exact exponential.
 */
export interface RechargeTheFlashProps {
  id?: string;
  prompt?: string;
  /** Starting resistance, Ω. */
  r0?: number;
  /** Let the learner move the contact. */
  adjustable?: boolean;
  /** Seconds from firing to ready. Graded when set with `id`. */
  target?: number;
  tolerance?: number;
  /** Show the energy ledger instead of the timing meters. */
  ledger?: boolean;
  explanation?: string;
}

const { emf: E, C: CAP, ready: READY } = CH26_FLASH;
const RMIN = 500, RMAX = 10000;
const WX0 = 140, WX1 = 440, WY = 44;          // the resistance wire
const SPAN = 8, TX0 = 60, TX1 = 620, TY0 = 318, TY1 = 204; // the trace strip
const tx = (t: number) => TX0 + (t / SPAN) * (TX1 - TX0);
const ty = (v: number) => TY0 - (v / E) * (TY0 - TY1);
const api: StageApi = { sx: (x) => x, sy: (y) => y, len: (d) => d, W: 640, H: 330, x: [0, 640], y: [0, 330] };
const rAt = (x: number) => Math.round((((x - WX0) / (WX1 - WX0)) * RMAX) / 50) * 50;
const xAt = (R: number) => WX0 + (R / RMAX) * (WX1 - WX0);
const XCAP = 520, YCAP = 112, XBAT = 60, YBOT = 170, XFL = 598;

export default function RechargeTheFlash({
  id, prompt, r0 = 5000, adjustable = true, target, tolerance = 0.1, ledger = false, explanation,
}: RechargeTheFlashProps) {
  const graded = Boolean(id && target !== undefined);
  const task = useTask(graded ? id : undefined, 'recharge-the-flash');
  const sim = useRef({ v: 0, t: 0, R: r0, mixed: false, readyAt: NaN, hist: [[0, 0]] as number[][], prev: [] as number[][], source: 0, heat: 0 });
  const line = useRef<SVGPolylineElement>(null);
  const prevLine = useRef<SVGPolylineElement>(null);
  const [R, setR] = useState(r0);
  const [shown, setShown] = useState({ v: 0, t: 0, readyAt: NaN, mixed: false, source: 0, heat: 0, fires: 0 });

  const publish = (fires?: number) => {
    const s = sim.current;
    setShown((o) => ({ v: s.v, t: s.t, readyAt: s.readyAt, mixed: s.mixed, source: s.source, heat: s.heat, fires: fires ?? o.fires }));
  };

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const s = sim.current;
      const st = chargeStep(s.v, dt, E, s.R, CAP);
      const was = s.v;
      s.v = st.v; s.t += dt; s.source += st.source; s.heat += st.heat;
      if (was < READY * E && s.v >= READY * E && Number.isNaN(s.readyAt)) s.readyAt = s.t;
      if (s.t <= SPAN) s.hist.push([s.t, s.v]);
      line.current?.setAttribute('points', s.hist.map(([t, v]) => `${tx(t).toFixed(1)},${ty(v).toFixed(1)}`).join(' '));
      if (now - lastShown > 120) { lastShown = now; publish(); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const fire = () => {
    const s = sim.current;
    s.prev = s.hist; s.hist = [[0, 0]];
    prevLine.current?.setAttribute('points', s.prev.map(([t, v]) => `${tx(t).toFixed(1)},${ty(v).toFixed(1)}`).join(' '));
    Object.assign(s, { v: 0, t: 0, readyAt: NaN, mixed: false, source: 0, heat: 0 });
    task.touch();
    publish(shown.fires + 1);
  };
  const move = (x: number) => {
    const r = Math.max(RMIN, Math.min(RMAX, rAt(x)));
    if (r === sim.current.R) return;
    sim.current.R = r;
    if (sim.current.v < READY * E) sim.current.mixed = true;
    setR(r); task.touch();
  };

  const I = (E - shown.v) / R;
  const tReady = timeToFraction(READY, R, CAP);
  const ready = shown.v >= READY * E;
  const k = R / 1000;
  // charge signs on the plates, one per tenth of full charge
  const nq = Math.round((shown.v / E) * 10);
  const loop: Record<string, readonly Pt[]> = {
    a: [[XBAT, YBOT], [XBAT, WY], [WX0, WY], [xAt(R), WY]],
    b: [[xAt(R), WY], [xAt(R), 14], [XCAP, 14], [XCAP, YCAP - 8]],
    c: [[XCAP, YCAP + 8], [XCAP, YBOT], [XBAT, YBOT]],
  };
  const zig = Array.from({ length: 31 }, (_, j) => `${WX0 + j * 10},${WY + (j === 0 || j === 30 ? 0 : j % 2 ? -7 : 7)}`).join(' ');
  const off = tReady - (target ?? 0);

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={fire}>Fire the flash</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {ledger ? <>
              <Meter label="Supply gave" value={shown.source.toFixed(2)} unit="J" color={C.energy} />
              <Meter label="Capacitor holds" value={capEnergy(CAP, shown.v).toFixed(2)} unit="J" color={C.energy} />
              <Meter label="Resistor heated" value={shown.heat.toFixed(2)} unit="J" color={C.energy} />
            </> : <>
              <Meter label="Capacitor" value={shown.v.toFixed(0)} unit="V" color={C.position} />
              <Meter label="Current" value={(I * 1000).toFixed(0)} unit="mA" color={C.velocity} />
              <Meter label="Ready after" value={Number.isNaN(shown.readyAt) || shown.mixed ? '—' : shown.readyAt.toFixed(2)} unit="s" />
            </>}
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(Math.abs(off) <= tolerance, { R })}
          miss={`With ${k.toFixed(2)} kΩ the flash is ready ${tReady.toFixed(2)} s after firing, ${Math.abs(off).toFixed(2)} s ${off > 0 ? 'slower' : 'faster'} than ${target!.toFixed(1)} s.`}
          hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 330" role="img" style={{ width: '100%', display: 'block', touchAction: 'none', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Flash capacitor at ${shown.v.toFixed(0)} volts of ${E}. Resistance ${k.toFixed(2)} kilohms.${ready ? ' Ready.' : ''}`}>
        <style>{'@keyframes ch26burst { from { opacity: 0.95 } to { opacity: 0 } }'}</style>
        {/* the circuit */}
        <polyline points={zig} fill="none" stroke={C.faint} strokeWidth={2} />
        <polyline points={zig.split(' ').filter((p) => +p.split(',')[0] <= xAt(R) + 0.1).join(' ')} fill="none" stroke={C.soft} strokeWidth={2.5} />
        {Object.values(loop).map((p, j) => <Wire key={j} pts={p} />)}
        <FlowDots paths={loop} currents={{ a: I, b: I, c: I }} pxPerAmp={260} />
        <Battery x={XBAT} y={(WY + YBOT) / 2 + 4} label={`${E} V`} />
        <text x={(WX0 + WX1) / 2} y={WY + 30} textAnchor="middle" fontSize={12} fill={C.faint}>resistance wire: 0 to {RMAX / 1000} kΩ</text>
        <text x={xAt(R)} y={WY - 28} textAnchor="middle" fontSize={14} fontFamily="var(--font-mono)" fill={C.ink}
          stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">R = {k.toFixed(2)} kΩ</text>
        {/* capacitor with its charge */}
        <line x1={XCAP - 30} x2={XCAP + 30} y1={YCAP - 8} y2={YCAP - 8} stroke={C.ink} strokeWidth={3} />
        <line x1={XCAP - 30} x2={XCAP + 30} y1={YCAP + 8} y2={YCAP + 8} stroke={C.ink} strokeWidth={3} />
        {Array.from({ length: nq }, (_, j) => <g key={j}>
          <text x={XCAP - 27 + j * 6} y={YCAP - 13} fontSize={10} fill={C.field}>+</text>
          <text x={XCAP - 27 + j * 6} y={YCAP + 20} fontSize={10} fill={C.field}>−</text>
        </g>)}
        <text x={XCAP - 38} y={YCAP + 4} textAnchor="end" fontSize={12} fill={C.faint}>200 µF</text>
        {/* the flash tube and its ready lamp */}
        <Wire pts={[[XCAP, 14], [XFL, 14], [XFL, 96]]} faint />
        <Wire pts={[[XFL, 128], [XFL, YBOT], [XCAP, YBOT]]} faint />
        <rect x={XFL - 10} y={96} width={20} height={32} rx={8} fill={C.surface} stroke={C.soft} strokeWidth={1.8} />
        {shown.fires > 0 && <circle key={shown.fires} cx={XFL} cy={112} r={70} fill="var(--color-ink)"
          style={{ animation: 'ch26burst 0.6s ease-out forwards' }} pointerEvents="none" />}
        <circle cx={XFL} cy={148} r={6} fill={ready ? C.ok : C.surface} stroke={ready ? C.ok : C.ghost} strokeWidth={1.5} />
        <text x={XFL} y={196} textAnchor="middle" fontSize={12} fill={ready ? C.ok : C.faint}>{ready ? 'ready' : 'charging'}</text>
        <text x={XFL - 16} y={90} textAnchor="end" fontSize={12} fill={C.faint}>flash</text>

        {/* the trace: capacitor voltage since the last firing */}
        {[0, 75, 150, 225, 300].map((v) => <g key={v}>
          <line x1={TX0} x2={TX1} y1={ty(v)} y2={ty(v)} stroke={C.grid} />
          <text x={TX0 - 6} y={ty(v) + 4} textAnchor="end" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{v}</text>
        </g>)}
        {Array.from({ length: SPAN + 1 }, (_, t) => <text key={t} x={tx(t)} y={TY0 + 14} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{t}</text>)}
        <text x={TX0 + 4} y={TY1 - 6} fontSize={12} fill={C.soft}>capacitor (V)</text>
        <text x={TX1} y={TY1 - 6} textAnchor="end" fontSize={12} fill={C.soft}>seconds since firing</text>
        <line x1={TX0} x2={TX1} y1={ty(READY * E)} y2={ty(READY * E)} stroke={C.ok} strokeDasharray="4 4" strokeWidth={1} />
        <text x={TX1 - 4} y={ty(READY * E) + 13} textAnchor="end" fontSize={11} fill={C.ok}>ready, 95 %</text>
        {target !== undefined && <g>
          <line x1={tx(target)} x2={tx(target)} y1={TY1} y2={TY0} stroke={C.ink} strokeDasharray="5 5" strokeWidth={1} />
          <text x={tx(target) + 5} y={TY1 + 12} fontSize={11} fill={C.ink}>target {target} s</text>
        </g>}
        <polyline ref={prevLine} fill="none" stroke={C.ghost} strokeWidth={1.8} />
        <polyline ref={line} fill="none" stroke={C.position} strokeWidth={2.5} />

        {adjustable && <Handle s={api} at={[xAt(R), WY]} onChange={(p) => move(p[0])} step={50 * (WX1 - WX0) / RMAX}
          clamp={(p) => [p[0], WY]} color={C.ink} label="Sliding contact on the resistance wire" />}
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        {E} V supply · 200 µF flash capacitor · grey trace: the charge before last
      </p>
    </SceneCard>
  );
}

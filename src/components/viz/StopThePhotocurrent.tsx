import { useEffect, useRef, useState } from 'react';
import {
  H, MERCURY_LINES, METALS, cutoffHz, emits, frequencyOf, kMaxEv, lineFit, photocurrent,
  planckFromPoints, stoppingVoltage, type Metal,
} from '../../lib/physics/photons.ts';
import { C, CheckBar, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { spectrumColour } from './photon-colour.ts';

/**
 * Millikan's measurement. A mercury lamp's lines shine one at a time on a
 * metal plate; a reverse voltage pushes back on the electrons crossing to the
 * collector. Raise it until the current just stops, and that colour's
 * stopping voltage lands as a point on the graph below (the lowest voltage at
 * which you saw zero current). Three colours make a line; its slope times e
 * is Planck's constant.
 *
 * Graded with `id`: at least three points, fitted h within `tolerance`.
 * Physics: photocurrent / stoppingVoltage / planckFromPoints in photons.ts.
 */
export interface StopThePhotocurrentProps {
  id?: string;
  prompt?: string;
  metal?: Metal;
  /** Relative tolerance on the fitted h. */
  tolerance?: number;
  /** Shown once solved; `{h}` is replaced by the fitted value. */
  explanation?: string;
}

const POWER = 10e-6, VMAX = 1.6, POOL = 40;
const CATH = 190, ANODE = 470, GAP = ANODE - CATH;
const PX_PER_SQRT_EV = 260; // drawn speed for 1 eV

export default function StopThePhotocurrent({ id, prompt, metal = 'sodium', tolerance = 0.04, explanation }: StopThePhotocurrentProps) {
  const task = useTask(id, 'stop-the-photocurrent');
  const phi = METALS[metal].phi;
  const [line, setLine] = useState(1);
  const [V, setV] = useState(0);
  const [pts, setPts] = useState<Record<number, number>>({});
  const cfg = useRef({ nm: MERCURY_LINES[1].nm as number, V: 0 });
  const nm = MERCURY_LINES[line].nm;
  cfg.current = { nm, V };
  const dots = useRef<(SVGCircleElement | null)[]>([]);

  const I = photocurrent(V, POWER, nm, phi);
  const lit = emits(nm, phi);

  // Record the lowest voltage at which this colour's current was seen to be zero.
  useEffect(() => {
    if (!lit || I > 0) return;
    setPts((p) => (p[line] === undefined || V < p[line] ? { ...p, [line]: V } : p));
  }, [I, V, line, lit]);

  useEffect(() => {
    const e = Array.from({ length: POOL }, () => ({ on: false, x: 0, y: 0, v: 0, age: 0 }));
    let raf = 0, last = performance.now(), due = 0, next = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const { nm: w, V: v } = cfg.current;
      const k = kMaxEv(w, phi);
      if (k > 0) due += 14 * dt; else due = 0;
      while (due >= 1) {
        due -= 1;
        const p = e[next]; next = (next + 1) % POOL;
        Object.assign(p, { on: true, x: CATH + 6, y: 70 + Math.random() * 80, v: PX_PER_SQRT_EV * Math.sqrt(k * Math.random()), age: 0 });
      }
      // uniform retarding field: v² falls by A²·V per GAP px, so a = −A²V / (2·GAP)
      const a = -(PX_PER_SQRT_EV ** 2) * v / (2 * GAP);
      e.forEach((p, i) => {
        if (p.on) {
          p.v += a * dt; p.x += p.v * dt; p.age += dt;
          if (p.x >= ANODE - 4 || p.x < CATH + 4 || p.age > 5) p.on = false;
        }
        const el = dots.current[i];
        if (el) { el.setAttribute('cx', p.x.toFixed(1)); el.setAttribute('cy', p.y.toFixed(1)); el.setAttribute('opacity', p.on ? '1' : '0'); }
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phi]);

  const measured = Object.entries(pts).map(([k, v]) => [frequencyOf(MERCURY_LINES[+k].nm), v] as const);
  const hFit = measured.length >= 2 ? planckFromPoints(measured) : NaN;
  const errRel = Math.abs(hFit / H - 1);
  const ok = measured.length >= 3 && errRel <= tolerance;
  // Which point is furthest from where its current first stops?
  const worst = Object.entries(pts).map(([k, v]) => ({ k: +k, dv: v - stoppingVoltage(MERCURY_LINES[+k].nm, phi) }))
    .sort((a, b) => b.dv - a.dv)[0];
  const fit = measured.length >= 2 ? lineFit(measured) : null;
  const col = spectrumColour(nm);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {MERCURY_LINES.map((l, i) => (
            <button key={l.nm} type="button" className="anth-btn" data-active={i === line}
              style={{ borderColor: i === line ? spectrumColour(l.nm) : undefined }}
              onClick={() => { setLine(i); setV(0); task.touch(); }}>
              {l.name} {Math.round(l.nm)} nm
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 220px' }}>
            <span className="hud-label">Reverse voltage</span>
            <input type="range" className="anth-slider" min={0} max={VMAX} step={0.01} value={V}
              aria-label="Reverse voltage, volts" onChange={(ev) => { setV(+ev.target.value); task.touch(); }} />
          </label>
          <span style={{ display: 'flex', gap: 22 }}>
            <Meter label="Voltage" value={V.toFixed(2)} unit="V" color={C.position} />
            <Meter label="Current" value={(I * 1e9).toFixed(2)} unit="nA" color={C.velocity} />
            <Meter label="Slope × e" value={Number.isFinite(hFit) ? (hFit * 1e34).toFixed(2) : '–'} unit="× 10⁻³⁴ J·s" color={C.energy} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(ok, { pts })}
          miss={measured.length < 3
            ? `${measured.length} colour${measured.length === 1 ? '' : 's'} measured. A line needs three points.`
            : `Your points give ${(hFit * 1e34).toFixed(2)} × 10⁻³⁴ J·s. The ${MERCURY_LINES[worst.k].name} point sits ${worst.dv.toFixed(2)} V above where its current first stops.`}
          hit={explanation?.replace('{h}', (hFit * 1e34).toFixed(2))} />}
      </div>}>
      <svg viewBox="0 0 640 262" role="img" style={{ width: '100%', display: 'block', fontFamily: 'var(--font-sans)' }}
        aria-label={`${MERCURY_LINES[line].name} light on ${metal}; reverse voltage ${V.toFixed(2)} volts; current ${(I * 1e9).toFixed(2)} nanoamps`}>
        <rect x={150} y={36} width={360} height={164} rx={40} fill="none" stroke={C.rule} strokeWidth={1.5} />
        {/* lamp and beam */}
        <polygon points={`40,34 60,20 ${CATH - 4},70 ${CATH - 4},150`} fill={col} opacity={lit ? 0.4 : 0.25} />
        <circle cx={44} cy={24} r={14} fill={C.surface} stroke={col} strokeWidth={3} />
        {/* plates */}
        <rect x={CATH - 4} y={60} width={10} height={100} rx={2} fill={C.soft} />
        <rect x={ANODE - 3} y={60} width={6} height={100} rx={2} fill={C.soft} />
        <text x={CATH} y={184} textAnchor="middle" fontSize={13} fill={C.soft}>{metal}</text>
        <text x={ANODE} y={184} textAnchor="middle" fontSize={13} fill={C.soft}>collector</text>
        {/* wires, battery, ammeter */}
        <polyline points={`${CATH},160 ${CATH},166 ${CATH - 70},166 ${CATH - 70},232 300,232`} fill="none" stroke={C.faint} strokeWidth={1.5} />
        <polyline points={`340,232 ${ANODE + 70},232 ${ANODE + 70},166 ${ANODE},166 ${ANODE},160`} fill="none" stroke={C.faint} strokeWidth={1.5} />
        <line x1={306} y1={220} x2={306} y2={244} stroke={C.ink} strokeWidth={2} />
        <line x1={318} y1={225} x2={318} y2={239} stroke={C.ink} strokeWidth={4} />
        <line x1={318} y1={232} x2={340} y2={232} stroke={C.faint} strokeWidth={1.5} />
        <text x={312} y={214} textAnchor="middle" fontSize={13} fill={C.position}>{V.toFixed(2)} V</text>
        <text x={ANODE + 78} y={206} fontSize={13} fill={C.soft}>collector</text><text x={ANODE + 78} y={222} fontSize={13} fill={C.soft}>held negative</text>
        {Array.from({ length: POOL }, (_, i) => (
          <circle key={i} ref={(el) => { dots.current[i] = el; }} r={3.2} fill={C.velocity} opacity={0} cx={0} cy={0} />
        ))}
        {!lit && <text x={330} y={112} textAnchor="middle" fontSize={14} fill={C.soft}>no electrons leave at this colour</text>}
      </svg>
      <Stage x={[4.5, 8.5]} y={[0, 1.4]} height={230}
        axes={{ x: 'frequency (10¹⁴ Hz)', y: 'stopping voltage (V)', xTicks: [5, 6, 7, 8], yTicks: [0, 0.5, 1] }}
        label={`Stopping voltage against frequency, ${measured.length} points measured`}>
        {(s) => <>
          {fit && (() => {
            const f0 = task.done ? cutoffHz(phi) / 1e14 : 6.6, f1 = 8.4;
            const y = (f: number) => fit.slope * f * 1e14 + fit.intercept;
            return <line x1={s.sx(f0)} y1={s.sy(y(f0))} x2={s.sx(f1)} y2={s.sy(y(f1))} stroke={C.energy} strokeWidth={2} strokeDasharray="6 5" />;
          })()}
          {task.done && <text x={s.sx(cutoffHz(phi) / 1e14)} y={s.sy(0) - 10} textAnchor="middle" fontSize={13} fill={C.soft}>cutoff</text>}
          {MERCURY_LINES.map((l, i) => (
            <line key={l.nm} x1={s.sx(frequencyOf(l.nm) / 1e14)} x2={s.sx(frequencyOf(l.nm) / 1e14)} y1={s.sy(0)} y2={s.sy(0) - 8}
              stroke={spectrumColour(l.nm)} strokeWidth={i === line ? 4 : 2} />
          ))}
          {Object.entries(pts).map(([k, v]) => (
            <circle key={k} cx={s.sx(frequencyOf(MERCURY_LINES[+k].nm) / 1e14)} cy={s.sy(v)} r={6}
              fill={spectrumColour(MERCURY_LINES[+k].nm)} stroke={C.ink} strokeWidth={1.5} />
          ))}
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        each point: the lowest voltage at which that colour's current read zero · slope × e is in J·s
      </p>
    </SceneCard>
  );
}

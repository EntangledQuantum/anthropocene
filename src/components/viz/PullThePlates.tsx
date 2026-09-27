import { useEffect, useState } from 'react';
import {
  atVoltage, cap, connect, energy, plateForce, pullConnected, pullIsolated, si, voltage, type Cap,
} from '../../lib/physics/capacitor.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { CapacitorPicture, GapLabel, PLATE_H } from './capacitor-kit-ch24.tsx';

/**
 * Two 10 cm plates, a battery and a switch. Drag the right plate by its
 * insulating handle; the dots (charge), orchid lines (field) and amber arrow
 * (the plates' attraction) all follow from capacitor.ts.
 *
 * Switch open: Q stays put, so pulling apart raises V and U and the pull does
 * not weaken. Switch closed: V stays put, so the charge drains back into the
 * battery as the gap grows.
 *
 * Graded with `id` and one target:
 *   `targetQ`  hold this multiple of the starting charge (switch stays closed);
 *   `targetV`  make the plates read this voltage with the switch open.
 * `switchable` adds the one other control, the switch. `ledger` shows where
 * the energy went: your work and the battery's, next to the field's.
 */
export interface PullThePlatesProps {
  id?: string;
  prompt?: string;
  /** Battery, volts. */
  volts?: number;
  /** Starting gap, mm. The plates start charged by the battery at this gap. */
  gap?: number;
  /** How far the plate can move, mm. */
  range?: [number, number];
  /** Switch closed at the start. */
  closed?: boolean;
  switchable?: boolean;
  targetQ?: number;
  targetV?: number;
  ledger?: boolean;
  explanation?: string;
}

const AREA = 0.01; // 10 cm × 10 cm
const MM = 1e-3;
const LINE_E = 500; // V/m per field line
const MM_PER_UN = 0.25; // force arrow length, mm per µN

export default function PullThePlates({
  id, prompt, volts = 12, gap: gap0 = 2, range = [1, 6], closed: closed0 = true, switchable = false,
  targetQ, targetV, ledger = false, explanation,
}: PullThePlatesProps) {
  const graded = Boolean(id && (targetQ !== undefined || targetV !== undefined));
  const task = useTask(graded ? id : undefined, 'pull-the-plates');
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);

  const start = (): Cap => atVoltage(cap(AREA, gap0 * MM), volts);
  const [c, setC] = useState<Cap>(start);
  const [closed, setClosed] = useState(closed0);
  const [work, setWork] = useState({ you: 0, battery: 0 });
  const q0 = start().q;
  const U0 = energy(start());

  const moveTo = (gapMm: number) => {
    const m = closed ? pullConnected(c, volts, gapMm * MM) : pullIsolated(c, gapMm * MM);
    setC(m.after);
    setWork((w) => ({ you: w.you + m.you, battery: w.battery + m.battery }));
    task.touch();
  };
  const flip = () => {
    if (!closed) {
      const m = connect(c, volts);
      setC(m.after);
      setWork((w) => ({ ...w, battery: w.battery + m.battery }));
    }
    setClosed(!closed);
    task.touch();
  };
  const reset = () => { setC(start()); setClosed(closed0); setWork({ you: 0, battery: 0 }); task.touch(); };

  const gap = c.gap / MM;
  const V = voltage(c);
  const U = energy(c);
  const F = plateForce(c);
  const ratio = c.q / q0;

  let hit = false;
  let miss = '';
  if (targetQ !== undefined) {
    hit = Math.abs(ratio - targetQ) <= 0.05 * targetQ;
    miss = `The plates hold ${ratio.toFixed(2)}× the charge they started with, ${gap.toFixed(1)} mm apart.`;
  } else if (targetV !== undefined) {
    hit = !closed && Math.abs(V - targetV) <= 1;
    miss = closed
      ? `The switch is closed, so the battery holds the plates at ${volts.toFixed(1)} V at any gap.`
      : `Open, with ${si(c.q, 'C')} on the plates ${gap.toFixed(1)} mm apart: ${V.toFixed(1)} V.`;
  }

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {switchable && <button type="button" className="anth-btn" onClick={flip}>
            {closed ? 'Open the switch' : 'Close the switch'}</button>}
          <button type="button" className="anth-btn" onClick={reset}>Start over</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            {!ledger && <Meter label="Charge" value={si(c.q, 'C')} color={C.ink} />}
            <Meter label="Voltage" value={`${V.toFixed(1)} V`} color={C.ink} />
            <Meter label="Field energy" value={si(U, 'J')} color={C.energy} />
            {ledger && <Meter label="Your pull did" value={si(work.you, 'J')} color={C.force} />}
            {ledger && <Meter label="Into the battery" value={si(-work.battery, 'J')} color={C.ink} />}
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={live && task.done}
          onCheck={() => task.check(hit, { gap, closed, V, ratio })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-4.6, 7.4]} y={[-2.7, 13]} height={340}
        label={`Two plates ${gap.toFixed(1)} millimetres apart, switch ${closed ? 'closed' : 'open'}. ${si(c.q, 'C')} on the plates, ${V.toFixed(1)} volts, ${si(U, 'J')} stored.`}>
        {(s) => {
          const yRail = 12, xb = -3.5;
          const wire = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${s.sx(x)},${s.sy(y)}`).join('');
          return <>
            {/* the circuit: + terminal to the left plate, − terminal through the switch to the right */}
            <path d={wire([[0, 5], [xb, 5], [xb, 7.3]])} fill="none" stroke={C.faint} strokeWidth={1.8} />
            <path d={wire([[xb, 8.1], [xb, yRail], [-2.3, yRail]])} fill="none" stroke={C.faint} strokeWidth={1.8} />
            <path d={wire([[-1.1, yRail], [gap, yRail], [gap, PLATE_H]])} fill="none" stroke={C.faint} strokeWidth={1.8} />
            <line x1={s.sx(xb) - 16} x2={s.sx(xb) + 16} y1={s.sy(7.3)} y2={s.sy(7.3)} stroke={C.ink} strokeWidth={2} />
            <line x1={s.sx(xb) - 8} x2={s.sx(xb) + 8} y1={s.sy(8.1)} y2={s.sy(8.1)} stroke={C.ink} strokeWidth={4} />
            <text x={s.sx(xb) - 22} y={s.sy(7.7) + 5} textAnchor="end" fontSize={14} fill={C.soft}>{volts} V</text>
            <circle cx={s.sx(-2.3)} cy={s.sy(yRail)} r={3.5} fill={C.soft} />
            <circle cx={s.sx(-1.1)} cy={s.sy(yRail)} r={3.5} fill={C.soft} />
            <line x1={s.sx(-2.3)} y1={s.sy(yRail)} x2={closed ? s.sx(-1.1) : s.sx(-1.3)} y2={closed ? s.sy(yRail) : s.sy(yRail + 0.85)}
              stroke={closed ? C.ink : C.warn} strokeWidth={2.5} strokeLinecap="round" />
            <text x={s.sx(-1.7)} y={s.sy(yRail) - 22} textAnchor="middle" fontSize={13} fill={closed ? C.soft : C.warn}>
              {closed ? 'closed' : 'open'}</text>
            <CapacitorPicture s={s} c={c} lineE={LINE_E} />
            <GapLabel s={s} gap={gap} y={-0.45} />
            {/* the insulating handle, and the attraction on the plate you hold */}
            <line x1={s.sx(gap) + 4} x2={s.sx(gap) + 4} y1={s.sy(0)} y2={s.sy(-2)} stroke={C.ghost} strokeWidth={5} strokeLinecap="round" />
            <Arrow s={s} from={[gap, 10.6]} to={[gap - F * 1e6 * MM_PER_UN, 10.6]} color={C.force}
              label={`attraction ${si(F, 'N')}`} />
            <Handle s={s} at={[gap, -2]} color={C.ink} step={0.1} label="Right plate: drag sideways"
              clamp={(p) => [Math.min(range[1], Math.max(range[0], Math.round(p[0] * 20) / 20)), -2]}
              onChange={(p) => { if (Math.abs(p[0] - gap) > 1e-9) moveTo(p[0]); }} />
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        10 cm plates, gap drawn enlarged · rose dots: +, violet: − · orchid: field lines · amber: the pull between the plates
        {ledger ? ` · field energy started at ${si(U0, 'J')}` : ''}
      </p>
    </SceneCard>
  );
}

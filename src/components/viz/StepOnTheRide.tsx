import { useEffect, useRef, useState } from 'react';
import {
  RIDE, diskAboutAxle, radToRpm, rpmToRad, skidStep, spinEnergy, type Skid,
} from '../../lib/physics/torque.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';

/**
 * A playground merry-go-round from above, spinning freely. A child standing
 * beside it steps on, from rest, at the spot you choose. Her shoes skid on
 * the deck for a moment, and kinetic friction drags her up to speed and the
 * deck down, equal and opposite (`skidStep` in src/lib/physics/torque.ts).
 * The total angular momentum is the same before and after; the kinetic
 * energy is not.
 *
 * With `id` and `target` (rpm) it grades itself.
 */
export interface StepOnTheRideProps {
  id?: string;
  prompt?: string;
  target?: number;
  tolerance?: number;
  explanation?: string;
}

interface Sim { stepped: boolean; skid: Skid; thD: number; thC: number; r: number }

export default function StepOnTheRide({ id, prompt, target, tolerance = 0.25, explanation }: StepOnTheRideProps) {
  const graded = Boolean(id && target !== undefined);
  const task = useTask(graded ? id : undefined, 'step-on-the-ride');
  const I0 = diskAboutAxle(RIDE.M, RIDE.R);
  const w0 = rpmToRad(RIDE.rpm0);
  const fresh = (r: number): Sim => ({ stepped: false, skid: { wd: w0, wc: 0, slipping: false }, thD: 0, thC: 0, r });
  const [r, setR] = useState(0.8);
  const sim = useRef<Sim>(fresh(0.8));
  const deck = useRef<SVGGElement>(null);
  const kid = useRef<SVGGElement>(null);
  const [shown, setShown] = useState({ stepped: false, slipping: false, wd: w0, wc: 0 });

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const s = sim.current;
      const n = 40;
      for (let k = 0; k < n; k++) {
        if (s.stepped) s.skid = skidStep(RIDE, s.r, s.skid, dt / n);
        s.thD += s.skid.wd * (dt / n);
        if (s.stepped) s.thC += s.skid.wc * (dt / n);
      }
      const g = deck.current, c = kid.current;
      if (g) g.setAttribute('transform', `rotate(${(-s.thD * 180) / Math.PI} ${g.dataset.cx} ${g.dataset.cy})`);
      if (c) c.setAttribute('transform', `rotate(${(-s.thC * 180) / Math.PI} ${c.dataset.cx} ${c.dataset.cy})`);
      if (now - lastShown > 120) {
        lastShown = now;
        setShown({ stepped: s.stepped, slipping: s.skid.slipping, wd: s.skid.wd, wc: s.skid.wc });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const Ic = RIDE.child * r * r;
  const rpm = radToRpm(shown.wd);
  const L = shown.stepped ? I0 * shown.wd + Ic * shown.wc : I0 * shown.wd;
  const K = shown.stepped ? spinEnergy(I0, shown.wd) + spinEnergy(Ic, shown.wc) : spinEnergy(I0, shown.wd);
  const settled = shown.stepped && !shown.slipping;
  const off = target !== undefined ? rpm - target : 0;
  const hit = graded && settled && Math.abs(off) <= tolerance;

  const stepOn = () => { sim.current = { ...sim.current, stepped: true, thC: 0, r, skid: { wd: sim.current.skid.wd, wc: 0, slipping: true } }; task.touch(); };
  const reset = () => { const th = sim.current.thD; sim.current = { ...fresh(r), thD: th }; setShown({ stepped: false, slipping: false, wd: w0, wc: 0 }); task.touch(); };

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" style={{ padding: '10px 20px' }} onClick={stepOn} disabled={shown.stepped}>
            {shown.stepped ? (shown.slipping ? 'Skidding…' : 'On the ride') : 'Step on'}
          </button>
          <button type="button" className="anth-btn" onClick={reset}>Start over</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Ride's spin" value={rpm.toFixed(1)} unit="rpm" color={C.velocity} />
            <Meter label="Total L" value={L.toFixed(0)} unit="kg·m²/s" color={C.ink} />
            <Meter label="Kinetic energy" value={K.toFixed(0)} unit="J" color={C.energy} />
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { r, rpm })}
          miss={!shown.stepped ? 'She is still standing beside the ride. Step her on first.'
            : `The ride turns at ${rpm.toFixed(1)} rpm, ${Math.abs(off).toFixed(1)} ${off > 0 ? 'above' : 'below'} ${target}. Standing ${r.toFixed(2)} m out, she adds ${Ic.toFixed(0)} kg·m² to its ${I0.toFixed(0)}.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-1.9, 1.9]} y={[-1.75, 1.75]} height={360} equal
        label={`Merry-go-round from above, turning at ${rpm.toFixed(1)} rpm. The child steps on ${r.toFixed(2)} metres from the axle.`}>
        {(s) => {
          const cx = s.sx(0), cy = s.sy(0), px = s.len(1);
          return <>
            <g ref={deck} data-cx={cx} data-cy={cy}>
              <circle cx={cx} cy={cy} r={RIDE.R * px} fill={C.surface} stroke={C.soft} strokeWidth={2.5} />
              {[0, 1, 2, 3, 4, 5].map((k) => {
                const a = (k * Math.PI) / 3;
                return <line key={k} x1={cx} y1={cy} x2={cx + RIDE.R * px * Math.cos(a)} y2={cy - RIDE.R * px * Math.sin(a)}
                  stroke={k === 0 ? C.velocity : C.grid} strokeWidth={k === 0 ? 3 : 1.5} />;
              })}
              <circle cx={cx} cy={cy} r={0.12 * px} fill={C.surface} stroke={C.ink} strokeWidth={2} />
            </g>
            {!shown.stepped && <line x1={cx} y1={cy} x2={s.sx(RIDE.R + 0.3)} y2={cy} stroke={C.faint} strokeDasharray="3 5" />}
            <g ref={kid} data-cx={cx} data-cy={cy}>
              {shown.stepped && <>
                <circle cx={s.sx(r)} cy={cy} r={0.14 * px} fill={C.surface} stroke={C.ink} strokeWidth={2.5} />
                <text x={s.sx(r)} y={cy + 4} textAnchor="middle" fontSize={11} fill={C.ink}>{RIDE.child}</text>
              </>}
            </g>
            {!shown.stepped && <>
              <circle cx={s.sx(r)} cy={cy} r={0.14 * px} fill="none" stroke={C.ink} strokeWidth={2} strokeDasharray="4 3" />
              <text x={s.sx(r)} y={cy - 0.2 * px} textAnchor="middle" fontSize={13} fill={C.soft}
                stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">steps on at {r.toFixed(2)} m</text>
              <Handle s={s} at={[r, 0] as Vec} step={0.02} label="Where she steps on: distance from the axle"
                onChange={(p) => { const v = Math.min(RIDE.R - 0.05, Math.max(0.2, p[0])); setR(v); sim.current.r = v; task.touch(); }} />
            </>}
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        ride {RIDE.M} kg, {RIDE.R} m radius, I = {I0.toFixed(0)} kg·m², frictionless axle · child {RIDE.child} kg, standing still before she steps on
      </p>
    </SceneCard>
  );
}

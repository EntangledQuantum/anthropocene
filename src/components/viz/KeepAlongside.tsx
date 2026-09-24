import { useEffect, useRef, useState } from 'react';
import { conversionFactor } from '../../lib/physics/dimensions.ts';
import { gapAfter } from '../../lib/physics/language-ch1.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';

/**
 * Two cars on a straight road, seen from above. Car A holds a speed on a
 * km/h speedometer. Car B's speedometer reads m/s, and you set it.
 *
 * The camera rides with A, so the only thing on screen that moves is the gap.
 * The cyan arrows are both speeds drawn to one scale, in SI: when the cars
 * keep pace the arrows are the same length while the two numbers disagree.
 * That is the whole of unit conversion, before any arithmetic.
 *
 * Physics: speeds converted through the unit registry (`gapAfter`,
 * `conversionFactor` from dimensions.ts).
 */
export interface KeepAlongsideProps {
  id?: string;
  prompt?: string;
  /** Car A's speed, km/h. */
  speedA?: number;
  /** Car B's starting speed, m/s. */
  startB?: number;
  /** m/s either side of the match that counts. */
  tolerance?: number;
  explanation?: string;
}

const PX_PER_M = 2.2;      // road scale
const PX_PER_MPS = 2.4;    // arrow scale
const AX = 190;            // A's screen position

export default function KeepAlongside({ id, prompt, speedA = 90, startB = 50, tolerance = 0.25, explanation }: KeepAlongsideProps) {
  const task = useTask(id, 'keep-alongside');
  const [vB, setVB] = useState(startB);
  const vBRef = useRef(vB);
  vBRef.current = vB;
  const gap = useRef(0);
  const road = useRef(0);
  const carB = useRef<SVGGElement>(null);
  const dashes = useRef<SVGGElement>(null);
  const flag = useRef<SVGTextElement>(null);
  const [shownGap, setShownGap] = useState(0);

  const aSI = speedA * conversionFactor('kmh', 'mps');
  const A = { value: speedA, unit: 'kmh' };

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      gap.current += gapAfter(dt, A, { value: vBRef.current, unit: 'mps' });
      road.current = (road.current + aSI * dt * PX_PER_M) % 48;
      const raw = AX + gap.current * PX_PER_M;
      const x = Math.max(28, Math.min(612, raw));
      carB.current?.setAttribute('transform', `translate(${x}, 0)`);
      dashes.current?.setAttribute('transform', `translate(${-road.current}, 0)`);
      if (flag.current) {
        const off = raw > 612 ? 'ahead' : raw < 28 ? 'behind' : '';
        flag.current.textContent = off ? `B is ${Math.abs(gap.current).toFixed(0)} m ${off}` : '';
        flag.current.setAttribute('x', String(raw > 612 ? 600 : 40));
        flag.current.setAttribute('text-anchor', raw > 612 ? 'end' : 'start');
      }
      if (now - lastShown > 125) { lastShown = now; setShownGap(gap.current); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [aSI]);

  const startOver = () => { gap.current = 0; setShownGap(0); task.touch(); };
  const rate = gapAfter(1, A, { value: vB, unit: 'mps' });
  const matched = Math.abs(vB - aSI) <= tolerance;

  const car = (label: string, speedLabel: string, vSI: number, y: number, color: string) => (
    <>
      <rect x={-26} y={y - 13} width={52} height={26} rx={7} fill={C.surface} stroke={color} strokeWidth={2} />
      <text x={0} y={y + 5} textAnchor="middle" fontSize={14} fontWeight={600} fill={color}>{label}</text>
      <line x1={30} x2={30 + vSI * PX_PER_MPS - 10} y1={y} y2={y} stroke={C.velocity} strokeWidth={3} strokeLinecap="round" />
      {vSI * PX_PER_MPS > 12 && <path d={`M${30 + vSI * PX_PER_MPS},${y} l-12,-6 l0,12 z`} fill={C.velocity} />}
      <text x={34} y={y - 12} fontSize={14} fill={C.velocity} fontFamily="var(--font-mono)"
        stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{speedLabel}</text>
    </>
  );

  return (
    <SceneCard id={id} prompt={prompt}
      footer={
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ flex: '1 1 240px', display: 'block' }}>
              <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="hud-label">Car B's speedometer</span>
                <span className="readout" style={{ color: C.velocity }}>{vB.toFixed(1)} m/s</span>
              </span>
              <input type="range" className="anth-slider" min={0} max={100} step={0.5} value={vB} aria-label="Car B's speed in metres per second"
                onChange={(e) => { setVB(+e.target.value); task.touch(); }} disabled={task.done} />
            </label>
            <button type="button" className="anth-btn" onClick={startOver}>Start over</button>
            <Meter label="B ahead of A" value={shownGap.toFixed(0)} unit="m" />
          </div>
          {id && <CheckBar verdict={task.verdict} done={task.done}
            onCheck={() => task.check(matched, { vB })}
            miss={`B ${rate > 0 ? 'gains' : 'loses'} ${Math.abs(rate).toFixed(1)} m on A every second.`}
            hit={explanation} />}
        </div>
      }>
      <svg viewBox="0 0 640 190" role="img" style={{ width: '100%', display: 'block' }}
        aria-label={`Car A at ${speedA} kilometres per hour, car B at ${vB} metres per second, B ${shownGap.toFixed(0)} metres ahead`}>
        <rect x={0} y={30} width={640} height={130} fill="none" />
        <line x1={0} x2={640} y1={34} y2={34} stroke={C.rule} strokeWidth={2} />
        <line x1={0} x2={640} y1={156} y2={156} stroke={C.rule} strokeWidth={2} />
        <g ref={dashes}>
          {Array.from({ length: 16 }, (_, i) => <line key={i} x1={i * 48} x2={i * 48 + 24} y1={95} y2={95} stroke={C.grid} strokeWidth={2} />)}
        </g>
        <g transform={`translate(${AX}, 0)`}>{car('A', `${speedA} km/h`, aSI, 64, C.soft)}</g>
        <g ref={carB} transform={`translate(${AX}, 0)`}>{car('B', `${vB.toFixed(1)} m/s`, vB, 126, C.position)}</g>
        <text ref={flag} x={600} y={182} textAnchor="end" fontSize={13} fill={C.warn} />
        <line x1={AX} x2={AX} y1={36} y2={154} stroke={C.grid} strokeDasharray="3 5" />
      </svg>
    </SceneCard>
  );
}

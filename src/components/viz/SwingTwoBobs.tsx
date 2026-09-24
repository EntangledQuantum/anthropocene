import { useEffect, useRef, useState } from 'react';
import { swingPendulum, type Swing } from '../../lib/physics/language-ch1.ts';
import { C, Meter, SceneCard } from './scene.tsx';

/**
 * Two pendulums on identical strings, released together. The left bob is
 * fixed; you choose the right bob's mass, from a marble to a bag of flour.
 *
 * Each bob is integrated on its own with its own mass (torque −m g L sin θ,
 * inertia m L², `swingPendulum` in language-ch1.ts). The mass is in both and
 * cancels, so they keep step whatever you pick. Ungraded: it is the payoff
 * of the chapter's opening bet.
 */
export interface SwingTwoBobsProps {
  prompt?: string;
  /** String length, metres. */
  length?: number;
  /** Release angle, degrees. */
  release?: number;
  leftMass?: number;
}

const G = 9.81;
const DT = 1 / 600;
const PX_PER_M = 190;
const M_MIN = 0.05, M_MAX = 5;

export default function SwingTwoBobs({ prompt, length = 1, release = 22, leftMass = 0.5 }: SwingTwoBobsProps) {
  const [mass, setMass] = useState(5);
  const massRef = useRef(mass);
  massRef.current = mass;
  const swings = useRef<[Swing, Swing]>([start(release), start(release)]);
  const counts = useRef<[number, number]>([0, 0]);
  const bobs = useRef<(SVGGElement | null)[]>([null, null]);
  const strings = useRef<(SVGLineElement | null)[]>([null, null]);
  const [shown, setShown] = useState<[number, number]>([0, 0]);

  const pivots = [210, 430];
  const pivotY = 36;
  const Lpx = length * PX_PER_M;
  const radius = (m: number) => 13 * Math.cbrt(m / 0.5);

  const releaseAgain = () => {
    swings.current = [start(release), start(release)];
    counts.current = [0, 0];
    setShown([0, 0]);
  };

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const masses = [leftMass, massRef.current];
      for (let k = 0; k < Math.round(dt / DT); k++) {
        for (let i = 0; i < 2; i++) {
          const before = swings.current[i];
          const after = swingPendulum(before, { L: length, g: G, m: masses[i] }, DT);
          // one full swing each time it passes the bottom heading back the way it was released
          if (before.theta < 0 && after.theta >= 0) counts.current[i] += 1;
          swings.current[i] = after;
        }
      }
      for (let i = 0; i < 2; i++) {
        const th = swings.current[i].theta;
        const x = pivots[i] + Lpx * Math.sin(th), y = pivotY + Lpx * Math.cos(th);
        strings.current[i]?.setAttribute('x2', String(x));
        strings.current[i]?.setAttribute('y2', String(y));
        bobs.current[i]?.setAttribute('transform', `translate(${x}, ${y})`);
      }
      if (now - lastShown > 125) { lastShown = now; setShown([counts.current[0], counts.current[1]]); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [length, leftMass]);

  const masses = [leftMass, mass];
  const a0 = (release * Math.PI) / 180;

  return (
    <SceneCard prompt={prompt}
      footer={
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label style={{ display: 'block' }}>
              <span className="hud-label">Right bob mass</span>
              <input type="range" className="anth-slider" min={0} max={1000} step={1} aria-label="Right bob mass"
                value={Math.round((1000 * Math.log(mass / M_MIN)) / Math.log(M_MAX / M_MIN))}
                onChange={(e) => setMass(M_MIN * (M_MAX / M_MIN) ** (+e.target.value / 1000))} />
            </label>
          </div>
          <button type="button" className="anth-btn" onClick={releaseAgain}>Release again</button>
          <span style={{ display: 'flex', gap: 22 }}>
            <Meter label="Left swings" value={String(shown[0])} />
            <Meter label="Right swings" value={String(shown[1])} />
          </span>
        </div>
      }>
      <svg viewBox="0 0 640 290" role="img" style={{ width: '100%', display: 'block' }}
        aria-label={`Two pendulums of length ${length} metres, bobs of ${leftMass} and ${mass.toFixed(2)} kilograms`}>
        <line x1={120} x2={520} y1={pivotY} y2={pivotY} stroke={C.rule} strokeWidth={3} />
        {pivots.map((px, i) => {
          const th = swings.current[i].theta;
          const x = px + Lpx * Math.sin(th), y = pivotY + Lpx * Math.cos(th);
          return (
            <g key={i}>
              {/* the release arc, for scale */}
              <path d={`M${px + Lpx * Math.sin(-a0)},${pivotY + Lpx * Math.cos(a0)} A${Lpx},${Lpx} 0 0 0 ${px + Lpx * Math.sin(a0)},${pivotY + Lpx * Math.cos(a0)}`}
                fill="none" stroke={C.grid} strokeDasharray="3 5" />
              <line x1={px} y1={pivotY + 8} x2={px} y2={pivotY + Lpx + 26} stroke={C.grid} strokeDasharray="2 6" />
              <line ref={(el) => { strings.current[i] = el; }} x1={px} y1={pivotY} x2={x} y2={y} stroke={C.soft} strokeWidth={1.5} />
              <circle cx={px} cy={pivotY} r={4} fill={C.soft} />
              <g ref={(el) => { bobs.current[i] = el; }} transform={`translate(${x}, ${y})`}>
                <circle r={radius(masses[i])} fill={C.surface} stroke={i === 0 ? C.soft : C.position} strokeWidth={2.5} />
              </g>
              <text x={px} y={284} textAnchor="middle" fontSize={14} fill={i === 0 ? C.soft : C.position} fontFamily="var(--font-mono)">
                {masses[i] < 1 ? `${Math.round(masses[i] * 1000)} g` : `${masses[i].toFixed(1)} kg`}
              </text>
            </g>
          );
        })}
        {/* scale bar: the string length */}
        <line x1={560} x2={560} y1={pivotY} y2={pivotY + Lpx} stroke={C.faint} strokeWidth={1.2} />
        <line x1={554} x2={566} y1={pivotY} y2={pivotY} stroke={C.faint} strokeWidth={1.2} />
        <line x1={554} x2={566} y1={pivotY + Lpx} y2={pivotY + Lpx} stroke={C.faint} strokeWidth={1.2} />
        <text x={572} y={pivotY + Lpx / 2 + 5} fontSize={13} fill={C.soft}>{length} m</text>
      </svg>
    </SceneCard>
  );
}

function start(deg: number): Swing {
  return { theta: (deg * Math.PI) / 180, omega: 0, t: 0 };
}

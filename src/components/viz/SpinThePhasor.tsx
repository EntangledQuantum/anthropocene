import { useRef, useState } from 'react';
import { MAINS, angleAt, deg, rad, risingAt, wrap } from '../../lib/physics/ac.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';

/**
 * The mains as an arrow. One control: grab the tip of a 325 V arrow and turn
 * it. Its height, the shadow, is the supply voltage at that instant, and a
 * dashed line carries that height across to the time axis, where every angle
 * you have visited inks in a piece of the wave. Turn it once and you have
 * drawn one 20 ms cycle of 50 Hz mains.
 *
 * Graded (`id` + `target`): put the arrow at the instant the supply reads
 * `target.volts` on its rising or falling side. Two angles share every height;
 * only the direction of turning tells them apart.
 * Physics: angleAt / risingAt in src/lib/physics/ac.ts.
 */
export interface SpinThePhasorProps {
  id?: string;
  prompt?: string;
  target?: { volts: number; falling: boolean };
  /** Starting angle, degrees. */
  start?: number;
  /** Degrees that count as on the instant. */
  tolerance?: number;
  explanation?: string;
}

const V0 = MAINS.peak, PERIOD_MS = 1000 / MAINS.hz;
const CX = 150, CY = 160, R = 108;            // the arrow's circle, px; R ↔ 325 V
const X0 = 318, X1 = 590;                      // the time axis, 0 → 20 ms
const BINS = 180;
const tx = (theta: number) => X0 + (theta / (2 * Math.PI)) * (X1 - X0);
const vy = (v: number) => CY - (v / V0) * R;
const pos = (theta: number) => (theta % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

export default function SpinThePhasor({ id, prompt, target, start = 0, tolerance = 6, explanation }: SpinThePhasorProps) {
  const graded = Boolean(id && target);
  const task = useTask(graded ? id : undefined, 'spin-the-phasor');
  const [theta, setTheta] = useState(rad(start));
  const [seen, setSeen] = useState<boolean[]>(() => { const s = Array(BINS).fill(false); s[Math.floor(pos(rad(start)) / (2 * Math.PI) * BINS) % BINS] = true; return s; });
  const drag = useRef(false);

  const turnTo = (t: number) => {
    const a = pos(t);
    setSeen((old) => {
      // ink every bin between the old angle and the new one, the short way round
      const out = old.slice();
      const from = pos(theta), d = wrap(a - from), n = Math.ceil(Math.abs(d) / (2 * Math.PI / BINS)) + 1;
      for (let k = 0; k <= n; k++) out[Math.floor(pos(from + (d * k) / n) / (2 * Math.PI) * BINS) % BINS] = true;
      return out;
    });
    setTheta(a);
    task.touch();
  };
  const fromPointer = (e: React.PointerEvent<SVGElement>) => {
    const svg = (e.target as SVGElement).ownerSVGElement ?? (e.target as SVGSVGElement);
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    turnTo(Math.atan2(CY - p.y, p.x - CX));
  };

  const v = V0 * Math.sin(theta);
  const tip = [CX + R * Math.cos(theta), CY - R * Math.sin(theta)] as const;
  const ms = (pos(theta) / (2 * Math.PI)) * PERIOD_MS;
  const want = target ? angleAt(target.volts, V0, target.falling) : 0;
  const hit = target ? Math.abs(deg(wrap(theta - want))) <= tolerance : false;
  const sgn = (x: number) => (Math.abs(x) < 0.5 ? '0' : `${x > 0 ? '+' : '−'}${Math.abs(x).toFixed(0)}`);

  // the inked wave: consecutive visited bins joined
  const segs: string[] = [];
  let run: string[] = [];
  for (let k = 0; k <= BINS; k++) {
    if (k < BINS && seen[k]) {
      const a = ((k + 0.5) / BINS) * 2 * Math.PI;
      run.push(`${tx(a).toFixed(1)},${vy(V0 * Math.sin(a)).toFixed(1)}`);
    } else if (run.length) { segs.push(run.join(' ')); run = []; }
  }

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Supply now" value={sgn(v)} unit="V" color={C.position} />
          <Meter label="Into the cycle" value={ms.toFixed(1)} unit="ms" />
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { deg: deg(theta) })}
          miss={`Your arrow's shadow reads ${sgn(v)} V and is ${risingAt(theta) ? 'rising' : 'falling'}, ${ms.toFixed(1)} ms into the cycle. The instant you want is ${sgn(target!.volts)} V and ${target!.falling ? 'falling' : 'rising'}.`}
          hit={explanation} />}
      </div>}>
      <svg viewBox="0 0 640 320" role="img" style={{ width: '100%', display: 'block', touchAction: 'none', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`A 325 volt arrow at ${deg(pos(theta)).toFixed(0)} degrees. Its shadow reads ${v.toFixed(0)} volts.`}>
        {/* shared voltage scale */}
        {[V0, V0 / 2, 0, -V0 / 2, -V0].map((u) => <g key={u}>
          <line x1={CX - R - 14} x2={X1} y1={vy(u)} y2={vy(u)} stroke={u === 0 ? C.rule : C.grid} />
          <text x={X1 + 6} y={vy(u) + 4} fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{sgn(u)}</text>
        </g>)}
        <text x={X1 + 6} y={vy(V0) - 12} fontSize={12} fill={C.soft}>volts</text>
        {[0, 5, 10, 15, 20].map((t) => <g key={t}>
          <line x1={X0 + (t / PERIOD_MS) * (X1 - X0)} x2={X0 + (t / PERIOD_MS) * (X1 - X0)} y1={vy(V0)} y2={vy(-V0)} stroke={C.grid} />
          <text x={X0 + (t / PERIOD_MS) * (X1 - X0)} y={vy(-V0) + 18} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{t}</text>
        </g>)}
        <text x={X1} y={vy(-V0) + 36} textAnchor="end" fontSize={12} fill={C.soft}>time into the cycle (ms)</text>

        {/* the circle and its turning direction */}
        <circle cx={CX} cy={CY} r={R} fill="none" stroke={C.rule} strokeDasharray="3 5" />
        <path d={`M${CX + (R + 18) * Math.cos(rad(-30))},${CY - (R + 18) * Math.sin(rad(-30))} A${R + 18},${R + 18} 0 0 0 ${CX + (R + 18) * Math.cos(rad(20))},${CY - (R + 18) * Math.sin(rad(20))}`}
          fill="none" stroke={C.faint} strokeWidth={1.5} markerEnd="url(#spin-head)" />
        <defs><marker id="spin-head" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 Z" fill={C.faint} /></marker></defs>
        <text x={CX} y={CY + R + 34} textAnchor="middle" fontSize={12} fill={C.faint}>turns anticlockwise, once per 20 ms</text>

        {/* the shadow carried across to the time axis */}
        <line x1={tip[0]} y1={tip[1]} x2={tx(pos(theta))} y2={tip[1]} stroke={C.position} strokeDasharray="4 4" strokeWidth={1.2} />
        <line x1={CX} x2={CX} y1={CY} y2={tip[1]} stroke={C.position} strokeWidth={6} strokeOpacity={0.45} strokeLinecap="round" />
        {segs.map((p, k) => <polyline key={k} points={p} fill="none" stroke={C.position} strokeWidth={2.5} />)}
        <circle cx={tx(pos(theta))} cy={tip[1]} r={5} fill={C.position} />
        {target && <text x={X0} y={vy(V0) - 12} fontSize={12} fill={C.ink}>
          wanted: {sgn(target.volts)} V, {target.falling ? 'falling' : 'rising'}</text>}

        {/* the arrow */}
        <line x1={CX} y1={CY} x2={tip[0] - 12 * Math.cos(theta)} y2={tip[1] + 12 * Math.sin(theta)} stroke={C.position} strokeWidth={3.5} strokeLinecap="round" />
        <path d={`M${tip[0]},${tip[1]} L${tip[0] - 14 * Math.cos(theta) + 6 * Math.sin(theta)},${tip[1] + 14 * Math.sin(theta) + 6 * Math.cos(theta)} L${tip[0] - 14 * Math.cos(theta) - 6 * Math.sin(theta)},${tip[1] + 14 * Math.sin(theta) - 6 * Math.cos(theta)} Z`} fill={C.position} />
        <text x={CX - R + 4} y={CY - R + 4} fontSize={13} fill={C.position}>325 V arrow</text>
        <circle cx={tip[0]} cy={tip[1]} r={20} fill="transparent" style={{ cursor: 'grab' }}
          tabIndex={0} role="slider" aria-label="The arrow's tip: drag it round the circle"
          aria-valuetext={`${deg(pos(theta)).toFixed(0)} degrees, ${v.toFixed(0)} volts`}
          onPointerDown={(e) => { drag.current = true; (e.target as Element).setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { if (drag.current) fromPointer(e); }}
          onPointerUp={() => { drag.current = false; }}
          onKeyDown={(e) => {
            const d = { ArrowRight: 3, ArrowUp: 3, ArrowLeft: -3, ArrowDown: -3 }[e.key];
            if (d === undefined) return;
            e.preventDefault(); turnTo(theta + rad(d));
          }} />
        <circle cx={tip[0]} cy={tip[1]} r={9} fill={C.surface} stroke={C.position} strokeWidth={2.5} pointerEvents="none" />
      </svg>
    </SceneCard>
  );
}

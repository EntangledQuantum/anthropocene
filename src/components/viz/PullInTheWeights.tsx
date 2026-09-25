import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { CHAIR, TWO_PI, chairInertia, chairSpin, spinEnergy } from '../../lib/physics/torque.ts';
import { C, CheckBar, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * You, on a frictionless office chair, seen from above, holding a 2 kg
 * dumbbell in each hand. Drag anywhere on the picture toward the centre to
 * pull them in, outward to push them out. Nothing twists the chair from
 * outside, so ω is always L / I(r) with L fixed at its starting value
 * (`chairSpin` in src/lib/physics/torque.ts).
 *
 * With `id` and `target` it grades itself: a faint ghost arm turns at
 * `target` times the starting spin, and the chair must keep pace with it.
 * The spin meter stays hidden until then, so the match is made by eye, or by
 * reasoning about I.
 */
export interface PullInTheWeightsProps {
  id?: string;
  prompt?: string;
  /** Starting reach, m. */
  r0?: number;
  /** Starting spin, rev/s. */
  rev0?: number;
  /** Multiple of the starting spin the ghost turns at. */
  target?: number;
  tolerance?: number;
  explanation?: string;
}

const R_MIN = 0.15, R_MAX = 0.8;

export default function PullInTheWeights({
  id, prompt, r0 = 0.75, rev0 = 1, target, tolerance = 0.04, explanation,
}: PullInTheWeightsProps) {
  const graded = Boolean(id && target !== undefined);
  const task = useTask(graded ? id : undefined, 'pull-in-the-weights');
  const L = chairInertia(CHAIR, r0) * rev0 * TWO_PI;
  const [r, setR] = useState(r0);
  const rRef = useRef(r0);
  const chair = useRef<SVGGElement>(null);
  const ghost = useRef<SVGGElement>(null);
  const dragging = useRef(false);

  const setReach = (v: number) => {
    const c = Math.min(R_MAX, Math.max(R_MIN, v));
    rRef.current = c; setR(c); task.touch();
  };

  // The spin lives in refs and SVG attributes; React never hears about the angle.
  useEffect(() => {
    let raf = 0, last = performance.now(), th = 0, thG = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      th += chairSpin(CHAIR, L, rRef.current) * dt;
      if (target !== undefined) thG += target * rev0 * TWO_PI * dt;
      const d = (a: number) => (-(a * 180) / Math.PI) % 360;
      chair.current?.setAttribute('transform', `rotate(${d(th)} ${chair.current.dataset.cx} ${chair.current.dataset.cy})`);
      ghost.current?.setAttribute('transform', `rotate(${d(thG)} ${ghost.current.dataset.cx} ${ghost.current.dataset.cy})`);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [L, target, rev0]);

  const I = chairInertia(CHAIR, r);
  const w = chairSpin(CHAIR, L, r);
  const rev = w / TWO_PI;
  const K = spinEnergy(I, w);
  const goal = (target ?? 1) * rev0;
  const hit = graded && Math.abs(rev / goal - 1) <= tolerance;
  const showSpin = !graded || task.done;

  const worldFromEvent = (s: StageApi, e: RPointerEvent<SVGRectElement>) => {
    const svg = (e.target as SVGElement).ownerSVGElement!;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    const x0 = s.sx(0), x1 = s.sx(1), y0 = s.sy(0), y1 = s.sy(1);
    return Math.hypot((p.x - x0) / (x1 - x0), (p.y - y0) / (y1 - y0));
  };

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Spin" value={showSpin ? rev.toFixed(2) : '?'} unit="rev/s" color={C.velocity} />
          <Meter label="Rotational inertia I" value={I.toFixed(2)} unit="kg·m²" color={C.position} />
          <Meter label="I × ω" value={showSpin ? (I * w).toFixed(1) : '?'} unit="kg·m²/s" color={C.ink} />
          <Meter label="Kinetic energy" value={showSpin ? K.toFixed(0) : '?'} unit="J" color={C.energy} />
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(hit, { r, rev })}
          miss={`You turn at ${rev.toFixed(2)} rev/s; the ghost turns at ${goal.toFixed(2)}. The dumbbells are ${r.toFixed(2)} m out, and I is ${I.toFixed(2)} kg·m², ${(I / chairInertia(CHAIR, r0)).toFixed(2)} of where you started.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-1, 1]} y={[-0.95, 0.95]} height={340} equal
        label={`Spinning chair from above. Dumbbells ${r.toFixed(2)} metres from the axis.`}>
        {(s) => {
          const cx = s.sx(0), cy = s.sy(0), px = s.len(1);
          return <>
            <circle cx={cx} cy={cy} r={r0 * px} fill="none" stroke={C.grid} strokeDasharray="4 6" />
            <text x={cx + r0 * px * 0.72} y={cy - r0 * px * 0.72 - 6} fontSize={12} fill={C.faint}>start, {r0} m</text>
            {target !== undefined && <g ref={ghost} data-cx={cx} data-cy={cy}>
              <line x1={cx - R_MAX * px} y1={cy} x2={cx + R_MAX * px} y2={cy} stroke={C.position} strokeWidth={3} opacity={0.45} strokeDasharray="8 6" />
              <text x={cx + R_MAX * px + 6} y={cy + 4} fontSize={13} fill={C.position}>ghost</text>
            </g>}
            <circle cx={cx} cy={cy} r={0.34 * px} fill="none" stroke={C.rule} strokeWidth={2} />
            <g ref={chair} data-cx={cx} data-cy={cy}>
              <line x1={cx - r * px} y1={cy} x2={cx + r * px} y2={cy} stroke={C.soft} strokeWidth={6} strokeLinecap="round" />
              <ellipse cx={cx} cy={cy} rx={0.24 * px} ry={0.13 * px} fill={C.surface} stroke={C.soft} strokeWidth={2} />
              <circle cx={cx} cy={cy} r={0.1 * px} fill={C.surface} stroke={C.ink} strokeWidth={2} />
              <path d={`M${cx},${cy - 0.1 * px} l-5,-9 l10,0 Z`} fill={C.ink} />
              {[-1, 1].map((k) => <circle key={k} cx={cx + k * r * px} cy={cy} r={0.075 * px} fill={C.surface} stroke={C.ink} strokeWidth={3} />)}
            </g>
            <rect x={0} y={0} width={s.W} height={s.H} fill="transparent" style={{ cursor: 'grab' }}
              tabIndex={0} role="slider" aria-label="Your reach: drag toward the centre to pull the dumbbells in"
              aria-valuemin={R_MIN} aria-valuemax={R_MAX} aria-valuenow={+r.toFixed(2)}
              onPointerDown={(e) => { dragging.current = true; (e.target as Element).setPointerCapture(e.pointerId); setReach(worldFromEvent(s, e)); }}
              onPointerMove={(e) => { if (dragging.current) setReach(worldFromEvent(s, e)); }}
              onPointerUp={() => { dragging.current = false; }}
              onKeyDown={(e) => {
                const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 0.01 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -0.01 : 0;
                if (d) { e.preventDefault(); setReach(rRef.current + d); }
              }} />
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        two {CHAIR.m} kg dumbbells, {r.toFixed(2)} m from the axis · you and the chair alone: I = {CHAIR.body} kg·m² · frictionless bearing
      </p>
    </SceneCard>
  );
}

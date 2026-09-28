import { useId, useState } from 'react';
import { CH37_PAIRS, CH37_TILT_MAX, ctToUs, dctIn, interval, simultaneousBeta, type Ch37Pair } from '../../lib/physics/relativity.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';
import { LIGHT } from './relativity-kit-ch37.tsx';

/**
 * The platform's spacetime diagram: position across, ct up, light at 45°.
 * Two events sit on it. The learner tilts a train's worldline by its top end;
 * the train's dashed lines of "now" tilt the other way by the same angle, like
 * scissors closing on the light line. Events on one dashed line are
 * simultaneous for that train. The interval readout never moves.
 *
 * Graded (id): tilt until the pair lies on one line of now.
 * Physics: `dctIn`, `interval`, `simultaneousBeta` in src/lib/physics/relativity.ts.
 */
export interface TiltTheNowProps {
  id?: string;
  prompt?: string;
  /** Which pair of events: the timed strikes, or a strike and the flare it causes. */
  pair?: Ch37Pair;
  tolerance?: number;
  explanation?: string;
}

const X: [number, number] = [-160, 660], Y: [number, number] = [-70, 440], TOP = 400;

/** The part of the line through p with direction d that lies inside the view. */
function clip(s: StageApi, p: [number, number], d: [number, number]) {
  let lo = -1e9, hi = 1e9;
  const box: [number, number, number, number][] = [[s.x[0], s.x[1], p[0], d[0]], [Y[0], Y[1], p[1], d[1]]];
  for (const [a, b, p0, dd] of box) {
    if (Math.abs(dd) < 1e-12) { if (p0 < a || p0 > b) return null; continue; }
    const t1 = (a - p0) / dd, t2 = (b - p0) / dd;
    lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2));
  }
  if (lo >= hi) return null;
  return { x1: s.sx(p[0] + lo * d[0]), y1: s.sy(p[1] + lo * d[1]), x2: s.sx(p[0] + hi * d[0]), y2: s.sy(p[1] + hi * d[1]) };
}

export default function TiltTheNow({ id, prompt, pair = 'strikes', tolerance = 0.015, explanation }: TiltTheNowProps) {
  const task = useTask(id, 'tilt-the-now');
  const clipId = `tilt-${useId().replace(/:/g, '')}`;
  const P = CH37_PAIRS[pair];
  const [beta, setBeta] = useState(0);
  const target = simultaneousBeta(P.a, P.b);
  const dUs = ctToUs(dctIn(P.a, P.b, beta));
  const s2 = interval(P.a, P.b);
  const A: [number, number] = [P.a.x, P.a.ct], Bv: [number, number] = [P.b.x, P.b.ct];

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Train speed" value={`${beta >= 0 ? '' : '−'}${Math.abs(beta).toFixed(2)}c`} color={C.velocity} />
          <Meter label={`On the train, ${P.bLabel} after ${P.aLabel}`} value={dUs.toFixed(2)} unit="µs" color={C.position} />
          <Meter label="Interval (cΔt)² − Δx², any frame" value={(s2 / 1000).toFixed(0)} unit="×10³ m²" />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(target !== null && Math.abs(beta - target) <= tolerance, { beta, dUs })}
          miss={`On a ${beta.toFixed(2)}c train the ${P.bLabel} comes ${Math.abs(dUs).toFixed(2)} µs ${dUs > 0 ? 'after' : 'before'} the ${P.aLabel}: the dashed line through the ${P.aLabel} passes ${dUs > 0 ? 'below' : 'above'} the ${P.bLabel}.`}
          hit={explanation} />}
      </div>}>
      <Stage x={X} y={Y} height={400} equal label={`Spacetime diagram with a train at ${beta.toFixed(2)}c`}
        axes={{ x: 'x (m)', y: 'ct (m)', xTicks: [-100, 0, 100, 200, 300, 400, 500, 600], yTicks: [0, 100, 200, 300, 400] }}>
        {(s) => {
          const seg = (p: [number, number], d: [number, number], props: Record<string, unknown>) => {
            const c = clip(s, p, d);
            return c && <line {...c} {...props} />;
          };
          const top: [number, number] = [A[0] + beta * (TOP - A[1]), TOP];
          const lx = s.sx(s.x[1]) - 6;
          return <g>
            <defs><clipPath id={clipId}><rect x={s.sx(s.x[0])} y={s.sy(Y[1])} width={s.sx(s.x[1]) - s.sx(s.x[0])} height={s.sy(Y[0]) - s.sy(Y[1])} /></clipPath></defs>
            {/* A's future light cone */}
            <path d={`M${s.sx(A[0])},${s.sy(A[1])}L${s.sx(A[0] + Y[1] - A[1])},${s.sy(Y[1])}L${s.sx(A[0] - (Y[1] - A[1]))},${s.sy(Y[1])}Z`}
              fill={LIGHT} fillOpacity={0.05} clipPath={`url(#${clipId})`} />
            {seg(A, [1, 1], { stroke: LIGHT, strokeOpacity: 0.55, strokeWidth: 1.5, strokeDasharray: '2 4' })}
            {seg(A, [-1, 1], { stroke: LIGHT, strokeOpacity: 0.55, strokeWidth: 1.5, strokeDasharray: '2 4' })}
            <text x={s.sx(A[0] + 330)} y={s.sy(A[1] + 330) - 8} fontSize={12.5} fill={C.faint} textAnchor="end">light from the {P.aLabel}</text>

            {/* platform's now */}
            {seg(A, [1, 0], { stroke: C.faint, strokeWidth: 1, strokeDasharray: '6 5' })}
            <text x={lx} y={s.sy(A[1]) + 16} textAnchor="end" fontSize={12.5} fill={C.faint}>platform's now</text>

            {/* the train: worldline and lines of now */}
            {seg(A, [beta, 1], { stroke: C.position, strokeWidth: 3 })}
            {seg(A, [1, beta], { stroke: C.position, strokeWidth: 2, strokeDasharray: '8 6' })}
            {seg(Bv, [1, beta], { stroke: C.position, strokeWidth: 1.5, strokeDasharray: '8 6', strokeOpacity: 0.6 })}
            <text x={lx} y={s.sy(A[1] + beta * (s.x[1] - A[0])) - 8} textAnchor="end" fontSize={13} fill={C.position}
              stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">train's now</text>
            <text x={s.sx(top[0]) + 14} y={s.sy(top[1]) + 22} fontSize={13} fill={C.position}
              stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">train's worldline</text>

            {/* events */}
            {([[A, P.aLabel], [Bv, P.bLabel]] as [[number, number], string][]).map(([p, lab]) => <g key={lab}>
              <circle cx={s.sx(p[0])} cy={s.sy(p[1])} r={7} fill={C.ink} />
              <text x={s.sx(p[0]) + 11} y={s.sy(p[1]) + 20} fontSize={14} fontWeight={600} fill={C.ink}
                stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{lab}</text>
            </g>)}

            <Handle s={s} at={top} color={C.position} step={TOP * 0.01} label="Top of the train's worldline: tilt to set its speed"
              clamp={(p) => [Math.max(A[0] - CH37_TILT_MAX * (TOP - A[1]), Math.min(A[0] + CH37_TILT_MAX * (TOP - A[1]), p[0])), TOP]}
              onChange={(p) => { setBeta(Math.round(((p[0] - A[0]) / (TOP - A[1])) * 1000) / 1000); task.touch(); }} />
          </g>;
        }}
      </Stage>
    </SceneCard>
  );
}

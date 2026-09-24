import { useState } from 'react';
import { SPRING, halfWorkStretch, springPull, springWork } from '../../lib/physics/work-scenes-ch06.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';

/**
 * A spring on a wall and your hand on its end. Drag the hand out: the spring
 * stretches, your pull grows, and directly underneath, on the same stretch
 * axis, the area under your pull fills in. That area is the work
 * (`springWork`, a trapezoid sum over the sampled pull).
 *
 * Ungraded, the first and second 5 cm are marked with what each one cost.
 * Graded (`id`), the scene asks for the point where half the work of the full
 * stretch is done. Both regions are shaded so the learner can match areas by
 * eye; the joules appear only once they check.
 */
export interface StretchSpringProps {
  id?: string;
  prompt?: string;
  tolerance?: number;
  explanation?: string;
}

const K = SPRING.k;
const FULL = SPRING.full * 100;  // cm
const MAX = 12;                  // cm of stretch the hand can reach
const Y_HAND = 8.9;
const yF = (F: number) => (F / 100) * 5.2;   // newtons → graph height
const pull = (cm: number) => springPull(K, cm / 100);
const work = (a: number, b: number) => springWork(K, a / 100, b / 100);

export default function StretchSpring({ id, prompt, tolerance = 0.25, explanation }: StretchSpringProps) {
  const graded = Boolean(id);
  const task = useTask(id, 'stretch-spring');
  const [x, setX] = useState(graded ? 3 : 0);
  const half = halfWorkStretch(K, SPRING.full) * 100;
  const limit = graded ? FULL : MAX;
  const reveal = !graded || task.verdict !== 'none' || task.done;
  const F = pull(x);

  const drag = (p: Vec) => {
    const v = Math.round(Math.max(0, Math.min(limit, p[0])) * 10) / 10;
    if (v !== x) { setX(v); task.touch(); }
  };
  const tri = (s: StageApi, a: number, b: number) =>
    `M${s.sx(a)},${s.sy(0)}L${s.sx(b)},${s.sy(0)}L${s.sx(b)},${s.sy(yF(pull(b)))}L${s.sx(a)},${s.sy(yF(pull(a)))}Z`;
  const coil = (s: StageApi) => {
    const x0 = -8, x1 = x, n = 14, pts = [`M${s.sx(x0)},${s.sy(Y_HAND)}`];
    for (let i = 1; i < 2 * n; i++) pts.push(`L${s.sx(x0 + ((x1 - x0) * i) / (2 * n))},${s.sy(Y_HAND + (i % 2 ? 0.55 : -0.55))}`);
    pts.push(`L${s.sx(x1)},${s.sy(Y_HAND)}`);
    return pts.join('');
  };
  const [L, R] = [work(0, x), work(x, FULL)];

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <span style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Stretch" value={x.toFixed(1)} unit="cm" color={C.position} />
          <Meter label="Your pull" value={F.toFixed(0)} unit="N" color={C.force} />
          {reveal && <Meter label="Your work so far" value={L.toFixed(2)} unit="J" color={C.energy} />}
        </span>
        {graded && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(Math.abs(x - half) <= tolerance, { x })}
          miss={`Left of your hand: ${L.toFixed(2)} J. From there to ${FULL} cm: ${R.toFixed(2)} J.`} hit={explanation} />}
      </div>}>
      <Stage x={[-9.5, 15]} y={[-1.7, 10.8]} height={340} label={`Spring stretched ${x.toFixed(1)} centimetres; your pull ${F.toFixed(0)} newtons`}>
        {(s) => <>
          {/* the picture */}
          <rect x={s.sx(-8.6)} y={s.sy(10.4)} width={s.len(0.6)} height={s.sy(7.4) - s.sy(10.4)} fill={C.grid} stroke={C.soft} />
          <path d={coil(s)} fill="none" stroke={C.soft} strokeWidth={2} strokeLinejoin="round" />
          <line x1={s.sx(0)} x2={s.sx(0)} y1={s.sy(7.6)} y2={s.sy(10.2)} stroke={C.faint} strokeDasharray="3 4" />
          <text x={s.sx(0)} y={s.sy(10.35)} textAnchor="middle" fontSize={12} fill={C.faint}>relaxed</text>
          {F > 1 && <Arrow s={s} from={[x + 0.5, Y_HAND]} to={[x + 0.5 + F / 40, Y_HAND]} color={C.force} label={`${F.toFixed(0)} N`} />}
          <line x1={s.sx(x)} x2={s.sx(x)} y1={s.sy(Y_HAND - 0.9)} y2={s.sy(yF(F))} stroke={C.faint} strokeDasharray="4 4" />

          {/* the companion: your pull against stretch, on the same stretch axis */}
          {[0, 40, 80].map((n) => <g key={n}>
            <line x1={s.sx(0)} x2={s.sx(MAX)} y1={s.sy(yF(n))} y2={s.sy(yF(n))} stroke={C.grid} />
            <text x={s.sx(-0.4)} y={s.sy(yF(n)) + 4} textAnchor="end" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{n} N</text>
          </g>)}
          {[0, 2, 4, 6, 8, 10, 12].map((c) => <text key={c} x={s.sx(c)} y={s.sy(0) + 17} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{c}</text>)}
          <text x={s.sx(14.8)} y={s.sy(0) + 17} textAnchor="end" fontSize={13} fill={C.soft}>cm</text>
          <text x={s.sx(-0.4)} y={s.sy(yF(100)) + 4} textAnchor="end" fontSize={13} fill={C.soft}>your pull</text>
          <line x1={s.sx(0)} x2={s.sx(MAX)} y1={s.sy(0)} y2={s.sy(0)} stroke={C.rule} strokeWidth={1.4} />
          <line x1={s.sx(0)} x2={s.sx(MAX)} y1={s.sy(0)} y2={s.sy(yF(pull(MAX)))} stroke={C.force} strokeWidth={1.5} opacity={0.45} />
          {graded && <>
            <path d={tri(s, x, FULL)} fill={C.energy} opacity={0.14} stroke={C.energy} strokeDasharray="4 4" />
            <line x1={s.sx(FULL)} x2={s.sx(FULL)} y1={s.sy(0)} y2={s.sy(8)} stroke={C.soft} strokeDasharray="2 4" />
            <text x={s.sx(FULL)} y={s.sy(8.1)} textAnchor="middle" fontSize={12} fill={C.soft}>full stretch</text>
          </>}
          <path d={tri(s, 0, x)} fill={C.energy} opacity={0.45} />
          <line x1={s.sx(0)} x2={s.sx(x)} y1={s.sy(0)} y2={s.sy(yF(F))} stroke={C.force} strokeWidth={2.5} />
          {!graded && [[0, 5], [5, 10]].map(([a, b]) => x >= b && (
            <g key={a}>
              <line x1={s.sx(b)} x2={s.sx(b)} y1={s.sy(0)} y2={s.sy(yF(pull(b)))} stroke={C.surface} strokeWidth={2} />
              <text x={s.sx((a + b) / 2 + (a ? 0.6 : 1.2))} y={s.sy(yF(pull(b)) / 3.2)} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.ink}
                stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{work(a, b).toFixed(2)} J</text>
            </g>
          ))}
          {graded && reveal && <>
            <text x={s.sx(x * 0.66)} y={s.sy(yF(pull(x)) / 3.5)} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.ink} stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{L.toFixed(2)} J</text>
            <text x={s.sx((x + FULL) / 2)} y={s.sy(yF(pull(FULL)) / 3.2)} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.ink} stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{R.toFixed(2)} J</text>
          </>}
          <Handle s={s} at={[x, Y_HAND]} onChange={drag} step={0.2} label="Your hand: drag to stretch the spring" />
        </>}
      </Stage>
    </SceneCard>
  );
}

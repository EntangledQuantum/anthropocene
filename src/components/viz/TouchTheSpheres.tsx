import { useState } from 'react';
import { MICRO, coulombMagnitude, forceOn, shareOnContact, si } from '../../lib/physics/charges-ch21.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { ChargeDot } from './charge-kit-ch21.tsx';

/**
 * Two identical metal spheres on insulating stands. A is fixed; drag B along
 * the track. Before they touch they carry +6 and −2 µC and pull together.
 * Touch them and the total, +4 µC, is shared equally (`shareOnContact`): now
 * they repel, and at any distance a third as hard as they attracted. The
 * amber arrows on both spheres are always equal and opposite.
 *
 * Graded (`id`): touch them, then set B where the new push is as strong as the
 * starting pull. That is 30/√3 ≈ 17.3 cm, which the scene finds by comparing
 * `coulombMagnitude` values, not from a typed answer.
 */
export interface TouchTheSpheresProps {
  id?: string;
  prompt?: string;
  /** Starting charges, µC. */
  a?: number;
  b?: number;
  /** Starting gap between centres, cm. */
  start?: number;
  /** Fractional match of the forces that counts. */
  tolerance?: number;
  explanation?: string;
}

const CM = 0.01;
const R = 2;          // sphere radius, cm
const PER_N = 6.5;    // arrow cm per newton
const CAP = 13;

const fmtQ = (q: number) => `${q > 0 ? '+' : '−'}${Math.abs(q).toFixed(0)} µC`;

export default function TouchTheSpheres({
  id, prompt, a = 6, b = -2, start = 30, tolerance = 0.05, explanation,
}: TouchTheSpheresProps) {
  const task = useTask(id, 'touch-the-spheres');
  const [xb, setXb] = useState(start);
  const [touched, setTouched] = useState(false);

  const [qa, qb] = touched ? shareOnContact(a, b) : [a, b];
  const f0 = coulombMagnitude(a * MICRO, b * MICRO, start * CM);
  const onB = forceOn([{ x: 0, y: 0, q: qa * MICRO }], qb * MICRO, xb * CM, 0);
  const onA = forceOn([{ x: xb * CM, y: 0, q: qb * MICRO }], qa * MICRO, 0, 0);
  const F = Math.abs(onB[0]);
  const push = onB[0] > 0;
  const match = touched && push && Math.abs(F - f0) / f0 <= tolerance;

  const arrowTo = (x0: number, fx: number): { to: Vec; capped: boolean } => {
    const L = Math.min(CAP, Math.abs(fx) * PER_N);
    return { to: [x0 + Math.sign(fx) * L, 4.2], capped: Math.abs(fx) * PER_N > CAP };
  };
  const arA = arrowTo(0, onA[0]);
  const arB = arrowTo(xb, onB[0]);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Gap between centres" value={`${xb.toFixed(1)} cm`} />
          <Meter label={push ? 'Push apart, on each' : 'Pull together, on each'} value={si(F, 'N')} color={C.force} />
          <Meter label="Pull at the start" value={si(f0, 'N')} color={C.faint} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(match, { xb, touched })}
          miss={!touched
            ? `They have not touched: B still carries −${Math.abs(b)} µC, and at ${xb.toFixed(1)} cm the pair pull together with ${si(F, 'N')}.`
            : `At ${xb.toFixed(1)} cm they push apart with ${si(F, 'N')}. The pull at the start was ${si(f0, 'N')}.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-6, 40]} y={[-6.5, 7]} height={200} equal
        label={`Sphere A ${fmtQ(qa)} fixed, sphere B ${fmtQ(qb)} at ${xb.toFixed(1)} cm. Force ${si(F, 'N')} ${push ? 'apart' : 'together'}.`}>
        {(s) => <>
          <line x1={s.sx(-8)} x2={s.sx(42)} y1={s.sy(-5)} y2={s.sy(-5)} stroke={C.rule} strokeWidth={2} />
          {[0, xb].map((x, i) => <line key={i} x1={s.sx(x)} x2={s.sx(x)} y1={s.sy(-R)} y2={s.sy(-5)} stroke={C.ghost} strokeWidth={4} />)}
          {[0, 10, 20, 30].map((t) => <g key={t}>
            <line x1={s.sx(t)} x2={s.sx(t)} y1={s.sy(-5)} y2={s.sy(-5) + 6} stroke={C.faint} />
            <text x={s.sx(t)} y={s.sy(-5) + 20} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{t} cm</text>
          </g>)}
          <ChargeDot s={s} at={[0, 0]} q={qa} r={s.len(R)} />
          <ChargeDot s={s} at={[xb, 0]} q={qb} r={s.len(R)} />
          <text x={s.sx(0)} y={s.sy(R) - 10} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.soft}>A {fmtQ(qa)}</text>
          <text x={s.sx(xb)} y={s.sy(R) - 10} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.soft}>B {fmtQ(qb)}</text>
          <Arrow s={s} from={[0, 4.2]} to={arA.to} color={C.force} width={3} dash={arA.capped ? '6 4' : undefined} />
          <Arrow s={s} from={[xb, 4.2]} to={arB.to} color={C.force} width={3} dash={arB.capped ? '6 4' : undefined} />
          {touched && <text x={s.sx(17)} y={s.sy(6.2)} textAnchor="middle" fontSize={13} fill={C.soft}>
            touched: {a > 0 ? '+' : '−'}{Math.abs(a)} and {b > 0 ? '+' : '−'}{Math.abs(b)} µC became {fmtQ(qa)} each
          </text>}
          <Handle s={s} at={[xb, 0]} color={C.ink} step={0.25} r={6} label="Sphere B: slide it along the track"
            onChange={(q) => {
              const x = Math.min(36, Math.max(2 * R, q[0]));
              if (x <= 2 * R + 0.05) setTouched(true);
              setXb(x); task.touch();
            }} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Identical metal spheres on insulating stands · amber: the force on each · dashed: too long to draw to scale
      </p>
    </SceneCard>
  );
}

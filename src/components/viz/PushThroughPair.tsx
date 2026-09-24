import { useState } from 'react';
import { pushedRow } from '../../lib/physics/pairs-ch04.ts';
import { Arrow, Body, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * Two blocks on ice, touching. You push the small one; it pushes the big one.
 *
 * One control: the tail of your push arrow. The two contact arrows sit tail to
 * tail on the face where the blocks touch, one on each block, and their meters
 * cannot disagree, because the scene only ever computes one of them: the other
 * is `thirdLawPartner` of it (`pushedRow`, src/lib/physics/pairs-ch04.ts).
 *
 * Graded with `id` + `target`: make the force on the far block equal `target`.
 */
export interface PushThroughPairProps {
  id?: string;
  prompt?: string;
  /** Masses of the block you push and the block beyond it, kg. */
  near?: number;
  far?: number;
  /** Starting push, newtons. */
  start?: number;
  /** Force block A must pass to block B, newtons. */
  target?: number;
  tolerance?: number;
  explanation?: string;
}

const S = 0.06; // world units per newton, for every force arrow
const F_MAX = 24;
const AS = 0.5; // world units per m/s²

/** A force's name, centred above the middle of its arrow, so it stays on the body the force acts on. */
function Tag({ s, x, y, children }: { s: StageApi; x: number; y: number; children: string }) {
  return <text x={s.sx(x)} y={s.sy(y) - 12} textAnchor="middle" fontSize={13} fontWeight={600} fill={C.force}
    stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{children}</text>;
}

export default function PushThroughPair({
  id, prompt, near = 2, far = 6, start = 8, target, tolerance = 0.3, explanation,
}: PushThroughPairProps) {
  const graded = Boolean(id && target !== undefined);
  const task = useTask(graded ? id : undefined, 'push-through-pair');
  const [F, setF] = useState(start);

  const row = pushedRow([near, far], 0, F);
  const onB = row.forces.find((f) => f.id === 'link0')!;
  const onA = row.forces.find((f) => f.id === 'link0-partner')!;
  const c = onB.vec[0];

  const wA = 1.2, wB = wA * Math.cbrt(far / near);
  const xA = -wA / 2, xB = wB / 2; // centres; the blocks touch at x = 0
  const yPair = 0.3, tailX = -wA - F * S;

  const block = (s: StageApi, x: number, w: number, name: string, m: number) => <>
    <Body s={s} at={[x, w / 2]} w={w} h={w} />
    <text x={s.sx(x)} y={s.sy(w) + 20} textAnchor="middle" fontSize={13} fill={C.soft}>{name} · {m} kg</text>
    <Arrow s={s} from={[x, w + 0.12]} to={[x + row.a * AS, w + 0.12]} color={C.accel} dash="7 5" />
  </>;

  const d = c - (target ?? 0);
  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Your push on A" value={F.toFixed(1)} unit="N" color={C.force} />
          <Meter label="A on B" value={c.toFixed(1)} unit="N" color={C.force} />
          <Meter label="B on A" value={Math.abs(onA.vec[0]).toFixed(1)} unit="N" color={C.force} />
          <Meter label="Both accelerate at" value={row.a.toFixed(2)} unit="m/s²" color={C.accel} />
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(Math.abs(d) <= tolerance, { push: F })}
          miss={F < 0.05 ? 'You are not pushing yet.'
            : `A passes ${c.toFixed(1)} N to B, ${Math.abs(d).toFixed(1)} N ${d < 0 ? 'short' : 'too much'}. The other ${(F - c).toFixed(1)} N of your push speeds up A itself.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-3, 2.4]} y={[-0.35, 2.55]} height={250} equal ground
        label={`Your push ${F.toFixed(1)} newtons on block A. A pushes B with ${c.toFixed(1)} newtons; B pushes back on A with the same.`}>
        {(s) => <>
          {block(s, xA, wA, 'A', near)}
          {block(s, xB, wB, 'B', far)}
          <Arrow s={s} from={[0, yPair]} to={[c * S, yPair]} color={C.force} />
          <Arrow s={s} from={[0, yPair]} to={[onA.vec[0] * S, yPair]} color={C.force} />
          {c > 0.5 && <>
            <Tag s={s} x={c * S / 2} y={yPair}>A on B</Tag>
            <Tag s={s} x={onA.vec[0] * S / 2} y={yPair}>B on A</Tag>
          </>}
          <Arrow s={s} from={[tailX, wA * 0.7]} to={[-wA, wA * 0.7]} color={C.force} />
          <text x={s.sx(tailX)} y={s.sy(wA * 0.7) - 18} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.force}>you</text>
          <text x={s.sx(xB + 0.1)} y={s.sy(wB + 0.12) - 10} fontSize={13} fill={C.accel}>a</text>
          <Handle s={s} at={[tailX, wA * 0.7]} color={C.force} step={0.5 * S} label="Your push: drag the tail of the arrow"
            onChange={(p) => { setF(Math.round(Math.min(F_MAX, Math.max(0, (-wA - p[0]) / S)) * 10) / 10); task.touch(); }} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        frictionless ice · amber: forces, drawn on the block they act on · dashed magenta: acceleration
      </p>
    </SceneCard>
  );
}

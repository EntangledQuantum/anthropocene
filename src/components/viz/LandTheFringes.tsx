import { useState } from 'react';
import {
  SLITS, firstSpot, gapSources, wallIntensity, youngSpacing,
} from '../../lib/physics/interference.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { LambdaBar, RippleStage, WaterKey, type RippleSpec } from './ripple-kit-ch35.tsx';

/**
 * Young's experiment in a ripple tank. Straight waves arrive from the left at
 * a barrier with two narrow gaps; each gap becomes a new dipper, in step with
 * the other because the same crest reaches both. The far wall glows where the
 * water there sloshes hardest (time-averaged, bob amplitude squared), and the
 * curve beside it is the same brightness as a number, in units of one gap.
 *
 * Controls: drag the far wall nearer or farther; cover the upper gap.
 * Graded (`id`): make the first loud spots land on the marks. The loud spots
 * are found numerically from the intensity (`firstSpot`), not from λL/d.
 */
export interface LandTheFringesProps {
  id?: string;
  prompt?: string;
  /** Show the marks the loud spots must land on. */
  marks?: boolean;
  explanation?: string;
}

const TOL = 0.35; // cm
const Y = 13.5;   // half height of the tank shown

export default function LandTheFringes({ id, prompt, marks = true, explanation }: LandTheFringesProps) {
  const task = useTask(id, 'land-the-fringes');
  const [L, setL] = useState<number>(SLITS.lStart);
  const [covered, setCovered] = useState(false);
  const { lambda, d, mark } = SLITS;
  const spec: RippleSpec = { sources: gapSources(d, covered), lambda, freq: 1, barrier: 0, water: [-7, L] };
  const y1 = firstSpot(d, lambda, L);
  const onMark = !covered && Math.abs(y1 - mark) <= TOL;

  const N = 180;
  const cells = Array.from({ length: N }, (_, i) => {
    const y = -Y + ((i + 0.5) / N) * 2 * Y;
    return { y, I: wallIntensity(y, d, lambda, L, covered) };
  });

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'end' }}>
          <button type="button" className="anth-btn" onClick={() => { setCovered((c) => !c); task.touch(); }}
            style={{ padding: '9px 18px', fontSize: 15 }}>
            {covered ? 'Uncover the upper gap' : 'Cover the upper gap'}
          </button>
          <Meter label="Wall distance" value={L.toFixed(1)} unit="cm" />
          <Meter label="First loud spot off centre" value={covered ? 'none' : y1.toFixed(2)} unit={covered ? undefined : 'cm'} color={C.energy} />
          <span className="hud-label" style={{ marginLeft: 'auto' }}><WaterKey /></span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(onMark, { L, covered })}
          miss={covered
            ? 'With one gap covered the wall is evenly lit: there are no loud spots to land.'
            : `The first loud spots are ${y1.toFixed(2)} cm from the centre; the marks are at ${mark.toFixed(2)} cm.`}
          hit={<>{`At ${L.toFixed(1)} cm, λL/d = ${youngSpacing(lambda, L, d).toFixed(2)} cm; the loud spot itself sits at ${y1.toFixed(2)} cm. `}{explanation}</>} />}
      </div>}>
      <RippleStage spec={spec} stage={(capture) =>
        <Stage x={[-7, 41]} y={[-14, 14]} height={380} equal
          label={`Two-gap ripple tank. Gaps ${d} cm apart, far wall ${L.toFixed(1)} cm away${covered ? ', upper gap covered' : ''}. First loud spot ${covered ? 'none' : `${y1.toFixed(2)} cm`} off centre.`}>
          {(s) => {
            capture(s);
            const cellH = Math.abs(s.sy(0) - s.sy((2 * Y) / N)) + 0.6;
            const px = (x: number) => s.sx(x);
            const prof = (I: number) => px(L + 1.4) + (I / 4) * (px(L + 6) - px(L + 1.4));
            return <>
              {/* barrier with two gaps */}
              {[[-14, -d / 2 - 0.3], [-d / 2 + 0.3, d / 2 - 0.3], [d / 2 + 0.3, 14]].map(([a, b2], i) =>
                <rect key={i} x={px(-0.35)} width={s.len(0.7)} y={s.sy(b2)} height={s.sy(a) - s.sy(b2)} fill={C.soft} />)}
              {covered && <rect x={px(-0.6)} width={s.len(1.2)} y={s.sy(d / 2 + 0.6)} height={s.sy(d / 2 - 0.6) - s.sy(d / 2 + 0.6)} fill={C.ink} rx={2} />}
              {/* the far wall's glow: brightness is intensity */}
              {cells.map((c, i) => <rect key={i} x={px(L)} width={s.len(1)} y={s.sy(c.y) - cellH / 2} height={cellH}
                fill={C.energy} opacity={Math.min(1, c.I / 4)} />)}
              <line x1={px(L)} x2={px(L)} y1={s.sy(-14)} y2={s.sy(14)} stroke={C.rule} strokeWidth={1.5} />
              {/* the same brightness as a curve, 0 to 4 times one gap */}
              {[0, 1, 4].map((v) => <g key={v}>
                <line x1={prof(v)} x2={prof(v)} y1={s.sy(-Y)} y2={s.sy(Y)} stroke={C.grid} />
                <text x={prof(v)} y={s.sy(-Y) + 14} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{v}</text>
              </g>)}
              <polyline fill="none" stroke={C.energy} strokeWidth={2}
                points={cells.map((c) => `${prof(c.I)},${s.sy(c.y)}`).join(' ')} />
              <text x={prof(2)} y={s.sy(Y) - 4} textAnchor="middle" fontSize={11} fill={C.faint}>× one gap</text>
              {marks && [-mark, mark].map((m) => <g key={m}>
                <path d={`M${px(L) - 3},${s.sy(m)} l-11,-7 v14 z`} fill={C.ink} />
                <text x={px(L) - 17} y={s.sy(m) + 4} textAnchor="end" fontSize={12} fill={C.ink}
                  stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">mark</text>
              </g>)}
              <LambdaBar s={s} at={[-6, -12.3]} lambda={lambda} unit="cm" />
              <text x={px(-6)} y={s.sy(12.2)} fontSize={12} fill={C.ink} stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">gaps {d} cm apart</text>
              <Handle s={s} at={[L, -12.6]} color={C.ink} step={0.2} r={10} label="The far wall: drag it nearer or farther"
                clamp={(q): Vec => [Math.max(SLITS.lRange[0], Math.min(SLITS.lRange[1], q[0])), -12.6]}
                onChange={(q) => { setL(q[0]); task.touch(); }} />
            </>;
          }}
        </Stage>} />
    </SceneCard>
  );
}

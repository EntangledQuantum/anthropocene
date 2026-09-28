import { useState } from 'react';
import { visibleBand } from '../../lib/physics/optics.ts';
import { C, Handle, Meter, SceneCard, Stage, type Vec } from './scene.tsx';
import { Beam, Glass, Person } from './optics-kit-ch34.tsx';

/**
 * You, a wall mirror, and your mirror image. Drag yourself toward the glass
 * or away from it. The shaded band on your body is the part you can see, and
 * it does not move: the sight line to each edge of the mirror reflects and
 * lands on the same height of you at every distance (`visibleBand`). The
 * dashed person behind the glass is the image; the dashed sight lines run
 * straight on to it.
 *
 * Ungraded: the payoff of the opening bet. Physics: optics.ts.
 */
export interface StepBackFromMirrorProps {
  prompt?: string;
  /** Mirror edges, m above the floor. */
  bottom?: number;
  top?: number;
  /** Your height and eye height, m. */
  height?: number;
  eye?: number;
}

const EYE_DX = 0.055; // the eye sits a little in front of the body's centre line

export default function StepBackFromMirror({ prompt, bottom = 1.3, top = 1.9, height = 1.8, eye = 1.68 }: StepBackFromMirrorProps) {
  const [d, setD] = useState(0.8);
  const E: Vec = [-d + EYE_DX, eye];
  const band = visibleBand(E, 0, bottom, top);
  const lo = Math.max(0, band.lo);
  const landLo: Vec = [E[0], band.lo], landHi: Vec = [E[0], band.hi];

  return (
    <SceneCard prompt={prompt}
      footer={<div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
        <Meter label="You to the glass" value={d.toFixed(2)} unit="m" />
        <Meter label="Lowest part of you in view" value={lo.toFixed(2)} unit="m up" color={C.position} />
        <Meter label="Mirror" value={(top - bottom).toFixed(2)} unit="m tall" color={C.energy} />
      </div>}>
      <Stage x={[-2.75, 2.75]} y={[-0.15, 2.35]} height={300} equal ground
        label={`Side view. You stand ${d.toFixed(2)} metres from a wall mirror and can see yourself from ${lo.toFixed(2)} metres up.`}>
        {(s) => <>
          <line x1={s.sx(0)} x2={s.sx(0)} y1={s.sy(0)} y2={s.sy(2.35)} stroke={C.rule} strokeWidth={2} />
          <rect x={s.sx(0)} y={s.sy(2.35)} width={s.sx(2.75) - s.sx(0)} height={s.sy(0) - s.sy(2.35)} fill="var(--color-abyss)" opacity={0.5} />
          <text x={s.sx(0.12)} y={s.sy(2.2)} fontSize={12} fill={C.faint}>in the mirror</text>
          <Person s={s} x={d} height={height} eye={eye} facing={-1} dashed />
          <Person s={s} x={-d} height={height} eye={eye} facing={1} band={[band.lo, band.hi]} />
          {/* sight lines: eye → edge → back onto you; dashed: straight on to the image */}
          {([[bottom, landLo], [top, landHi]] as const).map(([yEdge, land]) => {
            const P: Vec = [0, yEdge];
            const behind: Vec = [-E[0], land[1]];
            return <g key={yEdge}>
              <Beam s={s} from={E} to={P} />
              <Beam s={s} from={P} to={land} opacity={0.55} />
              <Beam s={s} from={P} to={behind} dash />
            </g>;
          })}
          <Glass s={s} a={[0, bottom]} b={[0, top]} front={[-1, 1]} />
          <text x={s.sx(-d) - 16} y={s.sy(lo) + 4} textAnchor="end" fontSize={12} fill={C.position}
            stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{`${lo.toFixed(2)} m`}</text>
          <Handle s={s} at={[-d, 0]} step={0.05} label="You: drag toward or away from the mirror" color={C.position}
            clamp={(p) => [Math.max(-2.45, Math.min(-0.3, p[0])), 0]}
            onChange={(p) => setD(Math.round(-p[0] * 100) / 100)} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Side view · shaded: the part of you the mirror shows · dashed: your image and the sight lines carried on to it
      </p>
    </SceneCard>
  );
}

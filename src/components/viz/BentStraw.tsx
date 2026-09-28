import { useState } from 'react';
import { N_WATER, apparentPoint } from '../../lib/physics/light.ts';
import { C, Handle, Meter, SceneCard, Stage, type Vec } from './scene.tsx';
import { Eye, Medium, Normal, Ray, WATER_FILL, useGlow } from './optics-kit-ch33.tsx';

/**
 * A straight straw leaning in a glass of water, and your eye, which you drag.
 *
 * The underwater half is drawn where the eye sees it: every point on it is
 * placed at the crossing of the two real rays that reach a pair of eye
 * positions a hair apart, traced back in straight lines (`apparentPoint`).
 * The real straw stays on the stage, dashed, so the kink at the surface is a
 * visible gap between where it is and where it looks. One real ray from the
 * tip is drawn in full, bending away from the normal as it leaves the water.
 *
 * Ungraded: it is the payoff of the opening bet. Physics: light.ts.
 */
export interface BentStrawProps {
  prompt?: string;
}

const TOP: Vec = [7, 8], TIP: Vec = [-2, -7.5];
const DEPTH = 9, HALF = 9, RIM = 1.2;
const clampEye = (p: Vec): Vec => [Math.max(9, Math.min(21, p[0])), Math.max(6, Math.min(14, p[1]))];

export default function BentStraw({ prompt }: BentStrawProps) {
  const [eye, setEye] = useState<Vec>([16, 10]);
  const { id: glow, defs } = useGlow();

  // Where the straw meets the surface, and points along its submerged half.
  const t0 = TOP[1] / (TOP[1] - TIP[1]);
  const cross: Vec = [TOP[0] + (TIP[0] - TOP[0]) * t0, 0];
  const under = Array.from({ length: 13 }, (_, i) => {
    const u = (i + 1) / 13;
    return [cross[0] + (TIP[0] - cross[0]) * u, cross[1] + (TIP[1] - cross[1]) * u] as Vec;
  });
  const seen = under.map((p) => apparentPoint(p, eye, N_WATER, 1).image);
  const tipSeen = seen[seen.length - 1];
  const exit = apparentPoint(TIP, eye, N_WATER, 1).exit;
  const lift = tipSeen[1] - TIP[1];

  const line = (pts: Vec[], s: { sx: (v: number) => number; sy: (v: number) => number }) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${s.sx(p[0]).toFixed(1)},${s.sy(p[1]).toFixed(1)}`).join('');

  return (
    <SceneCard prompt={prompt}
      footer={<span style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <Meter label="Tip looks higher by" value={lift.toFixed(1)} unit="cm" color={C.position} />
        <Meter label="Its real depth" value={(-TIP[1]).toFixed(1)} unit="cm" />
      </span>}>
      <Stage x={[-12, 22]} y={[-10.5, 15]} height={360} equal
        label={`A straw in water seen by an eye at ${eye[0].toFixed(0)}, ${eye[1].toFixed(0)} centimetres. The tip looks ${lift.toFixed(1)} centimetres higher than it is.`}>
        {(s) => <>
          {defs}
          <Medium s={s} x={[-HALF, HALF]} y={[-DEPTH, 0]} fill={WATER_FILL} label={`water, n = ${N_WATER}`} labelAt={[-HALF, -DEPTH + 1.6]} />
          {/* the glass */}
          <path d={`M${s.sx(-HALF - 0.4)},${s.sy(RIM)}L${s.sx(-HALF - 0.4)},${s.sy(-DEPTH - 0.4)}L${s.sx(HALF + 0.4)},${s.sy(-DEPTH - 0.4)}L${s.sx(HALF + 0.4)},${s.sy(RIM)}`}
            fill="none" stroke={C.soft} strokeWidth={2.5} />
          <Normal s={s} at={[exit, 0]} len={3.2} />
          {/* the straw: dry half, real wet half (dashed), and the wet half as seen */}
          <line x1={s.sx(TOP[0])} y1={s.sy(TOP[1])} x2={s.sx(cross[0])} y2={s.sy(cross[1])} stroke={C.position} strokeWidth={7} strokeLinecap="round" />
          <line x1={s.sx(cross[0])} y1={s.sy(cross[1])} x2={s.sx(TIP[0])} y2={s.sy(TIP[1])} stroke={C.position} strokeWidth={2} strokeDasharray="4 5" opacity={0.75} />
          <path d={line([cross, ...seen], s)} fill="none" stroke={C.position} strokeWidth={7} strokeLinecap="round" opacity={0.9} />
          <text x={s.sx(TIP[0]) - 8} y={s.sy(TIP[1]) + 4} textAnchor="end" fontSize={12} fill={C.faint}>where it is</text>
          <text x={s.sx(tipSeen[0]) - 10} y={s.sy(tipSeen[1]) + 4} textAnchor="end" fontSize={12} fill={C.position}>where it looks</text>
          {/* one real ray from the tip, and the straight line the eye assumes */}
          <Ray s={s} from={TIP} to={[exit, 0]} glow={glow} b={0.9} />
          <Ray s={s} from={[exit, 0]} to={eye} glow={glow} b={0.9} />
          <Ray s={s} from={[exit, 0]} to={tipSeen} glow={glow} dash="3 5" />
          <Handle s={s} at={eye} onChange={(p) => setEye(clampEye(p))} step={0.5} label="Your eye: drag it" r={8} color="transparent" />
          <circle cx={s.sx(eye[0])} cy={s.sy(eye[1])} r={24} fill="none" stroke={C.ghost} strokeDasharray="3 4" pointerEvents="none" />
          <Eye s={s} at={eye} toward={[exit, 0]} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Iris: the straw · dashed: where the wet half really is · white: light from the tip to your eye, and the straight line back that your eye assumes
      </p>
    </SceneCard>
  );
}

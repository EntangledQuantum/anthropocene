import { useState } from 'react';
import { edgePathDifference, huygensFarIntensity, phasorChain, slitDarkAngle, slitSources } from '../../lib/physics/diffraction.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';

/**
 * The slit as twelve Huygens sources. You swing one direction out of the slit
 * toward a far-away wall; every source sends a ray that way. The iris segment
 * is how much farther the bottom edge's wavelet has to go than the top
 * edge's: a sin θ. On the right, the twelve wavelets as arrows laid tip to
 * tail, each turned by its own extra path; their sum is the aqua arrow, and
 * its length squared is the brightness in that direction.
 *
 * Graded (`id`): find the first dark direction. The chain closes into a loop
 * when the edge-to-edge extra path is one whole wavelength, not half:
 * `huygensFar`, `phasorChain` and `slitDarkAngle` in diffraction.ts.
 */
export interface AimTheDarkProps {
  id?: string;
  prompt?: string;
  /** Slit width, wavelengths. */
  a?: number;
  /** Number of sources drawn and summed. */
  n?: number;
  /** Starting direction, degrees above straight ahead. */
  start?: number;
  explanation?: string;
}

const R = 8;          // length of the aim line, wavelengths
const MAXDEG = 75;
const O: Vec = [11.8, -0.4]; // where the phasor chain starts

export default function AimTheDark({ id, prompt, a = 2.5, n = 12, start = 8, explanation }: AimTheDarkProps) {
  const task = useTask(id, 'aim-the-dark');
  const [deg, setDeg] = useState(start);
  const th = (deg * Math.PI) / 180;
  const u: Vec = [Math.cos(th), Math.sin(th)];
  const I = huygensFarIntensity(a, 1, th, n);
  const pd = edgePathDifference(a, th);
  const chain = phasorChain(a, 1, th, n);
  const th1 = slitDarkAngle(a, 1, 1), th2 = slitDarkAngle(a, 1, 2);
  const cut = Number.isNaN(th2) ? Infinity : (th1 + th2) / 2;
  const dark = I <= 0.005;
  const hitNow = dark && th < cut;

  const top: Vec = [0, a / 2], bot: Vec = [0, -a / 2];
  const foot: Vec = [bot[0] + u[0] * pd, bot[1] + u[1] * pd];
  const end = chain[chain.length - 1];

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Direction" value={`${deg.toFixed(1)}°`} />
          <Meter label="Bottom edge’s extra path" value={`${pd.toFixed(2)} λ`} color={C.position} />
          <Meter label="Brightness that way" value={`${(100 * I).toFixed(I < 0.1 ? 1 : 0)}%`} unit="of straight ahead" color={C.energy} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hitNow, { deg })}
          miss={dark
            ? `Dark, but this is the second dark direction: the bottom edge is ${pd.toFixed(2)} λ behind. The first is nearer straight ahead.`
            : `That way the bottom edge’s wavelet goes ${pd.toFixed(2)} λ farther, and the ${n} wavelets still add up to ${(100 * I).toFixed(0)}% of the straight-ahead brightness.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-2.2, 25]} y={[-2.9, 9.1]} height={300} equal
        label={`Slit ${a} wavelengths wide as ${n} sources, looking ${deg.toFixed(1)} degrees up. Extra path ${pd.toFixed(2)} wavelengths, brightness ${(100 * I).toFixed(0)} percent.`}>
        {(s) => <>
          {/* incoming crests, one wavelength apart */}
          {[-1, -2].map((x) => <line key={x} x1={s.sx(x)} x2={s.sx(x)} y1={s.sy(-2.4)} y2={s.sy(2.4)} stroke={C.faint} strokeDasharray="3 4" />)}
          <rect x={s.sx(-0.25)} y={s.sy(8.8)} width={s.len(0.5)} height={s.sy(a / 2) - s.sy(8.8)} fill={C.soft} />
          <rect x={s.sx(-0.25)} y={s.sy(-a / 2)} width={s.len(0.5)} height={s.sy(-2.8) - s.sy(-a / 2)} fill={C.soft} />
          {slitSources(a, n).map((y) => <g key={y}>
            <line x1={s.sx(0)} y1={s.sy(y)} x2={s.sx(u[0] * 7)} y2={s.sy(y + u[1] * 7)} stroke={C.ink} strokeOpacity={0.22} strokeWidth={1.2} />
            <circle cx={s.sx(0)} cy={s.sy(y)} r={3.2} fill={C.ink} />
          </g>)}
          {/* a wavefront square to the rays through the top edge: the extra path is what the bottom edge still has to go */}
          <line x1={s.sx(top[0])} y1={s.sy(top[1])} x2={s.sx(foot[0])} y2={s.sy(foot[1])} stroke={C.soft} strokeDasharray="5 4" />
          {pd > 0.02 && <line x1={s.sx(bot[0])} y1={s.sy(bot[1])} x2={s.sx(foot[0])} y2={s.sy(foot[1])} stroke={C.position} strokeWidth={4} strokeLinecap="round" />}
          <text x={s.sx(foot[0]) + 8} y={s.sy(foot[1]) + 16} fontSize={13} fontWeight={600} fill={C.position}
            stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{pd.toFixed(2)} λ</text>
          <line x1={s.sx(0)} y1={s.sy(0)} x2={s.sx(u[0] * R)} y2={s.sy(u[1] * R)} stroke={C.ink} strokeWidth={1.6} strokeDasharray="2 5" />
          <circle cx={s.sx(u[0] * (R + 0.9))} cy={s.sy(u[1] * (R + 0.9))} r={9} fill={C.energy} opacity={0.08 + 0.92 * Math.sqrt(I)} stroke={C.faint} />
          {/* scale */}
          <line x1={s.sx(4)} x2={s.sx(5)} y1={s.sy(-2.4)} y2={s.sy(-2.4)} stroke={C.ink} strokeWidth={2} />
          <text x={s.sx(5.3)} y={s.sy(-2.4) + 4} fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">1 λ</text>

          {/* the same twelve wavelets, as arrows added tip to tail */}
          <text x={s.sx(O[0])} y={s.sy(-1.9)} fontSize={13} fill={C.soft}>the {n} wavelets, tip to tail</text>
          {chain.slice(1).map((p, i) => <Arrow key={i} s={s} from={[O[0] + chain[i][0], O[1] + chain[i][1]]} to={[O[0] + p[0], O[1] + p[1]]}
            color={C.ink} width={2} />)}
          {Math.hypot(end[0], end[1]) > 0.3
            ? <Arrow s={s} from={O} to={[O[0] + end[0], O[1] + end[1]]} color={C.energy} width={3.5} dash="7 5" label="sum" labelSide={-1} />
            : <text x={s.sx(O[0]) + 10} y={s.sy(O[1]) + 18} fontSize={13} fontWeight={600} fill={C.energy}>sum = 0</text>}
          <Handle s={s} at={[u[0] * R, u[1] * R]} step={0.12} r={10} label="Direction toward the wall: drag around the arc"
            clamp={(q) => {
              const d = Math.max(0, Math.min(MAXDEG, (Math.atan2(q[1], Math.max(q[0], 1e-6)) * 180) / Math.PI));
              return [R * Math.cos((d * Math.PI) / 180), R * Math.sin((d * Math.PI) / 180)];
            }}
            onChange={(q) => { setDeg(Math.round(((Math.atan2(q[1], q[0]) * 180) / Math.PI) * 10) / 10); task.touch(); }} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Slit {a} λ wide, magnified · white dots: {n} sources across it · iris: the bottom edge’s extra path · aqua: their sum, whose square is the brightness on the far wall that way, shown by the aqua dot
      </p>
    </SceneCard>
  );
}

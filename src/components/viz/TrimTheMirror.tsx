import { useState } from 'react';
import { mirrorImage, reflectionPoint, smallestMirror, visibleBand, wallMirror } from '../../lib/physics/optics.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { Beam, Glass, Person } from './optics-kit-ch34.tsx';

/**
 * A wall mirror whose top and bottom edges you drag. Make it the smallest
 * mirror in which you see all of yourself. The shaded band on your body is
 * what the glass shows you right now (`visibleBand`); the check compares the
 * glass with `smallestMirror`, which finds the reflection points for your toes
 * and the top of your head by the law of reflection.
 *
 * Once solved, the two real light paths appear (toes → glass → eye, head →
 * glass → eye) with their straight-on extensions to the image: the glass is
 * cut where they cross it, halfway up to your eye from each end.
 */
export interface TrimTheMirrorProps {
  id?: string;
  prompt?: string;
  /** Your distance from the glass, m. */
  distance?: number;
  height?: number;
  eye?: number;
  /** Starting edges, m. */
  start?: [number, number];
  /** How much of you may be missing at either end, m. */
  tolerance?: number;
  /** How much taller than the least the glass may be, m. */
  slack?: number;
  explanation?: string;
}

const EYE_DX = 0.055;
const r2 = (v: number) => Math.round(v * 100) / 100;

export default function TrimTheMirror({
  id, prompt, distance = 1.2, height = 1.8, eye = 1.68, start = [1.2, 1.9], tolerance = 0.05, slack = 0.08, explanation,
}: TrimTheMirrorProps) {
  const task = useTask(id, 'trim-the-mirror');
  const [edges, setEdges] = useState<[number, number]>(start);
  const [bottom, top] = edges;
  const E: Vec = [-distance + EYE_DX, eye];
  const band = visibleBand(E, 0, bottom, top);
  const least = smallestMirror(E[0], eye, height, 0);
  const tall = top - bottom;

  const feetMissing = band.lo > tolerance;
  const headMissing = band.hi < height - tolerance;
  const tooTall = tall > least.height + slack;
  const ok = !feetMissing && !headMissing && !tooTall;
  const miss = feetMissing
    ? `You see down to ${band.lo.toFixed(2)} m: everything of you below that, feet first, is missing from the glass.`
    : headMissing
      ? `You see only up to ${band.hi.toFixed(2)} m: the top ${Math.round((height - band.hi) * 100)} cm of your head is cut off.`
      : `All of you shows, but the glass is ${tall.toFixed(2)} m tall and only ${least.height.toFixed(2)} m of it is showing you. The rest shows floor or wall.`;

  const m = wallMirror(0);
  const paths = task.done ? [0, height].map((yb) => {
    const src: Vec = [E[0], yb];
    return { src, P: reflectionPoint(src, E, m) as Vec, img: mirrorImage(src, m) as Vec };
  }) : [];
  const setEdge = (i: 0 | 1, y: number) => {
    const next: [number, number] = [...edges];
    next[i] = r2(Math.max(0.02, Math.min(2.3, y)));
    if (next[1] - next[0] < 0.1) return;
    setEdges(next);
    task.touch();
  };

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          <Meter label="Mirror" value={tall.toFixed(2)} unit="m tall" color={C.energy} />
          <Meter label="You see from" value={Math.max(0, band.lo).toFixed(2)} unit="m" color={C.position} />
          <Meter label="up to" value={Math.min(height, band.hi).toFixed(2)} unit={`m of ${height.toFixed(2)} m`} color={C.position} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(ok, { bottom, top })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-2.2, 2.2]} y={[-0.15, 2.35]} height={320} equal ground
        label={`Side view. A mirror from ${bottom.toFixed(2)} to ${top.toFixed(2)} metres. You see yourself from ${Math.max(0, band.lo).toFixed(2)} to ${Math.min(height, band.hi).toFixed(2)} metres.`}>
        {(s) => <>
          <line x1={s.sx(0)} x2={s.sx(0)} y1={s.sy(0)} y2={s.sy(2.35)} stroke={C.rule} strokeWidth={2} />
          <rect x={s.sx(0)} y={s.sy(2.35)} width={s.W} height={s.sy(0) - s.sy(2.35)} fill="var(--color-abyss)" opacity={0.5} />
          <Person s={s} x={distance} height={height} eye={eye} facing={-1} dashed />
          <Person s={s} x={-distance} height={height} eye={eye} facing={1} band={[band.lo, band.hi]} />
          {!task.done && ([[bottom, band.lo], [top, band.hi]] as const).map(([y, land]) => {
            const P: Vec = [0, y];
            return <g key={y}>
              <Beam s={s} from={E} to={P} />
              <Beam s={s} from={P} to={[E[0], land]} opacity={0.5} />
            </g>;
          })}
          {paths.map(({ src, P, img }) => <g key={src[1]}>
            <Beam s={s} from={src} to={P} width={1.8} opacity={0.9} />
            <Beam s={s} from={P} to={E} width={1.8} opacity={0.9} />
            <Beam s={s} from={P} to={img} dash />
          </g>)}
          {task.done && <g>
            <line x1={s.sx(-0.07)} x2={s.sx(-0.07)} y1={s.sy(least.bottom)} y2={s.sy(least.top)} stroke={C.energy} strokeWidth={1.2} />
            <text x={s.sx(-0.12)} y={s.sy((least.bottom + least.top) / 2) + 4} textAnchor="end" fontSize={13} fill={C.energy}
              stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{`${least.height.toFixed(2)} m = half of ${height.toFixed(2)} m`}</text>
          </g>}
          <Glass s={s} a={[0, bottom]} b={[0, top]} front={[-1, 1]} />
          <Handle s={s} at={[0, top]} step={0.01} color={C.energy} label="Top edge of the mirror: drag up or down"
            clamp={(p) => [0, p[1]]} onChange={(p) => setEdge(1, p[1])} />
          <Handle s={s} at={[0, bottom]} step={0.01} color={C.energy} label="Bottom edge of the mirror: drag up or down"
            clamp={(p) => [0, p[1]]} onChange={(p) => setEdge(0, p[1])} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Side view · you stand {distance.toFixed(1)} m from the glass · shaded: the part of you the mirror shows
      </p>
    </SceneCard>
  );
}

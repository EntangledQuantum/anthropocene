import { useState } from 'react';
import { floorMirror, mirrorImage, reflectionPoint } from '../../lib/physics/optics.ts';
import { C, CheckBar, Handle, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';
import { Beam, Glass } from './optics-kit-ch34.tsx';

/**
 * A room seen from above: a lamp, a long wall mirror, and two people looking
 * into it. The real light paths are drawn, lamp → glass → each eye, with the
 * reflection points found by the law of reflection (`reflectionPoint`). Each
 * eye meets the glass at a different spot, so "the image is on the mirror"
 * cannot be right for both. Drag the marker to where the lamp's image is.
 *
 * After a Check, each eye's sight line is carried straight on through the
 * glass (dashed). They cross at the image: as far behind as the lamp is in
 * front.
 */
export interface FindTheMirrorImageProps {
  id?: string;
  prompt?: string;
  lamp?: [number, number];
  eyes?: [number, number][];
  tolerance?: number;
  explanation?: string;
}

function EyeMark({ s, at, toward, label }: { s: StageApi; at: Vec; toward: Vec; label: string }) {
  const cx = s.sx(at[0]), cy = s.sy(at[1]);
  const a = (Math.atan2(s.sy(toward[1]) - cy, s.sx(toward[0]) - cx) * 180) / Math.PI;
  return <g pointerEvents="none">
    <g transform={`translate(${cx},${cy}) rotate(${a})`}>
      <path d="M-15,0 Q0,-12 15,0 Q0,12 -15,0 Z" fill={C.surface} stroke={C.ink} strokeWidth={1.8} />
      <circle cx={6} cy={0} r={4.5} fill={C.ink} />
    </g>
    <text x={cx} y={cy - 18} textAnchor="middle" fontSize={13} fill={C.soft}>{label}</text>
  </g>;
}

export default function FindTheMirrorImage({
  id, prompt, lamp = [-0.8, 1.1], eyes = [[1.5, 0.55], [0.4, 1.95]], tolerance = 0.12, explanation,
}: FindTheMirrorImageProps) {
  const task = useTask(id, 'find-the-mirror-image');
  const [mark, setMark] = useState<Vec>([-2.6, 1.9]);
  const m = floorMirror(0);
  const img = mirrorImage(lamp, m) as Vec;
  const hits = eyes.map((e) => reflectionPoint(lamp, e, m) as Vec);
  const off = Math.hypot(mark[0] - img[0], mark[1] - img[1]);
  const shown = task.done || task.attempts > 0;

  const side = (y: number) => (Math.abs(y) < 0.03 ? 'on the glass' : `${Math.abs(y).toFixed(2)} m ${y > 0 ? 'in front of' : 'behind'} it`);
  const sideways = Math.abs(mark[0] - img[0]) > tolerance ? `, and ${Math.abs(mark[0] - img[0]).toFixed(2)} m to its ${mark[0] < img[0] ? 'left' : 'right'}` : '';
  const miss = `Carried straight on, both sight lines cross ${Math.abs(img[1]).toFixed(2)} m behind the glass. Your marker is ${side(mark[1])}${sideways}.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={id && <CheckBar verdict={task.verdict} done={task.done}
        onCheck={() => task.check(off <= tolerance, { mark })} miss={miss} hit={explanation} />}>
      <Stage x={[-2.4, 2.4]} y={[-1.7, 2.3]} height={340} equal
        label={`Seen from above. A lamp ${lamp[1]} metres in front of a mirror, two people looking into it, and your marker.`}>
        {(s) => <>
          <rect x={0} y={s.sy(0)} width={s.W} height={s.H - s.sy(0)} fill="var(--color-abyss)" opacity={0.6} />
          <text x={s.sx(s.x[1]) - 8} y={s.sy(-1.5)} textAnchor="end" fontSize={12} fill={C.faint}>behind the glass</text>
          <text x={s.sx(s.x[1]) - 8} y={s.sy(2.1)} textAnchor="end" fontSize={12} fill={C.faint}>the room, seen from above</text>
          {shown && eyes.map((e, i) => {
            const P = hits[i];
            const k = (img[1] - 0.35 - e[1]) / (P[1] - e[1]);
            return <Beam key={`x${i}`} s={s} from={P} to={[e[0] + (P[0] - e[0]) * k, e[1] + (P[1] - e[1]) * k]} dash opacity={0.9} />;
          })}
          {eyes.map((e, i) => <g key={i}>
            <Beam s={s} from={lamp} to={hits[i]} width={1.6} opacity={0.85} />
            <Beam s={s} from={hits[i]} to={e} width={1.6} opacity={0.85} />
            <circle cx={s.sx(hits[i][0])} cy={s.sy(0)} r={3.5} fill={C.ink} />
          </g>)}
          <Glass s={s} a={[-2.9, 0]} b={[2.9, 0]} front={[0, 1]} />
          <circle cx={s.sx(lamp[0])} cy={s.sy(lamp[1])} r={11} fill={C.force} opacity={0.25} />
          <circle cx={s.sx(lamp[0])} cy={s.sy(lamp[1])} r={6} fill={C.force} />
          <text x={s.sx(lamp[0])} y={s.sy(lamp[1]) - 16} textAnchor="middle" fontSize={13} fill={C.force}>lamp</text>
          {task.done && <circle cx={s.sx(img[0])} cy={s.sy(img[1])} r={9} fill="none" stroke={C.force} strokeWidth={2} strokeDasharray="4 3" />}
          {eyes.map((e, i) => <EyeMark key={i} s={s} at={e} toward={hits[i]} label={i === 0 ? 'Ana' : 'Ben'} />)}
          <circle cx={s.sx(mark[0])} cy={s.sy(mark[1])} r={15} fill="none" stroke={C.position} strokeWidth={1.5} strokeDasharray="3 3" />
          <text x={s.sx(mark[0]) + 20} y={s.sy(mark[1]) + 4} fontSize={13} fill={C.position}
            stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">the image is here</text>
          <Handle s={s} at={mark} step={0.05} color={C.position} label="Marker: drag it to where the lamp's image is"
            clamp={(p) => [Math.max(-2.9, Math.min(2.9, p[0])), Math.max(-1.6, Math.min(2.2, p[1]))]}
            onChange={(p) => { setMark([Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]); task.touch(); }} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Seen from above · white: the light that reaches each eye · dots: where each eye sees the lamp on the glass{shown ? ' · dashed: sight lines carried on' : ''}
      </p>
    </SceneCard>
  );
}

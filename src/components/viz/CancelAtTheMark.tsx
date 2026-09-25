import { useState } from 'react';
import { contains, ellipseLoop, fluxThroughLoop, rodField, rodsFromNano } from '../../lib/physics/gauss.ts';
import type { Vec2 } from '../../lib/physics/vectors.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { FluxTicks, RodDot, RodFieldLines, SleevePath } from './gauss-kit.tsx';

/**
 * A round sleeve around a +1 nC/m rod, a marked spot on the sleeve, and a
 * second, loose +1 rod you drag anywhere. Put it where it cancels the field
 * at the mark. The flux meter keeps reading the same the whole time the loose
 * rod stays outside: it rearranges where the field pierces the sleeve, never
 * how much in total.
 *
 * Every number is `rodField` / `fluxThroughLoop` from gauss.ts; gauss.test.ts
 * pins the answer (twice the sleeve's radius, straight out through the mark)
 * and that no position inside the sleeve can do it.
 */
export interface CancelAtTheMarkProps {
  id?: string;
  prompt?: string;
  /** Where the mark sits on the sleeve, degrees from +x. */
  markDeg?: number;
  explanation?: string;
}

const R = 1;
const TOL = 0.12; // fraction of the lone rod's field that counts as cancelled

export default function CancelAtTheMark({ id, prompt, markDeg = 30, explanation }: CancelAtTheMarkProps) {
  const task = useTask(id, 'cancel-at-the-mark');
  const [loose, setLoose] = useState<Vec2>([-1.9, -0.75]);
  const th = (markDeg * Math.PI) / 180;
  const mark: Vec2 = [R * Math.cos(th), R * Math.sin(th)];
  const n: Vec2 = [Math.cos(th), Math.sin(th)];

  const rods = rodsFromNano([{ x: 0, y: 0, q: 1 }, { x: loose[0], y: loose[1], q: 1 }]);
  const loop = ellipseLoop(0, 0, R, R);
  const flux = fluxThroughLoop(rods, loop);
  const e0 = Math.hypot(...rodField(rods.slice(0, 1), mark[0], mark[1]));
  const e = rodField(rods, mark[0], mark[1]);
  const eMag = Math.hypot(e[0], e[1]);
  const en = e[0] * n[0] + e[1] * n[1];
  const looseIn = contains(loop, loose[0], loose[1]);
  const hit = eMag <= TOL * e0;

  const way = Math.abs(en) > 0.7 * eMag ? (en > 0 ? 'mostly out of the sleeve' : 'mostly into the sleeve') : 'mostly along the sleeve';
  const miss = looseIn
    ? `The loose rod is inside the sleeve: the flux jumped to ${flux.toFixed(0)} N·m²/C, and the field at the mark is ${eMag.toFixed(1)} N/C.`
    : `The field at the mark is still ${eMag.toFixed(1)} N/C, pointing ${way}.`;
  const PER = 0.03; // metres of arrow per N/C

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          <Meter label="Field at the mark" value={eMag.toFixed(1)} unit="N/C" color={C.field} />
          <Meter label="Flux out of the sleeve" value={flux.toFixed(0)} unit="N·m²/C" color={C.field} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { loose })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-2.4, 2.4]} y={[-1.4, 2.2]} height={380} equal
        label={`A sleeve round a rod; a loose rod at ${loose[0].toFixed(1)}, ${loose[1].toFixed(1)}. Field at the mark ${eMag.toFixed(1)} N/C.`}>
        {(s) => <>
          <RodFieldLines s={s} rods={rods} />
          <SleevePath s={s} loop={loop} />
          <FluxTicks s={s} rods={rods} loop={loop} perNC={0.012} />
          <RodDot s={s} at={[0, 0]} q={1} label="+1" />
          <circle cx={s.sx(mark[0])} cy={s.sy(mark[1])} r={9} fill="none" stroke={C.ink} strokeWidth={2} />
          <text x={s.sx(mark[0]) - 14} y={s.sy(mark[1]) - 12} textAnchor="end" fontSize={13} fill={C.soft}
            stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">mark</text>
          {eMag > 0.3 && <Arrow s={s} from={mark} to={[mark[0] + e[0] * PER, mark[1] + e[1] * PER]} color={C.field} width={4} />}
          <RodDot s={s} at={loose} q={1} label="+1 loose" />
          <Handle s={s} at={loose} step={0.05} r={14} color={C.ink} label="Loose rod: drag it anywhere"
            onChange={(p) => { setLoose([Math.min(2.3, Math.max(-2.3, p[0])), Math.min(2.1, Math.max(-1.3, p[1]))]); task.touch(); }} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Two +1 nC/m rods and a sleeve of radius 1 m, seen end-on · thick orchid arrow: the field at the mark · ticks: the field piercing the sleeve
      </p>
    </SceneCard>
  );
}

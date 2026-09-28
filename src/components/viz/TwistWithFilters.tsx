import { useState } from 'react';
import { DEG, throughFilters, twistTransmission } from '../../lib/physics/light.ts';
import { C, CheckBar, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { useGlow } from './optics-kit-ch33.tsx';
import { Beam, FieldArrow, Filter, Lamp, Screen } from './polar-kit-ch33.tsx';

/**
 * Light leaves a vertical filter and must come out turned a full 90°, with
 * its field horizontal. You choose how many filters share the turn; they are
 * spaced evenly, each a little past the one before, the last one horizontal.
 * Shine the lamp to see what survives. The field after every filter is drawn
 * above it, at its true angle and length, so the arrow is seen turning in
 * small steps and hardly shrinking.
 *
 * Graded with `id`: keep at least `target` of the light. Numbers:
 * `throughFilters` / `twistTransmission` in light.ts, which pins 12 as the
 * fewest filters that keep 80%.
 */
export interface TwistWithFiltersProps {
  id?: string;
  prompt?: string;
  target?: number;
  start?: number;
  explanation?: string;
}

const Y = 118, MAXN = 24;

export default function TwistWithFilters({ id, prompt, target = 0.8, start = 2, explanation }: TwistWithFiltersProps) {
  const task = useTask(id, 'twist-with-filters');
  const [n, setN] = useState(start);
  const [lit, setLit] = useState(!id);
  const { id: glow, defs } = useGlow();
  const axes = Array.from({ length: n }, (_, i) => ((i + 1) * 90) / n);
  const after = throughFilters(1, axes.map((a) => a * DEG), 0);
  const out = twistTransmission(n);
  const ok = out >= target;

  const x0 = 150, x1 = 520;
  const gap = n > 1 ? (x1 - x0) / (n - 1) : 0;
  const xs = axes.map((_, i) => (n > 1 ? x0 + i * gap : (x0 + x1) / 2));
  const r = Math.max(9, Math.min(40, gap * 0.45 || 40));
  const change = (d: number) => { setN((v) => Math.max(1, Math.min(MAXN, v + d))); if (id && !task.done) setLit(false); task.touch(); };

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={() => change(-1)} disabled={n <= 1}>Remove a filter</button>
          <button type="button" className="anth-btn" onClick={() => change(1)} disabled={n >= MAXN}>Add a filter</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Filters sharing the turn" value={String(n)} />
            <Meter label="Each turns it by" value={(90 / n).toFixed(1)} unit="°" />
            <Meter label="Light that comes out" value={lit ? (out * 100).toFixed(1) : '–'} unit="%" color={C.energy} />
          </span>
        </div>
        {id && <CheckBar label="Shine the lamp" verdict={task.verdict} done={task.done}
          onCheck={() => { setLit(true); task.check(ok, { n }); }}
          miss={`With ${n} filter${n === 1 ? '' : 's'}, each turning the light ${(90 / n).toFixed(1)}°, ${(out * 100).toFixed(1)}% comes out, short of ${(target * 100).toFixed(0)}%.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[0, 616]} y={[0, 226]} height={250}
        label={`${n} filters turn vertical light to horizontal in steps of ${(90 / n).toFixed(1)} degrees. ${lit ? `${(out * 100).toFixed(1)} percent comes out.` : 'The lamp is off.'}`}>
        {(s) => <>
          {defs}
          <Beam s={s} x0={30} x1={x0} y={Y} b={lit ? 1 : 0} glow={glow} />
          {lit && xs.map((x, i) => <Beam key={i} s={s} x0={x} x1={i + 1 < n ? xs[i + 1] : 590} y={Y} b={after[i]} glow={glow} />)}
          <Lamp s={s} at={[30, Y]} glow={glow} on={lit} />
          <FieldArrow s={s} at={[92, Y + 72]} deg={0} len={22} />
          <text x={s.sx(92)} y={s.sy(Y - 48)} textAnchor="middle" fontSize={12} fill={C.faint}>vertical, in</text>
          {xs.map((x, i) => <g key={i}>
            <Filter s={s} at={[x, Y]} r={r} deg={axes[i]} slots={r > 22} />
            {lit && <FieldArrow s={s} at={[x, Y + 72]} deg={axes[i]} len={22 * Math.sqrt(after[i])} />}
          </g>)}
          <Screen s={s} at={[590, Y]} b={lit ? out : 0} glow={glow} h={96} />
          <text x={s.sx(590)} y={s.sy(Y + 72) + 4} textAnchor="end" fontSize={12} fill={C.faint}>field after each filter</text>
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Light already polarised vertical enters from the left · each filter is turned {(90 / n).toFixed(1)}° past the one before · the last is horizontal
      </p>
    </SceneCard>
  );
}

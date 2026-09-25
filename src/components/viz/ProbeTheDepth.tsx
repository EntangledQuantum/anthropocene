import { useState } from 'react';
import { clipBelow, hydrostaticPressure, pointInPolygon, type Vec2 } from '../../lib/physics/fluids.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { PushArrow, WATER_FILL, WATER_LINE, kPa, polyPath } from './fluid-kit.tsx';

/**
 * Glass vessels of different shapes, all filled to the same level, and one
 * pressure probe you drag through the water. Eight small amber arrows show
 * the water pushing on the probe from every side, all the same length.
 *
 * Free (no `id`): every vessel shows the gauge in its floor, and they agree.
 * Graded (`id`, `mark`, `probeIn`): the probe's gauge is covered. Slide it
 * up or down one vessel until it would read the same as a marked point in
 * another; the covers come off when you check. The cellar is Pascal's barrel:
 * a closed chamber under a thin chimney, where the water above a point is
 * thin but the depth below the free surface is not.
 * Physics: `hydrostaticPressure` in src/lib/physics/fluids.ts.
 */
type Kind = 'tank' | 'tube' | 'funnel' | 'cellar';

export interface ProbeTheDepthProps {
  id?: string;
  prompt?: string;
  vessels?: Kind[];
  /** Water level in every vessel, m above the floor. */
  level?: number;
  /** The point to match, in the named vessel's own coordinates (m). */
  mark?: { vessel: Kind; x: number; y: number };
  /** In graded mode the probe slides up and down the middle of this vessel. */
  probeIn?: Kind;
  /** Pa. */
  tolerance?: number;
  explanation?: string;
}

const TOP = 1.0;
const SHAPES: Record<Kind, { w: number; poly: Vec2[]; name: string; ceiling?: [number, number, number] }> = {
  tank: { w: 0.8, name: 'wide tank', poly: [[0, 0], [0.8, 0], [0.8, TOP], [0, TOP]] },
  tube: { w: 0.08, name: 'thin tube', poly: [[0, 0], [0.08, 0], [0.08, TOP], [0, TOP]] },
  funnel: { w: 0.7, name: 'funnel', poly: [[0.28, 0], [0.42, 0], [0.7, TOP], [0, TOP]] },
  cellar: {
    w: 0.7, name: 'cellar and chimney', ceiling: [0, 0.6, 0.35],
    poly: [[0, 0], [0.7, 0], [0.7, 0.35], [0.66, 0.35], [0.66, TOP], [0.6, TOP], [0.6, 0.35], [0, 0.35]],
  },
};
const GAP = 0.3;
const DIRS: Vec2[] = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)]);
const ARROW_PER_PA = 0.02 / 1000; // 2 cm of arrow per kPa

export default function ProbeTheDepth({
  id, prompt, vessels = ['tank', 'tube', 'funnel'], level = 0.8, mark, probeIn, tolerance = 300, explanation,
}: ProbeTheDepthProps) {
  const graded = Boolean(id && mark && probeIn);
  const task = useTask(graded ? id : undefined, 'probe-the-depth');

  // lay the vessels out left to right
  let x0 = 0;
  const laid = vessels.map((k) => { const v = { kind: k, x: x0, ...SHAPES[k] }; x0 += SHAPES[k].w + GAP; return v; });
  const span = x0 - GAP;
  const world = (k: Kind, p: Vec2): Vec2 => { const v = laid.find((l) => l.kind === k)!; return [v.x + p[0], p[1]]; };
  const lane = probeIn ? laid.find((l) => l.kind === probeIn) : undefined;

  const [probe, setProbe] = useState<Vec2>(lane ? [lane.x + lane.w / 2, 0.9] : [laid[0].x + laid[0].w / 2, 0.45]);

  const inWater = (p: Vec2) => p[1] <= level && laid.some((v) => pointInPolygon([p[0] - v.x, p[1]], v.poly));
  const pressureAt = (p: Vec2) => (inWater(p) ? hydrostaticPressure(level - p[1]) : 0);

  const pProbe = pressureAt(probe);
  const markW = mark ? world(mark.vessel, [mark.x, mark.y]) : null;
  const pMark = markW ? pressureAt(markW) : 0;
  const revealed = !graded || task.verdict !== 'none' || task.done;

  const clamp = (p: Vec2): Vec2 => {
    if (lane) return [lane.x + lane.w / 2, Math.min(TOP - 0.02, Math.max(0.02, p[1]))];
    return [Math.min(span + 0.1, Math.max(-0.1, p[0])), Math.min(1.1, Math.max(0.02, p[1]))];
  };

  const dy = markW ? probe[1] - markW[1] : 0;
  const miss = `Your probe reads ${kPa(pProbe)}; the marked point reads ${kPa(pMark)}. The probe is ${Math.abs(dy).toFixed(2)} m ${dy > 0 ? 'higher' : 'lower'} than the mark.`;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Probe gauge" value={revealed ? (inWater(probe) ? kPa(pProbe) : 'in air, 0') : 'covered'} color={C.force} />
          {markW && <Meter label="Marked point" value={revealed ? kPa(pMark) : 'covered'} color={C.position} />}
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(Math.abs(pProbe - pMark) <= tolerance, { y: probe[1] })}
          miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-0.12, span + 0.12]} y={[-0.3, 1.1]} height={340} equal
        label={`Vessels filled to ${level} m. The probe ${inWater(probe) ? `is ${(level - probe[1]).toFixed(2)} m below the surface` : 'is out of the water'}.`}>
        {(s) => <>
          <line x1={s.sx(-0.12)} x2={s.sx(span + 0.12)} y1={s.sy(0)} y2={s.sy(0)} stroke={C.rule} strokeWidth={2} />
          {laid.map((v) => {
            const water = clipBelow(v.poly, level).map(([x, y]) => [x + v.x, y] as Vec2);
            const edges = v.poly.map((a, i) => [a, v.poly[(i + 1) % v.poly.length]] as const)
              .filter(([a, b]) => !(a[1] >= TOP && b[1] >= TOP));
            const surf = water.filter((p) => Math.abs(p[1] - level) < 1e-9).map((p) => p[0]);
            const cx = v.x + (v.kind === 'funnel' ? 0.35 : v.kind === 'cellar' ? 0.3 : v.w / 2);
            const pFloor = hydrostaticPressure(level);
            return <g key={v.kind}>
              <path d={polyPath(s, water)} fill={WATER_FILL} />
              {surf.length >= 2 && <line x1={s.sx(Math.min(...surf))} x2={s.sx(Math.max(...surf))} y1={s.sy(level)} y2={s.sy(level)} stroke={WATER_LINE} strokeWidth={2} />}
              {edges.map(([a, b], i) => <line key={i} x1={s.sx(v.x + a[0])} y1={s.sy(a[1])} x2={s.sx(v.x + b[0])} y2={s.sy(b[1])} stroke={C.soft} strokeWidth={2.5} strokeLinecap="round" />)}
              {v.ceiling && revealed && (graded ? task.done : true) && [0.12, 0.35, 0.58, 0.8].map((f) => {
                const [xa, xb, yc] = v.ceiling!;
                return <PushArrow key={f} s={s} at={[v.x + xa + f * (xb - xa), yc]} dir={[0, 1]} len={hydrostaticPressure(level - yc) * ARROW_PER_PA} />;
              })}
              <text x={s.sx(v.x + v.w / 2)} y={s.sy(-0.1)} textAnchor="middle" fontSize={13} fill={C.soft}>{v.name}</text>
              {!graded && <text x={s.sx(cx)} y={s.sy(-0.22)} textAnchor="middle" fontSize={13} fill={C.force} fontFamily="var(--font-mono)">floor {kPa(pFloor)}</text>}
            </g>;
          })}
          {/* level rule, so equal levels read as equal */}
          <line x1={s.sx(-0.12)} x2={s.sx(span + 0.12)} y1={s.sy(level)} y2={s.sy(level)} stroke={C.ghost} strokeDasharray="3 5" />
          <text x={s.sx(-0.1)} y={s.sy(level) - 6} fontSize={12} fill={C.faint}>surface, {level} m</text>
          {markW && <g>
            <circle cx={s.sx(markW[0])} cy={s.sy(markW[1])} r={7} fill="none" stroke={C.position} strokeWidth={2.5} />
            <text x={s.sx(markW[0]) + 12} y={s.sy(markW[1]) + 4} fontSize={13} fill={C.position}>marked point</text>
          </g>}
          {revealed && inWater(probe) && DIRS.map((d, i) => (
            <PushArrow key={i} s={s} at={[probe[0] + d[0] * 0.035, probe[1] + d[1] * 0.035]} dir={[-d[0], -d[1]]} len={pProbe * ARROW_PER_PA} />
          ))}
          <Handle s={s} at={probe} color={C.force} step={0.01} r={7} label="Pressure probe: drag it through the water"
            onChange={(p) => { setProbe(clamp(p)); task.touch(); }} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Fresh water · gauge pressure, above the air's · amber arrows: the water pushing on the probe{graded ? '' : ' · floor: the gauge in each vessel\'s floor'}
      </p>
    </SceneCard>
  );
}

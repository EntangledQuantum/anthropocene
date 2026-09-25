import { useState } from 'react';
import { MICRO, directionWord, forceOn, nullsOnAxis, si, type Charge } from '../../lib/physics/charges-ch21.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { ChargeDot } from './charge-kit-ch21.tsx';

/**
 * A charged bead on a frictionless wire, with fixed charges on the same line.
 * Drag the bead: each charge's Coulomb push on it is a thin amber arrow and
 * their sum is the thick one. Between like charges the pushes oppose and swell
 * steeply near each charge, so the balance sits nearer the smaller one. Between
 * unlike charges they point the same way everywhere, and the balance is outside.
 *
 * `wire={false}` takes the wire away: the bead can be dragged anywhere, and
 * just off the axis the net push points further off it (Earnshaw).
 *
 * Graded with `id`: put the bead where the net force vanishes. The target is
 * found by `nullsOnAxis`, not typed in. Physics: charges-ch21.ts.
 */
export interface BeadBetweenChargesProps {
  id?: string;
  prompt?: string;
  /** Fixed charges on the axis: x in cm, q in µC. */
  charges: { x: number; q: number }[];
  /** The bead's charge, µC. */
  bead?: number;
  /** The stretch of wire shown, cm. */
  span: [number, number];
  /** Where the bead starts, cm. A pair when the wire is gone. */
  start?: number | [number, number];
  wire?: boolean;
  /** Arrow length, cm on the stage, per millinewton. */
  arrowScale?: number;
  /** How close to the balance point counts, cm. */
  tolerance?: number;
  explanation?: string;
}

const CM = 0.01;

export default function BeadBetweenCharges({
  id, prompt, charges, bead = 0.1, span, start = 0, wire = true, arrowScale = 0.07, tolerance = 1, explanation,
}: BeadBetweenChargesProps) {
  const task = useTask(id, 'bead-between-charges');
  const [p, setP] = useState<Vec>(typeof start === 'number' ? [start, 0] : start);

  const src: Charge[] = charges.map((c) => ({ x: c.x * CM, y: 0, q: c.q * MICRO }));
  const qb = bead * MICRO;
  const each = src.map((c) => forceOn([c], qb, p[0] * CM, p[1] * CM));
  const net = forceOn(src, qb, p[0] * CM, p[1] * CM);
  const netMag = Math.hypot(net[0], net[1]);
  // Below a millionth of the pushes it is rounding, not physics: call it zero.
  const zero = netMag < 1e-6 * Math.max(...each.map((f) => Math.hypot(f[0], f[1])));

  const width = span[1] - span[0];
  const H = wire ? 180 : 300;
  const yHalf = (width * (H - 24)) / (640 - 24) / 2;
  const cap = width * 0.32;
  const toArrow = (f: readonly [number, number]): { to: Vec; capped: boolean } => {
    const L = Math.hypot(f[0], f[1]) * 1000 * arrowScale;
    // keep every arrow on the stage: no longer than `cap`, and short of the edge it points at
    const room = wire ? (f[0] >= 0 ? span[1] - p[0] : p[0] - span[0]) - 3 : cap;
    const lim = Math.max(1.5, Math.min(cap, room));
    const k = L > lim ? lim / L : 1;
    return { to: [p[0] + f[0] * 1000 * arrowScale * k, p[1] + f[1] * 1000 * arrowScale * k], capped: k < 1 };
  };

  const clamp = (q: Vec): Vec => {
    let x = Math.min(span[1] - 1, Math.max(span[0] + 1, q[0]));
    const y = wire ? 0 : Math.max(-yHalf + 1, Math.min(yHalf - 1, q[1]));
    for (const c of charges) {
      // Never sit on a charge. A step that lands on one hops to its far side,
      // so the keyboard can carry the bead past it too.
      if (Math.hypot(x - c.x, y) < 1.5) {
        const from = p[0] >= c.x ? 1 : -1;
        const crossing = from > 0 ? x < p[0] : x > p[0];
        x = c.x + (crossing ? -from : from) * 1.5;
      }
    }
    return [x, y];
  };

  const nulls = id ? nullsOnAxis(src, span[0] * CM, span[1] * CM).map((x) => x / CM) : [];
  const onNull = nulls.some((x) => Math.abs(x - p[0]) <= tolerance);
  const way = (f: readonly [number, number]) => (wire ? (f[0] >= 0 ? '→' : '←') : '');
  const ticks: number[] = [];
  for (let t = Math.ceil((span[0] + 2) / 10) * 10; t <= span[1] - 3; t += 10) ticks.push(t);
  const origin = charges[0]?.x ?? 0;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          {charges.map((c, i) => <Meter key={i} label={`Push from ${c.q > 0 ? '+' : '−'}${Math.abs(c.q)} µC`}
            value={`${si(Math.hypot(...each[i]), 'N')} ${way(each[i])}`} color={C.force} />)}
          <Meter label="Net force on the bead" value={zero ? '0 N' : `${si(netMag, 'N')} ${way(net)}`} color={C.force} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(onNull, { x: p[0] })}
          miss={`The pushes still add to ${si(netMag, 'N')}, pointing ${directionWord(net)}. The bead slides.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[span[0], span[1]]} y={[-yHalf, yHalf]} height={H} equal
        label={`A bead carrying ${bead} microcoulombs at ${p[0].toFixed(1)} cm. Net force ${si(netMag, 'N')}.`}>
        {(s) => <>
          {wire && <line x1={s.sx(span[0] - 5)} x2={s.sx(span[1] + 5)} y1={s.sy(0)} y2={s.sy(0)} stroke={C.rule} strokeWidth={2} />}
          {!wire && <line x1={s.sx(span[0] - 5)} x2={s.sx(span[1] + 5)} y1={s.sy(0)} y2={s.sy(0)} stroke={C.grid} strokeWidth={1} strokeDasharray="3 6" />}
          {ticks.map((t) => <g key={t}>
            <line x1={s.sx(t)} x2={s.sx(t)} y1={s.sy(-yHalf) - 26} y2={s.sy(-yHalf) - 20} stroke={C.faint} />
            <text x={s.sx(t)} y={s.sy(-yHalf) - 6} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{`${t - origin}`.replace('-', '−')} cm</text>
          </g>)}
          {charges.map((c, i) => <ChargeDot key={i} s={s} at={[c.x, 0]} q={c.q} label={`${c.q > 0 ? '+' : '−'}${Math.abs(c.q)} µC`} />)}
          {each.map((f, i) => {
            const a = toArrow(f);
            const off = wire ? (i === 0 ? 0.9 : -0.9) * yHalf * 0.18 : 0;
            return <Arrow key={i} s={s} from={[p[0], p[1] + off]} to={[a.to[0], a.to[1] + off]} color={C.force} width={2} dash={a.capped ? '5 4' : undefined} />;
          })}
          {netMag * 1000 * arrowScale > 0.3 && (() => {
            const a = toArrow(net);
            return <Arrow s={s} from={p} to={a.to} color={C.force} width={5} dash={a.capped ? '8 5' : undefined} label="net" labelSide={-1} />;
          })()}
          <Handle s={s} at={p} color={C.ink} step={0.5} label={wire ? 'The bead: slide it along the wire' : 'The bead: drag it anywhere'}
            onChange={(q) => { setP(clamp(q)); task.touch(); }} />
          <text x={s.sx(p[0])} y={s.sy(p[1]) + 38} textAnchor="middle" fontSize={12} fill={C.soft}>+{bead} µC</text>
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        {wire ? 'Frictionless wire' : 'No wire'} · thin amber: the push from each charge · thick: their sum · dashed: too long to draw to scale
      </p>
    </SceneCard>
  );
}

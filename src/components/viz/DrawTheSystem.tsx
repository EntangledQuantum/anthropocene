import { useState } from 'react';
import { netForceOnSystem } from '../../lib/physics/dynamics.ts';
import { externalForces, pushedRow, systemAcceleration } from '../../lib/physics/pairs-ch04.ts';
import { Arrow, Body, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';

/**
 * A row of bodies moving together, driven by one outside force, and a dashed
 * boundary you drag around any of them. That boundary is "the system".
 *
 * Every contact between two bodies is a pair of arrows. When both ends of a
 * pair are inside your boundary the pair greys out: it enters the system's sum
 * twice with opposite signs and cancels. The meters report what is left, the
 * forces that cross the boundary, and the acceleration they give the mass
 * inside, which comes out the same whichever boundary you draw.
 *
 * Two handles: the left and right edges of the boundary, snapping to the gaps.
 * Physics: `pushedRow`, `externalForces` (pairs-ch04.ts), `netForceOnSystem`.
 * Graded with `id` + `target`: draw a system whose only outside force is the
 * contact at link `target` (0 is the link between the first two bodies).
 */
export interface DrawTheSystemProps {
  id?: string;
  prompt?: string;
  masses: number[];
  names: string[];
  /** Which body the outside force acts on: 'first' (pushed from behind) or 'last' (pulled from ahead). */
  driven?: 'first' | 'last';
  push: number;
  /** Who exerts the outside force. */
  by?: string;
  /** Starting boundary as gap indices [left, right]; gap k sits just left of body k. */
  start?: [number, number];
  target?: number;
  explanation?: string;
}

/** A force's name, centred above the middle of its arrow, so it stays on the body the force acts on. */
function Tag({ s, x, y, children }: { s: StageApi; x: number; y: number; children: string }) {
  return <text x={s.sx(x)} y={s.sy(y) - 10} textAnchor="middle" fontSize={13} fontWeight={600} fill={C.force}
    stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{children}</text>;
}

export default function DrawTheSystem({
  id, prompt, masses, names, driven = 'first', push, by = 'you', start, target, explanation,
}: DrawTheSystemProps) {
  const n = masses.length;
  const graded = Boolean(id && target !== undefined);
  const task = useTask(graded ? id : undefined, 'draw-the-system');
  const [edges, setEdges] = useState<[number, number]>(start ?? [0, 1]);

  const dIdx = driven === 'first' ? 0 : n - 1;
  const row = pushedRow(masses, dIdx, push, by);
  const pull = row.links.some((f) => f < 0);

  // ── layout, in metres of drawing: widths grow as the cube root of the mass
  const mMin = Math.min(...masses);
  const w = masses.map((m) => 1.1 * Math.cbrt(m / mMin));
  const gap = pull ? 1.0 : 0;
  const left: number[] = [];
  w.forEach((wi, i) => left.push(i === 0 ? 0 : left[i - 1] + w[i - 1] + gap));
  const right = (i: number) => left[i] + w[i];
  const gapX = (k: number) => (k === 0 ? -0.2 : k === n ? right(n - 1) + 0.2 : (right(k - 1) + left[k]) / 2);
  const hMin = Math.min(...w), hMax = Math.max(...w);

  // One scale for every force arrow, chosen so each contact arrow fits its space.
  const S = Math.min(...row.links.map((f, i) =>
    (pull ? gap * 0.46 : 0.9 * Math.min(w[i], w[i + 1])) / Math.abs(f)));

  const system = row.ids.slice(edges[0], edges[1]);
  const inside = new Set(system);
  const ext = externalForces(system, row.forces);
  const extIds = new Set(ext.map((f) => f.id));
  const net = netForceOnSystem(system, row.forces)[0];
  const M = system.reduce((s, b) => s + masses[row.ids.indexOf(b)], 0);
  const a = systemAcceleration(system, row);

  const nameOf = (bid: string) => (bid.startsWith('b') ? names[+bid.slice(1)] : bid);
  const yTop = hMax + 0.55;

  const KEY = 0.001; // the handles' keyboard step: a nudge this small means "next gap over"
  const setEdge = (which: 0 | 1, p: Vec) => {
    const cur = edges[which], moved = p[0] - gapX(cur);
    let best = 0;
    if (Math.abs(Math.abs(moved) - KEY) < 1e-9) best = cur + Math.sign(moved);
    else for (let k = 0; k <= n; k++) if (Math.abs(gapX(k) - p[0]) < Math.abs(gapX(best) - p[0])) best = k;
    best = Math.max(0, Math.min(n, best));
    const next: [number, number] = [...edges];
    next[which] = which === 0 ? Math.min(best, edges[1] - 1) : Math.max(best, edges[0] + 1);
    if (next[0] !== edges[0] || next[1] !== edges[1]) { setEdges(next); task.touch(); }
  };

  const ok = ext.length === 1 && target !== undefined && ext[0].id.replace('-partner', '') === `link${target}`;
  const fmt = (v: number) => `${Math.abs(v).toFixed(0)} N ${v >= 0 ? '→' : '←'}`;
  const miss = (() => {
    if (target === undefined) return '';
    const a0 = names[target], b0 = names[target + 1];
    const list = ext.map((f) => `${nameOf(f.by)} on ${nameOf(f.on)}, ${fmt(f.vec[0])}`).join('; ');
    if (inside.has(`b${target}`) && inside.has(`b${target + 1}`))
      return `The ${a0}–${b0} contact is inside your boundary, so its two arrows cancel. Crossing it: ${list}.`;
    return `${ext.length} force${ext.length === 1 ? '' : 's'} cross${ext.length === 1 ? 'es' : ''} your boundary (${list}), and the meter shows their sum, ${fmt(net)}.`;
  })();

  const x0 = -0.2 - (dIdx === 0 ? push * S + 0.4 : 0.3);
  const x1 = right(n - 1) + 0.2 + (dIdx === n - 1 ? Math.max(0, push * S - w[n - 1] / 2) + 0.6 : 0.3);

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Outside force on your system" value={fmt(net)} color={C.force} />
          <Meter label="Mass inside" value={String(M)} unit="kg" />
          <Meter label="Outside force ÷ mass" value={a.toFixed(2)} unit="m/s²" color={C.accel} />
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(ok, { edges })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[x0, x1]} y={[-0.35, yTop + 0.25]} height={260} equal ground
        label={`Boundary around ${system.map(nameOf).join(' and ')}. Outside force ${net.toFixed(0)} newtons on ${M} kilograms.`}>
        {(s) => <>
          <rect x={s.sx(gapX(edges[0]))} y={s.sy(yTop)} width={s.sx(gapX(edges[1])) - s.sx(gapX(edges[0]))}
            height={s.sy(-0.2) - s.sy(yTop)} rx={10} fill="var(--color-accent)" fillOpacity={0.06}
            stroke="var(--color-accent)" strokeWidth={2} strokeDasharray="8 6" />
          {pull && row.links.map((_, i) => <line key={`h${i}`} x1={s.sx(right(i))} x2={s.sx(left[i + 1])}
            y1={s.sy(hMin * 0.5)} y2={s.sy(hMin * 0.5)} stroke={C.faint} strokeWidth={1.5} />)}
          {w.map((wi, i) => <g key={`b${i}`}>
            <Body s={s} at={[left[i] + wi / 2, wi / 2]} w={wi} h={wi} />
            <text x={s.sx(left[i] + wi / 2)} y={s.sy(wi) + 20} textAnchor="middle" fontSize={13} fill={C.soft}>{names[i]} · {masses[i]} kg</text>
          </g>)}
          {row.forces.map((f) => {
            const internal = !extIds.has(f.id) && inside.has(f.on);
            const color = internal ? C.faint : C.force;
            const dash = internal ? '4 4' : undefined;
            const label = internal ? undefined : `${nameOf(f.by)} on ${nameOf(f.on)}`;
            if (f.id === 'outside') {
              const i = dIdx;
              const from: Vec = i === 0 ? [left[0] - push * S, w[0] / 2] : [left[i] + w[i] / 2, 0.14];
              const to: Vec = [from[0] + push * S, from[1]];
              return <g key={f.id}>
                <Arrow s={s} from={from} to={to} color={color} dash={dash} />
                {label && <Tag s={s} x={(from[0] + to[0]) / 2} y={from[1]}>{label}</Tag>}
              </g>;
            }
            const li = +f.id.replace('link', '').replace('-partner', '');
            const y = pull ? hMin * 0.5 : hMin * (li % 2 === 0 ? 0.22 : 0.5);
            const bi = +f.on.slice(1);
            // push: tails at the shared face, pointing into each block;
            // pull: tails at each body's facing side, pointing along the harness.
            const fromX = pull ? (bi === li ? right(li) : left[li + 1]) : gapX(li + 1);
            return <g key={f.id}>
              <Arrow s={s} from={[fromX, y]} to={[fromX + f.vec[0] * S, y]} color={color} dash={dash} />
              {label && <Tag s={s} x={fromX + f.vec[0] * S / 2} y={y}>{label}</Tag>}
            </g>;
          })}
          {w.map((wi, i) => <Arrow key={`a${i}`} s={s} from={[left[i] + wi / 2 - row.a * 0.15, wi + 0.14]}
            to={[left[i] + wi / 2 + row.a * 0.15, wi + 0.14]} color={C.accel} dash="7 5" width={2.5} />)}
          <Handle s={s} at={[gapX(edges[0]), yTop]} color="var(--color-accent)" step={KEY} label="Left edge of your system"
            onChange={(p) => setEdge(0, p)} />
          <Handle s={s} at={[gapX(edges[1]), yTop]} color="var(--color-accent)" step={KEY} label="Right edge of your system"
            onChange={(p) => setEdge(1, p)} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        dashed box: your system · amber: forces crossing it · grey: pairs inside it · dashed magenta: every body’s acceleration
      </p>
    </SceneCard>
  );
}

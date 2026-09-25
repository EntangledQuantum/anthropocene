import { useMemo, useRef, useState } from 'react';
import { equipotentialThrough, sceneToSI, workOnSegment, type SceneCharge } from '../../lib/physics/potential-ch23.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { ChargeDot } from './charge-kit-ch21.tsx';
import { PotentialKey, PotentialStage, ScaleBar } from './potential-kit-ch23.tsx';

/**
 * Fixed charges under a shaded potential map, and one small test charge you
 * carry by hand. Wherever you drag it, the scene integrates q E · dl along the
 * exact path you took (`workOnSegment`, Simpson's rule on each stretch) and
 * prints the running total: the work the field has done on the charge so far.
 * It never looks at V. Bring the charge home and the total is zero, however
 * long the walk; walk along a contour and it does not change.
 *
 * Graded (`id`): leave A and set the charge down at least `minAway` cm away
 * where the field's total work is back to zero. That is anywhere on the
 * contour through A, which is drawn once you find a point on it.
 */
export interface CarryTheChargeProps {
  id?: string;
  prompt?: string;
  /** Fixed charges, cm and nC. */
  charges?: SceneCharge[];
  /** Where the test charge starts: point A, cm. */
  start?: [number, number];
  /** Test charge, nC. */
  q?: number;
  /** Graded: how far from A the charge must end up, cm. */
  minAway?: number;
  /** Graded: largest |work| that counts as zero, µJ. */
  tolerance?: number;
  explanation?: string;
}

const X: [number, number] = [-22, 20];
const Y: [number, number] = [-13, 13];
const CM = 0.01;
const MAX_TRAIL = 900;

const uJ = (w: number) => {
  const v = w * 1e6;
  return `${Math.abs(v) < 0.005 ? '0.00' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(2)}`;
};

export default function CarryTheCharge({
  id, prompt, charges = [{ x: -8, y: -1, q: 8 }, { x: 9, y: 2, q: -5 }], start = [-4, 6], q = 1,
  minAway = 6, tolerance = 0.04, explanation,
}: CarryTheChargeProps) {
  const task = useTask(id, 'carry-the-charge');
  const si = useMemo(() => sceneToSI(charges), [charges]);
  const [p, setP] = useState<Vec>(start);
  const [work, setWork] = useState(0);
  const [walked, setWalked] = useState(0);
  const trail = useRef<Vec[]>([start]);
  // The integral runs from where the charge really is, not from the last
  // render: pointer events can arrive faster than React re-renders.
  const at = useRef<Vec>(start);
  const wandered = useRef(false);

  const qC = q * 1e-9;
  const away = Math.hypot(p[0] - start[0], p[1] - start[1]);

  const clamp = (r: Vec): Vec => {
    let x = Math.max(-21, Math.min(19, r[0]));
    let y = Math.max(-12, Math.min(12, r[1]));
    for (const c of charges) {
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < 1.8) { x = c.x + ((x - c.x) / (d || 1)) * 1.8; y = c.y + ((y - c.y) / (d || 1)) * 1.8; }
    }
    // Home: once you have been somewhere, landing within 0.6 cm of A puts you on A.
    if (wandered.current && Math.hypot(x - start[0], y - start[1]) < 0.6) return [start[0], start[1]];
    return [x, y];
  };

  const move = (r: Vec) => {
    const next = clamp(r);
    const from = at.current;
    at.current = next;
    // A fast drag can jump straight across a charge. The charge is then carried
    // round it instead, and the detour is part of the drawn path.
    const legs: Vec[] = [from];
    for (const c of charges) {
      const dx = next[0] - from[0], dy = next[1] - from[1];
      const L2 = dx * dx + dy * dy;
      const u = L2 > 0 ? Math.max(0, Math.min(1, ((c.x - from[0]) * dx + (c.y - from[1]) * dy) / L2)) : 0;
      const cx = from[0] + u * dx - c.x, cy = from[1] + u * dy - c.y;
      const d = Math.hypot(cx, cy);
      if (d < 1.6 && u > 0 && u < 1) {
        const [nx, ny] = d > 1e-6 ? [cx / d, cy / d] : [-dy / Math.sqrt(L2), dx / Math.sqrt(L2)];
        legs.push([c.x + nx * 2.2, c.y + ny * 2.2]);
        break;
      }
    }
    legs.push(next);
    let dw = 0;
    for (let i = 1; i < legs.length; i++) {
      dw += workOnSegment(si, qC, [legs[i - 1][0] * CM, legs[i - 1][1] * CM], [legs[i][0] * CM, legs[i][1] * CM]);
    }
    if (Math.hypot(next[0] - start[0], next[1] - start[1]) > 2) wandered.current = true;
    const t = trail.current;
    t.push(...legs.slice(1));
    if (t.length > MAX_TRAIL) t.splice(0, t.length - MAX_TRAIL);
    setWork((w) => w + dw);
    setWalked((d) => d + legs.slice(1).reduce((acc, l, i) => acc + Math.hypot(l[0] - legs[i][0], l[1] - legs[i][1]), 0));
    setP(next);
    task.touch();
  };

  const contour = useMemo(() => {
    if (!task.done) return null;
    const c = equipotentialThrough(si, [start[0] * CM, start[1] * CM], { ds: 2e-3, steps: 3000 });
    return c.points.map(([x, y]) => [x / CM, y / CM] as const);
  }, [task.done, si, start]);

  const zero = Math.abs(work) * 1e6 <= tolerance;
  const dV = -work / qC;
  const miss = away < minAway
    ? `The charge is ${away.toFixed(1)} cm from A. Find a spot at least ${minAway} cm away.`
    : `Here the field has done ${uJ(work)} µJ of work on it: this spot is ${Math.abs(dV).toFixed(0)} V ${dV < 0 ? 'lower' : 'higher'} than A.`;

  const trailPath = (s: { sx: (v: number) => number; sy: (v: number) => number }) =>
    trail.current.map((t, i) => `${i ? 'L' : 'M'}${s.sx(t[0]).toFixed(1)},${s.sy(t[1]).toFixed(1)}`).join('');

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'end' }}>
          <Meter label="Work done by the field so far" value={uJ(work)} unit="µJ" color={C.energy} />
          <Meter label="Distance walked" value={walked.toFixed(0)} unit="cm" color={C.soft} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(zero && away >= minAway, { p, work })}
          miss={miss} hit={explanation} />}
      </div>}>
      <PotentialStage charges={charges} stage={(capture) =>
        <Stage x={X} y={Y} height={360} equal
          label={`Potential map with ${charges.length} fixed charges. Test charge at ${p[0].toFixed(1)}, ${p[1].toFixed(1)} cm. The field has done ${uJ(work)} microjoules of work on it.`}>
          {(s) => { capture(s); return <>
            <ScaleBar s={s} at={[-20.5, -11.8]} />
            {contour && <path d={contour.map((t, i) => `${i ? 'L' : 'M'}${s.sx(t[0]).toFixed(1)},${s.sy(t[1]).toFixed(1)}`).join('')}
              fill="none" stroke={C.energy} strokeWidth={2.5} strokeDasharray="7 5" />}
            <path d={trailPath(s)} fill="none" stroke={C.soft} strokeWidth={1.6} opacity={0.75} strokeLinejoin="round" />
            <circle cx={s.sx(start[0])} cy={s.sy(start[1])} r={17} fill="none" stroke={C.ink} strokeWidth={1.5} strokeDasharray="4 4" />
            <text x={s.sx(start[0]) - 22} y={s.sy(start[1]) - 14} textAnchor="end" fontSize={15} fontWeight={600} fill={C.ink}
              stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">A</text>
            {charges.map((c, i) => <ChargeDot key={i} s={s} at={[c.x, c.y]} q={c.q} label={`${c.q > 0 ? '+' : '−'}${Math.abs(c.q)} nC`} />)}
            <Handle s={s} at={p} onChange={move} step={0.5} r={11} color={q > 0 ? 'var(--color-rose)' : 'var(--color-violet)'}
              label={`Test charge, ${q > 0 ? '+' : '−'}${Math.abs(q)} nC: drag it`} />
            <ChargeDot s={s} at={p} q={q} r={9} />
          </>; }}
        </Stage>} />
      <p className="hud-label" style={{ margin: '8px 0 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span>Test charge {q > 0 ? '+' : '−'}{Math.abs(q)} nC · grey: your path{contour ? ' · dashed: every spot with zero work' : ''}</span>
        <PotentialKey />
      </p>
    </SceneCard>
  );
}

import { useMemo, useState } from 'react';
import { angleBetween, equipotentialThrough, field, sceneToSI, type SceneCharge } from '../../lib/physics/potential-ch23.ts';
import { Arrow, C, CheckBar, Handle, SceneCard, Stage, useTask, type Vec } from './scene.tsx';
import { ChargeDot } from './charge-kit-ch21.tsx';
import { PotentialKey, PotentialStage, ScaleBar } from './potential-kit-ch23.tsx';

/**
 * A potential map with no field arrows on it, one marked spot, and one arrow
 * whose tip you drag round that spot. Aim it the way the field points there.
 *
 * The map is all you get: the field is the downhill direction, across the
 * contours at right angles. Near this spot it is neither "away from the
 * nearest +" nor "toward the −" (pinned in potential-ch23.test.ts), so a rule
 * of thumb misses and reading the contours works. A miss draws the contour
 * through the spot and says how far off the arrow is; a hit fills the map with
 * the field, crossing every contour square-on.
 *
 * Physics: `field` and `equipotentialThrough` from potential-ch23.ts.
 */
export interface AimDownhillProps {
  id: string;
  prompt?: string;
  charges?: SceneCharge[];
  /** The marked spot, cm. */
  probe?: [number, number];
  /** Where the arrow starts pointing, degrees from +x. */
  startDeg?: number;
  /** Largest angle from the field that counts, degrees. */
  tolerance?: number;
  explanation?: string;
}

const X: [number, number] = [-22, 20];
const Y: [number, number] = [-13, 13];
const CM = 0.01;
const R = 4; // arrow length, cm

export default function AimDownhill({
  id, prompt, charges = [{ x: -11, y: 3, q: 6 }, { x: 10, y: 5, q: 4 }, { x: 2, y: -6, q: -7 }],
  probe = [-2, 5], startDeg = 100, tolerance = 15, explanation,
}: AimDownhillProps) {
  const task = useTask(id, 'aim-downhill');
  const si = useMemo(() => sceneToSI(charges), [charges]);
  const [deg, setDeg] = useState(startDeg);
  const tip: Vec = [probe[0] + R * Math.cos((deg * Math.PI) / 180), probe[1] + R * Math.sin((deg * Math.PI) / 180)];

  const E = field(si, probe[0] * CM, probe[1] * CM);
  const off = Math.abs(angleBetween([tip[0] - probe[0], tip[1] - probe[1]], E));
  const hit = off <= tolerance;

  const contour = useMemo(() => {
    const c = equipotentialThrough(si, [probe[0] * CM, probe[1] * CM], { ds: 2e-3, steps: 260 });
    return c.points.map(([x, y]) => [x / CM, y / CM] as const);
  }, [si, probe]);

  const arrows = useMemo(() => {
    const out: { at: Vec; u: Vec }[] = [];
    for (let x = -20; x <= 18; x += 3) {
      for (let y = -11; y <= 11; y += 3) {
        if (charges.some((c) => Math.hypot(c.x - x, c.y - y) < 2.2)) continue;
        const e = field(si, x * CM, y * CM);
        const m = Math.hypot(e[0], e[1]);
        if (m > 0) out.push({ at: [x, y], u: [e[0] / m, e[1] / m] });
      }
    }
    return out;
  }, [si, charges]);

  const miss = off > 150
    ? `Your arrow is ${off.toFixed(0)}° from the field: it points uphill, toward higher V.`
    : off > 65 && off < 115
      ? `Your arrow is ${off.toFixed(0)}° from the field: it runs almost along the contour, where V does not change.`
      : `Your arrow is ${off.toFixed(0)}° from the field.`;
  const showContour = task.done || task.verdict === 'miss';

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<CheckBar verdict={task.verdict} done={task.done}
        onCheck={() => task.check(hit, { deg })} miss={miss} hit={explanation} />}>
      <PotentialStage charges={charges} stage={(capture) =>
        <Stage x={X} y={Y} height={360} equal
          label={`Potential map. Your arrow at the marked spot points ${deg.toFixed(0)} degrees from the right.`}>
          {(s) => { capture(s); return <>
            <ScaleBar s={s} at={[-20.5, -11.8]} />
            {task.done && arrows.map((a, i) => <g key={i} opacity={0.8}>
              <Arrow s={s} from={[a.at[0] - a.u[0] * 0.8, a.at[1] - a.u[1] * 0.8]} to={[a.at[0] + a.u[0] * 0.8, a.at[1] + a.u[1] * 0.8]} color={C.field} width={1.6} />
            </g>)}
            {showContour && <path d={contour.map((t, i) => `${i ? 'L' : 'M'}${s.sx(t[0]).toFixed(1)},${s.sy(t[1]).toFixed(1)}`).join('')}
              fill="none" stroke={C.ink} strokeWidth={2} strokeDasharray="6 5" opacity={0.85} />}
            {charges.map((c, i) => <ChargeDot key={i} s={s} at={[c.x, c.y]} q={c.q} label={`${c.q > 0 ? '+' : '−'}${Math.abs(c.q)} nC`} />)}
            {task.done && <Arrow s={s} from={probe} to={[probe[0] + (E[0] / Math.hypot(...E)) * R, probe[1] + (E[1] / Math.hypot(...E)) * R]}
              color={C.field} width={4} label="E" labelSide={-1} />}
            <Arrow s={s} from={probe} to={tip} color={C.ink} width={3.5} label="your guess" />
            <circle cx={s.sx(probe[0])} cy={s.sy(probe[1])} r={5} fill={C.ink} />
            <circle cx={s.sx(probe[0])} cy={s.sy(probe[1])} r={s.len(R)} fill="none" stroke={C.ghost} strokeDasharray="2 5" />
            <Handle s={s} at={tip} step={0.4} label="Arrow tip: drag it round the spot" onChange={(r) => {
              const d = (Math.atan2(r[1] - probe[1], r[0] - probe[0]) * 180) / Math.PI;
              setDeg(Math.abs(r[0] - probe[0]) + Math.abs(r[1] - probe[1]) < 1e-9 ? deg : d);
              task.touch();
            }} />
          </>; }}
        </Stage>} />
      <p className="hud-label" style={{ margin: '8px 0 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span>White: your arrow{showContour ? ' · dashed: the contour through the spot' : ''}{task.done ? ' · orchid: the field' : ''}</span>
        <PotentialKey />
      </p>
    </SceneCard>
  );
}

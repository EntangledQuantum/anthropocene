import { useMemo, useState } from 'react';
import { NANO, chargesAsRods, clusterAt, dropOutline, offsetOutline, rodField, settle } from '../../lib/physics/gauss.ts';
import type { Vec2 } from '../../lib/physics/vectors.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';
import { ChargeSpeck, DROP, DROP_CHARGES, METAL_FILL, METAL_LINE, metalPath } from './gauss-kit.tsx';

/**
 * The copper bar from the injection scene, its charge settled on the surface
 * (`settle`, gauss.ts: the same relaxation, run to the end). A probe rides a
 * path 6 cm outside the metal. The field meter is covered: find where the
 * field just outside is strongest from how the charge has arranged itself.
 *
 * Once solved, the field is drawn all the way round the path, and the
 * strongest arrows stand off the sharp edge, where the charge crowds.
 * gauss.test.ts pins that the maximum is there and that it is σ/ε₀.
 */
export interface ProbeTheDropProps {
  id?: string;
  prompt?: string;
  lambda?: number;
  explanation?: string;
}

const STANDOFF = 0.06;
const PASS = 0.85; // fraction of the strongest field that counts

export default function ProbeTheDrop({ id, prompt, lambda = 6, explanation }: ProbeTheDropProps) {
  const task = useTask(id, 'probe-the-drop');
  const metal = useMemo(() => dropOutline(DROP.cx, DROP.cy, DROP.rho), []);
  const charges = useMemo(() => settle(clusterAt(-0.3, 0.05, DROP_CHARGES, 0.08), metal, 1500), [metal]);
  const path = useMemo(() => offsetOutline(metal, STANDOFF), [metal]);
  const field = useMemo(() => {
    const rods = chargesAsRods(charges, lambda * NANO);
    return path.map((p) => rodField(rods, p[0], p[1]));
  }, [charges, path, lambda]);
  const mags = field.map((e) => Math.hypot(e[0], e[1]));
  const max = Math.max(...mags);
  const start = path.reduce((bi, p, i) => (p[0] < path[bi][0] ? i : bi), 0);
  const [i, setI] = useState(start);
  const e = mags[i];
  const hit = e >= PASS * max;

  const nearest = (p: Vec2) => {
    const k = path.reduce((bi, q, j) => (Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.hypot(path[bi][0] - p[0], path[bi][1] - p[1]) ? j : bi), 0);
    if (k !== i) return k;
    // A small nudge (a key press) that snaps back to the same point: step to
    // whichever neighbour lies in the direction of the nudge.
    const dx = p[0] - path[i][0], dy = p[1] - path[i][1];
    const n = path.length, a = path[(i + 1) % n], b = path[(i - 1 + n) % n];
    const toA = (a[0] - path[i][0]) * dx + (a[1] - path[i][1]) * dy;
    const toB = (b[0] - path[i][0]) * dx + (b[1] - path[i][1]) * dy;
    return Math.max(toA, toB) <= 0 ? i : toA > toB ? (i + 1) % n : (i - 1 + n) % n;
  };
  const PER = 0.0016; // metres of arrow per N/C

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <Meter label="Field at the probe" value={task.done ? e.toFixed(0) : 'covered'} unit={task.done ? 'N/C' : undefined} color={C.field} />
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { i, e })}
          miss={`Here the field is ${e.toFixed(0)} N/C. Somewhere along this path it reaches ${max.toFixed(0)} N/C.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-1.2, 1.1]} y={[-0.8, 0.8]} height={300} equal label="The charged copper bar, and a probe just outside it">
        {(s) => <>
          <path d={metalPath(s, path)} fill="none" stroke={C.ghost} strokeWidth={1.2} strokeDasharray="3 5" />
          <path d={metalPath(s, metal)} fill={METAL_FILL} stroke={METAL_LINE} strokeWidth={2} />
          <text x={s.sx(-0.35)} y={s.sy(-0.08)} textAnchor="middle" fontSize={13} fill={C.faint}>copper</text>
          {charges.map((p, k) => <ChargeSpeck key={k} x={s.sx(p[0])} y={s.sy(p[1])} />)}
          {task.done && path.map((p, k) => k % 3 === 0 && (
            <Arrow key={k} s={s} from={p} to={[p[0] + field[k][0] * PER, p[1] + field[k][1] * PER]} color={C.field} width={1.8} />
          ))}
          <Handle s={s} at={path[i]} step={0.04} color={C.ink} r={8} label="Probe: drag it round the outside of the bar"
            onChange={(p) => { setI(nearest(p)); task.touch(); }} />
        </>}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        The same bar, its {lambda} nC per metre settled · dotted: the probe's path, 6 cm outside the metal
      </p>
    </SceneCard>
  );
}

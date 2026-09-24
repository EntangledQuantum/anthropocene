import { useEffect, useRef, useState } from 'react';
import { driveBend, type Bend, type BendRun } from '../../lib/physics/motion-ch03.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';

/**
 * A car at the start of a left-hand bend, seen from above, and one arrow to
 * set: its acceleration, glued to the car the way steering is. Drive, and the
 * car either holds the bend or leaves the road, wide or inside.
 *
 * The inset pins the velocity arrow's tail to one point, so the whole run
 * becomes the chapter's picture: a velocity arrow whose tip is dragged by the
 * acceleration. Held, the tip swings round a circle and the arrow never grows.
 *
 * `lock` picks the one thing the handle may change: its length ('direction'
 * locked, pointing across the car), its direction ('length' locked), or
 * nothing ('fixed', a demonstration). Physics: `driveBend` in motion-ch03.ts.
 */
export interface SteerTheBendProps {
  /** Graded when set: the car must hold the bend. */
  id?: string;
  prompt?: string;
  /** m/s at the start of the bend. */
  speed: number;
  radius?: number;
  /** Starting arrow, m/s²: along the velocity, and across it (positive = left). */
  along?: number;
  across?: number;
  lock?: 'direction' | 'length' | 'fixed';
  explanation?: string;
}

const KV = 3; // px per m/s
const KA = 9; // px per m/s²
const AMAX = 22;

/** Shaft and head of an arrow, as two path strings, in view pixels. */
function arrowD(x1: number, y1: number, x2: number, y2: number): [string, string] {
  const L = Math.hypot(x2 - x1, y2 - y1);
  if (L < 2) return ['', ''];
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L, h = Math.min(11, L * 0.5);
  const bx = x2 - ux * h, by = y2 - uy * h;
  return [`M${x1},${y1}L${bx},${by}`,
    `M${x2},${y2}L${bx - uy * h * 0.55},${by + ux * h * 0.55}L${bx + uy * h * 0.55},${by - ux * h * 0.55}Z`];
}

function Arr({ d, color, width = 3, dash }: { d: [string, string]; color: string; width?: number; dash?: string }) {
  return <g><path d={d[0]} stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" fill="none" /><path d={d[1]} fill={color} /></g>;
}

export default function SteerTheBend({
  id, prompt, speed, radius = 25, along = 0, across = 4, lock = 'direction', explanation,
}: SteerTheBendProps) {
  const task = useTask(id, 'steer-the-bend');
  const bend: Bend = { radius, laneHalf: 2, exit: 12 };
  const [acc, setAcc] = useState<Vec>([along, across]);
  const [phase, setPhase] = useState<'set' | 'driving' | 'done'>('set');
  const [shown, setShown] = useState({ v: speed });
  const [result, setResult] = useState<BendRun | null>(null);
  const sRef = useRef<StageApi | null>(null);
  const car = useRef<SVGGElement>(null);
  const vInCar = useRef<SVGGElement>(null);
  const trail = useRef<SVGPolylineElement>(null);
  const hodo = useRef<SVGGElement>(null);
  const hodoV = useRef<SVGGElement>(null);
  const hodoA = useRef<SVGGElement>(null);
  const hodoTrail = useRef<SVGPolylineElement>(null);
  const raf = useRef(0);

  const R = radius;
  const hodoAt: Vec = [14, 6];

  const place = (x: number, y: number, vx: number, vy: number) => {
    const s = sRef.current;
    if (!s) return;
    const deg = (Math.atan2(vy, vx) * 180) / Math.PI;
    car.current?.setAttribute('transform', `translate(${s.sx(x)},${s.sy(y)}) rotate(${90 - deg})`);
    const v = Math.hypot(vx, vy);
    const [a, b] = arrowD(0, 0, 0, -v * KV);
    for (const g of [vInCar.current, hodoV.current]) {
      const vp = g?.querySelectorAll('path');
      if (vp) { vp[0].setAttribute('d', a); vp[1].setAttribute('d', b); }
    }
    hodo.current?.setAttribute('transform', `translate(${s.sx(hodoAt[0])},${s.sy(hodoAt[1])}) rotate(${90 - deg})`);
    hodoA.current?.setAttribute('transform', `translate(0,${-v * KV})`);
  };

  const resetView = () => {
    cancelAnimationFrame(raf.current);
    trail.current?.setAttribute('points', '');
    hodoTrail.current?.setAttribute('points', '');
    place(0, 0, 0, speed);
    setShown({ v: speed });
  };

  useEffect(() => { resetView(); return () => cancelAnimationFrame(raf.current); }, [speed]);

  const drive = () => {
    const s = sRef.current;
    if (!s || phase === 'driving') return;
    resetView();
    const run = driveBend({ speed, along: acc[0], across: acc[1], bend });
    setResult(null);
    setPhase('driving');
    const t0 = performance.now();
    let lastShown = 0;
    const pts: string[] = [], hpts: string[] = [];
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      const i = Math.min(run.path.length - 1, Math.floor(t / 0.002));
      const p = run.path[i];
      place(p.x, p.y, p.vx, p.vy);
      pts.push(`${s.sx(p.x)},${s.sy(p.y)}`);
      trail.current?.setAttribute('points', pts.join(' '));
      hpts.push(`${s.sx(hodoAt[0]) + p.vx * KV},${s.sy(hodoAt[1]) - p.vy * KV}`);
      hodoTrail.current?.setAttribute('points', hpts.join(' '));
      if (now - lastShown > 120) { lastShown = now; setShown({ v: Math.hypot(p.vx, p.vy) }); }
      if (i < run.path.length - 1) { raf.current = requestAnimationFrame(frame); return; }
      setShown({ v: run.endSpeed });
      setResult(run);
      if (id) task.check(run.outcome === 'held', { along: acc[0], across: acc[1] });
      // Leave the wreck in view for a moment, then park the car at the bend again.
      window.setTimeout(() => { place(0, 0, 0, speed); setPhase('done'); }, 900);
    };
    raf.current = requestAnimationFrame(frame);
  };

  const edit = (p: Vec) => {
    const s = sRef.current;
    if (!s || phase === 'driving') return;
    const k = s.len(1) / KA; // px per metre over px per m/s²: world metres → m/s²
    let al = p[1] * k, ac = -p[0] * k;
    if (lock === 'direction') { al = 0; ac = Math.max(0.5, Math.min(AMAX, ac)); }
    if (lock === 'length') { const m = Math.hypot(acc[0], acc[1]); const r = Math.hypot(al, ac) || 1; al *= m / r; ac *= m / r; }
    setAcc([+al.toFixed(2), +ac.toFixed(2)]);
    setResult(null); setPhase('set'); resetView(); task.touch();
  };

  const r = result;
  const circle = acc[1] > 0 ? (speed * speed) / acc[1] : Infinity;
  const say = (run: BendRun) => {
    if (run.outcome === 'held') return `Held the bend. In at ${speed.toFixed(1)} m/s, out at ${run.endSpeed.toFixed(1)} m/s.`;
    const where = `${run.outcome === 'outside' ? 'Ran wide' : 'Cut inside'} ${run.offAtDeg.toFixed(0)}° into the bend.`;
    if (acc[1] <= 0) return `Turned the wrong way and left the road.`;
    if (Math.abs(run.endSpeed - speed) > 0.2) {
      return `${where} The speed ${run.endSpeed > speed ? 'climbed' : 'fell'} from ${speed.toFixed(1)} to ${run.endSpeed.toFixed(1)} m/s.`;
    }
    return `${where} At ${speed} m/s, ${acc[1].toFixed(1)} m/s² sideways turns the car on a ${circle.toFixed(0)} m circle; the bend is ${R} m.`;
  };
  const crash = r && r.outcome !== 'held' ? r.path[r.path.length - 1] : null;
  const k2 = sRef.current ? sRef.current.len(1) / KA : 0.6;
  const tip: Vec = [-acc[1] / k2, acc[0] / k2];
  const setting = phase !== 'driving';

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
          {!id && <button type="button" className="anth-btn" onClick={drive} disabled={phase === 'driving'}>Drive</button>}
          <Meter label="Speed" value={shown.v.toFixed(1)} unit="m/s" color={C.velocity} />
          <Meter label="Along the velocity" value={acc[0].toFixed(1)} unit="m/s²" color={C.accel} />
          <Meter label="Across it" value={acc[1].toFixed(1)} unit="m/s²" color={C.accel} />
        </div>
        {id
          ? <CheckBar label="Drive" onCheck={drive} verdict={task.verdict} done={task.done} disabled={phase === 'driving'}
              miss={r ? say(r) : undefined} hit={explanation} />
          : r && <p style={{ margin: 0, color: r.outcome === 'held' ? C.ok : C.warn }}>{say(r)}</p>}
      </div>}>
      <Stage x={[-39, 27]} y={[-9, 29]} height={380} equal
        label={`A car at a left bend of radius ${R} metres, speed ${speed} metres per second. Its acceleration arrow is ${acc[0].toFixed(1)} along and ${acc[1].toFixed(1)} across.`}>
        {(s) => { sRef.current = s; const px = s.len(1); return <>
          <path d={`M${s.sx(0)},${s.sy(-9)}L${s.sx(0)},${s.sy(0)}A${s.len(R)},${s.len(R)} 0 0 0 ${s.sx(-R)},${s.sy(R)}L${s.sx(-R - 14)},${s.sy(R)}`}
            fill="none" stroke={C.grid} strokeWidth={px * 4} />
          <path d={`M${s.sx(0)},${s.sy(-9)}L${s.sx(0)},${s.sy(0)}A${s.len(R)},${s.len(R)} 0 0 0 ${s.sx(-R)},${s.sy(R)}L${s.sx(-R - 14)},${s.sy(R)}`}
            fill="none" stroke={C.faint} strokeWidth={1} strokeDasharray="6 8" />
          <circle cx={s.sx(-R)} cy={s.sy(0)} r={3} fill={C.faint} />
          <text x={s.sx(-R)} y={s.sy(0) + 18} textAnchor="middle" fontSize={12} fill={C.faint}>centre of the bend</text>
          <polyline ref={trail} fill="none" stroke={C.position} strokeWidth={2} />
          {crash && <text x={s.sx(crash.x)} y={s.sy(crash.y) + 6} textAnchor="middle" fontSize={20} fontWeight={700} fill={C.warn}>×</text>}
          <g ref={car}>
            <rect x={-px} y={-px * 2} width={px * 2} height={px * 4} rx={4} fill={C.surface} stroke={C.ink} strokeWidth={2} />
            <g ref={vInCar}><Arr d={arrowD(0, 0, 0, -speed * KV)} color={C.velocity} /></g>
            {Math.abs(acc[0]) > 0.05 && Math.abs(acc[1]) > 0.05 && <>
              <Arr d={arrowD(0, 0, 0, -acc[0] * KA)} color={C.accel} width={1.5} dash="4 4" />
              <Arr d={arrowD(0, 0, -acc[1] * KA, 0)} color={C.accel} width={1.5} dash="4 4" />
            </>}
            <Arr d={arrowD(0, 0, -acc[1] * KA, -acc[0] * KA)} color={C.accel} width={3.5} />
          </g>
          {setting && <>
            <text x={s.sx(0) + 10} y={s.sy(0) - speed * KV} fontSize={14} fontWeight={600} fill={C.velocity}>v</text>
            <text x={s.sx(tip[0]) - 4} y={s.sy(tip[1]) - 12} textAnchor="end" fontSize={14} fontWeight={600} fill={C.accel}>a</text>
          </>}
          {setting && lock !== 'fixed' && <Handle s={s} at={tip} color={C.accel} step={0.5 / k2}
            label="Tip of the acceleration arrow" onChange={edit} />}
          <text x={s.sx(hodoAt[0])} y={s.sy(hodoAt[1]) + 22} textAnchor="middle" fontSize={12} fill={C.faint}>velocity, tail pinned</text>
          <circle cx={s.sx(hodoAt[0])} cy={s.sy(hodoAt[1])} r={3} fill={C.velocity} />
          <polyline ref={hodoTrail} fill="none" stroke={C.velocity} strokeWidth={1.5} strokeDasharray="3 4" />
          <g ref={hodo}>
            <g ref={hodoV}><Arr d={arrowD(0, 0, 0, -speed * KV)} color={C.velocity} /></g>
            <g ref={hodoA}><Arr d={arrowD(0, 0, -acc[1] * KA * 0.6, -acc[0] * KA * 0.6)} color={C.accel} width={2.5} /></g>
          </g>
        </>; }}
      </Stage>
    </SceneCard>
  );
}

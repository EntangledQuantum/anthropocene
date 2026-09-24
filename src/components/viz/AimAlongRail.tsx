import { useEffect, useRef, useState } from 'react';
import { angleBetween2, mag2 } from '../../lib/physics/vectors.ts';
import { railShare } from '../../lib/physics/language-ch1.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type Vec } from './scene.tsx';

/**
 * A cart on a straight rail, seen from above, and your push of fixed size.
 * Drag the tip of the push to aim it.
 *
 * The rail keeps only the part of the push that lies along it — the thick
 * amber stripe on the rail — and the cart runs with exactly that. The rest
 * presses sideways into the rail and moves nothing. Every few seconds the
 * cart replays a two-second run from the start, so a change of aim is felt as
 * a change of how far it gets.
 *
 * Graded with `id` and `target`: aim so the rail keeps `target` newtons.
 * Physics: `railShare` in language-ch1.ts (decompose / along from vectors.ts).
 */
export interface AimAlongRailProps {
  id?: string;
  prompt?: string;
  /** Size of your push, N. */
  push?: number;
  /** Rail direction, degrees above the horizontal. */
  railDeg?: number;
  mass?: number;
  /** Starting angle between push and rail, degrees. */
  startDeg?: number;
  /** Newtons the rail should keep. */
  target?: number;
  tolerance?: number;
  explanation?: string;
}

const FS = 0.3;       // world units per newton
const MS = 0.4;       // world units per metre of travel
const PAUSE = 0.8, RUN = 2, HOLD = 0.6;

export default function AimAlongRail({
  id, prompt, push = 10, railDeg = 20, mass = 2, startDeg = 35, target, tolerance = 0.25, explanation,
}: AimAlongRailProps) {
  const graded = Boolean(id && target !== undefined);
  const task = useTask(graded ? id : undefined, 'aim-along-rail');
  const rail = (railDeg * Math.PI) / 180;
  const t: Vec = [Math.cos(rail), Math.sin(rail)];
  const [aim, setAim] = useState(rail + (startDeg * Math.PI) / 180);
  const F: Vec = [push * Math.cos(aim), push * Math.sin(aim)];
  const share = railShare(F, rail, mass);
  const accel = useRef(share.accel);
  accel.current = share.accel;
  const clock = useRef(0);
  const moving = useRef<SVGGElement>(null);
  const pxPerWorld = useRef(1);

  useEffect(() => {
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      clock.current = (clock.current + dt) % (PAUSE + RUN + HOLD);
      const tr = Math.min(Math.max(clock.current - PAUSE, 0), RUN);
      const d = 0.5 * accel.current * tr * tr * MS * pxPerWorld.current;
      moving.current?.setAttribute('transform', `translate(${d * t[0]}, ${-d * t[1]})`);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [rail]);

  const reAim = (p: Vec) => {
    if (task.done) return;
    clock.current = 0;
    moving.current?.setAttribute('transform', 'translate(0, 0)');
    setAim(Math.atan2(p[1], p[0]));
    task.touch();
  };

  const angle = (angleBetween2(F, t) * 180) / Math.PI;
  const off = target === undefined ? 0 : share.along - target;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <Meter label="Angle to the rail" value={`${angle.toFixed(0)}°`} color={C.soft} />
            <Meter label="Kept by the rail" value={share.along.toFixed(2)} unit="N" color={C.force} />
            <Meter label="Cart's acceleration" value={share.accel.toFixed(2)} unit="m/s²" color={C.accel} />
          </div>
          {graded && <CheckBar verdict={task.verdict} done={task.done}
            onCheck={() => task.check(Math.abs(off) <= tolerance, { angle })}
            miss={`At ${angle.toFixed(0)}° the rail keeps ${share.along.toFixed(1)} N of your ${push} N, ${Math.abs(off).toFixed(1)} N ${off > 0 ? 'more' : 'less'} than ${target} N.`}
            hit={explanation} />}
        </div>
      }>
      <Stage x={[-5, 8]} y={[-3.2, 4.6]} height={330} equal
        label={`Push of ${push} newtons at ${angle.toFixed(0)} degrees to the rail. The rail keeps ${share.along.toFixed(1)} newtons.`}>
        {(s) => {
          pxPerWorld.current = s.len(1);
          const railLine = (off: number) => {
            const n: Vec = [-t[1] * off, t[0] * off];
            return <line x1={s.sx(-20 * t[0] + n[0])} y1={s.sy(-20 * t[1] + n[1])} x2={s.sx(20 * t[0] + n[0])} y2={s.sy(20 * t[1] + n[1])}
              stroke={C.rule} strokeWidth={2} />;
          };
          const ties = Array.from({ length: 41 }, (_, i) => {
            const c = (i - 20) * 0.6, h = 0.34;
            const a: Vec = [c * t[0] - t[1] * h, c * t[1] + t[0] * h];
            const b: Vec = [c * t[0] + t[1] * h, c * t[1] - t[0] * h];
            return <line key={i} x1={s.sx(a[0])} y1={s.sy(a[1])} x2={s.sx(b[0])} y2={s.sy(b[1])} stroke={C.grid} strokeWidth={3} />;
          });
          const tip: Vec = [F[0] * FS, F[1] * FS];
          const par: Vec = [share.alongVec[0] * FS, share.alongVec[1] * FS];
          const cartW = s.len(1.3), cartH = s.len(0.8);
          return <>
            {ties}{railLine(0.22)}{railLine(-0.22)}
            {/* where each run starts */}
            <circle cx={s.sx(0)} cy={s.sy(0)} r={3} fill={C.faint} />
            <g ref={moving}>
              <rect x={s.sx(0) - cartW / 2} y={s.sy(0) - cartH / 2} width={cartW} height={cartH} rx={6}
                fill={C.surface} stroke={C.soft} strokeWidth={2} transform={`rotate(${-railDeg}, ${s.sx(0)}, ${s.sy(0)})`} />
              {mag2(share.alongVec) > 0.05 && <line x1={s.sx(0)} y1={s.sy(0)} x2={s.sx(par[0])} y2={s.sy(par[1])}
                stroke={C.force} strokeWidth={9} strokeOpacity={0.45} strokeLinecap="round" />}
              <line x1={s.sx(par[0])} y1={s.sy(par[1])} x2={s.sx(tip[0])} y2={s.sy(tip[1])} stroke={C.faint} strokeWidth={1.6} strokeDasharray="5 5" />
              <Arrow s={s} from={[0, 0]} to={tip} color={C.force} width={3} />
              <text x={s.sx(tip[0] * 1.3)} y={s.sy(tip[1] * 1.3) + 5} textAnchor={tip[0] > 0.8 ? 'start' : tip[0] < -0.8 ? 'end' : 'middle'}
                fontSize={14} fontWeight={600} fill={C.force} stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">your push, {push} N</text>
              <Handle s={s} at={tip} r={10} step={0.05} color={C.force} label="Aim your push: drag its tip"
                clamp={(p) => { const m = Math.hypot(p[0], p[1]) || 1; return [p[0] / m * push * FS, p[1] / m * push * FS]; }}
                onChange={reAim} />
            </g>
            <text x={s.sx(-4.6)} y={s.sy(4.1)} fontSize={13} fill={C.faint}>seen from above</text>
          </>;
        }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Thick stripe: the part the rail keeps · dashed: the part that presses into the rail
      </p>
    </SceneCard>
  );
}

import { useEffect, useRef, useState } from 'react';
import { aimStraightAt, shootAtCan, type CanShot } from '../../lib/physics/motion-ch03.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';

/**
 * A launcher, a can hanging from a magnet, and one handle: the aim. The magnet
 * lets go of the can the instant the ball leaves the barrel.
 *
 * Everyone who knows about gravity aims high. But the ball falls below its aim
 * line by exactly as much as the can falls below its magnet, because both
 * fall for the same time. Aim straight at the can and they meet. After a shot
 * the two drops are drawn side by side. Physics: `shootAtCan` in motion-ch03.ts.
 */
export interface AimAtTheFallingCanProps {
  id: string;
  prompt?: string;
  /** Launch speed, m/s. */
  speed?: number;
  /** Where the can hangs, m from the launcher. */
  can?: [number, number];
  /** Starting aim, degrees above horizontal. */
  aim?: number;
  /** Centre-to-centre distance that counts as a hit, m. */
  hitRadius?: number;
  explanation?: string;
}

const ARM = 2.4; // m from the launcher to the aim handle

export default function AimAtTheFallingCan({
  id, prompt, speed = 15, can = [12, 6], aim = 12, hitRadius = 0.4, explanation,
}: AimAtTheFallingCanProps) {
  const task = useTask(id, 'aim-at-the-falling-can');
  const [deg, setDeg] = useState(aim);
  const [shot, setShot] = useState<CanShot | null>(null);
  const [flying, setFlying] = useState(false);
  const sRef = useRef<StageApi | null>(null);
  const ball = useRef<SVGCircleElement>(null), tin = useRef<SVGRectElement>(null), trail = useRef<SVGPolylineElement>(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const place = (bx: number, by: number, cx: number, cy: number) => {
    const s = sRef.current; if (!s) return;
    ball.current?.setAttribute('cx', `${s.sx(bx)}`); ball.current?.setAttribute('cy', `${s.sy(by)}`);
    tin.current?.setAttribute('x', `${s.sx(cx - 0.15)}`); tin.current?.setAttribute('y', `${s.sy(cy + 0.25)}`);
  };

  const fire = () => {
    const s = sRef.current; if (!s || flying) return;
    const r = shootAtCan({ speed, aimDeg: deg, can });
    setShot(null); setFlying(true); task.touch();
    // Stop where they meet, or when the ball is down or long past the can.
    let iEnd = r.ball.length - 1;
    for (let i = 0; i < r.ball.length; i++) {
      const b = r.ball[i], c = r.can[Math.min(i, r.can.length - 1)];
      if (Math.hypot(b.x - c.x, b.y - c.y) <= hitRadius || b.x > can[0] + 2.5) { iEnd = i; break; }
    }
    const pts: string[] = [];
    const t0 = performance.now();
    const frame = (now: number) => {
      const i = Math.min(iEnd, Math.floor(((now - t0) / 1000) * 0.5 / 0.002)); // half speed
      const b = r.ball[i], c = r.can[Math.min(i, r.can.length - 1)];
      place(b.x, b.y, c.x, c.y);
      pts.push(`${s.sx(b.x)},${s.sy(b.y)}`);
      trail.current?.setAttribute('points', pts.join(' '));
      if (i < iEnd) { raf.current = requestAnimationFrame(frame); return; }
      setShot(r); setFlying(false);
      task.check(r.closest <= hitRadius, { aimDeg: deg, closest: r.closest });
    };
    raf.current = requestAnimationFrame(frame);
  };

  const edit = (p: Vec) => {
    if (flying) return;
    const a = Math.max(-5, Math.min(70, (Math.atan2(p[1], p[0]) * 180) / Math.PI));
    setDeg(+a.toFixed(1)); setShot(null); task.touch();
    trail.current?.setAttribute('points', '');
    place(-5, -5, can[0], can[1]);
  };

  const th = (deg * Math.PI) / 180;
  const tip: Vec = [ARM * Math.cos(th), ARM * Math.sin(th)];
  const miss = shot
    ? shot.gap === null
      ? `The ball hit the ground at ${shot.landX.toFixed(1)} m, short of the can.`
      : `Passed ${Math.abs(shot.gap).toFixed(2)} m ${shot.gap > 0 ? 'above' : 'below'} the can. By then the can had fallen ${shot.canFell!.toFixed(2)} m, and the ball ${shot.ballFell!.toFixed(2)} m below your aim line.`
    : undefined;
  const straight = aimStraightAt(can);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Aim" value={deg.toFixed(1)} unit="°" />
          <Meter label="Launch speed" value={speed.toFixed(0)} unit="m/s" color={C.velocity} />
        </div>
        <CheckBar label="Fire" onCheck={fire} verdict={task.verdict} done={task.done} disabled={flying} miss={miss} hit={explanation} />
      </div>}>
      <Stage x={[-1, can[0] + 2]} y={[-0.3, can[1] + 1.8]} height={340} equal ground
        label={`Launcher aimed ${deg.toFixed(1)} degrees up. A can hangs ${can[0]} metres away and ${can[1]} metres up.`}>
        {(s) => { sRef.current = s; const far = can[0] + 3; return <>
          {[0, 2, 4, 6, 8, 10, 12, 14].filter((m) => m <= can[0] + 2).map((m) => <text key={m} x={s.sx(m)} y={s.sy(0) + 18}
            textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{m} m</text>)}
          <line x1={s.sx(can[0])} x2={s.sx(can[0])} y1={s.sy(can[1] + 1.8)} y2={s.sy(can[1] + 0.35)} stroke={C.soft} strokeWidth={2} />
          <rect x={s.sx(can[0] - 0.3)} y={s.sy(can[1] + 0.45)} width={s.len(0.6)} height={s.len(0.12)} fill={C.field} />
          <text x={s.sx(can[0]) + 12} y={s.sy(can[1] + 0.9)} fontSize={12} fill={C.faint}>magnet</text>
          <line x1={s.sx(0)} y1={s.sy(0)} x2={s.sx(far * Math.cos(th))} y2={s.sy(far * Math.sin(th))} stroke={C.faint} strokeDasharray="4 6" />
          <line x1={s.sx(0)} y1={s.sy(0)} x2={s.sx(1.1 * Math.cos(th))} y2={s.sy(1.1 * Math.sin(th))} stroke={C.ink} strokeWidth={9} strokeLinecap="round" />
          <polyline ref={trail} fill="none" stroke={C.position} strokeWidth={2} />
          {shot && shot.canFell !== null && (() => {
            const aimY = can[0] * Math.tan(th);
            return <g fontSize={12} fill={C.accel}>
              <line x1={s.sx(can[0]) - 22} x2={s.sx(can[0]) - 22} y1={s.sy(aimY)} y2={s.sy(aimY - shot.ballFell!)} stroke={C.accel} strokeWidth={2} />
              <text x={s.sx(can[0]) - 28} y={s.sy(aimY - shot.ballFell! / 2)} textAnchor="end">ball fell {shot.ballFell!.toFixed(2)} m</text>
              <line x1={s.sx(can[0]) + 22} x2={s.sx(can[0]) + 22} y1={s.sy(can[1])} y2={s.sy(can[1] - shot.canFell!)} stroke={C.accel} strokeWidth={2} />
              <text x={s.sx(can[0]) + 28} y={s.sy(can[1] - shot.canFell! / 2)}>can fell {shot.canFell!.toFixed(2)} m</text>
            </g>;
          })()}
          <rect ref={tin} x={s.sx(can[0] - 0.15)} y={s.sy(can[1] + 0.25)} width={s.len(0.3)} height={s.len(0.5)} rx={2} fill={C.surface} stroke={C.ink} strokeWidth={2} />
          <circle ref={ball} cx={-50} cy={-50} r={s.len(0.13)} fill={C.ink} />
          {!flying && !task.done && <Handle s={s} at={tip} step={0.02} label="Aim: drag to turn the launcher"
            onChange={edit} clamp={(p) => { const m = Math.hypot(p[0], p[1]) || 1; return [p[0] / m * ARM, p[1] / m * ARM]; }} />}
          {task.done && <text x={s.sx(0.4)} y={s.sy(0.9)} fontSize={12} fill={C.faint}>aimed {straight.toFixed(1)}°, straight at it</text>}
        </>; }}
      </Stage>
    </SceneCard>
  );
}

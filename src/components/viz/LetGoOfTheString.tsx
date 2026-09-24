import { useEffect, useId, useRef, useState } from 'react';
import { afterRelease, releaseAngleFor, releaseMiss, whirl, wrapAngle } from '../../lib/physics/motion-ch03.ts';
import { centripetal } from '../../lib/physics/kinematics.ts';
import { C, CheckBar, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * A puck whirls on a string over a frictionless table, seen from above. One
 * button lets go. The only question is when, and the answer depends entirely
 * on which way you think a freed puck goes.
 *
 * While the string pulls, the magenta arrow points at the centre and the
 * velocity only turns. Let go and the pull is gone: the puck keeps the velocity
 * it had at that instant and slides off along the tangent, not along the string.
 * Physics: `whirl`, `afterRelease`, `releaseMiss` in motion-ch03.ts.
 */
export interface LetGoOfTheStringProps {
  id?: string;
  prompt?: string;
  /** String length, m. */
  r?: number;
  /** Puck speed, m/s. */
  speed?: number;
  target?: [number, number];
  /** Radius of the target, m. */
  targetRadius?: number;
  explanation?: string;
}

const DEG = 180 / Math.PI;
const KV = 0.45; // m of arrow per m/s
const KA = 0.18; // m of arrow per m/s²

export default function LetGoOfTheString({
  id, prompt, r = 1.2, speed = 2, target = [3.2, 1.4], targetRadius = 0.45, explanation,
}: LetGoOfTheStringProps) {
  const task = useTask(id, 'let-go-of-the-string');
  const [phase, setPhase] = useState<'whirl' | 'flying'>('whirl');
  const [shot, setShot] = useState<{ angle: number; miss: number; hit: boolean } | null>(null);
  const sRef = useRef<StageApi | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const puck = useRef<SVGCircleElement>(null);
  const str = useRef<SVGLineElement>(null);
  const vArr = useRef<SVGLineElement>(null);
  const aArr = useRef<SVGLineElement>(null);
  const trail = useRef<SVGPolylineElement>(null);
  const state = useRef({ angle: -2.2, last: 0, released: null as null | { angle: number; t0: number } });
  const omega = speed / r;
  const mk = `lgs${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    let raf = 0;
    state.current.last = performance.now();
    const frame = (now: number) => {
      const st = state.current, s = sRef.current;
      const dt = Math.max(0, Math.min((now - st.last) / 1000, 0.05));
      st.last = now;
      if (s) {
        let x: number, y: number, vx: number, vy: number;
        if (!st.released) {
          st.angle = wrapAngle(st.angle + omega * dt);
          const w = whirl(r, speed, st.angle);
          ({ x, y, vx, vy } = w);
          aArr.current?.setAttribute('x2', `${s.sx(x + w.ax * KA)}`);
          aArr.current?.setAttribute('y2', `${s.sy(y + w.ay * KA)}`);
        } else {
          const t = Math.max(0, (now - st.released.t0) / 1000);
          [x, y] = afterRelease(r, speed, st.released.angle, t);
          const w = whirl(r, speed, st.released.angle);
          vx = w.vx; vy = w.vy;
          const pts = trail.current?.getAttribute('points') ?? '';
          trail.current?.setAttribute('points', `${pts} ${s.sx(x)},${s.sy(y)}`);
        }
        for (const el of [str.current, aArr.current]) { el?.setAttribute('x1', `${s.sx(x)}`); el?.setAttribute('y1', `${s.sy(y)}`); }
        vArr.current?.setAttribute('x1', `${s.sx(x)}`); vArr.current?.setAttribute('y1', `${s.sy(y)}`);
        vArr.current?.setAttribute('x2', `${s.sx(x + vx * KV)}`); vArr.current?.setAttribute('y2', `${s.sy(y + vy * KV)}`);
        puck.current?.setAttribute('cx', `${s.sx(x)}`); puck.current?.setAttribute('cy', `${s.sy(y)}`);
        if (wrap.current) wrap.current.dataset.angle = (st.angle * DEG).toFixed(2);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [r, speed]);

  const letGo = () => {
    const st = state.current;
    if (st.released) return;
    const angle = st.angle;
    st.released = { angle, t0: performance.now() };
    trail.current?.setAttribute('points', '');
    setPhase('flying');
    setShot(null);
    task.touch();
    const { miss, t } = releaseMiss(r, speed, angle, target);
    const hit = miss <= targetRadius;
    // Let it slide past the target before judging, so the path is on screen.
    window.setTimeout(() => {
      setShot({ angle, miss, hit });
      if (id) task.check(hit, { angleDeg: angle * DEG, miss });
      window.setTimeout(() => { st.released = null; setPhase('whirl'); }, hit ? 400 : 1200);
    }, Math.min(2600, (t + 0.4) * 1000));
  };

  const best = releaseAngleFor(r, target);
  const err = shot ? wrapAngle(shot.angle - best) * DEG : 0;
  const miss = shot && !shot.hit
    ? `Missed by ${shot.miss.toFixed(1)} m. You let go ${Math.abs(err).toFixed(0)}° of the circle too ${err > 0 ? 'late' : 'early'}.`
    : undefined;
  const flying = phase === 'flying';

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
          {!id && <button type="button" className="anth-btn" onClick={letGo} disabled={flying}>Let go</button>}
          <Meter label="Speed" value={speed.toFixed(1)} unit="m/s" color={C.velocity} />
          <Meter label="Acceleration" value={flying ? '0.0' : centripetal(speed, r).toFixed(1)} unit="m/s²" color={C.accel} />
        </div>
        {id && <CheckBar label="Let go" onCheck={letGo} verdict={task.verdict} done={task.done} disabled={flying}
          miss={miss} hit={explanation} />}
        {!id && shot && <p style={{ margin: 0, color: shot.hit ? C.ok : C.warn }}>{shot.hit ? 'Hit.' : miss}</p>}
      </div>}>
      <div ref={wrap}>
        <Stage x={[-1.6, 4]} y={[-1.5, 2.1]} height={330} equal
          label={`A puck on a ${r} metre string whirling anticlockwise at ${speed} metres per second, with a target to the upper right.`}>
          {(s) => { sRef.current = s; return <>
            <circle cx={s.sx(0)} cy={s.sy(0)} r={s.len(r)} fill="none" stroke={C.rule} strokeDasharray="4 6" />
            <circle cx={s.sx(target[0])} cy={s.sy(target[1])} r={s.len(targetRadius)} fill="none" stroke={C.ink} strokeWidth={2} />
            <circle cx={s.sx(target[0])} cy={s.sy(target[1])} r={3} fill={C.ink} />
            <text x={s.sx(target[0])} y={s.sy(target[1] + targetRadius) - 8} textAnchor="middle" fontSize={13} fill={C.soft}>target</text>
            {shot?.hit && (() => {
              const w = whirl(r, speed, shot.angle);
              return <>
                <line x1={s.sx(0)} y1={s.sy(0)} x2={s.sx(w.x)} y2={s.sy(w.y)} stroke={C.faint} strokeDasharray="3 4" />
                <line x1={s.sx(w.x - w.vx)} y1={s.sy(w.y - w.vy)} x2={s.sx(w.x + w.vx * 2.2)} y2={s.sy(w.y + w.vy * 2.2)} stroke={C.faint} strokeDasharray="3 4" />
              </>;
            })()}
            <polyline ref={trail} fill="none" stroke={C.position} strokeWidth={2} />
            <line ref={str} x2={s.sx(0)} y2={s.sy(0)} stroke={C.soft} strokeWidth={1.5} visibility={flying ? 'hidden' : 'visible'} />
            <circle cx={s.sx(0)} cy={s.sy(0)} r={4} fill={C.soft} />
            <line ref={aArr} stroke={C.accel} strokeWidth={3.5} markerEnd={`url(#${mk}a)`} visibility={flying ? 'hidden' : 'visible'} />
            <line ref={vArr} stroke={C.velocity} strokeWidth={3} markerEnd={`url(#${mk}v)`} />
            <circle ref={puck} r={s.len(0.11)} fill={C.surface} stroke={C.ink} strokeWidth={2} />
            <defs>
              <marker id={`${mk}v`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0L10,5L0,10Z" fill={C.velocity} /></marker>
              <marker id={`${mk}a`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0L10,5L0,10Z" fill={C.accel} /></marker>
            </defs>
          </>; }}
        </Stage>
      </div>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        seen from above · cyan: velocity · magenta: acceleration, while the string pulls
      </p>
    </SceneCard>
  );
}

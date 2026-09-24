import { useEffect, useMemo, useRef, useState } from 'react';
import { CART_MASS, FANS, cartRun, deepestDip, leastLaunchSpeed, runningWork } from '../../lib/physics/work-scenes-ch06.ts';
import { areaForce } from '../../lib/physics/work-area.ts';
import { kineticEnergy } from '../../lib/physics/work.ts';
import { Arrow, Body, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi, type Vec } from './scene.tsx';

/**
 * A cart on a 4 m track: a headwind over the first 2 m, a tailwind over the
 * last 2 m, equal and opposite. Drag the cart's launch arrow to set its speed
 * and let it go. Underneath, on the same metres, the force it feels is drawn
 * and the signed area under it fills in as it rolls: that area is the work so
 * far, and it is what the cart's kinetic energy is paying.
 *
 * The total area is zero, which tempts the learner to launch gently. The cart
 * then runs out of energy in the headwind and never reaches the tailwind that
 * would have paid it back. Motion is `cartRun` (Verlet through the piecewise
 * force), not the area bookkeeping.
 *
 * Graded with `id`: find the least launch speed that gets through (within
 * `tolerance` m/s above the true least).
 */
export interface CartThroughWindProps {
  id?: string;
  prompt?: string;
  start?: number;
  tolerance?: number;
  explanation?: string;
}

const V_SCALE = 0.25;  // m of arrow per m/s
const TRACK_Y = 0.8;
const PLAY = 0.8;
const gY = (F: number) => -1.9 + (F / 40) * 1.1;   // newtons → graph height
type Phase = 'ready' | 'running' | 'done';

export default function CartThroughWind({ id, prompt, start = 2, tolerance = 0.3, explanation }: CartThroughWindProps) {
  const task = useTask(id, 'cart-through-wind');
  const [v0, setV0] = useState(start);
  const [phase, setPhase] = useState<Phase>('ready');
  const [shown, setShown] = useState({ x: 0, v: start });
  const run = useMemo(() => cartRun(FANS, v0), [v0]);
  const cart = useRef<SVGGElement>(null);
  const pos = useRef<SVGPathElement>(null);
  const neg = useRef<SVGPathElement>(null);
  const stage = useRef<StageApi | null>(null);
  const least = leastLaunchSpeed(FANS);

  const fill = (s: StageApi, x: number, sign: 1 | -1) => {
    if (x <= 0) return '';
    const n = Math.max(2, Math.ceil(x / 0.02));
    let d = `M${s.sx(0)},${s.sy(gY(0))}`;
    for (let i = 0; i <= n; i++) {
      const xi = (x * i) / n, F = areaForce(FANS, xi);
      d += `L${s.sx(xi)},${s.sy(gY(sign > 0 ? Math.max(0, F) : Math.min(0, F)))}`;
    }
    return d + `L${s.sx(x)},${s.sy(gY(0))}Z`;
  };

  useEffect(() => {
    if (phase !== 'running') return;
    let raf = 0, lastShown = 0, i = 0;
    const t0 = performance.now();
    const st = run.states, end = st[st.length - 1];
    const frame = (now: number) => {
      const t = ((now - t0) / 1000) * PLAY;
      while (i < st.length - 2 && st[i + 1].t < t) i++;
      const p = st[i], q = st[Math.min(i + 1, st.length - 1)];
      const f = q.t > p.t ? Math.min(1, Math.max(0, (t - p.t) / (q.t - p.t))) : 1;
      const x = p.x + f * (q.x - p.x), v = p.v + f * (q.v - p.v);
      if (t >= end.t) { setShown({ x: end.x, v: end.v }); setPhase('done'); return; }
      const s = stage.current;
      if (s) {
        cart.current?.setAttribute('transform', `translate(${s.len(x)},0)`);
        pos.current?.setAttribute('d', fill(s, x, 1));
        neg.current?.setAttribute('d', fill(s, x, -1));
      }
      if (now - lastShown > 120) { lastShown = now; setShown({ x, v }); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, run]);

  const launch = () => { setShown({ x: 0, v: v0 }); setPhase('running'); task.touch(); };
  const aim = (p: Vec) => {
    const v = Math.round(Math.max(0.5, Math.min(5, p[0] / V_SCALE)) * 10) / 10;
    if (v === v0) return;
    setV0(v); setPhase('ready'); setShown({ x: 0, v }); task.touch();
  };

  const finished = phase === 'done';
  const x = phase === 'ready' ? 0 : shown.x;
  const W = runningWork(FANS, x).work;
  const ok = finished && run.reached && v0 - least <= tolerance;
  const miss = !finished ? 'Launch first, then check.'
    : !run.reached ? `It carried ${run.K0.toFixed(0)} J into a headwind that takes ${deepestDip(FANS).toFixed(0)} J, and turned back at ${run.turnedAt!.toFixed(2)} m.`
    : `It got through from ${v0.toFixed(1)} m/s. A slower launch also makes it.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" style={{ padding: '10px 20px', fontSize: 15 }} onClick={launch} disabled={phase === 'running'}>
            {finished ? 'Launch again' : 'Launch'}
          </button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Speed" value={shown.v.toFixed(2)} unit="m/s" color={C.velocity} />
            <Meter label="Work so far" value={`${W >= 0 ? '+' : '−'}${Math.abs(W).toFixed(1)}`} unit="J" color={C.energy} />
            <Meter label="½mv²" value={kineticEnergy(CART_MASS, shown.v).toFixed(1)} unit="J" color={C.energy} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(ok, { v0 })} miss={miss} hit={explanation} />}
      </div>}>
      <Stage x={[-0.95, 4.55]} y={[-3.5, 2.5]} height={340} label={`Cart launched at ${v0.toFixed(1)} metres per second into a headwind then a tailwind`}>
        {(s) => { stage.current = s; return <>
          {/* the world: track, wind, cart */}
          <line x1={s.sx(-0.9)} x2={s.sx(4.5)} y1={s.sy(TRACK_Y)} y2={s.sy(TRACK_Y)} stroke={C.rule} strokeWidth={2} />
          {Array.from({ length: 15 }, (_, k) => 0.25 * (k + 1)).map((wx) => {
            const F = areaForce(FANS, wx);
            return Math.abs(F) > 2 && <Arrow key={wx} s={s} from={[wx - (F / 40) * 0.17, 2.0]} to={[wx + (F / 40) * 0.17, 2.0]} color={C.force} width={2} />;
          })}
          <text x={s.sx(1)} y={s.sy(2.3)} textAnchor="middle" fontSize={13} fill={C.soft}>headwind</text>
          <text x={s.sx(3)} y={s.sy(2.3)} textAnchor="middle" fontSize={13} fill={C.soft}>tailwind</text>
          {finished && <text x={s.sx(Math.min(run.states[run.states.length - 1].x, 3.6))} y={s.sy(0.25)} textAnchor="middle" fontSize={14} fill={run.reached ? C.velocity : C.warn}>
            {run.reached ? `through at ${run.states[run.states.length - 1].v.toFixed(2)} m/s` : `turned back at ${run.turnedAt!.toFixed(2)} m`}
          </text>}
          <g ref={cart} transform={`translate(${s.len(x)},0)`}>
            <Body s={s} at={[0, TRACK_Y + 0.14]} w={0.36} h={0.16} />
            {[-0.1, 0.1].map((w) => <circle key={w} cx={s.sx(w)} cy={s.sy(TRACK_Y + 0.04)} r={4} fill={C.surface} stroke={C.soft} strokeWidth={2} />)}
          </g>
          {phase !== 'running' && <>
            <Arrow s={s} from={[0, 1.35]} to={[v0 * V_SCALE, 1.35]} color={C.velocity} label={`${v0.toFixed(1)} m/s`} />
            <Handle s={s} at={[v0 * V_SCALE, 1.35]} onChange={aim} step={V_SCALE / 10} color={C.velocity} label="Launch speed: drag the arrow tip" />
          </>}

          {/* the companion: the force it meets, on the same metres */}
          {[-40, 0, 40].map((n) => <g key={n}>
            <line x1={s.sx(0)} x2={s.sx(4)} y1={s.sy(gY(n))} y2={s.sy(gY(n))} stroke={n ? C.grid : C.rule} strokeWidth={n ? 1 : 1.4} />
            <text x={s.sx(-0.06)} y={s.sy(gY(n)) + 4} textAnchor="end" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{n} N</text>
          </g>)}
          {[0, 1, 2, 3, 4].map((m) => <text key={m} x={s.sx(m)} y={s.sy(-3.4)} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{m} m</text>)}
          <path ref={pos} d={fill(s, x, 1)} fill={C.energy} opacity={0.5} />
          <path ref={neg} d={fill(s, x, -1)} fill={C.warn} opacity={0.45} />
          <path d={FANS.map((p, k) => `${k ? 'L' : 'M'}${s.sx(p.x)},${s.sy(gY(p.force))}`).join('')} fill="none" stroke={C.force} strokeWidth={2} />
          <text x={s.sx(-0.9)} y={s.sy(gY(40) + 0.35)} fontSize={13} fill={C.soft}>force on the cart</text>
        </>; }}
      </Stage>
    </SceneCard>
  );
}

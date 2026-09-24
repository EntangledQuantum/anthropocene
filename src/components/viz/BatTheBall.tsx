import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { afterImpulse, halfSineForce, halfSineImpulse, halfSinePeak } from '../../lib/physics/momentum.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * A pitched ball meets a bat. You shape the bat's push: drag the top of the
 * force pulse to set how hard and how long. Swing, and the ball leaves with
 * whatever velocity the area under your pulse buys it.
 *
 * The trap is the reversal. The ball arrives with momentum pointing *at* the
 * bat, so the first part of any push only cancels it; sending it back at 45
 * m/s needs m·(45 + 35), not m·45. Once solved, the scene draws every pulse
 * that would have done the same job: a curve of equal areas, tall-and-short to
 * low-and-long. Physics: `halfSineImpulse` / `afterImpulse` in momentum.ts.
 */
export interface BatTheBallProps {
  id?: string;
  prompt?: string;
  mass?: number;
  /** Arrival speed, m/s, toward the bat. */
  vIn?: number;
  /** Wanted exit speed, m/s, away from the bat. */
  target?: number;
  tolerance?: number;
  /** Starting pulse: duration (ms) and peak (kN). */
  start?: [number, number];
  explanation?: string;
}

const T_AX = 2;   // ms
const F_AX = 40;  // kN
const BALL_R = 0.037;
const D0 = 1.45;  // m, where the ball appears

export default function BatTheBall({
  id, prompt, mass = 0.145, vIn = 35, target = 45, tolerance = 1.5, start = [1.2, 8], explanation,
}: BatTheBallProps) {
  const task = useTask(id, 'bat-the-ball');
  const [pulse, setPulse] = useState<[number, number]>(start); // [T ms, peak kN]
  const [swung, setSwung] = useState<{ T: number; F: number; v: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const world = useRef<StageApi | null>(null);
  const plot = useRef<StageApi | null>(null);
  const ball = useRef<SVGGElement>(null);
  const cursor = useRef<SVGLineElement>(null);
  const fill = useRef<SVGPathElement>(null);
  const anim = useRef<{ t0: number; T: number; F: number; v: number } | null>(null);

  const [Tms, Fk] = pulse;
  const J = halfSineImpulse(Fk * 1000, Tms / 1000);
  const vOutNow = afterImpulse(mass, -vIn, J);

  /** Animation clock (not to time scale): 0.5 s approach, 0.6 s contact, 1 s exit. */
  const pose = (a: number, s: { T: number; F: number; v: number } | null) => {
    const w = world.current, p = plot.current;
    if (!w || !p) return;
    let x = D0, squash = 1, frac = 0;
    if (s) {
      if (a < 0.5) x = BALL_R + (D0 - BALL_R) * (1 - a / 0.5);
      else if (a < 1.1) {
        frac = (a - 0.5) / 0.6;
        x = BALL_R;
        squash = 1 - 0.35 * halfSineForce(1, 1, frac);
      } else {
        frac = 1;
        // Exit distance in proportion to exit speed, so the two speeds compare honestly.
        x = BALL_R + Math.max(0, s.v) / vIn * (D0 - BALL_R) * Math.min(1, (a - 1.1) / 0.5);
      }
    }
    ball.current?.setAttribute('transform', `translate(${w.sx(x)},${w.sy(0)}) scale(${squash},${1 / squash})`);
    const T = s ? s.T : Tms, F = s ? s.F : Fk;
    const end = frac * T;
    cursor.current?.setAttribute('opacity', s && frac > 0 && frac < 1 ? '1' : '0');
    cursor.current?.setAttribute('x1', String(p.sx(end)));
    cursor.current?.setAttribute('x2', String(p.sx(end)));
    let d = '';
    for (let i = 0; i <= 80; i++) {
      const t = (end * i) / 80;
      d += `${i ? 'L' : 'M'}${p.sx(t).toFixed(1)},${p.sy(halfSineForce(F, T, t)).toFixed(1)}`;
    }
    fill.current?.setAttribute('d', s && end > 0 ? `${d}L${p.sx(end)},${p.sy(0)}L${p.sx(0)},${p.sy(0)}Z` : '');
  };

  useLayoutEffect(() => { pose(0, null); }, []);

  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      const s = anim.current;
      if (s) {
        const a = (now - s.t0) / 1000;
        pose(a, s);
        if (a > 1.65) { anim.current = null; setBusy(false); setSwung({ T: s.T, F: s.F, v: s.v }); }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const swing = () => {
    anim.current = { t0: performance.now(), T: Tms, F: Fk, v: vOutNow };
    setSwung(null);
    setBusy(true);
    task.touch();
  };

  const stale = !swung || swung.T !== Tms || swung.F !== Fk;
  const pIn = mass * vIn;
  const fmt = (x: number, dp = 1) => x.toFixed(dp);
  const missLine = stale
    ? 'Swing first: this pulse has not touched the ball yet.'
    : swung!.v <= 0
      ? `The ball is still moving into the bat at ${fmt(-swung!.v)} m/s. Your push delivered ${fmt(J, 2)} N·s; the ball brought ${fmt(pIn, 2)} kg·m/s toward it.`
      : `The ball leaves at ${fmt(swung!.v)} m/s. Your push delivered ${fmt(J, 2)} N·s, and the first ${fmt(pIn, 2)} N·s of any push only stops the ball.`;
  const Jneed = mass * (target + vIn);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={swing} disabled={busy}>{busy ? 'Swinging…' : 'Swing'}</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Area under the push" value={fmt(J, 2)} unit="N·s" color={C.force} />
            <Meter label="Ball leaves at" value={swung && !stale ? fmt(swung.v) : '—'} unit="m/s" color={C.velocity} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(!stale && Math.abs(swung!.v - target) <= tolerance, { pulse, v: swung?.v })}
          miss={missLine} hit={explanation} />}
      </div>}>
      <Stage x={[-0.25, 1.6]} y={[-0.2, 0.26]} height={150} label={`A ${mass * 1000} gram ball arriving at ${vIn} metres per second toward a bat.`}>
        {(s) => { world.current = s; return <>
          <line x1={0} x2={s.W} y1={s.sy(-0.12)} y2={s.sy(-0.12)} stroke={C.rule} />
          <rect x={s.sx(-0.07)} y={s.sy(0.16)} width={s.len(0.07)} height={s.sy(-0.1) - s.sy(0.16)} rx={5} fill={C.surface} stroke={C.soft} strokeWidth={2} />
          <text x={s.sx(-0.035)} y={s.sy(-0.16)} textAnchor="middle" fontSize={12} fill={C.faint}>bat</text>
          {(!swung || stale) && !busy && <Arrow s={s} from={[D0 - 0.06, 0.1]} to={[D0 - 0.06 - vIn * 0.012, 0.1]} color={C.velocity} label={`${vIn} m/s in`} labelSide={-1} />}
          {swung && !stale && swung.v > 0 && <Arrow s={s} from={[0.08, 0.13]} to={[0.08 + swung.v * 0.012, 0.13]} color={C.velocity} label={`${fmt(swung.v)} m/s out`} />}
          <Arrow s={s} from={[0.08, 0.22]} to={[0.08 + target * 0.012, 0.22]} color={C.faint} width={1.5} dash="5 4" label={`wanted: ${target} m/s`} />
          <g ref={ball}><circle r={s.len(BALL_R)} fill={C.surface} stroke={C.ink} strokeWidth={2} /></g>
        </>; }}
      </Stage>
      <Stage x={[0, T_AX]} y={[0, F_AX]} height={230} axes={{ x: 'time in contact (ms)', y: 'bat on ball (kN)' }}
        label={`The bat's push: ${fmt(Fk)} kilonewtons at its peak, lasting ${fmt(Tms, 2)} milliseconds.`}>
        {(p) => { plot.current = p; return <>
          {task.done && (() => {
            // Every pulse with the same area: peak = π·J/(2T), plotted at its top point (T/2, peak).
            let d = '';
            for (let i = 0; i <= 60; i++) {
              const T = 0.3 + (1.7 * i) / 60, F = halfSinePeak(Jneed, T / 1000) / 1000;
              if (F <= 34) d += `${d ? 'L' : 'M'}${p.sx(T / 2).toFixed(1)},${p.sy(F).toFixed(1)}`;
            }
            return <g><path d={d} fill="none" stroke={C.ink} strokeDasharray="5 5" strokeWidth={1.5} />
              <text x={p.sx(0.36)} y={p.sy(33)} fontSize={12} fill={C.soft}>every peak on this line gives {fmt(Jneed, 1)} N·s</text></g>;
          })()}
          <path d={(() => {
            let d = '';
            for (let i = 0; i <= 80; i++) { const t = (Tms * i) / 80; d += `${i ? 'L' : 'M'}${p.sx(t).toFixed(1)},${p.sy(halfSineForce(Fk, Tms, t)).toFixed(1)}`; }
            return d;
          })()} fill="none" stroke={C.force} strokeWidth={2.5} />
          <path ref={fill} fill={C.force} opacity={0.25} />
          <line ref={cursor} y1={p.sy(0)} y2={p.sy(F_AX)} stroke={C.soft} opacity={0} />
          <Handle s={p} at={[Tms / 2, Fk]} color={C.force} step={0.1} label="Top of the bat's push: drag right for longer, up for harder"
            onChange={([x, y]) => {
              setPulse([Math.round(Math.min(T_AX, Math.max(0.2, 2 * x)) * 100) / 100, Math.round(Math.min(F_AX, Math.max(1, y)) * 10) / 10]);
              task.touch();
            }} />
        </>; }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>{mass * 1000} g ball · shaded: the area delivered so far · the contact is slowed far more than the flight</p>
    </SceneCard>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { softStop, type SoftStop } from '../../lib/physics/momentum.ts';
import { Arrow, C, CheckBar, Handle, Meter, SceneCard, Stage, useTask, type StageApi } from './scene.tsx';

/**
 * An egg is tossed into your hand. One control: how far your hand gives as
 * it catches (drag the dashed stop). Throw, and the force of the hand on the
 * egg is traced underneath as it happens.
 *
 * The trace is the lesson. A stiff hand draws a tall spike; a soft hand draws
 * a low, wide hump; and the area under either is the same m·v₀, printed. The
 * shell only cares about the height. Physics: `softStop` in momentum.ts, a
 * half-sine push whose duration is 2·give/v₀.
 *
 * With `id`, the scene grades itself: the last throw must leave the egg whole.
 */
export interface CatchTheEggProps {
  id?: string;
  prompt?: string;
  /** Throw speed, m/s. */
  v0?: number;
  /** Egg mass, kg. */
  mass?: number;
  /** The shell cracks above this force, N. */
  crack?: number;
  /** Starting give, cm. */
  give?: number;
  /** Farthest your arm can give, cm. */
  maxGive?: number;
  /** A previous catch, drawn faintly on the trace for comparison. */
  ghost?: { v0: number; give: number };
  explanation?: string;
}

const SLOW = 12;          // playback is this many times slower than life
const EGG_RX = 2.8, EGG_RY = 2.1; // cm
const START = -22;        // cm, where the egg's nose starts
const F_TOP = 100;        // N, top of the force axis

interface Result { peak: number; T: number; give: number; area: number; cracked: boolean }

export default function CatchTheEgg({
  id, prompt, v0 = 6, mass = 0.06, crack = 25, give: give0 = 1, maxGive = 35, ghost, explanation,
}: CatchTheEggProps) {
  const task = useTask(id, 'catch-the-egg');
  const [give, setGive] = useState(give0);
  const [result, setResult] = useState<Result | null>(null);
  const [flying, setFlying] = useState(false);
  /** Without a `ghost` prop, the previous throw stays on the trace for comparison. */
  const [prev, setPrev] = useState<{ v0: number; give: number } | null>(null);
  const world = useRef<StageApi | null>(null);
  const plot = useRef<StageApi | null>(null);
  const egg = useRef<SVGGElement>(null);
  const hand = useRef<SVGGElement>(null);
  const push = useRef<SVGGElement>(null);
  const pushLine = useRef<SVGLineElement>(null);
  const pushHead = useRef<SVGPathElement>(null);
  const line = useRef<SVGPathElement>(null);
  const fill = useRef<SVGPathElement>(null);
  const run = useRef<{ t0: number; stop: SoftStop; flight: number } | null>(null);

  const tAxis = Math.ceil((2 * maxGive / 100 / v0) * 1000 / 20) * 20; // ms

  /** Put the egg, hand and trace where they are at time tc after first touch. */
  const pose = (tc: number, stop: SoftStop | null) => {
    const w = world.current, p = plot.current;
    if (!w || !p) return;
    const nose = stop && tc >= 0 ? stop.position(tc) * 100 : Math.max(START, -v0 * 100 * -tc);
    egg.current?.setAttribute('transform', `translate(${w.len(nose)},0)`);
    hand.current?.setAttribute('transform', `translate(${w.len(Math.max(0, nose))},0)`);
    const touching = stop && tc >= 0 && tc <= stop.duration;
    push.current?.setAttribute('opacity', touching ? '1' : '0');
    if (touching) {
      // The hand pushes back on the egg: an amber arrow from the egg's centre,
      // pointing left, as long as the force is big (clipped at the axis top).
      const L = w.len(2 + (Math.min(F_TOP, stop.force(tc)) / F_TOP) * 16);
      const x0 = w.sx(-EGG_RX), tip = x0 - L;
      pushLine.current?.setAttribute('x2', String(tip + 10));
      pushHead.current?.setAttribute('transform', `translate(${tip},${w.sy(0)})`);
    }
    if (!stop || tc < 0) { line.current?.setAttribute('d', ''); fill.current?.setAttribute('d', ''); return; }
    const end = Math.min(tc, stop.duration), n = 120;
    let d = '';
    for (let i = 0; i <= n; i++) {
      const t = (end * i) / n;
      d += `${i ? 'L' : 'M'}${p.sx(t * 1000).toFixed(1)},${p.sy(Math.min(F_TOP, stop.force(t))).toFixed(1)}`;
    }
    line.current?.setAttribute('d', d);
    fill.current?.setAttribute('d', `${d}L${p.sx(end * 1000)},${p.sy(0)}L${p.sx(0)},${p.sy(0)}Z`);
  };

  useLayoutEffect(() => { pose(-1, null); }, []);

  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      const r = run.current;
      if (r) {
        const tc = (now - r.t0) / 1000 / SLOW - r.flight;
        pose(tc, r.stop);
        if (tc > r.stop.duration + 0.02) {
          const s = r.stop;
          run.current = null;
          setFlying(false);
          setResult({ peak: s.peak, T: s.duration, give: s.give * 100, area: s.impulse, cracked: s.peak > crack });
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [crack]);

  const throwIt = () => {
    const stop = softStop(mass, v0, give / 100);
    run.current = { t0: performance.now(), stop, flight: -START / 100 / v0 };
    if (result) setPrev({ v0, give: result.give });
    setResult(null);
    setFlying(true);
    task.touch();
  };

  const faint = ghost ?? prev;
  const ghostStop = faint ? softStop(mass, faint.v0, faint.give / 100) : null;
  const ghostPath = ghostStop ? (p: StageApi) => {
    let d = '';
    for (let i = 0; i <= 120; i++) {
      const t = (ghostStop.duration * i) / 120;
      d += `${i ? 'L' : 'M'}${p.sx(t * 1000).toFixed(1)},${p.sy(Math.min(F_TOP, ghostStop.force(t))).toFixed(1)}`;
    }
    return d;
  } : null;

  const cracked = result?.cracked ?? false;
  const fmt = (x: number, dp = 1) => x.toFixed(dp);

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={throwIt} disabled={flying}>{flying ? 'In the air…' : 'Throw'}</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Peak force" value={result ? fmt(result.peak) : '—'} unit="N" color={result && cracked ? C.warn : C.force} />
            <Meter label="Stop time" value={result ? fmt(result.T * 1000) : '—'} unit="ms" />
            <Meter label="Area under the push" value={result ? result.area.toFixed(2) : '—'} unit="N·s" color={C.force} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(!!result && !result.cracked && Math.abs(result.give - give) < 1e-9, { give, peak: result?.peak })}
          miss={!result || Math.abs(result.give - give) > 1e-9
            ? `Throw first: nothing has hit your hand at ${fmt(give)} cm of give yet.`
            : `Peak ${fmt(result.peak)} N; this shell cracks above ${crack} N. Your hand gave ${fmt(result.give)} cm in ${fmt(result.T * 1000)} ms.`}
          hit={explanation} />}
      </div>}>
      <Stage x={[-34, 40]} y={[-11, 9]} height={210} label={`An egg thrown at ${v0} metres per second into a hand that gives ${fmt(give)} centimetres.${result ? (cracked ? ' The egg cracked.' : ' The egg survived.') : ''}`}>
        {(s) => { world.current = s; return <>
          {/* ruler: how far the hand gives */}
          <line x1={s.sx(0)} x2={s.sx(maxGive)} y1={s.sy(-8.5)} y2={s.sy(-8.5)} stroke={C.rule} />
          {Array.from({ length: Math.floor(maxGive / 5) + 1 }, (_, i) => i * 5).map((c) => <g key={c}>
            <line x1={s.sx(c)} x2={s.sx(c)} y1={s.sy(-8.5)} y2={s.sy(-7.7)} stroke={C.faint} />
            <text x={s.sx(c)} y={s.sy(-10.4)} textAnchor="middle" fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{c}</text>
          </g>)}
          <text x={s.sx(-1)} y={s.sy(-10.4)} textAnchor="end" fontSize={12} fill={C.faint}>give (cm)</text>
          {/* the stop: where the hand will come to rest */}
          <line x1={s.sx(give)} x2={s.sx(give)} y1={s.sy(7.5)} y2={s.sy(-8.5)} stroke={C.soft} strokeDasharray="4 4" />
          <text x={s.sx(give) - 16} y={s.sy(7.5) + 5} textAnchor="end" fontSize={13} fill={C.soft}>hand stops here</text>
          {/* the hand, which recoils with the egg */}
          <g ref={hand}>
            <rect x={s.sx(0)} y={s.sy(6)} width={s.len(2)} height={s.sy(-6) - s.sy(6)} rx={6} fill={C.surface} stroke={C.soft} strokeWidth={2} />
            <line x1={s.sx(2)} x2={s.sx(12)} y1={s.sy(0)} y2={s.sy(-2)} stroke={C.soft} strokeWidth={7} strokeLinecap="round" />
            <text x={s.sx(8)} y={s.sy(-4.6)} textAnchor="middle" fontSize={12} fill={C.faint}>your hand</text>
          </g>
          <g ref={egg}>
            <ellipse cx={s.sx(-EGG_RX)} cy={s.sy(0)} rx={s.len(EGG_RX)} ry={s.len(EGG_RY)} fill={cracked ? 'none' : C.surface} stroke={cracked ? C.warn : C.ink} strokeWidth={2} />
            {cracked && <>
              <path d={`M${s.sx(-0.4)},${s.sy(1.6)}L${s.sx(-1.6)},${s.sy(0.5)}L${s.sx(-0.9)},${s.sy(-0.3)}L${s.sx(-2.2)},${s.sy(-1.5)}`} stroke={C.warn} strokeWidth={2} fill="none" />
              <ellipse cx={s.sx(-3.4)} cy={s.sy(-3.6)} rx={s.len(2.4)} ry={5} fill={C.warn} opacity={0.5} />
            </>}
            {!flying && !result && <Arrow s={s} from={[0.6, 0]} to={[0.6 + v0 * 1.1, 0]} color={C.velocity} label={`${v0} m/s`} />}
            <g ref={push} opacity={0}>
              <line ref={pushLine} x1={s.sx(-EGG_RX)} x2={s.sx(-EGG_RX)} y1={s.sy(0)} y2={s.sy(0)} stroke={C.force} strokeWidth={4} />
              <path ref={pushHead} d="M0,0L12,-7L12,7Z" fill={C.force} />
            </g>
          </g>
          <Handle s={s} at={[give, 7.5]} color={C.soft} step={0.5} label="How far your hand gives, in centimetres"
            onChange={(p) => { setGive(Math.round(Math.min(maxGive, Math.max(0.5, p[0])) * 2) / 2); task.touch(); }} />
        </>; }}
      </Stage>
      <Stage x={[0, tAxis]} y={[0, F_TOP]} height={200} axes={{ x: 'time since touch (ms)', y: 'force of hand on egg (N)' }}
        label="Force of the hand on the egg against time">
        {(p) => { plot.current = p; return <>
          <line x1={p.sx(0)} x2={p.sx(tAxis)} y1={p.sy(crack)} y2={p.sy(crack)} stroke={C.warn} strokeDasharray="6 5" />
          <text x={p.sx(tAxis) - 4} y={p.sy(crack) - 6} textAnchor="end" fontSize={12} fill={C.warn}>shell cracks above {crack} N</text>
          {ghostPath && <path d={ghostPath(p)} fill="none" stroke={C.faint} strokeWidth={2} strokeDasharray="3 4" />}
          {faint && <g>
            <line x1={p.sx(tAxis) - 200} x2={p.sx(tAxis) - 176} y1={p.sy(F_TOP * 0.84)} y2={p.sy(F_TOP * 0.84)} stroke={C.faint} strokeWidth={2} strokeDasharray="3 4" />
            <text x={p.sx(tAxis) - 4} y={p.sy(F_TOP * 0.84) + 4} textAnchor="end" fontSize={12} fill={C.faint}>{ghost ? 'earlier' : 'last throw'}: {faint.v0} m/s, {+faint.give.toFixed(1)} cm</text>
          </g>}
          <path ref={fill} fill={C.force} opacity={0.22} />
          <path ref={line} fill="none" stroke={C.force} strokeWidth={2.5} />
          {result && result.peak > F_TOP && <text x={p.sx(result.T * 1000) + 8} y={p.sy(F_TOP) + 14} fontSize={12} fill={C.force}>↑ off the top: {fmt(result.peak, 0)} N</text>}
        </>; }}
      </Stage>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>{mass * 1000} g egg · played {SLOW}× slower than life · shaded: the area under the push</p>
    </SceneCard>
  );
}

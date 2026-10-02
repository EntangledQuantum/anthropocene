import { useEffect, useMemo, useRef, useState } from 'react';
import { chancePerTick, decayTicks, remainingByTick, survivingFraction } from '../../lib/physics/nuclear.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { BoxFrame, LIVE, boxLayout, paintBox } from './decay-kit-ch43.tsx';

/**
 * The same sealed box, run one tick at a time. You load the coin: the chance
 * that any one live nucleus decays on a tick. Then ten ticks play, and the
 * count after each one stacks up as a bar beside the box.
 *
 * Halving in ten ticks feels like "5% a tick", which is linear thinking:
 * each tick only takes its share of whoever is still there, so 5% leaves 60%.
 * The coin that halves the box in ten ticks is 1 − 2^(−1/10) = 6.7%.
 * Graded on the coin, not on one random run. Physics: chancePerTick,
 * survivingFraction, decayTicks in src/lib/physics/nuclear.ts.
 */
export interface LoadTheCoinProps {
  id: string;
  prompt?: string;
  n?: number;
  /** Ticks in which the box should halve. */
  ticks?: number;
  /** Starting chance per tick. */
  start?: number;
  /** Slack on the chance, absolute. */
  tolerance?: number;
  seed?: number;
  explanation?: string;
}

const W = 640, H = 330;
const BOX = { x: 12, y: 12, size: 286 };
const DOT = 5.2;
const P_MAX = 0.15;
const R = { x0: 380, x1: 620, y: 62 };
const B = { x0: 380, x1: 620, y0: 128, y1: 282 };
const TICKS_PER_S = 2.2;

export default function LoadTheCoin({
  id, prompt, n = 200, ticks: TK = 10, start = 0.02, tolerance = 0.006, seed = 43, explanation,
}: LoadTheCoinProps) {
  const task = useTask(id, 'load-the-coin');
  const [p, setP] = useState(start);
  const decayAt = useMemo(() => decayTicks(n, p, TK, seed), [n, p, TK, seed]);
  const left = useMemo(() => remainingByTick(decayAt, TK), [decayAt, TK]);
  const pos = useMemo(() => boxLayout(n, BOX), [n]);
  const pTrue = chancePerTick(TK);

  const now = useRef(0);
  const running = useRef(false);
  const [shown, setShown] = useState({ tick: 0, left: n, running: false });
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const flashes = useRef<(SVGCircleElement | null)[]>([]);
  const bars = useRef<(SVGRectElement | null)[]>([]);
  const onDone = useRef<() => void>(() => {});
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const bx = (k: number) => B.x0 + ((k + 0.5) / (TK + 1)) * (B.x1 - B.x0);
  const by = (c: number) => B.y1 - (c / n) * (B.y1 - B.y0);
  const bw = ((B.x1 - B.x0) / (TK + 1)) * 0.62;
  const rx = (q: number) => R.x0 + (q / P_MAX) * (R.x1 - R.x0);

  onDone.current = () => task.check(Math.abs(p - pTrue) <= tolerance, { p, left: left[TK] });

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      if (running.current) {
        now.current += dt * TICKS_PER_S;
        if (now.current >= TK) { now.current = TK; running.current = false; onDone.current(); }
      }
      const k = Math.floor(now.current + 1e-9);
      paintBox(dots.current, flashes.current, decayAt, now.current, 0.8, DOT);
      bars.current.forEach((el, i) => {
        if (!el) return;
        const on = i <= k;
        el.setAttribute('y', String(by(on ? left[i] : 0)));
        el.setAttribute('height', String(on ? B.y1 - by(left[i]) : 0));
      });
      if (t - lastShown > 120) { lastShown = t; setShown({ tick: k, left: left[k], running: running.current }); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [decayAt, left, TK]);

  const setChance = (q: number) => {
    setP(Math.min(P_MAX, Math.max(0.005, Math.round(q * 1000) / 1000)));
    running.current = false;
    now.current = 0;
    task.touch();
  };
  const fromClient = (clientX: number) => {
    const el = svg.current;
    if (!el) return;
    const pt = new DOMPoint(clientX, 0).matrixTransform(el.getScreenCTM()!.inverse());
    setChance(((pt.x - R.x0) / (R.x1 - R.x0)) * P_MAX);
  };
  const run = () => { now.current = 0; running.current = true; };

  const expected = Math.round(n * survivingFraction(p, TK));
  const pct = (q: number) => `${(q * 100).toFixed(1)}%`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Chance per tick" value={pct(p)} color="var(--color-accent)" />
          <Meter label="Tick" value={String(shown.tick)} unit={`of ${TK}`} />
          <Meter label="Nuclei left" value={String(shown.left)} unit={`of ${n}`} color={LIVE} />
        </div>
        <CheckBar label={`Run ${TK} ticks`} verdict={task.verdict} done={task.done} onCheck={run} disabled={shown.running}
          miss={`At ${pct(p)} a tick, each nucleus survives ${TK} ticks with chance ${(survivingFraction(p, TK) * 100).toFixed(0)}%: about ${expected} of ${n} should be left (this box: ${left[TK]}), not ${n / 2}.`}
          hit={explanation} />
      </div>}>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" style={{ width: '100%', display: 'block', touchAction: 'none', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Box of ${n} nuclei, chance ${pct(p)} per tick. After tick ${shown.tick}, ${shown.left} are left.`}
        onPointerMove={(e) => { if (dragging.current) fromClient(e.clientX); }}
        onPointerUp={() => { dragging.current = false; }}>
        <BoxFrame box={BOX} label={`${n} nuclei · every tick, each live one flips the same coin`} />
        {pos.map(([x, y], i) => <g key={i}>
          <circle ref={(el) => { flashes.current[i] = el; }} cx={x} cy={y} r={DOT} fill="none" stroke={C.energy} strokeWidth={2} opacity={0} />
          <circle ref={(el) => { dots.current[i] = el; }} cx={x} cy={y} r={DOT} fill={LIVE} stroke={LIVE} strokeWidth={1.4} />
        </g>)}

        {/* the coin: chance per tick */}
        <text x={R.x0} y={R.y - 30} fontSize={13} fill={C.soft}>chance a live nucleus decays, per tick</text>
        <line x1={R.x0} x2={R.x1} y1={R.y} y2={R.y} stroke={C.rule} strokeWidth={3} strokeLinecap="round" />
        {Array.from({ length: 16 }, (_, i) => i / 100).map((q) => <g key={q}>
          <line x1={rx(q)} x2={rx(q)} y1={R.y + 4} y2={R.y + (Math.round(q * 100) % 5 === 0 ? 12 : 8)} stroke={C.faint} />
          {Math.round(q * 100) % 5 === 0 && <text x={rx(q)} y={R.y + 26} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{Math.round(q * 100)}%</text>}
        </g>)}
        <g style={{ cursor: 'ew-resize' }} tabIndex={0} role="slider" aria-label="Chance per tick"
          aria-valuemin={0.5} aria-valuemax={P_MAX * 100} aria-valuenow={+(p * 100).toFixed(1)} aria-valuetext={pct(p)}
          onPointerDown={(e) => { dragging.current = true; svg.current?.setPointerCapture(e.pointerId); }}
          onKeyDown={(e) => {
            const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            setChance(p + d * (e.shiftKey ? 0.01 : 0.001));
          }}>
          <circle cx={rx(p)} cy={R.y} r={18} fill="transparent" />
          <circle cx={rx(p)} cy={R.y} r={10} fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth={2.5} />
          <text x={rx(p)} y={R.y - 15} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--color-accent)">{pct(p)}</text>
        </g>

        {/* the count after each tick */}
        {[0, 50, 100, 150, 200].filter((c) => c <= n).map((c) => <g key={c}>
          <line x1={B.x0} x2={B.x1} y1={by(c)} y2={by(c)} stroke={C.grid} />
          <text x={B.x0 - 6} y={by(c) + 4} textAnchor="end" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{c}</text>
        </g>)}
        <line x1={B.x0} x2={B.x1} y1={by(n / 2)} y2={by(n / 2)} stroke={C.ok} strokeDasharray="5 5" />
        {Array.from({ length: TK + 1 }, (_, k) => <g key={k}>
          <rect ref={(el) => { bars.current[k] = el; }} x={bx(k) - bw / 2} y={B.y1} width={bw} height={0} fill={LIVE} opacity={0.85} rx={2} />
          <text x={bx(k)} y={B.y1 + 16} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{k}</text>
        </g>)}
        <text x={B.x0 + 2} y={B.y0 - 10} fontSize={13} fill={C.soft}>nuclei left after each tick <tspan fill={C.ok}>· dashed: half</tspan></text>
        <text x={B.x1} y={B.y1 + 34} textAnchor="end" fontSize={13} fill={C.soft}>tick</text>
      </svg>
    </SceneCard>
  );
}

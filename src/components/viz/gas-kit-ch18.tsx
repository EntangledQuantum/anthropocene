/**
 * Shared pieces for chapter 18's gas scenes (matter as particles).
 *
 *   useGasLoop     a requestAnimationFrame loop that lives in refs: the gas
 *                  advances every frame, React hears about it at ~8 Hz.
 *   Gauge          what the walls feel, smoothed over a few tens of ps:
 *                  pressure on all four walls, hits on the piston per ns,
 *                  and the momentum each hit delivered.
 *   reference      the same gauge read once, offline, at the starting state.
 *   dots / ticks   SVG path strings for the particles and for the hits the
 *                  piston has just felt.
 *   Ledger         the three meters: pressure, hits, push per hit.
 *
 * All physics is `src/lib/physics/gas.ts`. Nothing here computes a number
 * the gas did not produce.
 */
import { useEffect, useRef, useState, type MutableRefObject, type JSX } from 'react';
import {
  WALL, boxPressure, momentumSI, resetTally, runGas, stepGas, toKPa, type Gas,
} from '../../lib/physics/gas.ts';
import { C, Meter, type StageApi } from './scene.tsx';

/** Advance `gas` in real time at `psPerSecond`, in steps no longer than
 *  `maxDt(g)`. `each(g, dt)` runs after every step (a heater, a thermostat);
 *  `frame(g, ps)` after every frame (drawing); `tick()` about 8 times a
 *  second (React readouts). */
export function useGasLoop(gas: MutableRefObject<Gas>, opts: {
  psPerSecond: number;
  running: MutableRefObject<boolean>;
  maxDt: (g: Gas) => number;
  each?: (g: Gas, dt: number) => void;
  frame: (g: Gas, ps: number) => void;
  tick: () => void;
}) {
  const o = useRef(opts);
  o.current = opts;
  useEffect(() => {
    let raf = 0, last = performance.now(), shown = 0;
    const loop = (now: number) => {
      const { psPerSecond, running, maxDt, each, frame, tick } = o.current;
      const real = Math.min((now - last) / 1000, 0.05);
      last = now;
      const g = gas.current;
      let span = 0;
      if (running.current) {
        span = real * psPerSecond;
        const n = Math.max(1, Math.ceil(span / maxDt(g)));
        const dt = span / n;
        for (let k = 0; k < n; k++) { stepGas(g, dt); each?.(g, dt); }
      }
      frame(g, span);
      if (now - shown > 120) { shown = now; tick(); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [gas]);
}

/** Re-render at the loop's ~8 Hz tick. */
export function useTicker(): [number, () => void] {
  const [n, set] = useState(0);
  return [n, () => set((k) => k + 1)];
}

export interface GaugeReading {
  /** kPa */
  p: number;
  /** hits on the piston per ns */
  rate: number;
  /** momentum per piston hit, kg·m/s */
  perHit: number;
}

/** Wall tallies smoothed with a time constant `tau` (ps). Reading empties
 *  the gas's tally. */
export class Gauge {
  private pr = 0; private hr = 0; private ir = 0; private primed = false;
  constructor(private tau: number) {}
  read(g: Gas): void {
    const T = g.tallyTime;
    if (!(T > 0)) return;
    const p = boxPressure(g), h = g.hits[WALL.right] / T, i = g.impulse[WALL.right] / T;
    const a = this.primed ? 1 - Math.exp(-T / this.tau) : 1;
    this.pr += a * (p - this.pr); this.hr += a * (h - this.hr); this.ir += a * (i - this.ir);
    this.primed = true;
    resetTally(g);
  }
  prime(r: GaugeReading & { p2d: number; hr: number; ir: number }): void {
    this.pr = r.p2d; this.hr = r.hr; this.ir = r.ir; this.primed = true;
  }
  get value(): GaugeReading {
    return { p: toKPa(this.pr), rate: this.hr * 1000, perHit: this.hr > 0 ? momentumSI(this.ir / this.hr) : 0 };
  }
}

/** Read the gauge once, offline: settle for 50 ps, then tally for `span` ps. */
export function reference(make: () => Gas, span = 150, dt = 0.04) {
  const g = make();
  runGas(g, 50, dt);
  resetTally(g);
  runGas(g, span, dt);
  const T = g.tallyTime, p2d = boxPressure(g);
  const hr = g.hits[WALL.right] / T, ir = g.impulse[WALL.right] / T;
  return { p2d, hr, ir, p: toKPa(p2d), rate: hr * 1000, perHit: momentumSI(ir / hr) };
}

/** Every particle as a circle, drawn at its true size but never under 2.4 px. */
export function dots(g: Gas, s: StageApi, kind?: number): string {
  let d = '';
  for (let i = 0; i < g.n; i++) {
    if (kind !== undefined && g.kind[i] !== kind) continue;
    const r = Math.max(2.4, s.len(g.r[i])), x = s.sx(g.x[i]), y = s.sy(g.y[i]);
    d += `M${(x - r).toFixed(1)},${y.toFixed(1)}a${r.toFixed(1)},${r.toFixed(1)} 0 1,0 ${(2 * r).toFixed(1)},0a${r.toFixed(1)},${r.toFixed(1)} 0 1,0 ${(-2 * r).toFixed(1)},0`;
  }
  return d;
}

/** Short amber strokes on the piston's outer face, one per recent hit. */
export function ticks(g: Gas, s: StageApi, recent: number[][]): string {
  recent.push(g.pistonHitsY.splice(0));
  while (recent.length > 4) recent.shift();
  const x = s.sx(g.w) + 5;
  let d = '';
  for (const frame of recent) for (const y of frame) d += `M${x.toFixed(1)},${s.sy(y).toFixed(1)}h9`;
  return d;
}

/** The box: three fixed walls and a piston for the fourth. */
export function BoxWalls({ s, w, h }: { s: StageApi; w: number; h: number }) {
  return <g>
    <path d={`M${s.sx(w)},${s.sy(0)}H${s.sx(0)}V${s.sy(h)}H${s.sx(w)}`} fill="none" stroke={C.soft} strokeWidth={3} strokeLinejoin="round" />
    <rect x={s.sx(w)} y={s.sy(h + 0.2)} width={5} height={s.sy(-0.2) - s.sy(h + 0.2)} fill={C.ink} rx={1.5} />
  </g>;
}

const sci = (x: number) => (x / 1e-23).toFixed(2);

export function Ledger({ r, start }: { r: GaugeReading; start?: GaugeReading }) {
  const rel = (a: number, b?: number) => (b ? `${(a / b).toFixed(2)}× the start` : '\u00a0');
  const cell = (meter: JSX.Element, note: string) => <div>{meter}<div style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>{note}</div></div>;
  return (
    <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      {cell(<Meter label="Pressure" value={r.p.toFixed(0)} unit="kPa" />, rel(r.p, start?.p))}
      {cell(<Meter label="Hits on the piston" value={r.rate.toFixed(0)} unit="per ns" color={C.force} />, rel(r.rate, start?.rate))}
      {cell(<Meter label="Push per hit" value={sci(r.perHit)} unit="× 10⁻²³ kg·m/s" color={C.force} />, rel(r.perHit, start?.perHit))}
    </div>
  );
}

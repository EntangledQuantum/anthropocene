/**
 * Small pieces shared by chapter 25's scenes (current, resistance, emf).
 *
 *   useLoop         a requestAnimationFrame loop that lives in refs; React
 *                   re-renders at ~8 Hz, and only when the step says so.
 *   ElectronWindow  a magnified section of wire: fixed metal ions, electrons
 *                   darting about at random, and one tagged electron with a
 *                   trail. The drift is to scale against the scale bar; the
 *                   random motion is drawn slowed and shrunk, because at its
 *                   real ~1570 km/s it would be a blur.
 *   CellCutaway     a real cell opened up: an ideal pump (the emf) and a
 *                   small resistor (its internal resistance) inside one case.
 *   Dial            a round meter face with a needle and a digital reading.
 *   Lamp            a bulb whose glow is its share of a maximum power.
 *   CellLoop        the cell, a voltmeter on its terminals, an ammeter, and
 *                   two rails for whatever load a scene hangs between them.
 *
 * Colours: charge carriers are iris (position), the field orchid, energy
 * aqua. Heat (in the cell or a heater) is rose, used for nothing else here.
 */
import { useEffect, useId, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { C, type StageApi } from './scene.tsx';

export const WASTE = 'var(--color-rose)';

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ccc';
}

/** Run `step(dt)` every frame. Re-render (throttled to `hz`) when it returns true. */
export function useLoop(step: (dt: number) => boolean, hz = 8) {
  const [, setFrame] = useState(0);
  const ref = useRef(step);
  ref.current = step;
  useEffect(() => {
    let raf = 0, last = performance.now(), shown = 0, dirty = false;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (ref.current(dt)) dirty = true;
      if (dirty && now - shown > 1000 / hz) { shown = now; dirty = false; setFrame((f) => f + 1); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [hz]);
}

/* ── the magnified wire ─────────────────────────────────────────────────── */

export interface WindowApi {
  /** Put the tagged electron back at the start line and zero the clock. */
  reset: () => void;
}

interface Electron { hx: number; hy: number; ox: number; oy: number; vx: number; vy: number }

export function ElectronWindow({ drift, spanMm, scaleMm, height = 170, api, overlay, label }: {
  /** Drift speed, mm/s, positive to the right. Read every frame. */
  drift: MutableRefObject<number>;
  /** Width of the window, mm. */
  spanMm: number;
  /** Length of the scale bar, mm. */
  scaleMm: number;
  height?: number;
  api?: MutableRefObject<WindowApi | null>;
  /** Extra drawing on top, e.g. a snail. `t` is seconds since the last reset. */
  overlay?: (g: CanvasRenderingContext2D, o: { pxPerMm: number; t: number; left: number; top: number; bot: number; W: number }) => void;
  label: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ov = useRef(overlay);
  ov.current = overlay;
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const col = {
      ink: cssVar('--color-ink'), faint: cssVar('--color-ink-faint'), ghost: cssVar('--color-ink-ghost'),
      rule: cssVar('--color-rule-bright'), tag: cssVar('--color-iris'), soft: cssVar('--color-ink-soft'),
    };
    const N = 64, START = 0.12;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const kick = (e: Electron) => { const th = rnd(0, 2 * Math.PI); e.vx = 150 * Math.cos(th); e.vy = 150 * Math.sin(th); };
    const gas: Electron[] = Array.from({ length: N }, () => {
      const e = { hx: rnd(0, spanMm), hy: rnd(0.1, 0.9), ox: 0, oy: 0, vx: 0, vy: 0 };
      kick(e);
      return e;
    });
    const tag = gas[0];
    let t = 0;
    let trail: [number, number][] = [];
    const reset = () => { tag.hx = START * spanMm; tag.hy = 0.5; tag.ox = tag.oy = 0; t = 0; trail = []; };
    reset();
    if (api) api.current = { reset };

    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      t += dt;
      const dpr = window.devicePixelRatio || 1;
      const W = el.clientWidth, H = el.clientHeight;
      if (el.width !== Math.round(W * dpr)) { el.width = Math.round(W * dpr); el.height = Math.round(H * dpr); }
      const g = el.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const left = 10, right = W - 10, top = 10, bot = H - 34;
      const pxPerMm = (right - left) / spanMm;
      const v = drift.current;

      // the ions: a fixed lattice
      g.strokeStyle = col.ghost; g.lineWidth = 1;
      for (let y = top + 18; y < bot - 6; y += 30) for (let x = left + 16; x < right; x += 30) {
        g.beginPath(); g.arc(x, y, 5, 0, 2 * Math.PI); g.stroke();
        g.beginPath(); g.moveTo(x - 2.5, y); g.lineTo(x + 2.5, y); g.moveTo(x, y - 2.5); g.lineTo(x, y + 2.5); g.stroke();
      }
      g.strokeStyle = col.rule; g.lineWidth = 2;
      g.beginPath(); g.moveTo(left, top); g.lineTo(right, top); g.moveTo(left, bot); g.lineTo(right, bot); g.stroke();

      // the electrons: fast random darting about a home that drifts
      for (const e of gas) {
        e.hx += v * dt;
        if (e.hx > spanMm) { e.hx -= spanMm; if (e === tag) trail = []; }
        if (e.hx < 0) { e.hx += spanMm; if (e === tag) trail = []; }
        if (Math.random() < 6 * dt) kick(e);
        e.ox += e.vx * dt; e.oy += e.vy * dt;
        if (Math.hypot(e.ox, e.oy) > 16) { e.vx = -Math.sign(e.ox) * Math.abs(e.vx); e.vy = -Math.sign(e.oy) * Math.abs(e.vy); }
        const x = left + e.hx * pxPerMm + e.ox, y = top + 6 + e.hy * (bot - top - 12) + e.oy;
        if (e === tag) { trail.push([x, y]); if (trail.length > 360) trail.shift(); continue; }
        g.fillStyle = col.faint;
        g.beginPath(); g.arc(x, y, 3.2, 0, 2 * Math.PI); g.fill();
      }
      // the tagged electron, its start line and its trail
      const sx = left + START * spanMm * pxPerMm;
      g.setLineDash([4, 4]); g.strokeStyle = col.soft; g.lineWidth = 1;
      g.beginPath(); g.moveTo(sx, top); g.lineTo(sx, bot); g.stroke(); g.setLineDash([]);
      g.strokeStyle = col.tag; g.lineWidth = 1.5; g.globalAlpha = 0.55;
      g.beginPath(); trail.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      g.globalAlpha = 1;
      const p = trail[trail.length - 1];
      if (p) {
        g.fillStyle = col.tag; g.beginPath(); g.arc(p[0], p[1], 6, 0, 2 * Math.PI); g.fill();
        g.font = '600 13px Inter, sans-serif'; g.textAlign = 'left';
        g.fillText('tagged', Math.min(p[0] + 10, right - 50), p[1] - 10);
      }
      ov.current?.(g, { pxPerMm, t, left, top, bot, W });

      // scale bar
      const L = scaleMm * pxPerMm;
      g.strokeStyle = col.ink; g.lineWidth = 2;
      g.beginPath(); g.moveTo(right - L, H - 14); g.lineTo(right, H - 14);
      g.moveTo(right - L, H - 19); g.lineTo(right - L, H - 9); g.moveTo(right, H - 19); g.lineTo(right, H - 9); g.stroke();
      g.fillStyle = col.ink; g.font = '13px ui-monospace, monospace'; g.textAlign = 'right';
      g.fillText(`${scaleMm} mm`, right - L - 8, H - 10);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [spanMm, scaleMm]);
  return <canvas ref={canvas} aria-label={label} style={{ width: '100%', height, display: 'block' }} />;
}

/* ── the cell, opened up ────────────────────────────────────────────────── */

/** Terminals of a CellCutaway drawn at (x, y) = top-left of its case, view px. */
export const cellTerminals = (x: number, y: number) => ({ minus: [x + 26, y - 10] as const, plus: [x + 94, y - 10] as const });

export function CellCutaway({ x, y, emf, r, heat = 0 }: {
  x: number; y: number; emf: number; r: number;
  /** 0..1: how hot the internal resistor is drawn. */
  heat?: number;
}) {
  const w = 120, h = 150;
  const px = x + 26, py = y + 96;       // pump centre
  const rx0 = x + 44, rx1 = x + 94, ry = y + 34; // internal resistor
  const zig = Array.from({ length: 7 }, (_, i) => `${rx0 + ((i + 0.5) * (rx1 - rx0)) / 7},${ry + (i % 2 ? 7 : -7)}`).join(' ');
  return <g>
    <rect x={x} y={y} width={w} height={h} rx={10} fill={C.surface} stroke={C.soft} strokeWidth={1.5} strokeDasharray="6 4" />
    {/* terminals */}
    <rect x={x + 18} y={y - 14} width={16} height={14} rx={2} fill={C.surface} stroke={C.ink} strokeWidth={1.5} />
    <rect x={x + 86} y={y - 14} width={16} height={14} rx={2} fill={C.surface} stroke={C.ink} strokeWidth={1.5} />
    <text x={x + 26} y={y - 20} textAnchor="middle" fontSize={16} fill={C.ink}>−</text>
    <text x={x + 94} y={y - 20} textAnchor="middle" fontSize={16} fill={C.ink}>+</text>
    {/* wiring inside: − terminal down to the pump, pump up to r, r to + */}
    <path d={`M${px},${y} L${px},${py + 20} M${px},${py - 20} L${px},${ry} L${rx0},${ry} M${rx1},${ry} L${x + 94},${ry} L${x + 94},${y}`}
      fill="none" stroke={C.soft} strokeWidth={2} />
    {/* the pump: the emf */}
    <circle cx={px} cy={py} r={20} fill={C.surface} stroke={C.energy} strokeWidth={2.5} />
    <path d={`M${px},${py + 11} L${px},${py - 9} M${px - 6},${py - 3} L${px},${py - 11} L${px + 6},${py - 3}`} fill="none" stroke={C.energy} strokeWidth={2.5} />
    <text x={px + 28} y={py - 2} fontSize={13} fill={C.energy}>pump</text>
    <text x={px + 28} y={py + 15} fontSize={13} fill={C.energy} fontFamily="var(--font-mono)">ε = {emf} V</text>
    {/* the internal resistance */}
    {heat > 0.01 && <polyline points={`${rx0},${ry} ${zig} ${rx1},${ry}`} fill="none" stroke={WASTE} strokeWidth={10} opacity={0.18 + 0.5 * Math.min(1, heat)} strokeLinejoin="round" />}
    <polyline points={`${rx0},${ry} ${zig} ${rx1},${ry}`} fill="none" stroke={heat > 0.01 ? WASTE : C.soft} strokeWidth={2} strokeLinejoin="round" />
    <text x={(rx0 + rx1) / 2} y={ry + 24} textAnchor="middle" fontSize={13} fill={C.soft} fontFamily="var(--font-mono)">r = {r} Ω</text>
  </g>;
}

/* ── a meter face ───────────────────────────────────────────────────────── */

export function Dial({ cx, cy, value, max, unit, digits = 2, color = C.ink }: {
  cx: number; cy: number; value: number; max: number; unit: 'V' | 'A'; digits?: number; color?: string;
}) {
  const R = 34, a0 = (-150 * Math.PI) / 180, a1 = (-30 * Math.PI) / 180;
  const ang = (v: number) => a0 + (a1 - a0) * Math.max(0, Math.min(1, v / max));
  const pt = (a: number, rr: number) => [cx + rr * Math.cos(a), cy + 8 + rr * Math.sin(a)] as const;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const [nx, ny] = pt(ang(value), R - 6);
  return <g>
    <circle cx={cx} cy={cy} r={R + 6} fill={C.surface} stroke={C.soft} strokeWidth={1.5} />
    {ticks.map((v) => { const [x1, y1] = pt(ang(v), R - 2), [x2, y2] = pt(ang(v), R + 2); return <line key={v} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.faint} />; })}
    <line x1={cx} y1={cy + 8} x2={nx} y2={ny} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    <circle cx={cx} cy={cy + 8} r={3} fill={color} />
    <text x={cx} y={cy + 26} textAnchor="middle" fontSize={13} fontWeight={600} fill={color} fontFamily="var(--font-mono)">
      {value.toFixed(digits)} {unit}
    </text>
    <text x={cx} y={cy - 12} textAnchor="middle" fontSize={12} fill={C.faint}>{unit === 'V' ? 'volts' : 'amps'}</text>
  </g>;
}

/* ── a lamp ─────────────────────────────────────────────────────────────── */

export function Lamp({ cx, cy, glow, r = 18 }: { cx: number; cy: number; glow: number; r?: number }) {
  const gid = useId().replace(/:/g, '');
  const k = Math.max(0, Math.min(1, glow));
  return <g>
    <defs>
      <radialGradient id={`lamp${gid}`}>
        <stop offset="0%" stopColor="var(--color-ink)" stopOpacity={0.95 * k} />
        <stop offset="100%" stopColor="var(--color-ink)" stopOpacity={0} />
      </radialGradient>
    </defs>
    {k > 0.005 && <circle cx={cx} cy={cy} r={r * (1.6 + 1.8 * k)} fill={`url(#lamp${gid})`} />}
    <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.ink} strokeWidth={1.8} />
    <path d={`M${cx - r * 0.5},${cy + r * 0.3} l${r * 0.2},${-r * 0.55} l${r * 0.2},${r * 0.55} l${r * 0.2},${-r * 0.55} l${r * 0.2},${r * 0.55}`}
      fill="none" stroke={k > 0.02 ? C.ink : C.faint} strokeWidth={1.6} />
    <rect x={cx - r * 0.45} y={cy + r * 0.85} width={r * 0.9} height={r * 0.5} fill={C.surface} stroke={C.soft} />
  </g>;
}

/* ── one cell driving a load, with its meters ───────────────────────────── */

/** A StageApi for a raw 640-wide view in plain view px (y down), so a
 *  `Handle` can live in a hand-laid circuit drawing. */
export const viewStage = (H: number): StageApi => ({
  sx: (v) => v, sy: (v) => v, len: (d) => d, W: 640, H, x: [0, 640], y: [0, H],
});

/** Rails the load hangs between, view px. */
export const RAIL = { top: 92, bot: 284, x0: 250, x1: 610 } as const;

/**
 * The cell (opened up) at the left, a voltmeter across its terminals, an
 * ammeter in the top rail, and two rails running right. The load goes in
 * `children`, between RAIL.top and RAIL.bot, from RAIL.x0 to RAIL.x1.
 */
export function CellLoop({ cell, I, V, heat, Imax, children, label }: {
  cell: { emf: number; r: number }; I: number; V: number; heat: number;
  /** Full scale of the ammeter, A. */
  Imax: number;
  children?: ReactNode;
  label: string;
}) {
  const cx = 44, cy = 124;
  const t = cellTerminals(cx, cy);
  return (
    <svg viewBox="0 0 640 300" role="img" aria-label={label}
      style={{ width: '100%', display: 'block', touchAction: 'none', userSelect: 'none', fontFamily: 'var(--font-sans)' }}>
      {/* rails: + terminal up to the top rail through the ammeter; − terminal round the back to the bottom rail */}
      <path d={`M${t.plus[0]},${t.plus[1] - 4} L${t.plus[0]},${RAIL.top} L${190},${RAIL.top} M${250},${RAIL.top} L${RAIL.x1},${RAIL.top}
        M${t.minus[0]},${t.minus[1] - 4} L${t.minus[0]},${cy - 26} L${18},${cy - 26} L${18},${RAIL.bot} L${RAIL.x1},${RAIL.bot}`}
        fill="none" stroke={C.soft} strokeWidth={2} />
      <Dial cx={220} cy={RAIL.top - 8} value={I} max={Imax} unit="A" />
      {/* voltmeter across the terminals */}
      <path d={`M${cx + 40},${80} L${t.minus[0] + 4},${t.minus[1] - 4} M${cx + 80},${80} L${t.plus[0] - 4},${t.plus[1] - 4}`}
        fill="none" stroke={C.faint} strokeWidth={1.2} strokeDasharray="4 3" />
      <Dial cx={cx + 60} cy={44} value={V} max={cell.emf * 1.2} unit="V" />
      <CellCutaway x={cx} y={cy} emf={cell.emf} r={cell.r} heat={heat} />
      {children}
    </svg>
  );
}

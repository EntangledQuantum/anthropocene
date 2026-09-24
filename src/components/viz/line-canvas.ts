/**
 * Canvas helpers shared by the chapter 2 scenes (DragTheLift, LiftLever,
 * ScrubTheLift, BrakeToTheLine, FreezeAtTheTop, TouchTheCeiling).
 *
 * The three lift scenes share one world: a shaft on the left whose floor lines
 * run on into the trace on the right, so a height on the car and a height on
 * the graph are the same pixel row. That alignment is the whole point of
 * lesson 1, so it lives here once rather than three times.
 */
import { FLOOR_M, SHAFT_TOP, TOP_FLOOR } from '../../lib/physics/line-motion.ts';

export type Colors = Record<'ink' | 'soft' | 'faint' | 'rule' | 'grid' | 'surf' | 'v' | 'a' | 'f' | 'x' | 'warn' | 'ok', string>;

export function readColors(): Colors {
  const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#ccc';
  return {
    ink: css('--color-ink'), soft: css('--color-ink-soft'), faint: css('--color-ink-faint'),
    rule: css('--color-rule-bright'), grid: css('--color-rule'), surf: css('--color-surface'),
    v: css('--color-cyan'), a: css('--color-magenta'), f: css('--color-amber'), x: css('--color-iris'),
    warn: css('--color-warn'), ok: css('--color-ok'),
  };
}

/** Size the backing store to the element and return a context in CSS pixels. */
export function prep(el: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const W = el.clientWidth, H = el.clientHeight;
  if (el.width !== Math.round(W * dpr) || el.height !== Math.round(H * dpr)) {
    el.width = Math.round(W * dpr); el.height = Math.round(H * dpr);
  }
  const g = el.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  return { g, W, H };
}

/** Pointer position in the canvas's CSS pixels. */
export function local(el: HTMLCanvasElement, e: { clientX: number; clientY: number }) {
  const r = el.getBoundingClientRect();
  return { px: e.clientX - r.left, py: e.clientY - r.top };
}

export function arrow(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, label?: string, width = 3) {
  const L = Math.hypot(x2 - x1, y2 - y1);
  if (L < 3) return;
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L, h = Math.min(11, L * 0.5);
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = width; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2 - ux * h, y2 - uy * h); g.stroke();
  g.beginPath(); g.moveTo(x2, y2);
  g.lineTo(x2 - ux * h - uy * h * 0.55, y2 - uy * h + ux * h * 0.55);
  g.lineTo(x2 - ux * h + uy * h * 0.55, y2 - uy * h - ux * h * 0.55);
  g.closePath(); g.fill();
  if (label) text(g, label, x2 + (Math.abs(ux) > 0.5 ? ux * 8 : 10), y2 + (Math.abs(uy) > 0.5 ? uy * 14 : -8), color, Math.abs(ux) > 0.5 && ux < 0 ? 'right' : 'left', 13, 600);
}

export function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left', size = 13, weight = 400, mono = false, halo?: string) {
  g.font = `${weight} ${size}px ${mono ? 'ui-monospace, monospace' : 'Inter, sans-serif'}`;
  g.textAlign = align;
  // a halo in the surface colour keeps a label legible where it crosses a line
  if (halo) { g.strokeStyle = halo; g.lineWidth = 5; g.lineJoin = 'round'; g.strokeText(s, x, y); }
  g.fillStyle = color;
  g.fillText(s, x, y);
}

/* ── the lift shaft ───────────────────────────────────────────────────── */

export interface ShaftFrame {
  /** height in metres → canvas y */
  yOf: (h: number) => number;
  /** canvas y → height in metres, clamped to the shaft */
  hOf: (py: number) => number;
  top: number; bot: number;
  /** the shaft's horizontal extent */
  x0: number; x1: number;
}

export function shaftFrame(H: number, x0 = 34, x1 = 104, top = 22, bot = H - 34): ShaftFrame {
  const yOf = (h: number) => bot - (h / SHAFT_TOP) * (bot - top);
  const hOf = (py: number) => Math.max(0, Math.min(SHAFT_TOP, ((bot - py) / (bot - top)) * SHAFT_TOP));
  return { yOf, hOf, top, bot, x0, x1 };
}

const floorName = (f: number) => (f === 0 ? 'G' : String(f));

/** The shaft, its floors, and the car at height h. `gridTo` runs each floor
 *  line on across the canvas, into the trace, so the two share their rows. */
export function drawShaft(g: CanvasRenderingContext2D, s: ShaftFrame, h: number, c: Colors, gridTo?: number, carColor = c.x) {
  for (let f = 0; f <= TOP_FLOOR; f++) {
    const y = s.yOf(f * FLOOR_M);
    g.strokeStyle = c.grid; g.lineWidth = 1;
    g.beginPath(); g.moveTo(s.x0 - 4, y); g.lineTo(gridTo ?? s.x1 + 4, y); g.stroke();
    text(g, floorName(f), s.x0 - 10, y + 4, c.faint, 'right', 12);
  }
  g.strokeStyle = c.rule; g.lineWidth = 2;
  g.beginPath(); g.moveTo(s.x0, s.top - 6); g.lineTo(s.x0, s.bot); g.moveTo(s.x1, s.top - 6); g.lineTo(s.x1, s.bot); g.stroke();
  // the car: its floor sits exactly at height h
  const fh = s.yOf(0) - s.yOf(FLOOR_M);
  const y = s.yOf(h), cw = s.x1 - s.x0 - 12;
  g.strokeStyle = c.ink; g.lineWidth = 1; g.globalAlpha = 0.5;
  g.beginPath(); g.moveTo((s.x0 + s.x1) / 2, s.top - 6); g.lineTo((s.x0 + s.x1) / 2, y - fh * 0.85); g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = c.surf; g.strokeStyle = carColor; g.lineWidth = 2.5;
  g.beginPath(); g.rect(s.x0 + 6, y - fh * 0.85, cw, fh * 0.85); g.fill(); g.stroke();
  g.strokeStyle = carColor; g.lineWidth = 1;
  g.beginPath(); g.moveTo((s.x0 + s.x1) / 2, y - fh * 0.85 + 4); g.lineTo((s.x0 + s.x1) / 2, y - 2); g.stroke();
}

/** Height ticks in metres beside the trace, and the time axis under it. */
export function traceAxes(g: CanvasRenderingContext2D, s: ShaftFrame, left: number, right: number, t0: number, t1: number, step: number, c: Colors) {
  for (let f = 0; f <= TOP_FLOOR; f++) text(g, String(f * FLOOR_M), left - 6, s.yOf(f * FLOOR_M) + 4, c.faint, 'right', 12, 400, true);
  text(g, 'height (m)', left + 4, s.top - 8, c.faint, 'left', 13);
  const tx = (t: number) => left + ((t - t0) / (t1 - t0)) * (right - left);
  for (let t = Math.ceil(t0 / step) * step; t <= t1 + 1e-9; t += step) {
    g.strokeStyle = c.grid; g.lineWidth = 1;
    g.beginPath(); g.moveTo(tx(t), s.bot); g.lineTo(tx(t), s.bot + 5); g.stroke();
    text(g, String(Math.round(t * 10) / 10), tx(t), s.bot + 18, c.faint, 'center', 12, 400, true);
  }
  text(g, 'time (s)', right, s.bot - 7, c.faint, 'right', 13);
  g.strokeStyle = c.rule; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(left, s.top - 4); g.lineTo(left, s.bot); g.lineTo(right, s.bot); g.stroke();
  return tx;
}

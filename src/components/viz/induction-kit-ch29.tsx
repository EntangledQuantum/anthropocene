/**
 * Chapter 29's small drawing kit. The chapter's scenes animate on a canvas
 * (flux changes only matter while something moves, so the loop must run from
 * refs), with an SVG `Stage` laid over it for the one draggable handle. Both
 * layers share the Stage's world-to-view mapping, so the handle sits exactly
 * on what it drags.
 *
 *   useCanvasFrame   one requestAnimationFrame loop, dt in seconds, from refs
 *   Layered          a canvas under an SVG stage, same coordinates
 *   drawGalvanometer a centre-zero needle meter: the chapter's reusable picture
 *   drawFieldMarks   B into the page as crosses, out of it as dots (orchid)
 *   drawArrow        a force or velocity arrow in view pixels
 *   dotsAlong        charge dots flowing along a polyline, speed ∝ current
 *
 * It draws; it computes nothing. Every number comes from
 * src/lib/physics/induction.ts.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Stage, type StageApi } from './scene.tsx';

export type Px = readonly [number, number];

/** Resolve the fixed palette once, for canvas drawing. */
export function palette() {
  const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#ccc';
  return {
    ink: css('--color-ink'), soft: css('--color-ink-soft'), faint: css('--color-ink-faint'), ghost: css('--color-ink-ghost'),
    rule: css('--color-rule-bright'), grid: css('--color-rule'), surface: css('--color-surface'),
    field: css('--color-orchid'), velocity: css('--color-cyan'), force: css('--color-amber'),
    energy: css('--color-aqua'), ok: css('--color-ok'), warn: css('--color-warn'),
  };
}
export type Palette = ReturnType<typeof palette>;

/** One animation loop, from refs. `frame(dt)` gets seconds since last frame, capped. */
export function useCanvasFrame(frame: (dt: number, now: number) => void) {
  const f = useRef(frame);
  f.current = frame;
  useEffect(() => {
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      f.current(dt, now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}

/** A canvas under an SVG Stage with the same world frame. The stage api is
 *  written into `api` so the canvas loop can map world to view. */
export function Layered({ x, y, height, equal, label, canvas, api, children }: {
  x: readonly [number, number]; y: readonly [number, number]; height: number; equal?: boolean; label: string;
  canvas: React.RefObject<HTMLCanvasElement | null>;
  api: React.MutableRefObject<StageApi | null>;
  children?: (s: StageApi) => ReactNode;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <canvas ref={canvas} aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      <div style={{ position: 'relative' }}>
        <Stage x={x} y={y} height={height} equal={equal} label={label}>
          {(s) => { api.current = s; return children ? children(s) : null; }}
        </Stage>
      </div>
    </div>
  );
}

/** Size the canvas to its box and return a context drawing in Stage view units
 *  (640 wide × H tall). */
export function begin(el: HTMLCanvasElement, H: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  const w = el.clientWidth, h = el.clientHeight;
  if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
    el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
  }
  const g = el.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, el.width, el.height);
  const k = (w / 640) * dpr;
  g.setTransform(k, 0, 0, (h / H) * dpr, 0, 0);
  return g;
}

export function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, color: string,
  { size = 13, align = 'left' as CanvasTextAlign, weight = 400, mono = false, halo }: { size?: number; align?: CanvasTextAlign; weight?: number; mono?: boolean; halo?: string } = {}) {
  g.font = `${weight} ${size}px ${mono ? 'ui-monospace, monospace' : 'Inter, sans-serif'}`;
  g.textAlign = align;
  if (halo) { g.strokeStyle = halo; g.lineWidth = 4; g.lineJoin = 'round'; g.strokeText(s, x, y); }
  g.fillStyle = color;
  g.fillText(s, x, y);
}

export function drawArrow(g: CanvasRenderingContext2D, a: Px, b: Px, color: string, width = 3, dash?: number[]) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L < 3) return;
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, h = Math.min(12, L * 0.5);
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = width; g.lineCap = 'round';
  if (dash) g.setLineDash(dash);
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0] - ux * h, b[1] - uy * h); g.stroke();
  g.setLineDash([]);
  g.beginPath(); g.moveTo(b[0], b[1]);
  g.lineTo(b[0] - ux * h - uy * h * 0.55, b[1] - uy * h + ux * h * 0.55);
  g.lineTo(b[0] - ux * h + uy * h * 0.55, b[1] - uy * h - ux * h * 0.55);
  g.closePath(); g.fill();
}

/** B into the page (crosses) or out of it (dots) over a view rectangle. */
export function drawFieldMarks(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, gap: number, into: boolean, color: string, alpha = 0.55) {
  g.save(); g.globalAlpha = alpha; g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 1.5;
  const r = Math.min(5, gap * 0.18);
  for (let x = x0 + gap / 2; x < x1; x += gap) for (let y = y0 + gap / 2; y < y1; y += gap) {
    g.beginPath();
    if (into) { g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x - r, y + r); g.lineTo(x + r, y - r); g.stroke(); }
    else { g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill(); }
  }
  g.restore();
}

/** A current seen end-on: ⊙ toward you, ⊗ away. */
export function drawCurrentEnd(g: CanvasRenderingContext2D, x: number, y: number, r: number, out: boolean, color: string, surface: string) {
  g.fillStyle = surface; g.strokeStyle = color; g.lineWidth = 2;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
  if (out) { g.fillStyle = color; g.beginPath(); g.arc(x, y, Math.max(1.5, r * 0.3), 0, Math.PI * 2); g.fill(); }
  else { const k = r * 0.55; g.beginPath(); g.moveTo(x - k, y - k); g.lineTo(x + k, y + k); g.moveTo(x - k, y + k); g.lineTo(x + k, y - k); g.stroke(); }
}

/**
 * Dots along a closed or open polyline, spaced `gap` px, shifted by `phase` px.
 * Advance phase by (current × pxPerAmp × dt) each frame so dot speed ∝ current.
 */
export function dotsAlong(g: CanvasRenderingContext2D, pts: readonly Px[], phase: number, gap: number, color: string, r = 3) {
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  if (total <= 0) return;
  g.fillStyle = color;
  const start = ((phase % gap) + gap) % gap;
  for (let s = start; s < total; s += gap) {
    let acc = 0, i = 0;
    while (i < seg.length - 1 && acc + seg[i] < s) { acc += seg[i]; i++; }
    const f = seg[i] > 0 ? (s - acc) / seg[i] : 0;
    const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
}

/**
 * A centre-zero galvanometer: the needle swings right for positive current.
 * `max` is full scale, in the unit shown. `peak` (optional) leaves a thin
 * marker at the largest swing so far; `target` a green mark.
 */
export function drawGalvanometer(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, value: number, max: number, c: Palette,
  { unit = 'mA', peak, target }: { unit?: string; peak?: number; target?: number } = {}) {
  const SWING = (58 * Math.PI) / 180;
  const ang = (v: number) => -Math.PI / 2 + Math.max(-1.08, Math.min(1.08, v / max)) * SWING;
  const at = (v: number, rr: number): Px => [cx + rr * Math.cos(ang(v)), cy + rr * Math.sin(ang(v))];
  // case
  g.fillStyle = c.surface; g.strokeStyle = c.rule; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(cx - r - 14, cy + 16); g.lineTo(cx - r - 14, cy - r - 16); g.lineTo(cx + r + 14, cy - r - 16); g.lineTo(cx + r + 14, cy + 16); g.closePath(); g.fill(); g.stroke();
  // scale
  g.strokeStyle = c.faint; g.lineWidth = 1.2;
  g.beginPath(); g.arc(cx, cy, r, ang(-max), ang(max)); g.stroke();
  const step = max / 2;
  for (let v = -max; v <= max + 1e-9; v += step / 2) {
    const major = Math.abs(Math.round(v / step) * step - v) < 1e-9;
    const [x1, y1] = at(v, r), [x2, y2] = at(v, r - (major ? 9 : 5));
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    if (major) { const [tx, ty] = at(v, r + 11); text(g, `${Math.abs(v) < 1e-9 ? 0 : +v.toFixed(1)}`, tx, ty + 4, c.faint, { size: 11, align: 'center', mono: true }); }
  }
  if (target !== undefined) {
    g.strokeStyle = c.ok; g.lineWidth = 3;
    const [x1, y1] = at(target, r + 1), [x2, y2] = at(target, r - 13);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }
  if (peak !== undefined && Math.abs(peak) > max * 0.02) {
    g.strokeStyle = c.soft; g.lineWidth = 1.5; g.setLineDash([3, 3]);
    const [px, py] = at(peak, r - 4);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(px, py); g.stroke(); g.setLineDash([]);
  }
  text(g, unit, cx - r - 6, cy + 8, c.faint, { size: 11 });
  // needle
  const [nx, ny] = at(value, r - 6);
  g.strokeStyle = c.velocity; g.lineWidth = 2.5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(nx, ny); g.stroke();
  g.fillStyle = c.ink; g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.fill();
}

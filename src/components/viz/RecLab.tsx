import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Button, Panel, Readout, ReadoutRow, Toggle, useAnimationFrame, usePrefersReducedMotion } from './controls.tsx';
import { ACCENTS, formatValue } from './chart-core.ts';
import { periodicGrid, wrap } from '../../lib/numerics/pde1d.ts';
import {
  REC_C,
  REC_CFL,
  deltasOf,
  extrema,
  faceFromDelta,
  initialRecField,
  runMuscl,
  stepMuscl,
  totalVariation,
  tvdDeltaBound,
  type RecInitial,
  type RecLimiter,
} from '../../lib/numerics/reconstruction.ts';

/* ─────────────────────────────────────────────────────────────────────────
   Coupled views of one MUSCL state: cell averages as bars, the reconstructed
   slope drawn inside each cell, a three-cell zoom, and TV / TV₀.

   Unlimited Fromm sticks past the neighbours and TV grows. A limiter does
   not. One state, four representations.
   ───────────────────────────────────────────────────────────────────────── */

const READOUT_MS = 125;
const HISTORY_CAP = 240;
const BLOW = 20;

export interface RecLabProps {
  limiter?: RecLimiter;
  initial?: RecInitial;
  n?: number;
  cfl?: number;
  lockLimiter?: boolean;
  lockInitial?: boolean;
  height?: number;
  caption?: string;
  autoPlay?: boolean;
}

interface Sim {
  q: number[];
  delta: number[];
  t: number;
  nSteps: number;
  tv0: number;
  diverged: boolean;
  history: { t: number; ratio: number }[];
}

interface Stats {
  t: number;
  steps: number;
  tv: number;
  ratio: number;
  qMin: number;
  qMax: number;
  cell: number;
  delta: number;
  left: number;
  right: number;
  overshoot: boolean;
  diverged: boolean;
}

function cssColor(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function cellWithLargestDelta(delta: number[]): number {
  let best = 0;
  let bestA = -1;
  for (let i = 0; i < delta.length; i++) {
    const a = Math.abs(delta[i]!);
    if (a > bestA) {
      bestA = a;
      best = i;
    }
  }
  return best;
}

function cellOvershoots(q: number[], i: number, delta: number): boolean {
  const n = q.length;
  const bound = tvdDeltaBound(q[wrap(i - 1, n)]!, q[i]!, q[wrap(i + 1, n)]!);
  return Math.abs(delta) > bound + 1e-10;
}

export default function RecLab({
  limiter: limiter0 = 'unlimited',
  initial: initial0 = 'jump',
  n = 32,
  cfl = REC_CFL,
  lockLimiter = false,
  lockInitial = false,
  height = 200,
  caption,
  autoPlay = true,
}: RecLabProps) {
  const N = Math.max(8, Math.min(96, Math.round(n)));
  const [limiter, setLimiter] = useState<RecLimiter>(limiter0);
  const [initial, setInitial] = useState<RecInitial>(initial0);
  const [running, setRunning] = useState(autoPlay);
  const [pickedCell, setPickedCell] = useState<number | null>(null);
  const [stats, setStats] = useState<Stats>({
    t: 0, steps: 0, tv: 2, ratio: 1, qMin: 0, qMax: 1,
    cell: 0, delta: 0, left: 0, right: 0, overshoot: false, diverged: false,
  });

  const reduced = usePrefersReducedMotion();
  const { x, dx } = useMemo(() => periodicGrid(N), [N]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLCanvasElement>(null);
  const zoomRef = useRef<HTMLCanvasElement>(null);
  const tvRef = useRef<HTMLCanvasElement>(null);
  const barsSize = useRef({ w: 480, h: height });
  const zoomSize = useRef({ w: 220, h: height });
  const tvSize = useRef({ w: 700, h: 120 });

  const simRef = useRef<Sim | null>(null);
  const limiterRef = useRef(limiter);
  const initialRef = useRef(initial);
  const runningRef = useRef(running);
  const pickedRef = useRef(pickedCell);
  const lastReadout = useRef(0);

  useEffect(() => { limiterRef.current = limiter; }, [limiter]);
  useEffect(() => { initialRef.current = initial; }, [initial]);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { pickedRef.current = pickedCell; }, [pickedCell]);

  const seed = useCallback(() => {
    const q0 = initialRecField(initialRef.current, N);
    const delta = deltasOf(q0, limiterRef.current);
    const tv0 = totalVariation(q0);
    simRef.current = {
      q: q0.slice(), delta, t: 0, nSteps: 0, tv0, diverged: false,
      history: [{ t: 0, ratio: 1 }],
    };
    lastReadout.current = 0;
    const cell = cellWithLargestDelta(delta);
    const faces = faceFromDelta(q0[cell]!, delta[cell]!);
    setStats({
      t: 0, steps: 0, tv: tv0, ratio: 1,
      qMin: extrema(q0).min, qMax: extrema(q0).max,
      cell, delta: delta[cell]!, left: faces.left, right: faces.right,
      overshoot: cellOvershoots(q0, cell, delta[cell]!),
      diverged: false,
    });
  }, [N]);

  useEffect(() => { seed(); }, [seed, limiter, initial]);

  const yWindow = (q: number[], diverged: boolean) => {
    const ext = extrema(q);
    const pad = 0.18;
    if (initialRef.current === 'sine' && !diverged && ext.max < 1.25 && ext.min > -1.25) {
      return { yMin: -1.25, yMax: 1.25 };
    }
    if (!diverged && ext.max < 1.4 && ext.min > -0.35) {
      return { yMin: -0.22, yMax: 1.38 };
    }
    const span = Math.max(1.2, ext.max - ext.min);
    return { yMin: ext.min - pad * span, yMax: ext.max + pad * span };
  };

  const paintBars = useCallback(() => {
    const canvas = barsRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = barsSize.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const abyss = cssColor(canvas, '--color-abyss', '#0c0a15');
    const rule = cssColor(canvas, '--color-rule', '#2a2340');
    const ink = ACCENTS.faint;
    const cyan = ACCENTS.cyan;
    const magenta = ACCENTS.magenta;
    const aqua = ACCENTS.aqua;

    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, w, h);

    const padL = 40, padR = 10, padT = 16, padB = 28;
    const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
    const plotW = Math.max(10, x1 - x0), plotH = Math.max(10, y1 - y0);
    const { yMin, yMax } = yWindow(sim.q, sim.diverged);
    const X = (xi: number) => x0 + xi * plotW;
    const Y = (u: number) => y1 - ((u - yMin) / (yMax - yMin)) * plotH;

    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW, plotH);

    ctx.beginPath();
    ctx.moveTo(x0, Y(0));
    ctx.lineTo(x1, Y(0));
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.45;
    ctx.stroke();
    ctx.globalAlpha = 1;

    const cellW = plotW / N;
    const focus = pickedRef.current ?? cellWithLargestDelta(sim.delta);

    for (let i = 0; i < N; i++) {
      const q = sim.q[i]!;
      const px = X(x[i]!);
      const py0 = Y(0);
      const py1 = Y(Math.max(yMin, Math.min(yMax, q)));
      ctx.fillStyle = cyan;
      ctx.globalAlpha = i === focus ? 0.38 : 0.16;
      ctx.fillRect(px + 0.5, Math.min(py0, py1), Math.max(1, cellW - 1), Math.max(1, Math.abs(py1 - py0)));
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const px = X(i / N);
      ctx.moveTo(px, y0);
      ctx.lineTo(px, y1);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    for (let i = 0; i < N; i++) {
      const d = sim.delta[i]!;
      const { left, right } = faceFromDelta(sim.q[i]!, d);
      const ringing = cellOvershoots(sim.q, i, d);
      ctx.strokeStyle = ringing ? magenta : aqua;
      ctx.lineWidth = i === focus ? 2.2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(X(i / N), Y(left));
      ctx.lineTo(X((i + 1) / N), Y(right));
      ctx.stroke();
    }

    const faceX = X((focus + 1) / N);
    ctx.strokeStyle = aqua;
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(faceX, y0);
    ctx.lineTo(faceX, y1);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = ink;
    ctx.font = '12px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const tick of [0, 0.25, 0.5, 0.75, 1]) ctx.fillText(String(tick), X(tick), y1 + 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yTicks = initialRef.current === 'sine' ? [-1, 0, 1] : [0, 0.5, 1];
    for (const tick of yTicks) {
      if (tick < yMin || tick > yMax) continue;
      ctx.fillText(String(tick), x0 - 6, Y(tick));
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('x', (x0 + x1) / 2, h - 2);
    ctx.save();
    ctx.translate(12, (y0 + y1) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Q', 0, 0);
    ctx.restore();
  }, [x, N, height]);

  const paintZoom = useCallback(() => {
    const canvas = zoomRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = zoomSize.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const abyss = cssColor(canvas, '--color-abyss', '#0c0a15');
    const rule = cssColor(canvas, '--color-rule', '#2a2340');
    const ink = ACCENTS.faint;
    const cyan = ACCENTS.cyan;
    const magenta = ACCENTS.magenta;
    const aqua = ACCENTS.aqua;

    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, w, h);

    const padL = 36, padR = 12, padT = 28, padB = 36;
    const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
    const plotW = Math.max(10, x1 - x0), plotH = Math.max(10, y1 - y0);

    ctx.strokeStyle = rule;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW, plotH);

    const focus = pickedRef.current ?? cellWithLargestDelta(sim.delta);
    const cells = [wrap(focus - 1, N), wrap(focus, N), wrap(focus + 1, N)];
    const { yMin, yMax } = yWindow(sim.q, sim.diverged);
    const Y = (u: number) => y1 - ((u - yMin) / (yMax - yMin)) * plotH;
    const colW = plotW / 3;
    const ringing = cellOvershoots(sim.q, focus, sim.delta[focus]!);

    ctx.beginPath();
    ctx.moveTo(x0, Y(0));
    ctx.lineTo(x1, Y(0));
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.globalAlpha = 1;

    for (let k = 0; k < 3; k++) {
      const i = cells[k]!;
      const q = sim.q[i]!;
      const d = sim.delta[i]!;
      const { left, right } = faceFromDelta(q, d);
      const px = x0 + k * colW;
      const py0 = Y(0);
      const py1 = Y(Math.max(yMin, Math.min(yMax, q)));
      ctx.fillStyle = cyan;
      ctx.globalAlpha = k === 1 ? 0.35 : 0.16;
      ctx.fillRect(px + 4, Math.min(py0, py1), colW - 8, Math.max(2, Math.abs(py1 - py0)));
      ctx.globalAlpha = 1;

      const ring = cellOvershoots(sim.q, i, d);
      ctx.strokeStyle = ring ? magenta : aqua;
      ctx.lineWidth = k === 1 ? 2.4 : 1.6;
      ctx.beginPath();
      ctx.moveTo(px + 4, Y(left));
      ctx.lineTo(px + colW - 4, Y(right));
      ctx.stroke();

      ctx.fillStyle = ring ? magenta : aqua;
      ctx.beginPath();
      ctx.arc(px + 4, Y(left), 2.4, 0, Math.PI * 2);
      ctx.arc(px + colW - 4, Y(right), 2.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + colW, y0);
      ctx.lineTo(px + colW, y1);
      ctx.stroke();
    }

    ctx.fillStyle = ringing ? magenta : aqua;
    ctx.font = '600 12px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(ringing ? 'slope past the neighbour' : 'slope stays inside', (x0 + x1) / 2, y0 - 6);

    ctx.fillStyle = ink;
    ctx.font = '11px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(`δ = ${formatValue(sim.delta[focus]!, 3)}`, (x0 + x1) / 2, y1 + 6);
    ctx.font = '11px var(--font-mono), ui-monospace, monospace';
    ctx.fillStyle = ringing ? magenta : cyan;
    const faces = faceFromDelta(sim.q[focus]!, sim.delta[focus]!);
    ctx.fillText(`${formatValue(faces.left, 3)} → ${formatValue(faces.right, 3)}`, (x0 + x1) / 2, y1 + 20);
  }, [N, height]);

  const paintTv = useCallback(() => {
    const canvas = tvRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = tvSize.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const abyss = cssColor(canvas, '--color-abyss', '#0c0a15');
    const rule = cssColor(canvas, '--color-rule', '#2a2340');
    const ink = ACCENTS.faint;
    const cyan = ACCENTS.cyan;
    const magenta = ACCENTS.magenta;

    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, w, h);

    const padL = 44, padR = 12, padT = 10, padB = 24;
    const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
    const plotW = Math.max(10, x1 - x0), plotH = Math.max(10, y1 - y0);

    const hist = sim.history;
    const tMax = Math.max(0.5, hist[hist.length - 1]?.t ?? 0.5);
    let rMin = 0.92, rMax = 1.38;
    for (const p of hist) {
      if (!Number.isFinite(p.ratio)) continue;
      if (p.ratio < rMin) rMin = p.ratio - 0.04;
      if (p.ratio > rMax) rMax = p.ratio + 0.04;
    }
    const X = (t: number) => x0 + (t / tMax) * plotW;
    const Y = (r: number) => y1 - ((r - rMin) / (rMax - rMin)) * plotH;

    ctx.strokeStyle = rule;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW, plotH);

    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x0, Y(1));
    ctx.lineTo(x1, Y(1));
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.55;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    const growing = hist.some((p) => Number.isFinite(p.ratio) && p.ratio > 1.02);
    ctx.beginPath();
    let started = false;
    for (const p of hist) {
      if (!Number.isFinite(p.ratio)) continue;
      const px = X(p.t), py = Y(p.ratio);
      if (!started) { ctx.moveTo(px, py); started = true; }
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = growing ? magenta : cyan;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = ink;
    ctx.font = '11px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const tick of [0, 0.25, 0.5, 0.75, 1].filter((v) => v <= tMax + 1e-9)) {
      ctx.fillText(tick === 0 ? '0' : String(tick), X(tick), y1 + 6);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const tick of [rMin, 1, rMax]) {
      ctx.fillText(tick === 1 ? '1' : formatValue(tick, 2), x0 - 6, Y(tick));
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('t', (x0 + x1) / 2, h - 1);
    ctx.save();
    ctx.translate(12, (y0 + y1) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('TV / TV₀', 0, 0);
    ctx.restore();
  }, []);

  const paintBarsRef = useRef(paintBars);
  const paintZoomRef = useRef(paintZoom);
  const paintTvRef = useRef(paintTv);
  useEffect(() => { paintBarsRef.current = paintBars; }, [paintBars]);
  useEffect(() => { paintZoomRef.current = paintZoom; }, [paintZoom]);
  useEffect(() => { paintTvRef.current = paintTv; }, [paintTv]);

  const paint = useCallback(() => {
    paintBarsRef.current();
    paintZoomRef.current();
    paintTvRef.current();
  }, []);

  useEffect(() => {
    const wrapEl = wrapRef.current;
    if (!wrapEl) return;
    const bars = wrapEl.querySelector('[data-pane="bars"]') as HTMLElement | null;
    const zoom = wrapEl.querySelector('[data-pane="zoom"]') as HTMLElement | null;
    const tv = wrapEl.querySelector('[data-pane="tv"]') as HTMLElement | null;
    const ro = new ResizeObserver(() => {
      if (bars) barsSize.current = { w: bars.clientWidth || 480, h: bars.clientHeight || height };
      if (zoom) zoomSize.current = { w: zoom.clientWidth || 220, h: zoom.clientHeight || height };
      if (tv) tvSize.current = { w: tv.clientWidth || 700, h: tv.clientHeight || 120 };
      paint();
    });
    if (bars) ro.observe(bars);
    if (zoom) ro.observe(zoom);
    if (tv) ro.observe(tv);
    paint();
    return () => ro.disconnect();
  }, [height, paint]);

  const pushReadout = (sim: Sim) => {
    const now = performance.now();
    if (now - lastReadout.current < READOUT_MS && !sim.diverged) return;
    lastReadout.current = now;
    const cell = pickedRef.current ?? cellWithLargestDelta(sim.delta);
    const tv = totalVariation(sim.q);
    const ext = extrema(sim.q);
    const faces = faceFromDelta(sim.q[cell]!, sim.delta[cell]!);
    setStats({
      t: sim.t,
      steps: sim.nSteps,
      tv,
      ratio: sim.tv0 === 0 ? 1 : tv / sim.tv0,
      qMin: ext.min,
      qMax: ext.max,
      cell,
      delta: sim.delta[cell]!,
      left: faces.left,
      right: faces.right,
      overshoot: cellOvershoots(sim.q, cell, sim.delta[cell]!),
      diverged: sim.diverged,
    });
  };

  const stepSim = useCallback((wallDt: number) => {
    const sim = simRef.current;
    if (!sim || sim.diverged) return;
    const dt = (cfl * dx) / Math.max(Math.abs(REC_C), 1e-15);
    const target = 0.22 * wallDt;
    const steps = Math.max(1, Math.min(48, Math.ceil(target / Math.max(dt, 1e-9))));
    for (let s = 0; s < steps; s++) {
      const { next, delta } = stepMuscl(sim.q, limiterRef.current, cfl);
      const ext = extrema(next);
      if (!Number.isFinite(ext.max) || Math.abs(ext.max) > BLOW) {
        sim.diverged = true;
        sim.delta = delta;
        break;
      }
      sim.q = next;
      sim.delta = delta;
      sim.t += dt;
      sim.nSteps += 1;
      const ratio = totalVariation(sim.q) / sim.tv0;
      sim.history.push({ t: sim.t, ratio });
      if (sim.history.length > HISTORY_CAP) {
        sim.history = sim.history.filter((_, i) => i % 2 === 0 || i === sim.history.length - 1);
      }
    }
    paint();
    pushReadout(sim);
    if (sim.diverged) {
      runningRef.current = false;
      setRunning(false);
    }
  }, [dx, cfl, paint]);

  useAnimationFrame(running && !reduced, stepSim);

  useEffect(() => {
    if (!reduced) return;
    const snap = runMuscl({
      limiter, initial, n: N, cfl, tEnd: 0.5,
    });
    const delta = deltasOf(snap.q, limiter);
    simRef.current = {
      q: snap.q, delta, t: snap.t, nSteps: snap.nSteps, tv0: snap.tv0,
      diverged: snap.diverged,
      history: snap.history.map((s) => ({ t: s.t, ratio: s.ratio })),
    };
    setRunning(false);
    const cell = cellWithLargestDelta(delta);
    const faces = faceFromDelta(snap.q[cell]!, delta[cell]!);
    setStats({
      t: snap.t, steps: snap.nSteps, tv: snap.tv,
      ratio: snap.tv0 === 0 ? 1 : snap.tv / snap.tv0,
      qMin: snap.qMin, qMax: snap.qMax,
      cell, delta: delta[cell]!, left: faces.left, right: faces.right,
      overshoot: cellOvershoots(snap.q, cell, delta[cell]!),
      diverged: snap.diverged,
    });
    requestAnimationFrame(() => paint());
  }, [reduced, limiter, initial, cfl, N, paint]);

  useEffect(() => { paint(); }, [limiter, initial, paint, stats.diverged, pickedCell]);

  const ratioAccent = stats.diverged ? 'magenta' : stats.ratio > 1.02 ? 'magenta' : 'cyan';

  const onBarsClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = barsRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const { w } = barsSize.current;
    const padL = 40, padR = 10;
    const plotW = Math.max(10, w - padL - padR);
    const px = ((e.clientX - r.left) / r.width) * (w || r.width);
    const xi = (px - padL) / plotW;
    const cell = wrap(Math.floor(xi * N), N);
    setPickedCell(cell);
  };

  const limiterLabel: Record<RecLimiter, string> = {
    constant: 'piecewise constant',
    unlimited: 'unlimited Fromm',
    minmod: 'minmod',
    superbee: 'superbee',
  };

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title={`${limiterLabel[limiter]} · ${initial}`}
        right={
          <span className="hud-label" style={{ color: stats.diverged ? 'var(--sig-warn)' : stats.overshoot ? 'var(--sig-warn)' : 'var(--sig-ok)' }}>
            {stats.diverged ? 'exploded' : stats.overshoot ? 'new extrema' : 'no new extrema'}
          </span>
        }
      >
        <div ref={wrapRef}>
          <div
            style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(180px,1fr)', gap: 10, alignItems: 'stretch' }}
          >
            <div data-pane="bars" style={{ height, minWidth: 0 }}>
              <canvas
                ref={barsRef}
                onClick={onBarsClick}
                style={{ width: '100%', height: '100%', display: 'block', cursor: 'pointer' }}
              />
            </div>
            <div data-pane="zoom" style={{ height, minWidth: 0 }}>
              <canvas ref={zoomRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            </div>
          </div>
          <div data-pane="tv" style={{ height: 120, minWidth: 0, marginTop: 10 }}>
            <canvas ref={tvRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {!lockLimiter && (
            <Toggle
              options={[
                { key: 'constant', label: 'constant', accent: 'iris' },
                { key: 'unlimited', label: 'unlimited', accent: 'magenta' },
                { key: 'minmod', label: 'minmod', accent: 'cyan' },
                { key: 'superbee', label: 'superbee', accent: 'aqua' },
              ]}
              value={[limiter]}
              onChange={(next) => {
                setLimiter((next[0] as RecLimiter) ?? 'unlimited');
                setRunning(autoPlay && !reduced);
              }}
            />
          )}
          {!lockInitial && (
            <Toggle
              options={[
                { key: 'jump', label: 'jump', accent: 'magenta' },
                { key: 'sine', label: 'sine', accent: 'cyan' },
              ]}
              value={[initial]}
              onChange={(next) => {
                setInitial((next[0] as RecInitial) ?? 'jump');
                setRunning(autoPlay && !reduced);
              }}
            />
          )}
          <Button onClick={() => { seed(); setRunning(true); }} accent="cyan">reset</Button>
          <Button onClick={() => setRunning((r) => !r)} accent="magenta" active={running} disabled={stats.diverged || reduced}>
            {running ? 'pause' : 'play'}
          </Button>
        </div>

        <ReadoutRow>
          <Readout label="TV / TV₀" value={stats.diverged ? '—' : formatValue(stats.ratio, 4)} accent={ratioAccent} />
          <Readout
            label="min Q"
            value={formatValue(stats.qMin, 3)}
            accent={initial === 'jump' ? (stats.qMin < -1e-6 ? 'magenta' : 'cyan') : (stats.qMin < -1.02 ? 'magenta' : 'cyan')}
          />
          <Readout
            label="max Q"
            value={formatValue(stats.qMax, 3)}
            accent={initial === 'jump' ? (stats.qMax > 1 + 1e-6 ? 'magenta' : 'cyan') : (stats.qMax > 1.02 ? 'magenta' : 'cyan')}
          />
          <Readout label="δ" value={formatValue(stats.delta, 3)} accent={stats.overshoot ? 'magenta' : 'cyan'} />
          <Readout label="t" value={formatValue(stats.t, 3)} />
          <Readout label="steps" value={String(stats.steps)} />
        </ReadoutRow>
      </Panel>
      {caption && (
        <figcaption className="hud-label" style={{ marginTop: 8, lineHeight: 1.6, letterSpacing: '0.06em', textTransform: 'none' }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

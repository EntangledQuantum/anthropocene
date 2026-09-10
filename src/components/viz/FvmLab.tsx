import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Button, Panel, Readout, ReadoutRow, Slider, Toggle, useAnimationFrame, usePrefersReducedMotion } from './controls.tsx';
import { ACCENTS, formatValue } from './chart-core.ts';
import { periodicGrid, wrap } from '../../lib/numerics/pde1d.ts';
import {
  ADVECTION_C,
  DIVERGED,
  faceWithLargestJump,
  initialField,
  lambdaFromCfl,
  maxFaceMismatch,
  runFvm,
  stepFvm,
  totalMass,
  type FaceState,
  type FvmEquation,
  type FvmInitial,
  type FvmScheme,
} from '../../lib/numerics/fvm1d.ts';

/* ─────────────────────────────────────────────────────────────────────────
   Coupled views of one 1D finite-volume state: cell averages as bars,
   the two cells that share a highlighted face, and the running total.

   Conservative: one flux per face, used twice, so the sum cannot drift.
   Chain-rule FD: the two cells disagree at a jump, and the books leak.
   ───────────────────────────────────────────────────────────────────────── */

const READOUT_MS = 125;
const HISTORY_CAP = 240;
const BLOW = 20;

export interface FvmLabProps {
  equation?: FvmEquation;
  scheme?: FvmScheme;
  initial?: FvmInitial;
  n?: number;
  cfl?: number;
  lockEquation?: boolean;
  lockScheme?: boolean;
  lockInitial?: boolean;
  lockCfl?: boolean;
  height?: number;
  caption?: string;
  autoPlay?: boolean;
}

interface Sim {
  q: number[];
  t: number;
  nSteps: number;
  mass0: number;
  diverged: boolean;
  faces: FaceState;
  history: { t: number; ratio: number }[];
}

interface Stats {
  t: number;
  steps: number;
  ratio: number;
  mismatch: number;
  face: number;
  fromLeft: number;
  fromRight: number;
  qL: number;
  qR: number;
  diverged: boolean;
}

function cssColor(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function emptyFaces(n: number): FaceState {
  return { fromLeft: new Array(n).fill(0), fromRight: new Array(n).fill(0) };
}

export default function FvmLab({
  equation: equation0 = 'burgers',
  scheme: scheme0 = 'conservative',
  initial: initial0 = 'jump',
  n = 24,
  cfl: cfl0 = 0.4,
  lockEquation = false,
  lockScheme = false,
  lockInitial = false,
  lockCfl = false,
  height = 200,
  caption,
  autoPlay = true,
}: FvmLabProps) {
  const N = Math.max(2, Math.min(96, Math.round(n)));
  const [equation, setEquation] = useState<FvmEquation>(equation0);
  const [scheme, setScheme] = useState<FvmScheme>(scheme0);
  const [initial, setInitial] = useState<FvmInitial>(initial0);
  const [nu, setNu] = useState(cfl0);
  const [running, setRunning] = useState(autoPlay);
  const [pickedFace, setPickedFace] = useState<number | null>(null);
  const [stats, setStats] = useState<Stats>({
    t: 0, steps: 0, ratio: 1, mismatch: 0, face: 0,
    fromLeft: 0, fromRight: 0, qL: 0, qR: 0, diverged: false,
  });

  const reduced = usePrefersReducedMotion();
  const { x, dx } = useMemo(() => periodicGrid(N), [N]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLCanvasElement>(null);
  const pairRef = useRef<HTMLCanvasElement>(null);
  const massRef = useRef<HTMLCanvasElement>(null);
  const barsSize = useRef({ w: 480, h: height });
  const pairSize = useRef({ w: 220, h: height });
  const massSize = useRef({ w: 700, h: 120 });

  const simRef = useRef<Sim | null>(null);
  const equationRef = useRef(equation);
  const schemeRef = useRef(scheme);
  const initialRef = useRef(initial);
  const nuRef = useRef(nu);
  const runningRef = useRef(running);
  const pickedRef = useRef(pickedFace);
  const lastReadout = useRef(0);
  const lambdaRef = useRef(0.4);

  useEffect(() => { equationRef.current = equation; }, [equation]);
  useEffect(() => { schemeRef.current = scheme; }, [scheme]);
  useEffect(() => { initialRef.current = initial; }, [initial]);
  useEffect(() => { nuRef.current = nu; }, [nu]);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { pickedRef.current = pickedFace; }, [pickedFace]);

  const seed = useCallback(() => {
    const q0 = initialField(initialRef.current, x);
    const faces = emptyFaces(N);
    const stepped = stepFvm(q0, equationRef.current, schemeRef.current, 0);
    const mass0 = totalMass(q0, dx);
    lambdaRef.current = lambdaFromCfl(q0, equationRef.current, nuRef.current, ADVECTION_C);
    simRef.current = {
      q: q0.slice(), t: 0, nSteps: 0, mass0, diverged: false,
      faces: stepped.faces, history: [{ t: 0, ratio: 1 }],
    };
    lastReadout.current = 0;
    const face = faceWithLargestJump(q0);
    const i = wrap(face, N);
    setStats({
      t: 0, steps: 0, ratio: 1,
      mismatch: maxFaceMismatch(stepped.faces),
      face: i,
      fromLeft: stepped.faces.fromLeft[i]!,
      fromRight: stepped.faces.fromRight[i]!,
      qL: q0[i]!, qR: q0[wrap(i + 1, N)]!,
      diverged: false,
    });
  }, [x, dx, N]);

  useEffect(() => { seed(); }, [seed, equation, scheme, initial, nu]);

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

    let peak = 0;
    for (const v of sim.q) {
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    const yMax = peak < 1.45 && !sim.diverged ? 1.35 : Math.min(8, Math.max(1.6, peak * 1.08));
    const yMin = peak < 1.45 && !sim.diverged ? -0.18 : -0.12 * yMax;
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

    const leaking = schemeRef.current === 'nonconservative' && equationRef.current === 'burgers';
    const fill = leaking ? magenta : cyan;
    const cellW = plotW / N;
    const face = pickedRef.current ?? faceWithLargestJump(sim.q);

    for (let i = 0; i < N; i++) {
      const q = sim.q[i]!;
      const px = X(x[i]!);
      const py0 = Y(0);
      const py1 = Y(Math.max(yMin, Math.min(yMax, q)));
      const top = Math.min(py0, py1);
      const bot = Math.max(py0, py1);
      ctx.fillStyle = fill;
      ctx.globalAlpha = i === face || i === wrap(face + 1, N) ? 0.85 : 0.45;
      ctx.fillRect(px + 0.6, top, Math.max(1, cellW - 1.2), Math.max(1, bot - top));
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const px = X(i / N);
      ctx.moveTo(px, y0);
      ctx.lineTo(px, y1);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    const faceX = X((face + 1) / N);
    ctx.strokeStyle = leaking ? magenta : aqua;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(faceX, y0);
    ctx.lineTo(faceX, y1);
    ctx.stroke();

    const Fl = sim.faces.fromLeft[face]!;
    const Fr = sim.faces.fromRight[face]!;
    const midY = (y0 + Y(0)) / 2;
    const arrow = (dir: number, y: number, color: string) => {
      const len = 14;
      const tip = faceX + dir * len;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(faceX, y);
      ctx.lineTo(tip, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tip, y);
      ctx.lineTo(tip - dir * 6, y - 4);
      ctx.lineTo(tip - dir * 6, y + 4);
      ctx.closePath();
      ctx.fill();
    };
    if (Math.abs(Fl - Fr) < 1e-12) {
      arrow(Fl >= 0 ? 1 : -1, midY, aqua);
    } else {
      arrow(Fl >= 0 ? 1 : -1, midY - 7, cyan);
      arrow(Fr >= 0 ? 1 : -1, midY + 7, magenta);
    }

    ctx.fillStyle = ink;
    ctx.font = '12px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const tick of [0, 0.25, 0.5, 0.75, 1]) ctx.fillText(String(tick), X(tick), y1 + 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const tick of [0, 0.5, 1]) {
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

  const paintPair = useCallback(() => {
    const canvas = pairRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = pairSize.current;
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
    const ok = ACCENTS.ok;

    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, w, h);

    const padL = 36, padR = 12, padT = 28, padB = 36;
    const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
    const plotW = Math.max(10, x1 - x0), plotH = Math.max(10, y1 - y0);

    ctx.strokeStyle = rule;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW, plotH);

    const face = pickedRef.current ?? faceWithLargestJump(sim.q);
    const iL = wrap(face, N);
    const iR = wrap(face + 1, N);
    const qL = sim.q[iL]!;
    const qR = sim.q[iR]!;
    const Fl = sim.faces.fromLeft[iL]!;
    const Fr = sim.faces.fromRight[iL]!;
    const match = Math.abs(Fl - Fr) < 1e-10;

    const yMax = 1.35;
    const yMin = -0.15;
    const Y = (u: number) => y1 - ((u - yMin) / (yMax - yMin)) * plotH;
    const colW = plotW / 2;

    ctx.beginPath();
    ctx.moveTo(x0, Y(0));
    ctx.lineTo(x1, Y(0));
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.globalAlpha = 1;

    const drawCell = (q: number, x: number, color: string) => {
      const py0 = Y(0);
      const py1 = Y(Math.max(yMin, Math.min(yMax, q)));
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(x + 8, Math.min(py0, py1), colW - 16, Math.max(2, Math.abs(py1 - py0)));
      ctx.globalAlpha = 1;
    };
    drawCell(qL, x0, match ? cyan : magenta);
    drawCell(qR, x0 + colW, match ? cyan : magenta);

    const midX = x0 + plotW / 2;
    ctx.strokeStyle = match ? aqua : magenta;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(midX, y0);
    ctx.lineTo(midX, y1);
    ctx.stroke();

    ctx.fillStyle = ink;
    ctx.font = '11px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`Q = ${formatValue(qL, 3)}`, x0 + colW / 2, y1 + 6);
    ctx.fillText(`Q = ${formatValue(qR, 3)}`, x0 + colW + colW / 2, y1 + 6);

    ctx.fillStyle = match ? ok : magenta;
    ctx.font = '600 12px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText(match ? 'one flux, used twice' : 'these two numbers disagree', midX, y0 - 6);

    ctx.font = '11px var(--font-mono), ui-monospace, monospace';
    ctx.fillStyle = match ? aqua : cyan;
    ctx.textBaseline = 'top';
    ctx.fillText(`leaving ${formatValue(Fl, 3)}`, midX, y0 + 8);
    if (!match) {
      ctx.fillStyle = magenta;
      ctx.fillText(`entering ${formatValue(Fr, 3)}`, midX, y0 + 22);
    }
  }, [N, height]);

  const paintMass = useCallback(() => {
    const canvas = massRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = massSize.current;
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
    const tMax = Math.max(0.6, hist[hist.length - 1]?.t ?? 0.6);
    let rMin = 0.72, rMax = 1.12;
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

    const leaking = schemeRef.current === 'nonconservative' && equationRef.current === 'burgers';
    ctx.beginPath();
    let started = false;
    for (const p of hist) {
      if (!Number.isFinite(p.ratio)) continue;
      const px = X(p.t), py = Y(p.ratio);
      if (!started) { ctx.moveTo(px, py); started = true; }
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = leaking ? magenta : cyan;
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
    ctx.fillText('M / M₀', 0, 0);
    ctx.restore();
  }, []);

  const paintBarsRef = useRef(paintBars);
  const paintPairRef = useRef(paintPair);
  const paintMassRef = useRef(paintMass);
  useEffect(() => { paintBarsRef.current = paintBars; }, [paintBars]);
  useEffect(() => { paintPairRef.current = paintPair; }, [paintPair]);
  useEffect(() => { paintMassRef.current = paintMass; }, [paintMass]);

  const paint = useCallback(() => {
    paintBarsRef.current();
    paintPairRef.current();
    paintMassRef.current();
  }, []);

  useEffect(() => {
    const wrapEl = wrapRef.current;
    if (!wrapEl) return;
    const bars = wrapEl.querySelector('[data-pane="bars"]') as HTMLElement | null;
    const pair = wrapEl.querySelector('[data-pane="pair"]') as HTMLElement | null;
    const mass = wrapEl.querySelector('[data-pane="mass"]') as HTMLElement | null;
    const ro = new ResizeObserver(() => {
      if (bars) barsSize.current = { w: bars.clientWidth || 480, h: bars.clientHeight || height };
      if (pair) pairSize.current = { w: pair.clientWidth || 220, h: pair.clientHeight || height };
      if (mass) massSize.current = { w: mass.clientWidth || 700, h: mass.clientHeight || 120 };
      paint();
    });
    if (bars) ro.observe(bars);
    if (pair) ro.observe(pair);
    if (mass) ro.observe(mass);
    paint();
    return () => ro.disconnect();
  }, [height, paint]);

  const pushReadout = (sim: Sim) => {
    const now = performance.now();
    if (now - lastReadout.current < READOUT_MS && !sim.diverged) return;
    lastReadout.current = now;
    const face = pickedRef.current ?? faceWithLargestJump(sim.q);
    const i = wrap(face, N);
    const mass = totalMass(sim.q, dx);
    setStats({
      t: sim.t,
      steps: sim.nSteps,
      ratio: sim.mass0 === 0 ? 1 : mass / sim.mass0,
      mismatch: maxFaceMismatch(sim.faces),
      face: i,
      fromLeft: sim.faces.fromLeft[i]!,
      fromRight: sim.faces.fromRight[i]!,
      qL: sim.q[i]!,
      qR: sim.q[wrap(i + 1, N)]!,
      diverged: sim.diverged,
    });
  };

  const stepSim = useCallback((wallDt: number) => {
    const sim = simRef.current;
    if (!sim || sim.diverged) return;
    const lambda = lambdaRef.current;
    const dt = lambda * dx;
    const target = 0.22 * wallDt;
    const steps = Math.max(1, Math.min(48, Math.ceil(target / Math.max(dt, 1e-9))));
    for (let s = 0; s < steps; s++) {
      const { next, faces } = stepFvm(sim.q, equationRef.current, schemeRef.current, lambda);
      let m = 0;
      for (const v of next) {
        const a = Math.abs(v);
        if (a > m) m = a;
      }
      if (!Number.isFinite(m) || m > BLOW || m > DIVERGED) {
        sim.diverged = true;
        sim.faces = faces;
        break;
      }
      sim.q = next;
      sim.faces = faces;
      sim.t += dt;
      sim.nSteps += 1;
      const ratio = totalMass(sim.q, dx) / sim.mass0;
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
  }, [dx, N, paint]);

  useAnimationFrame(running && !reduced, stepSim);

  useEffect(() => {
    if (!reduced) return;
    const snap = runFvm({
      equation, scheme, initial, n: N, cfl: nu, tEnd: 0.5,
    });
    const faces = stepFvm(snap.q, equation, scheme, 0).faces;
    simRef.current = {
      q: snap.q, t: snap.t, nSteps: snap.nSteps, mass0: snap.mass0,
      diverged: snap.diverged, faces,
      history: snap.history.map((s) => ({ t: s.t, ratio: s.ratio })),
    };
    setRunning(false);
    const face = faceWithLargestJump(snap.q);
    setStats({
      t: snap.t, steps: snap.nSteps,
      ratio: snap.mass0 === 0 ? 1 : snap.mass / snap.mass0,
      mismatch: maxFaceMismatch(faces),
      face, fromLeft: faces.fromLeft[face]!, fromRight: faces.fromRight[face]!,
      qL: snap.q[face]!, qR: snap.q[wrap(face + 1, N)]!,
      diverged: snap.diverged,
    });
    requestAnimationFrame(() => paint());
  }, [reduced, equation, scheme, initial, nu, N, paint]);

  useEffect(() => { paint(); }, [nu, equation, scheme, initial, paint, stats.diverged, pickedFace]);

  const match = Math.abs(stats.fromLeft - stats.fromRight) < 1e-10;
  const ratioAccent = stats.diverged ? 'magenta' : Math.abs(stats.ratio - 1) < 1e-8 ? 'cyan' : 'warn';

  const onBarsClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = barsRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const { w } = barsSize.current;
    const padL = 40, padR = 10;
    const plotW = Math.max(10, w - padL - padR);
    const px = ((e.clientX - r.left) / r.width) * (w || r.width);
    const xi = (px - padL) / plotW;
    const face = wrap(Math.round(xi * N) - 1, N);
    setPickedFace(face);
  };

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title={
          scheme === 'conservative'
            ? `${equation} · conservation form`
            : `${equation} · chain-rule FD`
        }
        right={
          <span className="hud-label" style={{ color: stats.diverged ? 'var(--sig-warn)' : match ? 'var(--sig-ok)' : 'var(--sig-warn)' }}>
            {stats.diverged ? 'exploded' : match ? 'fluxes agree' : 'fluxes disagree'}
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
            <div data-pane="pair" style={{ height, minWidth: 0 }}>
              <canvas ref={pairRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            </div>
          </div>
          <div data-pane="mass" style={{ height: 120, minWidth: 0, marginTop: 10 }}>
            <canvas ref={massRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: lockCfl ? 'auto' : 'minmax(180px,1fr) auto', gap: 12, alignItems: 'end' }}>
          {!lockCfl && (
            <Slider
              spec={{
                key: 'cfl', label: 'CFL number', symbol: 'ν', min: 0.15, max: 1.4, step: 0.01, value: nu,
                hint: 'Stay at 0.4 unless you want to see that conservation is not stability.',
              }}
              value={nu}
              onChange={(v) => { setNu(v); setRunning(autoPlay && !reduced); }}
            />
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {!lockEquation && (
              <Toggle
                options={[
                  { key: 'advection', label: 'advection', accent: 'cyan' },
                  { key: 'burgers', label: 'Burgers', accent: 'iris' },
                ]}
                value={[equation]}
                onChange={(next) => {
                  setEquation((next[0] as FvmEquation) ?? 'burgers');
                  setRunning(autoPlay && !reduced);
                }}
              />
            )}
            {!lockScheme && (
              <Toggle
                options={[
                  { key: 'conservative', label: 'shared flux', accent: 'cyan' },
                  { key: 'nonconservative', label: 'chain-rule', accent: 'magenta' },
                ]}
                value={[scheme]}
                onChange={(next) => {
                  setScheme((next[0] as FvmScheme) ?? 'conservative');
                  setRunning(autoPlay && !reduced);
                }}
              />
            )}
            {!lockInitial && (
              <Toggle
                options={[
                  { key: 'jump', label: 'jump', accent: 'magenta' },
                  { key: 'pulse', label: 'pulse', accent: 'cyan' },
                ]}
                value={[initial]}
                onChange={(next) => {
                  setInitial((next[0] as FvmInitial) ?? 'jump');
                  setRunning(autoPlay && !reduced);
                }}
              />
            )}
            <Button onClick={() => { seed(); setRunning(true); }} accent="cyan">reset</Button>
            <Button onClick={() => setRunning((r) => !r)} accent="magenta" active={running} disabled={stats.diverged || reduced}>
              {running ? 'pause' : 'play'}
            </Button>
          </div>
        </div>

        <ReadoutRow>
          <Readout label="M / M₀" value={stats.diverged ? '—' : formatValue(stats.ratio, 6)} accent={ratioAccent} />
          <Readout
            label="face mismatch"
            value={formatValue(stats.mismatch, 3)}
            accent={match ? 'cyan' : 'magenta'}
          />
          <Readout label="leaving" value={formatValue(stats.fromLeft, 3)} accent="cyan" />
          <Readout label="entering" value={formatValue(stats.fromRight, 3)} accent={match ? 'cyan' : 'magenta'} />
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

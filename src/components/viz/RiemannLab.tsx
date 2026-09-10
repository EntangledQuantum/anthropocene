import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Panel, Readout, ReadoutRow, Slider, Toggle, useAnimationFrame, usePrefersReducedMotion } from './controls.tsx';
import { ACCENTS, formatValue } from './chart-core.ts';
import { periodicGrid } from '../../lib/numerics/pde1d.ts';
import {
  ADVECTION_C,
  DIVERGED,
  lambdaFromCfl,
  overshoot,
  runRiemann,
  sampleRiemann,
  sampleSod,
  scalarRiemann,
  sodWaves,
  stepRiemann,
  totalMass,
  type FvmEquation,
} from '../../lib/numerics/riemann.ts';

/* ─────────────────────────────────────────────────────────────────────────
   Coupled views of one Riemann problem.

   Fan: (x, t) characteristics and û(ξ). Drag uL, uR; the face is ξ = 0.
   Scheme: that flux in a conservative update versus a centred flux that rings.
   Sod: the same face question in Euler clothing — three waves.

   One state, several pictures. Numbers come from src/lib/numerics/riemann.ts.
   ───────────────────────────────────────────────────────────────────────── */

const READOUT_MS = 125;
const BLOW = 8;
const XI_MIN = -2;
const XI_MAX = 2;
const XT_X = 1.55;
const XT_T = 1;

export type RiemannView = 'fan' | 'scheme' | 'sod';

export interface RiemannLabProps {
  view?: RiemannView;
  equation?: FvmEquation;
  uL?: number;
  uR?: number;
  lockStates?: boolean;
  lockEquation?: boolean;
  n?: number;
  cfl?: number;
  height?: number;
  caption?: string;
  autoPlay?: boolean;
}

interface DualSim {
  qG: number[];
  qC: number[];
  t: number;
  nSteps: number;
  mass0: number;
  divergedC: boolean;
}

function cssColor(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

export default function RiemannLab({
  view = 'fan',
  equation: equation0 = 'burgers',
  uL: uL0 = 1,
  uR: uR0 = 0,
  lockStates = false,
  lockEquation = false,
  n = 48,
  cfl = 0.4,
  height = 220,
  caption,
  autoPlay = true,
}: RiemannLabProps) {
  const N = Math.max(8, Math.min(96, Math.round(n)));
  const [equation, setEquation] = useState<FvmEquation>(equation0);
  const [uL, setUL] = useState(uL0);
  const [uR, setUR] = useState(uR0);
  const [running, setRunning] = useState(view === 'scheme' && autoPlay);
  const [sodT, setSodT] = useState(0.2);
  const [stats, setStats] = useState({
    t: 0, overG: 0, overC: 0, divergedC: false,
  });

  const reduced = usePrefersReducedMotion();
  const rie = useMemo(() => scalarRiemann(equation, uL, uR), [equation, uL, uR]);
  const { x, dx } = useMemo(() => periodicGrid(N), [N]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const xtRef = useRef<HTMLCanvasElement>(null);
  const xiRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<HTMLCanvasElement>(null);
  const sodRef = useRef<HTMLCanvasElement>(null);
  const xtSize = useRef({ w: 360, h: height });
  const xiSize = useRef({ w: 280, h: height });
  const fieldSize = useRef({ w: 700, h: 160 });
  const sodSize = useRef({ w: 700, h: height + 40 });

  const simRef = useRef<DualSim | null>(null);
  const equationRef = useRef(equation);
  const uLRef = useRef(uL);
  const uRRef = useRef(uR);
  const runningRef = useRef(running);
  const lastReadout = useRef(0);
  const lambdaRef = useRef(0.4);

  useEffect(() => { equationRef.current = equation; }, [equation]);
  useEffect(() => { uLRef.current = uL; }, [uL]);
  useEffect(() => { uRRef.current = uR; }, [uR]);
  useEffect(() => { runningRef.current = running; }, [running]);

  const seed = useCallback(() => {
    const q0 = x.map((xi) => (xi < 0.5 ? uLRef.current : uRRef.current));
    lambdaRef.current = lambdaFromCfl(q0, equationRef.current, cfl, ADVECTION_C);
    simRef.current = {
      qG: q0.slice(), qC: q0.slice(), t: 0, nSteps: 0,
      mass0: totalMass(q0, dx), divergedC: false,
    };
    lastReadout.current = 0;
    setStats({ t: 0, overG: 0, overC: 0, divergedC: false });
  }, [x, dx, cfl]);

  useEffect(() => { seed(); }, [seed, equation, uL, uR]);

  const paintXt = useCallback(() => {
    const canvas = xtRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = xtSize.current;
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
    const iris = ACCENTS.iris;

    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, w, h);

    const padL = 40, padR = 12, padT = 18, padB = 28;
    const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
    const plotW = Math.max(10, x1 - x0), plotH = Math.max(10, y1 - y0);
    const X = (xv: number) => x0 + ((xv + XT_X) / (2 * XT_X)) * plotW;
    const Y = (t: number) => y1 - (t / XT_T) * plotH;

    ctx.strokeStyle = rule;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW, plotH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, plotW, plotH);
    ctx.clip();

    const info = scalarRiemann(equationRef.current, uLRef.current, uRRef.current);
    const leftC = equationRef.current === 'advection' ? ADVECTION_C : uLRef.current;
    const rightC = equationRef.current === 'advection' ? ADVECTION_C : uRRef.current;

    // Face x = 0.
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    ctx.lineTo(X(0), Y(XT_T));
    ctx.strokeStyle = aqua;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.setLineDash([]);

    const clipChar = (xStart: number, speed: number, color: string, width = 1) => {
      let tEnd = XT_T;
      if (info.kind === 'shock') {
        const den = info.speed - speed;
        if (Math.abs(den) > 1e-12) {
          const th = xStart / den;
          if (th > 1e-9 && th < tEnd) tEnd = th;
        }
      }
      ctx.beginPath();
      ctx.moveTo(X(xStart), Y(0));
      ctx.lineTo(X(xStart + speed * tEnd), Y(tEnd));
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };

    if (info.kind === 'rarefaction') {
      const xHead = info.head * XT_T;
      const xTail = info.tail * XT_T;
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      ctx.lineTo(X(xHead), Y(XT_T));
      ctx.lineTo(X(xTail), Y(XT_T));
      ctx.closePath();
      ctx.fillStyle = iris;
      ctx.globalAlpha = 0.22;
      ctx.fill();
      ctx.globalAlpha = 1;
      const nRays = 7;
      for (let i = 0; i < nRays; i++) {
        const s = info.head + ((info.tail - info.head) * i) / (nRays - 1);
        ctx.beginPath();
        ctx.moveTo(X(0), Y(0));
        ctx.lineTo(X(s * XT_T), Y(XT_T));
        ctx.strokeStyle = iris;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = i === 0 || i === nRays - 1 ? 1.6 : 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    } else {
      // Shock or contact: one heavy ray from the origin.
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      ctx.lineTo(X(info.speed * XT_T), Y(XT_T));
      ctx.strokeStyle = info.kind === 'shock' ? magenta : aqua;
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }

    const startsL = [-1.4, -1.05, -0.7, -0.35];
    const startsR = [0.35, 0.7, 1.05, 1.4];
    for (const xs of startsL) clipChar(xs, leftC, cyan, 1);
    for (const xs of startsR) clipChar(xs, rightC, magenta, 1);

    ctx.restore();

    ctx.fillStyle = ink;
    ctx.font = '12px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const tick of [-1, 0, 1]) ctx.fillText(String(tick), X(tick), y1 + 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const tick of [0, 0.5, 1]) ctx.fillText(String(tick), x0 - 6, Y(tick));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('x', (x0 + x1) / 2, h - 2);
    ctx.save();
    ctx.translate(14, (y0 + y1) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('t', 0, 0);
    ctx.restore();

    ctx.fillStyle = aqua;
    ctx.font = '11px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('face', X(0) + 4, y0 + 4);
  }, []);

  const paintXi = useCallback(() => {
    const canvas = xiRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = xiSize.current;
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

    const padL = 36, padR = 12, padT = 22, padB = 28;
    const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
    const plotW = Math.max(10, x1 - x0), plotH = Math.max(10, y1 - y0);

    const uLo = Math.min(uLRef.current, uRRef.current, 0);
    const uHi = Math.max(uLRef.current, uRRef.current, 0);
    const pad = 0.35;
    const yMin = uLo - pad;
    const yMax = uHi + pad;
    const X = (xi: number) => x0 + ((xi - XI_MIN) / (XI_MAX - XI_MIN)) * plotW;
    const Y = (u: number) => y1 - ((u - yMin) / (yMax - yMin)) * plotH;

    ctx.strokeStyle = rule;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW, plotH);

    ctx.beginPath();
    ctx.moveTo(x0, Y(0));
    ctx.lineTo(x1, Y(0));
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(X(0), y0);
    ctx.lineTo(X(0), y1);
    ctx.strokeStyle = aqua;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.setLineDash([]);

    const samples = sampleRiemann(
      equationRef.current, uLRef.current, uRRef.current, XI_MIN, XI_MAX, 240,
    );
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i]!;
      const px = X(p.xi), py = Y(p.u);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = cyan;
    ctx.lineWidth = 2;
    ctx.stroke();

    const info = scalarRiemann(equationRef.current, uLRef.current, uRRef.current);
    const starY = Y(info.star);
    ctx.fillStyle = ok;
    ctx.beginPath();
    ctx.arc(X(0), starY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = abyss;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = ink;
    ctx.font = '11px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const tick of [-2, -1, 0, 1, 2]) ctx.fillText(String(tick), X(tick), y1 + 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const uTicks = [uLRef.current, 0, uRRef.current].filter((v, i, a) => a.indexOf(v) === i);
    for (const tick of uTicks) ctx.fillText(formatValue(tick, 2), x0 - 6, Y(tick));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('ξ = x/t', (x0 + x1) / 2, h - 2);

    ctx.fillStyle = magenta;
    ctx.font = '600 12px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(info.kind, (x0 + x1) / 2, y0 - 4);
  }, []);

  const paintField = useCallback(() => {
    const canvas = fieldRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = fieldSize.current;
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

    const padL = 40, padR = 12, padT = 10, padB = 26;
    const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
    const plotW = Math.max(10, x1 - x0), plotH = Math.max(10, y1 - y0);

    let peak = 1.2;
    for (const v of sim.qG) peak = Math.max(peak, Math.abs(v));
    for (const v of sim.qC) if (Number.isFinite(v)) peak = Math.max(peak, Math.abs(v));
    peak = Math.min(4, Math.max(1.35, peak * 1.08));
    const yMin = -0.25 * peak, yMax = peak;
    const X = (xi: number) => x0 + xi * plotW;
    const Y = (u: number) => y1 - ((u - yMin) / (yMax - yMin)) * plotH;

    ctx.strokeStyle = rule;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW, plotH);
    ctx.beginPath();
    ctx.moveTo(x0, Y(0));
    ctx.lineTo(x1, Y(0));
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.globalAlpha = 1;

    const draw = (q: number[], color: string, width: number) => {
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const px = X((i + 0.5) / N);
        const py = Y(Math.max(yMin, Math.min(yMax, q[i]!)));
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    if (!sim.divergedC) draw(sim.qC, magenta, 1.6);
    draw(sim.qG, cyan, 2.2);

    ctx.fillStyle = ink;
    ctx.font = '11px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const tick of [0, 0.5, 1]) ctx.fillText(String(tick), X(tick), y1 + 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const tick of [0, 1]) ctx.fillText(String(tick), x0 - 6, Y(tick));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = cyan;
    ctx.fillText('Godunov', x0 + 8, y0 + 6);
    ctx.fillStyle = magenta;
    ctx.fillText(sim.divergedC ? 'centred — exploded' : 'centred LW', x0 + 8, y0 + 20);
  }, [N]);

  const paintSod = useCallback(() => {
    const canvas = sodRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = sodSize.current;
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
    const iris = ACCENTS.iris;
    const aqua = ACCENTS.aqua;

    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, w, h);

    const padL = 44, padR = 14, padT = 22, padB = 28;
    const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
    const plotW = Math.max(10, x1 - x0), plotH = Math.max(10, y1 - y0);
    const X = (xv: number) => x0 + xv * plotW;
    const Y = (rho: number) => y1 - (rho / 1.15) * plotH;

    ctx.strokeStyle = rule;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW, plotH);

    const t = Math.max(sodT, 1e-4);
    const profile = sampleSod(t, 280);
    ctx.beginPath();
    for (let i = 0; i < profile.length; i++) {
      const p = profile[i]!;
      const px = X(p.x), py = Y(p.rho);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = cyan;
    ctx.lineWidth = 2;
    ctx.stroke();

    const wvs = sodWaves();
    const marks: { s: number; label: string; color: string }[] = [
      { s: wvs.rarefactionHead, label: 'rarefaction', color: iris },
      { s: wvs.contact, label: 'contact', color: aqua },
      { s: wvs.shock, label: 'shock', color: magenta },
    ];
    for (const m of marks) {
      const xx = 0.5 + m.s * t;
      if (xx < 0.02 || xx > 0.98) continue;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(X(xx), y0);
      ctx.lineTo(X(xx), y1);
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = m.color;
      ctx.font = '11px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(m.label, X(xx), y0 - 4);
    }

    ctx.fillStyle = ink;
    ctx.font = '12px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const tick of [0, 0.25, 0.5, 0.75, 1]) ctx.fillText(String(tick), X(tick), y1 + 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const tick of [0, 0.5, 1]) ctx.fillText(String(tick), x0 - 6, Y(tick));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('x', (x0 + x1) / 2, h - 2);
    ctx.save();
    ctx.translate(14, (y0 + y1) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('ρ', 0, 0);
    ctx.restore();
  }, [sodT]);

  const paintXtRef = useRef(paintXt);
  const paintXiRef = useRef(paintXi);
  const paintFieldRef = useRef(paintField);
  const paintSodRef = useRef(paintSod);
  useEffect(() => { paintXtRef.current = paintXt; }, [paintXt]);
  useEffect(() => { paintXiRef.current = paintXi; }, [paintXi]);
  useEffect(() => { paintFieldRef.current = paintField; }, [paintField]);
  useEffect(() => { paintSodRef.current = paintSod; }, [paintSod]);

  const paint = useCallback(() => {
    if (view === 'sod') {
      paintSodRef.current();
      return;
    }
    paintXtRef.current();
    paintXiRef.current();
    if (view === 'scheme') paintFieldRef.current();
  }, [view]);

  useEffect(() => {
    const wrapEl = wrapRef.current;
    if (!wrapEl) return;
    const xt = wrapEl.querySelector('[data-pane="xt"]') as HTMLElement | null;
    const xi = wrapEl.querySelector('[data-pane="xi"]') as HTMLElement | null;
    const field = wrapEl.querySelector('[data-pane="field"]') as HTMLElement | null;
    const sod = wrapEl.querySelector('[data-pane="sod"]') as HTMLElement | null;
    const ro = new ResizeObserver(() => {
      if (xt) xtSize.current = { w: xt.clientWidth || 360, h: xt.clientHeight || height };
      if (xi) xiSize.current = { w: xi.clientWidth || 280, h: xi.clientHeight || height };
      if (field) fieldSize.current = { w: field.clientWidth || 700, h: field.clientHeight || 160 };
      if (sod) sodSize.current = { w: sod.clientWidth || 700, h: sod.clientHeight || height + 40 };
      paint();
    });
    if (xt) ro.observe(xt);
    if (xi) ro.observe(xi);
    if (field) ro.observe(field);
    if (sod) ro.observe(sod);
    paint();
    return () => ro.disconnect();
  }, [height, paint, view]);

  useEffect(() => { paint(); }, [uL, uR, equation, sodT, paint, stats.t, stats.divergedC]);

  const stepSim = useCallback((wallDt: number) => {
    const sim = simRef.current;
    if (!sim) return;
    const lambda = lambdaRef.current;
    const dt = lambda * dx;
    const target = 0.18 * wallDt;
    const steps = Math.max(1, Math.min(32, Math.ceil(target / Math.max(dt, 1e-9))));
    const lo = Math.min(uLRef.current, uRRef.current);
    const hi = Math.max(uLRef.current, uRRef.current);
    const eq = equationRef.current;
    for (let s = 0; s < steps; s++) {
      sim.qG = stepRiemann(sim.qG, eq, 'godunov', lambda).next;
      if (!sim.divergedC) {
        const nextC = stepRiemann(sim.qC, eq, 'centered', lambda).next;
        let m = 0;
        for (const v of nextC) {
          const a = Math.abs(v);
          if (a > m) m = a;
        }
        if (!Number.isFinite(m) || m > BLOW || m > DIVERGED) {
          sim.divergedC = true;
        } else {
          sim.qC = nextC;
        }
      }
      sim.t += dt;
      sim.nSteps += 1;
    }
    paint();
    const now = performance.now();
    if (now - lastReadout.current >= READOUT_MS) {
      lastReadout.current = now;
      setStats({
        t: sim.t,
        overG: overshoot(sim.qG, lo, hi),
        overC: sim.divergedC ? Infinity : overshoot(sim.qC, lo, hi),
        divergedC: sim.divergedC,
      });
    }
  }, [dx, paint]);

  useAnimationFrame(view === 'scheme' && running && !reduced, stepSim);

  useEffect(() => {
    if (view !== 'scheme' || !reduced) return;
    const g = runRiemann({
      equation, scheme: 'godunov', uL, uR, n: N, cfl, tEnd: 0.4,
    });
    const c = runRiemann({
      equation, scheme: 'centered', uL, uR, n: N, cfl, tEnd: 0.4,
    });
    simRef.current = {
      qG: g.q, qC: c.q, t: g.t, nSteps: g.nSteps, mass0: g.mass0, divergedC: c.diverged,
    };
    setRunning(false);
    setStats({
      t: g.t, overG: g.overshoot, overC: c.diverged ? Infinity : c.overshoot, divergedC: c.diverged,
    });
    requestAnimationFrame(() => paint());
  }, [reduced, view, equation, uL, uR, N, cfl, paint]);

  const kindLabel = rie.kind;
  const title = view === 'sod'
    ? 'Sod shock tube'
    : view === 'scheme'
      ? `${equation} · Godunov vs centred`
      : `${equation} · Riemann fan`;

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title={title}
        right={
          <span className="hud-label" style={{ color: 'var(--color-cyan)' }}>
            {view === 'sod' ? 'three waves' : kindLabel}
          </span>
        }
      >
        <div ref={wrapRef}>
          {view !== 'sod' && (
            <div
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(180px,1fr)', gap: 10, alignItems: 'stretch' }}
            >
              <div data-pane="xt" style={{ height, minWidth: 0 }}>
                <canvas ref={xtRef} style={{ width: '100%', height: '100%', display: 'block' }} />
              </div>
              <div data-pane="xi" style={{ height, minWidth: 0 }}>
                <canvas ref={xiRef} style={{ width: '100%', height: '100%', display: 'block' }} />
              </div>
            </div>
          )}
          {view === 'scheme' && (
            <div data-pane="field" style={{ height: 160, minWidth: 0, marginTop: 10 }}>
              <canvas ref={fieldRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            </div>
          )}
          {view === 'sod' && (
            <div data-pane="sod" style={{ height: height + 40, minWidth: 0 }}>
              <canvas ref={sodRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'minmax(160px,1fr) minmax(160px,1fr) auto', gap: 12, alignItems: 'end' }}>
          {view === 'sod' ? (
            <Slider
              spec={{
                key: 't', label: 'time', symbol: 't', min: 0.02, max: 0.25, step: 0.005, value: sodT,
                hint: 'The three waves leave the diaphragm at x = 1/2.',
              }}
              value={sodT}
              onChange={setSodT}
            />
          ) : !lockStates ? (
            <>
              <Slider
                spec={{
                  key: 'uL', label: 'left state', symbol: 'u_L', min: -1.5, max: 2, step: 0.02, value: uL,
                }}
                value={uL}
                onChange={(v) => { setUL(v); if (view === 'scheme') setRunning(autoPlay && !reduced); }}
              />
              <Slider
                spec={{
                  key: 'uR', label: 'right state', symbol: 'u_R', min: -1.5, max: 2, step: 0.02, value: uR,
                }}
                value={uR}
                onChange={(v) => { setUR(v); if (view === 'scheme') setRunning(autoPlay && !reduced); }}
              />
            </>
          ) : <div />}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {view !== 'sod' && !lockEquation && (
              <Toggle
                options={[
                  { key: 'burgers', label: 'Burgers', accent: 'iris' },
                  { key: 'advection', label: 'advection', accent: 'cyan' },
                ]}
                value={[equation]}
                onChange={(next) => {
                  setEquation((next[0] as FvmEquation) ?? 'burgers');
                  if (view === 'scheme') setRunning(autoPlay && !reduced);
                }}
              />
            )}
            {view === 'scheme' && (
              <>
                <Button onClick={() => { seed(); setRunning(true); }} accent="cyan">reset</Button>
                <Button
                  onClick={() => setRunning((r) => !r)}
                  accent="magenta"
                  active={running}
                  disabled={reduced}
                >
                  {running ? 'pause' : 'play'}
                </Button>
              </>
            )}
          </div>
        </div>

        {view !== 'sod' && (
          <ReadoutRow>
            <Readout label="wave" value={rie.kind} accent={rie.kind === 'shock' ? 'magenta' : rie.kind === 'rarefaction' ? 'iris' : 'cyan'} mono={false} />
            <Readout
              label={rie.kind === 'rarefaction' ? 'head → tail' : 'speed'}
              value={rie.kind === 'rarefaction'
                ? `${formatValue(rie.head, 2)} → ${formatValue(rie.tail, 2)}`
                : formatValue(rie.speed, 3)}
            />
            <Readout label="u*" value={formatValue(rie.star, 3)} accent="ok" />
            <Readout label="F = f(u*)" value={formatValue(rie.flux, 3)} accent="cyan" />
            {view === 'scheme' && (
              <>
                <Readout label="t" value={formatValue(stats.t, 3)} />
                <Readout
                  label="centred overshoot"
                  value={stats.divergedC ? '∞' : formatValue(stats.overC, 3)}
                  accent={stats.overC > 1e-6 || stats.divergedC ? 'magenta' : 'cyan'}
                />
              </>
            )}
          </ReadoutRow>
        )}
        {view === 'sod' && (
          <ReadoutRow>
            <Readout label="rarefaction head" value={formatValue(sodWaves().rarefactionHead, 3)} accent="iris" />
            <Readout label="contact u*" value={formatValue(sodWaves().contact, 3)} accent="cyan" />
            <Readout label="shock" value={formatValue(sodWaves().shock, 3)} accent="magenta" />
            <Readout label="p*" value={formatValue(sodWaves().star.p, 3)} accent="ok" />
          </ReadoutRow>
        )}
      </Panel>
      {caption && (
        <figcaption className="hud-label" style={{ marginTop: 8, lineHeight: 1.6, letterSpacing: '0.06em', textTransform: 'none' }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

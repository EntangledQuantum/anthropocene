import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Panel, Readout, ReadoutRow, Slider, Toggle, useAnimationFrame, usePrefersReducedMotion } from './controls.tsx';
import { ACCENTS, formatValue } from './chart-core.ts';
import {
  addField,
  advectionStep,
  characteristicCells,
  exactAdvection,
  fourDxMode,
  gaussianPulse,
  maxAbs,
  nyquistMode,
  periodicGrid,
  runAdvection,
  runHeat,
  stencilReach,
  stepHeatFtcs,
  type AdvectionScheme,
} from '../../lib/numerics/pde1d.ts';

/* ─────────────────────────────────────────────────────────────────────────
   Coupled views of one 1D field: the pulse, and the CFL triangle.

   Drag ν = c Δt / Δx. The characteristic foot moves in mesh units; the
   stencil triangle does not. When the true path leaves the triangle the
   grid detonates. Upwind below 1 stays bounded and still lies — the pulse
   shortens and widens. Two views, one number.
   ───────────────────────────────────────────────────────────────────────── */

const N = 96;
const C = 1;
const ALPHA = 1;
const LOOKBACK = 6;
const SEED = 1e-4;
const BLOW = 20;
const READOUT_MS = 125;

export type CflEquation = 'advection' | 'heat';

export interface CflLabProps {
  equation?: CflEquation;
  scheme?: AdvectionScheme;
  /** Initial CFL (advection) or diffusion number r (heat). */
  cfl?: number;
  lockEquation?: boolean;
  lockScheme?: boolean;
  height?: number;
  caption?: string;
  autoPlay?: boolean;
}

interface Sim {
  u: number[];
  t: number;
  nSteps: number;
  diverged: boolean;
}

function cssColor(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function initialField(equation: CflEquation, x: number[]): number[] {
  const x0 = equation === 'heat' ? 0.5 : 0.25;
  const sigma = equation === 'heat' ? 0.07 : 0.05;
  const n = x.length;
  return addField(
    addField(gaussianPulse(x, x0, sigma), nyquistMode(n, SEED)),
    fourDxMode(n, SEED),
  );
}

export default function CflLab({
  equation: equation0 = 'advection',
  scheme: scheme0 = 'upwind',
  cfl: cfl0,
  lockEquation = false,
  lockScheme = false,
  height = 220,
  caption,
  autoPlay = true,
}: CflLabProps) {
  const defaultNu = cfl0 ?? (equation0 === 'heat' ? 0.35 : scheme0 === 'ftcs' ? 0.5 : 0.8);
  const [equation, setEquation] = useState<CflEquation>(equation0);
  const [scheme, setScheme] = useState<AdvectionScheme>(scheme0);
  const [nu, setNu] = useState(defaultNu);
  const [running, setRunning] = useState(autoPlay);
  const [stats, setStats] = useState({ t: 0, max: 1, height: 1, steps: 0, diverged: false });

  const reduced = usePrefersReducedMotion();
  const { x, dx } = useMemo(() => periodicGrid(N), []);

  const wrapRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLCanvasElement>(null);
  const triRef = useRef<HTMLCanvasElement>(null);
  const fieldSize = useRef({ w: 480, h: height });
  const triSize = useRef({ w: 260, h: height });

  const simRef = useRef<Sim | null>(null);
  const equationRef = useRef(equation);
  const schemeRef = useRef(scheme);
  const nuRef = useRef(nu);
  const runningRef = useRef(running);
  const lastReadout = useRef(0);

  useEffect(() => { equationRef.current = equation; }, [equation]);
  useEffect(() => { schemeRef.current = scheme; }, [scheme]);
  useEffect(() => { nuRef.current = nu; }, [nu]);
  useEffect(() => { runningRef.current = running; }, [running]);

  const seed = useCallback(() => {
    const u0 = initialField(equationRef.current, x);
    simRef.current = { u: u0.slice(), t: 0, nSteps: 0, diverged: false };
    lastReadout.current = 0;
    setStats({ t: 0, max: maxAbs(u0), height: Math.max(...u0), steps: 0, diverged: false });
  }, [x]);

  useEffect(() => { seed(); }, [seed, equation, scheme, nu]);

  const dtOf = (eq: CflEquation, number: number) =>
    eq === 'heat' ? (number * dx * dx) / ALPHA : (number * dx) / C;

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

    const padL = 44, padR = 12, padT = 16, padB = 28;
    const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
    const plotW = x1 - x0, plotH = y1 - y0;

    const peak = maxAbs(sim.u);
    const yMax = peak < 1.45 && !sim.diverged ? 1.35 : Math.min(8, Math.max(1.6, peak * 1.08));
    const yMin = peak < 1.45 && !sim.diverged ? -0.22 : -0.15 * yMax;
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

    const eq = equationRef.current;
    if (eq === 'advection' && !sim.diverged) {
      const exact = exactAdvection(x, sim.t, C, 0.25, 0.05);
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const px = X(x[i]!);
        const py = Y(exact[i]!);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.strokeStyle = ink;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const color = sim.diverged ? magenta : cyan;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const py = Y(Math.max(yMin, Math.min(yMax, sim.u[i]!)));
      const px = X(x[i]!);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = color;
    const r = 1.7;
    for (let i = 0; i < N; i += 2) {
      ctx.beginPath();
      ctx.arc(X(x[i]!), Y(Math.max(yMin, Math.min(yMax, sim.u[i]!))), r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = ink;
    ctx.font = '12px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
      ctx.fillText(String(tick), X(tick), y1 + 6);
    }
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
    ctx.fillText('u', 0, 0);
    ctx.restore();

    if (sim.diverged) {
      ctx.fillStyle = magenta;
      ctx.font = '600 14px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('exploded', x0 + 10, y0 + 8);
    }
  }, [x, height]);

  const paintTriangle = useCallback(() => {
    const canvas = triRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = triSize.current;
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

    const padL = 36, padR = 12, padT = 28, padB = 32;
    const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
    const plotW = x1 - x0, plotH = y1 - y0;

    const eq = equationRef.current;
    const sch = schemeRef.current;
    const number = nuRef.current;
    const reach = eq === 'heat' ? { left: LOOKBACK, right: LOOKBACK } : stencilReach(sch, LOOKBACK);
    const charCells = eq === 'heat' ? Infinity : characteristicCells(number, LOOKBACK);
    const xMin = -LOOKBACK * 1.7;
    const xMax = LOOKBACK * 0.55;
    const Xc = (cells: number) => x0 + ((cells - xMin) / (xMax - xMin)) * plotW;
    const Yt = (step: number) => y1 - (step / LOOKBACK) * plotH;

    ctx.strokeStyle = rule;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW, plotH);

    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(x0, Yt(0));
    ctx.lineTo(x1, Yt(0));
    ctx.moveTo(Xc(0), y0);
    ctx.lineTo(Xc(0), y1);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const apexX = Xc(0);
    const apexY = Yt(LOOKBACK);
    const leftX = Xc(-reach.left);
    const rightX = Xc(reach.right);
    const baseY = Yt(0);

    ctx.beginPath();
    ctx.moveTo(apexX, apexY);
    ctx.lineTo(leftX, baseY);
    ctx.lineTo(rightX, baseY);
    ctx.closePath();
    ctx.fillStyle = cyan;
    ctx.globalAlpha = 0.18;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = cyan;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    if (eq === 'heat') {
      ctx.fillStyle = magenta;
      ctx.globalAlpha = 0.1;
      ctx.fillRect(x0, y0, plotW, plotH);
      ctx.globalAlpha = 1;
    } else {
      const foot = -charCells;
      const inside = charCells <= reach.left + 1e-9;
      ctx.beginPath();
      ctx.moveTo(apexX, apexY);
      ctx.lineTo(Xc(foot), baseY);
      ctx.strokeStyle = inside ? aqua : magenta;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = inside ? aqua : magenta;
      ctx.beginPath();
      ctx.arc(Xc(foot), baseY, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = ink;
    ctx.font = '11px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('x (cells)', (x0 + x1) / 2, y1 + 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('now', x0 - 6, apexY);
    ctx.fillText('past', x0 - 6, baseY);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = cyan;
    ctx.fillText('stencil', x0 + 8, y0 + 6);
    ctx.fillStyle = eq === 'heat' ? magenta : (charCells <= reach.left ? aqua : magenta);
    ctx.fillText(eq === 'heat' ? 'true domain: the whole line' : 'true path', x0 + 8, y0 + 20);
  }, []);

  const paintFieldRef = useRef(paintField);
  const paintTriangleRef = useRef(paintTriangle);
  useEffect(() => { paintFieldRef.current = paintField; }, [paintField]);
  useEffect(() => { paintTriangleRef.current = paintTriangle; }, [paintTriangle]);

  const paint = useCallback(() => {
    paintFieldRef.current();
    paintTriangleRef.current();
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const field = wrap.querySelector('[data-pane="field"]') as HTMLElement | null;
    const tri = wrap.querySelector('[data-pane="tri"]') as HTMLElement | null;
    const ro = new ResizeObserver(() => {
      if (field) fieldSize.current = { w: field.clientWidth || 480, h: field.clientHeight || height };
      if (tri) triSize.current = { w: tri.clientWidth || 260, h: tri.clientHeight || height };
      paint();
    });
    if (field) ro.observe(field);
    if (tri) ro.observe(tri);
    paint();
    return () => ro.disconnect();
  }, [height, paint]);

  const pushReadout = (sim: Sim) => {
    const now = performance.now();
    if (now - lastReadout.current < READOUT_MS && !sim.diverged) return;
    lastReadout.current = now;
    const m = maxAbs(sim.u);
    setStats({
      t: sim.t,
      max: m,
      height: sim.diverged ? Infinity : Math.max(...sim.u),
      steps: sim.nSteps,
      diverged: sim.diverged,
    });
  };

  const stepSim = useCallback((wallDt: number) => {
    const sim = simRef.current;
    if (!sim || sim.diverged) return;
    const eq = equationRef.current;
    const sch = schemeRef.current;
    const number = nuRef.current;
    const dt = dtOf(eq, number);
    const target = eq === 'heat' ? 0.012 * wallDt : 0.28 * wallDt;
    const steps = Math.max(1, Math.min(48, Math.ceil(target / dt)));
    for (let s = 0; s < steps; s++) {
      const next = eq === 'heat' ? stepHeatFtcs(sim.u, number) : advectionStep(sch, sim.u, number);
      const m = maxAbs(next);
      if (!Number.isFinite(m) || m > BLOW) {
        sim.diverged = true;
        break;
      }
      sim.u = next;
      sim.t += dt;
      sim.nSteps += 1;
    }
    paint();
    pushReadout(sim);
    if (sim.diverged) {
      runningRef.current = false;
      setRunning(false);
    }
  }, [dx, paint]);

  useAnimationFrame(running && !reduced, stepSim);

  useEffect(() => {
    if (!reduced) return;
    const eq = equation;
    if (eq === 'heat') {
      const snap = runHeat({ r: nu, n: N, nSteps: 160, nyquist: SEED, sigma: 0.07, x0: 0.5 });
      simRef.current = { u: snap.u, t: snap.t, nSteps: snap.nSteps, diverged: snap.diverged };
      setStats({ t: snap.t, max: snap.maxAbs, height: snap.height, steps: snap.nSteps, diverged: snap.diverged });
    } else {
      const snap = runAdvection({
        scheme, cfl: nu, n: N, tEnd: 0.55, nyquist: SEED, fourDx: SEED, x0: 0.25, sigma: 0.05,
      });
      simRef.current = { u: snap.u, t: snap.t, nSteps: snap.nSteps, diverged: snap.diverged };
      setStats({ t: snap.t, max: snap.maxAbs, height: snap.height, steps: snap.nSteps, diverged: snap.diverged });
    }
    setRunning(false);
    requestAnimationFrame(() => paint());
  }, [reduced, equation, scheme, nu, paint]);

  useEffect(() => { paint(); }, [nu, equation, scheme, paint, stats.diverged]);

  const numberLabel = equation === 'heat' ? 'r' : 'CFL';
  const inside = equation === 'heat'
    ? nu <= 0.5
    : characteristicCells(nu, LOOKBACK) <= stencilReach(scheme, LOOKBACK).left + 1e-9;

  const sliderSpec = equation === 'heat'
    ? { key: 'r', label: 'diffusion number', symbol: 'r = α Δt / Δx²', min: 0.15, max: 0.85, step: 0.01, value: nu,
        hint: 'Heat FTCS is stable only for r ≤ 1/2. The checkerboard mode sets the bound.' }
    : { key: 'cfl', label: 'CFL number', symbol: 'ν = c Δt / Δx', min: 0.15, max: 1.7, step: 0.01, value: nu,
        hint: 'How many mesh cells the signal crosses in one step. Past 1 the true path leaves the stencil.' };

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title={equation === 'heat' ? 'heat · FTCS' : `advection · ${scheme === 'upwind' ? 'upwind' : 'FTCS'}`}
        right={
          <span className="hud-label" style={{ color: stats.diverged ? 'var(--sig-warn)' : inside ? 'var(--sig-ok)' : 'var(--sig-warn)' }}>
            {stats.diverged ? 'exploded' : equation === 'heat' ? (inside ? 'r ≤ ½' : 'r > ½') : (inside ? 'inside the triangle' : 'outside the triangle')}
          </span>
        }
      >
        <div
          ref={wrapRef}
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(180px,1fr)', gap: 10, alignItems: 'stretch' }}
        >
          <div data-pane="field" style={{ height, minWidth: 0 }}>
            <canvas ref={fieldRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
          <div data-pane="tri" style={{ height, minWidth: 0 }}>
            <canvas ref={triRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) auto', gap: 12, alignItems: 'end' }}>
          <Slider spec={sliderSpec} value={nu} onChange={(v) => { setNu(v); setRunning(autoPlay && !reduced); }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {!lockEquation && (
              <Toggle
                options={[
                  { key: 'advection', label: 'advection', accent: 'cyan' },
                  { key: 'heat', label: 'heat', accent: 'iris' },
                ]}
                value={[equation]}
                onChange={(next) => {
                  const eq = (next[0] as CflEquation) ?? 'advection';
                  setEquation(eq);
                  setNu(eq === 'heat' ? 0.35 : 0.8);
                  setRunning(autoPlay && !reduced);
                }}
              />
            )}
            {!lockScheme && equation === 'advection' && (
              <Toggle
                options={[
                  { key: 'ftcs', label: 'FTCS', accent: 'magenta' },
                  { key: 'upwind', label: 'upwind', accent: 'cyan' },
                ]}
                value={[scheme]}
                onChange={(next) => {
                  setScheme((next[0] as AdvectionScheme) ?? 'upwind');
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
          <Readout label={numberLabel} value={formatValue(nu, 3)} accent={inside && !stats.diverged ? 'cyan' : 'warn'} />
          <Readout label="t" value={formatValue(stats.t, 3)} />
          <Readout
            label="‖u‖∞"
            value={stats.diverged || !Number.isFinite(stats.max) ? '∞' : formatValue(stats.max, 3)}
            accent={stats.diverged || stats.max > 1.4 ? 'magenta' : 'ink'}
          />
          <Readout
            label="peak"
            value={!Number.isFinite(stats.height) ? '—' : formatValue(stats.height, 3)}
            accent="iris"
          />
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

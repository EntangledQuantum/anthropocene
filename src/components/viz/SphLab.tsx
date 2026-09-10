import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Panel, Readout, ReadoutRow, Slider, Toggle, useAnimationFrame, usePrefersReducedMotion } from './controls.tsx';
import { ACCENTS, formatValue } from './chart-core.ts';
import {
  createColumn1d,
  createDam2d,
  createLattice1d,
  createTensile1d,
  cubicW1d,
  interiorIndex,
  maxAbsVel1d,
  maxAbsVel2d,
  meanDensityFluid,
  minSpacing1d,
  reconstructDensity1d,
  step1d,
  step2d,
  surfaceIndex,
  totalMass1d,
  totalMass2d,
  type Sph1d,
  type Sph2d,
} from '../../lib/numerics/sph.ts';

/* ─────────────────────────────────────────────────────────────────────────
   Four views of one method. Density is always Σ m W. The kernel that
   estimates it is the same kernel whose second derivative clumps under
   tension. A grid cannot tangle because there is no grid.
   ───────────────────────────────────────────────────────────────────────── */

const READOUT_MS = 125;

export type SphMode = 'kernel' | 'hydrostatic' | 'dambreak' | 'tensile';

export interface SphLabProps {
  mode?: SphMode;
  lockMode?: boolean;
  height?: number;
  caption?: string;
  autoPlay?: boolean;
}

interface Stats {
  t: number;
  steps: number;
  rho: number;
  rhoTrack: number;
  vmin: number;
  vmax: number;
  mass: number;
}

function cssColor(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function parseRgb(c: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(c);
  if (rgb) return [+rgb[1]!, +rgb[2]!, +rgb[3]!];
  return null;
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseRgb(a);
  const pb = parseRgb(b);
  if (!pa || !pb) return a;
  const u = Math.min(1, Math.max(0, t));
  const ch = (i: number) => Math.round(pa[i]! + (pb[i]! - pa[i]!) * u);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

function densityTint(ratio: number, cyan: string, magenta: string, iris: string): string {
  if (ratio >= 1) return mixHex(cyan, magenta, Math.min(1, (ratio - 1) / 0.55));
  return mixHex(cyan, iris, Math.min(1, (1 - ratio) / 0.4));
}

type Sim =
  | { dim: 1; s: Sph1d }
  | { dim: 2; s: Sph2d };

function seedOf(mode: SphMode, eta: number): Sim {
  if (mode === 'dambreak') return { dim: 2, s: createDam2d() };
  if (mode === 'hydrostatic') return { dim: 1, s: createColumn1d({ nFluid: 18, nDummy: 4, eta: 1.2, alpha: 0.45 }) };
  if (mode === 'tensile') return { dim: 1, s: createTensile1d() };
  return { dim: 1, s: createLattice1d({ nFluid: 18, dx: 0.08, eta, rho0: 1, g: 0, alpha: 0 }) };
}

function statsOf(sim: Sim, track: number): Stats {
  if (sim.dim === 2) {
    const s = sim.s;
    return {
      t: s.t, steps: s.steps,
      rho: (() => {
        let a = 0, w = 0;
        for (let i = 0; i < s.n; i++) if (!s.dummy[i]) { a += s.rho[i]!; w++; }
        return w ? a / w : 0;
      })(),
      rhoTrack: s.rho[Math.min(track, s.nFluid - 1)]! / s.rho0,
      vmin: 0,
      vmax: maxAbsVel2d(s),
      mass: totalMass2d(s),
    };
  }
  const s = sim.s;
  const i = Math.max(0, Math.min(track, s.n - 1));
  return {
    t: s.t, steps: s.steps,
    rho: meanDensityFluid(s),
    rhoTrack: s.rho[i]! / s.rho0,
    vmin: minSpacing1d(s),
    vmax: maxAbsVel1d(s),
    mass: totalMass1d(s),
  };
}

const ETA_SPEC = {
  key: 'eta', label: 'smoothing length', symbol: 'h/Δx',
  min: 0.45, max: 1.8, step: 0.01, value: 1.2,
};

export default function SphLab({
  mode: mode0 = 'kernel',
  lockMode = false,
  height = 340,
  caption,
  autoPlay,
}: SphLabProps) {
  const reduced = usePrefersReducedMotion();
  const playDefault = autoPlay ?? mode0 !== 'kernel';
  const [mode, setMode] = useState<SphMode>(mode0);
  const [running, setRunning] = useState(false);
  const [eta, setEta] = useState(1.2);
  const [stats, setStats] = useState<Stats>(() => statsOf(seedOf(mode0, 1.2), 8));

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 560, h: height });
  const simRef = useRef<Sim | null>(null);
  const modeRef = useRef(mode);
  const runningRef = useRef(running);
  const etaRef = useRef(eta);
  const lastReadout = useRef(0);
  const trackRef = useRef(8);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { etaRef.current = eta; }, [eta]);

  const seed = useCallback(() => {
    const sim = seedOf(modeRef.current, etaRef.current);
    simRef.current = sim;
    if (sim.dim === 1) {
      trackRef.current = modeRef.current === 'hydrostatic'
        ? interiorIndex(sim.s)
        : Math.floor(sim.s.nFluid / 2);
    } else {
      trackRef.current = Math.floor(sim.s.nFluid / 2);
    }
    lastReadout.current = 0;
    setStats(statsOf(sim, trackRef.current));
  }, []);

  useEffect(() => { seed(); }, [seed, mode, eta]);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = sizeRef.current;
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
    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, w, h);

    if (sim.dim === 2) {
      paintDam(ctx, sim.s, w, h, { rule, ink, cyan, magenta, iris });
      return;
    }
    if (modeRef.current === 'hydrostatic') {
      paintColumn(ctx, sim.s, w, h, trackRef.current, { rule, ink, cyan, magenta, iris });
      return;
    }
    paintLine(ctx, sim.s, w, h, trackRef.current, { rule, ink, cyan, magenta, iris });
  }, []);

  const paintRef = useRef(paint);
  useEffect(() => { paintRef.current = paint; }, [paint]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const pane = wrap.querySelector('[data-pane="sph"]') as HTMLElement | null;
    const ro = new ResizeObserver(() => {
      if (pane) sizeRef.current = { w: pane.clientWidth || 560, h: pane.clientHeight || height };
      paintRef.current();
    });
    if (pane) ro.observe(pane);
    paintRef.current();
    return () => ro.disconnect();
  }, [height]);

  const pushReadout = (sim: Sim) => {
    const now = performance.now();
    if (now - lastReadout.current < READOUT_MS) return;
    lastReadout.current = now;
    setStats(statsOf(sim, trackRef.current));
  };

  const stepSim = useCallback((wallDt: number) => {
    const sim = simRef.current;
    if (!sim) return;
    const heavy = sim.dim === 2;
    const n = Math.max(1, Math.min(heavy ? 4 : 10, Math.round((heavy ? 2.5 : 7) * (wallDt / 0.016))));
    for (let i = 0; i < n; i++) {
      if (sim.dim === 1) step1d(sim.s);
      else step2d(sim.s);
    }
    paintRef.current();
    pushReadout(sim);
  }, []);

  useAnimationFrame(running && !reduced, stepSim);
  useEffect(() => {
    if (playDefault && !reduced && mode !== 'kernel') {
      runningRef.current = true;
      setRunning(true);
    }
  }, [playDefault, reduced, mode]);
  useEffect(() => { paint(); }, [paint, stats.steps, mode, eta]);

  const onStep = () => {
    const sim = simRef.current;
    if (!sim) return;
    setRunning(false);
    if (sim.dim === 1) step1d(sim.s);
    else step2d(sim.s);
    setStats(statsOf(sim, trackRef.current));
    paintRef.current();
  };

  const title =
    mode === 'dambreak' ? 'dam-break'
      : mode === 'hydrostatic' ? 'hydrostatic column'
        : mode === 'tensile' ? 'tensile instability'
          : 'kernel density';

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title={title}
        right={
          <span className="hud-label" style={{ color: 'var(--color-ink-faint)' }}>
            ρᵢ = Σⱼ mⱼ W
          </span>
        }
      >
        <div ref={wrapRef}>
          <div data-pane="sph" style={{ height, minWidth: 0 }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
          {!lockMode && (
            <Toggle
              options={[
                { key: 'kernel', label: 'kernel', accent: 'cyan' },
                { key: 'hydrostatic', label: 'column', accent: 'iris' },
                { key: 'dambreak', label: 'dam-break', accent: 'aqua' },
                { key: 'tensile', label: 'tensile', accent: 'magenta' },
              ]}
              value={[mode]}
              onChange={(next) => {
                const k = (next[0] as SphMode) ?? 'kernel';
                setMode(k);
                modeRef.current = k;
                setRunning(k !== 'kernel' && playDefault && !reduced);
              }}
            />
          )}
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <Button onClick={() => { seed(); setRunning(modeRef.current !== 'kernel'); }} accent="cyan">reset</Button>
            <Button onClick={onStep} accent="iris">step</Button>
            <Button onClick={() => setRunning((r) => !r)} accent="magenta" active={running} disabled={reduced}>
              {running ? 'pause' : 'play'}
            </Button>
          </div>
        </div>

        {mode === 'kernel' && (
          <div style={{ marginTop: 10 }}>
            <Slider spec={ETA_SPEC} value={eta} onChange={(v) => { setEta(v); etaRef.current = v; }} />
          </div>
        )}

        <ReadoutRow>
          <Readout label="t" value={formatValue(stats.t, 3)} />
          <Readout label="ρ / ρ₀" value={formatValue(stats.rhoTrack, 3)} accent="cyan" />
          <Readout label="⟨ρ⟩" value={formatValue(stats.rho, 3)} />
          {mode === 'tensile'
            ? <Readout label="min Δx" value={formatValue(stats.vmin, 3)} accent="magenta" />
            : <Readout label="|v|max" value={formatValue(stats.vmax, 3)} accent="magenta" />}
          <Readout label="mass" value={formatValue(stats.mass, 3)} />
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

type Palette = { rule: string; ink: string; cyan: string; magenta: string; iris: string };

function paintLine(
  ctx: CanvasRenderingContext2D, s: Sph1d, w: number, h: number, track: number, pal: Palette,
) {
  const { rule, ink, cyan, magenta, iris } = pal;
  const padL = 44, padR = 14, padT = 8, padB = 8, gap = 8;
  const innerH = h - padT - padB - gap;
  const hPart = innerH * 0.42;
  const hRho = innerH * 0.58;
  const yPart = padT;
  const yRho = yPart + hPart + gap;
  const x0 = padL, x1 = w - padR, plotW = x1 - x0;
  const L = s.length;
  const X = (x: number) => x0 + (x / L) * plotW;

  ctx.strokeStyle = rule;
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, yPart + 0.5, plotW, hPart);
  ctx.strokeRect(x0 + 0.5, yRho + 0.5, plotW, hRho);

  const iTrack = Math.max(0, Math.min(track, s.n - 1));
  const xT = s.x[iTrack]!;
  const nSamp = 160;
  ctx.beginPath();
  for (let k = 0; k <= nSamp; k++) {
    const x = (k / nSamp) * L;
    const W = cubicW1d(s.periodic ? wrapForPaint(x - xT, L) : x - xT, s.h);
    const amp = hPart * 0.78;
    const y = yPart + hPart - 10 - W * s.h * amp * 1.35;
    k === 0 ? ctx.moveTo(X(x), y) : ctx.lineTo(X(x), y);
  }
  ctx.strokeStyle = cyan;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.globalAlpha = 1;

  const yMid = yPart + hPart * 0.62;
  for (let i = 0; i < s.n; i++) {
    const px = X(s.x[i]!);
    const ratio = s.rho[i]! / s.rho0;
    ctx.beginPath();
    ctx.arc(px, yMid, i === iTrack ? 6.2 : 4.4, 0, Math.PI * 2);
    if (s.dummy[i]) {
      ctx.fillStyle = iris;
      ctx.globalAlpha = 0.35;
    } else {
      ctx.fillStyle = densityTint(ratio, cyan, magenta, iris);
      ctx.globalAlpha = 1;
    }
    ctx.fill();
    ctx.globalAlpha = 1;
    if (i === iTrack) {
      ctx.strokeStyle = ACCENTS.ink;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  let rhoMax = s.rho0 * 1.35;
  for (let i = 0; i < s.n; i++) rhoMax = Math.max(rhoMax, s.rho[i]!);
  const yRho0 = yRho + hRho * 0.82;
  const amp = hRho * 0.7;
  const Yrho = (r: number) => yRho0 - (r / rhoMax) * amp;

  ctx.beginPath();
  ctx.moveTo(x0, Yrho(s.rho0));
  ctx.lineTo(x1, Yrho(s.rho0));
  ctx.strokeStyle = iris;
  ctx.globalAlpha = 0.45;
  ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  ctx.beginPath();
  const nR = 180;
  for (let k = 0; k <= nR; k++) {
    const x = (k / nR) * L;
    const y = Yrho(reconstructDensity1d(s, x));
    k === 0 ? ctx.moveTo(X(x), y) : ctx.lineTo(X(x), y);
  }
  ctx.strokeStyle = cyan;
  ctx.lineWidth = 2;
  ctx.stroke();

  for (let i = 0; i < s.n; i++) {
    if (s.dummy[i]) continue;
    ctx.beginPath();
    ctx.arc(X(s.x[i]!), Yrho(s.rho[i]!), 3.1, 0, Math.PI * 2);
    ctx.fillStyle = densityTint(s.rho[i]! / s.rho0, cyan, magenta, iris);
    ctx.fill();
  }

  ctx.fillStyle = ink;
  ctx.font = '11px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('particles + W', x0 + 6, yPart + 5);
  ctx.fillStyle = cyan;
  ctx.fillText('ρ(x)', x0 + 6, yRho + 5);
  ctx.fillStyle = iris;
  ctx.fillText('ρ₀', x0 + 44, yRho + 5);

  ctx.fillStyle = ink;
  ctx.font = '10px var(--font-mono), ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
    ctx.fillText(String(tick), X(tick * L), yRho + hRho + 2);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('0', x0 - 6, yMid);
  ctx.fillText('ρ₀', x0 - 6, Yrho(s.rho0));
}

function wrapForPaint(d: number, L: number): number {
  let x = d % L;
  if (x > L / 2) x -= L;
  if (x < -L / 2) x += L;
  return x;
}

function paintColumn(
  ctx: CanvasRenderingContext2D, s: Sph1d, w: number, h: number, track: number, pal: Palette,
) {
  const { rule, ink, cyan, magenta, iris } = pal;
  const padL = 48, padR = 16, padT = 16, padB = 28;
  const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
  const plotW = x1 - x0, plotH = y1 - y0;
  ctx.strokeStyle = rule;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW, plotH);

  let xHi = s.length;
  for (let i = 0; i < s.n; i++) xHi = Math.max(xHi, s.x[i]!);
  const Y = (x: number) => y1 - (x / xHi) * plotH;
  const cx = (x0 + x1) / 2;
  const iTrack = Math.max(0, Math.min(track, s.n - 1));
  const iSurf = surfaceIndex(s);

  ctx.beginPath();
  ctx.moveTo(x0, Y(0));
  ctx.lineTo(x1, Y(0));
  ctx.strokeStyle = magenta;
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;

  for (let i = 0; i < s.n; i++) {
    const py = Y(s.x[i]!);
    ctx.beginPath();
    ctx.arc(cx, py, i === iTrack ? 7 : 5.2, 0, Math.PI * 2);
    if (s.dummy[i]) {
      ctx.fillStyle = iris;
      ctx.globalAlpha = 0.4;
      ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.fillStyle = densityTint(s.rho[i]! / s.rho0, cyan, magenta, iris);
    ctx.fill();
    if (i === iSurf) {
      ctx.strokeStyle = ACCENTS.ink;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  ctx.fillStyle = ink;
  ctx.font = '11px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('0', x0 - 6, Y(0));
  ctx.fillText(xHi.toFixed(2), x0 - 6, y0 + 8);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('floor', cx, y1 + 6);
  ctx.textBaseline = 'bottom';
  ctx.fillText('x', cx, h - 2);
}

function paintDam(
  ctx: CanvasRenderingContext2D, s: Sph2d, w: number, h: number, pal: Palette,
) {
  const { rule, ink, cyan, magenta, iris } = pal;
  const padL = 40, padR = 12, padT = 14, padB = 28;
  const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
  const plotW = Math.max(10, x1 - x0), plotH = Math.max(10, y1 - y0);
  ctx.strokeStyle = rule;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW, plotH);

  const X = (x: number) => x0 + (x / s.Lx) * plotW;
  const Y = (y: number) => y1 - (y / s.Ly) * plotH;
  const r = Math.max(2.2, Math.min(plotW, plotH) * 0.014);

  for (let i = 0; i < s.n; i++) {
    if (!s.dummy[i]) continue;
    ctx.beginPath();
    ctx.arc(X(s.x[i]!), Y(s.y[i]!), r * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = iris;
    ctx.globalAlpha = 0.28;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < s.n; i++) {
    if (s.dummy[i]) continue;
    ctx.beginPath();
    ctx.arc(X(s.x[i]!), Y(s.y[i]!), r, 0, Math.PI * 2);
    ctx.fillStyle = densityTint(s.rho[i]! / s.rho0, cyan, magenta, iris);
    ctx.fill();
  }

  ctx.fillStyle = ink;
  ctx.font = '11px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('0', x0, y1 + 6);
  ctx.fillText(s.Lx.toFixed(1), x1, y1 + 6);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('0', x0 - 6, y1);
  ctx.fillText(s.Ly.toFixed(1), x0 - 6, y0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('x', (x0 + x1) / 2, h - 2);
}

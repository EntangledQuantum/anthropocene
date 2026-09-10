import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Panel, Readout, ReadoutRow, Slider, Toggle, useAnimationFrame, usePrefersReducedMotion } from './controls.tsx';
import { ACCENTS, formatValue } from './chart-core.ts';
import {
  aboveOrifice,
  angleOfRepose,
  contactCount,
  createContact,
  createHopper,
  createPile,
  kineticEnergy,
  maxOverlap,
  pairNormalForce,
  pairOverlap,
  staticNormalForce,
  step,
  type Dem,
} from '../../lib/numerics/dem.ts';

/* ─────────────────────────────────────────────────────────────────────────
   Contact is the constitutive law. Three views of one spring–dashpot:

   contact — two discs and F(δ). Overlap is the penalty; force is zero
             until they interpenetrate.
   pile    — a column collapses. μ = 0 pancakes; μ > 0 holds a slope.
   hopper  — same contacts, a silo.
   ───────────────────────────────────────────────────────────────────────── */

const READOUT_MS = 125;

export type DemMode = 'contact' | 'pile' | 'hopper';

export interface DemLabProps {
  mode?: DemMode;
  lockMode?: boolean;
  height?: number;
  caption?: string;
  autoPlay?: boolean;
}

interface Stats {
  t: number;
  steps: number;
  ke: number;
  overlap: number;
  force: number;
  angle: number;
  contacts: number;
  above: number;
}

function cssColor(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function seedOf(mode: DemMode, overlap: number, mu: number): Dem {
  if (mode === 'contact') return createContact(overlap);
  if (mode === 'hopper') return createHopper({ mu, muR: mu > 0.05 ? 0.18 : 0 });
  return createPile({ mu, muR: mu > 0.05 ? 0.25 : 0 });
}

function statsOf(s: Dem, mode: DemMode): Stats {
  return {
    t: s.t,
    steps: s.steps,
    ke: kineticEnergy(s),
    overlap: mode === 'contact' ? pairOverlap(s) : maxOverlap(s),
    force: mode === 'contact' ? pairNormalForce(s) : 0,
    angle: mode === 'contact' ? 0 : angleOfRepose(s),
    contacts: contactCount(s),
    above: mode === 'hopper' ? aboveOrifice(s) : s.n,
  };
}

const OVERLAP_SPEC = {
  key: 'overlap', label: 'overlap', symbol: 'δ',
  min: -0.05, max: 0.06, step: 0.002, value: 0.02,
};

const MU_SPEC = {
  key: 'mu', label: 'friction', symbol: 'μ',
  min: 0, max: 0.9, step: 0.02, value: 0.55,
};

export default function DemLab({
  mode: mode0 = 'contact',
  lockMode = false,
  height = 340,
  caption,
  autoPlay,
}: DemLabProps) {
  const reduced = usePrefersReducedMotion();
  const playDefault = autoPlay ?? mode0 !== 'contact';
  const [mode, setMode] = useState<DemMode>(mode0);
  const [running, setRunning] = useState(false);
  const [overlap, setOverlap] = useState(OVERLAP_SPEC.value);
  const [mu, setMu] = useState(MU_SPEC.value);
  const [stats, setStats] = useState<Stats>(() => statsOf(seedOf(mode0, OVERLAP_SPEC.value, MU_SPEC.value), mode0));

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 560, h: height });
  const simRef = useRef<Dem | null>(null);
  const modeRef = useRef(mode);
  const runningRef = useRef(running);
  const overlapRef = useRef(overlap);
  const muRef = useRef(mu);
  const lastReadout = useRef(0);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { overlapRef.current = overlap; }, [overlap]);
  useEffect(() => { muRef.current = mu; }, [mu]);

  const seed = useCallback(() => {
    const sim = seedOf(modeRef.current, overlapRef.current, muRef.current);
    simRef.current = sim;
    lastReadout.current = 0;
    setStats(statsOf(sim, modeRef.current));
  }, []);

  useEffect(() => { seed(); }, [seed, mode, overlap, mu]);

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
    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, w, h);

    const pal: Palette = {
      rule, ink: ACCENTS.faint, cyan: ACCENTS.cyan,
      magenta: ACCENTS.magenta, iris: ACCENTS.iris, aqua: ACCENTS.aqua,
    };
    if (modeRef.current === 'contact') paintContact(ctx, sim, w, h, pal);
    else paintWorld(ctx, sim, w, h, pal, modeRef.current === 'hopper');
  }, []);

  const paintRef = useRef(paint);
  useEffect(() => { paintRef.current = paint; }, [paint]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const pane = wrap.querySelector('[data-pane="dem"]') as HTMLElement | null;
    const ro = new ResizeObserver(() => {
      if (pane) sizeRef.current = { w: pane.clientWidth || 560, h: pane.clientHeight || height };
      paintRef.current();
    });
    if (pane) ro.observe(pane);
    paintRef.current();
    return () => ro.disconnect();
  }, [height]);

  const pushReadout = (sim: Dem) => {
    const now = performance.now();
    if (now - lastReadout.current < READOUT_MS) return;
    lastReadout.current = now;
    setStats(statsOf(sim, modeRef.current));
  };

  const stepSim = useCallback((wallDt: number) => {
    const sim = simRef.current;
    if (!sim || modeRef.current === 'contact') return;
    const n = Math.max(1, Math.min(8, Math.round(5 * (wallDt / 0.016))));
    for (let i = 0; i < n; i++) step(sim);
    paintRef.current();
    pushReadout(sim);
  }, []);

  useAnimationFrame(running && !reduced, stepSim);
  useEffect(() => {
    if (playDefault && !reduced && mode !== 'contact') {
      runningRef.current = true;
      setRunning(true);
    }
  }, [playDefault, reduced, mode]);
  useEffect(() => { paint(); }, [paint, stats.steps, mode, overlap, mu]);

  const onStep = () => {
    const sim = simRef.current;
    if (!sim || modeRef.current === 'contact') return;
    setRunning(false);
    step(sim);
    setStats(statsOf(sim, modeRef.current));
    paintRef.current();
  };

  const title = mode === 'hopper' ? 'hopper' : mode === 'pile' ? 'pile' : 'contact law';

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title={title}
        right={
          <span className="hud-label" style={{ color: 'var(--color-ink-faint)' }}>
            F<sub>n</sub> = k<sub>n</sub>δ − γ<sub>n</sub>v<sub>n</sub>
          </span>
        }
      >
        <div ref={wrapRef}>
          <div data-pane="dem" style={{ height, minWidth: 0 }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
          {!lockMode && (
            <Toggle
              options={[
                { key: 'contact', label: 'contact', accent: 'cyan' },
                { key: 'pile', label: 'pile', accent: 'magenta' },
                { key: 'hopper', label: 'hopper', accent: 'aqua' },
              ]}
              value={[mode]}
              onChange={(next) => {
                const k = (next[0] as DemMode) ?? 'contact';
                setMode(k);
                modeRef.current = k;
                setRunning(k !== 'contact' && playDefault && !reduced);
              }}
            />
          )}
          {mode !== 'contact' && (
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              <Button onClick={() => { seed(); setRunning(playDefault && !reduced); }} accent="cyan">reset</Button>
              <Button onClick={onStep} accent="iris">step</Button>
              <Button onClick={() => setRunning((r) => !r)} accent="magenta" active={running} disabled={reduced}>
                {running ? 'pause' : 'play'}
              </Button>
            </div>
          )}
        </div>

        {mode === 'contact' && (
          <div style={{ marginTop: 10 }}>
            <Slider spec={OVERLAP_SPEC} value={overlap} onChange={(v) => { setOverlap(v); overlapRef.current = v; }} />
          </div>
        )}
        {mode === 'pile' && (
          <div style={{ marginTop: 10 }}>
            <Slider spec={MU_SPEC} value={mu} onChange={(v) => { setMu(v); muRef.current = v; }} />
          </div>
        )}

        <ReadoutRow>
          {mode === 'contact' ? (
            <>
              <Readout label="δ" value={formatValue(stats.overlap, 3)} accent={stats.overlap > 0 ? 'magenta' : 'ink'} />
              <Readout label="F_n" value={formatValue(stats.force, 2)} accent="cyan" />
              <Readout label="k_n" value={formatValue(simRef.current?.kn ?? 0, 0)} />
              <Readout label="contacts" value={String(stats.contacts)} />
            </>
          ) : (
            <>
              <Readout label="t" value={formatValue(stats.t, 2)} />
              <Readout label="angle" value={`${formatValue(stats.angle, 1)}°`} accent="magenta" />
              <Readout label="max δ" value={formatValue(stats.overlap, 3)} accent="cyan" />
              <Readout label="KE" value={formatValue(stats.ke, 3)} />
              {mode === 'hopper'
                ? <Readout label="above" value={String(stats.above)} />
                : <Readout label="contacts" value={String(stats.contacts)} />}
              <Readout label="steps" value={String(stats.steps)} />
            </>
          )}
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

type Palette = { rule: string; ink: string; cyan: string; magenta: string; iris: string; aqua: string };

function paintContact(
  ctx: CanvasRenderingContext2D, s: Dem, w: number, h: number, pal: Palette,
) {
  const { rule, ink, cyan, magenta, iris } = pal;
  const gap = 10;
  const pad = 12;
  const leftW = Math.max(160, w * 0.52);
  const x0 = pad, y0 = pad, x1 = leftW - gap / 2, y1 = h - 28;
  const plotW = Math.max(10, x1 - x0), plotH = Math.max(10, y1 - y0);

  ctx.strokeStyle = rule;
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW, plotH);

  const xmin = 0.08, xmax = 0.72, ymin = 0.02, ymax = 0.48;
  const X = (x: number) => x0 + ((x - xmin) / (xmax - xmin)) * plotW;
  const Y = (y: number) => y1 - ((y - ymin) / (ymax - ymin)) * plotH;
  const S = plotW / (xmax - xmin);

  const delta = pairOverlap(s);
  for (let i = 0; i < s.n; i++) {
    const cx = X(s.x[i]!), cy = Y(s.y[i]!), rr = s.r[i]! * S;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fillStyle = delta > 0 ? cyan : iris;
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = i === 0 ? cyan : magenta;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  if (delta > 0) {
    const mx = X(0.5 * (s.x[0]! + s.x[1]!));
    const my = Y(0.5 * (s.y[0]! + s.y[1]!));
    ctx.beginPath();
    ctx.arc(mx, my, Math.max(3, 0.35 * delta * S), 0, Math.PI * 2);
    ctx.fillStyle = magenta;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    const Fn = pairNormalForce(s);
    const scale = 0.04 + 0.14 * Math.min(1, Fn / Math.max(s.kn * 0.05, 1e-9));
    ctx.strokeStyle = magenta;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(s.x[0]!), Y(s.y[0]!));
    ctx.lineTo(X(s.x[0]! - scale), Y(s.y[0]!));
    ctx.moveTo(X(s.x[1]!), Y(s.y[1]!));
    ctx.lineTo(X(s.x[1]! + scale), Y(s.y[1]!));
    ctx.stroke();
  }

  ctx.fillStyle = ink;
  ctx.font = '11px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('discs', (x0 + x1) / 2, y1 + 8);

  const px0 = leftW + gap / 2, px1 = w - pad;
  const pW = Math.max(10, px1 - px0);
  ctx.strokeStyle = rule;
  ctx.strokeRect(px0 + 0.5, y0 + 0.5, pW, plotH);

  const dMin = -0.05, dMax = 0.06, fMin = -4, fMax = s.kn * 0.06 * 1.15;
  const PX = (d: number) => px0 + ((d - dMin) / (dMax - dMin)) * pW;
  const PY = (f: number) => y1 - ((f - fMin) / (fMax - fMin)) * plotH;

  ctx.beginPath();
  ctx.moveTo(PX(0), y0);
  ctx.lineTo(PX(0), y1);
  ctx.moveTo(px0, PY(0));
  ctx.lineTo(px1, PY(0));
  ctx.strokeStyle = iris;
  ctx.globalAlpha = 0.45;
  ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  ctx.beginPath();
  const nSamp = 80;
  for (let k = 0; k <= nSamp; k++) {
    const d = dMin + (k / nSamp) * (dMax - dMin);
    const f = staticNormalForce(d, s.kn);
    k === 0 ? ctx.moveTo(PX(d), PY(f)) : ctx.lineTo(PX(d), PY(f));
  }
  ctx.strokeStyle = cyan;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  const fNow = staticNormalForce(delta, s.kn);
  ctx.beginPath();
  ctx.arc(PX(delta), PY(fNow), 5.5, 0, Math.PI * 2);
  ctx.fillStyle = magenta;
  ctx.fill();

  ctx.fillStyle = ink;
  ctx.font = '10px var(--font-mono), ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('0', PX(0), y1 + 4);
  ctx.fillText(dMax.toFixed(2), PX(dMax) - 8, y1 + 4);
  ctx.fillText('δ', (px0 + px1) / 2, y1 + 14);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('0', px0 - 4, PY(0));
  ctx.fillStyle = cyan;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('F_n', px0 + 6, y0 + 5);
}

function paintWorld(
  ctx: CanvasRenderingContext2D, s: Dem, w: number, h: number, pal: Palette, hopper: boolean,
) {
  const { rule, ink, cyan, magenta, iris, aqua } = pal;
  const padL = 40, padR = 12, padT = 12, padB = 28;
  const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
  const plotW = Math.max(10, x1 - x0), plotH = Math.max(10, y1 - y0);
  ctx.strokeStyle = rule;
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW, plotH);

  const X = (x: number) => x0 + (x / s.width) * plotW;
  const Y = (y: number) => y1 - (y / s.height) * plotH;
  const S = Math.min(plotW / s.width, plotH / s.height);

  ctx.strokeStyle = iris;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 2;
  for (const wall of s.walls) {
    ctx.beginPath();
    ctx.moveTo(X(wall.x0), Y(wall.y0));
    ctx.lineTo(X(wall.x1), Y(wall.y1));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  let vmax = 1e-6;
  for (let i = 0; i < s.n; i++) vmax = Math.max(vmax, Math.hypot(s.vx[i]!, s.vy[i]!));

  for (let i = 0; i < s.n; i++) {
    const cx = X(s.x[i]!), cy = Y(s.y[i]!);
    const rr = Math.max(2.4, s.r[i]! * S);
    const speed = Math.hypot(s.vx[i]!, s.vy[i]!) / vmax;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fillStyle = speed > 0.25 ? magenta : cyan;
    ctx.globalAlpha = 0.28 + 0.55 * Math.min(1, speed * 2 + 0.35);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = speed > 0.25 ? magenta : cyan;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + rr * Math.cos(-s.theta[i]!), cy + rr * Math.sin(-s.theta[i]!));
    ctx.strokeStyle = ACCENTS.ink;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (!hopper && s.n > 4) {
    let peak = 0;
    for (let i = 1; i < s.n; i++) if (s.y[i]! > s.y[peak]!) peak = i;
    let left = peak, right = peak;
    for (let i = 0; i < s.n; i++) {
      if (s.y[i]! > 1.4 * s.r[i]!) continue;
      if (s.x[i]! < s.x[left]!) left = i;
      if (s.x[i]! > s.x[right]!) right = i;
    }
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = magenta;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(X(s.x[left]!), Y(s.y[left]!));
    ctx.lineTo(X(s.x[peak]!), Y(s.y[peak]! + s.r[peak]!));
    ctx.lineTo(X(s.x[right]!), Y(s.y[right]!));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = ink;
  ctx.font = '11px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('0', x0, y1 + 6);
  ctx.fillText(s.width.toFixed(1), x1, y1 + 6);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('0', x0 - 6, y1);
  ctx.fillText(s.height.toFixed(1), x0 - 6, y0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('x', (x0 + x1) / 2, h - 2);
  ctx.fillStyle = hopper ? aqua : magenta;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(hopper ? 'hopper' : 'pile', x0 + 6, y0 + 5);
}

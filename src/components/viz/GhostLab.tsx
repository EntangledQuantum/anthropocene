import { useEffect, useMemo, useRef, useState } from 'react';
import Plot from './Plot.tsx';
import { Panel, Readout, ReadoutRow, Slider, Toggle } from './controls.tsx';
import { ACCENTS, formatValue, type Series } from './chart-core.ts';
import {
  EXP, errorSweep, leftData, maxAbsError, observedOrder, solvePoisson,
  type BcKind, type WallMethod,
} from '../../lib/numerics/stencil-bc.ts';

export interface GhostLabProps {
  bc?: BcKind;
  method?: WallMethod;
  n?: number;
  lockBc?: boolean;
  lockMethod?: boolean;
  view?: 'field' | 'order';
  height?: number;
  caption?: string;
}

const SWEEP_N = [8, 12, 16, 24, 32, 48, 64];

function cssColor(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * Coupled wall: the 3-point stencil cartoon, and the field (or the log-log
 * error) it actually produces. Dirichlet vs Neumann changes how the missing
 * neighbour is filled; naive vs ghost changes whether the interior stencil
 * is allowed to stay.
 */
export default function GhostLab({
  bc: bc0 = 'neumann',
  method: method0 = 'naive',
  n: n0 = 12,
  lockBc = false,
  lockMethod = false,
  view: view0 = 'field',
  height = 240,
  caption,
}: GhostLabProps) {
  const [bc, setBc] = useState<BcKind>(bc0);
  const [method, setMethod] = useState<WallMethod>(method0);
  const [n, setN] = useState(n0);
  const [view, setView] = useState<'field' | 'order'>(view0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cartoonW, setCartoonW] = useState(320);

  const leftValue = leftData(bc);
  const run = useMemo(
    () => solvePoisson({
      n, left: bc, method, leftValue, rightValue: EXP.u(1), f: EXP.d2,
    }),
    [n, bc, method, leftValue],
  );
  const err = useMemo(() => maxAbsError(run.u, run.x, EXP.u), [run]);
  const order = useMemo(() => {
    if (bc === 'dirichlet' && method === 'naive') return 0;
    return observedOrder(n, bc, method);
  }, [n, bc, method]);

  const sweep = useMemo(() => {
    const ghost = errorSweep(SWEEP_N, bc, 'ghost');
    const naive = errorSweep(SWEEP_N, bc, 'naive');
    return { ghost, naive };
  }, [bc]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const pane = el.querySelector('[data-pane="cartoon"]') as HTMLElement | null;
    const ro = new ResizeObserver(() => {
      setCartoonW(pane?.clientWidth || el.clientWidth || 320);
    });
    if (pane) ro.observe(pane);
    else ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = cartoonW;
    const h = height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const abyss = cssColor(canvas, '--color-abyss', '#0c0a15');
    const rule = cssColor(canvas, '--color-rule', '#2a2340');
    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, w, h);

    const padL = 28, padR = 16, padT = 36, padB = 42;
    const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
    const plotW = Math.max(10, x1 - x0);
    const midY = (y0 + y1) / 2 + 8;

    // Zoom on the left wall: show x ∈ [−1.6 h, 4.4 h].
    const xMin = -1.6 * run.h;
    const xMax = 4.4 * run.h;
    const X = (x: number) => x0 + ((x - xMin) / (xMax - xMin)) * plotW;

    ctx.strokeStyle = rule;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW, y1 - y0);

    // Domain fill [0, xMax].
    ctx.fillStyle = ACCENTS.cyan;
    ctx.globalAlpha = 0.06;
    ctx.fillRect(X(0), y0, x1 - X(0), y1 - y0);
    ctx.globalAlpha = 1;

    // Wall.
    ctx.strokeStyle = ACCENTS.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(0), y0 + 8);
    ctx.lineTo(X(0), y1 - 8);
    ctx.stroke();

    const nodes: { x: number; i: number; ghost?: boolean }[] = [];
    if (bc === 'neumann' && method === 'ghost') nodes.push({ x: -run.h, i: -1, ghost: true });
    for (let i = 0; i <= 4; i++) nodes.push({ x: i * run.h, i });

    const stencil = stencilNodes(bc, method);
    const active = new Set(stencil);

    // Stencil arms.
    const ys = midY;
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = method === 'ghost' ? ACCENTS.cyan : ACCENTS.magenta;
    ctx.beginPath();
    let started = false;
    for (const node of nodes) {
      if (!active.has(node.i)) continue;
      const px = X(node.x);
      if (!started) { ctx.moveTo(px, ys); started = true; }
      else ctx.lineTo(px, ys);
    }
    ctx.stroke();

    const weights = stencilWeights(bc, method);
    for (const node of nodes) {
      const px = X(node.x);
      const isGhost = Boolean(node.ghost);
      const skipped = bc === 'dirichlet' && method === 'naive' && node.i === 0;
      const on = active.has(node.i) && !skipped;
      const r = isGhost ? 7 : 6;

      if (isGhost || skipped) {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = ACCENTS.magenta;
        ctx.fillStyle = abyss;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, ys, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.beginPath();
        ctx.arc(px, ys, r, 0, Math.PI * 2);
        ctx.fillStyle = on
          ? (node.i === 0 && bc === 'dirichlet' ? ACCENTS.aqua : ACCENTS.cyan)
          : ACCENTS.faint;
        ctx.globalAlpha = on ? 1 : 0.35;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = isGhost ? ACCENTS.magenta : ACCENTS.ink;
      ctx.font = '11px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const label = isGhost ? 'ghost' : node.i === 0 ? 'wall' : `i=${node.i}`;
      ctx.fillText(label, px, ys + r + 6);

      const wgt = weights[node.i];
      if (wgt !== undefined) {
        ctx.fillStyle = ACCENTS.ink;
        ctx.font = '600 12px var(--font-mono), ui-monospace, monospace';
        ctx.textBaseline = 'bottom';
        ctx.fillText(wgt, px, ys - r - 6);
      }
    }

    ctx.fillStyle = ACCENTS.faint;
    ctx.font = '11px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('x', (x0 + x1) / 2, y1 + 8);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = method === 'ghost' ? ACCENTS.cyan : ACCENTS.magenta;
    ctx.font = '12px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(captionFor(bc, method), x0 + 8, y0 + 8);
  }, [cartoonW, height, run, bc, method]);

  const fieldSeries: Series[] = useMemo(() => [
    {
      key: 'exact', label: 'eˣ', color: 'ink', dash: [4, 3], width: 1.25,
      points: Array.from({ length: 80 }, (_, i) => {
        const x = i / 79;
        return [x, EXP.u(x)] as const;
      }),
    },
    {
      key: 'solve', label: method === 'ghost' ? 'ghost' : 'naive',
      color: method === 'ghost' ? 'cyan' : 'magenta',
      style: 'line+dots', width: 2,
      points: run.x.map((x, i) => [x, run.u[i]!] as const),
    },
  ], [run, method]);

  const orderSeries: Series[] = useMemo(() => {
    const toLog = (pts: { h: number; error: number }[]) =>
      pts
        .filter((p) => p.error > 0)
        .map((p) => [Math.log10(p.h), Math.log10(p.error)] as const);
    return [
      {
        key: 'naive', label: 'naive', color: 'magenta',
        points: toLog(sweep.naive),
      },
      {
        key: 'ghost', label: 'ghost', color: 'cyan',
        points: toLog(sweep.ghost),
      },
    ];
  }, [sweep]);

  const orderReadout = bc === 'dirichlet' && method === 'naive'
    ? 'none'
    : formatValue(order, 2);

  const ghostLabel = run.ghost === null
    ? 'none'
    : formatValue(run.ghost, 3);

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title="the missing neighbour"
        right={
          <span className="hud-label" style={{ color: method === 'ghost' ? 'var(--sig-ok)' : 'var(--sig-warn)' }}>
            {method === 'ghost' ? 'interior stencil stays' : 'wall is a different animal'}
          </span>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {!lockBc && (
            <Toggle
              options={[
                { key: 'dirichlet', label: 'Dirichlet', accent: 'aqua' },
                { key: 'neumann', label: 'Neumann', accent: 'iris' },
              ]}
              value={[bc]}
              onChange={(next) => setBc((next[0] as BcKind) ?? 'neumann')}
            />
          )}
          {!lockMethod && (
            <Toggle
              options={[
                { key: 'naive', label: 'naive', accent: 'magenta' },
                { key: 'ghost', label: 'ghost', accent: 'cyan' },
              ]}
              value={[method]}
              onChange={(next) => setMethod((next[0] as WallMethod) ?? 'naive')}
            />
          )}
          <Toggle
            options={[
              { key: 'field', label: 'field', accent: 'cyan' },
              { key: 'order', label: 'order', accent: 'orchid' },
            ]}
            value={[view]}
            onChange={(next) => setView((next[0] as 'field' | 'order') ?? 'field')}
          />
        </div>

        <div
          ref={wrapRef}
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,1fr)', gap: 10, alignItems: 'stretch' }}
        >
          <div data-pane="cartoon" style={{ height, minWidth: 0 }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            {view === 'field' ? (
              <Plot
                series={fieldSeries}
                x={{ label: 'x', domain: [0, 1] }}
                y={{ label: 'u', domain: [0, 3.1] }}
                height={height}
                legend
              />
            ) : (
              <Plot
                series={orderSeries}
                x={{ label: 'log₁₀ h' }}
                y={{ label: 'log₁₀ |error|' }}
                height={height}
                legend
              />
            )}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <Slider
            spec={{ key: 'n', label: 'intervals', symbol: 'n', min: 8, max: 48, step: 1, value: n }}
            value={n}
            onChange={setN}
          />
        </div>

        <ReadoutRow>
          <Readout label="n" value={String(n)} accent="cyan" />
          <Readout label="h" value={formatValue(run.h, 3)} />
          <Readout label="max |error|" value={formatValue(err, 3)} accent={method === 'ghost' ? 'ok' : 'warn'} />
          <Readout label="observed order" value={orderReadout} accent={order > 1.6 ? 'ok' : 'warn'} />
          <Readout label="ghost u₋₁" value={ghostLabel} accent={run.ghost === null ? 'warn' : 'magenta'} />
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

function stencilNodes(bc: BcKind, method: WallMethod): number[] {
  if (bc === 'neumann' && method === 'naive') return [0, 1];
  if (bc === 'neumann' && method === 'ghost') return [-1, 0, 1];
  return [0, 1, 2];
}

function stencilWeights(bc: BcKind, method: WallMethod): Record<number, string> {
  if (bc === 'neumann' && method === 'naive') return { 0: '−1', 1: '+1' };
  if (bc === 'neumann' && method === 'ghost') return { [-1]: '+1', 0: '−2', 1: '+1' };
  return { 0: '+1', 1: '−2', 2: '+1' };
}

function captionFor(bc: BcKind, method: WallMethod): string {
  if (bc === 'neumann' && method === 'naive') return 'one-sided (u₁ − u₀)/h = σ';
  if (bc === 'neumann' && method === 'ghost') return 'centred stencil at the wall';
  if (bc === 'dirichlet' && method === 'naive') return 'wall neighbour skipped (set to 0)';
  return 'wall value is the missing neighbour';
}

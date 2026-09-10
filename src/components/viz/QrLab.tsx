import { useEffect, useMemo, useRef, useState } from 'react';
import { Panel, Readout, ReadoutRow, Slider, Toggle } from './controls.tsx';
import { ACCENTS, formatValue } from './chart-core.ts';
import {
  cond2,
  cond2Gram,
  gram,
  house,
  householderQR,
  nearParallelPair,
  pairCond2Exact,
  reflect,
  spanCoords,
} from '../../lib/numerics/qr.ts';

export type QrLabView = 'columns' | 'reflector';

export interface QrLabProps {
  eps?: number;
  view?: QrLabView;
  lockView?: boolean;
  caption?: string;
  height?: number;
}

const cssColor = (el: Element | null, name: string, fallback: string): string => {
  if (!el) return fallback;
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
};

const withAlpha = (hex: string, a: number): string => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const fmtEntry = (x: number): string => {
  if (!Number.isFinite(x)) return '∞';
  if (x === 0) return '0';
  if (x === 1) return '1';
  if (x === -1) return '−1';
  const abs = Math.abs(x);
  if (abs >= 1e-3 && abs < 1e4) return x.toPrecision(6);
  return x.toExponential(3);
};

const fmtKappa = (k: number): string =>
  !Number.isFinite(k) ? '∞' : formatValue(k, 3);

function Mat2({
  title, entries, warn,
}: {
  title: string;
  entries: number[][];
  warn?: boolean;
}) {
  const color = warn ? 'var(--color-warn)' : 'var(--color-ink)';
  return (
    <div>
      <span className="hud-label" style={{ color: warn ? 'var(--color-warn)' : 'var(--color-cyan)', display: 'block', marginBottom: 6 }}>
        {title}
      </span>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto auto',
          gap: '4px 14px',
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color,
          lineHeight: 1.45,
        }}
      >
        <span>{fmtEntry(entries[0]![0]!)}</span>
        <span>{fmtEntry(entries[0]![1]!)}</span>
        <span>{fmtEntry(entries[1]![0]!)}</span>
        <span>{fmtEntry(entries[1]![1]!)}</span>
      </div>
    </div>
  );
}

function arrow(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,
  color: string, width = 2.25,
) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  if (len < 8) return;
  const ux = dx / len;
  const uy = dy / len;
  const ah = 9;
  const aw = 4.5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * ah - uy * aw, y1 - uy * ah + ux * aw);
  ctx.lineTo(x1 - ux * ah + uy * aw, y1 - uy * ah - ux * aw);
  ctx.closePath();
  ctx.fill();
}

/**
 * Coupled views of one 3×2 pair: the two columns in their span, and the 2×2
 * that each algorithm actually computes (AᵀA versus Householder R). One ε.
 */
export default function QrLab({
  eps: eps0 = 0.12,
  view: view0 = 'columns',
  lockView = false,
  caption,
  height = 240,
}: QrLabProps) {
  const [eps, setEps] = useState(eps0);
  const [view, setView] = useState<QrLabView>(view0);
  const [width, setWidth] = useState(320);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const snap = useMemo(() => {
    const A = nearParallelPair(eps);
    const G = gram(A);
    const { R } = householderQR(A);
    const span = spanCoords(eps);
    const kA = cond2(A);
    const kG = cond2Gram(G);
    const lost = G[0]![0] === 1 && eps !== 0;
    const a1 = [1, eps, 0];
    const v = house(a1);
    const Fa1 = reflect(v, a1);
    return { G, R, span, kA, kG, lost, a1, v, Fa1 };
  }, [eps]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(160, width);
    const h = height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const faint = cssColor(wrap, '--color-ink-faint', ACCENTS.faint);
    const rule = cssColor(wrap, '--color-rule', ACCENTS.faint);
    const cyan = ACCENTS.cyan;
    const magenta = ACCENTS.magenta;
    const iris = ACCENTS.iris;

    ctx.clearRect(0, 0, w, h);

    const pad = { top: 18, right: 16, bottom: 32, left: 40 };
    const innerW = w - pad.left - pad.right;
    const innerH = h - pad.top - pad.bottom;

    const domain = view === 'columns'
      ? { x0: -0.15, x1: 1.45, y0: -0.2, y1: 1.15 }
      : { x0: -1.55, x1: 1.55, y0: -0.85, y1: 0.85 };

    const sx = (x: number) => pad.left + ((x - domain.x0) / (domain.x1 - domain.x0)) * innerW;
    const sy = (y: number) => pad.top + innerH - ((y - domain.y0) / (domain.y1 - domain.y0)) * innerH;

    // axes
    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx(domain.x0), sy(0));
    ctx.lineTo(sx(domain.x1), sy(0));
    ctx.moveTo(sx(0), sy(domain.y0));
    ctx.lineTo(sx(0), sy(domain.y1));
    ctx.stroke();

    ctx.fillStyle = faint;
    ctx.font = '11px var(--font-mono), ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const ticks = view === 'columns' ? [0, 0.5, 1] : [-1, 0, 1];
    for (const t of ticks) {
      ctx.fillText(String(t), sx(t), sy(0) + 6);
      ctx.strokeStyle = withAlpha(rule, 0.7);
      ctx.beginPath();
      ctx.moveTo(sx(t), sy(0) - 3);
      ctx.lineTo(sx(t), sy(0) + 3);
      ctx.stroke();
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yTicks = view === 'columns' ? [0, 0.5, 1] : [-0.5, 0, 0.5];
    for (const t of yTicks) {
      if (t === 0) continue;
      ctx.fillText(String(t), sx(0) - 6, sy(t));
    }

    const ox = sx(0);
    const oy = sy(0);

    if (view === 'columns') {
      const { a1, a2 } = snap.span;
      arrow(ctx, ox, oy, sx(a1[0]), sy(a1[1]), cyan, 2.6);
      arrow(ctx, ox, oy, sx(a2[0]), sy(a2[1]), magenta, 2.6);

      ctx.fillStyle = cyan;
      ctx.font = '12px var(--font-sans), system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('a₁', sx(a1[0]) + 6, sy(a1[1]) - 4);
      ctx.fillStyle = magenta;
      ctx.fillText('a₂', sx(a2[0]) + 6, sy(Math.max(a2[1], 0.04)) - 4);

      ctx.fillStyle = faint;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = '11px var(--font-mono), ui-monospace, monospace';
      ctx.fillText(`θ ≈ ${formatValue(snap.span.theta, 3)} rad`, pad.left, 4);
    } else {
      // Mirror: the line through the origin orthogonal to v = house(a₁).
      const vx = snap.v[0]!;
      const vy = snap.v[1]!;
      const vn = Math.hypot(vx, vy) || 1;
      const mx = -vy / vn;
      const my = vx / vn;
      ctx.strokeStyle = withAlpha(iris, 0.85);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(sx(-1.4 * mx), sy(-1.4 * my));
      ctx.lineTo(sx(1.4 * mx), sy(1.4 * my));
      ctx.stroke();
      ctx.setLineDash([]);

      arrow(ctx, ox, oy, sx(snap.a1[0]!), sy(snap.a1[1]!), cyan, 2.6);
      arrow(ctx, ox, oy, sx(snap.Fa1[0]!), sy(snap.Fa1[1]!), magenta, 2.4);

      ctx.fillStyle = cyan;
      ctx.font = '12px var(--font-sans), system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('a₁', sx(snap.a1[0]!) + 6, sy(snap.a1[1]!) - 2);
      ctx.fillStyle = magenta;
      ctx.textAlign = snap.Fa1[0]! < 0 ? 'right' : 'left';
      ctx.fillText('F a₁', sx(snap.Fa1[0]!) + (snap.Fa1[0]! < 0 ? -6 : 6), sy(snap.Fa1[1]!) - 2);

      ctx.fillStyle = iris;
      ctx.font = '11px var(--font-sans), system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('mirror  ⊥ v', pad.left, 4);
    }

    ctx.fillStyle = faint;
    ctx.font = '11px var(--font-sans), system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(view === 'columns' ? 'span of {a₁, a₂}' : 'plane of e₁ and a₁', w - 10, h - 6);
  }, [width, height, view, snap]);

  const kAShow = Number.isFinite(snap.kA) ? snap.kA : pairCond2Exact(eps);

  return (
    <div className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title="two columns"
        right={
          lockView ? undefined : (
            <Toggle
              options={[
                { key: 'columns', label: 'columns', accent: 'cyan' },
                { key: 'reflector', label: 'reflector', accent: 'magenta' },
              ]}
              value={[view]}
              onChange={([k]) => setView((k as QrLabView) ?? 'columns')}
            />
          )
        }
      >
        <div ref={wrapRef}>
          <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height }} />
        </div>

        <div style={{ marginTop: 12, maxWidth: 420 }}>
          <Slider
            spec={{
              key: 'eps', label: 'column gap', symbol: 'ε', min: 1e-10, max: 0.4,
              step: 1e-10, value: eps, log: true,
            }}
            value={eps}
            onChange={setEps}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 18,
            marginTop: 16,
          }}
        >
          <Mat2 title="AᵀA  (the Gram)" entries={snap.G} warn={snap.lost} />
          <Mat2 title="R  (Householder)" entries={snap.R} />
        </div>

        <ReadoutRow>
          <Readout label="ε" value={eps.toExponential(2)} accent="cyan" />
          <Readout label="κ₂(A)" value={fmtKappa(kAShow)} accent="cyan" />
          <Readout
            label="κ₂(AᵀA)"
            value={fmtKappa(snap.kG)}
            accent={snap.lost ? 'warn' : 'magenta'}
          />
          <Readout label="|R₂₂|" value={formatValue(Math.abs(snap.R[1]![1]!), 3)} accent="iris" />
          <Readout
            label="(AᵀA)₁₁"
            value={snap.lost ? '1  (1+ε² rounded)' : fmtEntry(snap.G[0]![0]!)}
            accent={snap.lost ? 'warn' : 'ink'}
          />
        </ReadoutRow>

        {caption && (
          <p style={{ margin: '10px 0 0', color: 'var(--color-ink-soft)', fontSize: '0.92rem', lineHeight: 1.55 }}>
            {caption}
          </p>
        )}
      </Panel>
    </div>
  );
}

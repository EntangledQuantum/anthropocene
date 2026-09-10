import { useEffect, useMemo, useRef, useState } from 'react';
import { Panel, Readout, ReadoutRow, Slider, Toggle } from './controls.tsx';
import { ACCENTS, formatValue } from './chart-core.ts';
import {
  PHI,
  PICTURE_SIGMAS,
  columns2,
  demoPicture,
  droppedSigma,
  kappa2,
  lessonEllipse,
  mapCircle,
  rankK,
  singularAxes,
  svd,
} from '../../lib/numerics/svd.ts';

export type SvdLabView = 'ellipse' | 'picture';

export interface SvdLabProps {
  /** Initial minor-axis length. σ₁ stays at φ. */
  sigma2?: number;
  /** How many singular components to keep. 2 is the full shear. */
  rank?: number;
  view?: SvdLabView;
  lockView?: boolean;
  lockSigma?: boolean;
  lockRank?: boolean;
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

function poly(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  sx: (x: number) => number,
  sy: (y: number) => number,
) {
  if (pts.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(sx(pts[0]!.x), sy(pts[0]!.y));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(sx(pts[i]!.x), sy(pts[i]!.y));
  ctx.closePath();
}

const PICTURE = demoPicture();
const PICTURE_SVD = svd(PICTURE);

/**
 * Coupled views of one SVD: the unit circle mapped to an ellipse whose axes
 * are the singular values, and an 8×8 picture truncated by dropping σ.
 * One state. The σ slider and the rank slider are two handles on the same
 * decomposition.
 */
export default function SvdLab({
  sigma2: sigma20 = 1 / PHI,
  rank: rank0 = 2,
  view: view0 = 'ellipse',
  lockView = false,
  lockSigma = false,
  lockRank = false,
  caption,
  height = 260,
}: SvdLabProps) {
  const [sigma2, setSigma2] = useState(() => Math.max(0, sigma20));
  const [rank, setRank] = useState(() => Math.max(0, Math.round(rank0)));
  const [view, setView] = useState<SvdLabView>(view0);
  const [width, setWidth] = useState(320);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const snap = useMemo(() => {
    const A = lessonEllipse(sigma2);
    const keep = Math.max(0, Math.min(2, rank));
    const Ak = rankK(A, keep);
    const axes = singularAxes(A);
    const cols = columns2(A);
    const kA = kappa2(A);
    const residual = droppedSigma(A, keep);
    return {
      A, Ak, axes, cols, kA, residual,
      circle: mapCircle(A, 96),
      kept: mapCircle(Ak, 96),
      unit: mapCircle([[1, 0], [0, 1]], 96),
    };
  }, [sigma2, rank]);

  const pic = useMemo(() => {
    const k = Math.max(0, Math.min(PICTURE_SIGMAS.length, rank));
    const Ak = rankK(PICTURE, k);
    let maxAbs = 0;
    for (const row of PICTURE) for (const v of row) maxAbs = Math.max(maxAbs, Math.abs(v));
    return {
      Ak,
      maxAbs,
      residual: droppedSigma(PICTURE, k),
      S: PICTURE_SVD.S,
      k,
    };
  }, [rank]);

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

    if (view === 'ellipse') drawEllipse(ctx, w, h, snap, { faint, rule, cyan, magenta, iris });
    else drawPicture(ctx, w, h, pic, { faint, rule, cyan, magenta, iris });
  }, [width, height, view, snap, pic]);

  const kShow = Number.isFinite(snap.kA) ? snap.kA : Infinity;
  const rankMax = view === 'picture' ? PICTURE_SIGMAS.length : 2;
  const rankClamped = Math.max(0, Math.min(rankMax, rank));

  return (
    <div className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title={view === 'ellipse' ? 'unit circle → ellipse' : 'drop small σ'}
        right={
          lockView ? undefined : (
            <Toggle
              options={[
                { key: 'ellipse', label: 'ellipse', accent: 'cyan' },
                { key: 'picture', label: 'picture', accent: 'magenta' },
              ]}
              value={[view]}
              onChange={([k]) => setView((k as SvdLabView) ?? 'ellipse')}
            />
          )
        }
      >
        <div ref={wrapRef}>
          <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height }} />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginTop: 12,
          }}
        >
          {view === 'ellipse' && !lockSigma && (
            <Slider
              spec={{
                key: 'sigma2', label: 'minor axis', symbol: 'σ₂',
                min: 0.02, max: PHI, step: 0.01, value: sigma2,
              }}
              value={sigma2}
              onChange={setSigma2}
            />
          )}
          {!lockRank && (
            <Slider
              spec={{
                key: 'rank', label: 'keep rank k', symbol: 'k',
                min: 0, max: rankMax, step: 1, value: rankClamped,
              }}
              value={rankClamped}
              onChange={(v) => setRank(Math.round(v))}
            />
          )}
        </div>

        <ReadoutRow>
          {view === 'ellipse' ? (
            <>
              <Readout label="σ₁" value={formatValue(snap.axes.s1, 3)} accent="cyan" />
              <Readout label="σ₂" value={formatValue(snap.axes.s2, 3)} accent="magenta" />
              <Readout
                label="κ₂ = σ₁/σ₂"
                value={!Number.isFinite(kShow) ? '∞' : formatValue(kShow, 3)}
                accent={kShow > 8 ? 'warn' : 'iris'}
              />
              <Readout
                label="‖A − Aₖ‖₂"
                value={formatValue(snap.residual, 3)}
                accent="magenta"
              />
            </>
          ) : (
            <>
              <Readout label="k kept" value={String(pic.k)} accent="cyan" />
              <Readout label="σ₁" value={formatValue(pic.S[0] ?? 0, 3)} accent="cyan" />
              <Readout
                label="dropped σ"
                value={pic.k >= pic.S.length ? '0' : formatValue(pic.S[pic.k] ?? 0, 3)}
                accent="magenta"
              />
              <Readout
                label="‖A − Aₖ‖₂"
                value={pic.k >= pic.S.length ? '0' : formatValue(pic.residual, 3)}
                accent="magenta"
              />
            </>
          )}
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

function drawEllipse(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  snap: {
    axes: ReturnType<typeof singularAxes>;
    cols: ReturnType<typeof columns2>;
    circle: { x: number; y: number }[];
    kept: { x: number; y: number }[];
    unit: { x: number; y: number }[];
  },
  c: { faint: string; rule: string; cyan: string; magenta: string; iris: string },
) {
  const pad = { top: 18, right: 16, bottom: 32, left: 40 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const R = Math.max(PHI, 1.15) * 1.25;
  const domain = { x0: -R, x1: R, y0: -R, y1: R };
  const sx = (x: number) => pad.left + ((x - domain.x0) / (domain.x1 - domain.x0)) * innerW;
  const sy = (y: number) => pad.top + innerH - ((y - domain.y0) / (domain.y1 - domain.y0)) * innerH;

  ctx.strokeStyle = c.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx(domain.x0), sy(0));
  ctx.lineTo(sx(domain.x1), sy(0));
  ctx.moveTo(sx(0), sy(domain.y0));
  ctx.lineTo(sx(0), sy(domain.y1));
  ctx.stroke();

  ctx.fillStyle = c.faint;
  ctx.font = '11px var(--font-mono), ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of [-1, 0, 1]) {
    ctx.fillText(String(t), sx(t), sy(0) + 6);
    ctx.beginPath();
    ctx.moveTo(sx(t), sy(0) - 3);
    ctx.lineTo(sx(t), sy(0) + 3);
    ctx.strokeStyle = withAlpha(c.rule, 0.7);
    ctx.stroke();
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const t of [-1, 1]) ctx.fillText(String(t), sx(0) - 6, sy(t));

  const ox = sx(0);
  const oy = sy(0);

  ctx.strokeStyle = withAlpha(c.faint, 0.7);
  ctx.lineWidth = 1.25;
  ctx.setLineDash([3, 3]);
  poly(ctx, snap.unit, sx, sy);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = withAlpha(c.cyan, 0.12);
  ctx.strokeStyle = withAlpha(c.cyan, 0.45);
  ctx.lineWidth = 1.5;
  poly(ctx, snap.circle, sx, sy);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = withAlpha(c.magenta, 0.2);
  ctx.strokeStyle = c.magenta;
  ctx.lineWidth = 2;
  poly(ctx, snap.kept, sx, sy);
  ctx.fill();
  ctx.stroke();

  arrow(ctx, ox, oy, sx(snap.cols.a1[0]), sy(snap.cols.a1[1]), withAlpha(c.faint, 0.55), 1.5);
  arrow(ctx, ox, oy, sx(snap.cols.a2[0]), sy(snap.cols.a2[1]), withAlpha(c.faint, 0.55), 1.5);

  arrow(ctx, sx(-snap.axes.axis1[0]), sy(-snap.axes.axis1[1]), sx(snap.axes.axis1[0]), sy(snap.axes.axis1[1]), c.cyan, 2.4);
  arrow(ctx, sx(-snap.axes.axis2[0]), sy(-snap.axes.axis2[1]), sx(snap.axes.axis2[0]), sy(snap.axes.axis2[1]), c.magenta, 2.2);

  ctx.fillStyle = c.cyan;
  ctx.font = '12px var(--font-sans), system-ui, sans-serif';
  ctx.textAlign = snap.axes.axis1[0] >= 0 ? 'left' : 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('σ₁ u₁', sx(snap.axes.axis1[0]) + (snap.axes.axis1[0] >= 0 ? 6 : -6), sy(snap.axes.axis1[1]) - 2);
  ctx.fillStyle = c.magenta;
  ctx.textAlign = snap.axes.axis2[0] >= 0 ? 'left' : 'right';
  ctx.fillText('σ₂ u₂', sx(snap.axes.axis2[0]) + (snap.axes.axis2[0] >= 0 ? 6 : -6), sy(snap.axes.axis2[1]) - 2);

  ctx.fillStyle = c.faint;
  ctx.font = '11px var(--font-sans), system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('dashed: unit circle    faint arrows: columns', pad.left, 4);

  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('range of A', w - 10, h - 6);
}

function drawPicture(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pic: { Ak: number[][]; maxAbs: number; S: number[]; k: number },
  c: { faint: string; rule: string; cyan: string; magenta: string; iris: string },
) {
  const n = PICTURE.length;
  const pad = { top: 22, right: 16, bottom: 28, left: 16 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const gap = 16;
  const heatW = (innerW - gap) * 0.42;
  const barX = pad.left + heatW * 2 + gap + 12;
  const barW = Math.max(48, innerW - 2 * heatW - gap - 12);
  const cell = Math.min(heatW / n, innerH / n);

  const drawHeat = (M: number[][], x0: number, title: string) => {
    ctx.fillStyle = c.faint;
    ctx.font = '11px var(--font-sans), system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(title, x0, pad.top - 4);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = M[i]![j]!;
        const t = pic.maxAbs === 0 ? 0 : v / pic.maxAbs;
        const a = Math.min(1, Math.abs(t));
        ctx.fillStyle = withAlpha(t >= 0 ? c.cyan : c.magenta, 0.12 + 0.88 * a);
        ctx.fillRect(x0 + j * cell + 0.5, pad.top + i * cell + 0.5, cell - 1, cell - 1);
      }
    }
  };

  drawHeat(PICTURE, pad.left, 'A');
  drawHeat(pic.Ak, pad.left + heatW + gap, `Aₖ  k = ${pic.k}`);

  const sMax = pic.S[0] || 1;
  const barH = n * cell;
  ctx.fillStyle = c.faint;
  ctx.font = '11px var(--font-sans), system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('σ', barX, pad.top - 4);

  const rowH = barH / n;
  for (let i = 0; i < n; i++) {
    const kept = i < pic.k;
    const len = (pic.S[i]! / sMax) * (barW - 8);
    const y = pad.top + i * rowH + rowH * 0.2;
    ctx.fillStyle = withAlpha(kept ? c.cyan : c.magenta, kept ? 0.9 : 0.35);
    ctx.fillRect(barX, y, Math.max(2, len), rowH * 0.6);
  }

  ctx.fillStyle = c.faint;
  ctx.font = '11px var(--font-sans), system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('dropped σ dimmed', w - 10, h - 6);
}

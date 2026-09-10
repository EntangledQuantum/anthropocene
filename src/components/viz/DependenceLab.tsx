import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel, Readout, ReadoutRow, Toggle } from './controls.tsx';
import { ACCENTS, formatValue } from './chart-core.ts';
import {
  bump, dependenceInterval, heatKernel, poissonGreen,
  type PdePersonality,
} from '../../lib/numerics/pde-types.ts';

export interface DependenceLabProps {
  caption?: string;
  /** Which personality the lab opens on. */
  initial?: PdePersonality;
  height?: number;
}

const T_MAX = 0.7;
const MARGIN = { top: 18, right: 16, bottom: 36, left: 44 };

const TYPES: { key: PdePersonality; label: string; accent: 'magenta' | 'cyan' | 'iris' }[] = [
  { key: 'hyperbolic', label: 'wave', accent: 'magenta' },
  { key: 'parabolic', label: 'heat', accent: 'cyan' },
  { key: 'elliptic', label: 'Poisson', accent: 'iris' },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const withAlpha = (hex: string, a: number): string => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/**
 * Domain of dependence as a picture you can drag. One probe, three shapes:
 * a characteristic triangle (wave), a one-sided fill of the whole past (heat),
 * the whole interval via a Green's tent (Poisson). Coupled with a 1D strip
 * that shows which data on [0, 1] the probe actually needs.
 */
export default function DependenceLab({
  caption,
  initial = 'hyperbolic',
  height = 320,
}: DependenceLabProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stripRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(720);
  const [type, setType] = useState<PdePersonality>(initial);
  const [probe, setProbe] = useState({ x: 0.5, t: 0.32 });
  const dragging = useRef(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plotH = Math.max(180, height - 72);
  const iw = Math.max(10, width - MARGIN.left - MARGIN.right);
  const ih = Math.max(10, plotH - MARGIN.top - MARGIN.bottom);

  const xOf = useCallback((x: number) => MARGIN.left + x * iw, [iw]);
  const yOf = useCallback((t: number) => MARGIN.top + ih - (t / T_MAX) * ih, [ih]);
  const gOf = useCallback((g: number) => MARGIN.top + ih - (g / 0.28) * ih, [ih]);

  const fromPointer = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * width;
    const py = ((clientY - r.top) / r.height) * plotH;
    const x = clamp((px - MARGIN.left) / iw, 0, 1);
    if (type === 'elliptic') {
      setProbe((p) => ({ ...p, x }));
      return;
    }
    const t = clamp(((MARGIN.top + ih - py) / ih) * T_MAX, 0.02, T_MAX);
    setProbe({ x, t });
  }, [width, plotH, iw, ih, type]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(plotH * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${plotH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, plotH);

    const axis = ACCENTS.faint;
    const ink = ACCENTS.ink;
    ctx.strokeStyle = axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, MARGIN.top);
    ctx.lineTo(MARGIN.left, MARGIN.top + ih);
    ctx.lineTo(MARGIN.left + iw, MARGIN.top + ih);
    ctx.stroke();

    ctx.fillStyle = axis;
    ctx.font = '12px "Inter Variable", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const xt of [0, 0.5, 1]) {
      const px = xOf(xt);
      ctx.beginPath();
      ctx.moveTo(px, MARGIN.top + ih);
      ctx.lineTo(px, MARGIN.top + ih + 5);
      ctx.stroke();
      ctx.fillText(String(xt), px, MARGIN.top + ih + 8);
    }
    ctx.fillText('x', MARGIN.left + iw / 2, MARGIN.top + ih + 22);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    if (type === 'elliptic') {
      for (const g of [0, 0.12, 0.24]) {
        const py = gOf(g);
        ctx.beginPath();
        ctx.moveTo(MARGIN.left - 5, py);
        ctx.lineTo(MARGIN.left, py);
        ctx.stroke();
        ctx.fillText(g === 0 ? '0' : g.toFixed(2), MARGIN.left - 8, py);
      }
      ctx.save();
      ctx.translate(14, MARGIN.top + ih / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText('G(x, ξ)', 0, 0);
      ctx.restore();
    } else {
      for (const t of [0, 0.3, 0.6]) {
        const py = yOf(t);
        ctx.beginPath();
        ctx.moveTo(MARGIN.left - 5, py);
        ctx.lineTo(MARGIN.left, py);
        ctx.stroke();
        ctx.fillText(String(t), MARGIN.left - 8, py);
      }
      ctx.save();
      ctx.translate(14, MARGIN.top + ih / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText('t', 0, 0);
      ctx.restore();
    }

    const dep = dependenceInterval(type, probe.x, probe.t);

    if (type === 'hyperbolic') {
      const c = 1;
      const pts: { x: number; t: number }[] = [{ x: probe.x, t: probe.t }];
      if (probe.x - c * probe.t >= 0) {
        pts.push({ x: probe.x - c * probe.t, t: 0 });
      } else {
        pts.push({ x: 0, t: probe.t - probe.x / c });
        pts.push({ x: 0, t: 0 });
      }
      if (probe.x + c * probe.t <= 1) {
        pts.push({ x: probe.x + c * probe.t, t: 0 });
      } else {
        pts.push({ x: 1, t: 0 });
        pts.push({ x: 1, t: probe.t - (1 - probe.x) / c });
      }
      ctx.beginPath();
      pts.forEach((p, i) => {
        const px = xOf(p.x);
        const py = yOf(p.t);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = withAlpha(ACCENTS.magenta, 0.28);
      ctx.fill();
      ctx.strokeStyle = ACCENTS.magenta;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      if (dep.leftBoundary) {
        ctx.strokeStyle = ACCENTS.warn;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(xOf(0), yOf(0));
        ctx.lineTo(xOf(0), yOf(probe.t - probe.x / c));
        ctx.stroke();
      }
      if (dep.rightBoundary) {
        ctx.strokeStyle = ACCENTS.warn;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(xOf(1), yOf(0));
        ctx.lineTo(xOf(1), yOf(probe.t - (1 - probe.x) / c));
        ctx.stroke();
      }
    } else if (type === 'parabolic') {
      const cols = 80;
      const rows = 36;
      for (let j = 0; j < rows; j++) {
        const t0 = (probe.t * j) / rows;
        const t1 = (probe.t * (j + 1)) / rows;
        const y1 = yOf(t1);
        const y0 = yOf(t0);
        for (let i = 0; i < cols; i++) {
          const xa = i / cols;
          const xb = (i + 1) / cols;
          const xm = 0.5 * (xa + xb);
          const dt = Math.max(1e-4, probe.t - 0.5 * (t0 + t1));
          const w = heatKernel(xm - probe.x, dt);
          const peak = heatKernel(0, Math.max(dt, 0.02));
          const a = Math.min(0.55, 0.08 + 0.85 * (w / peak));
          ctx.fillStyle = withAlpha(ACCENTS.cyan, a);
          ctx.fillRect(xOf(xa), y1, xOf(xb) - xOf(xa) + 0.5, y0 - y1 + 0.5);
        }
      }
      ctx.strokeStyle = ACCENTS.cyan;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(xOf(0), yOf(probe.t), xOf(1) - xOf(0), yOf(0) - yOf(probe.t));
    } else {
      ctx.beginPath();
      const steps = 120;
      for (let i = 0; i <= steps; i++) {
        const x = i / steps;
        const y = gOf(poissonGreen(x, probe.x));
        if (i === 0) ctx.moveTo(xOf(x), y);
        else ctx.lineTo(xOf(x), y);
      }
      ctx.lineTo(xOf(1), gOf(0));
      ctx.lineTo(xOf(0), gOf(0));
      ctx.closePath();
      ctx.fillStyle = withAlpha(ACCENTS.iris, 0.22);
      ctx.fill();
      ctx.strokeStyle = ACCENTS.iris;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = ACCENTS.warn;
      ctx.beginPath();
      ctx.arc(xOf(0), gOf(0), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(xOf(1), gOf(0), 5, 0, Math.PI * 2);
      ctx.fill();
    }

    const py = type === 'elliptic' ? gOf(poissonGreen(probe.x, probe.x)) : yOf(probe.t);
    ctx.fillStyle = ACCENTS.magenta;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(xOf(probe.x), py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, [width, plotH, iw, ih, type, probe, xOf, yOf, gOf]);

  useEffect(() => {
    const canvas = stripRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sh = 56;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(sh * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${sh}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, sh);

    const left = MARGIN.left;
    const stripW = iw;
    const base = 40;
    const dep = dependenceInterval(type, probe.x, probe.t);

    ctx.fillStyle = withAlpha(ACCENTS.ink, 0.06);
    ctx.fillRect(left, 8, stripW, 28);

    if (type === 'parabolic') {
      const cols = 100;
      for (let i = 0; i < cols; i++) {
        const xa = i / cols;
        const w = heatKernel(xa - probe.x, Math.max(probe.t, 1e-3));
        const peak = heatKernel(0, Math.max(probe.t, 0.02));
        const a = Math.min(0.7, 0.12 + 0.9 * (w / peak));
        ctx.fillStyle = withAlpha(ACCENTS.cyan, a);
        ctx.fillRect(left + xa * stripW, 8, stripW / cols + 0.5, 28);
      }
    } else {
      ctx.fillStyle = withAlpha(type === 'elliptic' ? ACCENTS.iris : ACCENTS.magenta, 0.4);
      ctx.fillRect(left + dep.lo * stripW, 8, (dep.hi - dep.lo) * stripW, 28);
    }

    ctx.strokeStyle = ACCENTS.faint;
    ctx.strokeRect(left, 8, stripW, 28);

    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const x = i / 80;
      const y = base - bump(x) * 22;
      if (i === 0) ctx.moveTo(left + x * stripW, y);
      else ctx.lineTo(left + x * stripW, y);
    }
    ctx.strokeStyle = ACCENTS.ink;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = ACCENTS.magenta;
    ctx.beginPath();
    ctx.arc(left + probe.x * stripW, 22, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = ACCENTS.faint;
    ctx.font = '11px "Inter Variable", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('data on [0, 1] that the probe needs', left, 40);
  }, [width, iw, type, probe]);

  const dep = dependenceInterval(type, probe.x, probe.t);
  const needs = type === 'elliptic'
    ? 'both endpoints, whole interval'
    : type === 'parabolic'
      ? 'the whole past, instantly'
      : dep.whole
        ? 'the whole interval (triangle hit the walls)'
        : `[${formatValue(dep.lo, 2)}, ${formatValue(dep.hi, 2)}] at t = 0`;

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title="domain of dependence"
        right={<span className="hud-label" style={{ color: 'var(--color-ink-faint)' }}>drag the probe</span>}
      >
        <Toggle
          options={TYPES}
          value={[type]}
          onChange={(next) => setType((next[0] as PdePersonality) ?? type)}
        />

        <div ref={wrapRef} style={{ marginTop: 12 }}>
          <canvas
            ref={canvasRef}
            onPointerDown={(e) => { dragging.current = true; (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId); fromPointer(e.clientX, e.clientY); }}
            onPointerMove={(e) => { if (dragging.current) fromPointer(e.clientX, e.clientY); }}
            onPointerUp={() => { dragging.current = false; }}
            onPointerCancel={() => { dragging.current = false; }}
            style={{ display: 'block', width: '100%', touchAction: 'none', cursor: 'crosshair' }}
          />
          <canvas ref={stripRef} style={{ display: 'block', width: '100%' }} />
        </div>

        <ReadoutRow>
          <Readout label="x" value={formatValue(probe.x, 3)} accent="magenta" />
          <Readout label={type === 'elliptic' ? 'ξ' : 't'} value={type === 'elliptic' ? formatValue(probe.x, 3) : formatValue(probe.t, 3)} />
          <Readout label="needs" value={needs} accent="cyan" mono={false} />
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

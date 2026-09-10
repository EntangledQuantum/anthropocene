import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import Plot from './Plot.tsx';
import { Panel, Readout, ReadoutRow, Slider, Toggle } from './controls.tsx';
import { ACCENTS, formatValue, type Series } from './chart-core.ts';
import {
  applyLaplacian,
  laplacian1d,
  laplacianNnz,
  maxAbs,
  rayleigh,
  sampleField,
  type FieldKind,
  type LaplacianBc,
} from '../../lib/numerics/operator.ts';

export interface OperatorLabProps {
  n?: number;
  bc?: LaplacianBc;
  field?: FieldKind;
  view?: 'spy' | 'dense';
  lockN?: boolean;
  lockBc?: boolean;
  lockField?: boolean;
  lockView?: boolean;
  caption?: string;
  height?: number;
}

const withAlpha = (hex: string, a: number): string => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const cssColor = (el: Element | null, name: string, fallback: string): string => {
  if (!el) return fallback;
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
};

const FIELD_OPTS: { key: FieldKind; label: string; accent: 'cyan' | 'magenta' | 'iris' | 'orchid' | 'aqua' }[] = [
  { key: 'bump', label: 'bump', accent: 'cyan' },
  { key: 'sine', label: 'sin(πx)', accent: 'iris' },
  { key: 'constant', label: 'constant', accent: 'orchid' },
  { key: 'spike', label: 'spike eᵢ', accent: 'magenta' },
];

/**
 * Coupled views of one discrete Laplacian: the spy (or the dense table of
 * the same numbers), and A applied to a vector. One state. Clicking a row
 * highlights the three samples that row actually reads.
 */
export default function OperatorLab({
  n: n0 = 7,
  bc: bc0 = 'dirichlet',
  field: field0 = 'bump',
  view: view0 = 'spy',
  lockN = false,
  lockBc = false,
  lockField = false,
  lockView = false,
  caption,
  height = 220,
}: OperatorLabProps) {
  const [n, setN] = useState(() => Math.max(3, Math.min(32, Math.round(n0))));
  const [bc, setBc] = useState<LaplacianBc>(bc0);
  const [field, setField] = useState<FieldKind>(field0);
  const [view, setView] = useState<'spy' | 'dense'>(view0);
  const [selected, setSelected] = useState(() => Math.floor(Math.max(3, Math.round(n0)) / 2));
  const [width, setWidth] = useState(280);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const op = useMemo(() => laplacian1d(n, bc), [n, bc]);
  const row = Math.min(n - 1, Math.max(0, selected));
  const u = useMemo(
    () => sampleField(field, op.x, row),
    [field, op.x, row],
  );
  const Au = useMemo(() => applyLaplacian(u, bc), [u, bc]);
  const nnz = laplacianNnz(n, bc);
  const denseCount = n * n;
  const fill = nnz / denseCount;
  const s = 1 / (op.h * op.h);
  const Amax = 2 * s;

  const neighbors = useMemo(() => {
    const js: number[] = [];
    if (bc === 'periodic') {
      js.push((row - 1 + n) % n, row, (row + 1) % n);
    } else {
      if (row - 1 >= 0) js.push(row - 1);
      js.push(row);
      if (row + 1 < n) js.push(row + 1);
    }
    return js;
  }, [bc, n, row]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const matH = Math.max(200, height);
  const pad = { top: 22, right: 10, bottom: 28, left: 28 };
  const side = Math.max(40, Math.min(width - pad.left - pad.right, matH - pad.top - pad.bottom));
  const cell = side / n;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(matH * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${matH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const ink = cssColor(wrap, '--color-ink', ACCENTS.ink);
    const faint = cssColor(wrap, '--color-ink-faint', ACCENTS.faint);
    const rule = cssColor(wrap, '--color-rule', ACCENTS.faint);
    const cyan = ACCENTS.cyan;
    const magenta = ACCENTS.magenta;

    ctx.clearRect(0, 0, width, matH);

    const x0 = pad.left;
    const y0 = pad.top;
    const showNumbers = view === 'dense' && cell >= 18;

    // zeros first, so nonzeros paint on top
    if (view === 'dense') {
      ctx.fillStyle = withAlpha(rule, 0.35);
      ctx.strokeStyle = withAlpha(rule, 0.8);
      ctx.lineWidth = 0.5;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const px = x0 + c * cell;
          const py = y0 + r * cell;
          ctx.fillRect(px, py, Math.max(0.5, cell - 0.4), Math.max(0.5, cell - 0.4));
        }
      }
    }

    const lookup = new Map<string, number>();
    for (const e of op.entries) lookup.set(`${e.i},${e.j}`, e.v);

    for (const e of op.entries) {
      const px = x0 + e.j * cell;
      const py = y0 + e.i * cell;
      const t = Math.min(1, Math.abs(e.v) / Amax);
      const pos = e.v > 0;
      ctx.fillStyle = pos ? withAlpha(magenta, 0.35 + 0.65 * t) : withAlpha(cyan, 0.35 + 0.65 * t);
      ctx.fillRect(px, py, Math.max(1, cell - 0.4), Math.max(1, cell - 0.4));
    }

    // selected row band
    ctx.fillStyle = withAlpha(cyan, 0.1);
    ctx.fillRect(x0, y0 + row * cell, side, Math.max(1, cell));
    ctx.strokeStyle = cyan;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0 + 0.5, y0 + row * cell + 0.5, side - 1, Math.max(1, cell - 1));

    for (const j of neighbors) {
      ctx.strokeStyle = ACCENTS.ok;
      ctx.lineWidth = 1.75;
      ctx.strokeRect(
        x0 + j * cell + 0.5,
        y0 + row * cell + 0.5,
        Math.max(1, cell - 1),
        Math.max(1, cell - 1),
      );
    }

    if (showNumbers) {
      ctx.font = `${Math.min(11, cell * 0.42)}px "JetBrains Mono Variable", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const v = lookup.get(`${r},${c}`) ?? 0;
          ctx.fillStyle = Math.abs(v) < 1e-18 ? faint : ink;
          const label = Math.abs(v) < 1e-18 ? '0' : formatValue(v, 1);
          ctx.fillText(label, x0 + (c + 0.5) * cell, y0 + (r + 0.5) * cell, cell - 2);
        }
      }
    }

    // axes
    ctx.fillStyle = faint;
    ctx.font = '11px "JetBrains Mono Variable", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const ticks = n <= 8 ? Array.from({ length: n }, (_, i) => i) : [0, Math.floor(n / 2), n - 1];
    for (const t of ticks) {
      ctx.fillText(String(t), x0 + (t + 0.5) * cell, y0 + side + 6);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const t of ticks) {
      ctx.fillText(String(t), x0 - 6, y0 + (t + 0.5) * cell);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('column j', x0 + side / 2, matH - 2);
    ctx.save();
    ctx.translate(11, y0 + side / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('row i', 0, 0);
    ctx.restore();
  }, [width, matH, n, op.entries, row, neighbors, view, Amax, pad.left, pad.top, side, cell]);

  const onPointer = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const py = ((e.clientY - r.top) / r.height) * matH;
    const i = Math.floor((py - pad.top) / cell);
    if (i >= 0 && i < n) setSelected(i);
  }, [matH, pad.top, cell, n]);

  const uMax = Math.max(1e-9, maxAbs(u));
  const auMax = Math.max(1e-9, maxAbs(Au));
  const xDomain: [number, number] = [0, 1];

  const uSeries: Series[] = [
    {
      key: 'u',
      label: 'u',
      color: 'cyan',
      style: 'line+dots',
      width: 2,
      points: op.x.map((xi, i) => [xi, u[i]!] as const),
    },
    {
      key: 'reads',
      label: 'row reads',
      color: 'ok',
      style: 'dots',
      width: 7,
      points: neighbors.map((j) => [op.x[j]!, u[j]!] as const),
    },
  ];
  const auSeries: Series[] = [
    {
      key: 'Au',
      label: 'Au',
      color: 'magenta',
      style: 'line+dots',
      width: 2,
      points: op.x.map((xi, i) => [xi, Au[i]!] as const),
    },
    {
      key: 'out',
      label: '(Au)ᵢ',
      color: 'ok',
      style: 'dots',
      width: 7,
      points: [[op.x[row]!, Au[row]!]],
    },
  ];

  const ray = field === 'sine' && bc === 'dirichlet' ? rayleigh(u, Au) : null;
  const leftWall = bc === 'dirichlet' && row === 0;
  const rightWall = bc === 'dirichlet' && row === n - 1;
  const left = leftWall ? 0 : u[(row - 1 + n) % n]!;
  const right = rightWall ? 0 : u[(row + 1) % n]!;
  const stencilValue = s * (2 * u[row]! - left - right);

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title={view === 'spy' ? 'spy of A, and A applied' : 'the same numbers, as a table'}
        right={
          <span className="hud-label" style={{ color: 'var(--color-cyan)' }}>
            nnz {nnz} / {denseCount}
          </span>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          {!lockView && (
            <Toggle
              options={[
                { key: 'spy', label: 'spy', accent: 'cyan' },
                { key: 'dense', label: 'dense table', accent: 'magenta' },
              ]}
              value={[view]}
              onChange={(next) => setView((next[0] as 'spy' | 'dense') ?? 'spy')}
            />
          )}
          {!lockBc && (
            <Toggle
              options={[
                { key: 'dirichlet', label: 'Dirichlet', accent: 'iris' },
                { key: 'periodic', label: 'periodic', accent: 'orchid' },
              ]}
              value={[bc]}
              onChange={(next) => {
                const nextBc = (next[0] as LaplacianBc) ?? 'dirichlet';
                setBc(nextBc);
                if (nextBc === 'periodic' && n < 3) setN(3);
              }}
            />
          )}
          {!lockField && (
            <Toggle
              options={FIELD_OPTS}
              value={[field]}
              onChange={(next) => setField((next[0] as FieldKind) ?? 'bump')}
            />
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(220px, 0.95fr) minmax(0, 1.2fr)',
            gap: 14,
            alignItems: 'start',
          }}
        >
          <div ref={wrapRef} style={{ minWidth: 0 }}>
            <canvas
              ref={canvasRef}
              onPointerDown={onPointer}
              onPointerMove={(e) => {
                if (e.buttons) onPointer(e);
              }}
              style={{ width: '100%', height: matH, display: 'block', cursor: 'crosshair', touchAction: 'none' }}
              aria-label="Sparsity pattern of the discrete Laplacian. Click a row to see which samples it reads."
            />
            <p style={{ margin: '8px 0 0', color: 'var(--color-ink-soft)', fontSize: '0.92rem', lineHeight: 1.5 }}>
              Row {row}: (Au)<sub>{row}</sub> = {formatValue(stencilValue, 3)}
              {' = (−'}
              {leftWall ? '0' : <>u<sub>{row - 1 < 0 ? n - 1 : row - 1}</sub></>}
              {' + 2'}u<sub>{row}</sub>
              {' − '}
              {rightWall ? '0' : <>u<sub>{(row + 1) % n}</sub></>}
              )/h²
            </p>
          </div>

          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Plot
              series={uSeries}
              x={{ label: 'x', domain: xDomain }}
              y={{ label: 'u', domain: [-0.08 * uMax, 1.15 * uMax] }}
              height={Math.max(150, height - 40)}
              legend
              rules={[{ x: op.x[row], color: ACCENTS.cyan, label: `i = ${row}` }]}
            />
            <Plot
              series={auSeries}
              x={{ label: 'x', domain: xDomain }}
              y={{ label: 'Au', domain: [-1.15 * auMax, 1.15 * auMax] }}
              height={Math.max(150, height - 40)}
              legend
              rules={[{ x: op.x[row], color: ACCENTS.magenta, label: `(Au)ᵢ` }]}
            />
          </div>
        </div>

        {!lockN && (
          <div style={{ marginTop: 12 }}>
            <Slider
              spec={{
                key: 'n',
                label: 'unknowns n',
                symbol: 'n',
                min: 3,
                max: 32,
                step: 1,
                value: 7,
                hint: 'Grow n. The spy stays three bands. The dense table becomes a wall of zeros.',
              }}
              value={n}
              onChange={(v) => {
                const next = Math.max(3, Math.min(32, Math.round(v)));
                setN(next);
                setSelected((s0) => Math.min(next - 1, s0));
              }}
            />
          </div>
        )}

        <ReadoutRow>
          <Readout label="n" value={String(n)} accent="cyan" />
          <Readout label="nnz" value={String(nnz)} accent="cyan" />
          <Readout label="n²" value={String(denseCount)} accent="magenta" />
          <Readout label="fill nnz/n²" value={formatValue(fill, 3)} />
          <Readout label="h" value={formatValue(op.h, 3)} />
          <Readout
            label="stencil / h²"
            value={`${formatValue(-s, 2)}  ${formatValue(2 * s, 2)}  ${formatValue(-s, 2)}`}
            accent="ok"
          />
          {ray !== null && Number.isFinite(ray) && (
            <Readout label="uᵀAu / uᵀu" value={formatValue(ray, 3)} accent="iris" />
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Plot from './Plot.tsx';
import { Button, Panel, Readout, ReadoutRow, Slider, Toggle } from './controls.tsx';
import { ACCENTS, formatValue, type Series } from './chart-core.ts';
import {
  LOADS,
  blendNodes,
  femStencil,
  hatPolyline,
  interiorStiffness,
  l2Error,
  maxNodalError,
  meshStencilsMatch,
  moveNode,
  naiveFdPoisson,
  solvePoisson,
  spacings,
  stencilsMatch,
  type FemLoad,
} from '../../lib/numerics/fem1d.ts';

export interface FemLabProps {
  mesh?: 'uniform' | 'stretched';
  elements?: number;
  /** 0 = uniform, 1 = Chebyshev-mapped. */
  cluster?: number;
  lockMesh?: boolean;
  load?: 'const' | 'sine';
  lockLoad?: boolean;
  caption?: string;
  height?: number;
}

const MARGIN = { top: 22, right: 12, bottom: 32, left: 36 };
const EXACT_N = 220;

const withAlpha = (hex: string, a: number): string => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const cssColor = (el: Element | null, name: string, fallback: string): string => {
  if (!el) return fallback;
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
};

/**
 * Coupled views of one 1D Poisson discretisation: the hats, the assembled
 * stiffness, and the solution. One state. Stretching the nodes is the
 * whole lesson — the tents still make a matrix, skip-a-neighbour does not.
 */
export default function FemLab({
  mesh = 'uniform',
  elements = 5,
  cluster: cluster0,
  lockMesh = false,
  load: load0 = 'const',
  lockLoad = false,
  caption,
  height = 200,
}: FemLabProps) {
  const nEl = Math.max(2, Math.min(8, Math.round(elements)));
  const startCluster = cluster0 ?? (mesh === 'stretched' ? 1 : 0);
  const [cluster, setCluster] = useState(startCluster);
  const [custom, setCustom] = useState<number[] | null>(null);
  const [loadKey, setLoadKey] = useState<'const' | 'sine'>(load0);
  const [hat, setHat] = useState(() => Math.floor(nEl / 2));
  const [width, setWidth] = useState(420);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef<number | null>(null);

  const nodes = useMemo(
    () => custom ?? blendNodes(nEl, cluster),
    [custom, nEl, cluster],
  );
  const last = nodes.length - 1;
  const hatIndex = Math.min(last - 1, Math.max(1, hat));
  const load: FemLoad = LOADS[loadKey] ?? LOADS.const;

  const fem = useMemo(() => solvePoisson(nodes, load.f), [nodes, load]);
  const fd = useMemo(() => naiveFdPoisson(nodes, load.f), [nodes, load]);
  const Kr = useMemo(() => interiorStiffness(nodes), [nodes]);
  const stencil = femStencil(nodes, hatIndex);
  const match = stencilsMatch(nodes, hatIndex);
  const allMatch = meshStencilsMatch(nodes);
  const hs = spacings(nodes);
  const hL = hs[hatIndex - 1]!;
  const hR = hs[hatIndex]!;

  const femNodal = maxNodalError(nodes, fem.u, load.exact);
  const fdNodal = maxNodalError(nodes, fd, load.exact);
  const femL2 = l2Error(nodes, fem.u, load.exact);
  const fdL2 = l2Error(nodes, fd, load.exact);

  const exactField = useMemo(() => {
    const x = Array.from({ length: EXACT_N }, (_, i) => i / (EXACT_N - 1));
    return x.map((xi) => [xi, load.exact(xi)] as const);
  }, [load]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hatH = Math.max(160, height);
  const iw = Math.max(10, width - MARGIN.left - MARGIN.right);
  const ih = Math.max(10, hatH - MARGIN.top - MARGIN.bottom);
  const xOf = useCallback((x: number) => MARGIN.left + x * iw, [iw]);
  const yOf = useCallback((y: number) => MARGIN.top + ih - y * ih, [ih]);

  const nodeFromPointer = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const r = canvas.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * (width || r.width);
    return Math.min(1, Math.max(0, (px - MARGIN.left) / iw));
  }, [width, iw]);

  const nearestInterior = useCallback((x: number) => {
    let best = 1;
    let bestD = Infinity;
    for (let i = 1; i < last; i++) {
      const d = Math.abs(nodes[i]! - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }, [nodes, last]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(hatH * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${hatH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const ink = cssColor(wrap, '--color-ink', ACCENTS.ink);
    const faint = cssColor(wrap, '--color-ink-faint', ACCENTS.faint);
    const rule = cssColor(wrap, '--color-rule', ACCENTS.faint);
    const cyan = ACCENTS.cyan;
    const iris = ACCENTS.iris;
    const magenta = ACCENTS.magenta;

    ctx.clearRect(0, 0, width, hatH);

    // axes
    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, yOf(0));
    ctx.lineTo(MARGIN.left + iw, yOf(0));
    ctx.moveTo(MARGIN.left, yOf(0));
    ctx.lineTo(MARGIN.left, yOf(1));
    ctx.stroke();

    ctx.fillStyle = faint;
    ctx.font = '11px "JetBrains Mono Variable", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const px = xOf(t);
      ctx.strokeStyle = rule;
      ctx.beginPath();
      ctx.moveTo(px, yOf(0));
      ctx.lineTo(px, yOf(0) + 4);
      ctx.stroke();
      ctx.fillStyle = faint;
      ctx.fillText(String(t), px, yOf(0) + 8);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('0', MARGIN.left - 6, yOf(0));
    ctx.fillText('1', MARGIN.left - 6, yOf(1));
    ctx.save();
    ctx.translate(12, yOf(0.5));
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('φ', 0, 0);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('x', xOf(0.5), hatH - 14);

    const drawHat = (i: number, stroke: string, fill: string | null, widthPx: number) => {
      const pts = hatPolyline(nodes, i);
      ctx.beginPath();
      pts.forEach(([x, y], k) => {
        const px = xOf(x);
        const py = yOf(y);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = widthPx;
      ctx.stroke();
    };

    for (let i = 0; i <= last; i++) {
      if (i === hatIndex) continue;
      drawHat(i, withAlpha(iris, i === 0 || i === last ? 0.25 : 0.45), null, 1.25);
    }
    drawHat(hatIndex, cyan, withAlpha(cyan, 0.22), 2.4);

    // stencil numbers on the three nodes of the selected hat
    const labels: { i: number; v: number; color: string }[] = [
      { i: hatIndex - 1, v: stencil.left, color: cyan },
      { i: hatIndex, v: stencil.diag, color: magenta },
      { i: hatIndex + 1, v: stencil.right, color: cyan },
    ];
    ctx.font = '11px "JetBrains Mono Variable", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const { i, v, color } of labels) {
      ctx.fillStyle = color;
      const py = i === hatIndex ? yOf(1) - 6 : yOf(0) - 12;
      ctx.fillText(formatValue(v, 3), xOf(nodes[i]!), py);
    }

    for (let i = 0; i <= last; i++) {
      const interior = i > 0 && i < last;
      const selected = i === hatIndex;
      ctx.beginPath();
      ctx.arc(xOf(nodes[i]!), yOf(0), selected ? 6 : interior ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = selected ? cyan : interior ? magenta : faint;
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [width, hatH, nodes, last, hatIndex, stencil, iw, ih, xOf, yOf]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const x = nodeFromPointer(e.clientX);
    const i = nearestInterior(x);
    setHat(i);
    if (lockMesh) return;
    const px = xOf(nodes[i]!);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const clickPx = ((e.clientX - r.left) / r.width) * (width || r.width);
    if (Math.abs(clickPx - px) < 14) {
      dragging.current = i;
      canvas.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragging.current === null || lockMesh) return;
    const x = nodeFromPointer(e.clientX);
    setCustom((prev) => moveNode(prev ?? nodes, dragging.current!, x));
  };

  const onPointerUp = () => {
    dragging.current = null;
  };

  const applyCluster = (c: number) => {
    setCluster(c);
    setCustom(null);
  };

  const maxAbsK = Math.max(1e-12, ...Kr.flatMap((row) => row.map((v) => Math.abs(v))));
  const exactSeries: Series = {
    key: 'exact',
    label: 'exact',
    color: 'ink',
    dash: [4, 3],
    width: 1.25,
    points: exactField,
  };
  const femLine: Series = {
    key: 'fem',
    label: 'FEM hats',
    color: 'cyan',
    style: 'line+dots',
    width: 2,
    points: nodes.map((x, i) => [x, fem.u[i]!] as const),
  };
  const fdLine: Series = {
    key: 'fd',
    label: allMatch ? 'FD (same)' : 'skip-neighbour FD',
    color: 'magenta',
    style: 'line+dots',
    width: 2,
    muted: allMatch,
    points: nodes.map((x, i) => [x, fd[i]!] as const),
  };

  const yMax = loadKey === 'sine' ? 1.15 : 0.32;

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title="hats, then the matrix they assemble"
        right={
          <span className="hud-label" style={{ color: allMatch ? 'var(--color-ok)' : 'var(--color-magenta)' }}>
            {allMatch ? 'FEM row = central FD' : 'stencils disagree'}
          </span>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          {!lockMesh && (
            <Toggle
              options={[
                { key: 'uniform', label: 'uniform', accent: 'cyan' },
                { key: 'stretched', label: 'clustered', accent: 'magenta' },
              ]}
              value={[custom ? 'stretched' : cluster < 0.05 ? 'uniform' : 'stretched']}
              onChange={(next) => applyCluster(next[0] === 'uniform' ? 0 : 1)}
            />
          )}
          {!lockLoad && (
            <Toggle
              options={[
                { key: 'const', label: '−u″ = 2', accent: 'iris' },
                { key: 'sine', label: 'sin(πx)', accent: 'orchid' },
              ]}
              value={[loadKey]}
              onChange={(next) => setLoadKey((next[0] as 'const' | 'sine') ?? 'const')}
            />
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.4fr) minmax(180px, 0.9fr)',
            gap: 14,
            alignItems: 'start',
          }}
        >
          <div ref={wrapRef} style={{ minWidth: 0 }}>
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                width: '100%',
                height: hatH,
                display: 'block',
                cursor: lockMesh ? 'pointer' : 'ew-resize',
                touchAction: 'none',
              }}
              aria-label="Piecewise-linear hat functions on the mesh. Click a peak to select it."
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {Array.from({ length: last - 1 }, (_, k) => k + 1).map((i) => (
                <Button
                  key={i}
                  accent={i === hatIndex ? 'cyan' : 'iris'}
                  active={i === hatIndex}
                  onClick={() => setHat(i)}
                >
                  φ{i}
                </Button>
              ))}
            </div>
          </div>

          <MatrixView K={Kr} selected={hatIndex - 1} maxAbs={maxAbsK} />
        </div>

        {!lockMesh && (
          <div style={{ marginTop: 12 }}>
            <Slider
              spec={{
                key: 'cluster',
                label: 'cluster toward the walls',
                symbol: 'c',
                min: 0,
                max: 1,
                step: 0.02,
                value: 0,
                hint: '0 is equal spacing. 1 is Chebyshev-mapped — nodes pack at both ends.',
              }}
              value={custom ? 0.5 : cluster}
              onChange={(v) => applyCluster(v)}
            />
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <Plot
            series={[exactSeries, femLine, fdLine]}
            x={{ label: 'x', domain: [0, 1] }}
            y={{ label: 'u', domain: [-0.02, yMax] }}
            height={Math.max(180, height - 10)}
            legend
          />
        </div>

        <ReadoutRow>
          <Readout label="h left" value={formatValue(hL, 3)} accent="cyan" />
          <Readout label="h right" value={formatValue(hR, 3)} accent="cyan" />
          <Readout
            label="K row"
            value={`${formatValue(stencil.left, 2)}  ${formatValue(stencil.diag, 2)}  ${formatValue(stencil.right, 2)}`}
            accent={match ? 'ok' : 'magenta'}
          />
          <Readout label="max |FEM − exact|" value={formatValue(femNodal, 2)} accent="ok" />
          <Readout label="max |FD − exact|" value={formatValue(fdNodal, 2)} accent={fdNodal > 5 * femNodal + 1e-8 ? 'warn' : 'ink'} />
          <Readout label="L² FEM" value={formatValue(femL2, 2)} />
          <Readout label="L² FD" value={formatValue(fdL2, 2)} />
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

function MatrixView({
  K, selected, maxAbs,
}: {
  K: number[][];
  selected: number;
  maxAbs: number;
}) {
  const n = K.length;
  return (
    <div>
      <div className="hud-label" style={{ marginBottom: 8, color: 'var(--color-magenta)' }}>
        assembled K (interior)
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
          gap: 3,
        }}
        aria-label="Assembled interior stiffness matrix"
      >
        {K.map((row, r) =>
          row.map((v, c) => {
            const on = r === selected;
            const t = Math.min(1, Math.abs(v) / maxAbs);
            const bg = v < -1e-12
              ? withAlpha(ACCENTS.cyan, 0.12 + 0.7 * t)
              : v > 1e-12
                ? withAlpha(ACCENTS.magenta, 0.12 + 0.7 * t)
                : 'transparent';
            const empty = Math.abs(v) < 1e-12;
            return (
              <div
                key={`${r}-${c}`}
                style={{
                  aspectRatio: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: bg,
                  border: on
                    ? '1.5px solid var(--color-cyan)'
                    : '1px solid var(--color-rule)',
                  color: empty ? 'var(--color-ink-ghost)' : 'var(--color-ink)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: n > 5 ? 10 : 11,
                  lineHeight: 1,
                }}
              >
                {empty ? '·' : formatValue(v, 2)}
              </div>
            );
          }),
        )}
      </div>
      <p style={{ margin: '8px 0 0', color: 'var(--color-ink-faint)', fontSize: '0.85rem', lineHeight: 1.45 }}>
        Highlighted row is ∫ φ′<sub>{selected + 1}</sub> φ′<sub>j</sub>. Two 2×2s overlap on the diagonal.
      </p>
    </div>
  );
}

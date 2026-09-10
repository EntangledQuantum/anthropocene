import { useEffect, useMemo, useRef, useState } from 'react';
import Plot from './Plot.tsx';
import { Button, Panel, Readout, ReadoutRow, Slider, Toggle } from './controls.tsx';
import {
  ACCENTS, DEFAULT_MARGIN, formatTick, formatValue, makeScale, type Series,
} from './chart-core.ts';
import {
  ATAN_ROOT, ATAN_XMAX, ATAN_XMIN, CATCH_X0, DIVERGE_X0,
  atanShift, basinScan, fateOf, jacobianAt, newtonRun,
  type JacobianMode, type NewtonFate,
} from '../../lib/numerics/newton.ts';

export interface NewtonLabProps {
  x0?: number;
  jacobian?: JacobianMode;
  lockJacobian?: boolean;
  caption?: string;
  height?: number;
}

const X_DOMAIN: [number, number] = [ATAN_XMIN, ATAN_XMAX];
const Y_DOMAIN: [number, number] = [-2.15, 1.35];
const clampX = (v: number) => Math.min(X_DOMAIN[1], Math.max(X_DOMAIN[0], v));

const F = (x: number) => atanShift.F([x])[0]!;
const curve = Array.from({ length: 240 }, (_, i) => {
  const x = X_DOMAIN[0] + ((X_DOMAIN[1] - X_DOMAIN[0]) * i) / 239;
  return [x, F(x)] as const;
});

const fateLabel: Record<NewtonFate, string> = {
  catch: 'catch',
  diverge: 'diverge',
  singular: 'singular J',
};

/**
 * Coupled views of one Newton run on F(x) = arctan(x) − 1/2: the residual
 * with its tangent (the linear solve), the residual history, and the basin
 * of attraction. Drag x₀. Cyan catches quadratically; magenta flies.
 */
export default function NewtonLab({
  x0: x00 = DIVERGE_X0,
  jacobian: jac0 = 'exact',
  lockJacobian = false,
  caption,
  height = 176,
}: NewtonLabProps) {
  const [x0, setX0] = useState(() => clampX(x00));
  const [jacobian, setJacobian] = useState<JacobianMode>(jac0);

  const run = useMemo(
    () => newtonRun(atanShift, [x0], { jacobian, maxIter: 12 }),
    [x0, jacobian],
  );
  const fate = fateOf(run, atanShift);
  const last = run.at(-1)!;

  const basin = useMemo(
    () => basinScan(atanShift, X_DOMAIN[0], X_DOMAIN[1], 260, { jacobian, maxIter: 16 }),
    [jacobian],
  );

  const histSeries: Series[] = [
    {
      key: 'res',
      label: 'log₁₀ |F|',
      color: fate === 'catch' ? 'cyan' : 'magenta',
      style: 'line+dots',
      width: 2,
      points: run.map((s) => [s.k, Math.log10(Math.max(s.residualNorm, 1e-18))] as const),
    },
  ];

  const setFrom = (v: number) => setX0(clampX(v));

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title="basin of attraction"
        right={
          <span className="hud-label" style={{ color: fate === 'catch' ? 'var(--color-cyan)' : 'var(--color-magenta)' }}>
            {jacobian === 'identity' ? 'Picard, J = I' : 'Newton'} · {fateLabel[fate]}
          </span>
        }
      >
        {!lockJacobian && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <Toggle
              options={[
                { key: 'exact', label: 'Newton J = F′', accent: 'cyan' },
                { key: 'identity', label: 'Picard J = I', accent: 'magenta' },
              ]}
              value={[jacobian]}
              onChange={(next) => setJacobian((next[0] as JacobianMode) ?? 'exact')}
            />
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 0.95fr)',
            gap: 12,
            alignItems: 'start',
          }}
        >
          <FunctionPane x0={x0} runX={run.map((s) => s.x[0]!)} jacobian={jacobian} onDrag={setFrom} height={height} />
          <Plot
            series={histSeries}
            x={{ label: 'k', domain: [0, 12] }}
            y={{ label: 'log₁₀ |F|', domain: [-16.5, 1.2] }}
            height={height}
            legend={false}
            rules={[{ y: -12, label: '10⁻¹²', color: ACCENTS.faint }]}
          />
        </div>

        <BasinStrip samples={basin} x0={x0} onDrag={setFrom} />

        <div style={{ marginTop: 10 }}>
          <Slider
            spec={{
              key: 'x0',
              label: 'starting guess',
              symbol: 'x₀',
              min: X_DOMAIN[0],
              max: X_DOMAIN[1],
              step: 0.02,
              value: x0,
            }}
            value={x0}
            onChange={setFrom}
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <Button onClick={() => setFrom(CATCH_X0)} accent="cyan">x₀ = 0.2, inside</Button>
          <Button onClick={() => setFrom(DIVERGE_X0)} accent="magenta">x₀ = 3, outside</Button>
          <Button onClick={() => setFrom(x00)} accent="warn">reset</Button>
        </div>

        <ReadoutRow>
          <Readout label="x₀" value={formatValue(x0, 3)} accent="cyan" />
          <Readout label="x*" value={formatValue(ATAN_ROOT, 3)} />
          <Readout label="|F(x₀)|" value={run[0]!.residualNorm.toExponential(2)} />
          <Readout
            label="|F| last"
            value={Number.isFinite(last.residualNorm) ? last.residualNorm.toExponential(2) : '∞'}
            accent={fate === 'catch' ? 'cyan' : 'magenta'}
          />
          <Readout
            label="x_N"
            value={last.finite ? formatValue(last.x[0]!, 3) : '∞'}
            accent={fate === 'catch' ? 'ok' : 'magenta'}
          />
          <Readout label="steps" value={String(last.k)} />
        </ReadoutRow>
      </Panel>
      {caption && (
        <p style={{ margin: '8px 4px 0', color: 'var(--color-ink-faint)', fontSize: '0.92rem', lineHeight: 1.5 }}>
          {caption}
        </p>
      )}
    </figure>
  );
}

function FunctionPane({
  x0, runX, jacobian, onDrag, height,
}: {
  x0: number;
  runX: number[];
  jacobian: JacobianMode;
  onDrag: (x: number) => void;
  height: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(720);
  const dragging = useRef(false);
  const m = DEFAULT_MARGIN;
  const iw = Math.max(10, width - m.left - m.right);
  const ih = Math.max(10, height - m.top - m.bottom);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dummy: Series[] = [{ key: 'f', points: curve }];
  const xScale = useMemo(() => makeScale({ domain: X_DOMAIN }, dummy, 0, [0, iw]), [iw]);
  const yScale = useMemo(() => makeScale({ domain: Y_DOMAIN }, dummy, 1, [ih, 0]), [ih]);

  const J0 = jacobianAt(atanShift, [x0], jacobian)[0]![0]!;
  const F0 = F(x0);
  const tangent = [
    [X_DOMAIN[0], F0 + J0 * (X_DOMAIN[0] - x0)],
    [X_DOMAIN[1], F0 + J0 * (X_DOMAIN[1] - x0)],
  ] as const;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(iw * dpr);
    canvas.height = Math.round(ih * dpr);
    canvas.style.width = `${iw}px`;
    canvas.style.height = `${ih}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, iw, ih);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.strokeStyle = ACCENTS.cyan;
    ctx.lineWidth = 2;
    let pen = false;
    for (const [x, y] of curve) {
      const px = xScale(x);
      const py = yScale(y);
      if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = ACCENTS.magenta;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    ctx.moveTo(xScale(tangent[0][0]), yScale(tangent[0][1]));
    ctx.lineTo(xScale(tangent[1][0]), yScale(tangent[1][1]));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = ACCENTS.orchid;
    ctx.lineWidth = 1.3;
    ctx.globalAlpha = 0.85;
    for (let i = 0; i + 1 < runX.length; i++) {
      const a = runX[i]!;
      const b = runX[i + 1]!;
      if (!Number.isFinite(a) || !Number.isFinite(b)) break;
      if (Math.abs(a) > 8 && Math.abs(b) > 8) break;
      const Fa = F(a);
      ctx.beginPath();
      ctx.moveTo(xScale(a), yScale(0));
      ctx.lineTo(xScale(a), yScale(Fa));
      ctx.lineTo(xScale(b), yScale(0));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = ACCENTS.orchid;
    for (const x of runX) {
      if (!Number.isFinite(x) || x < X_DOMAIN[0] - 0.2 || x > X_DOMAIN[1] + 0.2) continue;
      ctx.beginPath();
      ctx.arc(xScale(x), yScale(F(x)), 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.fillStyle = ACCENTS.cyan;
    ctx.arc(xScale(x0), yScale(F0), 5, 0, Math.PI * 2);
    ctx.fill();
  }, [xScale, yScale, iw, ih, x0, runX, J0, F0]);

  const xTicks = xScale.ticks(6);
  const yTicks = yScale.ticks(5);
  const gridStroke = 'rgba(58,48,84,0.55)';
  const axisStroke = 'rgba(111,102,131,0.85)';
  const hx = xScale(x0);
  const hy = yScale(F0);
  const rx = xScale(ATAN_ROOT);

  const pointerX = (e: React.PointerEvent) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    return xScale.invert(e.clientX - r.left - m.left);
  };

  return (
    <div ref={wrapRef} className="hud hud-brackets" style={{ position: 'relative', padding: '8px 8px 2px' }}>
      <div style={{ position: 'relative', width: '100%', height }}>
        <div style={{ position: 'absolute', left: m.left, top: m.top }}>
          <canvas ref={canvasRef} style={{ display: 'block' }} />
        </div>
        <svg
          width={width}
          height={height}
          style={{ position: 'absolute', inset: 0, overflow: 'visible', cursor: dragging.current ? 'grabbing' : 'ew-resize', touchAction: 'none' }}
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            dragging.current = true;
            onDrag(pointerX(e));
          }}
          onPointerMove={(e) => { if (dragging.current) onDrag(pointerX(e)); }}
          onPointerUp={() => { dragging.current = false; }}
          onPointerCancel={() => { dragging.current = false; }}
          role="img"
          aria-label="F(x) with Newton tangent — drag horizontally to set x0"
        >
          <g transform={`translate(${m.left},${m.top})`}>
            {xTicks.map((t) => (
              <line key={`gx${t}`} x1={xScale(t)} x2={xScale(t)} y1={0} y2={ih} stroke={gridStroke} />
            ))}
            {yTicks.map((t) => (
              <line key={`gy${t}`} x1={0} x2={iw} y1={yScale(t)} y2={yScale(t)} stroke={gridStroke} />
            ))}
            <line x1={0} x2={iw} y1={yScale(0)} y2={yScale(0)} stroke={ACCENTS.faint} strokeDasharray="3 3" />
            <line x1={rx} x2={rx} y1={0} y2={ih} stroke={ACCENTS.ok} strokeDasharray="4 4" />
            <line x1={hx} x2={hx} y1={0} y2={ih} stroke={ACCENTS.cyan} strokeOpacity={0.35} />
            <line x1={0} x2={iw} y1={ih} y2={ih} stroke={axisStroke} />
            <line x1={0} x2={0} y1={0} y2={ih} stroke={axisStroke} />
            {xTicks.map((t) => (
              <g key={`tx${t}`} transform={`translate(${xScale(t)},${ih})`}>
                <line y2={4} stroke={axisStroke} />
                <text y={16} textAnchor="middle" fill={ACCENTS.faint} fontSize={10} fontFamily="var(--font-mono)">
                  {formatTick(t)}
                </text>
              </g>
            ))}
            {yTicks.map((t) => (
              <g key={`ty${t}`} transform={`translate(0,${yScale(t)})`}>
                <line x2={-4} stroke={axisStroke} />
                <text x={-8} y={3} textAnchor="end" fill={ACCENTS.faint} fontSize={10} fontFamily="var(--font-mono)">
                  {formatTick(t)}
                </text>
              </g>
            ))}
            <text x={iw} y={ih + 28} textAnchor="end" fill={ACCENTS.faint} fontSize={10} fontFamily="var(--font-mono)">x</text>
            <text x={4} y={-4} fill={ACCENTS.faint} fontSize={10} fontFamily="var(--font-mono)">F(x)</text>
            <circle cx={hx} cy={hy} r={9} fill={ACCENTS.cyan} fillOpacity={0.18} stroke={ACCENTS.cyan} strokeWidth={1.5} />
          </g>
        </svg>
      </div>
    </div>
  );
}

function BasinStrip({
  samples, x0, onDrag,
}: {
  samples: { x: number; fate: NewtonFate }[];
  x0: number;
  onDrag: (x: number) => void;
}) {
  const dragging = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const fromEvent = (e: React.PointerEvent) => {
    const el = wrapRef.current;
    if (!el) return x0;
    const r = el.getBoundingClientRect();
    const u = (e.clientX - r.left) / Math.max(1, r.width);
    return X_DOMAIN[0] + u * (X_DOMAIN[1] - X_DOMAIN[0]);
  };

  const marker = (x0 - X_DOMAIN[0]) / (X_DOMAIN[1] - X_DOMAIN[0]);

  return (
    <div style={{ marginTop: 12 }}>
      <span className="hud-label" style={{ display: 'block', marginBottom: 6 }}>
        basin — cyan catches, magenta flies. drag x₀ on the strip.
      </span>
      <div
        ref={wrapRef}
        role="slider"
        aria-label="basin of attraction"
        aria-valuemin={X_DOMAIN[0]}
        aria-valuemax={X_DOMAIN[1]}
        aria-valuenow={x0}
        tabIndex={0}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          dragging.current = true;
          onDrag(fromEvent(e));
        }}
        onPointerMove={(e) => { if (dragging.current) onDrag(fromEvent(e)); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') onDrag(x0 - 0.05);
          if (e.key === 'ArrowRight') onDrag(x0 + 0.05);
        }}
        style={{
          position: 'relative',
          display: 'flex',
          height: 22,
          borderRadius: 3,
          overflow: 'hidden',
          cursor: 'ew-resize',
          touchAction: 'none',
          outline: '1px solid color-mix(in oklab, var(--color-rule) 80%, transparent)',
        }}
      >
        {samples.map((s, i) => (
          <div
            key={i}
            title={`x = ${s.x.toFixed(2)} · ${s.fate}`}
            style={{
              flex: 1,
              background: s.fate === 'catch' ? 'var(--color-cyan)' : 'var(--color-magenta)',
              opacity: s.fate === 'catch' ? 0.85 : 0.55,
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            left: `${marker * 100}%`,
            top: -3,
            bottom: -3,
            width: 2,
            background: 'var(--color-ink)',
            boxShadow: '0 0 8px color-mix(in oklab, var(--color-cyan) 50%, transparent)',
            transform: 'translateX(-1px)',
            pointerEvents: 'none',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span className="hud-label">{X_DOMAIN[0]}</span>
        <span className="hud-label">x* = {ATAN_ROOT.toFixed(2)}</span>
        <span className="hud-label">{X_DOMAIN[1]}</span>
      </div>
    </div>
  );
}

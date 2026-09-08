import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ACCENTS, DEFAULT_MARGIN, colorOf, formatTick, formatValue, logTicks, makeScale,
  type AxisSpec, type Margin, type Series,
} from './chart-core.ts';

export interface PlotProps {
  series: Series[];
  x?: AxisSpec;
  y?: AxisSpec;
  height?: number;
  margin?: Partial<Margin>;
  /** Show the series legend. Off for single-series plots. */
  legend?: boolean;
  /** Crosshair + nearest-point readout on hover. */
  crosshair?: boolean;
  /** Horizontal reference lines, e.g. the exact solution or a tolerance. */
  rules?: { y?: number; x?: number; label?: string; color?: string; dash?: number[] }[];
  /** Annotations pinned to data coordinates. */
  notes?: { x: number; y: number; text: string; color?: string }[];
  caption?: string;
  className?: string;
}

/**
 * The 2D plotting primitive every lesson builds on.
 *
 * Data is drawn to a canvas (a convergence sweep or a long trajectory can be
 * tens of thousands of points, which would choke SVG), while axes, rules and
 * annotations are SVG so they stay crisp and selectable. Both layers share one
 * pair of d3 scales, so they cannot disagree.
 */
export default function Plot({
  series, x, y, height = 300, margin, legend, crosshair = true,
  rules = [], notes = [], caption, className = '',
}: PlotProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<{ px: number; py: number } | null>(null);

  const m = { ...DEFAULT_MARGIN, ...margin };
  const iw = Math.max(10, width - m.left - m.right);
  const ih = Math.max(10, height - m.top - m.bottom);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const xScale = useMemo(() => makeScale(x, series, 0, [0, iw]), [x, series, iw]);
  const yScale = useMemo(() => makeScale(y, series, 1, [ih, 0]), [y, series, ih]);

  const xTicks = useMemo(() => {
    const [lo, hi] = xScale.domain() as [number, number];
    return x?.scale === 'log'
      ? logTicks(lo, hi, iw, 54)
      : xScale.ticks(x?.ticks ?? Math.max(2, Math.round(iw / 90)));
  }, [xScale, iw, x?.ticks, x?.scale]);

  const yTicks = useMemo(() => {
    const [lo, hi] = yScale.domain() as [number, number];
    return y?.scale === 'log'
      ? logTicks(lo, hi, ih, 34)
      : yScale.ticks(y?.ticks ?? Math.max(2, Math.round(ih / 46)));
  }, [yScale, ih, y?.ticks, y?.scale]);

  /* ── canvas data layer ─────────────────────────────────────────────────── */
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

    series.forEach((s, i) => {
      const color = colorOf(s.color, i);
      const style = s.style ?? 'line';
      ctx.globalAlpha = s.muted ? 0.28 : 1;

      const projected: [number, number][] = [];
      for (const [dx, dy] of s.points) {
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) { projected.push([NaN, NaN]); continue; }
        projected.push([xScale(dx), yScale(dy)]);
      }

      if (style === 'area') {
        ctx.beginPath();
        let open = false;
        for (const [px, py] of projected) {
          if (!Number.isFinite(px) || !Number.isFinite(py)) { open = false; continue; }
          if (!open) { ctx.moveTo(px, ih); ctx.lineTo(px, py); open = true; }
          else ctx.lineTo(px, py);
        }
        ctx.lineTo(projected.at(-1)?.[0] ?? 0, ih);
        ctx.closePath();
        ctx.fillStyle = `${color}22`;
        ctx.fill();
      }

      if (style === 'line' || style === 'line+dots' || style === 'area') {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = s.width ?? 1.75;
        if (s.dash) ctx.setLineDash(s.dash); else ctx.setLineDash([]);
        let pen = false;
        for (const [px, py] of projected) {
          // A NaN breaks the stroke rather than drawing a line across the gap,
          // so a diverged run reads as "it stopped", not as a wild spike.
          if (!Number.isFinite(px) || !Number.isFinite(py)) { pen = false; continue; }
          if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (style === 'dots' || style === 'line+dots') {
        ctx.fillStyle = color;
        const r = s.width ?? 2.8;
        for (const [px, py] of projected) {
          if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
    ctx.globalAlpha = 1;
  }, [series, xScale, yScale, iw, ih]);

  /* ── nearest-point lookup for the crosshair ────────────────────────────── */
  const nearest = useMemo(() => {
    if (!hover) return null;
    let best: { s: Series; i: number; px: number; py: number; d2: number } | null = null;
    series.forEach((s, si) => {
      s.points.forEach((p, i) => {
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return;
        const px = xScale(p[0]);
        const py = yScale(p[1]);
        const d2 = (px - hover.px) ** 2 + (py - hover.py) ** 2;
        if (!best || d2 < best.d2) best = { s, i, px, py, d2 };
      });
    });
    if (!best || best.d2 > 40 ** 2) return null;
    const idx = series.indexOf(best.s);
    return { ...best, color: colorOf(best.s.color, idx) };
  }, [hover, series, xScale, yScale]);

  const gridStroke = 'rgba(58,48,84,0.55)';
  const axisStroke = 'rgba(111,102,131,0.85)';

  return (
    <figure ref={wrapRef} className={`not-prose my-6 ${className}`} style={{ margin: '1.5rem 0' }}>
      <div
        className="hud hud-brackets"
        style={{ position: 'relative', padding: '10px 8px 4px', overflow: 'hidden' }}
      >
        <div style={{ position: 'relative', width: '100%', height }}>
          <div style={{ position: 'absolute', left: m.left, top: m.top }}>
            <canvas ref={canvasRef} style={{ display: 'block' }} />
          </div>

          <svg
            width={width}
            height={height}
            style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
            onPointerMove={(e) => {
              if (!crosshair) return;
              const r = e.currentTarget.getBoundingClientRect();
              setHover({ px: e.clientX - r.left - m.left, py: e.clientY - r.top - m.top });
            }}
            onPointerLeave={() => setHover(null)}
            role="img"
            aria-label={caption ?? 'plot'}
          >
            <g transform={`translate(${m.left},${m.top})`}>
              {/* grid */}
              {xTicks.map((t) => (
                <line key={`gx${t}`} x1={xScale(t)} x2={xScale(t)} y1={0} y2={ih} stroke={gridStroke} strokeWidth={1} />
              ))}
              {yTicks.map((t) => (
                <line key={`gy${t}`} x1={0} x2={iw} y1={yScale(t)} y2={yScale(t)} stroke={gridStroke} strokeWidth={1} />
              ))}

              {/* reference rules */}
              {rules.map((r, i) => {
                const horizontal = r.y !== undefined;
                const v = horizontal ? yScale(r.y!) : xScale(r.x!);
                const stroke = r.color ?? ACCENTS.faint;
                return (
                  <g key={`rule${i}`}>
                    <line
                      x1={horizontal ? 0 : v} x2={horizontal ? iw : v}
                      y1={horizontal ? v : 0} y2={horizontal ? v : ih}
                      stroke={stroke} strokeWidth={1} strokeDasharray={(r.dash ?? [4, 4]).join(' ')}
                    />
                    {r.label && (
                      <text
                        x={horizontal ? iw - 4 : v + 4} y={horizontal ? v - 5 : 11}
                        textAnchor={horizontal ? 'end' : 'start'}
                        fill={stroke} fontSize={10} fontFamily="var(--font-mono)" letterSpacing="0.08em"
                      >{r.label}</text>
                    )}
                  </g>
                );
              })}

              {/* frame */}
              <line x1={0} x2={iw} y1={ih} y2={ih} stroke={axisStroke} strokeWidth={1} />
              <line x1={0} x2={0} y1={0} y2={ih} stroke={axisStroke} strokeWidth={1} />

              {/* ticks */}
              {xTicks.map((t) => (
                <g key={`tx${t}`} transform={`translate(${xScale(t)},${ih})`}>
                  <line y2={4} stroke={axisStroke} />
                  <text y={16} textAnchor="middle" fill={ACCENTS.faint} fontSize={10} fontFamily="var(--font-mono)">
                    {(x?.format ?? ((v: number) => formatTick(v, x?.scale === 'log')))(t)}
                  </text>
                </g>
              ))}
              {yTicks.map((t) => (
                <g key={`ty${t}`} transform={`translate(0,${yScale(t)})`}>
                  <line x2={-4} stroke={axisStroke} />
                  <text x={-8} dy="0.32em" textAnchor="end" fill={ACCENTS.faint} fontSize={10} fontFamily="var(--font-mono)">
                    {(y?.format ?? ((v: number) => formatTick(v, y?.scale === 'log')))(t)}
                  </text>
                </g>
              ))}

              {/* annotations */}
              {notes.map((n, i) => (
                <text
                  key={`n${i}`} x={xScale(n.x)} y={yScale(n.y)}
                  fill={n.color ?? ACCENTS.ink} fontSize={11} fontFamily="var(--font-mono)"
                >{n.text}</text>
              ))}

              {/* crosshair */}
              {nearest && (
                <g pointerEvents="none">
                  <line x1={nearest.px} x2={nearest.px} y1={0} y2={ih} stroke={nearest.color} strokeWidth={1} strokeOpacity={0.45} />
                  <line x1={0} x2={iw} y1={nearest.py} y2={nearest.py} stroke={nearest.color} strokeWidth={1} strokeOpacity={0.45} />
                  <circle cx={nearest.px} cy={nearest.py} r={4} fill={nearest.color} />
                  <circle cx={nearest.px} cy={nearest.py} r={8} fill="none" stroke={nearest.color} strokeOpacity={0.5} />
                </g>
              )}
            </g>

            {/* axis labels */}
            {x?.label && (
              <text x={m.left + iw / 2} y={height - 2} textAnchor="middle"
                fill={ACCENTS.faint} fontSize={10} fontFamily="var(--font-mono)" letterSpacing="0.14em">
                {x.label.toUpperCase()}
              </text>
            )}
            {y?.label && (
              <text transform={`translate(11,${m.top + ih / 2}) rotate(-90)`} textAnchor="middle"
                fill={ACCENTS.faint} fontSize={10} fontFamily="var(--font-mono)" letterSpacing="0.14em">
                {y.label.toUpperCase()}
              </text>
            )}
          </svg>

          {/* hover readout */}
          {nearest && (
            <div
              className="readout"
              style={{
                position: 'absolute',
                left: Math.min(m.left + nearest.px + 12, width - 150),
                top: Math.max(m.top + nearest.py - 34, 2),
                pointerEvents: 'none',
                background: 'color-mix(in oklab, var(--color-abyss) 92%, transparent)',
                border: `1px solid ${nearest.color}`,
                padding: '3px 7px',
                fontSize: 10,
                lineHeight: 1.45,
                color: 'var(--color-ink)',
                whiteSpace: 'nowrap',
              } as CSSProperties}
            >
              {nearest.s.label && (
                <div style={{ color: nearest.color, letterSpacing: '0.08em' }}>{nearest.s.label}</div>
              )}
              <div>{formatValue(nearest.s.points[nearest.i][0], 4)}, {formatValue(nearest.s.points[nearest.i][1], 4)}</div>
            </div>
          )}
        </div>

        {(legend ?? series.length > 1) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', padding: '6px 4px 4px', borderTop: '1px solid var(--color-rule)', marginTop: 4 }}>
            {series.map((s, i) => (
              <span key={s.key} className="hud-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: s.muted ? 0.5 : 1 }}>
                <span style={{
                  width: 14, height: 0,
                  borderTop: `2px ${s.dash ? 'dashed' : 'solid'} ${colorOf(s.color, i)}`,
                }} />
                <span style={{ color: 'var(--color-ink-soft)' }}>{s.label ?? s.key}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {caption && (
        <figcaption className="hud-label" style={{ marginTop: 8, lineHeight: 1.6, letterSpacing: '0.06em', textTransform: 'none' }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

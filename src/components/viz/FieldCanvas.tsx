import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  enclosedCharge,
  fieldAt,
  fluxThroughCircle,
  fluxThroughSphere,
  nullPoints,
  potentialAt,
  seedFieldLines,
  traceFieldLine,
  type FieldKind,
  type Source,
} from '../../lib/physics/fields.ts';
import { createShaderSurface, observeSize } from './gl/webgl.ts';
import { Button, Panel, Readout, ReadoutRow, Toggle } from './controls.tsx';

/* ── the field canvas ──────────────────────────────────────────────────────
   The shared visual world for gravitation (13), electric field (21), Gauss
   (22), potential (23), magnetic force (27) and sources of B (28).

   Arrows on empty space that change when you drag a source. The potential is
   evaluated PER PIXEL on the GPU — the structure that teaches (how
   equipotentials crowd near a sharp concentration, how a dipole's zero surface
   runs) lives at a resolution a coarse CPU grid erases. Field lines are traced
   on the CPU, where an adaptive arc-length RK4 can actually follow them.

   The `kind` prop is a physics choice, not a style one. See the long note at
   the top of lib/physics/fields.ts: flux through a plane loop is invariant only
   for a 1/r field, so a Gauss lesson must use kind="line".
   ──────────────────────────────────────────────────────────────────────── */

const MAX_SOURCES = 8;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform vec4 u_bounds;          // x0, y0, x1, y1
uniform vec3 u_src[${MAX_SOURCES}];  // x, y, q
uniform int  u_count;
uniform int  u_kind;            // 0 = 1/r^2 (point), 1 = 1/r (line)
uniform float u_soften;
uniform float u_sign;           // +1 repulsive (charge), -1 attractive (gravity)
uniform float u_spacing;        // potential between adjacent equipotentials
uniform float u_showEqui;
uniform float u_showMag;

const vec3 COOL = vec3(0.310, 0.847, 0.910);   // cyan   — low potential
const vec3 WARM = vec3(1.000, 0.302, 0.620);   // magenta— high potential
const vec3 IRIS = vec3(0.561, 0.612, 0.961);

void main() {
  vec2 p = mix(u_bounds.xy, u_bounds.zw, v_uv);

  float V = 0.0;
  vec2  E = vec2(0.0);
  for (int i = 0; i < ${MAX_SOURCES}; i++) {
    if (i >= u_count) break;
    vec2 d = p - u_src[i].xy;
    float q = u_src[i].z;
    float r2 = dot(d, d) + u_soften * u_soften;
    float r = sqrt(r2);
    if (u_kind == 0) {
      V += u_sign * q / r;
      E += (u_sign * q / (r2 * r)) * d;
    } else {
      V += -u_sign * q * log(r);
      E += (u_sign * q / r2) * d;
    }
  }

  // Potential, squashed so a single charge's spike does not eat the range.
  float t = 0.5 + 0.5 * (V / (1.0 + abs(V)));
  vec3 col = mix(COOL, WARM, t);
  float base = 0.10 + 0.30 * abs(V / (1.0 + abs(V)));

  // Field magnitude as an optional brightness wash.
  float mag = length(E);
  float magT = mag / (1.0 + mag);
  base = mix(base, base + 0.45 * magT, u_showMag);

  // Equipotential contours, anti-aliased against the local rate of change of
  // V so the lines stay one pixel wide whether they are crowded or sparse.
  float c = V / u_spacing;
  float g = abs(fract(c - 0.5) - 0.5) / max(fwidth(c), 1e-6);
  float contour = (1.0 - smoothstep(0.0, 1.6, g)) * u_showEqui;

  vec3 rgb = mix(col * base, mix(col, IRIS, 0.35), contour * 0.85);
  float a = clamp(base * 1.7 + contour * 0.5, 0.0, 1.0);
  outColor = vec4(rgb, a);
}`;

export interface FieldCanvasProps {
  /** Sources in world coordinates. Charge (or mass) in `q`. */
  sources?: { x: number; y: number; q: number }[];
  /** 'point' = 1/r², a 3D charge in a slice. 'line' = 1/r, an end-on line
   *  charge, and the only honest choice for a plane flux integral. */
  kind?: FieldKind;
  /** Gravity: the field points toward a positive source. */
  attractive?: boolean;
  bounds?: [number, number, number, number];
  showLines?: boolean;
  showEquipotential?: boolean;
  showMagnitude?: boolean;
  showNulls?: boolean;
  /** A draggable, resizable Gaussian loop with a live flux readout. */
  gaussian?: boolean;
  /** Let the learner move the sources. Off makes this a figure. */
  draggable?: boolean;
  /** What the field is called in the readouts. */
  label?: string;
  height?: number;
  caption?: string;
}

interface Handle {
  kind: 'source' | 'loop-centre' | 'loop-radius';
  index: number;
}

export default function FieldCanvas({
  sources: initialSources = [
    { x: -1, y: 0, q: 1 },
    { x: 1, y: 0, q: -1 },
  ],
  kind = 'point',
  attractive = false,
  bounds = [-3, -2, 3, 2],
  showLines: showLines0 = true,
  showEquipotential: showEqui0 = true,
  showMagnitude: showMag0 = false,
  showNulls = false,
  gaussian = false,
  draggable = true,
  label = 'field',
  height = 380,
  caption,
}: FieldCanvasProps) {
  const seed = useMemo(() => initialSources.slice(0, MAX_SOURCES), [initialSources]);
  const [sources, setSources] = useState<Source[]>(seed);
  const [loop, setLoop] = useState({ x: 0, y: 0, r: 1.2 });
  const [showLines, setShowLines] = useState(showLines0);
  const [showEqui, setShowEqui] = useState(showEqui0);
  const [showMag, setShowMag] = useState(showMag0);
  const [size, setSize] = useState({ w: 760, h: height });
  const [drag, setDrag] = useState<Handle | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<ReturnType<typeof createShaderSurface>>(null);
  const [glFailed, setGlFailed] = useState(false);

  useEffect(() => setSources(seed), [seed]);

  const opts = useMemo(() => ({ kind, attractive, soften: 0.05 }), [kind, attractive]);

  /* ── the view box ────────────────────────────────────────────────────────
     The requested bounds are expanded — never cropped — until their aspect
     matches the canvas. Without this the world is stretched to fit, and the
     equipotentials around a point charge render as ellipses, which is a
     picture of a physics that is not true.
     ────────────────────────────────────────────────────────────────────── */
  const [x0, y0, x1, y1] = useMemo(() => {
    const [ax0, ay0, ax1, ay1] = bounds;
    const cx = (ax0 + ax1) / 2;
    const cy = (ay0 + ay1) / 2;
    let halfW = (ax1 - ax0) / 2;
    let halfH = (ay1 - ay0) / 2;

    const screen = size.w / size.h;
    if (halfW / halfH < screen) halfW = halfH * screen;
    else halfH = halfW / screen;

    return [cx - halfW, cy - halfH, cx + halfW, cy + halfH] as const;
  }, [bounds, size.w, size.h]);

  /* ── world ↔ screen ──────────────────────────────────────────────────── */
  const sx = useCallback((x: number) => ((x - x0) / (x1 - x0)) * size.w, [x0, x1, size.w]);
  // Screen y runs downward; the shader's v_uv already does the same flip.
  const sy = useCallback((y: number) => size.h - ((y - y0) / (y1 - y0)) * size.h, [y0, y1, size.h]);
  const wx = useCallback((px: number) => x0 + (px / size.w) * (x1 - x0), [x0, x1, size.w]);
  const wy = useCallback((py: number) => y0 + ((size.h - py) / size.h) * (y1 - y0), [y0, y1, size.h]);

  /* ── GPU layer ───────────────────────────────────────────────────────── */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    return observeSize(el, (w) => setSize({ w, h: height }));
  }, [height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = createShaderSurface(canvas, FRAG);
    if (!s) {
      setGlFailed(true);
      return;
    }
    surfaceRef.current = s;
    return () => {
      s.destroy();
      surfaceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const s = surfaceRef.current;
    if (!s) return;
    s.resize(size.w, size.h);

    const packed = new Float32Array(MAX_SOURCES * 3);
    sources.slice(0, MAX_SOURCES).forEach((src, i) => {
      packed[i * 3] = src.x;
      packed[i * 3 + 1] = src.y;
      packed[i * 3 + 2] = src.q;
    });

    s.set('u_bounds', [x0, y0, x1, y1]);
    s.setArray('u_src', packed, 3);
    s.setInt('u_count', Math.min(sources.length, MAX_SOURCES));
    s.setInt('u_kind', kind === 'point' ? 0 : 1);
    s.set('u_soften', 0.05);
    s.set('u_sign', attractive ? -1 : 1);
    s.set('u_spacing', kind === 'point' ? 0.35 : 0.45);
    s.set('u_showEqui', showEqui ? 1 : 0);
    s.set('u_showMag', showMag ? 1 : 0);
    s.draw();
  }, [sources, size, x0, y0, x1, y1, kind, attractive, showEqui, showMag]);

  /* ── CPU overlays ────────────────────────────────────────────────────── */
  const lines = useMemo(() => {
    if (!showLines) return [];
    const box = { x0, y0, x1, y1 };
    return seedFieldLines(sources, 7, 0.14).map(({ start, backward }) =>
      traceFieldLine(sources, start, {
        ...opts,
        backward,
        ds: 0.028,
        steps: 900,
        bounds: box,
        hitRadius: 0.11,
      }),
    );
  }, [sources, showLines, x0, y0, x1, y1, opts]);

  const nulls = useMemo(
    () => (showNulls ? nullPoints(sources, { x0, y0, x1, y1 }, opts, 140) : []),
    [sources, showNulls, x0, y0, x1, y1, opts],
  );

  const flux = useMemo(() => {
    if (!gaussian) return null;
    return kind === 'line'
      ? fluxThroughCircle(sources, loop.x, loop.y, loop.r, opts, 1024)
      : fluxThroughSphere(sources, loop.x, loop.y, loop.r, opts, 2048);
  }, [gaussian, sources, loop, kind, opts]);

  const enclosed = gaussian ? enclosedCharge(sources, loop.x, loop.y, loop.r) : 0;

  /* ── dragging ────────────────────────────────────────────────────────── */
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const rect = svgRef.current!.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const x = Math.min(x1, Math.max(x0, wx(px)));
      const y = Math.min(y1, Math.max(y0, wy(py)));

      if (drag.kind === 'source') {
        setSources((prev) => prev.map((s, i) => (i === drag.index ? { ...s, x, y } : s)));
      } else if (drag.kind === 'loop-centre') {
        setLoop((p) => ({ ...p, x, y }));
      } else {
        setLoop((p) => ({ ...p, r: Math.max(0.15, Math.hypot(x - p.x, y - p.y)) }));
      }
    };
    const up = () => setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drag, wx, wy, x0, x1, y0, y1]);

  const flipSign = (i: number) =>
    setSources((prev) => prev.map((s, k) => (k === i ? { ...s, q: -s.q } : s)));

  const fmt = (v: number, d = 2) =>
    Math.abs(v) >= 1000 ? v.toExponential(1) : String(Math.round(v * 10 ** d) / 10 ** d);

  const pathOf = (pts: readonly (readonly [number, number])[]) =>
    pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join('');

  return (
    <Panel
      title={`${label} — drag the sources`}
      right={
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Toggle
            multiple
            options={[
              { key: 'lines', label: 'field lines', accent: 'cyan' },
              { key: 'equi', label: 'equipotentials', accent: 'iris' },
              { key: 'mag', label: 'strength', accent: 'orchid' },
            ]}
            value={[
              ...(showLines ? ['lines'] : []),
              ...(showEqui ? ['equi'] : []),
              ...(showMag ? ['mag'] : []),
            ]}
            onChange={(next) => {
              setShowLines(next.includes('lines'));
              setShowEqui(next.includes('equi'));
              setShowMag(next.includes('mag'));
            }}
          />
          <Button onClick={() => setSources(seed)} accent="iris">reset</Button>
        </span>
      }
    >
      <div ref={wrapRef} style={{ position: 'relative', width: '100%', height }}>
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, borderRadius: 6, background: 'var(--color-void)' }}
        />
        {glFailed && (
          <p style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--color-warn)' }}>
            This figure needs WebGL2.
          </p>
        )}
        <svg
          ref={svgRef}
          width={size.w}
          height={size.h}
          style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
          role="img"
          aria-label={`${label} of ${sources.length} sources, with field lines and equipotentials. Sources are draggable.`}
        >
          {lines.map((pts, i) => (
            <path
              key={`l-${i}`}
              d={pathOf(pts)}
              fill="none"
              stroke="var(--color-ink-soft)"
              strokeWidth={1.1}
              opacity={0.72}
            />
          ))}

          {gaussian && (
            <>
              <circle
                cx={sx(loop.x)}
                cy={sy(loop.y)}
                r={(loop.r / (x1 - x0)) * size.w}
                fill="var(--color-aqua)"
                fillOpacity={0.05}
                stroke="var(--color-aqua)"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
              <circle
                cx={sx(loop.x)}
                cy={sy(loop.y)}
                r={6}
                fill="var(--color-aqua)"
                style={{ cursor: 'move' }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setDrag({ kind: 'loop-centre', index: 0 });
                }}
              />
              <circle
                cx={sx(loop.x + loop.r)}
                cy={sy(loop.y)}
                r={6}
                fill="var(--color-void)"
                stroke="var(--color-aqua)"
                strokeWidth={2}
                style={{ cursor: 'ew-resize' }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setDrag({ kind: 'loop-radius', index: 0 });
                }}
              />
            </>
          )}

          {nulls.map(([x, y], i) => (
            <g key={`n-${i}`}>
              <circle cx={sx(x)} cy={sy(y)} r={5} fill="none" stroke="var(--color-warn)" strokeWidth={1.6} />
              <text
                x={sx(x) + 9}
                y={sy(y) + 4}
                fill="var(--color-warn)"
                style={{ fontSize: 11, letterSpacing: '0.05em' }}
              >
                E = 0
              </text>
            </g>
          ))}

          {sources.map((s, i) => (
            <g key={`s-${i}`}>
              <circle
                cx={sx(s.x)}
                cy={sy(s.y)}
                r={9 + 2.5 * Math.min(3, Math.abs(s.q))}
                fill={s.q >= 0 ? 'var(--color-magenta)' : 'var(--color-cyan)'}
                stroke="var(--color-void)"
                strokeWidth={2}
                style={{ cursor: draggable ? 'grab' : 'default' }}
                onPointerDown={(e) => {
                  if (!draggable) return;
                  e.preventDefault();
                  setDrag({ kind: 'source', index: i });
                }}
                onDoubleClick={() => draggable && flipSign(i)}
              />
              <text
                x={sx(s.x)}
                y={sy(s.y) + 4}
                textAnchor="middle"
                fill="var(--color-void)"
                style={{ fontSize: 13, fontWeight: 700, pointerEvents: 'none' }}
              >
                {s.q >= 0 ? '+' : '−'}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <ReadoutRow>
        <Readout label="sources" value={String(sources.length)} accent="iris" />
        <Readout
          label="falls as"
          value={kind === 'point' ? '1 / r²  (point)' : '1 / r  (line)'}
          accent="orchid"
        />
        {gaussian && <Readout label="charge enclosed" value={fmt(enclosed)} accent="magenta" />}
        {gaussian && flux !== null && (
          <Readout
            label={kind === 'line' ? 'flux ∮E·n̂ dl' : 'flux ∮E·n̂ dA'}
            value={fmt(flux)}
            accent="aqua"
          />
        )}
        {gaussian && (
          <Readout label="loop radius" value={`${fmt(loop.r)} m`} accent="cyan" />
        )}
      </ReadoutRow>

      {draggable && (
        <p style={{ marginTop: 8, color: 'var(--color-ink-faint)', fontSize: '0.9rem' }}>
          Drag a source to move it. Double-click one to flip its sign.
        </p>
      )}

      {caption && (
        <p style={{ marginTop: 8, color: 'var(--color-ink-soft)', fontSize: '0.95rem', lineHeight: 1.6 }}>
          {caption}
        </p>
      )}
    </Panel>
  );
}

/** Field vector at a point — exported so a lesson's scenario pack can probe the
 *  same world the canvas draws, rather than recomputing it. */
export { fieldAt, potentialAt };

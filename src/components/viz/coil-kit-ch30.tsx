/**
 * Chapter 30's drawing kit: a coil (with an optional iron core and its field),
 * a lamp, a capacitor, an energy bar and charge dots. Everything that moves is
 * driven imperatively from refs inside one requestAnimationFrame loop, so a
 * lamp can brighten smoothly over seconds without React re-rendering per frame
 * (AGENTS.md §2 rule 5). It draws; it computes nothing. Every number comes
 * from src/lib/physics/inductance.ts.
 *
 * Dots move along each wire at a speed proportional to its current, so their
 * displacement is the charge that has flowed. In an LC loop they slosh.
 */
import { useEffect, useRef, type MutableRefObject } from 'react';
import { C } from './scene.tsx';

export type Pt = readonly [number, number];
export type Setter = MutableRefObject<((v: number) => void) | null>;

/** One animation loop per scene. `step` gets dt in seconds; the latest closure is always used. */
export function useFrame(step: (dt: number, now: number) => void) {
  const fn = useRef(step);
  fn.current = step;
  useEffect(() => {
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      fn.current(dt, now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
}

const useSetter = (): Setter => useRef(null);
export { useSetter };

/* ── coil ──────────────────────────────────────────────────────────────── */

/**
 * A coil wound along a horizontal axis from x1 to x2 at height y. Leads leave
 * from its two ends upward by `lead` px. `core` draws an iron bar spanning
 * [core[0], core[1]] along the axis. `field` receives a setter for the field
 * inside: magnitude 0..1 (opacity) with sign giving the direction.
 */
export function Coil({ x1, x2, y, r = 22, turns = 9, lead = 0, core, field, label }: {
  x1: number; x2: number; y: number; r?: number; turns?: number; lead?: number;
  core?: readonly [number, number]; field?: Setter; label?: string;
}) {
  const g = useRef<SVGGElement>(null);
  const pitch = (x2 - x1) / turns;
  const cx = (x1 + x2) / 2;
  if (field) field.current = (v: number) => {
    const el = g.current;
    if (!el) return;
    el.setAttribute('opacity', Math.min(1, Math.abs(v)).toFixed(3));
    el.setAttribute('transform', `translate(${cx},0) scale(${v < 0 ? -1 : 1},1) translate(${-cx},0)`);
  };
  return <g>
    {lead > 0 && <>
      <line x1={x1} x2={x1} y1={y - r} y2={y - r - lead} stroke={C.soft} strokeWidth={2.5} />
      <line x1={x2} x2={x2} y1={y - r} y2={y - r - lead} stroke={C.soft} strokeWidth={2.5} />
    </>}
    {core && <rect x={core[0]} y={y - r * 0.45} width={core[1] - core[0]} height={r * 0.9} rx={3}
      fill="var(--color-rule-bright)" stroke={C.faint} strokeWidth={1.2} />}
    {field && <g ref={g} opacity={0} pointerEvents="none">
      {[-0.55, 0, 0.55].map((f) => {
        const yy = y + f * r;
        return <g key={f}>
          <line x1={x1 - 22} x2={x2 + 22} y1={yy} y2={yy} stroke={C.field} strokeWidth={1.6} />
          <path d={`M${cx + 7},${yy} l-10,-5 l0,10 z`} fill={C.field} />
        </g>;
      })}
    </g>}
    {Array.from({ length: turns }, (_, i) => (
      <ellipse key={i} cx={x1 + (i + 0.5) * pitch} cy={y} rx={pitch * 0.42} ry={r}
        fill="none" stroke={C.ink} strokeOpacity={0.8} strokeWidth={2} />
    ))}
    {label && <text x={cx} y={y + r + 20} textAnchor="middle" fontSize={13} fill={C.soft}>{label}</text>}
  </g>;
}

/* ── lamp ──────────────────────────────────────────────────────────────── */

/** A lamp whose glow (0..1) is set through `glow`, never through props. */
export function Lamp({ x, y, glow, label }: { x: number; y: number; glow: Setter; label?: string }) {
  const halo = useRef<SVGCircleElement>(null);
  const rim = useRef<SVGCircleElement>(null);
  const fil = useRef<SVGPathElement>(null);
  glow.current = (b: number) => {
    const v = Math.max(0, Math.min(1, b));
    halo.current?.setAttribute('r', (18 + 42 * v).toFixed(1));
    halo.current?.setAttribute('opacity', (0.9 * v).toFixed(3));
    rim.current?.setAttribute('stroke', v > 0.02 ? 'var(--color-aqua)' : 'var(--color-ink-faint)');
    fil.current?.setAttribute('stroke-opacity', (0.3 + 0.7 * v).toFixed(3));
  };
  const gid = `ch30-glow-${x}-${y}`;
  return <g>
    <defs>
      <radialGradient id={gid}>
        <stop offset="0%" stopColor={C.energy} stopOpacity={0.9} />
        <stop offset="45%" stopColor={C.energy} stopOpacity={0.35} />
        <stop offset="100%" stopColor={C.energy} stopOpacity={0} />
      </radialGradient>
    </defs>
    <circle ref={halo} cx={x} cy={y} r={18} opacity={0} fill={`url(#${gid})`} pointerEvents="none" />
    <circle ref={rim} cx={x} cy={y} r={16} fill={C.surface} stroke={C.faint} strokeWidth={2} />
    <path ref={fil} d={`M${x - 8},${y + 5} L${x - 4},${y - 5} L${x},${y + 5} L${x + 4},${y - 5} L${x + 8},${y + 5}`}
      fill="none" stroke={C.ink} strokeOpacity={0.3} strokeWidth={1.8} />
    {label && <text x={x + 24} y={y + 5} fontSize={14} fontWeight={600} fill={C.ink}>{label}</text>}
  </g>;
}

/** Glow from current: √(power) ∝ |I|, so a quarter of the power still reads as clearly lit. */
export const glowOf = (I: number, Ifull: number) => Math.min(1, Math.abs(I) / Ifull);

/* ── energy bar ────────────────────────────────────────────────────────── */

/** A vertical bar, 0..1 of its height, set through `fill`. */
export function EnergyBar({ x, y, w = 34, h, label, sub, fill, color = C.energy }: {
  x: number; y: number; w?: number; h: number; label: string; sub?: string; fill: Setter; color?: string;
}) {
  const bar = useRef<SVGRectElement>(null);
  fill.current = (f: number) => {
    const v = Math.max(0, Math.min(1, f));
    bar.current?.setAttribute('y', (y + h * (1 - v)).toFixed(1));
    bar.current?.setAttribute('height', (h * v).toFixed(1));
  };
  return <g>
    <rect x={x} y={y} width={w} height={h} fill="none" stroke={C.rule} strokeWidth={1.2} />
    <rect ref={bar} x={x} y={y + h} width={w} height={0} fill={color} opacity={0.85} />
    <text x={x + w / 2} y={y + h + 18} textAnchor="middle" fontSize={13} fill={C.ink}>{label}</text>
    {sub && <text x={x + w / 2} y={y + h + 34} textAnchor="middle" fontSize={12} fill={C.faint}>{sub}</text>}
  </g>;
}

/* ── dots ──────────────────────────────────────────────────────────────── */

function lengthOf(pts: readonly Pt[]) {
  let L = 0;
  for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  return L;
}

function pointAt(pts: readonly Pt[], s: number): Pt {
  for (let k = 1; k < pts.length; k++) {
    const d = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    if (s <= d || k === pts.length - 1) {
      const f = d > 0 ? Math.min(1, s / d) : 0;
      return [pts[k - 1][0] + f * (pts[k][0] - pts[k - 1][0]), pts[k - 1][1] + f * (pts[k][1] - pts[k - 1][1])];
    }
    s -= d;
  }
  return pts[pts.length - 1];
}

const SPACING = 18;

/**
 * Charge dots on fixed wires. `paths` maps a wire id to its polyline, drawn in
 * the direction of positive current; `currents.current[id]` is read every
 * frame, in amps. Speed is `pxPerAmp` px/s per amp.
 */
export function FlowDots({ paths, currents, pxPerAmp }: {
  paths: Record<string, readonly Pt[]>; currents: MutableRefObject<Record<string, number>>; pxPerAmp: number;
}) {
  const phase = useRef<Record<string, number>>({});
  const els = useRef<Record<string, (SVGCircleElement | null)[]>>({});
  const ids = Object.keys(paths);
  useFrame((dt) => {
    for (const id of ids) {
      const pts = paths[id];
      const L = lengthOf(pts);
      const n = Math.max(1, Math.floor(L / SPACING));
      const gap = L / n;
      const I = currents.current[id] ?? 0;
      const ph = ((phase.current[id] ?? 0) + I * pxPerAmp * dt) % gap;
      phase.current[id] = ph < 0 ? ph + gap : ph;
      const list = els.current[id] ?? [];
      for (let k = 0; k < list.length; k++) {
        const el = list[k];
        if (!el) continue;
        const [x, y] = pointAt(pts, (k * gap + phase.current[id]) % L);
        el.setAttribute('cx', x.toFixed(1));
        el.setAttribute('cy', y.toFixed(1));
        el.setAttribute('opacity', Math.abs(I) > 1e-4 ? '0.95' : '0.3');
      }
    }
  });
  return <g pointerEvents="none">
    {ids.map((id) => {
      const L = lengthOf(paths[id]);
      const n = Math.max(1, Math.floor(L / SPACING));
      return Array.from({ length: n }, (_, k) => {
        const [x, y] = pointAt(paths[id], k * (L / n));
        return <circle key={`${id}-${k}`} ref={(el) => { (els.current[id] ??= [])[k] = el; }}
          cx={x} cy={y} r={2.8} fill={C.velocity} opacity={0.3} />;
      });
    })}
  </g>;
}

/* ── a knob you drag sideways ──────────────────────────────────────────── */

/**
 * A horizontal drag target in SVG view units: reports x in [lo, hi]. Keyboard:
 * arrows move by `step` px. Draw the thing being dragged separately.
 */
export function DragX({ x, y, lo, hi, onChange, label, step = 2, w = 44, h = 44, disabled }: {
  x: number; y: number; lo: number; hi: number; onChange: (x: number) => void; label: string;
  step?: number; w?: number; h?: number; disabled?: boolean;
}) {
  const drag = useRef<{ dx: number } | null>(null);
  const toView = (el: SVGElement, cx: number, cy: number) => {
    const svg = el.ownerSVGElement!;
    const m = svg.getScreenCTM();
    return m ? new DOMPoint(cx, cy).matrixTransform(m.inverse()).x : x;
  };
  const set = (v: number) => onChange(Math.max(lo, Math.min(hi, v)));
  return <g>
    <rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill="transparent"
      style={{ cursor: disabled ? 'not-allowed' : 'ew-resize' }} tabIndex={0} role="slider" aria-label={label}
      aria-valuenow={Math.round(x)} aria-valuemin={Math.round(lo)} aria-valuemax={Math.round(hi)}
      onPointerDown={(e) => {
        if (disabled) return;
        (e.target as Element).setPointerCapture(e.pointerId);
        drag.current = { dx: toView(e.target as SVGElement, e.clientX, e.clientY) - x };
      }}
      onPointerMove={(e) => { if (drag.current) set(toView(e.target as SVGElement, e.clientX, e.clientY) - drag.current.dx); }}
      onPointerUp={() => { drag.current = null; }}
      onKeyDown={(e) => {
        if (disabled) return;
        const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : 0;
        if (!d) return;
        e.preventDefault();
        set(x + d);
      }} />
    <circle cx={x} cy={y} r={9} fill={C.surface} stroke={disabled ? C.faint : 'var(--color-accent)'} strokeWidth={2.5} pointerEvents="none" />
    <circle cx={x} cy={y} r={3} fill={disabled ? C.faint : 'var(--color-accent)'} pointerEvents="none" />
  </g>;
}

/* ── a switch you click ────────────────────────────────────────────────── */

/** A knife switch on a horizontal wire from x1 to x2. */
export function KnifeSwitch({ x1, x2, y, closed, onToggle, label = 'switch' }: {
  x1: number; x2: number; y: number; closed: boolean; onToggle?: () => void; label?: string;
}) {
  return <g style={{ cursor: onToggle ? 'pointer' : undefined }} onClick={onToggle}>
    <rect x={x1 - 6} y={y - 30} width={x2 - x1 + 12} height={40} fill="transparent" />
    <circle cx={x1} cy={y} r={3.5} fill={C.ink} />
    <circle cx={x2} cy={y} r={3.5} fill={C.ink} />
    <line x1={x1} y1={y} x2={closed ? x2 : x2 - 8} y2={closed ? y : y - 24} stroke={C.ink} strokeWidth={2.5} strokeLinecap="round" />
    <text x={(x1 + x2) / 2} y={y + 22} textAnchor="middle" fontSize={13} fill={C.soft}>{label}</text>
  </g>;
}

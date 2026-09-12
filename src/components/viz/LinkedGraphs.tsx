import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { monotoneSpline, type Knot } from '../../lib/physics/interp.ts';
import { accumulate, distanceTravelled, turningPoints } from '../../lib/physics/kinematics.ts';
import { Button, Panel, Readout, ReadoutRow } from './controls.tsx';

/* ── the linked x/v/a stack ────────────────────────────────────────────────
   Chapter 2's reusable picture: three plots that must agree with one another.

   The learner shapes ONE curve by dragging its handles; the other two are
   derived live — never stored, never editable, never allowed to disagree. That
   is the entire pedagogical claim of the chapter made structural: you cannot
   produce an x(t) that contradicts its own v(t) here, because there is only one
   curve and two readings of it.

   Rendered as SVG rather than the canvas the other labs use. The data is ~240
   points per panel, which SVG handles without effort, and drag handles want
   real DOM hit-testing rather than a hand-rolled distance search.
   ──────────────────────────────────────────────────────────────────────── */

type Quantity = 'displacement' | 'distance' | 'final-x' | 'final-v';

export interface LinkedGraphsProps {
  /** Which curve carries the handles. The other two follow from calculus. */
  edit?: 'v' | 'a';
  /** Initial handle positions as [t, value] pairs. */
  knots?: [number, number][];
  duration?: number;
  x0?: number;
  v0?: number;
  /** A target the learner shapes the curve to hit. Omit for a free sandbox. */
  goal?: { quantity: Quantity; value: number; tol: number; label: string };
  /** Shade the signed area under v(t) — "the integral is the displacement",
   *  said with pixels instead of a sentence. */
  showArea?: boolean;
  /** Vertical guides at v = 0 crossings, drawn across all three panels. */
  showTurning?: boolean;
  /** Read-only figure mode: no handles, no goal. */
  locked?: boolean;
  height?: number;
  caption?: string;
}

const N = 241;
const PAD = { l: 52, r: 14, t: 10, b: 8 };
const AXIS_H = 26;

interface PanelSpec {
  key: 'x' | 'v' | 'a';
  label: string;
  unit: string;
  color: string;
}

const PANELS: PanelSpec[] = [
  { key: 'x', label: 'position', unit: 'm', color: 'var(--color-aqua)' },
  { key: 'v', label: 'velocity', unit: 'm/s', color: 'var(--color-cyan)' },
  { key: 'a', label: 'acceleration', unit: 'm/s²', color: 'var(--color-orchid)' },
];

const QUANTITY_LABEL: Record<Quantity, string> = {
  displacement: 'net displacement',
  distance: 'distance travelled',
  'final-x': 'final position',
  'final-v': 'final velocity',
};

const QUANTITY_UNIT: Record<Quantity, string> = {
  displacement: 'm',
  distance: 'm',
  'final-x': 'm',
  'final-v': 'm/s',
};

/** A padded, symmetric-about-zero-when-it-should-be domain.
 *
 *  Velocity and acceleration panels keep zero visible even when the data never
 *  crosses it: the sign of these curves is the lesson, and a y-axis that
 *  crops zero away hides exactly the thing being taught. */
function domainOf(ys: number[], includeZero: boolean): [number, number] {
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (includeZero) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (hi - lo < 1e-9) {
    hi += 1;
    lo -= 1;
  }
  const pad = (hi - lo) * 0.14;
  return [lo - pad, hi + pad];
}

function niceTicks(lo: number, hi: number, count = 4): number[] {
  const span = hi - lo;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    out.push(Math.abs(v) < step * 1e-6 ? 0 : v);
  }
  return out;
}

const fmt = (v: number) =>
  Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)
    ? v.toExponential(1)
    : String(Math.round(v * 100) / 100);

export default function LinkedGraphs({
  edit = 'v',
  knots: initialKnots,
  duration = 10,
  x0 = 0,
  v0 = 0,
  goal,
  showArea = true,
  showTurning = true,
  locked = false,
  height = 150,
  caption,
}: LinkedGraphsProps) {
  const defaults: Knot[] = useMemo(
    () =>
      (initialKnots ?? [
        [0, 0],
        [duration * 0.25, 4],
        [duration * 0.5, 4],
        [duration * 0.75, 0],
        [duration, 0],
      ]).map(([t, y]) => ({ t, y })),
    [initialKnots, duration],
  );

  const [knots, setKnots] = useState<Knot[]>(defaults);
  const [width, setWidth] = useState(720);
  const [dragging, setDragging] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => setKnots(defaults), [defaults]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  /* ── the one curve, read three ways ───────────────────────────────────── */
  const model = useMemo(() => {
    const spline = monotoneSpline(knots);
    const t = Array.from({ length: N }, (_, i) => (i * duration) / (N - 1));
    const shaped = t.map((ti) => spline.at(ti));

    let x: number[];
    let v: number[];
    let a: number[];

    if (edit === 'v') {
      v = shaped;
      // Analytic derivative of the spline, not a finite difference of it: the
      // acceleration panel should show the curve's real slope, with none of
      // the noise a numerical derivative of a dragged curve would add.
      a = t.map((ti) => spline.slopeAt(ti));
      x = accumulate(t, v, x0);
    } else {
      a = shaped;
      v = accumulate(t, a, v0);
      x = accumulate(t, v, x0);
    }

    return {
      t,
      x,
      v,
      a,
      spline,
      turns: turningPoints(t, v),
      distance: distanceTravelled(t, v),
      displacement: x[N - 1] - x[0],
      finalX: x[N - 1],
      finalV: v[N - 1],
    };
  }, [knots, duration, edit, x0, v0]);

  const measured: Record<Quantity, number> = {
    displacement: model.displacement,
    distance: model.distance,
    'final-x': model.finalX,
    'final-v': model.finalV,
  };
  const hit = goal ? Math.abs(measured[goal.quantity] - goal.value) <= goal.tol : false;

  /* ── geometry ─────────────────────────────────────────────────────────── */
  const plotW = Math.max(120, width - PAD.l - PAD.r);
  const totalH = PANELS.length * height + AXIS_H + PAD.t;
  const tx = useCallback((t: number) => PAD.l + (t / duration) * plotW, [duration, plotW]);
  const invTx = useCallback(
    (px: number) => ((px - PAD.l) / plotW) * duration,
    [duration, plotW],
  );

  const panelGeom = PANELS.map((p, i) => {
    const top = PAD.t + i * height;
    const inner = height - 18;
    const ys = model[p.key];
    const [lo, hi] = domainOf(ys, p.key !== 'x');
    const ty = (val: number) => top + inner - ((val - lo) / (hi - lo)) * inner;
    const invTy = (px: number) => lo + ((top + inner - px) / inner) * (hi - lo);
    return { ...p, top, inner, lo, hi, ty, invTy, ys };
  });

  const editedPanel = panelGeom.find((p) => p.key === edit)!;

  /* ── dragging ─────────────────────────────────────────────────────────── */
  const svgRef = useRef<SVGSVGElement>(null);

  const pointerValue = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const rect = svgRef.current!.getBoundingClientRect();
      return {
        t: invTx(e.clientX - rect.left),
        y: editedPanel.invTy(e.clientY - rect.top),
      };
    },
    [invTx, editedPanel],
  );

  useEffect(() => {
    if (dragging === null) return;

    const move = (e: PointerEvent) => {
      const { y } = pointerValue(e);
      setKnots((prev) => {
        const next = [...prev];
        // Handles keep their time: only the value moves. Letting t slide as
        // well turns "shape this curve" into a fiddly layout task and stops
        // two learners' answers from being comparable.
        next[dragging] = { t: prev[dragging].t, y: Math.round(y * 20) / 20 };
        return next;
      });
    };
    const up = () => setDragging(null);

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, pointerValue]);

  const nudge = (i: number, d: number) =>
    setKnots((prev) => {
      const next = [...prev];
      next[i] = { t: prev[i].t, y: Math.round((prev[i].y + d) * 20) / 20 };
      return next;
    });

  const pathFor = (g: (typeof panelGeom)[number]) =>
    g.ys.map((y, i) => `${i === 0 ? 'M' : 'L'}${tx(model.t[i]).toFixed(2)},${g.ty(y).toFixed(2)}`).join('');

  /* ── the signed area under v ──────────────────────────────────────────── */
  const areaBands = useMemo(() => {
    if (!showArea) return [];
    const g = panelGeom.find((p) => p.key === 'v')!;
    const zero = g.ty(0);
    const bands: { d: string; positive: boolean }[] = [];
    let start = 0;
    const sign = (i: number) => Math.sign(model.v[i]);
    for (let i = 1; i <= N; i++) {
      if (i === N || (sign(i) !== sign(start) && sign(i) !== 0)) {
        if (i - start > 1) {
          const seg = model.t.slice(start, i);
          const vs = model.v.slice(start, i);
          const d =
            `M${tx(seg[0]).toFixed(2)},${zero.toFixed(2)}` +
            seg.map((t, k) => `L${tx(t).toFixed(2)},${g.ty(vs[k]).toFixed(2)}`).join('') +
            `L${tx(seg[seg.length - 1]).toFixed(2)},${zero.toFixed(2)}Z`;
          bands.push({ d, positive: sign(start) >= 0 });
        }
        start = i - 1;
      }
    }
    return bands;
  }, [showArea, panelGeom, model, tx]);

  return (
    <Panel
      title={`linked graphs — shape ${edit === 'v' ? 'v(t)' : 'a(t)'}, the rest follows`}
      right={
        !locked && (
          <Button onClick={() => setKnots(defaults)} accent="iris" title="Back to the starting curve">
            reset
          </Button>
        )
      }
    >
      <div ref={wrapRef} style={{ width: '100%' }}>
        <svg
          ref={svgRef}
          width={width}
          height={totalH}
          style={{ display: 'block', touchAction: 'none', overflow: 'visible' }}
          role="img"
          aria-label={`Linked position, velocity and acceleration graphs. Drag the handles on the ${edit === 'v' ? 'velocity' : 'acceleration'} curve.`}
        >
          {/* turning-point guides, drawn under everything and spanning all
              three panels so the same instant is the same x on every graph */}
          {showTurning &&
            model.turns.map((tt, i) => (
              <line
                key={`turn-${i}`}
                x1={tx(tt)}
                x2={tx(tt)}
                y1={PAD.t}
                y2={PAD.t + PANELS.length * height - 18}
                stroke="var(--color-rule-bright)"
                strokeDasharray="3 4"
                strokeWidth={1}
              />
            ))}

          {panelGeom.map((g) => {
            const ticks = niceTicks(g.lo, g.hi, 3);
            const isEdited = g.key === edit;
            return (
              <g key={g.key}>
                {ticks.map((tk) => (
                  <g key={tk}>
                    <line
                      x1={PAD.l}
                      x2={PAD.l + plotW}
                      y1={g.ty(tk)}
                      y2={g.ty(tk)}
                      stroke={tk === 0 ? 'var(--color-rule-bright)' : 'var(--color-rule)'}
                      strokeWidth={1}
                    />
                    <text
                      x={PAD.l - 8}
                      y={g.ty(tk) + 3.5}
                      textAnchor="end"
                      fill="var(--color-ink-faint)"
                      style={{ fontSize: 10.5, fontFamily: 'var(--font-mono, monospace)' }}
                    >
                      {fmt(tk)}
                    </text>
                  </g>
                ))}

                {g.key === 'v' &&
                  areaBands.map((b, i) => (
                    <path
                      key={`band-${i}`}
                      d={b.d}
                      fill={b.positive ? 'var(--color-cyan)' : 'var(--color-magenta)'}
                      opacity={0.13}
                    />
                  ))}

                <path
                  d={pathFor(g)}
                  fill="none"
                  stroke={g.color}
                  strokeWidth={isEdited ? 2.4 : 1.8}
                  strokeLinejoin="round"
                  opacity={isEdited ? 1 : 0.88}
                />

                <text
                  x={PAD.l + 6}
                  y={g.top + 12}
                  fill={g.color}
                  style={{ fontSize: 11.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                >
                  {g.label}
                  <tspan fill="var(--color-ink-ghost)"> ({g.unit})</tspan>
                  {isEdited && !locked && <tspan fill="var(--color-ink-faint)"> — drag me</tspan>}
                </text>
              </g>
            );
          })}

          {/* handles, last so they sit above every curve */}
          {!locked &&
            knots.map((k, i) => (
              <g key={`h-${i}`}>
                <circle
                  cx={tx(k.t)}
                  cy={editedPanel.ty(k.y)}
                  r={dragging === i ? 9 : 7}
                  fill="var(--color-void)"
                  stroke={editedPanel.color}
                  strokeWidth={2.5}
                  style={{ cursor: 'ns-resize' }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setDragging(i);
                  }}
                />
                <circle
                  cx={tx(k.t)}
                  cy={editedPanel.ty(k.y)}
                  r={2.5}
                  fill={editedPanel.color}
                  pointerEvents="none"
                />
                {/* keyboard path: every handle is focusable and nudgeable, so
                    the solvable is doable without a pointer */}
                <rect
                  x={tx(k.t) - 10}
                  y={editedPanel.ty(k.y) - 10}
                  width={20}
                  height={20}
                  fill="transparent"
                  tabIndex={0}
                  role="slider"
                  aria-label={`handle at t = ${fmt(k.t)} seconds`}
                  aria-valuenow={Math.round(k.y * 100) / 100}
                  onKeyDown={(e) => {
                    const step = e.shiftKey ? 1 : 0.25;
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      nudge(i, step);
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      nudge(i, -step);
                    }
                  }}
                  style={{ cursor: 'ns-resize', outlineOffset: 2 }}
                />
              </g>
            ))}

          {/* shared time axis */}
          <g>
            <line
              x1={PAD.l}
              x2={PAD.l + plotW}
              y1={PAD.t + PANELS.length * height - 16}
              y2={PAD.t + PANELS.length * height - 16}
              stroke="var(--color-rule-bright)"
            />
            {niceTicks(0, duration, 5).map((tk) => (
              <text
                key={tk}
                x={tx(tk)}
                y={PAD.t + PANELS.length * height + 2}
                textAnchor="middle"
                fill="var(--color-ink-faint)"
                style={{ fontSize: 10.5, fontFamily: 'var(--font-mono, monospace)' }}
              >
                {fmt(tk)}
              </text>
            ))}
            <text
              x={PAD.l + plotW}
              y={PAD.t + PANELS.length * height + 16}
              textAnchor="end"
              fill="var(--color-ink-ghost)"
              style={{ fontSize: 10.5, letterSpacing: '0.06em' }}
            >
              time (s)
            </text>
          </g>
        </svg>
      </div>

      <ReadoutRow>
        <Readout label="net displacement" value={`${fmt(model.displacement)} m`} accent="aqua" />
        <Readout label="distance travelled" value={`${fmt(model.distance)} m`} accent="orchid" />
        <Readout label="final velocity" value={`${fmt(model.finalV)} m/s`} accent="cyan" />
        {showTurning && (
          <Readout label="turning points" value={String(model.turns.length)} accent="iris" />
        )}
      </ReadoutRow>

      {goal && !locked && (
        <div
          style={{
            marginTop: 10,
            padding: '10px 12px',
            borderRadius: 8,
            border: `1px solid ${hit ? 'var(--sig-ok)' : 'var(--color-rule-bright)'}`,
            background: hit ? 'color-mix(in oklab, var(--sig-ok) 10%, transparent)' : 'var(--color-surface)',
            fontSize: '0.95rem',
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: hit ? 'var(--sig-ok)' : 'var(--color-ink)' }}>
            {hit ? 'Hit it. ' : 'Target: '}
          </strong>
          {goal.label}{' '}
          <span style={{ color: 'var(--color-ink-faint)' }}>
            — you have {QUANTITY_LABEL[goal.quantity]}{' '}
            <span style={{ color: hit ? 'var(--sig-ok)' : 'var(--color-cyan)' }}>
              {fmt(measured[goal.quantity])} {QUANTITY_UNIT[goal.quantity]}
            </span>
            , wanted {fmt(goal.value)} ± {fmt(goal.tol)}.
          </span>
        </div>
      )}

      {caption && (
        <p style={{ marginTop: 10, color: 'var(--color-ink-soft)', fontSize: '0.95rem', lineHeight: 1.6 }}>
          {caption}
        </p>
      )}
    </Panel>
  );
}

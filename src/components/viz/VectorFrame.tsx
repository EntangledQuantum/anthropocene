import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  along,
  angleBetween2,
  componentsIn,
  cross2,
  dot2,
  mag2,
  rotate2,
  type Vec2,
} from '../../lib/physics/vectors.ts';
import { Button, Panel, Slider, type ParamSpec } from './controls.tsx';

/* ── an arrow and a grid you can turn under it ─────────────────────────────
   Chapter 1's reusable picture, and the only honest way to make the claim:
   a vector is not its components.

   The learner turns the GRID. The arrows do not move — not by a pixel — while
   every component readout swings through its whole range. Beside the
   components sit the quantities that are supposed to survive a change of
   description: the length of each arrow, the angle between them, the dot
   product, the signed area. Those are recomputed EVERY FRAME FROM THE ROTATED
   COMPONENTS, which is the arithmetic the learner would do by hand, so the
   drift printed next to them is a real 10⁻¹⁶ and not a zero we decided on.

   Flip `turn` to "arrow" and the same slider turns the first arrow instead,
   with the grid held still. Now the components move exactly as before — and
   the dot product moves too, because this time something physical happened.
   The pair of modes is the lesson: identical numbers on the left, different
   numbers on the right.

   The vectors stored in state are always the AUTHORED ones. What is drawn is
   derived: turning the grid changes the frame angle, turning the arrow changes
   the drawn arrow. Keeping those separate is what makes the invariant column
   meaningful rather than circular.

   No animation loop: the slider and the drag handles are the only motion, both
   learner-driven, so React state is the right home for them.
   ──────────────────────────────────────────────────────────────────────── */

export interface VectorFrameProps {
  /** Arrows in world coordinates. Components are read for all of them; the
   *  first is the one the projection and the basis picture are about. */
  vectors: { key: string; label: string; x: number; y: number; accent?: Accent; draggable?: boolean }[];
  /** Starting angle of the grid, in degrees. */
  angle?: number;
  /** What the slider turns. 'grid' redescribes; 'arrow' changes the world. */
  turn?: 'grid' | 'arrow';
  /** Offer the learner the switch. The contrast is the lesson, so default on. */
  allowTurnToggle?: boolean;
  /** Dashed drop-lines from each tip onto the turned axes. */
  showComponents?: boolean;
  /** Draw a = a₁ê₁′ + a₂ê₂′ as two chained arrows along the turned axes. */
  showBasis?: boolean;
  /** Split the first vector along and across the second. */
  showProjection?: boolean;
  /** The two-column table: what moved, what did not. */
  showInvariants?: boolean;
  /** Half-width of the visible world, in the same units as the vectors. */
  extent?: number;
  height?: number;
  locked?: boolean;
  title?: string;
  caption?: string;
}

type Accent = 'cyan' | 'magenta' | 'aqua' | 'orchid' | 'iris' | 'rose';

const ACCENTS: Accent[] = ['cyan', 'magenta', 'aqua', 'orchid'];
const DEG = 180 / Math.PI;
const TINY = 1e-9;

const fmt = (v: number, digits = 2) => {
  const r = Math.abs(v) < 5e-13 ? 0 : v;
  return r.toFixed(digits);
};

/** A change that is zero to roundoff should LOOK like roundoff, not like a
 *  zero somebody typed. */
const fmtDrift = (v: number) => (Math.abs(v) < 1e-9 ? `≈0 (${Math.abs(v).toExponential(0)})` : fmt(v, 2));

/** One line of either ledger. Grid rather than a table: lesson prose styles
 *  `table { display: block }` for horizontal scrolling, which is right for
 *  prose and wrong inside a widget. */
function LedgerRow({
  label, value, valueColor = 'var(--color-aqua)', delta,
}: {
  label: ReactNode; value: string; valueColor?: string; delta?: number;
}) {
  const moved = delta !== undefined && Math.abs(delta) > 1e-9;
  return (
    <>
      <span style={{ color: 'var(--color-ink-soft)', fontSize: '0.95rem' }}>{label}</span>
      <span className="readout" style={{ textAlign: 'right', fontSize: 14, color: valueColor }}>{value}</span>
      <span
        className="readout"
        style={{ textAlign: 'right', fontSize: 11.5, color: moved ? 'var(--sig-warn)' : 'var(--color-ink-faint)' }}
      >
        {delta === undefined ? '' : `Δ ${fmtDrift(delta)}`}
      </span>
    </>
  );
}

export default function VectorFrame({
  vectors,
  angle = 0,
  turn: initialTurn = 'grid',
  allowTurnToggle = true,
  showComponents = true,
  showBasis = false,
  showProjection = false,
  showInvariants = true,
  extent = 6,
  height = 400,
  locked = false,
  title,
  caption,
}: VectorFrameProps) {
  const authored = useMemo<Vec2[]>(() => vectors.map((v) => [v.x, v.y] as Vec2), [vectors]);

  const [vecs, setVecs] = useState<Vec2[]>(authored);
  const [theta, setTheta] = useState(angle);
  const [turn, setTurn] = useState<'grid' | 'arrow'>(initialTurn);
  const [dragging, setDragging] = useState<number | null>(null);
  const [width, setWidth] = useState(720);

  useEffect(() => setVecs(authored), [authored]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  /* ── what is drawn, and in which frame it is read ─────────────────────── */
  const rad = (theta * Math.PI) / 180;
  // Turning the grid leaves the arrows alone and tilts the frame. Turning the
  // arrow tilts the FIRST arrow only — turning them all would be a rotation of
  // the whole configuration, which changes nothing and teaches nothing.
  const frame = turn === 'grid' ? rad : 0;
  const drawn: Vec2[] = turn === 'grid' ? vecs : vecs.map((v, i) => (i === 0 ? rotate2(v, rad) : v));

  const comps = drawn.map((v) => componentsIn(v, frame));
  const baseComps = vecs.map((v) => componentsIn(v, 0));

  /* Invariants computed from the components the learner can see, not from the
     stored vectors — otherwise the "unchanged" column would be true by
     construction and would prove nothing. */
  const inv = (cs: Vec2[]) => ({
    mag0: mag2(cs[0]),
    mag1: cs.length > 1 ? mag2(cs[1]) : 0,
    dot: cs.length > 1 ? dot2(cs[0], cs[1]) : 0,
    angle: cs.length > 1 ? angleBetween2(cs[0], cs[1]) * DEG : 0,
    cross: cs.length > 1 ? cross2(cs[0], cs[1]) : 0,
    along: cs.length > 1 ? along(cs[0], cs[1]) : 0,
  });

  const now = inv(comps);
  const base = inv(baseComps);
  const componentSwing = Math.max(
    ...comps.flatMap((c, i) => [Math.abs(c[0] - baseComps[i][0]), Math.abs(c[1] - baseComps[i][1])]),
  );

  /* ── geometry ─────────────────────────────────────────────────────────── */
  const side = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const s = (side / 2 - 22) / extent;
  const px = (p: Vec2) => [cx + p[0] * s, cy - p[1] * s] as const;
  const e1: Vec2 = [Math.cos(frame), Math.sin(frame)];
  const e2: Vec2 = [-Math.sin(frame), Math.cos(frame)];
  const lin = (a: Vec2, u: number, b: Vec2, v: number): Vec2 => [a[0] * u + b[0] * v, a[1] * u + b[1] * v];

  /* ── dragging a tip ───────────────────────────────────────────────────── */
  const pointerWorld = useCallback(
    (e: { clientX: number; clientY: number }): Vec2 => {
      const rect = svgRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left - cx) / s;
      const y = -(e.clientY - rect.top - cy) / s;
      return [Math.round(x * 4) / 4, Math.round(y * 4) / 4];
    },
    [cx, cy, s],
  );

  useEffect(() => {
    if (dragging === null) return;
    const move = (e: PointerEvent) => {
      const w = pointerWorld(e);
      setVecs((prev) => {
        const next = [...prev];
        // In arrow-turning mode the drawn arrow is the authored one turned by
        // θ, so a drag has to be un-turned before it is stored.
        next[dragging] = turn === 'arrow' && dragging === 0 ? rotate2(w, -rad) : w;
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
  }, [dragging, pointerWorld, turn, rad]);

  /* ── drawing helpers ──────────────────────────────────────────────────── */
  const R = extent * 2;
  const gridLines: { a: Vec2; b: Vec2; axis: boolean }[] = [];
  const K = Math.ceil(extent) + 1;
  for (let k = -K; k <= K; k++) {
    gridLines.push({ a: lin(e2, k, e1, -R), b: lin(e2, k, e1, R), axis: k === 0 });
    gridLines.push({ a: lin(e1, k, e2, -R), b: lin(e1, k, e2, R), axis: k === 0 });
  }

  const arrow = (from: Vec2, to: Vec2, color: string, w: number, dashed = false, head = true, key?: string) => {
    const [x1, y1] = px(from);
    const [x2, y2] = px(to);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const h = Math.min(13, len * 0.34);
    const ux = len < TINY ? 0 : dx / len;
    const uy = len < TINY ? 0 : dy / len;
    return (
      <g key={key}>
        <line
          x1={x1} y1={y1}
          x2={head ? x2 - ux * h * 0.72 : x2}
          y2={head ? y2 - uy * h * 0.72 : y2}
          stroke={color}
          strokeWidth={w}
          strokeDasharray={dashed ? '5 5' : undefined}
          strokeLinecap="round"
        />
        {head && len > TINY && (
          <polygon
            points={`${x2},${y2} ${x2 - ux * h + uy * h * 0.42},${y2 - uy * h - ux * h * 0.42} ${x2 - ux * h - uy * h * 0.42},${y2 - uy * h + ux * h * 0.42}`}
            fill={color}
          />
        )}
      </g>
    );
  };

  const accentOf = (i: number) => `var(--color-${vectors[i]?.accent ?? ACCENTS[i % ACCENTS.length]})`;

  const clipId = useMemo(() => `vf-clip-${Math.random().toString(36).slice(2, 9)}`, []);

  const thetaSpec: ParamSpec = {
    key: 'theta',
    label: turn === 'grid' ? 'angle of the grid' : 'angle of the first arrow',
    symbol: 'θ',
    unit: '°',
    min: -180, max: 180, step: 1, value: theta,
  };

  const alignTo = (i: number) => {
    const v = vecs[i];
    if (mag2(v) < TINY) return;
    setTheta(Math.round(Math.atan2(v[1], v[0]) * DEG));
  };

  const projection = showProjection && drawn.length > 1 ? (() => {
    const b = drawn[1];
    const m2 = dot2(b, b);
    const foot: Vec2 = m2 === 0 ? [0, 0] : [b[0] * (dot2(drawn[0], b) / m2), b[1] * (dot2(drawn[0], b) / m2)];
    return foot;
  })() : null;

  return (
    <Panel
      title={title ?? (turn === 'grid' ? 'turn the grid — the arrows stay put' : 'turn the arrow — the grid stays put')}
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {allowTurnToggle && !locked && (
            <>
              <Button onClick={() => setTurn('grid')} active={turn === 'grid'} accent="cyan">
                turn grid
              </Button>
              <Button onClick={() => setTurn('arrow')} active={turn === 'arrow'} accent="magenta">
                turn arrow
              </Button>
            </>
          )}
          {!locked && (
            <Button onClick={() => { setTheta(angle); setVecs(authored); }} accent="iris" title="Back to the start">
              reset
            </Button>
          )}
        </div>
      }
    >
      <div ref={wrapRef} style={{ width: '100%' }}>
        <svg
          ref={svgRef}
          width={width}
          height={height}
          style={{ display: 'block', touchAction: 'none' }}
          role="img"
          aria-label={`Vectors on a grid turned by ${Math.round(theta)} degrees. The arrows do not move when the grid turns.`}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={cx - side / 2} y={cy - side / 2} width={side} height={side} rx={10} />
            </clipPath>
          </defs>

          <rect
            x={cx - side / 2} y={cy - side / 2} width={side} height={side} rx={10}
            fill="var(--color-abyss)" stroke="var(--color-rule)"
          />

          <g clipPath={`url(#${clipId})`}>
            {/* the grid, turned */}
            {gridLines.map((g, i) => {
              const [x1, y1] = px(g.a);
              const [x2, y2] = px(g.b);
              return (
                <line
                  key={i}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={g.axis ? 'var(--color-rule-bright)' : 'var(--color-rule)'}
                  strokeWidth={g.axis ? 1.8 : 1}
                  opacity={g.axis ? 1 : 0.75}
                />
              );
            })}

            {/* ticks on the turned axes, so the components can be READ off */}
            {Array.from({ length: 2 * K + 1 }, (_, i) => i - K)
              .filter((k) => k !== 0 && Math.abs(k) % 2 === 0)
              .flatMap((k) => [
                { p: lin(e1, k, e2, 0), q: lin(e1, k, e2, 0.16), label: String(k), axis: 'x' },
                { p: lin(e2, k, e1, 0), q: lin(e2, k, e1, 0.16), label: String(k), axis: 'y' },
              ])
              .map((t, i) => {
                const [x1, y1] = px(t.p as Vec2);
                const [x2, y2] = px(t.q as Vec2);
                return (
                  <g key={`t${i}`}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-rule-bright)" strokeWidth={1.4} />
                    <text
                      x={x1 - (x2 - x1) * 1.4} y={y1 - (y2 - y1) * 1.4 + 4}
                      textAnchor="middle" fill="var(--color-ink-ghost)"
                      style={{ fontSize: 10.5, fontFamily: 'var(--font-mono, monospace)' }}
                    >
                      {t.label}
                    </text>
                  </g>
                );
              })}

            {/* component drop-lines and the piece of each axis they cut off */}
            {showComponents &&
              comps.map((c, i) => {
                const foot1 = lin(e1, c[0], e2, 0);
                const foot2 = lin(e2, c[1], e1, 0);
                const tip = drawn[i];
                const col = accentOf(i);
                const [fx1, fy1] = px(foot1);
                const [fx2, fy2] = px(foot2);
                const [tx, ty] = px(tip);
                return (
                  <g key={`c${i}`} opacity={0.9}>
                    <line x1={fx1} y1={fy1} x2={tx} y2={ty} stroke={col} strokeDasharray="4 5" strokeWidth={1.2} opacity={0.6} />
                    <line x1={fx2} y1={fy2} x2={tx} y2={ty} stroke={col} strokeDasharray="4 5" strokeWidth={1.2} opacity={0.6} />
                    {arrow([0, 0], foot1, col, 3.4, false, false, `c1${i}`)}
                    {arrow([0, 0], foot2, col, 3.4, false, false, `c2${i}`)}
                  </g>
                );
              })}

            {/* a = a₁ê₁′ + a₂ê₂′, drawn tip to tail */}
            {showBasis && (
              <g>
                {arrow([0, 0], lin(e1, comps[0][0], e2, 0), 'var(--color-orchid)', 2, true, true, 'b1')}
                {arrow(lin(e1, comps[0][0], e2, 0), drawn[0], 'var(--color-orchid)', 2, true, true, 'b2')}
                {arrow([0, 0], e1, 'var(--color-iris)', 2.6, false, true, 'e1')}
                {arrow([0, 0], e2, 'var(--color-iris)', 2.6, false, true, 'e2')}
              </g>
            )}

            {/* the projection of the first arrow onto the second */}
            {projection && (
              <g>
                {arrow([0, 0], projection, 'var(--color-ok)', 6, false, false, 'proj')}
                {(() => {
                  const [x1, y1] = px(projection);
                  const [x2, y2] = px(drawn[0]);
                  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-ok)" strokeDasharray="4 4" strokeWidth={1.4} />;
                })()}
              </g>
            )}

            {/* the arrows themselves, above everything */}
            {drawn.map((v, i) => (
              <g key={vectors[i].key}>
                {arrow([0, 0], v, accentOf(i), 3.4, false, true, `v${i}`)}
                <text
                  x={px(v)[0] + (v[0] >= 0 ? 12 : -12)}
                  y={px(v)[1] + (v[1] >= 0 ? -10 : 18)}
                  textAnchor={v[0] >= 0 ? 'start' : 'end'}
                  fill={accentOf(i)}
                  style={{ fontSize: 15, fontWeight: 600 }}
                >
                  {vectors[i].label}
                </text>
              </g>
            ))}
          </g>

          {/* axis names, outside the clip so they never get cut */}
          {(() => {
            const lx = px(lin(e1, extent * 0.93, e2, 0.34));
            const ly = px(lin(e2, extent * 0.93, e1, 0.34));
            return (
              <g>
                <text x={lx[0]} y={lx[1]} textAnchor="middle" fill="var(--color-ink-faint)" style={{ fontSize: 13 }}>
                  x′
                </text>
                <text x={ly[0]} y={ly[1]} textAnchor="middle" fill="var(--color-ink-faint)" style={{ fontSize: 13 }}>
                  y′
                </text>
              </g>
            );
          })()}

          {/* drag handles */}
          {!locked &&
            drawn.map((v, i) =>
              vectors[i].draggable === false ? null : (
                <circle
                  key={`h${i}`}
                  cx={px(v)[0]}
                  cy={px(v)[1]}
                  r={dragging === i ? 11 : 9}
                  fill="transparent"
                  stroke={accentOf(i)}
                  strokeWidth={dragging === i ? 2 : 1}
                  opacity={dragging === i ? 1 : 0.5}
                  style={{ cursor: 'grab' }}
                  tabIndex={0}
                  role="button"
                  aria-label={`drag the tip of ${vectors[i].label}`}
                  onPointerDown={(e) => { e.preventDefault(); setDragging(i); }}
                />
              ),
            )}
        </svg>
      </div>

      {/* the knob */}
      {!locked && (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(200px,1fr) auto', alignItems: 'end', marginTop: 4 }}>
          <Slider spec={thetaSpec} value={theta} onChange={(v) => setTheta(Math.round(v))} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Button onClick={() => setTheta(0)} accent="iris">0°</Button>
            <Button onClick={() => setTheta(45)} accent="iris">45°</Button>
            {vectors[0] && (
              <Button onClick={() => alignTo(0)} accent="cyan" title={`Turn until x′ lies along ${vectors[0].label}`}>
                align to {vectors[0].label}
              </Button>
            )}
            {vectors[1] && (
              <Button onClick={() => alignTo(1)} accent="magenta" title={`Turn until x′ lies along ${vectors[1].label}`}>
                align to {vectors[1].label}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* what moved, and what did not */}
      {showInvariants && (
        <div
          style={{
            display: 'grid', gap: 16, marginTop: 12, paddingTop: 10,
            borderTop: '1px solid var(--color-rule)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(268px, 1fr))',
          }}
        >
          <div>
            <div className="hud-label" style={{ color: 'var(--color-magenta)', marginBottom: 6 }}>
              depends on the grid
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: '4px 10px', alignItems: 'baseline' }}>
              {comps.map((c, i) => (
                <LedgerRow
                  key={vectors[i].key}
                  label={<>components of <span style={{ color: accentOf(i) }}>{vectors[i].label}</span></>}
                  value={`(${fmt(c[0])}, ${fmt(c[1])})`}
                  valueColor={accentOf(i)}
                />
              ))}
              <LedgerRow
                label="largest component change"
                value={fmt(componentSwing)}
                valueColor="var(--sig-warn)"
              />
            </div>
          </div>

          <div>
            <div className="hud-label" style={{ color: 'var(--color-aqua)', marginBottom: 6 }}>
              {turn === 'grid' ? 'does not' : 'should not — watch'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: '4px 10px', alignItems: 'baseline' }}>
              <LedgerRow
                label={`|${vectors[0].label}|`}
                value={fmt(now.mag0)}
                delta={now.mag0 - base.mag0}
              />
              {vectors.length > 1 && (
                <>
                  <LedgerRow
                    label={`${vectors[0].label} · ${vectors[1].label}`}
                    value={fmt(now.dot)}
                    delta={now.dot - base.dot}
                  />
                  <LedgerRow
                    label="angle between"
                    value={`${fmt(now.angle, 1)}°`}
                    delta={now.angle - base.angle}
                  />
                  <LedgerRow
                    label={`signed area ${vectors[0].label} × ${vectors[1].label}`}
                    value={fmt(now.cross)}
                    delta={now.cross - base.cross}
                  />
                  {showProjection && (
                    <LedgerRow
                      label={`how much of ${vectors[0].label} lies along ${vectors[1].label}`}
                      value={fmt(now.along)}
                      valueColor="var(--color-ok)"
                      delta={now.along - base.along}
                    />
                  )}
                </>
              )}
            </div>
          </div>
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

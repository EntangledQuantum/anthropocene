/**
 * The scene kit — the small, shared dialect every focused physics visual is
 * built from. See AGENTS.md §2 ("One scene, one decision").
 *
 *   <SceneCard>   the frame: a one-line question on top, the stage, one footer
 *   <Stage>       an SVG with a world coordinate frame and optional axes
 *   <Arrow>       a vector drawn in world coordinates
 *   <Handle>      a draggable point (pointer + keyboard), in world coordinates
 *   <Body>        a labelled block or ball
 *   useTask       grading for a scene that checks itself
 *   <CheckBar>    the one Check button and the factual verdict line under it
 *
 * The point of the kit is restraint. A scene built from it has one focal
 * object, at most one or two things to move, and one question. If you find
 * yourself adding a third slider, you are building a lab — split it into two
 * scenes in two steps.
 *
 * Physics colours are fixed across the whole path so the learner learns the
 * dialect once: velocity is always cyan, acceleration always magenta, force
 * always amber. Never re-map them.
 */
import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { useWidget } from '../../lib/use-lesson.ts';

/* ── the fixed physics palette ─────────────────────────────────────────── */

export const C = {
  velocity: 'var(--color-cyan)',
  accel: 'var(--color-magenta)',
  force: 'var(--color-amber)',
  position: 'var(--color-iris)',
  energy: 'var(--color-aqua)',
  field: 'var(--color-orchid)',
  ok: 'var(--color-ok)',
  warn: 'var(--color-warn)',
  ink: 'var(--color-ink)',
  soft: 'var(--color-ink-soft)',
  faint: 'var(--color-ink-faint)',
  ghost: 'var(--color-ink-ghost)',
  rule: 'var(--color-rule-bright)',
  grid: 'var(--color-rule)',
  surface: 'var(--color-surface)',
} as const;

export type Vec = readonly [number, number];

/* ── stage: world coordinates on an SVG ────────────────────────────────── */

export interface StageApi {
  /** world x → view x */
  sx: (x: number) => number;
  /** world y → view y (y grows upward in the world) */
  sy: (y: number) => number;
  /** world length → view length, horizontally */
  len: (d: number) => number;
  /** view width and height */
  W: number;
  H: number;
  x: readonly [number, number];
  y: readonly [number, number];
}

export interface StageProps {
  /** World x range shown. */
  x: readonly [number, number];
  /** World y range shown. */
  y: readonly [number, number];
  /** View height in px at the 640-wide design width. The SVG scales to the column. */
  height?: number;
  /** Draw axes with ticks. Omit for a picture of the world (no axes). */
  axes?: { x?: string; y?: string; xTicks?: number[]; yTicks?: number[] };
  /** A ground line at world y = 0. */
  ground?: boolean;
  /** Equal scale on both axes: the x range is widened about its centre to fit
   *  the view. Use it whenever angles or lengths must look true (vectors,
   *  trajectories, geometry). Without it a 45° arrow is not drawn at 45°. */
  equal?: boolean;
  label: string;
  children: (s: StageApi) => ReactNode;
}

const W = 640;

function niceTicks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9 * step; v += step) out.push(+v.toFixed(10));
  return out;
}

const tickText = (v: number) => (Math.abs(v) < 1e-9 ? '0' : Math.abs(v) >= 1000 || Math.abs(v) < 0.01 ? v.toExponential(0) : `${+v.toFixed(2)}`);

export function Stage({ x: xIn, y, height = 260, axes, ground, equal, label, children }: StageProps) {
  const H = height;
  const m = axes ? { l: 52, r: 16, t: 14, b: 40 } : { l: 12, r: 12, t: 12, b: 12 };
  let x = xIn;
  if (equal) {
    const half = ((y[1] - y[0]) * (W - m.l - m.r)) / (H - m.t - m.b) / 2;
    const mid = (xIn[0] + xIn[1]) / 2;
    x = [mid - half, mid + half];
  }
  const sx = (v: number) => m.l + ((v - x[0]) / (x[1] - x[0])) * (W - m.l - m.r);
  const sy = (v: number) => H - m.b - ((v - y[0]) / (y[1] - y[0])) * (H - m.t - m.b);
  const len = (d: number) => (d / (x[1] - x[0])) * (W - m.l - m.r);
  const api: StageApi = { sx, sy, len, W, H, x, y };

  const xt = axes ? axes.xTicks ?? niceTicks(x[0], x[1]) : [];
  const yt = axes ? axes.yTicks ?? niceTicks(y[0], y[1], 4) : [];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}
      style={{ width: '100%', display: 'block', touchAction: 'none', userSelect: 'none', fontFamily: 'var(--font-sans)' }}>
      {axes && <g>
        {yt.map((v) => <g key={`y${v}`}>
          <line x1={m.l} x2={W - m.r} y1={sy(v)} y2={sy(v)} stroke={C.grid} />
          <text x={m.l - 8} y={sy(v) + 4} textAnchor="end" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{tickText(v)}</text>
        </g>)}
        {xt.map((v) => <g key={`x${v}`}>
          <line x1={sx(v)} x2={sx(v)} y1={m.t} y2={H - m.b} stroke={C.grid} />
          <text x={sx(v)} y={H - m.b + 17} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{tickText(v)}</text>
        </g>)}
        {y[0] <= 0 && y[1] >= 0 && <line x1={m.l} x2={W - m.r} y1={sy(0)} y2={sy(0)} stroke={C.rule} strokeWidth={1.4} />}
        {axes.x && <text x={W - m.r} y={H - 6} textAnchor="end" fontSize={13} fill={C.soft}>{axes.x}</text>}
        {axes.y && <text x={m.l + 6} y={m.t + 12} fontSize={13} fill={C.soft}>{axes.y}</text>}
      </g>}
      {ground && <line x1={0} x2={W} y1={sy(0)} y2={sy(0)} stroke={C.rule} strokeWidth={2} />}
      {children(api)}
    </svg>
  );
}

/* ── arrow ─────────────────────────────────────────────────────────────── */

export function Arrow({ s, from, to, color = C.ink, width = 3, label, dash, labelSide = 1 }: {
  s: StageApi; from: Vec; to: Vec; color?: string; width?: number; label?: string; dash?: string;
  /** Which side of the shaft the label sits on: 1 left of travel, -1 right. */
  labelSide?: 1 | -1;
}) {
  const x1 = s.sx(from[0]), y1 = s.sy(from[1]), x2 = s.sx(to[0]), y2 = s.sy(to[1]);
  const L = Math.hypot(x2 - x1, y2 - y1);
  if (L < 1) return null;
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L;
  const h = Math.min(12, L * 0.5);
  const bx = x2 - ux * h, by = y2 - uy * h;
  const nx = -uy * labelSide, ny = ux * labelSide;
  return <g>
    <line x1={x1} y1={y1} x2={bx} y2={by} stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" />
    <path d={`M${x2},${y2}L${bx - uy * h * 0.55},${by + ux * h * 0.55}L${bx + uy * h * 0.55},${by - ux * h * 0.55}Z`} fill={color} />
    {label && <text x={x2 + ux * 10 + nx * 12} y={y2 + uy * 10 + ny * 12 + 5}
      textAnchor={ux > 0.35 ? 'start' : ux < -0.35 ? 'end' : 'middle'}
      fontSize={14} fontWeight={600} fill={color}
      stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">{label}</text>}
  </g>;
}

/* ── body: a block or a ball ───────────────────────────────────────────── */

export function Body({ s, at, w = 1, h = 1, round, label, color = C.soft }: {
  s: StageApi; at: Vec; w?: number; h?: number; round?: boolean; label?: string; color?: string;
}) {
  const cx = s.sx(at[0]), cy = s.sy(at[1]);
  const pw = s.len(w), ph = s.len(h);
  return <g>
    {round
      ? <circle cx={cx} cy={cy} r={pw / 2} fill={C.surface} stroke={color} strokeWidth={2} />
      : <rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={ph} rx={4} fill={C.surface} stroke={color} strokeWidth={2} />}
    {label && <text x={cx} y={cy + 5} textAnchor="middle" fontSize={13} fill={C.soft}>{label}</text>}
  </g>;
}

/* ── handle: a draggable point in world coordinates ────────────────────── */

export function Handle({ s, at, onChange, color = C.ink, step = 0.1, label, clamp, r = 9 }: {
  s: StageApi; at: Vec; onChange: (p: Vec) => void; color?: string;
  /** World units per arrow-key press. */
  step?: number;
  label: string;
  /** Constrain a proposed point, e.g. to a line or a range. */
  clamp?: (p: Vec) => Vec;
  r?: number;
}) {
  const dragging = useRef(false);
  const toWorld = useCallback((el: SVGElement, clientX: number, clientY: number): Vec => {
    const svg = el.ownerSVGElement ?? (el as SVGSVGElement);
    const ctm = svg.getScreenCTM();
    if (!ctm) return at;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    // invert sx / sy numerically from two reference points
    const x0 = s.sx(0), x1 = s.sx(1), y0 = s.sy(0), y1 = s.sy(1);
    return [(p.x - x0) / (x1 - x0), (p.y - y0) / (y1 - y0)];
  }, [s, at]);
  const set = (p: Vec) => onChange(clamp ? clamp(p) : p);
  return <g>
    <circle cx={s.sx(at[0])} cy={s.sy(at[1])} r={r + 10} fill="transparent" style={{ cursor: 'grab' }}
      tabIndex={0} role="slider" aria-label={label}
      aria-valuetext={`${at[0].toFixed(2)}, ${at[1].toFixed(2)}`}
      onPointerDown={(e) => { dragging.current = true; (e.target as Element).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { if (dragging.current) set(toWorld(e.target as SVGElement, e.clientX, e.clientY)); }}
      onPointerUp={() => { dragging.current = false; }}
      onKeyDown={(e) => {
        const d: Record<string, Vec> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        const v = d[e.key];
        if (!v) return;
        e.preventDefault();
        set([at[0] + v[0], at[1] + v[1]]);
      }} />
    <circle cx={s.sx(at[0])} cy={s.sy(at[1])} r={r} fill={C.surface} stroke={color} strokeWidth={2.5} pointerEvents="none" />
    <circle cx={s.sx(at[0])} cy={s.sy(at[1])} r={3} fill={color} pointerEvents="none" />
  </g>;
}

/* ── grading a scene that checks itself ────────────────────────────────── */

export type Verdict = 'none' | 'hit' | 'miss';

/**
 * Grading for a self-checking scene. `check(correct)` records an attempt —
 * every attempt, right or wrong, which is what unlocks a lesson step.
 * Wrap the scene's `.astro` file with the comment marker `@graded` so the
 * build counts it (see src/lib/graph/graph.ts).
 */
export function useTask(id: string | undefined, kind = 'scene') {
  // An ungraded scene still calls the hook (hooks cannot be conditional) but
  // registers as optional, so it never blocks lesson completion.
  const { solved, solve } = useWidget(id ?? `ungraded-${kind}`, kind, !id);
  const [attempts, setAttempts] = useState(0);
  const [verdict, setVerdict] = useState<Verdict>('none');
  const check = useCallback((correct: boolean, detail?: unknown) => {
    const n = attempts + 1;
    setAttempts(n);
    setVerdict(correct ? 'hit' : 'miss');
    if (id) void solve(correct, n, detail);
  }, [attempts, solve, id]);
  /** Call when the learner changes the scene after a verdict. */
  const touch = useCallback(() => setVerdict((v) => (v === 'miss' ? 'none' : v)), []);
  return { solved, done: solved || verdict === 'hit', verdict, attempts, check, touch };
}

/* ── the frame ─────────────────────────────────────────────────────────── */

export function SceneCard({ id, prompt, children, footer, status }: {
  /** Set for a graded scene: the step flow finds it by this id. */
  id?: string;
  /** One sentence. The question the scene poses. */
  prompt?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Small right-aligned state word, e.g. "solved". */
  status?: ReactNode;
}) {
  const uid = useId();
  return (
    <div className="not-prose hud" data-widget-id={id} aria-labelledby={prompt ? uid : undefined}
      style={{ margin: '1.8rem 0', padding: '16px 18px 18px' }}>
      {(prompt || status) && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          {prompt && <p id={uid} style={{ margin: 0, fontSize: '1.08rem', lineHeight: 1.55, color: C.ink }}>{prompt}</p>}
          {status && <span className="hud-label" style={{ flexShrink: 0 }}>{status}</span>}
        </div>
      )}
      {children}
      {footer && <div style={{ marginTop: 14 }}>{footer}</div>}
    </div>
  );
}

/** The one Check button and a single factual line of feedback. */
export function CheckBar({ onCheck, verdict, done, miss, hit, label = 'Check', disabled }: {
  onCheck: () => void;
  verdict: Verdict;
  done: boolean;
  /** What is visibly off, stated as a fact about the scene ("the arrow is 6 N short"). */
  miss?: ReactNode;
  /** One or two sentences: why it had to be so. */
  hit?: ReactNode;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="anth-btn anth-btn-primary" onClick={onCheck} disabled={disabled || done}>
          {done ? 'Solved' : label}
        </button>
        {verdict === 'miss' && !done && miss && (
          <span style={{ fontSize: '0.96rem', color: C.warn, lineHeight: 1.5 }}>{miss}</span>
        )}
      </div>
      {done && hit && (
        <p style={{ margin: '12px 0 0', paddingTop: 10, borderTop: '1px solid var(--color-rule)', fontSize: '0.98rem', lineHeight: 1.62, color: C.soft }}>
          {hit}
        </p>
      )}
    </div>
  );
}

/** A single big number, for the one quantity a scene is about. */
export function Meter({ label, value, unit, color = C.ink }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, minWidth: 90 }}>
      <span className="hud-label">{label}</span>
      <span className="readout" style={{ fontSize: 20, color }}>{value}{unit && <span style={{ fontSize: 14, color: C.faint }}> {unit}</span>}</span>
    </div>
  );
}

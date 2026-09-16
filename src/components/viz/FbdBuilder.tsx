import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Panel,
  Readout,
  ReadoutRow,
  Slider,
  useAnimationFrame,
  usePrefersReducedMotion,
} from './controls.tsx';
import { ACCENTS } from './chart-core.ts';
import { mag2, rotate2, scale2, type Vec2 } from '../../lib/physics/vectors.ts';
import {
  G_EARTH,
  accelerationsAgree,
  allForces,
  createWorld,
  netForceOn,
  netForceOnSystem,
  resolve,
  step,
  surfaceComponents,
  thirdLawPartner,
  weight,
  type Body,
  type Force,
  type ForceKind,
  type Surface,
  type World,
} from '../../lib/physics/dynamics.ts';

/* ── the free-body diagram builder ─────────────────────────────────────────
   Chapter 4's reusable picture: one object, a few force arrows, and an
   acceleration arrow that must match their sum.

   The learner's arrows are the ONLY editable objects. Net force and
   acceleration are derived from `lib/physics/dynamics.ts`, drawn in a
   deliberately different visual language, and cannot be touched. So "the sum
   sets the acceleration" is not a sentence in the prose — it is the shape of the
   data, the same way `LinkedGraphs` makes velocity the only editable curve.

   Third-law partners are listed OUTSIDE the dashed system boundary, on the other
   body. `netForceOn` filters by `on`, so a partner is structurally incapable of
   entering this diagram's sum.

   Two panes, two clocks. The world strip is a canvas painted from refs at frame
   rate; the diagram panels are SVG and re-render from a snapshot pushed at
   ~8 Hz. Nothing calls setState per frame — that re-runs the effect, resets the
   accumulator and silently drops the simulation to a few steps per second.

   Built general on purpose. Chapter 5 gets ramps (`surfaceAngle`, `rotateAxes`),
   friction (`mu`) and tension; Chapter 11 gets statics (`target` with a = 0) and
   application points (`atX`/`atY`, read by `netTorqueAbout`).
   ──────────────────────────────────────────────────────────────────────── */

const DT = 1 / 240;
const READOUT_MS = 125;
const FBD_H = 252;
const WORLD_H = 172;
const TRAIL_EVERY = 6;

export type FbdMode = 'build' | 'given' | 'match';

export interface FbdBodySpec {
  id: string;
  label: string;
  /** kg */
  mass: number;
  /** metres */
  x?: number;
  y?: number;
  /** m/s */
  vx?: number;
  vy?: number;
  /** Drawn half-width in metres. Geometry only; the dynamics is a point mass. */
  size?: number;
  /** Let the surface solve this body's normal force and friction rather than
   *  asking the learner to draw them. Default true. */
  contact?: boolean;
}

export interface FbdForceSpec {
  id: string;
  /** Body id this force acts ON. */
  on: string;
  /** Who exerts it: another body's id, or a named agent — 'Earth', 'you'. */
  by: string;
  label?: string;
  kind?: ForceKind;
  /** Newtons, +y up. */
  fx: number;
  fy: number;
  /** The learner may drag this arrow's tip and move its sliders. */
  editable?: boolean;
  /** Direction is pinned; only the magnitude moves. */
  lockAngle?: boolean;
  maxMag?: number;
  /** Put the third-law partner into the world too, on the body named by `by`,
   *  kept at exactly minus this force. Drag one end and the other follows,
   *  because they are one interaction and not two decisions. */
  pair?: boolean;
  /** Application point relative to the body centre, metres. Torque only. */
  atX?: number;
  atY?: number;
}

export interface FbdTarget {
  label: string;
  /** Every body must share one acceleration — value left unstated. */
  agree?: boolean;
  /** A specific acceleration, m/s². */
  ax?: number;
  ay?: number;
  /** m/s² */
  tol?: number;
  /** Which body the ax/ay condition applies to. Defaults to the first. */
  bodyId?: string;
}

export interface FbdBuilderProps {
  mode?: FbdMode;
  /** Multi-body. Chapter 5's block-on-block, Chapter 11's members. */
  bodies?: FbdBodySpec[];
  /** Single-body shorthand. */
  mass?: number;
  bodyLabel?: string;
  v0?: [number, number];
  forces?: FbdForceSpec[];
  /** Add every body's weight automatically, with 'Earth' as the agent. */
  gravity?: boolean;
  g?: number;
  /** Kinds the learner may add in build mode. */
  palette?: ForceKind[];
  /** Surface angle in degrees CCW from horizontal. `null` is deep space: no
   *  surface and no contact forces. */
  surfaceAngle?: number | null;
  /** [static, kinetic] coefficients of friction. */
  mu?: [number, number];
  /** Draw the diagram axes rotated to the surface — Chapter 5's ramp
   *  coordinates — and report the net force along it. */
  rotateAxes?: boolean;
  /** Bodies inside the dashed boundary. Forces between members are internal and
   *  the system's own net force is reported. */
  system?: string[];
  showBoundary?: boolean;
  /** List each force's third-law partner, and the body it lives on. */
  showPartners?: boolean;
  /** Hide the world pane entirely: the diagram is all you get. This is the
   *  chapter's visual question, implemented. */
  hideMotion?: boolean;
  /** Let the learner change the mass and watch the same arrows give a different
   *  acceleration. */
  massSlider?: boolean;
  target?: FbdTarget;
  /** Seconds of simulated time before the run stops itself. */
  duration?: number;
  /** Simulated seconds per wall-clock second. Below 1 is slow motion, which is
   *  the only way to watch a collision; the factor is printed on the pane so
   *  the clock is never quietly lying. */
  timeScale?: number;
  /** Metres across the world strip at rest. */
  worldSpan?: number;
  autoPlay?: boolean;
  title?: string;
  caption?: string;
}

/* ── colour, by meaning ─────────────────────────────────────────────────── */

const KIND_COLOR: Record<ForceKind, string> = {
  gravity: ACCENTS.iris,
  normal: ACCENTS.aqua,
  applied: ACCENTS.cyan,
  friction: ACCENTS.orchid,
  tension: ACCENTS.aqua,
  contact: ACCENTS.cyan,
  drag: ACCENTS.orchid,
  spring: ACCENTS.orchid,
};

const NET_COLOR = ACCENTS.ink;
const ACC_COLOR = ACCENTS.magenta;

const KIND_LABEL: Record<ForceKind, string> = {
  gravity: 'weight',
  normal: 'normal',
  applied: 'push',
  friction: 'friction',
  tension: 'tension',
  contact: 'contact',
  drag: 'drag',
  spring: 'spring',
};

const NICE = [-1, 0, 1, 2, 3, 4, 5, 6].flatMap((d) =>
  [1, 1.5, 2, 3, 5, 7.5].map((m) => m * 10 ** d),
);
const niceAbove = (v: number) => NICE.find((n) => n >= v) ?? v;

const fmt = (v: number, dp = 1) => (Math.abs(v) < 10 ** -dp / 2 ? 0 : v).toFixed(dp);
const compact = (v: number) => (v >= 1000 ? `${v / 1000}k` : `${v}`);

/* ── props → physics ────────────────────────────────────────────────────── */

function bodiesFrom(
  specs: FbdBodySpec[] | undefined,
  mass: number | undefined,
  label: string | undefined,
  v0: [number, number] | undefined,
): Body[] {
  const list: FbdBodySpec[] =
    specs ?? [{ id: 'body', label: label ?? 'the block', mass: mass ?? 2, vx: v0?.[0], vy: v0?.[1] }];
  const n = list.length;
  return list.map((s, i) => ({
    id: s.id,
    label: s.label,
    mass: s.mass,
    pos: [s.x ?? (n === 1 ? 0 : i * 1.3 - (n - 1) * 0.65), s.y ?? 0] as Vec2,
    vel: [s.vx ?? 0, s.vy ?? 0] as Vec2,
    size: s.size ?? 0.45,
  }));
}

const toForce = (s: FbdForceSpec): Force => ({
  id: s.id,
  on: s.on,
  by: s.by,
  kind: s.kind ?? 'applied',
  label: s.label ?? KIND_LABEL[s.kind ?? 'applied'],
  vec: [s.fx, s.fy],
  at: s.atX !== undefined || s.atY !== undefined ? [s.atX ?? 0, s.atY ?? 0] : undefined,
});

/** Declared forces, plus the other end of any interaction marked `pair`.
 *
 *  The partner is DERIVED, never stored, and never editable — so the two ends
 *  of one interaction cannot be given different magnitudes here, any more than
 *  they can in the world. The third law is enforced by the data flow. */
const worldForces = (specs: FbdForceSpec[]): Force[] =>
  specs.flatMap((s) => {
    const f = toForce(s);
    if (!s.pair) return [f];
    const p = thirdLawPartner(f);
    return [f, { ...p, label: `${s.on} on ${s.by}` }];
  });

/* ── arrow drawing ──────────────────────────────────────────────────────── */

interface Arrow {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function Vector({
  a,
  color,
  width = 2.6,
  dash,
  opacity = 1,
  head = 10,
}: {
  a: Arrow;
  color: string;
  width?: number;
  dash?: string;
  opacity?: number;
  head?: number;
}) {
  const dx = a.x2 - a.x1;
  const dy = a.y2 - a.y1;
  const m = Math.hypot(dx, dy);
  if (m < 2) return null;
  const h = Math.min(head, m * 0.6);
  const ux = dx / m;
  const uy = dy / m;
  const px = -uy;
  const py = ux;
  const hw = h * 0.52;
  const t = 1 - (h * 0.7) / m;
  return (
    <g opacity={opacity}>
      <line
        x1={a.x1}
        y1={a.y1}
        x2={a.x1 + dx * t}
        y2={a.y1 + dy * t}
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dash}
      />
      <polygon
        points={[
          `${a.x2},${a.y2}`,
          `${a.x2 - ux * h + px * hw},${a.y2 - uy * h + py * hw}`,
          `${a.x2 - ux * h - px * hw},${a.y2 - uy * h - py * hw}`,
        ].join(' ')}
        fill={color}
      />
    </g>
  );
}

/* ── one diagram ────────────────────────────────────────────────────────── */

interface PanelProps {
  body: Body;
  width: number;
  forces: Force[];
  net: Vec2;
  acc: Vec2;
  pxPerNewton: number;
  pxPerAccel: number;
  scaleBarN: number;
  scaleBarA: number;
  editableIds: string[];
  dragging: string | null;
  onGrab: (id: string, svg: SVGSVGElement, cx: number, cy: number) => void;
  showBoundary: boolean;
  axisAngle: number;
}

function FbdPanel({
  body,
  width,
  forces,
  net,
  acc,
  pxPerNewton,
  pxPerAccel,
  scaleBarN,
  scaleBarA,
  editableIds,
  dragging,
  onGrab,
  showBoundary,
  axisAngle,
}: PanelProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const cx = width / 2;
  const cy = FBD_H / 2 - 16;
  const half = 22;
  const mine = forces.filter((f) => f.on === body.id);

  const axLen = width * 0.42;
  const axX = rotate2([axLen, 0], axisAngle);
  const axY = rotate2([0, axLen * 0.62], axisAngle);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={FBD_H}
      style={{ display: 'block', touchAction: 'none', overflow: 'visible' }}
      role="img"
      aria-label={`Free-body diagram for ${body.label}, mass ${body.mass} kilograms. ${mine
        .map((f) => `${f.label} ${fmt(mag2(f.vec))} newtons from ${f.by}`)
        .join('; ')}. Net force ${fmt(mag2(net))} newtons, acceleration ${fmt(mag2(acc), 2)} metres per second squared.`}
    >
      {showBoundary && (
        <rect
          x={5}
          y={5}
          width={width - 10}
          height={FBD_H - 46}
          rx={10}
          fill="none"
          stroke="var(--color-rule-bright)"
          strokeDasharray="5 5"
        />
      )}

      {/* axes. 30% of student-drawn diagrams omit them; this one never does. */}
      <line x1={cx - axX[0]} y1={cy + axX[1]} x2={cx + axX[0]} y2={cy - axX[1]} stroke="var(--color-rule)" />
      <line x1={cx - axY[0]} y1={cy + axY[1]} x2={cx + axY[0]} y2={cy - axY[1]} stroke="var(--color-rule)" />

      <rect
        x={cx - half}
        y={cy - half}
        width={half * 2}
        height={half * 2}
        rx={4}
        fill="rgba(79,216,232,0.14)"
        stroke={ACCENTS.cyan}
        strokeWidth={1.8}
        transform={axisAngle ? `rotate(${(-axisAngle * 180) / Math.PI} ${cx} ${cy})` : undefined}
      />
      <text x={cx} y={cy + 4} textAnchor="middle" fill={ACCENTS.ink} style={{ fontSize: 11.5 }}>
        {fmt(body.mass, body.mass < 10 ? 1 : 0)} kg
      </text>

      {mine.map((f) => {
        const tip: Arrow = {
          x1: cx,
          y1: cy,
          x2: cx + f.vec[0] * pxPerNewton,
          y2: cy - f.vec[1] * pxPerNewton,
        };
        const col = KIND_COLOR[f.kind];
        const lm = mag2(f.vec);
        const grabbable = editableIds.includes(f.id);
        return (
          <g key={f.id}>
            <Vector a={tip} color={col} width={3} />
            {lm > 1e-6 && (
              <text
                x={tip.x2 + (f.vec[0] >= 0 ? 9 : -9)}
                y={tip.y2 + (f.vec[1] > 0 ? -9 : 15)}
                textAnchor={f.vec[0] >= 0 ? 'start' : 'end'}
                fill={col}
                style={{ fontSize: 11.5 }}
              >
                {f.label}
                <tspan fill="var(--color-ink-faint)" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                  {' '}
                  {fmt(lm, lm < 100 ? 1 : 0)} N
                </tspan>
              </text>
            )}
            {grabbable && (
              <circle
                cx={tip.x2}
                cy={tip.y2}
                r={dragging === f.id ? 10 : 8}
                fill="var(--color-void)"
                stroke={col}
                strokeWidth={2.5}
                style={{ cursor: 'grab' }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (svgRef.current) onGrab(f.id, svgRef.current, cx, cy);
                }}
              />
            )}
          </g>
        );
      })}

      {/* derived, and unreachable: the sum, dashed; the acceleration it fixes,
          thick and offset so the two can be seen to be parallel. */}
      <Vector
        a={{ x1: cx, y1: cy, x2: cx + net[0] * pxPerNewton, y2: cy - net[1] * pxPerNewton }}
        color={NET_COLOR}
        width={2}
        dash="6 4"
        opacity={0.85}
      />
      <Vector
        a={{ x1: cx, y1: cy + 10, x2: cx + acc[0] * pxPerAccel, y2: cy + 10 - acc[1] * pxPerAccel }}
        color={ACC_COLOR}
        width={4}
        head={13}
      />
      {mag2(acc) > 1e-4 && (
        <text
          x={cx + acc[0] * pxPerAccel + (acc[0] >= 0 ? 11 : -11)}
          y={cy + 10 - acc[1] * pxPerAccel + 22}
          textAnchor={acc[0] >= 0 ? 'start' : 'end'}
          fill={ACC_COLOR}
          style={{ fontSize: 12, fontWeight: 600 }}
        >
          a
          <tspan fill="var(--color-ink-faint)" style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 400 }}>
            {' '}
            {fmt(mag2(acc), 2)} m/s²
          </tspan>
        </text>
      )}

      {/* two scales, because there are two units on this picture */}
      <g style={{ fontSize: 10.5, fontFamily: 'var(--font-mono, monospace)' }}>
        <line x1={12} y1={FBD_H - 29} x2={12 + scaleBarN * pxPerNewton} y2={FBD_H - 29} stroke={NET_COLOR} strokeWidth={2} opacity={0.7} />
        <text x={16 + scaleBarN * pxPerNewton} y={FBD_H - 25} fill="var(--color-ink-faint)">
          {compact(scaleBarN)} N
        </text>
        <line x1={12} y1={FBD_H - 15} x2={12 + scaleBarA * pxPerAccel} y2={FBD_H - 15} stroke={ACC_COLOR} strokeWidth={2} opacity={0.7} />
        <text x={16 + scaleBarA * pxPerAccel} y={FBD_H - 11} fill="var(--color-ink-faint)">
          {compact(scaleBarA)} m/s²
        </text>
      </g>

      <text x={width - 8} y={FBD_H - 11} textAnchor="end" fill="var(--color-ink-soft)" style={{ fontSize: 11.5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {body.label}
      </text>
    </svg>
  );
}

/* ── the component ──────────────────────────────────────────────────────── */

interface Snapshot {
  t: number;
  /** Forces the physics actually used, declared plus solved. */
  forces: Force[];
  accel: Record<string, Vec2>;
  net: Record<string, Vec2>;
  speed: Record<string, number>;
  touching: string[];
  systemNet: Vec2;
}

export default function FbdBuilder({
  mode = 'build',
  bodies: bodySpecs,
  mass,
  bodyLabel,
  v0,
  forces: forceSpecs,
  gravity = true,
  g = G_EARTH,
  palette,
  surfaceAngle = 0,
  mu,
  rotateAxes = false,
  system,
  showBoundary = true,
  showPartners = false,
  hideMotion = false,
  massSlider = false,
  target,
  duration = 6,
  timeScale = 1,
  worldSpan = 16,
  autoPlay = false,
  title,
  caption,
}: FbdBuilderProps) {
  const reduced = usePrefersReducedMotion();

  const baseBodies = useMemo(
    () => bodiesFrom(bodySpecs, mass, bodyLabel, v0),
    [bodySpecs, mass, bodyLabel, v0],
  );

  const surface = useMemo<Surface | null>(
    () =>
      surfaceAngle === null
        ? null
        : { angleRad: (surfaceAngle * Math.PI) / 180, muS: mu?.[0] ?? 0, muK: mu?.[1] ?? 0 },
    [surfaceAngle, mu],
  );

  const contactIds = useMemo(
    () => (bodySpecs ?? [{ id: 'body' } as FbdBodySpec]).filter((b) => b.contact !== false).map((b) => b.id),
    [bodySpecs],
  );

  /** The declared forces, as state. The learner's arrows live here and nowhere
   *  else; everything in the derived language is recomputed from them. */
  const initialSpecs = useMemo(() => {
    const given = (forceSpecs ?? []).map((f) => ({ ...f }));
    const declaredWeight = new Set(given.filter((f) => f.kind === 'gravity').map((f) => f.on));
    const auto: FbdForceSpec[] = gravity
      ? baseBodies
          .filter((b) => !declaredWeight.has(b.id))
          .map((b) => ({
            id: `${b.id}-weight`,
            on: b.id,
            by: 'Earth',
            kind: 'gravity' as ForceKind,
            label: 'weight',
            fx: 0,
            fy: -weight(b.mass, g),
          }))
      : [];
    return [...auto, ...given];
  }, [forceSpecs, gravity, baseBodies, g]);

  const [specs, setSpecs] = useState<FbdForceSpec[]>(initialSpecs);
  const [masses, setMasses] = useState<Record<string, number>>(() =>
    Object.fromEntries(baseBodies.map((b) => [b.id, b.mass])),
  );
  const [running, setRunning] = useState(false);
  const [width, setWidth] = useState(720);
  const nextId = useRef(1);

  const bodies = useMemo(
    () => baseBodies.map((b) => ({ ...b, mass: masses[b.id] ?? b.mass })),
    [baseBodies, masses],
  );

  /* Automatic weight has to track a mass the learner can change. */
  const liveSpecs = useMemo(
    () =>
      specs.map((s) =>
        s.kind === 'gravity' && !s.editable && s.by === 'Earth'
          ? { ...s, fy: -weight(masses[s.on] ?? 0, g) }
          : s,
      ),
    [specs, masses, g],
  );

  /* ── the world, in refs. Positions never touch React state. ─────────────── */
  const worldRef = useRef<World | null>(null);
  const trailRef = useRef<Record<string, Vec2[]>>({});
  const lastReadout = useRef(0);
  /** Unspent simulated time, carried between frames. */
  const clockRef = useRef(0);
  /** Where the world strip is looking. Fixed until a body nears the edge, then
   *  it pans — a camera that tracks from the first frame makes a body moving at
   *  constant velocity look stationary, which is the opposite of the lesson. */
  const camRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ w: 720, h: WORLD_H });

  const snapshotOf = useCallback(
    (w: World): Snapshot => {
      const fs = allForces(w);
      const net: Record<string, Vec2> = {};
      const speed: Record<string, number> = {};
      for (const b of w.bodies) {
        net[b.id] = netForceOn(b.id, fs);
        speed[b.id] = mag2(b.vel);
      }
      return {
        t: w.t,
        forces: fs,
        accel: { ...w.accel },
        net,
        speed,
        touching: [...w.touching],
        systemNet: netForceOnSystem(system ?? w.bodies.map((b) => b.id), fs),
      };
    },
    [system],
  );

  const seed = useCallback(() => {
    const w = createWorld({
      bodies: bodies.map((b) => ({ ...b, pos: [...b.pos] as Vec2, vel: [...b.vel] as Vec2 })),
      forces: worldForces(liveSpecs),
      surface,
      touching: surface ? contactIds : [],
    });
    worldRef.current = w;
    trailRef.current = Object.fromEntries(w.bodies.map((b) => [b.id, [[...b.pos] as Vec2]]));
    lastReadout.current = 0;
    clockRef.current = 0;
    camRef.current = null;
    return w;
  }, [bodies, liveSpecs, surface, contactIds]);

  const [snap, setSnap] = useState<Snapshot>(() => snapshotOf(seed()));

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  /* Editing while paused re-seeds, so a dragged arrow shows its consequence at
     once. Editing mid-run swaps the force list in place and keeps the motion —
     which is how "take the push away and watch it keep going" works. */
  useEffect(() => {
    const w = worldRef.current;
    if (runningRef.current && w) {
      w.forces = worldForces(liveSpecs);
      for (const b of w.bodies) b.mass = masses[b.id] ?? b.mass;
      resolve(w);
      setSnap(snapshotOf(w));
      return;
    }
    setSnap(snapshotOf(seed()));
  }, [seed, liveSpecs, masses, snapshotOf]);

  /* ── world strip ────────────────────────────────────────────────────────── */

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const w = worldRef.current;
    if (!canvas || !w) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w: cw, h: ch } = sizeRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const xs = w.bodies.map((b) => b.pos[0]);
    const centre = (Math.min(...xs) + Math.max(...xs)) / 2;
    const extent = Math.max(...xs) - Math.min(...xs);
    const span = Math.max(worldSpan, extent * 1.7 + 4);
    if (camRef.current === null) camRef.current = centre;
    const lead = span * 0.33;
    if (centre > camRef.current + lead) camRef.current = centre - lead;
    else if (centre < camRef.current - lead) camRef.current = centre + lead;
    const s = cw / span;
    const x0 = camRef.current - span / 2;
    const groundY = ch * 0.72;
    const wx = (m: number) => (m - x0) * s;
    const wy = (m: number) => groundY - m * s;

    if (surface) {
      const slope = Math.tan(surface.angleRad);
      ctx.strokeStyle = 'rgba(246,242,251,0.34)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, wy(slope * x0));
      ctx.lineTo(cw, wy(slope * (x0 + span)));
      ctx.stroke();
      ctx.strokeStyle = 'rgba(246,242,251,0.12)';
      ctx.lineWidth = 1;
      for (let px = -30; px < cw + 30; px += 12) {
        const gy = wy(slope * (x0 + px / s));
        ctx.beginPath();
        ctx.moveTo(px, gy);
        ctx.lineTo(px - 9, gy + 9);
        ctx.stroke();
      }
    } else {
      // deep space: a fixed, deterministic starfield so nothing twinkles
      ctx.fillStyle = 'rgba(143,156,245,0.45)';
      for (let i = 0; i < 46; i++) {
        ctx.fillRect((i * 97) % cw, (i * 53) % (ch - 26), 1.4, 1.4);
      }
    }

    for (const b of w.bodies) {
      const tr = trailRef.current[b.id] ?? [];
      if (tr.length < 2) continue;
      ctx.strokeStyle = 'rgba(79,216,232,0.38)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      tr.forEach((p, i) => (i ? ctx.lineTo(wx(p[0]), wy(p[1])) : ctx.moveTo(wx(p[0]), wy(p[1]))));
      ctx.stroke();
    }

    for (const b of w.bodies) {
      const halfPx = Math.max(7, b.size * s);
      const bx = wx(b.pos[0]);
      const by = wy(b.pos[1]) - halfPx;

      ctx.fillStyle = 'rgba(79,216,232,0.16)';
      ctx.strokeStyle = ACCENTS.cyan;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.rect(bx - halfPx, by - halfPx, halfPx * 2, halfPx * 2);
      ctx.fill();
      ctx.stroke();

      ctx.font = '11.5px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = ACCENTS.faint;
      ctx.fillText(b.label, bx, by - halfPx - 7);

      const vx = b.vel[0] * 13;
      const vy = -b.vel[1] * 13;
      const vm = Math.hypot(vx, vy);
      if (vm > 4) {
        const ux = vx / vm;
        const uy = vy / vm;
        ctx.strokeStyle = ACCENTS.aqua;
        ctx.fillStyle = ACCENTS.aqua;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + vx - ux * 6, by + vy - uy * 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx + vx, by + vy);
        ctx.lineTo(bx + vx - ux * 9 - uy * 4.5, by + vy - uy * 9 + ux * 4.5);
        ctx.lineTo(bx + vx - ux * 9 + uy * 4.5, by + vy - uy * 9 - ux * 4.5);
        ctx.fill();
        ctx.font = '11px ui-monospace, monospace';
        ctx.textAlign = ux >= 0 ? 'left' : 'right';
        ctx.fillText(`v = ${mag2(b.vel).toFixed(1)} m/s`, bx + vx + (ux >= 0 ? 8 : -8), by + vy - 7);
      }
    }

    /* the ruler — every axis gets a scale */
    const stepM = span > 120 ? 50 : span > 60 ? 20 : span > 26 ? 5 : 2;
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (let m = Math.ceil(x0 / stepM) * stepM; m < x0 + span; m += stepM) {
      ctx.strokeStyle = 'rgba(246,242,251,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wx(m), ch - 16);
      ctx.lineTo(wx(m), ch - 11);
      ctx.stroke();
      ctx.fillStyle = ACCENTS.faint;
      ctx.fillText(`${m}`, wx(m), ch - 2);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(141,132,166,0.85)';
    ctx.fillText('metres', cw - 5, ch - 19);
    ctx.textAlign = 'left';
    ctx.fillStyle = ACCENTS.faint;
    ctx.fillText(`t = ${w.t.toFixed(2)} s`, 5, 14);
  }, [surface, worldSpan]);

  const paintRef = useRef(paint);
  useEffect(() => {
    paintRef.current = paint;
    paint();
  }, [paint, snap]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.getBoundingClientRect().width);
      const pane = el.querySelector('[data-pane="fbd-world"]') as HTMLElement | null;
      if (pane) sizeRef.current = { w: pane.clientWidth || 720, h: pane.clientHeight || WORLD_H };
      paintRef.current();
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  /* ── the loop ───────────────────────────────────────────────────────────── */

  const advance = useCallback(
    (wallDt: number) => {
      const w = worldRef.current;
      if (!w) return;
      // A fractional accumulator rather than a step count, so a timeScale below
      // one does not round up to a whole step and quietly run at full speed.
      clockRef.current = Math.min(clockRef.current + wallDt * timeScale, 40 * DT);
      while (clockRef.current >= DT) {
        clockRef.current -= DT;
        step(w, DT);
        if (w.steps % TRAIL_EVERY === 0) {
          for (const b of w.bodies) {
            const tr = trailRef.current[b.id];
            if (tr) {
              tr.push([...b.pos] as Vec2);
              if (tr.length > 1600) tr.shift();
            }
          }
        }
      }
      paintRef.current();

      const now = performance.now();
      if (now - lastReadout.current >= READOUT_MS) {
        lastReadout.current = now;
        setSnap(snapshotOf(w));
      }
      if (w.t >= duration) {
        setRunning(false);
        setSnap(snapshotOf(w));
      }
    },
    [duration, snapshotOf, timeScale],
  );

  useAnimationFrame(running && !reduced, advance);

  useEffect(() => {
    if (autoPlay && !reduced && !hideMotion) setRunning(true);
  }, [autoPlay, reduced, hideMotion]);

  const reseed = useCallback(() => {
    setRunning(false);
    const w = seed();
    setSnap(snapshotOf(w));
    paintRef.current();
    return w;
  }, [seed, snapshotOf]);

  const toggleRun = () => {
    if (running) {
      setRunning(false);
      return;
    }
    const w = worldRef.current;
    if (!w || w.t >= duration - 1e-9) reseed();
    setRunning(true);
  };

  const stepOnce = () => {
    const w = worldRef.current;
    if (!w) return;
    setRunning(false);
    // A readable nudge on any clock: a quarter second, or an eighth of the run
    // when the whole run is shorter than that.
    const n = Math.max(1, Math.round(Math.min(0.25, duration / 8) / DT));
    for (let i = 0; i < n && w.t < duration; i++) step(w, DT);
    for (const b of w.bodies) trailRef.current[b.id]?.push([...b.pos] as Vec2);
    paintRef.current();
    setSnap(snapshotOf(w));
  };

  /* ── scales, fixed so arrows do not breathe while you drag ──────────────── */

  const { refForce, refAccel } = useMemo(() => {
    const fMags = [
      ...initialSpecs.map((s) => Math.hypot(s.fx, s.fy)),
      ...(gravity ? baseBodies.map((b) => weight(b.mass, g)) : []),
    ];
    const f = niceAbove(Math.max(1, ...fMags) * 1.15);
    const a = niceAbove(Math.max(...baseBodies.map((b) => f / b.mass)) * 0.8);
    return { refForce: f, refAccel: a };
  }, [initialSpecs, baseBodies, gravity, g]);

  const panelW = Math.max(216, Math.min(430, (width - 12 * (bodies.length - 1)) / bodies.length));
  const pxPerNewton = (panelW * 0.33) / refForce;
  const pxPerAccel = (panelW * 0.33) / refAccel;

  /* ── dragging ───────────────────────────────────────────────────────────── */

  const [dragging, setDragging] = useState<string | null>(null);
  const dragGeom = useRef<{ cx: number; cy: number; svg: SVGSVGElement } | null>(null);

  const onGrab = useCallback((id: string, svg: SVGSVGElement, cx: number, cy: number) => {
    dragGeom.current = { cx, cy, svg };
    setDragging(id);
  }, []);

  const applyDrag = useCallback(
    (id: string, dx: number, dy: number) => {
      setSpecs((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          const raw: Vec2 = [dx / pxPerNewton, -dy / pxPerNewton];
          let out: Vec2;
          if (s.lockAngle) {
            const m0 = Math.hypot(s.fx, s.fy) || 1;
            const u: Vec2 = [s.fx / m0, s.fy / m0];
            const along = Math.max(0, raw[0] * u[0] + raw[1] * u[1]);
            out = scale2(u, Math.round(along * 2) / 2);
          } else {
            // Snap to half a newton and a whole degree: readable numbers, and
            // two learners' answers stay comparable.
            const deg = Math.round((Math.atan2(raw[1], raw[0]) * 180) / Math.PI);
            out = rotate2([Math.round(mag2(raw) * 2) / 2, 0], (deg * Math.PI) / 180);
          }
          const cap = s.maxMag ?? refForce * 1.4;
          const m = mag2(out);
          if (m > cap) out = scale2(out, cap / m);
          return { ...s, fx: Math.round(out[0] * 100) / 100, fy: Math.round(out[1] * 100) / 100 };
        }),
      );
    },
    [pxPerNewton, refForce],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const geom = dragGeom.current;
      if (!geom) return;
      const r = geom.svg.getBoundingClientRect();
      applyDrag(dragging, e.clientX - r.left - geom.cx, e.clientY - r.top - geom.cy);
    };
    const up = () => setDragging(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, applyDrag]);

  const setMag = (id: string, m: number) =>
    setSpecs((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const m0 = Math.hypot(s.fx, s.fy);
        const u: Vec2 = m0 > 1e-9 ? [s.fx / m0, s.fy / m0] : [1, 0];
        return { ...s, fx: u[0] * m, fy: u[1] * m };
      }),
    );

  const setAngle = (id: string, deg: number) =>
    setSpecs((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const v = rotate2([Math.hypot(s.fx, s.fy), 0], (deg * Math.PI) / 180);
        return { ...s, fx: v[0], fy: v[1] };
      }),
    );

  const addForce = (kind: ForceKind, onId: string) => {
    const id = `learner-${nextId.current++}`;
    setSpecs((prev) => [
      ...prev,
      {
        id,
        on: onId,
        by: 'you',
        kind,
        label: kind === 'applied' ? 'your push' : KIND_LABEL[kind],
        fx: kind === 'gravity' ? 0 : refForce * 0.35,
        fy: kind === 'gravity' ? -refForce * 0.35 : 0,
        editable: true,
      },
    ]);
  };

  const removeForce = (id: string) => setSpecs((prev) => prev.filter((s) => s.id !== id));

  /* ── verdict ────────────────────────────────────────────────────────────── */

  const tol = target?.tol ?? 0.15;
  const hit = useMemo(() => {
    if (!target) return false;
    if (target.agree && !accelerationsAgree(bodies.map((b) => snap.accel[b.id] ?? [0, 0]), tol)) {
      return false;
    }
    if (target.ax === undefined && target.ay === undefined) return true;
    const a = snap.accel[target.bodyId ?? bodies[0].id] ?? ([0, 0] as Vec2);
    return Math.abs(a[0] - (target.ax ?? 0)) <= tol && Math.abs(a[1] - (target.ay ?? 0)) <= tol;
  }, [target, snap, bodies, tol]);

  const editableIds = liveSpecs.filter((s) => s.editable).map((s) => s.id);
  const editable = liveSpecs.filter((s) => s.editable);
  /* Only the partners that have nowhere to go. A body-to-body pair is already
     drawn on the other panel; these are the ones whose other end lives on the
     Earth, on the table, on you — things this picture deliberately left out. */
  const bodyIds = new Set(bodies.map((b) => b.id));
  const partners = showPartners
    ? snap.forces.filter((f) => !bodyIds.has(f.by)).map((f) => thirdLawPartner(f))
    : [];
  const systemIds = system ?? bodies.map((b) => b.id);
  const axisAngle = rotateAxes && surface ? surface.angleRad : 0;

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title={title ?? 'free-body diagram'}
        right={
          <span className="hud-label" style={{ color: 'var(--color-ink-faint)' }}>
            {timeScale !== 1 && !hideMotion && (
              <span style={{ color: 'var(--color-orchid)' }}>slow motion ×{timeScale} · </span>
            )}
            F<sub>net</sub> = m a
          </span>
        }
      >
        <div ref={wrapRef} style={{ width: '100%' }}>
          {hideMotion ? (
            <p
              style={{
                margin: '0 0 10px',
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px dashed var(--color-rule-bright)',
                color: 'var(--color-ink-soft)',
                fontSize: '0.9rem',
              }}
            >
              The motion is hidden. This diagram is everything you get.
            </p>
          ) : (
            <div
              data-pane="fbd-world"
              style={{
                height: WORLD_H,
                minWidth: 0,
                borderRadius: 8,
                overflow: 'hidden',
                background: 'var(--color-abyss, #0c0a15)',
                border: '1px solid var(--color-rule)',
              }}
            >
              <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              justifyContent: 'center',
              marginTop: hideMotion ? 0 : 12,
            }}
          >
            {bodies.map((b) => (
              <FbdPanel
                key={b.id}
                body={b}
                width={panelW}
                forces={snap.forces}
                net={snap.net[b.id] ?? [0, 0]}
                acc={snap.accel[b.id] ?? [0, 0]}
                pxPerNewton={pxPerNewton}
                pxPerAccel={pxPerAccel}
                scaleBarN={refForce / 2}
                scaleBarA={refAccel / 2}
                editableIds={editableIds}
                dragging={dragging}
                onGrab={onGrab}
                showBoundary={showBoundary}
                axisAngle={axisAngle}
              />
            ))}
          </div>
        </div>

        {showPartners && partners.length > 0 && (
          <div
            style={{
              marginTop: 10,
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid var(--color-rule)',
              background: 'var(--color-surface)',
              fontSize: '0.88rem',
              lineHeight: 1.65,
              color: 'var(--color-ink-faint)',
            }}
          >
            <span className="hud-label" style={{ color: 'var(--color-orchid)' }}>
              the other end of each interaction — outside every box above
            </span>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {partners.map((p) => (
                <li key={p.id}>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--color-ink-soft)' }}>
                    {fmt(mag2(p.vec), mag2(p.vec) < 100 ? 1 : 0)} N
                  </span>{' '}
                  on <strong style={{ color: 'var(--color-ink)' }}>{p.on}</strong>, exerted by{' '}
                  {bodies.find((b) => b.id === p.by)?.label ?? p.by}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* controls */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          {!hideMotion && (
            <>
              <Button onClick={toggleRun} active={running} accent="cyan" disabled={reduced}>
                {running ? 'pause' : snap.t > 0 ? 'resume' : 'run'}
              </Button>
              <Button onClick={stepOnce} accent="iris" title="Advance a quarter of a second">
                step
              </Button>
            </>
          )}
          <Button onClick={reseed} accent="magenta">
            reset
          </Button>
          {mode === 'build' &&
            (palette ?? ['applied']).map((kind) => (
              <Button key={kind} onClick={() => addForce(kind, bodies[0].id)} accent="ok">
                + {KIND_LABEL[kind]}
              </Button>
            ))}
          {reduced && !hideMotion && (
            <span className="hud-label" style={{ color: 'var(--color-ink-faint)' }}>
              reduced motion — advance with step
            </span>
          )}
        </div>

        {/* the keyboard path, and the only way to hit a precise magnitude */}
        {editable.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
              gap: '10px 20px',
              marginTop: 12,
              paddingTop: 10,
              borderTop: '1px solid var(--color-rule)',
            }}
          >
            {editable.map((s) => {
              const m = Math.hypot(s.fx, s.fy);
              const deg = (Math.atan2(s.fy, s.fx) * 180) / Math.PI;
              const cap = s.maxMag ?? Math.round(refForce * 1.4);
              return (
                <div key={s.id} style={{ display: 'grid', gap: 6 }}>
                  <Slider
                    spec={{
                      key: `${s.id}-m`,
                      label: `${s.label ?? 'force'} · strength`,
                      min: 0,
                      max: cap,
                      step: cap > 200 ? cap / 400 : 0.5,
                      value: m,
                      unit: 'N',
                    }}
                    value={m}
                    onChange={(v) => setMag(s.id, v)}
                  />
                  {!s.lockAngle && (
                    <Slider
                      spec={{
                        key: `${s.id}-a`,
                        label: `${s.label ?? 'force'} · direction`,
                        min: -180,
                        max: 180,
                        step: 1,
                        value: deg,
                        unit: '°',
                      }}
                      value={deg}
                      onChange={(v) => setAngle(s.id, v)}
                    />
                  )}
                  {s.by === 'you' && mode === 'build' && (
                    <Button onClick={() => removeForce(s.id)} accent="warn">
                      remove
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {massSlider && (
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            {bodies.map((b) => (
              <Slider
                key={b.id}
                spec={{
                  key: `${b.id}-mass`,
                  label: `mass of ${b.label}`,
                  min: 0.5,
                  max: Math.max(20, (baseBodies.find((x) => x.id === b.id)?.mass ?? b.mass) * 4),
                  step: 0.5,
                  value: b.mass,
                  unit: 'kg',
                  hint: 'Same arrows, different acceleration. That is the whole of what mass is.',
                }}
                value={b.mass}
                onChange={(v) => setMasses((prev) => ({ ...prev, [b.id]: v }))}
              />
            ))}
          </div>
        )}

        <ReadoutRow>
          {bodies.flatMap((b) => {
            const net = snap.net[b.id] ?? ([0, 0] as Vec2);
            const acc = snap.accel[b.id] ?? ([0, 0] as Vec2);
            const one = bodies.length === 1;
            return [
              <Readout
                key={`${b.id}-f`}
                label={one ? 'net force' : `net F · ${b.label}`}
                value={`${fmt(mag2(net), mag2(net) < 100 ? 1 : 0)} N`}
                accent="aqua"
              />,
              <Readout
                key={`${b.id}-a`}
                label={one ? 'acceleration' : `a · ${b.label}`}
                value={`${fmt(mag2(acc), 2)} m/s²`}
                accent="magenta"
              />,
              <Readout
                key={`${b.id}-v`}
                label={one ? 'speed' : `speed · ${b.label}`}
                value={`${fmt(snap.speed[b.id] ?? 0, 2)} m/s`}
                accent="cyan"
              />,
            ];
          })}
          {bodies.length > 1 && (
            <Readout
              label={`net on the pair`}
              value={`${fmt(mag2(snap.systemNet), 1)} N`}
              accent="iris"
            />
          )}
          {rotateAxes && surface && (
            <Readout
              label="net along the surface"
              value={`${fmt(surfaceComponents(snap.net[bodies[0].id] ?? [0, 0], surface).along, 1)} N`}
              accent="orchid"
            />
          )}
          {surface && contactIds.length > 0 && (
            <Readout
              label="still in contact"
              value={snap.touching.length ? snap.touching.join(', ') : 'nothing — it left'}
              accent="ok"
              mono={false}
            />
          )}
        </ReadoutRow>

        {target && (
          <div
            style={{
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 8,
              border: `1px solid ${hit ? 'var(--sig-ok)' : 'var(--color-rule-bright)'}`,
              background: hit
                ? 'color-mix(in oklab, var(--sig-ok) 10%, transparent)'
                : 'var(--color-surface)',
              fontSize: '0.95rem',
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: hit ? 'var(--sig-ok)' : 'var(--color-ink)' }}>
              {hit ? 'That is it. ' : 'Goal: '}
            </strong>
            {target.label}
          </div>
        )}
      </Panel>

      {caption && (
        <figcaption
          style={{
            marginTop: 10,
            color: 'var(--color-ink-soft)',
            fontSize: '0.95rem',
            lineHeight: 1.6,
          }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

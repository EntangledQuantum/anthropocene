import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Panel, Readout, ReadoutRow, usePrefersReducedMotion } from './controls.tsx';
import {
  accelVector,
  circleFromSteering,
  steerReadout,
  stepSteered,
  type AnchorMode,
  type Particle,
} from '../../lib/physics/motion2d.ts';

/* ── the acceleration arrow you can drag ───────────────────────────────────
   Chapter 3's reusable picture, made into the thing the learner holds: a
   velocity arrow whose tip is being dragged by an acceleration arrow.

   The learner drags the magenta arrow. The path bends. A live tangent/normal
   split says how much of what they are holding changes the speed and how much
   steers, and the osculating circle says which circle the path is momentarily
   riding. Three misconceptions die in the same world:

     · "acceleration is in the direction of motion" — hold it perpendicular and
       the speed readout does not move.
     · "circular motion needs an outward force" — point it outward and the path
       opens out instead of closing. You can try it; it fails visibly.
     · "projectiles run out of force at the top" — hold the arrow straight down
       in world mode and watch the parabola, arrow unchanged at the apex.

   Everything printed comes from `lib/physics/motion2d.ts`. The loop runs off
   refs with readouts throttled to 8 Hz: a setState per frame would reset the
   accumulator and drop the simulation to a crawl.
   ──────────────────────────────────────────────────────────────────────── */

type GoalKind = 'constant-speed' | 'speed-up-left';

export interface SteeringLabProps {
  /** `velocity` glues the arrow to the velocity direction — the only way a hand
   *  can hold a circle. `world` pins it to a compass direction, which is what
   *  gravity does. */
  mode?: AnchorMode;
  /** Starting arrow angle in degrees. Measured from v in `velocity` mode, from
   *  +x in `world` mode. */
  angle?: number;
  /** Starting arrow length, m/s². */
  magnitude?: number;
  speed0?: number;
  /** Starting heading in degrees from +x. */
  heading0?: number;
  /** Draw the circle the path is momentarily following, and its centre. */
  showCircle?: boolean;
  /** Let the learner switch the anchor themselves. */
  allowModeSwitch?: boolean;
  goal?: GoalKind;
  height?: number;
  caption?: string;
}

const DT = 1 / 240;
const SUBSTEPS = 4;
const TRAIL_SECONDS = 14;
const TRAIL_MAX = Math.ceil(TRAIL_SECONDS / DT / SUBSTEPS) + 8;
const MIN_SPAN = 26; // metres across, so a slow circle still reads as a circle

const GOAL_LABEL: Record<GoalKind, string> = {
  'constant-speed':
    'Hold the speed steady for three seconds with an acceleration of at least 1 m/s². Parking the arrow at zero does not count.',
  'speed-up-left':
    'Make the object speed up while the acceleration arrow points to the left of the screen, and hold it for two seconds.',
};

interface Sim {
  p: Particle;
  /** Ring of recent positions for the trail. */
  trail: Float32Array;
  n: number;
  cursor: number;
  /** Recent (t, speed) pairs, for the goal check. */
  hist: { t: number; speed: number; ax: number }[];
  goalHeldSince: number | null;
  goalDone: boolean;
}

const fmt = (v: number, d = 2) =>
  !Number.isFinite(v) ? '∞' : (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);

function cssColor(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function arrow(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  width: number,
  dashed = false,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1.5) return;
  const ux = dx / len;
  const uy = dy / len;
  const head = Math.min(13, len * 0.42);

  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dashed ? [5, 4] : []);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - ux * head * 0.7, y1 - uy * head * 0.7);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * head - uy * head * 0.4, y1 - uy * head + ux * head * 0.4);
  ctx.lineTo(x1 - ux * head + uy * head * 0.4, y1 - uy * head - ux * head * 0.4);
  ctx.closePath();
  ctx.fill();
}

/** Grid spacing that keeps roughly 6 lines across, from the 1–2–5 ladder. */
function gridStep(span: number): number {
  const raw = span / 6;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
}

export default function SteeringLab({
  mode: mode0 = 'velocity',
  angle: angle0 = 90,
  magnitude: mag0 = 4,
  speed0 = 6,
  heading0 = 0,
  showCircle: showCircle0 = true,
  allowModeSwitch = true,
  goal,
  height = 430,
  caption,
}: SteeringLabProps) {
  const reduced = usePrefersReducedMotion();

  const [mode, setMode] = useState<AnchorMode>(mode0);
  const [showCircle, setShowCircle] = useState(showCircle0);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState({
    t: 0,
    speed: speed0,
    mag: mag0,
    angleDeg: angle0,
    tangential: 0,
    normal: 0,
    turnRadius: Infinity,
    period: Infinity,
    goalHeld: 0,
    goalDone: false,
  });

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 640, h: height });

  const modeRef = useRef(mode);
  const showCircleRef = useRef(showCircle);
  const runningRef = useRef(running);
  const magRef = useRef(mag0);
  const angleRef = useRef((angle0 * Math.PI) / 180);
  const draggingRef = useRef(false);
  const simRef = useRef<Sim | null>(null);
  /** Camera: metres across the canvas, and the world point at its centre. */
  const camRef = useRef({ span: MIN_SPAN, cx: 0, cy: 0 });

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { showCircleRef.current = showCircle; }, [showCircle]);
  useEffect(() => { runningRef.current = running; }, [running]);

  const reset = useCallback(() => {
    const h = (heading0 * Math.PI) / 180;
    const p: Particle = {
      t: 0,
      x: 0,
      y: 0,
      vx: speed0 * Math.cos(h),
      vy: speed0 * Math.sin(h),
    };
    const trail = new Float32Array(TRAIL_MAX * 2);
    trail[0] = p.x;
    trail[1] = p.y;
    simRef.current = {
      p,
      trail,
      n: 1,
      cursor: 1,
      hist: [{ t: 0, speed: speed0, ax: 0 }],
      goalHeldSince: null,
      goalDone: false,
    };
    camRef.current = { span: MIN_SPAN, cx: 0, cy: 0 };
  }, [heading0, speed0]);

  useEffect(() => { reset(); }, [reset]);

  /* ── world ↔ screen ───────────────────────────────────────────────────── */
  const project = useCallback(() => {
    const { w, h } = sizeRef.current;
    const cam = camRef.current;
    const scale = Math.min(w, h) / cam.span;
    return {
      sx: (x: number) => w / 2 + (x - cam.cx) * scale,
      sy: (y: number) => h / 2 - (y - cam.cy) * scale,
      wx: (px: number) => cam.cx + (px - w / 2) / scale,
      wy: (py: number) => cam.cy - (py - h / 2) / scale,
      scale,
    };
  }, []);

  /* ── paint ────────────────────────────────────────────────────────────── */
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !sim || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = sizeRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const rule = cssColor(wrap, '--color-rule', '#2a2340');
    const ruleBright = cssColor(wrap, '--color-rule-bright', '#443a63');
    const ink = cssColor(wrap, '--color-ink-faint', '#8d84a6');
    const inkSoft = cssColor(wrap, '--color-ink-soft', '#c9c1dc');
    const cyan = cssColor(wrap, '--color-cyan', '#4fd8e8');
    const magenta = cssColor(wrap, '--color-magenta', '#ff4d9e');
    const ok = cssColor(wrap, '--color-ok', '#9fe870');
    const orchid = cssColor(wrap, '--color-orchid', '#cf7ce8');
    const iris = cssColor(wrap, '--color-iris', '#8f9cf5');

    const { sx, sy, scale } = project();
    const cam = camRef.current;

    /* grid, with a labelled scale — every axis gets one */
    const step = gridStep(cam.span);
    ctx.lineWidth = 1;
    ctx.font = '10.5px var(--font-mono), ui-monospace, monospace';
    ctx.textBaseline = 'alphabetic';
    const x0 = Math.floor((cam.cx - cam.span) / step) * step;
    const y0 = Math.floor((cam.cy - cam.span) / step) * step;
    for (let x = x0; x < cam.cx + cam.span; x += step) {
      const px = sx(x);
      if (px < 0 || px > w) continue;
      ctx.strokeStyle = Math.abs(x) < step * 1e-6 ? ruleBright : rule;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
    for (let y = y0; y < cam.cy + cam.span; y += step) {
      const py = sy(y);
      if (py < 0 || py > h) continue;
      ctx.strokeStyle = Math.abs(y) < step * 1e-6 ? ruleBright : rule;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
      ctx.stroke();
    }
    /* scale bar: one grid square, named */
    ctx.strokeStyle = inkSoft;
    ctx.fillStyle = ink;
    ctx.lineWidth = 1.5;
    const barY = h - 16;
    ctx.beginPath();
    ctx.moveTo(14, barY);
    ctx.lineTo(14 + step * scale, barY);
    ctx.moveTo(14, barY - 4);
    ctx.lineTo(14, barY + 4);
    ctx.moveTo(14 + step * scale, barY - 4);
    ctx.lineTo(14 + step * scale, barY + 4);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillText(`${step} m`, 18 + step * scale, barY + 4);

    /* the osculating circle — which circle is this path riding right now */
    const p = sim.p;
    const [ax, ay] = accelVector(p, magRef.current, angleRef.current, modeRef.current);
    const r = steerReadout(p.vx, p.vy, ax, ay);
    if (showCircleRef.current && Number.isFinite(r.turnRadius) && r.turnRadius < cam.span * 4) {
      const s = Math.hypot(p.vx, p.vy) || 1;
      const sign = Math.sign(r.normal) || 1;
      const ccx = p.x + (r.turnRadius * -p.vy * sign) / s;
      const ccy = p.y + (r.turnRadius * p.vx * sign) / s;
      ctx.strokeStyle = iris;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.arc(sx(ccx), sy(ccy), r.turnRadius * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx(ccx), sy(ccy));
      ctx.lineTo(sx(p.x), sy(p.y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = iris;
      ctx.beginPath();
      ctx.arc(sx(ccx), sy(ccy), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    /* trail */
    const n = Math.min(sim.n, TRAIL_MAX);
    if (n > 1) {
      ctx.strokeStyle = cyan;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      const start = sim.cursor - n;
      for (let k = 0; k < n; k++) {
        const i = ((start + k) % TRAIL_MAX + TRAIL_MAX) % TRAIL_MAX;
        const px = sx(sim.trail[i * 2]);
        const py = sy(sim.trail[i * 2 + 1]);
        k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    /* the two arrows, and the split of the magenta one */
    const px = sx(p.x);
    const py = sy(p.y);
    const speed = Math.hypot(p.vx, p.vy);
    // Arrows are drawn in their own fixed pixel-per-unit scales, chosen once so
    // that neither arrow's length is confusable with a distance on the grid.
    const VS = 7;  // px per (m/s)
    const AS = 16; // px per (m/s²)

    // components, drawn first so the full arrow sits on top of them
    if (speed > 1e-6) {
      const tx = p.vx / speed;
      const ty = p.vy / speed;
      const tEndX = px + tx * r.tangential * AS;
      const tEndY = py - ty * r.tangential * AS;
      arrow(ctx, px, py, tEndX, tEndY, ok, 2, true);
      const nEndX = px + -ty * r.normal * AS;
      const nEndY = py - tx * r.normal * AS;
      arrow(ctx, px, py, nEndX, nEndY, orchid, 2, true);
      // dotted closure to the arrow tip, so the split reads as a decomposition
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tEndX, tEndY);
      ctx.lineTo(px + ax * AS, py - ay * AS);
      ctx.moveTo(nEndX, nEndY);
      ctx.lineTo(px + ax * AS, py - ay * AS);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    arrow(ctx, px, py, px + p.vx * VS, py - p.vy * VS, cyan, 3);
    arrow(ctx, px, py, px + ax * AS, py - ay * AS, magenta, 3);

    /* the draggable tip */
    ctx.fillStyle = cssColor(wrap, '--color-void', '#06050a');
    ctx.strokeStyle = magenta;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(px + ax * AS, py - ay * AS, draggingRef.current ? 9 : 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    /* the particle */
    ctx.fillStyle = inkSoft;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();

    /* labels on the arrows, placed past their tips */
    ctx.font = '600 12px var(--font-sans), system-ui, sans-serif';
    ctx.fillStyle = cyan;
    ctx.textAlign = 'center';
    ctx.fillText('v', px + p.vx * VS + 14, py - p.vy * VS - 10);
    ctx.fillStyle = magenta;
    ctx.textAlign = 'left';
    ctx.fillText('a — drag me', px + ax * AS + 14, py - ay * AS + 5);
  }, [project]);

  /* ── advance ──────────────────────────────────────────────────────────── */
  const advance = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    for (let k = 0; k < SUBSTEPS; k++) {
      stepSteered(sim.p, magRef.current, angleRef.current, modeRef.current, DT);
    }
    const i = sim.cursor % TRAIL_MAX;
    sim.trail[i * 2] = sim.p.x;
    sim.trail[i * 2 + 1] = sim.p.y;
    sim.cursor += 1;
    sim.n += 1;

    const speed = Math.hypot(sim.p.vx, sim.p.vy);
    const [ax] = accelVector(sim.p, magRef.current, angleRef.current, modeRef.current);
    sim.hist.push({ t: sim.p.t, speed, ax });
    while (sim.hist.length > 1 && sim.p.t - sim.hist[0].t > 6) sim.hist.shift();

    /* camera: fit the trail, never tighter than MIN_SPAN, eased so the world
       does not jump under the learner's hand */
    let lo = [Infinity, Infinity];
    let hi = [-Infinity, -Infinity];
    const n = Math.min(sim.n, TRAIL_MAX);
    const start = sim.cursor - n;
    for (let k = 0; k < n; k += 4) {
      const idx = ((start + k) % TRAIL_MAX + TRAIL_MAX) % TRAIL_MAX;
      const x = sim.trail[idx * 2];
      const y = sim.trail[idx * 2 + 1];
      if (x < lo[0]) lo[0] = x;
      if (y < lo[1]) lo[1] = y;
      if (x > hi[0]) hi[0] = x;
      if (y > hi[1]) hi[1] = y;
    }
    lo = [Math.min(lo[0], sim.p.x), Math.min(lo[1], sim.p.y)];
    hi = [Math.max(hi[0], sim.p.x), Math.max(hi[1], sim.p.y)];
    const wantSpan = Math.max(MIN_SPAN, (hi[0] - lo[0]) * 1.35, (hi[1] - lo[1]) * 1.35);
    const cam = camRef.current;
    cam.span += (wantSpan - cam.span) * 0.02;
    cam.cx += ((lo[0] + hi[0]) / 2 - cam.cx) * 0.02;
    cam.cy += ((lo[1] + hi[1]) / 2 - cam.cy) * 0.02;
  }, []);

  /** Has the goal been met, and for how long? Measured from the history, so it
   *  cannot be satisfied by a claim. */
  const goalProgress = useCallback((): number => {
    const sim = simRef.current;
    if (!sim || !goal) return 0;
    const now = sim.p.t;
    const hold = goal === 'constant-speed' ? 3 : 2;

    const met = (() => {
      const speed = Math.hypot(sim.p.vx, sim.p.vy);
      if (goal === 'constant-speed') {
        // Measured, not asserted: the speed a full second ago against the speed
        // now. An arrow parked at zero length holds the speed trivially, so it
        // is excluded — the point is steering, not coasting.
        if (now < 1) return false;
        const back = sim.hist.find((s) => s.t >= now - 1);
        if (!back) return false;
        return (
          magRef.current >= 1 &&
          Math.abs(speed - back.speed) / Math.max(back.speed, 1e-6) < 0.005
        );
      }
      const back = sim.hist.find((s) => s.t >= now - 0.4);
      if (!back) return false;
      const [ax] = accelVector(sim.p, magRef.current, angleRef.current, modeRef.current);
      return ax < -0.5 && speed > back.speed * 1.002;
    })();

    if (!met) {
      sim.goalHeldSince = null;
      return 0;
    }
    if (sim.goalHeldSince === null) sim.goalHeldSince = now;
    const held = now - sim.goalHeldSince;
    if (held >= hold) sim.goalDone = true;
    return Math.min(1, held / hold);
  }, [goal]);

  const advanceRef = useRef(advance);
  const paintRef = useRef(paint);
  const goalRef = useRef(goalProgress);
  useEffect(() => { advanceRef.current = advance; }, [advance]);
  useEffect(() => { paintRef.current = paint; }, [paint]);
  useEffect(() => { goalRef.current = goalProgress; }, [goalProgress]);

  /* ── sizing ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width;
      sizeRef.current = { w, h: height };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${height}px`;
      paintRef.current();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [height]);

  /* ── the loop: refs in, pixels out, readouts at 8 Hz ──────────────────── */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastReadout = 0;
    const PER = DT * SUBSTEPS;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (runningRef.current) {
        acc += dt;
        let budget = 20;
        while (acc >= PER && budget-- > 0) {
          advanceRef.current();
          acc -= PER;
        }
        goalRef.current();
      }
      paintRef.current();

      if (now - lastReadout > 125) {
        lastReadout = now;
        const sim = simRef.current;
        if (sim) {
          const [ax, ay] = accelVector(sim.p, magRef.current, angleRef.current, modeRef.current);
          const r = steerReadout(sim.p.vx, sim.p.vy, ax, ay);
          const circ = circleFromSteering(r.speed, Math.abs(r.normal));
          setStats({
            t: sim.p.t,
            speed: r.speed,
            mag: magRef.current,
            // Angle between the arrows, 0-180, which is the number the lesson
            // reasons with — sign lives in `normal`.
            angleDeg: (Math.acos(
              Math.max(-1, Math.min(1, r.tangential / Math.max(magRef.current, 1e-9))),
            ) * 180) / Math.PI,
            tangential: r.tangential,
            normal: r.normal,
            turnRadius: r.turnRadius,
            period: circ.period,
            goalHeld: sim.goalHeldSince === null ? 0 : sim.p.t - sim.goalHeldSince,
            goalDone: sim.goalDone,
          });
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!reduced) {
      runningRef.current = true;
      setRunning(true);
    }
  }, [reduced]);

  /* ── dragging the arrow ───────────────────────────────────────────────── */
  const setArrowFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      const sim = simRef.current;
      if (!canvas || !sim) return;
      const rect = canvas.getBoundingClientRect();
      const { sx, sy } = project();
      const dx = (clientX - rect.left) - sx(sim.p.x);
      const dy = (clientY - rect.top) - sy(sim.p.y);
      const AS = 16;
      const mag = Math.min(12, Math.hypot(dx, dy) / AS);
      const worldAngle = Math.atan2(-dy, dx);
      magRef.current = Math.round(mag * 20) / 20;
      const raw =
        modeRef.current === 'world'
          ? worldAngle
          : worldAngle - Math.atan2(sim.p.vy, sim.p.vx);
      // Quantised to whole degrees. Without it, "perpendicular" is a
      // sub-pixel target and the learner would be fighting the mouse instead
      // of thinking about the angle; with it, 90° is a place you can stand.
      angleRef.current = (Math.round((raw * 180) / Math.PI) * Math.PI) / 180;
    },
    [project],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();
      setArrowFromPointer(e.clientX, e.clientY);
    };
    const up = () => { draggingRef.current = false; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [setArrowFromPointer]);

  /** Keyboard path: the arrow is a pair of sliders too, so the solvable is
   *  doable without a pointer. */
  const nudge = (dAngleDeg: number, dMag: number) => {
    angleRef.current += (dAngleDeg * Math.PI) / 180;
    magRef.current = Math.max(0, Math.min(12, magRef.current + dMag));
  };

  const verdict =
    Math.abs(stats.tangential) < 0.02
      ? 'steady speed'
      : stats.tangential > 0
        ? 'speeding up'
        : 'slowing down';

  const goalHeldFrac = useMemo(
    () => (goal === 'constant-speed' ? stats.goalHeld / 3 : stats.goalHeld / 2),
    [goal, stats.goalHeld],
  );

  return (
    <figure className="not-prose" style={{ margin: '2.5rem 0' }}>
      <Panel
        title={
          mode === 'velocity'
            ? 'steering — the arrow is glued to the velocity'
            : 'steering — the arrow is pinned to the world'
        }
        right={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Button
              accent={running ? 'warn' : 'ok'}
              onClick={() => {
                const next = !runningRef.current;
                runningRef.current = next;
                setRunning(next);
              }}
            >
              {running ? 'pause' : 'play'}
            </Button>
            <Button
              onClick={() => {
                reset();
                magRef.current = mag0;
                angleRef.current = (angle0 * Math.PI) / 180;
              }}
              accent="iris"
            >
              reset
            </Button>
            {allowModeSwitch && (
              <Button
                accent="orchid"
                active={mode === 'velocity'}
                title="Glued to v, the arrow turns as you turn — that is what steering is. Pinned to the world, it points the same way forever, which is what gravity does."
                onClick={() => {
                  const sim = simRef.current;
                  const next: AnchorMode = modeRef.current === 'velocity' ? 'world' : 'velocity';
                  // Keep the arrow visually where it is across the switch, so
                  // the toggle changes the RULE and not the current picture.
                  if (sim) {
                    const heading = Math.atan2(sim.p.vy, sim.p.vx);
                    angleRef.current =
                      next === 'world' ? angleRef.current + heading : angleRef.current - heading;
                  }
                  modeRef.current = next;
                  setMode(next);
                }}
              >
                {mode === 'velocity' ? 'glued to v' : 'pinned to the world'}
              </Button>
            )}
            <Button
              accent="cyan"
              active={showCircle}
              onClick={() => setShowCircle((s) => !s)}
              title="The circle the path is momentarily riding, radius v²/aₙ."
            >
              circle
            </Button>
          </div>
        }
      >
        <div ref={wrapRef} style={{ width: '100%', position: 'relative' }}>
          <canvas
            ref={canvasRef}
            style={{ display: 'block', width: '100%', touchAction: 'none', cursor: 'grab' }}
            onPointerDown={(e) => {
              e.preventDefault();
              draggingRef.current = true;
              setArrowFromPointer(e.clientX, e.clientY);
            }}
            tabIndex={0}
            role="application"
            aria-label="Steering world. Drag the acceleration arrow, or use the arrow keys to turn it and the plus and minus keys to lengthen it."
            onKeyDown={(e) => {
              const step = e.shiftKey ? 10 : 1;
              if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(step, 0); }
              else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(-step, 0); }
              else if (e.key === 'ArrowUp' || e.key === '+' || e.key === '=') { e.preventDefault(); nudge(0, 0.25); }
              else if (e.key === 'ArrowDown' || e.key === '-') { e.preventDefault(); nudge(0, -0.25); }
              else if (e.key === ' ') {
                e.preventDefault();
                const next = !runningRef.current;
                runningRef.current = next;
                setRunning(next);
              }
            }}
          />
        </div>

        <ReadoutRow>
          <Readout label="speed |v|" value={`${fmt(stats.speed)} m/s`} accent="cyan" />
          <Readout label="|a|" value={`${fmt(stats.mag)} m/s²`} accent="magenta" />
          <Readout label="angle a to v" value={`${fmt(stats.angleDeg, 0)}°`} accent="iris" />
          <Readout label="aₜ — changes speed" value={`${fmt(stats.tangential)} m/s²`} accent="ok" />
          <Readout label="aₙ — steers" value={`${fmt(Math.abs(stats.normal))} m/s²`} accent="orchid" />
          <Readout
            label="turn radius v²/aₙ"
            value={Number.isFinite(stats.turnRadius) && stats.turnRadius < 1e4 ? `${fmt(stats.turnRadius, 1)} m` : 'straight'}
            accent="aqua"
          />
          <Readout
            label="lap time 2πv/aₙ"
            value={Number.isFinite(stats.period) && stats.period < 1e4 ? `${fmt(stats.period, 1)} s` : '—'}
            accent="aqua"
          />
          <Readout
            label="verdict"
            value={verdict}
            accent={verdict === 'speeding up' ? 'ok' : verdict === 'slowing down' ? 'warn' : 'cyan'}
          />
        </ReadoutRow>

        {goal && (
          <div
            style={{
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 8,
              border: `1px solid ${stats.goalDone ? 'var(--sig-ok)' : 'var(--color-rule-bright)'}`,
              background: stats.goalDone
                ? 'color-mix(in oklab, var(--sig-ok) 10%, transparent)'
                : 'var(--color-surface)',
              fontSize: '0.95rem',
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: stats.goalDone ? 'var(--sig-ok)' : 'var(--color-ink)' }}>
              {stats.goalDone ? 'Held it. ' : 'Target: '}
            </strong>
            {GOAL_LABEL[goal]}
            <div
              style={{
                marginTop: 8,
                height: 4,
                borderRadius: 2,
                background: 'var(--color-rule)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.round(Math.min(1, goalHeldFrac) * 100)}%`,
                  height: '100%',
                  background: stats.goalDone ? 'var(--sig-ok)' : 'var(--color-cyan)',
                }}
              />
            </div>
          </div>
        )}

        {caption && (
          <figcaption
            style={{ marginTop: 10, color: 'var(--color-ink-soft)', fontSize: '0.95rem', lineHeight: 1.6 }}
          >
            {caption}
          </figcaption>
        )}
      </Panel>
    </figure>
  );
}

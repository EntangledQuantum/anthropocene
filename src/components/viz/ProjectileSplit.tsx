import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Panel,
  Readout,
  ReadoutRow,
  Slider,
  usePrefersReducedMotion,
  type ParamSpec,
} from './controls.tsx';
import { idealApex, idealRange, launchProjectile, type ProjectileState } from '../../lib/physics/kinematics.ts';
import {
  BALLS,
  ballDrag,
  flightMetrics,
  sampleFlight,
  terminalSpeed,
} from '../../lib/physics/motion2d.ts';

/* ── two 1D motions sharing one clock ──────────────────────────────────────
   One flight, three views that cannot disagree: the path through space, the
   horizontal story x(t), and the vertical story y(t). A companion ball leaves at
   the same instant with the SAME vertical velocity and no horizontal one — so
   for a flat launch it is simply dropped — and the level rule drawn between the
   two stays level all the way down. That rule is the whole argument for
   independence, and it is a picture rather than a sentence.

   Turn drag on and it breaks in four ways at once: x(t) stops being a straight
   line, y(t) loses its symmetry, the path falls inside the drag-free parabola
   which stays on screen as the reference — and the level rule tilts, because
   drag depends on the SPEED and therefore couples the two stories that were
   independent a moment ago.

   Trajectories come from `kinematics.launchProjectile` (velocity Verlet,
   drag-aware) and every number from `motion2d.flightMetrics`. The animation
   indexes a precomputed array from a ref; readouts are throttled to 8 Hz and
   the scrubber is driven imperatively, so nothing here calls setState per frame.
   ──────────────────────────────────────────────────────────────────────── */

export interface ProjectileSplitProps {
  speed?: number;
  angle?: number;
  /** Launch height above the ground, m. With angle 0 this is the classic
   *  drop-one-push-one demonstration. */
  launchHeight?: number;
  /** A key of `BALLS`, or omit for the drag-free parabola. */
  ball?: keyof typeof BALLS | '';
  /** Start with drag switched on. */
  drag?: boolean;
  /** Seconds between strobe marks. */
  strobe?: number;
  /** Show the companion ball — same vertical launch, no horizontal one. */
  showCompanion?: boolean;
  /** Let the learner move the launch. */
  allowSpeed?: boolean;
  allowAngle?: boolean;
  allowDrag?: boolean;
  height?: number;
  caption?: string;
}

const G = 9.81;
const DT = 0.002;
const PAD = { l: 58, r: 16, t: 16, b: 30 };

const fmt = (v: number, d = 1) =>
  !Number.isFinite(v) ? '—' : (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);

function cssColor(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function niceTicks(lo: number, hi: number, count = 4): number[] {
  const raw = (hi - lo) / count;
  if (!(raw > 0)) return [lo];
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    out.push(Math.abs(v) < step * 1e-6 ? 0 : v);
  }
  return out;
}

export default function ProjectileSplit({
  speed: speed0 = 24,
  angle: angle0 = 50,
  launchHeight = 0,
  ball = 'baseball',
  drag: drag0 = false,
  strobe = 0.25,
  showCompanion = true,
  allowSpeed = true,
  allowAngle = true,
  allowDrag = true,
  height = 300,
  caption,
}: ProjectileSplitProps) {
  const reduced = usePrefersReducedMotion();

  const [speed, setSpeed] = useState(speed0);
  const [angle, setAngle] = useState(angle0);
  const [dragOn, setDragOn] = useState(drag0 && ball !== '');
  const [running, setRunning] = useState(false);
  const [now, setNow] = useState(0);

  const spec = ball ? BALLS[ball] : null;
  const k = spec ? ballDrag(spec) : 0;

  /* ── the flights ──────────────────────────────────────────────────────── */
  const flight = useMemo(() => {
    const groundY = -launchHeight;
    const opts = { g: G, dt: DT, groundY, maxSteps: 60_000 };
    const actual = launchProjectile(speed, angle, { ...opts, drag: dragOn ? k : 0 });
    // The drag-free reference stays on screen whatever the toggle says: the
    // comparison IS the lesson, so it must not vanish when drag comes on.
    const ideal = dragOn ? launchProjectile(speed, angle, opts) : actual;
    // The companion: same instant, same height, same air, same VERTICAL launch
    // velocity, no horizontal one. For a flat launch that is a ball dropped from
    // rest, which is the demonstration everybody has seen; for any other angle
    // it is the same ball thrown straight up. Either way its height is the
    // launched ball's height at every instant — unless there is drag.
    const vy0 = speed * Math.sin((angle * Math.PI) / 180);
    const companion = launchProjectile(vy0, 90, { ...opts, drag: dragOn ? k : 0 });
    return {
      actual,
      ideal,
      companion,
      companionIsDrop: vy0 < 1e-9,
      metrics: flightMetrics(actual, G),
      idealMetrics: flightMetrics(ideal, G),
      tEnd: actual[actual.length - 1].t,
      tIdeal: ideal[ideal.length - 1].t,
      tCompanion: companion[companion.length - 1].t,
    };
  }, [speed, angle, dragOn, k, launchHeight]);

  const flightRef = useRef(flight);
  useEffect(() => { flightRef.current = flight; }, [flight]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const pathCanvas = useRef<HTMLCanvasElement>(null);
  const stripCanvas = useRef<HTMLCanvasElement>(null);
  const scrubRef = useRef<HTMLInputElement>(null);
  const sizeRef = useRef({ w: 640 });
  const tRef = useRef(0);
  const runningRef = useRef(running);
  useEffect(() => { runningRef.current = running; }, [running]);

  // A changed launch restarts the clock: comparing frame 300 of one flight with
  // frame 300 of another is the only honest way to show independence.
  useEffect(() => { tRef.current = 0; setNow(0); }, [speed, angle, dragOn]);

  /* ── paint: the path through space ────────────────────────────────────── */
  const paintPath = useCallback(() => {
    const canvas = pathCanvas.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const f = flightRef.current;
    const { w } = sizeRef.current;
    const h = height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const rule = cssColor(wrap, '--color-rule', '#2a2340');
    const ruleBright = cssColor(wrap, '--color-rule-bright', '#443a63');
    const faint = cssColor(wrap, '--color-ink-faint', '#8d84a6');
    const inkSoft = cssColor(wrap, '--color-ink-soft', '#c9c1dc');
    const cyan = cssColor(wrap, '--color-cyan', '#4fd8e8');
    const magenta = cssColor(wrap, '--color-magenta', '#ff4d9e');
    const aqua = cssColor(wrap, '--color-aqua', '#7ff0e4');
    const orchid = cssColor(wrap, '--color-orchid', '#cf7ce8');

    // One shared equal-aspect frame, sized to whichever flight is longer, so
    // the dragged path visibly falls short instead of being rescaled to fit.
    const xMax = Math.max(f.idealMetrics.range, f.metrics.range) * 1.06 + 1;
    const yMax = Math.max(f.idealMetrics.apex, f.metrics.apex) + launchHeight + 2;
    const plotW = w - PAD.l - PAD.r;
    const plotH = h - PAD.t - PAD.b;
    const scale = Math.min(plotW / xMax, plotH / (yMax + 0.5));
    const ox = PAD.l;
    const oy = h - PAD.b - launchHeight * scale;
    const sx = (x: number) => ox + x * scale;
    const sy = (y: number) => oy - y * scale;

    /* ground, and the metre grid with labels */
    const step = (() => {
      const raw = xMax / 7;
      const mag = 10 ** Math.floor(Math.log10(raw));
      const n = raw / mag;
      return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * mag;
    })();
    ctx.lineWidth = 1;
    ctx.font = '10.5px var(--font-mono), ui-monospace, monospace';
    ctx.fillStyle = faint;
    ctx.textAlign = 'center';
    for (let x = 0; x <= xMax; x += step) {
      ctx.strokeStyle = rule;
      ctx.beginPath();
      ctx.moveTo(sx(x), PAD.t);
      ctx.lineTo(sx(x), h - PAD.b);
      ctx.stroke();
      ctx.fillText(String(Math.round(x)), sx(x), h - PAD.b + 14);
    }
    ctx.textAlign = 'right';
    for (let y = 0; y <= yMax; y += step) {
      ctx.strokeStyle = rule;
      ctx.beginPath();
      ctx.moveTo(PAD.l, sy(y));
      ctx.lineTo(w - PAD.r, sy(y));
      ctx.stroke();
      ctx.fillText(String(Math.round(y)), PAD.l - 7, sy(y) + 3.5);
    }
    ctx.strokeStyle = ruleBright;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(PAD.l, h - PAD.b);
    ctx.lineTo(w - PAD.r, h - PAD.b);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = faint;
    ctx.fillText('horizontal distance (m)', PAD.l, h - 4);
    ctx.save();
    ctx.translate(13, PAD.t + 6);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'right';
    ctx.fillText('height (m)', 0, 0);
    ctx.restore();

    const drawPath = (
      path: readonly ProjectileState[],
      color: string,
      width: number,
      dash: number[],
      upTo: number,
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      let started = false;
      for (const s of path) {
        if (s.t > upTo) break;
        const X = sx(s.x);
        const Y = sy(s.y);
        started ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        started = true;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const t = tRef.current;

    /* the drag-free reference, whole, faint */
    if (f.ideal !== f.actual) {
      drawPath(f.ideal, magenta, 1.4, [5, 5], Infinity);
      const lastIdeal = f.ideal[f.ideal.length - 1];
      ctx.fillStyle = magenta;
      ctx.globalAlpha = 0.85;
      ctx.font = '11px var(--font-sans), system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('no air', sx(lastIdeal.x) - 6, sy(0) - 8);
      ctx.globalAlpha = 1;
    }

    /* the flight so far */
    drawPath(f.actual, cyan, 2.4, [], t);

    /* strobes: equal time steps. Without drag the vertical gaps between them
       are identical to the dropped ball's, which is the point. */
    ctx.fillStyle = cyan;
    for (let ts = 0; ts <= Math.min(t, f.tEnd) + 1e-9; ts += strobe) {
      const s = sampleFlight(f.actual, ts);
      ctx.beginPath();
      ctx.arc(sx(s.x), sy(s.y), 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    /* the companion ball, its strobes, and the level rule between the two */
    if (showCompanion) {
      ctx.strokeStyle = faint;
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx(0), PAD.t);
      ctx.lineTo(sx(0), h - PAD.b);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      ctx.fillStyle = orchid;
      for (let ts = 0; ts <= Math.min(t, f.tCompanion) + 1e-9; ts += strobe) {
        const d = sampleFlight(f.companion, ts);
        ctx.beginPath();
        ctx.arc(sx(0), sy(d.y), 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      const d = sampleFlight(f.companion, Math.min(t, f.tCompanion));
      const s = sampleFlight(f.actual, Math.min(t, f.tEnd));
      // The level rule: same height, same instant, whatever the sideways story.
      ctx.strokeStyle = orchid;
      ctx.globalAlpha = 0.75;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(sx(0), sy(d.y));
      ctx.lineTo(sx(s.x), sy(d.y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      ctx.fillStyle = orchid;
      ctx.beginPath();
      ctx.arc(sx(0), sy(d.y), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '11px var(--font-sans), system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(f.companionIsDrop ? 'dropped' : 'straight up', sx(0) + 10, sy(d.y) - 9);
    }

    /* the ball itself, plus its velocity arrow split into the two stories */
    const s = sampleFlight(f.actual, Math.min(t, f.tEnd));
    // Velocity arrows in their own scale: 1 m/s draws as 0.35 m of world, so an
    // arrow is never confusable with a distance on the grid.
    const VS = 0.35 * scale;
    const drawArrow = (dx: number, dy: number, color: string, width: number) => {
      const X0 = sx(s.x);
      const Y0 = sy(s.y);
      const X1 = X0 + dx * VS;
      const Y1 = Y0 - dy * VS;
      const len = Math.hypot(X1 - X0, Y1 - Y0);
      if (len < 3) return;
      const ux = (X1 - X0) / len;
      const uy = (Y1 - Y0) / len;
      const head = Math.min(9, len * 0.4);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(X0, Y0);
      ctx.lineTo(X1 - ux * head * 0.7, Y1 - uy * head * 0.7);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(X1, Y1);
      ctx.lineTo(X1 - ux * head - uy * head * 0.42, Y1 - uy * head + ux * head * 0.42);
      ctx.lineTo(X1 - ux * head + uy * head * 0.42, Y1 - uy * head - ux * head * 0.42);
      ctx.closePath();
      ctx.fill();
    };
    drawArrow(s.vx, 0, aqua, 2);
    drawArrow(0, s.vy, orchid, 2);
    drawArrow(s.vx, s.vy, cyan, 2.6);

    ctx.fillStyle = inkSoft;
    ctx.beginPath();
    ctx.arc(sx(s.x), sy(s.y), 6, 0, Math.PI * 2);
    ctx.fill();
  }, [height, launchHeight, showCompanion, strobe]);

  /* ── paint: the two 1D stories, stacked on one time axis ──────────────── */
  const paintStrips = useCallback(() => {
    const canvas = stripCanvas.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const f = flightRef.current;
    const { w } = sizeRef.current;
    const h = 230;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const rule = cssColor(wrap, '--color-rule', '#2a2340');
    const ruleBright = cssColor(wrap, '--color-rule-bright', '#443a63');
    const faint = cssColor(wrap, '--color-ink-faint', '#8d84a6');
    const aqua = cssColor(wrap, '--color-aqua', '#7ff0e4');
    const orchid = cssColor(wrap, '--color-orchid', '#cf7ce8');
    const magenta = cssColor(wrap, '--color-magenta', '#ff4d9e');
    const cyan = cssColor(wrap, '--color-cyan', '#4fd8e8');

    const tEnd = Math.max(f.tEnd, f.tIdeal, f.tCompanion);
    const panelH = (h - PAD.t - PAD.b) / 2;
    const plotW = w - PAD.l - PAD.r;
    const stx = (t: number) => PAD.l + (t / tEnd) * plotW;

    const strip = (
      top: number,
      label: string,
      color: string,
      value: (s: ProjectileState) => number,
      lo: number,
      hi: number,
      reference?: readonly ProjectileState[],
      /** A second real flight drawn thick and faint underneath. With drag off
       *  the companion's y(t) sits exactly on the ball's — which is the whole
       *  independence claim, in graph form, with nothing asserted. */
      overlay?: readonly ProjectileState[],
    ) => {
      const inner = panelH - 20;
      const sy = (v: number) => top + inner - ((v - lo) / (hi - lo || 1)) * inner;

      ctx.font = '10.5px var(--font-mono), ui-monospace, monospace';
      ctx.fillStyle = faint;
      ctx.textAlign = 'right';
      for (const tk of niceTicks(lo, hi, 3)) {
        ctx.strokeStyle = Math.abs(tk) < 1e-9 ? ruleBright : rule;
        ctx.beginPath();
        ctx.moveTo(PAD.l, sy(tk));
        ctx.lineTo(w - PAD.r, sy(tk));
        ctx.stroke();
        ctx.fillText(String(Math.round(tk * 10) / 10), PAD.l - 7, sy(tk) + 3.5);
      }

      if (reference && reference !== f.actual) {
        ctx.strokeStyle = magenta;
        ctx.lineWidth = 1.3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        reference.forEach((s, i) => {
          const X = stx(s.t);
          const Y = sy(value(s));
          i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (overlay) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.32;
        ctx.lineWidth = 7;
        ctx.beginPath();
        overlay.forEach((s, i) => {
          const X = stx(s.t);
          const Y = sy(value(s));
          i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
        });
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      let started = false;
      for (const s of f.actual) {
        if (s.t > tRef.current) break;
        const X = stx(s.t);
        const Y = sy(value(s));
        started ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        started = true;
      }
      ctx.stroke();

      // the moving dot, and the cursor line shared by both panels
      const cur = sampleFlight(f.actual, Math.min(tRef.current, f.tEnd));
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(stx(Math.min(tRef.current, f.tEnd)), sy(value(cur)), 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '11.5px var(--font-sans), system-ui, sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.fillText(label, PAD.l + 6, top + 12);
    };

    const xHi = Math.max(f.metrics.range, f.idealMetrics.range) * 1.05;
    const yHi = Math.max(f.metrics.apex, f.idealMetrics.apex) * 1.12 + 0.5;
    strip(PAD.t, 'the horizontal story — x(t), metres', aqua, (s) => s.x, 0, xHi, f.ideal);
    strip(
      PAD.t + panelH,
      f.companionIsDrop
        ? 'the vertical story — y(t), metres · thick band: the dropped ball'
        : 'the vertical story — y(t), metres · thick band: the ball thrown straight up',
      orchid,
      (s) => s.y,
      -launchHeight,
      yHi,
      f.ideal,
      showCompanion ? f.companion : undefined,
    );

    /* shared time cursor */
    ctx.strokeStyle = cyan;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(stx(Math.min(tRef.current, tEnd)), PAD.t);
    ctx.lineTo(stx(Math.min(tRef.current, tEnd)), h - PAD.b);
    ctx.stroke();
    ctx.globalAlpha = 1;

    /* time axis */
    ctx.strokeStyle = ruleBright;
    ctx.beginPath();
    ctx.moveTo(PAD.l, h - PAD.b);
    ctx.lineTo(w - PAD.r, h - PAD.b);
    ctx.stroke();
    ctx.font = '10.5px var(--font-mono), ui-monospace, monospace';
    ctx.fillStyle = faint;
    ctx.textAlign = 'center';
    for (const tk of niceTicks(0, tEnd, 5)) {
      ctx.fillText(String(Math.round(tk * 10) / 10), stx(tk), h - PAD.b + 14);
    }
    ctx.textAlign = 'right';
    ctx.fillText('time (s)', w - PAD.r, h - 3);
  }, [launchHeight, showCompanion]);

  const paintPathRef = useRef(paintPath);
  const paintStripsRef = useRef(paintStrips);
  useEffect(() => { paintPathRef.current = paintPath; }, [paintPath]);
  useEffect(() => { paintStripsRef.current = paintStrips; }, [paintStrips]);

  /* ── sizing ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width;
      sizeRef.current = { w };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const [canvas, hh] of [
        [pathCanvas.current, height],
        [stripCanvas.current, 230],
      ] as const) {
        if (!canvas) continue;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(hh * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${hh}px`;
      }
      paintPathRef.current();
      paintStripsRef.current();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [height]);

  /* ── the loop ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastReadout = 0;

    const frame = (t0: number) => {
      const dt = Math.min((t0 - last) / 1000, 0.05);
      last = t0;
      const f = flightRef.current;
      const span = Math.max(f.tEnd, f.tCompanion);
      if (runningRef.current) {
        // Half real time: a 5 s flight watched at 1× is over before the eye has
        // found the second ball.
        tRef.current += dt * 0.5;
        if (tRef.current >= span) {
          tRef.current = span;
          runningRef.current = false;
          setRunning(false);
        }
        // The scrubber is written imperatively rather than being React state,
        // so following the flight costs no re-render.
        if (scrubRef.current) scrubRef.current.value = String(tRef.current);
      }
      paintPathRef.current();
      paintStripsRef.current();
      if (t0 - lastReadout > 125) {
        lastReadout = t0;
        setNow(tRef.current);
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

  const speedSpec: ParamSpec = useMemo(
    () => ({ key: 'v', label: 'launch speed', symbol: 'v₀', min: 5, max: 45, step: 0.5, value: speed0, unit: 'm/s' }),
    [speed0],
  );
  const angleSpec: ParamSpec = useMemo(
    () => ({ key: 'th', label: 'launch angle', symbol: 'θ', min: 0, max: 85, step: 1, value: angle0, unit: '°' }),
    [angle0],
  );

  const cur = sampleFlight(flight.actual, Math.min(now, flight.tEnd));
  const m = flight.metrics;
  const span = Math.max(flight.tEnd, flight.tCompanion);

  return (
    <figure className="not-prose" style={{ margin: '2.5rem 0' }}>
      <Panel
        title={dragOn ? `projectile — with ${spec?.label ?? ''} drag` : 'projectile — no air'}
        right={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Button
              accent={running ? 'warn' : 'ok'}
              onClick={() => {
                if (!runningRef.current && tRef.current >= span - 1e-6) tRef.current = 0;
                const next = !runningRef.current;
                runningRef.current = next;
                setRunning(next);
              }}
            >
              {running ? 'pause' : 'play'}
            </Button>
            <Button
              accent="iris"
              onClick={() => {
                tRef.current = 0;
                setNow(0);
                if (scrubRef.current) scrubRef.current.value = '0';
              }}
            >
              replay
            </Button>
            {allowDrag && spec && (
              <Button
                accent={dragOn ? 'magenta' : 'cyan'}
                active={dragOn}
                onClick={() => setDragOn((d) => !d)}
                title={`Quadratic drag, k = ${k.toExponential(2)} 1/m for a ${spec.label}. Terminal speed ${fmt(terminalSpeed(k, G))} m/s.`}
              >
                {dragOn ? 'air on' : 'air off'}
              </Button>
            )}
          </div>
        }
      >
        <div ref={wrapRef} style={{ width: '100%' }}>
          <canvas ref={pathCanvas} style={{ display: 'block', width: '100%' }} />
          <canvas ref={stripCanvas} style={{ display: 'block', width: '100%', marginTop: 4 }} />
        </div>

        <label style={{ display: 'block', marginTop: 6 }}>
          <span className="hud-label">scrub the flight — t = {fmt(now, 2)} s</span>
          <input
            ref={scrubRef}
            type="range"
            min={0}
            max={span}
            step={span / 600}
            defaultValue={0}
            className="anth-slider"
            aria-label="time through the flight"
            onInput={(e) => {
              runningRef.current = false;
              setRunning(false);
              tRef.current = Number((e.target as HTMLInputElement).value);
              setNow(tRef.current);
            }}
          />
        </label>

        {(allowSpeed || allowAngle) && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))',
              gap: 14,
              marginTop: 6,
            }}
          >
            {allowSpeed && <Slider spec={speedSpec} value={speed} onChange={setSpeed} />}
            {allowAngle && <Slider spec={angleSpec} value={angle} onChange={setAngle} />}
          </div>
        )}

        <ReadoutRow>
          <Readout label="t" value={`${fmt(now, 2)} s`} accent="cyan" />
          <Readout label="vₓ — sideways" value={`${fmt(cur.vx)} m/s`} accent="aqua" />
          <Readout label="v_y — up" value={`${fmt(cur.vy)} m/s`} accent="orchid" />
          <Readout label="height" value={`${fmt(cur.y)} m`} accent="orchid" />
          <Readout label="range" value={`${fmt(m.range)} m`} accent="cyan" />
          <Readout
            label="range without air"
            value={`${fmt(idealRange(speed, angle, G))} m`}
            accent="magenta"
          />
          <Readout label="apex" value={`${fmt(m.apex)} m`} accent="cyan" />
          <Readout
            label="apex without air"
            value={`${fmt(idealApex(speed, angle, G))} m`}
            accent="magenta"
          />
          <Readout label="climb / fall" value={`${fmt(m.riseTime, 2)} / ${fmt(m.fallTime, 2)} s`} accent="iris" />
          <Readout
            label="lands at"
            value={`${fmt(m.impactSpeed)} m/s, ${fmt(m.impactAngleDeg, 0)}°`}
            accent="iris"
          />
        </ReadoutRow>

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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Panel, Readout, ReadoutRow, Slider, Toggle, usePrefersReducedMotion, type ParamSpec } from './controls.tsx';
import { ACCENTS, formatValue } from './chart-core.ts';
import {
  DEFAULT_OMEGA,
  det3,
  I3,
  matVec,
  orthoResidual,
  pendulumEnergy,
  pendulumG,
  pendulumGDot,
  pendulumQ,
  pendulumRadius,
  pendulumState,
  pendulumV,
  stepPendulum,
  stepRotation,
  type Mat3,
  type PendulumMethod,
  type RotationMethod,
  type Vec3,
} from '../../lib/numerics/constraints.ts';
import type { State } from '../../lib/numerics/types.ts';

/* ─────────────────────────────────────────────────────────────────────────
   One state, two pictures: the object, and how far it is from its manifold.

   Pendulum: the unit circle is the law. Index-reduced RK4 walks off it;
   SHAKE/RATTLE stay on it. The radial gap is the lesson.

   Rotation: a cube whose vertices are R v. RK4 on the nine entries shears
   the cube; R ← R exp(h ω̂) never does. A matrix that left SO(3) is not a
   slightly wrong rotation.

   The loop is driven from refs. Readouts throttle to ~8 Hz.
   ───────────────────────────────────────────────────────────────────────── */

const HIST = 360;
const TRAIL = 140;
const SPEED = 6;

export interface ManifoldLabProps {
  system?: 'pendulum' | 'rotation';
  /** Initial method. Pendulum default is the failure: RK4 on the ODE. */
  method?: string;
  h?: number;
  height?: number;
  caption?: string;
}

const PENDULUM_METHODS: { key: PendulumMethod; label: string; accent: 'cyan' | 'magenta' | 'iris' | 'ok' }[] = [
  { key: 'index-rk4', label: 'RK4 on the ODE', accent: 'magenta' },
  { key: 'shake', label: 'SHAKE', accent: 'cyan' },
  { key: 'rattle', label: 'RATTLE', accent: 'ok' },
  { key: 'project', label: 'RK4 + project', accent: 'iris' },
];

const ROTATION_METHODS: { key: RotationMethod; label: string; accent: 'cyan' | 'magenta' | 'iris' }[] = [
  { key: 'rk4', label: 'RK4 on entries', accent: 'magenta' },
  { key: 'lie', label: 'Lie-group exp', accent: 'cyan' },
  { key: 'project', label: 'RK4 + Gram–Schmidt', accent: 'iris' },
];

interface PendulumSim {
  y: State;
  t: number;
  steps: number;
  g: Float32Array;
  gdot: Float32Array;
  trailX: Float32Array;
  trailY: Float32Array;
  filled: number;
  cursor: number;
  trailN: number;
}

interface RotationSim {
  R: Mat3;
  t: number;
  steps: number;
  residual: Float32Array;
  det: Float32Array;
  filled: number;
  cursor: number;
}

function cssColor(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function pushRing(buf: Float32Array, cursor: number, v: number): void {
  buf[cursor % HIST] = v;
}

function histMinMax(buf: Float32Array, filled: number, cursor: number, pad = 0.04): [number, number] {
  let lo = Infinity, hi = -Infinity;
  const n = Math.min(filled, HIST);
  const start = cursor - n;
  for (let k = 0; k < n; k++) {
    const v = buf[(start + k + HIST * 4) % HIST]!;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo)) return [-pad, pad];
  if (lo === hi) return [lo - pad, hi + pad];
  const extra = pad * Math.max(hi - lo, pad);
  return [lo - extra, hi + extra];
}

function project3d(p: Vec3, cx: number, cy: number, scale: number): [number, number] {
  const yaw = 0.62, pitch = 0.42;
  const cosy = Math.cos(yaw), siny = Math.sin(yaw);
  const cosp = Math.cos(pitch), sinp = Math.sin(pitch);
  const x1 = p[0] * cosy - p[2] * siny;
  const z1 = p[0] * siny + p[2] * cosy;
  const y1 = p[1] * cosp - z1 * sinp;
  return [cx + x1 * scale, cy - y1 * scale];
}

export default function ManifoldLab({
  system = 'pendulum',
  method: method0,
  h: h0,
  height = 340,
  caption,
}: ManifoldLabProps) {
  const isPendulum = system === 'pendulum';
  const initialMethod = method0 ?? (isPendulum ? 'index-rk4' : 'rk4');
  const initialH = h0 ?? 0.2;

  const [method, setMethod] = useState(initialMethod);
  const [h, setH] = useState(initialH);
  const [running, setRunning] = useState(false);
  const [blown, setBlown] = useState(false);
  const [stats, setStats] = useState({
    t: 0, radius: 1, g: 0, gdot: 0, energy: 0, residual: 0, det: 1, steps: 0,
  });

  const reduced = usePrefersReducedMotion();

  const wrapRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLCanvasElement>(null);
  const traceRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 420, h: height });

  const methodRef = useRef(method);
  const hRef = useRef(h);
  const runningRef = useRef(running);
  const pendRef = useRef<PendulumSim | null>(null);
  const rotRef = useRef<RotationSim | null>(null);

  const hSpec: ParamSpec = useMemo(
    () => ({
      key: 'h', label: 'step size', symbol: 'h',
      min: 0.03, max: 0.36, step: 0.01, value: initialH,
      hint: 'Large enough that manifold drift is a shape, not a rounding error.',
    }),
    [initialH],
  );

  const seedPendulum = useCallback(() => {
    const y = pendulumState();
    const q = pendulumQ(y);
    const v = pendulumV(y);
    pendRef.current = {
      y: y.slice(), t: 0, steps: 0,
      g: new Float32Array(HIST),
      gdot: new Float32Array(HIST),
      trailX: new Float32Array(TRAIL),
      trailY: new Float32Array(TRAIL),
      filled: 1, cursor: 1, trailN: 1,
    };
    pendRef.current.g[0] = pendulumG(q);
    pendRef.current.gdot[0] = pendulumGDot(q, v);
    pendRef.current.trailX[0] = q[0];
    pendRef.current.trailY[0] = q[1];
    setBlown(false);
    setStats({
      t: 0, radius: 1, g: 0, gdot: 0,
      energy: pendulumEnergy(q, v), residual: 0, det: 1, steps: 0,
    });
  }, []);

  const seedRotation = useCallback(() => {
    rotRef.current = {
      R: I3.slice(), t: 0, steps: 0,
      residual: new Float32Array(HIST),
      det: new Float32Array(HIST),
      filled: 1, cursor: 1,
    };
    rotRef.current.residual[0] = 0;
    rotRef.current.det[0] = 0;
    setBlown(false);
    setStats({ t: 0, radius: 1, g: 0, gdot: 0, energy: 0, residual: 0, det: 1, steps: 0 });
  }, []);

  const seed = useCallback(() => {
    if (isPendulum) seedPendulum();
    else seedRotation();
  }, [isPendulum, seedPendulum, seedRotation]);

  useEffect(() => { seed(); }, [seed]);

  const paintWorld = useCallback(() => {
    const canvas = worldRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h: hh } = sizeRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);

    const abyss = cssColor(canvas, '--color-abyss', '#0c0a15');
    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, w, hh);

    if (isPendulum) {
      const sim = pendRef.current;
      if (!sim) return;
      const q = pendulumQ(sim.y);
      const pad = 16;
      const side = Math.min(w, hh) - pad * 2;
      const cx = w / 2;
      const cy = hh / 2;
      const scale = side / 3.4;
      const X = (x: number) => cx + x * scale;
      const Y = (y: number) => cy - y * scale;

      ctx.strokeStyle = ACCENTS.faint;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(X(0), Y(0), scale, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = ACCENTS.faint;
      ctx.font = '11px var(--font-mono), ui-monospace, monospace';
      ctx.fillText('x² + y² = 1', X(0.62), Y(1.18));

      const n = Math.min(sim.trailN, TRAIL);
      const start = sim.steps - n + 1;
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const i = (start + k + TRAIL * 4) % TRAIL;
        const px = X(sim.trailX[i]!);
        const py = Y(sim.trailY[i]!);
        k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.strokeStyle = ACCENTS.magenta;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.globalAlpha = 1;

      const r = pendulumRadius(q);
      if (r > 1e-9) {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = ACCENTS.iris;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(X(q[0] / r), Y(q[1] / r));
        ctx.lineTo(X(q[0]), Y(q[1]));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(X(q[0] / r), Y(q[1] / r), 3.2, 0, Math.PI * 2);
        ctx.fillStyle = ACCENTS.iris;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      ctx.lineTo(X(q[0]), Y(q[1]));
      ctx.strokeStyle = ACCENTS.cyan;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(X(0), Y(0), 3, 0, Math.PI * 2);
      ctx.fillStyle = ACCENTS.ink;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(X(q[0]), Y(q[1]), 6, 0, Math.PI * 2);
      ctx.fillStyle = ACCENTS.magenta;
      ctx.shadowColor = ACCENTS.magenta;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
      return;
    }

    const sim = rotRef.current;
    if (!sim) return;
    const R = sim.R;
    const cx = w / 2;
    const cy = hh / 2;
    const scale = Math.min(w, hh) * 0.28;
    const s = 0.7;
    const corners: Vec3[] = [];
    for (const x of [-s, s]) for (const y of [-s, s]) for (const z of [-s, s]) {
      corners.push(matVec(R, [x, y, z]));
    }
    const edges: [number, number][] = [
      [0, 1], [1, 3], [3, 2], [2, 0],
      [4, 5], [5, 7], [7, 6], [6, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    ctx.strokeStyle = ACCENTS.cyan;
    ctx.lineWidth = 1.6;
    for (const [a, b] of edges) {
      const pa = project3d(corners[a]!, cx, cy, scale);
      const pb = project3d(corners[b]!, cx, cy, scale);
      ctx.beginPath();
      ctx.moveTo(pa[0], pa[1]);
      ctx.lineTo(pb[0], pb[1]);
      ctx.stroke();
    }
    const axes: { v: Vec3; color: string; label: string }[] = [
      { v: matVec(R, [1.15, 0, 0]), color: ACCENTS.magenta, label: 'e₁' },
      { v: matVec(R, [0, 1.15, 0]), color: ACCENTS.aqua, label: 'e₂' },
      { v: matVec(R, [0, 0, 1.15]), color: ACCENTS.iris, label: 'e₃' },
    ];
    const origin = project3d([0, 0, 0], cx, cy, scale);
    ctx.font = '11px var(--font-mono), ui-monospace, monospace';
    for (const ax of axes) {
      const p = project3d(ax.v, cx, cy, scale);
      ctx.strokeStyle = ax.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(origin[0], origin[1]);
      ctx.lineTo(p[0], p[1]);
      ctx.stroke();
      ctx.fillStyle = ax.color;
      ctx.fillText(ax.label, p[0] + 4, p[1] - 4);
    }
  }, [isPendulum]);

  const paintTraces = useCallback(() => {
    const canvas = traceRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 240;
    const hh = canvas.clientHeight || height;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hh * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hh * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);

    const ink = ACCENTS.faint;
    const rule = cssColor(canvas, '--color-rule', '#2a2340');
    const padL = 48, padR = 10, padT = 18, gap = 16;
    const plotH = (hh - padT * 2 - gap) / 2;

    const drawPanel = (
      y0: number, buf: Float32Array, color: string, label: string,
      filled: number, cursor: number, domain: [number, number],
    ) => {
      const x0 = padL, x1 = w - padR, y1 = y0 + plotH;
      ctx.strokeStyle = rule;
      ctx.strokeRect(x0, y0, x1 - x0, plotH);
      const [lo, hi] = domain;
      const yOf = (v: number) => y1 - ((v - lo) / (hi - lo)) * plotH;
      if (0 >= lo && 0 <= hi) {
        const yy = yOf(0);
        ctx.strokeStyle = ink;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x0, yy);
        ctx.lineTo(x1, yy);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const n = filled;
      const start = cursor - n;
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const v = buf[(start + k + HIST * 4) % HIST]!;
        const x = x0 + (k / Math.max(1, HIST - 1)) * (x1 - x0);
        const y = yOf(v);
        k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.font = '10px var(--font-mono), ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(label, x0, y0 - 5);
      ctx.textAlign = 'right';
      ctx.fillText(formatValue(hi, 3), x0 - 4, y0 + 10);
      ctx.fillText(formatValue(lo, 3), x0 - 4, y1);
      ctx.textAlign = 'left';
    };

    if (isPendulum) {
      const sim = pendRef.current;
      if (!sim) return;
      let [gLo, gHi] = histMinMax(sim.g, sim.filled, sim.cursor, 0.01);
      gLo = Math.min(gLo, -0.02);
      gHi = Math.max(gHi, 0.02);
      let [dLo, dHi] = histMinMax(sim.gdot, sim.filled, sim.cursor, 0.02);
      dLo = Math.min(dLo, -0.05);
      dHi = Math.max(dHi, 0.05);
      drawPanel(padT, sim.g, ACCENTS.magenta, 'g = ½(|q|² − 1)', sim.filled, sim.cursor, [gLo, gHi]);
      drawPanel(padT + plotH + gap, sim.gdot, ACCENTS.cyan, 'q · v', sim.filled, sim.cursor, [dLo, dHi]);
      return;
    }

    const sim = rotRef.current;
    if (!sim) return;
    let [rLo, rHi] = histMinMax(sim.residual, sim.filled, sim.cursor, 1e-4);
    rLo = Math.min(0, rLo);
    rHi = Math.max(rHi, 5e-4);
    let [dLo, dHi] = histMinMax(sim.det, sim.filled, sim.cursor, 1e-4);
    dLo = Math.min(dLo, -5e-4);
    dHi = Math.max(dHi, 5e-4);
    drawPanel(padT, sim.residual, ACCENTS.magenta, '‖RᵀR − I‖_F', sim.filled, sim.cursor, [rLo, rHi]);
    drawPanel(padT + plotH + gap, sim.det, ACCENTS.cyan, 'det R − 1', sim.filled, sim.cursor, [dLo, dHi]);
  }, [height, isPendulum]);

  const advance = useCallback(() => {
    const hh = hRef.current;
    if (isPendulum) {
      const sim = pendRef.current;
      if (!sim) return;
      const next = stepPendulum(methodRef.current as PendulumMethod, sim.y, hh);
      if (!next.every(Number.isFinite) || pendulumRadius(pendulumQ(next)) > 8) {
        runningRef.current = false;
        setBlown(true);
        setRunning(false);
        return;
      }
      sim.y = next;
      sim.t += hh;
      sim.steps += 1;
      const q = pendulumQ(next);
      const v = pendulumV(next);
      pushRing(sim.g, sim.cursor, pendulumG(q));
      pushRing(sim.gdot, sim.cursor, pendulumGDot(q, v));
      sim.cursor += 1;
      if (sim.filled < HIST) sim.filled += 1;
      const ti = sim.steps % TRAIL;
      sim.trailX[ti] = q[0];
      sim.trailY[ti] = q[1];
      if (sim.trailN < TRAIL) sim.trailN += 1;
      return;
    }
    const sim = rotRef.current;
    if (!sim) return;
    const next = stepRotation(methodRef.current as RotationMethod, sim.R, DEFAULT_OMEGA, hh);
    if (!next.every(Number.isFinite)) {
      runningRef.current = false;
      setBlown(true);
      setRunning(false);
      return;
    }
    sim.R = next;
    sim.t += hh;
    sim.steps += 1;
    pushRing(sim.residual, sim.cursor, orthoResidual(next));
    pushRing(sim.det, sim.cursor, det3(next) - 1);
    sim.cursor += 1;
    if (sim.filled < HIST) sim.filled += 1;
  }, [isPendulum]);

  const paintWorldRef = useRef(paintWorld);
  const paintTracesRef = useRef(paintTraces);
  const advanceRef = useRef(advance);
  useEffect(() => { paintWorldRef.current = paintWorld; }, [paintWorld]);
  useEffect(() => { paintTracesRef.current = paintTraces; }, [paintTraces]);
  useEffect(() => { advanceRef.current = advance; }, [advance]);
  useEffect(() => { methodRef.current = method; }, [method]);
  useEffect(() => { hRef.current = h; }, [h]);
  useEffect(() => { runningRef.current = running; }, [running]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const wc = worldRef.current;
    if (!wrap || !wc) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      const hh = entry.contentRect.height;
      sizeRef.current = { w, h: hh };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      wc.width = Math.round(w * dpr);
      wc.height = Math.round(hh * dpr);
      wc.style.width = `${w}px`;
      wc.style.height = `${hh}px`;
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastReadout = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (runningRef.current) {
        acc += dt * SPEED;
        let budget = 24;
        const hh = hRef.current;
        while (acc >= hh && budget-- > 0) {
          advanceRef.current();
          acc -= hh;
        }
        if (now - lastReadout > 125) {
          lastReadout = now;
          if (isPendulum) {
            const sim = pendRef.current;
            if (sim) {
              const q = pendulumQ(sim.y);
              const v = pendulumV(sim.y);
              setStats({
                t: sim.t, radius: pendulumRadius(q), g: pendulumG(q),
                gdot: pendulumGDot(q, v), energy: pendulumEnergy(q, v),
                residual: 0, det: 1, steps: sim.steps,
              });
            }
          } else {
            const sim = rotRef.current;
            if (sim) {
              setStats({
                t: sim.t, radius: 1, g: 0, gdot: 0, energy: 0,
                residual: orthoResidual(sim.R), det: det3(sim.R),
                steps: sim.steps,
              });
            }
          }
        }
      }
      paintWorldRef.current();
      paintTracesRef.current();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [isPendulum]);

  useEffect(() => {
    if (reduced) {
      runningRef.current = false;
      setRunning(false);
      for (let i = 0; i < 80; i++) advanceRef.current();
      return;
    }
    runningRef.current = true;
    setRunning(true);
  }, [reduced]);

  const onMethod = (keys: string[]) => {
    const next = keys[0] ?? initialMethod;
    setMethod(next);
    methodRef.current = next;
    runningRef.current = false;
    setRunning(false);
    seed();
  };

  const onH = (v: number) => {
    setH(v);
    hRef.current = v;
    runningRef.current = false;
    setRunning(false);
    seed();
  };

  const methods = isPendulum ? PENDULUM_METHODS : ROTATION_METHODS;
  const offManifold = isPendulum
    ? Math.abs(stats.radius - 1) > 0.01
    : stats.residual > 1e-6;

  return (
    <figure className="not-prose" style={{ margin: '2.5rem 0' }}>
      <Panel
        title={isPendulum ? 'cartesian pendulum' : 'rotation on SO(3)'}
        right={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Button
              onClick={() => {
                const next = !runningRef.current;
                runningRef.current = next;
                setRunning(next);
              }}
              accent={running ? 'warn' : 'ok'}
              disabled={blown}
            >
              {running ? 'pause' : 'play'}
            </Button>
            <Button onClick={() => { runningRef.current = false; setRunning(false); seed(); }}>reset</Button>
          </div>
        }
      >
        <div style={{ marginBottom: 12 }}>
          <Toggle
            options={methods.map((m) => ({ key: m.key, label: m.label, accent: m.accent }))}
            value={[method]}
            onChange={onMethod}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.35fr) minmax(200px, 0.9fr)',
            gap: 10,
            alignItems: 'stretch',
          }}
        >
          <div
            ref={wrapRef}
            style={{
              position: 'relative', height,
              border: '1px solid var(--color-rule)', borderRadius: 'var(--radius-hud)',
              overflow: 'hidden',
              background: 'var(--color-abyss)',
            }}
          >
            <canvas ref={worldRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          </div>
          <canvas
            ref={traceRef}
            style={{
              width: '100%', height,
              border: '1px solid var(--color-rule)', borderRadius: 'var(--radius-hud)',
              background: 'color-mix(in oklab, var(--color-abyss) 82%, transparent)',
            }}
          />
        </div>

        {blown && (
          <p style={{ margin: '10px 0 0', color: 'var(--color-warn)', fontSize: '0.95rem' }}>
            The map left any neighbourhood of the manifold. Reset, or drop h.
          </p>
        )}

        <div style={{ marginTop: 14 }}>
          <Slider spec={hSpec} value={h} onChange={onH} />
        </div>

        <ReadoutRow>
          <Readout label="t" value={formatValue(stats.t, 3)} />
          {isPendulum ? (
            <>
              <Readout label="|q|" value={formatValue(stats.radius, 4)} accent={offManifold ? 'warn' : 'ok'} />
              <Readout label="g(q)" value={formatValue(stats.g, 3)} accent={offManifold ? 'magenta' : 'cyan'} />
              <Readout label="q · v" value={formatValue(stats.gdot, 3)} accent={Math.abs(stats.gdot) > 1e-4 ? 'warn' : 'ok'} />
            </>
          ) : (
            <>
              <Readout label="‖RᵀR − I‖" value={formatValue(stats.residual, 3)} accent={offManifold ? 'magenta' : 'ok'} />
              <Readout label="det R" value={formatValue(stats.det, 4)} accent={Math.abs(stats.det - 1) > 1e-4 ? 'warn' : 'ok'} />
            </>
          )}
          <Readout label="steps" value={String(stats.steps)} />
        </ReadoutRow>
      </Panel>
      {caption && (
        <figcaption style={{ marginTop: 10, color: 'var(--color-ink-soft)', fontSize: '0.95rem', lineHeight: 1.55 }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

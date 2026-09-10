import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { Button, Panel, Readout, ReadoutRow, Toggle, useAnimationFrame, usePrefersReducedMotion } from './controls.tsx';
import { ACCENTS, formatValue } from './chart-core.ts';
import {
  addMac,
  advectRing,
  cloneMac,
  divergence,
  fillSink,
  fillVortex,
  interpolateMac,
  macGrid,
  makeField,
  makeRing,
  maxAbs,
  maxAbsDiv,
  PROJ_N,
  projectSpectral,
  runBlob,
  shoelace,
  type MacField,
  type MacState,
} from '../../lib/numerics/projection.ts';

/* ─────────────────────────────────────────────────────────────────────────
   Coupled views of one MAC velocity: arrows + a dye ring, and ∇·u.

   Without the Helmholtz projection a sink hiding in a swirl eats the blob.
   With it, max|div| is roundoff and the ring only shears. One state, two
   pictures. The loop is driven from refs; readouts throttle to ~8 Hz.
   ───────────────────────────────────────────────────────────────────────── */

const N = PROJ_N;
const READOUT_MS = 125;
const SIM_SPEED = 0.12;
const ARROW_STRIDE = 2;
const STIR_AMP = 0.04;

export type ProjectionLabField = Exclude<MacField, 'uniform'>;

export interface ProjectionLabProps {
  field?: ProjectionLabField;
  project?: boolean;
  lockField?: boolean;
  lockProject?: boolean;
  height?: number;
  caption?: string;
  autoPlay?: boolean;
  stir?: boolean;
}

interface Sim {
  star: MacState;
  used: MacState;
  div: Float64Array;
  divScale: number;
  ringX: Float64Array;
  ringY: Float64Array;
  area0: number;
  t: number;
  steps: number;
}

function cssColor(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mixRgb(a: [number, number, number], b: [number, number, number], t: number): string {
  const u = Math.max(0, Math.min(1, t));
  const r = Math.round(a[0] + (b[0] - a[0]) * u);
  const g = Math.round(a[1] + (b[1] - a[1]) * u);
  const bl = Math.round(a[2] + (b[2] - a[2]) * u);
  return `rgb(${r},${g},${bl})`;
}

function seedStar(kind: ProjectionLabField): MacState {
  return makeField(kind, N);
}

function applyProject(star: MacState, on: boolean): { used: MacState; div: Float64Array; divScale: number } {
  const used = on ? projectSpectral(star).grid : cloneMac(star);
  const div = divergence(used);
  const starDiv = maxAbsDiv(star);
  return { used, div, divScale: Math.max(0.35, starDiv) };
}

function freshSim(kind: ProjectionLabField, on: boolean): Sim {
  const star = seedStar(kind);
  const { used, div, divScale } = applyProject(star, on);
  const ring = makeRing();
  return {
    star, used, div, divScale,
    ringX: ring.x, ringY: ring.y,
    area0: shoelace(ring.x, ring.y),
    t: 0, steps: 0,
  };
}

export default function ProjectionLab({
  field: field0 = 'mixed',
  project: project0 = false,
  lockField = false,
  lockProject = false,
  height = 280,
  caption,
  autoPlay = true,
  stir = true,
}: ProjectionLabProps) {
  const [field, setField] = useState<ProjectionLabField>(field0);
  const [project, setProject] = useState(project0);
  const [running, setRunning] = useState(autoPlay);
  const [stats, setStats] = useState({ t: 0, area: 1, maxDiv: 0, steps: 0 });

  const reduced = usePrefersReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const velRef = useRef<HTMLCanvasElement>(null);
  const divRef = useRef<HTMLCanvasElement>(null);
  const velSize = useRef({ w: 320, h: height });
  const divSize = useRef({ w: 280, h: height });

  const simRef = useRef<Sim | null>(null);
  const fieldRef = useRef(field);
  const projectRef = useRef(project);
  const runningRef = useRef(running);
  const lastReadout = useRef(0);

  useEffect(() => { fieldRef.current = field; }, [field]);
  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { runningRef.current = running; }, [running]);

  const seed = useCallback(() => {
    const sim = freshSim(fieldRef.current, projectRef.current);
    simRef.current = sim;
    lastReadout.current = 0;
    setStats({ t: 0, area: 1, maxDiv: maxAbs(sim.div), steps: 0 });
  }, []);

  useEffect(() => { seed(); }, [seed, field]);

  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const next = applyProject(sim.star, project);
    sim.used = next.used;
    sim.div = next.div;
    sim.divScale = next.divScale;
    setStats((s) => ({ ...s, maxDiv: maxAbs(sim.div) }));
  }, [project]);

  const paintVel = useCallback(() => {
    const canvas = velRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = velSize.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const abyss = cssColor(canvas, '--color-abyss', '#0c0a15');
    const rule = cssColor(canvas, '--color-rule', '#2a2340');
    const ink = ACCENTS.faint;
    const cyan = ACCENTS.cyan;
    const magenta = ACCENTS.magenta;

    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, w, h);

    const padL = 36, padR = 12, padT = 14, padB = 28;
    const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
    const plotW = x1 - x0, plotH = y1 - y0;
    const X = (x: number) => x0 + x * plotW;
    const Y = (y: number) => y1 - y * plotH;

    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW, plotH);

    const { used } = sim;
    const hh = used.h;
    let vmax = 0;
    const samples: { x: number; y: number; u: number; v: number }[] = [];
    for (let j = 0; j < N; j += ARROW_STRIDE) {
      for (let i = 0; i < N; i += ARROW_STRIDE) {
        const x = (i + 0.5) * hh;
        const y = (j + 0.5) * hh;
        const [u, v] = interpolateMac(used, x, y);
        const s = Math.hypot(u, v);
        if (s > vmax) vmax = s;
        samples.push({ x, y, u, v });
      }
    }
    const arrowLen = ARROW_STRIDE * hh * 0.82;
    const scale = vmax > 1e-12 ? arrowLen / vmax : 0;

    ctx.strokeStyle = cyan;
    ctx.fillStyle = cyan;
    ctx.lineWidth = 1.15;
    ctx.lineCap = 'round';
    for (const s of samples) {
      const len = Math.hypot(s.u, s.v) * scale;
      if (len < 0.6) continue;
      const dx = s.u * scale;
      const dy = s.v * scale;
      const ax = X(s.x);
      const ay = Y(s.y);
      const bx = X(s.x + dx);
      const by = Y(s.y + dy);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      const ang = Math.atan2(by - ay, bx - ax);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - 4.2 * Math.cos(ang - 0.4), by - 4.2 * Math.sin(ang - 0.4));
      ctx.lineTo(bx - 4.2 * Math.cos(ang + 0.4), by - 4.2 * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fill();
    }

    ctx.beginPath();
    for (let i = 0; i < sim.ringX.length; i++) {
      const px = X(sim.ringX[i]!);
      const py = Y(sim.ringY[i]!);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = magenta;
    ctx.globalAlpha = 0.28;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = magenta;
    ctx.lineWidth = 1.7;
    ctx.stroke();

    ctx.fillStyle = ink;
    ctx.font = '12px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const tick of [0, 0.5, 1]) ctx.fillText(String(tick), X(tick), y1 + 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const tick of [0, 0.5, 1]) ctx.fillText(String(tick), x0 - 6, Y(tick));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('x', (x0 + x1) / 2, h - 2);
    ctx.save();
    ctx.translate(12, (y0 + y1) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('y', 0, 0);
    ctx.restore();
  }, []);

  const paintDiv = useCallback(() => {
    const canvas = divRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = divSize.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const abyss = cssColor(canvas, '--color-abyss', '#0c0a15');
    const rule = cssColor(canvas, '--color-rule', '#2a2340');
    const ink = ACCENTS.faint;
    const abyssRgb = hexRgb(abyss.startsWith('#') ? abyss : '#0c0a15');
    const cyanRgb = hexRgb(ACCENTS.cyan);
    const magRgb = hexRgb(ACCENTS.magenta);

    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, w, h);

    const padL = 36, padR = 36, padT = 14, padB = 28;
    const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
    const plotW = x1 - x0, plotH = y1 - y0;
    const cell = plotW / N;
    const cellH = plotH / N;

    const scale = sim.divScale;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const d = sim.div[i + j * N]!;
        const t = Math.max(-1, Math.min(1, d / scale));
        ctx.fillStyle = t >= 0
          ? mixRgb(abyssRgb, magRgb, Math.pow(t, 0.7))
          : mixRgb(abyssRgb, cyanRgb, Math.pow(-t, 0.7));
        ctx.fillRect(x0 + i * cell, y1 - (j + 1) * cellH, cell + 0.5, cellH + 0.5);
      }
    }

    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW, plotH);

    const barX = x1 + 8;
    const barW = 8;
    for (let p = 0; p < plotH; p++) {
      const t = 1 - (2 * p) / plotH;
      ctx.fillStyle = t >= 0
        ? mixRgb(abyssRgb, magRgb, Math.pow(t, 0.7))
        : mixRgb(abyssRgb, cyanRgb, Math.pow(-t, 0.7));
      ctx.fillRect(barX, y0 + p, barW, 1.5);
    }
    ctx.strokeStyle = rule;
    ctx.strokeRect(barX + 0.5, y0 + 0.5, barW, plotH);

    ctx.fillStyle = ink;
    ctx.font = '11px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('src', barX + barW + 3, y0 + 8);
    ctx.fillText('0', barX + barW + 3, (y0 + y1) / 2);
    ctx.fillText('sink', barX + barW + 3, y1 - 8);

    const X = (x: number) => x0 + x * plotW;
    const Y = (y: number) => y1 - y * plotH;
    ctx.font = '12px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const tick of [0, 0.5, 1]) ctx.fillText(String(tick), X(tick), y1 + 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const tick of [0, 0.5, 1]) ctx.fillText(String(tick), x0 - 6, Y(tick));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('∇·u', (x0 + x1) / 2, h - 2);
  }, []);

  const paintVelRef = useRef(paintVel);
  const paintDivRef = useRef(paintDiv);
  useEffect(() => { paintVelRef.current = paintVel; }, [paintVel]);
  useEffect(() => { paintDivRef.current = paintDiv; }, [paintDiv]);

  const paint = useCallback(() => {
    paintVelRef.current();
    paintDivRef.current();
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const vel = wrap.querySelector('[data-pane="vel"]') as HTMLElement | null;
    const divp = wrap.querySelector('[data-pane="div"]') as HTMLElement | null;
    const ro = new ResizeObserver(() => {
      if (vel) velSize.current = { w: vel.clientWidth || 320, h: vel.clientHeight || height };
      if (divp) divSize.current = { w: divp.clientWidth || 280, h: divp.clientHeight || height };
      paint();
    });
    if (vel) ro.observe(vel);
    if (divp) ro.observe(divp);
    paint();
    return () => ro.disconnect();
  }, [height, paint]);

  const pushReadout = (sim: Sim) => {
    const now = performance.now();
    if (now - lastReadout.current < READOUT_MS) return;
    lastReadout.current = now;
    setStats({
      t: sim.t,
      area: shoelace(sim.ringX, sim.ringY) / sim.area0,
      maxDiv: maxAbs(sim.div),
      steps: sim.steps,
    });
  };

  const stepSim = useCallback((wallDt: number) => {
    const sim = simRef.current;
    if (!sim) return;
    const dt = SIM_SPEED * wallDt;
    advectRing(sim.used, sim.ringX, sim.ringY, dt);
    sim.t += dt;
    sim.steps += 1;
    paint();
    pushReadout(sim);
  }, [paint]);

  useAnimationFrame(running && !reduced, stepSim);

  useEffect(() => {
    if (!reduced) return;
    const snap = runBlob({ field, project, tEnd: 0.85 });
    const last = snap[snap.length - 1]!;
    const sim = freshSim(field, project);
    // Replay the ring by running the same advection to the snapshot time.
    sim.t = last.t;
    sim.steps = snap.length - 1;
    const g = sim.used;
    const ring = makeRing();
    const dt = 0.012;
    for (let t = 0; t < last.t - 1e-12; t += dt) advectRing(g, ring.x, ring.y, Math.min(dt, last.t - t));
    sim.ringX = ring.x;
    sim.ringY = ring.y;
    simRef.current = sim;
    setStats({ t: last.t, area: last.area / last.area0, maxDiv: last.maxDiv, steps: sim.steps });
    setRunning(false);
    requestAnimationFrame(() => paint());
  }, [reduced, field, project, paint]);

  useEffect(() => { paint(); }, [paint, project, field, stats.maxDiv]);

  const onVelClick = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!stir) return;
    const canvas = velRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const rect = canvas.getBoundingClientRect();
    const { w, h } = velSize.current;
    const padL = 36, padR = 12, padT = 14, padB = 28;
    const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
    const px = ((e.clientX - rect.left) / rect.width) * w;
    const py = ((e.clientY - rect.top) / rect.height) * h;
    const x = (px - x0) / (x1 - x0);
    const y = 1 - (py - y0) / (y1 - y0);
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    const bump = macGrid(N);
    if (e.shiftKey) fillSink(bump, STIR_AMP * 0.45, x, y);
    else fillVortex(bump, STIR_AMP, x, y);
    addMac(sim.star, bump);
    const next = applyProject(sim.star, projectRef.current);
    sim.used = next.used;
    sim.div = next.div;
    sim.divScale = next.divScale;
    setStats((s) => ({ ...s, maxDiv: maxAbs(sim.div) }));
    paint();
  };

  const areaAccent = stats.area < 0.92 ? 'magenta' : project ? 'ok' : 'cyan';
  const divAccent = stats.maxDiv < 1e-8 ? 'ok' : 'magenta';

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title={project ? 'projected · Helmholtz' : 'raw velocity'}
        right={
          <span className="hud-label" style={{ color: project ? 'var(--sig-ok)' : 'var(--sig-warn)' }}>
            {project ? '∇·u → roundoff' : 'divergent'}
          </span>
        }
      >
        <div
          ref={wrapRef}
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)', gap: 10, alignItems: 'stretch' }}
        >
          <div data-pane="vel" style={{ height, minWidth: 0 }}>
            <canvas
              ref={velRef}
              style={{ width: '100%', height: '100%', display: 'block', cursor: stir ? 'crosshair' : 'default' }}
              onPointerDown={onVelClick}
            />
          </div>
          <div data-pane="div" style={{ height, minWidth: 0 }}>
            <canvas ref={divRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {!lockField && (
              <Toggle
                options={[
                  { key: 'mixed', label: 'mixed', accent: 'magenta' },
                  { key: 'sink', label: 'sink', accent: 'cyan' },
                  { key: 'vortex', label: 'vortex', accent: 'iris' },
                ]}
                value={[field]}
                onChange={(next) => {
                  setField((next[0] as ProjectionLabField) ?? 'mixed');
                  setRunning(autoPlay && !reduced);
                }}
              />
            )}
            {!lockProject && (
              <Toggle
                options={[
                  { key: 'off', label: 'no projection', accent: 'magenta' },
                  { key: 'on', label: 'project', accent: 'ok' },
                ]}
                value={[project ? 'on' : 'off']}
                onChange={(next) => setProject(next[0] === 'on')}
              />
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Button onClick={() => { seed(); setRunning(true); }} accent="cyan">reset</Button>
            <Button onClick={() => setRunning((r) => !r)} accent="magenta" active={running} disabled={reduced}>
              {running ? 'pause' : 'play'}
            </Button>
          </div>
        </div>

        <ReadoutRow>
          <Readout label="t" value={formatValue(stats.t, 3)} />
          <Readout label="A / A₀" value={formatValue(stats.area, 3)} accent={areaAccent} />
          <Readout
            label="max |∇·u|"
            value={formatValue(stats.maxDiv, 3)}
            accent={divAccent}
          />
          <Readout label="steps" value={String(stats.steps)} />
        </ReadoutRow>
      </Panel>
      {caption && (
        <figcaption className="hud-label" style={{ marginTop: 8, lineHeight: 1.6, letterSpacing: '0.06em', textTransform: 'none' }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

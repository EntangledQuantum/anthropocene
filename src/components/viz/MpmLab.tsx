import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Button, Panel, Readout, ReadoutRow, Slider, Toggle, usePrefersReducedMotion } from './controls.tsx';
import { ACCENTS, formatValue } from './chart-core.ts';
import {
  createDrop,
  elasticEnergy,
  gridMass,
  isFiniteState,
  kineticEnergy,
  particleMass,
  stepMpm,
  stepPhase,
  transferOf,
  type MpmPhase,
  type MpmState,
} from '../../lib/numerics/mpm.ts';

/* ─────────────────────────────────────────────────────────────────────────
   One MPM drop, three views of one state: particles, the borrowed grid,
   and the four hat weights of a tracked particle.

   Toggle keep-the-mesh vs reset. Occupied nodes follow the material;
   empty nodes stay. The quads at the free surface invert — unless you
   throw the mesh away at the end of G2P, which is the whole method.
   ───────────────────────────────────────────────────────────────────────── */

const STEPS_PER_FRAME = 5;
const READOUT_MS = 125;
const PHASE_LABEL: Record<MpmPhase, string> = {
  p2g: 'P2G',
  grid: 'grid solve',
  g2p: 'G2P',
};

export interface MpmLabProps {
  resetGrid?: boolean;
  lockReset?: boolean;
  flip?: number;
  height?: number;
  caption?: string;
  autoPlay?: boolean;
}

interface Stats {
  t: number;
  steps: number;
  mP: number;
  mG: number;
  ke: number;
  pe: number;
  minDet: number;
  tangled: number;
  phase: MpmPhase;
  blown: boolean;
}

function cssColor(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseRgb(a);
  const pb = parseRgb(b);
  if (!pa || !pb) return a;
  const u = Math.min(1, Math.max(0, t));
  const ch = (i: number) => Math.round(pa[i]! + (pb[i]! - pa[i]!) * u);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

function parseRgb(c: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(c);
  if (rgb) return [+rgb[1]!, +rgb[2]!, +rgb[3]!];
  return null;
}

function seedDrop(resetGrid: boolean, flip: number): MpmState {
  return createDrop({ resetGrid, flip, n: 20, ppc: 2 });
}

function pickTracked(s: MpmState): number {
  let best = 0;
  let bestD = Infinity;
  const cx = 0.5, cy = 0.7;
  for (let p = 0; p < s.np; p++) {
    const d = (s.px[p]! - cx) ** 2 + (s.py[p]! - cy) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function statsOf(s: MpmState, blown: boolean): Stats {
  return {
    t: s.t,
    steps: s.steps,
    mP: particleMass(s),
    mG: s.phase === 'p2g' && s.steps === 0 ? particleMass(s) : gridMass(s),
    ke: kineticEnergy(s),
    pe: elasticEnergy(s),
    minDet: s.minDet,
    tangled: s.tangled,
    phase: s.phase,
    blown,
  };
}

export default function MpmLab({
  resetGrid: reset0 = true,
  lockReset = false,
  flip: flip0 = 0.92,
  height = 280,
  caption,
  autoPlay = true,
}: MpmLabProps) {
  const reduced = usePrefersReducedMotion();
  const [resetGrid, setResetGrid] = useState(reset0);
  const [flip, setFlip] = useState(flip0);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<Stats>(() => statsOf(seedDrop(reset0, flip0), false));

  const wrapRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<HTMLCanvasElement>(null);
  const xferRef = useRef<HTMLCanvasElement>(null);
  const worldSize = useRef({ w: 360, h: height });
  const gridSize = useRef({ w: 220, h: height });
  const xferSize = useRef({ w: 220, h: Math.round(height * 0.72) });

  const simRef = useRef<MpmState | null>(null);
  const trackRef = useRef(0);
  const resetRef = useRef(resetGrid);
  const flipRef = useRef(flip);
  const runningRef = useRef(running);
  const blownRef = useRef(false);

  useEffect(() => { resetRef.current = resetGrid; }, [resetGrid]);
  useEffect(() => { flipRef.current = flip; }, [flip]);
  useEffect(() => { runningRef.current = running; }, [running]);

  const seed = useCallback(() => {
    const s = seedDrop(resetRef.current, flipRef.current);
    simRef.current = s;
    trackRef.current = pickTracked(s);
    blownRef.current = false;
    setStats(statsOf(s, false));
  }, []);

  useEffect(() => { seed(); }, [seed]);

  const paintWorld = useCallback(() => {
    const canvas = worldRef.current;
    const s = simRef.current;
    if (!canvas || !s) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = worldSize.current;
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
    const iris = ACCENTS.iris;

    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, w, h);

    const padL = 36, padR = 10, padT = 16, padB = 28;
    const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
    const L = s.params.length;
    const X = (x: number) => x0 + (x / L) * (x1 - x0);
    const Y = (y: number) => y1 - (y / L) * (y1 - y0);

    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);

    const n = s.params.n;
    const nNode = s.nNode;

    // Cells. Tangled ones stay on the chart, in magenta.
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = i + j * nNode;
        const b = i + 1 + j * nNode;
        const c = i + (j + 1) * nNode;
        const d = i + 1 + (j + 1) * nNode;
        const det = (s.nodeX[b]! - s.nodeX[a]!) * (s.nodeY[c]! - s.nodeY[a]!)
                  - (s.nodeY[b]! - s.nodeY[a]!) * (s.nodeX[c]! - s.nodeX[a]!);
        ctx.beginPath();
        ctx.moveTo(X(s.nodeX[a]!), Y(s.nodeY[a]!));
        ctx.lineTo(X(s.nodeX[b]!), Y(s.nodeY[b]!));
        ctx.lineTo(X(s.nodeX[d]!), Y(s.nodeY[d]!));
        ctx.lineTo(X(s.nodeX[c]!), Y(s.nodeY[c]!));
        ctx.closePath();
        if (det <= 0) {
          ctx.fillStyle = magenta;
          ctx.globalAlpha = 0.22;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = magenta;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        } else {
          ctx.strokeStyle = rule;
          ctx.globalAlpha = s.params.resetGrid ? 0.45 : 0.7;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }

    const r = Math.max(2.2, 0.28 * (x1 - x0) / n);
    const tracked = trackRef.current;
    for (let p = 0; p < s.np; p++) {
      const d00 = s.F00[p]! - 1, d11 = s.F11[p]! - 1;
      const strain = Math.min(1, Math.hypot(d00, s.F01[p]!, s.F10[p]!, d11) / 0.8);
      ctx.beginPath();
      ctx.arc(X(s.px[p]!), Y(s.py[p]!), p === tracked ? r + 1.4 : r, 0, Math.PI * 2);
      ctx.fillStyle = mixHex(cyan, magenta, strain);
      ctx.globalAlpha = 0.92;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (p === tracked) {
        ctx.strokeStyle = iris;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }

    ctx.fillStyle = ink;
    ctx.font = '11px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('x', (x0 + x1) / 2, h - 8);
    ctx.save();
    ctx.translate(12, (y0 + y1) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('y', 0, 0);
    ctx.restore();
    ctx.textAlign = 'right';
    ctx.font = '10px var(--font-mono), ui-monospace, monospace';
    ctx.fillText('0', x0 - 4, y1 + 4);
    ctx.fillText('1', x1, y1 + 12);
    ctx.fillText('1', x0 - 4, y0 + 10);
    ctx.textAlign = 'left';
    ctx.fillText(s.params.resetGrid ? 'grid reset' : 'mesh kept', x0 + 6, y0 + 14);
  }, []);

  const paintGrid = useCallback(() => {
    const canvas = gridRef.current;
    const s = simRef.current;
    if (!canvas || !s) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = gridSize.current;
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

    const padL = 28, padR = 8, padT = 22, padB = 24;
    const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
    const L = s.params.length;
    const X = (x: number) => x0 + (x / L) * (x1 - x0);
    const Y = (y: number) => y1 - (y / L) * (y1 - y0);

    ctx.strokeStyle = rule;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);

    let mMax = 0, vMax = 0;
    for (let i = 0; i < s.mass.length; i++) {
      if (s.mass[i]! > mMax) mMax = s.mass[i]!;
      const sp = Math.hypot(s.vx[i]!, s.vy[i]!);
      if (sp > vMax) vMax = sp;
    }
    mMax = Math.max(mMax, 1e-9);
    vMax = Math.max(vMax, 0.05);

    const nNode = s.nNode;
    for (let j = 0; j < nNode; j++) {
      for (let i = 0; i < nNode; i++) {
        const k = i + j * nNode;
        const m = s.mass[k]!;
        const px = X(s.nodeX[k]!), py = Y(s.nodeY[k]!);
        if (m > 1e-12) {
          const rr = 1.6 + 4.2 * Math.sqrt(m / mMax);
          ctx.beginPath();
          ctx.arc(px, py, rr, 0, Math.PI * 2);
          ctx.fillStyle = cyan;
          ctx.globalAlpha = 0.25 + 0.7 * (m / mMax);
          ctx.fill();
          ctx.globalAlpha = 1;
          const vx = s.vx[k]!, vy = s.vy[k]!;
          const sp = Math.hypot(vx, vy);
          if (sp > 1e-4) {
            const scale = 18 / vMax;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + vx * scale, py - vy * scale);
            ctx.strokeStyle = magenta;
            ctx.lineWidth = 1.3;
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = ink;
          ctx.globalAlpha = 0.25;
          ctx.fillRect(px - 0.7, py - 0.7, 1.4, 1.4);
          ctx.globalAlpha = 1;
        }
      }
    }

    ctx.fillStyle = ink;
    ctx.font = '10px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('grid mass · velocity', x0, y0 - 8);
    ctx.textAlign = 'right';
    ctx.font = '10px var(--font-mono), ui-monospace, monospace';
    ctx.fillText('0', x0 - 4, y1 + 4);
    ctx.fillText('1', x1, y1 + 12);
  }, []);

  const paintXfer = useCallback(() => {
    const canvas = xferRef.current;
    const s = simRef.current;
    if (!canvas || !s) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = xferSize.current;
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
    const iris = ACCENTS.iris;

    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, w, h);

    const pad = 28;
    const x0 = pad, y0 = 22, x1 = w - 12, y1 = h - 22;
    ctx.strokeStyle = rule;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);

    const p = Math.min(trackRef.current, s.np - 1);
    if (p < 0 || s.np === 0) return;
    const nodes = transferOf(s, p);
    const nNode = s.nNode;
    const i = s.cellI[p]!;
    const j = s.cellJ[p]!;
    const corners = [
      i + j * nNode,
      i + 1 + j * nNode,
      i + 1 + (j + 1) * nNode,
      i + (j + 1) * nNode,
    ];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const k of corners) {
      minX = Math.min(minX, s.nodeX[k]!);
      maxX = Math.max(maxX, s.nodeX[k]!);
      minY = Math.min(minY, s.nodeY[k]!);
      maxY = Math.max(maxY, s.nodeY[k]!);
    }
    minX = Math.min(minX, s.px[p]!);
    maxX = Math.max(maxX, s.px[p]!);
    minY = Math.min(minY, s.py[p]!);
    maxY = Math.max(maxY, s.py[p]!);
    const span = Math.max(maxX - minX, maxY - minY, s.h) * 1.35;
    const cx = 0.5 * (minX + maxX);
    const cy = 0.5 * (minY + maxY);
    const X = (x: number) => x0 + ((x - (cx - span / 2)) / span) * (x1 - x0);
    const Y = (y: number) => y1 - ((y - (cy - span / 2)) / span) * (y1 - y0);

    ctx.beginPath();
    ctx.moveTo(X(s.nodeX[corners[0]!]!), Y(s.nodeY[corners[0]!]!));
    for (let c = 1; c < 4; c++) ctx.lineTo(X(s.nodeX[corners[c]!]!), Y(s.nodeY[corners[c]!]!));
    ctx.closePath();
    ctx.strokeStyle = iris;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    const px = X(s.px[p]!), py = Y(s.py[p]!);
    for (const n of nodes) {
      const nx = X(s.nodeX[n.index]!), ny = Y(s.nodeY[n.index]!);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(nx, ny);
      ctx.strokeStyle = cyan;
      ctx.globalAlpha = 0.2 + 0.8 * n.w;
      ctx.lineWidth = 1 + 3 * n.w;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(nx, ny, 3 + 6 * n.w, 0, Math.PI * 2);
      ctx.fillStyle = mixHex(ink, cyan, Math.min(1, n.w * 2));
      ctx.fill();
      ctx.fillStyle = ACCENTS.ink;
      ctx.font = '10px var(--font-mono), ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(n.w.toFixed(2), nx, ny - 10);
    }

    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fillStyle = magenta;
    ctx.fill();

    ctx.fillStyle = ink;
    ctx.font = '10px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('one particle · four hats', x0, 14);
    ctx.textAlign = 'right';
    ctx.font = '10px var(--font-mono), ui-monospace, monospace';
    const wSum = nodes.reduce((a, n) => a + n.w, 0);
    ctx.fillText(`Σw = ${wSum.toFixed(3)}`, x1, h - 6);
  }, []);

  const paintWorldRef = useRef(paintWorld);
  const paintGridRef = useRef(paintGrid);
  const paintXferRef = useRef(paintXfer);
  useEffect(() => { paintWorldRef.current = paintWorld; }, [paintWorld]);
  useEffect(() => { paintGridRef.current = paintGrid; }, [paintGrid]);
  useEffect(() => { paintXferRef.current = paintXfer; }, [paintXfer]);

  const applyParams = () => {
    const s = simRef.current;
    if (!s) return;
    s.params.resetGrid = resetRef.current;
    s.params.flip = flipRef.current;
    if (s.params.resetGrid) {
      s.nodeX.set(s.restX);
      s.nodeY.set(s.restY);
    }
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      const world = worldRef.current?.parentElement;
      const grid = gridRef.current?.parentElement;
      const xfer = xferRef.current?.parentElement;
      if (world) worldSize.current = { w: world.clientWidth, h: world.clientHeight };
      if (grid) gridSize.current = { w: grid.clientWidth, h: grid.clientHeight };
      if (xfer) xferSize.current = { w: xfer.clientWidth, h: xfer.clientHeight };
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastReadout = 0;
    const PER = 1 / 60;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const s = simRef.current;
      if (s && runningRef.current && !blownRef.current) {
        applyParams();
        acc += dt;
        let budget = 8;
        while (acc >= PER && budget-- > 0) {
          for (let k = 0; k < STEPS_PER_FRAME; k++) {
            stepMpm(s);
            if (!isFiniteState(s)) {
              blownRef.current = true;
              runningRef.current = false;
              setRunning(false);
              break;
            }
          }
          acc -= PER;
        }
        if (now - lastReadout > READOUT_MS) {
          lastReadout = now;
          setStats(statsOf(s, blownRef.current));
        }
      }
      paintWorldRef.current();
      paintGridRef.current();
      paintXferRef.current();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (autoPlay && !reduced) {
      runningRef.current = true;
      setRunning(true);
    }
  }, [autoPlay, reduced]);

  const onResetMode = (next: string[]) => {
    const keep = next[0] === 'keep';
    setResetGrid(!keep);
    resetRef.current = !keep;
    applyParams();
  };

  const onFlip = (v: number) => {
    setFlip(v);
    flipRef.current = v;
    if (simRef.current) simRef.current.params.flip = v;
  };

  const onStep = () => {
    const s = simRef.current;
    if (!s || blownRef.current) return;
    applyParams();
    stepPhase(s);
    if (!isFiniteState(s)) {
      blownRef.current = true;
      setRunning(false);
    }
    setStats(statsOf(s, blownRef.current));
  };

  const onWorldClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const s = simRef.current;
    const canvas = worldRef.current;
    if (!s || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { w, h } = worldSize.current;
    const padL = 36, padR = 10, padT = 16, padB = 28;
    const x0 = padL, y0 = padT, x1 = w - padR, y1 = h - padB;
    const mx = ((e.clientX - rect.left) / rect.width) * w;
    const my = ((e.clientY - rect.top) / rect.height) * h;
    const L = s.params.length;
    const x = ((mx - x0) / (x1 - x0)) * L;
    const y = (1 - (my - y0) / (y1 - y0)) * L;
    let best = 0, bestD = Infinity;
    for (let p = 0; p < s.np; p++) {
      const d = (s.px[p]! - x) ** 2 + (s.py[p]! - y) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    trackRef.current = best;
  };

  const massMatch = Math.abs(stats.mP - stats.mG) < 1e-4 * Math.max(stats.mP, 1e-9) || stats.mG === 0;

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title="material point drop"
        right={
          <span className="hud-label" style={{ color: stats.blown ? 'var(--sig-warn)' : stats.tangled ? 'var(--color-magenta)' : 'var(--sig-ok)' }}>
            {stats.blown ? 'blew up' : stats.tangled ? `${stats.tangled} inverted cells` : PHASE_LABEL[stats.phase]}
          </span>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' }}>
          {!lockReset && (
            <Toggle
              options={[
                { key: 'reset', label: 'reset grid', accent: 'cyan' },
                { key: 'keep', label: 'keep the mesh', accent: 'magenta' },
              ]}
              value={[resetGrid ? 'reset' : 'keep']}
              onChange={onResetMode}
            />
          )}
          <Button onClick={() => { seed(); setRunning(true); }} accent="cyan">reset</Button>
          <Button onClick={() => setRunning((r) => !r)} accent="magenta" active={running} disabled={stats.blown}>
            {running ? 'pause' : 'play'}
          </Button>
          <Button onClick={onStep} accent="iris" disabled={running || stats.blown}>step phase</Button>
        </div>

        <div
          ref={wrapRef}
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(180px,1fr)', gap: 10, alignItems: 'stretch' }}
        >
          <div style={{ height, minWidth: 0 }}>
            <canvas
              ref={worldRef}
              onClick={onWorldClick}
              style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateRows: '1fr 0.72fr', gap: 10, minWidth: 0 }}>
            <div style={{ minHeight: 0 }}>
              <canvas ref={gridRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            </div>
            <div style={{ minHeight: 0 }}>
              <canvas ref={xferRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <Slider
            spec={{
              key: 'flip', label: 'G2P blend', symbol: 'α', min: 0, max: 1, step: 0.02, value: flip0,
              hint: '0 is PIC (overwrite with the grid field). 1 is FLIP (add only the grid increment).',
            }}
            value={flip}
            onChange={onFlip}
          />
        </div>

        <ReadoutRow>
          <Readout label="t" value={formatValue(stats.t, 3)} />
          <Readout label="m particles" value={formatValue(stats.mP, 4)} accent="cyan" />
          <Readout label="m grid" value={formatValue(stats.mG, 4)} accent={massMatch ? 'ok' : 'warn'} />
          <Readout label="KE" value={formatValue(stats.ke, 3)} />
          <Readout
            label="min J / h²"
            value={formatValue(stats.minDet, 3)}
            accent={stats.minDet <= 0 ? 'magenta' : 'ink'}
          />
          <Readout label="phase" value={PHASE_LABEL[stats.phase]} accent="iris" mono={false} />
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

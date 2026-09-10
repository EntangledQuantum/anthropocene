import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Panel, Readout, ReadoutRow, Toggle, useAnimationFrame, usePrefersReducedMotion } from './controls.tsx';
import { ACCENTS, formatValue } from './chart-core.ts';
import {
  cicWeights,
  cosineMoment,
  createPair,
  createPlasma,
  createTwoStream,
  fieldEnergy,
  fieldsFromParticles,
  gridCharge,
  kineticEnergy,
  stepPic,
  type PicKind,
  type PicState,
} from '../../lib/numerics/pic.ts';

/* ─────────────────────────────────────────────────────────────────────────
   1D electrostatic PIC. Particles, ρ, and φ are three views of one state.

   Deposit charge, Poisson-solve the field, gather E, push. Switching
   plasma ↔ two-stream is the same cycle in a different costume.
   ───────────────────────────────────────────────────────────────────────── */

const READOUT_MS = 125;
const STEPS_PER_FRAME = 3;

export interface PicLabProps {
  kind?: PicKind;
  lockKind?: boolean;
  height?: number;
  caption?: string;
  autoPlay?: boolean;
}

interface Stats {
  t: number;
  ke: number;
  es: number;
  charge: number;
  mode: number;
  steps: number;
}

function cssColor(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function seedOf(kind: PicKind): PicState {
  if (kind === 'streams') return createTwoStream();
  if (kind === 'pair') return createPair();
  return createPlasma();
}

function statsOf(s: PicState): Stats {
  return {
    t: s.t,
    ke: kineticEnergy(s),
    es: fieldEnergy(s),
    charge: gridCharge(s.rho, s.length),
    mode: cosineMoment(s.x, s.q, s.length),
    steps: s.steps,
  };
}

export default function PicLab({
  kind: kind0 = 'plasma',
  lockKind = false,
  height = 340,
  caption,
  autoPlay = true,
}: PicLabProps) {
  const reduced = usePrefersReducedMotion();
  const [kind, setKind] = useState<PicKind>(kind0);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<Stats>(() => statsOf(seedOf(kind0)));

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 560, h: height });

  const simRef = useRef<PicState | null>(null);
  const kindRef = useRef(kind);
  const runningRef = useRef(running);
  const lastReadout = useRef(0);
  const trackRef = useRef(0);

  useEffect(() => { kindRef.current = kind; }, [kind]);
  useEffect(() => { runningRef.current = running; }, [running]);

  const seed = useCallback(() => {
    const s = seedOf(kindRef.current);
    fieldsFromParticles(s);
    simRef.current = s;
    trackRef.current = Math.min(s.np - 1, Math.floor(s.np * 0.25));
    lastReadout.current = 0;
    setStats(statsOf(s));
  }, []);

  useEffect(() => { seed(); }, [seed, kind]);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const s = simRef.current;
    if (!canvas || !s) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = sizeRef.current;
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
    const aqua = ACCENTS.aqua;

    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, w, h);

    const padL = 44, padR = 14, padT = 8, padB = 8;
    const gap = 8;
    const innerH = h - padT - padB - 2 * gap;
    const hPart = innerH * 0.28;
    const hRho = innerH * 0.34;
    const hPhi = innerH * 0.38;
    const yPart = padT;
    const yRho = yPart + hPart + gap;
    const yPhi = yRho + hRho + gap;
    const x0 = padL, x1 = w - padR;
    const plotW = x1 - x0;
    const L = s.length;
    const X = (x: number) => x0 + (x / L) * plotW;

    const band = (y: number, bh: number) => {
      ctx.strokeStyle = rule;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y + 0.5, plotW, bh);
    };

    band(yPart, hPart);
    band(yRho, hRho);
    band(yPhi, hPhi);

    // Cell ticks on the particle band.
    ctx.strokeStyle = rule;
    ctx.globalAlpha = 0.7;
    for (let i = 0; i <= s.n; i++) {
      const px = X((i / s.n) * L);
      ctx.beginPath();
      ctx.moveTo(px, yPart + hPart);
      ctx.lineTo(px, yPart + hPart - 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const tracked = trackRef.current;
    const { i0, i1, w0, w1 } = cicWeights(s.x[tracked]!, s.n, L);

    // Hats of the tracked particle.
    const nodeX = (i: number) => X((i / s.n) * L);
    const yHat = yPart + hPart * 0.42;
    ctx.strokeStyle = iris;
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.35 + 0.65 * w0;
    ctx.beginPath();
    ctx.moveTo(X(s.x[tracked]!), yPart + hPart * 0.72);
    ctx.lineTo(nodeX(i0), yHat);
    ctx.stroke();
    ctx.globalAlpha = 0.35 + 0.65 * w1;
    ctx.beginPath();
    ctx.moveTo(X(s.x[tracked]!), yPart + hPart * 0.72);
    ctx.lineTo(nodeX(i1), yHat);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(nodeX(i0), yHat, 2.2 + 3.5 * w0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(nodeX(i1), yHat, 2.2 + 3.5 * w1, 0, Math.PI * 2);
    ctx.fill();

    const r = s.kind === 'pair' ? 6.5 : Math.max(1.6, Math.min(3.2, plotW / s.np));
    for (let p = 0; p < s.np; p++) {
      const goingRight = s.v[p]! >= 0;
      ctx.beginPath();
      ctx.arc(X(s.x[p]!), yPart + hPart * 0.72, p === tracked ? r + 1.4 : r, 0, Math.PI * 2);
      ctx.fillStyle = s.q[p]! >= 0 ? aqua : (goingRight ? cyan : magenta);
      ctx.globalAlpha = p === tracked ? 1 : 0.88;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (p === tracked) {
        ctx.strokeStyle = iris;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // ρ stems + polyline, periodic wrap.
    let rhoMax = 1e-9;
    for (let i = 0; i < s.n; i++) rhoMax = Math.max(rhoMax, Math.abs(s.rho[i]!));
    const yRho0 = yRho + hRho * 0.55;
    const yRhoAmp = hRho * 0.38;
    const Yrho = (v: number) => yRho0 - (v / rhoMax) * yRhoAmp;

    ctx.beginPath();
    ctx.moveTo(x0, Yrho(0));
    ctx.lineTo(x1, Yrho(0));
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    for (let i = 0; i <= s.n; i++) {
      const ii = i % s.n;
      const px = X((i / s.n) * L);
      const py = Yrho(s.rho[ii]!);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.strokeStyle = magenta;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = magenta;
    for (let i = 0; i < s.n; i++) {
      const px = X((i / s.n) * L);
      const py = Yrho(s.rho[i]!);
      ctx.globalAlpha = 0.18;
      ctx.fillRect(px - 1.5, Math.min(py, yRho0), 3, Math.abs(py - yRho0));
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(px, py, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // φ curve. E as a fainter dashed companion.
    let phiMax = 1e-9;
    let eMax = 1e-9;
    for (let i = 0; i < s.n; i++) {
      phiMax = Math.max(phiMax, Math.abs(s.phi[i]!));
      eMax = Math.max(eMax, Math.abs(s.E[i]!));
    }
    const yPhi0 = yPhi + hPhi * 0.55;
    const yPhiAmp = hPhi * 0.36;
    const Yphi = (v: number) => yPhi0 - (v / phiMax) * yPhiAmp;
    const YE = (v: number) => yPhi0 - (v / Math.max(eMax, 1e-12)) * yPhiAmp * 0.7;

    ctx.beginPath();
    ctx.moveTo(x0, Yphi(0));
    ctx.lineTo(x1, Yphi(0));
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    for (let i = 0; i <= s.n; i++) {
      const ii = i % s.n;
      const px = X((i / s.n) * L);
      i === 0 ? ctx.moveTo(px, YE(s.E[ii]!)) : ctx.lineTo(px, YE(s.E[ii]!));
    }
    ctx.strokeStyle = aqua;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    for (let i = 0; i <= s.n; i++) {
      const ii = i % s.n;
      const px = X((i / s.n) * L);
      i === 0 ? ctx.moveTo(px, Yphi(s.phi[ii]!)) : ctx.lineTo(px, Yphi(s.phi[ii]!));
    }
    ctx.strokeStyle = cyan;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = ink;
    ctx.font = '11px var(--font-sans), ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('particles', x0 + 6, yPart + 5);
    ctx.fillStyle = magenta;
    ctx.fillText('ρ', x0 + 6, yRho + 5);
    ctx.fillStyle = cyan;
    ctx.fillText('φ', x0 + 6, yPhi + 5);
    ctx.fillStyle = aqua;
    ctx.fillText('E', x0 + 28, yPhi + 5);

    ctx.fillStyle = ink;
    ctx.font = '10px var(--font-mono), ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
      ctx.fillText(String(tick), X(tick * L), yPhi + hPhi + 2);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('0', x0 - 6, yPart + hPart);
    ctx.fillText('0', x0 - 6, yRho0);
    ctx.fillText('0', x0 - 6, yPhi0);

    ctx.fillStyle = iris;
    ctx.font = '10px var(--font-mono), ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`w = ${w0.toFixed(2)} · ${w1.toFixed(2)}`, x1 - 6, yPart + 5);
  }, []);

  const paintRef = useRef(paint);
  useEffect(() => { paintRef.current = paint; }, [paint]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const pane = wrap.querySelector('[data-pane="pic"]') as HTMLElement | null;
    const ro = new ResizeObserver(() => {
      if (pane) sizeRef.current = { w: pane.clientWidth || 560, h: pane.clientHeight || height };
      paintRef.current();
    });
    if (pane) ro.observe(pane);
    paintRef.current();
    return () => ro.disconnect();
  }, [height]);

  const pushReadout = (s: PicState) => {
    const now = performance.now();
    if (now - lastReadout.current < READOUT_MS) return;
    lastReadout.current = now;
    setStats(statsOf(s));
  };

  const stepSim = useCallback((wallDt: number) => {
    const s = simRef.current;
    if (!s) return;
    const n = Math.max(1, Math.min(12, Math.round(STEPS_PER_FRAME * (wallDt / 0.016))));
    for (let i = 0; i < n; i++) stepPic(s);
    fieldsFromParticles(s);
    paintRef.current();
    pushReadout(s);
  }, []);

  useAnimationFrame(running && !reduced, stepSim);

  useEffect(() => {
    if (autoPlay && !reduced) {
      runningRef.current = true;
      setRunning(true);
    }
  }, [autoPlay, reduced]);

  useEffect(() => { paint(); }, [paint, stats.steps, kind]);

  const onStep = () => {
    const s = simRef.current;
    if (!s) return;
    setRunning(false);
    stepPic(s);
    fieldsFromParticles(s);
    setStats(statsOf(s));
    paintRef.current();
  };

  return (
    <figure className="not-prose" style={{ margin: '2rem 0' }}>
      <Panel
        title={kind === 'streams' ? 'two-stream' : kind === 'pair' ? 'two charges' : 'plasma oscillation'}
        right={
          <span className="hud-label" style={{ color: 'var(--color-ink-faint)' }}>
            deposit · Poisson · gather · push
          </span>
        }
      >
        <div ref={wrapRef}>
          <div data-pane="pic" style={{ height, minWidth: 0 }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
          {!lockKind && (
            <Toggle
              options={[
                { key: 'plasma', label: 'plasma', accent: 'cyan' },
                { key: 'streams', label: 'two-stream', accent: 'magenta' },
                { key: 'pair', label: 'two charges', accent: 'iris' },
              ]}
              value={[kind]}
              onChange={(next) => {
                const k = (next[0] as PicKind) ?? 'plasma';
                setKind(k);
                kindRef.current = k;
                setRunning(autoPlay && !reduced);
              }}
            />
          )}
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <Button onClick={() => { seed(); setRunning(true); }} accent="cyan">reset</Button>
            <Button onClick={onStep} accent="iris">step</Button>
            <Button onClick={() => setRunning((r) => !r)} accent="magenta" active={running} disabled={reduced}>
              {running ? 'pause' : 'play'}
            </Button>
          </div>
        </div>

        <ReadoutRow>
          <Readout label="t" value={formatValue(stats.t, 3)} />
          <Readout label="KE" value={formatValue(stats.ke, 4)} accent="cyan" />
          <Readout label="½∫E²" value={formatValue(stats.es, 4)} accent="magenta" />
          <Readout label="Σρ h" value={formatValue(stats.charge, 3)} />
          <Readout label="k=1 mode" value={formatValue(stats.mode, 4)} accent="iris" />
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

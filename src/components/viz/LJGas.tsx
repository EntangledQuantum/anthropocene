import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Panel, Readout, ReadoutRow, Slider, usePrefersReducedMotion, type ParamSpec } from './controls.tsx';
import { ACCENTS, formatValue } from './chart-core.ts';
import {
  berendsenThermostat,
  createGas,
  nveStep,
  pressureOf,
  temperatureOf,
  totalEnergy,
  type MDState,
} from '../../lib/numerics/md.ts';

/* ─────────────────────────────────────────────────────────────────────────
   2D Lennard-Jones gas. Particles and the E / T traces are two views of
   one Verlet trajectory. The thermostat toggle is the experiment: NVE is a
   symplectic map with a bounded energy band; rescaling velocities to hold
   T is a different map, and the band walks.
   ───────────────────────────────────────────────────────────────────────── */

const HIST = 360;
const TAU = 0.25;
const STEPS_PER_FRAME = 4;

export interface LJGasProps {
  n?: number;
  density?: number;
  temperature?: number;
  h?: number;
  height?: number;
  caption?: string;
}

interface Sim {
  state: MDState;
  E0: number;
  steps: number;
  e: Float32Array;
  te: Float32Array;
  p: Float32Array;
  filled: number;
  cursor: number;
}

function cssColor(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function pushHist(sim: Sim, Erel: number, T: number, P: number): void {
  const i = sim.cursor % HIST;
  sim.e[i] = Erel;
  sim.te[i] = T;
  sim.p[i] = P;
  sim.cursor += 1;
  if (sim.filled < HIST) sim.filled += 1;
}

function histMinMax(buf: Float32Array, filled: number, cursor: number): [number, number] {
  let lo = Infinity, hi = -Infinity;
  const n = Math.min(filled, HIST);
  const start = cursor - n;
  for (let k = 0; k < n; k++) {
    const v = buf[(start + k + HIST * 4) % HIST];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo)) return [0, 1];
  if (lo === hi) return [lo - 0.05, hi + 0.05];
  return [lo, hi];
}

export default function LJGas({
  n = 36,
  density: density0 = 0.42,
  temperature: temp0 = 0.8,
  h = 0.005,
  height = 420,
  caption,
}: LJGasProps) {
  const [density, setDensity] = useState(density0);
  const [temp, setTemp] = useState(temp0);
  const [thermo, setThermo] = useState(false);
  const [running, setRunning] = useState(false);
  const [blown, setBlown] = useState(false);
  const [stats, setStats] = useState({ E: 0, Erel: 0, T: temp0, P: 0, steps: 0 });

  const reduced = usePrefersReducedMotion();

  const wrapRef = useRef<HTMLDivElement>(null);
  const particleRef = useRef<HTMLCanvasElement>(null);
  const traceRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 480, h: height });

  const densityRef = useRef(density);
  const tempRef = useRef(temp);
  const thermoRef = useRef(thermo);
  const hRef = useRef(h);
  const nRef = useRef(n);

  const simRef = useRef<Sim | null>(null);

  const seed = useCallback(() => {
    const state = createGas({
      n: nRef.current,
      density: densityRef.current,
      temperature: tempRef.current,
      seed: 1,
    });
    const E0 = totalEnergy(state);
    simRef.current = {
      state, E0, steps: 0,
      e: new Float32Array(HIST),
      te: new Float32Array(HIST),
      p: new Float32Array(HIST),
      filled: 0, cursor: 0,
    };
    pushHist(simRef.current, 0, temperatureOf(state), pressureOf(state));
    setBlown(false);
    setStats({ E: E0, Erel: 0, T: temperatureOf(state), P: pressureOf(state), steps: 0 });
  }, []);

  useEffect(() => { seed(); }, [seed]);

  const densitySpec: ParamSpec = useMemo(
    () => ({ key: 'rho', label: 'density', symbol: 'ρ', min: 0.22, max: 0.78, step: 0.01, value: density0,
             hint: 'Number density N/A. Higher ρ, more collisions, more virial in the pressure.' }),
    [density0],
  );
  const tempSpec: ParamSpec = useMemo(
    () => ({ key: 'T', label: 'temperature', symbol: 'T', min: 0.3, max: 1.4, step: 0.02, value: temp0,
             hint: 'Reseed temperature, and the thermostat target when the bath is on.' }),
    [temp0],
  );

  /* ── paint ────────────────────────────────────────────────────────────── */
  const paintParticles = useCallback(() => {
    const canvas = particleRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h: hh } = sizeRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);

    const cyan = ACCENTS.cyan;
    const magenta = ACCENTS.magenta;
    const ink = ACCENTS.faint;
    const abyss = cssColor(canvas, '--color-abyss', '#0c0a15');

    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, w, hh);

    const st = sim.state;
    const L = st.box;
    const pad = 10;
    const side = Math.min(w, hh) - pad * 2;
    const ox = (w - side) / 2;
    const oy = (hh - side) / 2;
    const sx = (q: number) => ox + (q / L) * side;
    const sy = (q: number) => oy + (q / L) * side;

    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, side, side);

    const r = Math.max(2.4, 0.38 * (st.params.sigma / L) * side);
    const vRef = Math.max(0.4, 2.2 * Math.sqrt(tempRef.current));

    for (let i = 0; i < st.n; i++) {
      const speed = Math.hypot(st.vx[i], st.vy[i]);
      const t = Math.min(1, speed / vRef);
      const col = mixHex(cyan, magenta, t);
      const px = sx(st.x[i]);
      const py = sy(st.y[i]);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 8;
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    ctx.fillStyle = ink;
    ctx.font = '11px var(--font-mono), ui-monospace, monospace';
    ctx.fillText('periodic box', ox + 6, oy + side - 8);
  }, []);

  const paintTraces = useCallback(() => {
    const canvas = traceRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
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

    const cyan = ACCENTS.cyan;
    const magenta = ACCENTS.magenta;
    const ink = ACCENTS.faint;
    const rule = cssColor(canvas, '--color-rule', '#2a2340');

    const padL = 44, padR = 10, padT = 18, gap = 14;
    const plotH = (hh - padT * 2 - gap) / 2;

    const drawPanel = (
      y0: number, buf: Float32Array, color: string, label: string,
      domain: [number, number], ruleY?: number,
    ) => {
      const x0 = padL, x1 = w - padR, y1 = y0 + plotH;
      ctx.strokeStyle = rule;
      ctx.strokeRect(x0, y0, x1 - x0, plotH);

      const [lo, hi] = domain;
      const yOf = (v: number) => y1 - ((v - lo) / (hi - lo)) * plotH;
      const n = sim.filled;
      const start = sim.cursor - n;

      if (ruleY !== undefined && ruleY >= lo && ruleY <= hi) {
        const yy = yOf(ruleY);
        ctx.strokeStyle = ink;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x0, yy);
        ctx.lineTo(x1, yy);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const v = buf[(start + k + HIST * 4) % HIST];
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

    let [eLo, eHi] = histMinMax(sim.e, sim.filled, sim.cursor);
    eLo = Math.min(eLo, -0.08);
    eHi = Math.max(eHi, 0.08);
    let [tLo, tHi] = histMinMax(sim.te, sim.filled, sim.cursor);
    tLo = Math.min(0, tLo);
    tHi = Math.max(tHi, tempRef.current * 1.2, 1);

    drawPanel(padT, sim.e, cyan, 'ΔE / E₀', [eLo, eHi], 0);
    drawPanel(padT + plotH + gap, sim.te, magenta, 'T', [tLo, tHi], thermoRef.current ? tempRef.current : undefined);
  }, [height]);

  const runningRef = useRef(running);

  /* ── step ─────────────────────────────────────────────────────────────── */
  const advance = useCallback(() => {
    const sim = simRef.current;
    if (!sim || blown) return;
    nveStep(sim.state, hRef.current);
    if (thermoRef.current) {
      berendsenThermostat(sim.state, tempRef.current, hRef.current, TAU);
    }
    const E = totalEnergy(sim.state);
    if (!Number.isFinite(E)) {
      runningRef.current = false;
      setBlown(true);
      setRunning(false);
      return;
    }
    sim.steps += 1;
    const Erel = sim.E0 !== 0 ? (E - sim.E0) / Math.abs(sim.E0) : E;
    pushHist(sim, Erel, temperatureOf(sim.state), pressureOf(sim.state));
  }, [blown]);

  const advanceRef = useRef(advance);
  const paintParticlesRef = useRef(paintParticles);
  const paintTracesRef = useRef(paintTraces);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { advanceRef.current = advance; }, [advance]);
  useEffect(() => { paintParticlesRef.current = paintParticles; }, [paintParticles]);
  useEffect(() => { paintTracesRef.current = paintTraces; }, [paintTraces]);
  useEffect(() => { densityRef.current = density; }, [density]);
  useEffect(() => { tempRef.current = temp; }, [temp]);
  useEffect(() => { thermoRef.current = thermo; }, [thermo]);
  useEffect(() => { hRef.current = h; }, [h]);
  useEffect(() => { nRef.current = n; }, [n]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const pc = particleRef.current;
    if (!wrap || !pc) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      const hh = entry.contentRect.height;
      sizeRef.current = { w, h: hh };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      pc.width = Math.round(w * dpr);
      pc.height = Math.round(hh * dpr);
      pc.style.width = `${w}px`;
      pc.style.height = `${hh}px`;
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
      if (runningRef.current) {
        acc += dt;
        let budget = 10;
        while (acc >= PER && budget-- > 0) {
          for (let k = 0; k < STEPS_PER_FRAME; k++) advanceRef.current();
          acc -= PER;
        }
        if (now - lastReadout > 125) {
          lastReadout = now;
          const sim = simRef.current;
          if (sim) {
            const E = totalEnergy(sim.state);
            setStats({
              E,
              Erel: sim.E0 !== 0 ? (E - sim.E0) / Math.abs(sim.E0) : E,
              T: temperatureOf(sim.state),
              P: pressureOf(sim.state),
              steps: sim.steps,
            });
          }
        }
      }
      paintParticlesRef.current();
      paintTracesRef.current();
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

  const onDensity = (v: number) => {
    setDensity(v);
    densityRef.current = v;
    runningRef.current = false;
    setRunning(false);
    seed();
  };

  const bandHeld = !thermo && Math.abs(stats.Erel) < 0.04;
  const rho = n / (simRef.current ? simRef.current.state.box ** 2 : n / density);

  return (
    <figure className="not-prose" style={{ margin: '2.5rem 0' }}>
      <Panel
        title="lennard-jones gas — 2D"
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
            <Button
              onClick={() => {
                const next = !thermoRef.current;
                thermoRef.current = next;
                setThermo(next);
              }}
              accent={thermo ? 'magenta' : 'cyan'}
              active={thermo}
              title="Velocity rescaling. Not symplectic."
            >
              {thermo ? 'thermostat on' : 'thermostat off'}
            </Button>
          </div>
        }
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.4fr) minmax(200px, 0.9fr)',
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
            <canvas ref={particleRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
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
          <p style={{ margin: '10px 0 0', color: 'var(--sig-warn)', fontSize: '0.95rem' }}>
            A core overlap blew the force. Reset, or drop the density.
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) minmax(180px,1fr)', gap: 18, marginTop: 16 }}>
          <Slider spec={densitySpec} value={density} onChange={onDensity} />
          <Slider spec={tempSpec} value={temp} onChange={(v) => { tempRef.current = v; setTemp(v); }} />
        </div>

        <ReadoutRow>
          <Readout label="energy E" value={formatValue(stats.E, 4)} accent="cyan" />
          <Readout
            label="ΔE / E₀"
            value={`${stats.Erel >= 0 ? '+' : ''}${formatValue(stats.Erel, 3)}`}
            accent={thermo ? 'warn' : bandHeld ? 'ok' : 'warn'}
          />
          <Readout label="temperature T" value={formatValue(stats.T, 3)} accent={thermo ? 'magenta' : 'ink'} />
          <Readout label="pressure P" value={formatValue(stats.P, 3)} />
          <Readout label="density ρ" value={formatValue(rho, 3)} />
          <Readout
            label="map"
            value={thermo ? 'rescaled' : 'NVE Verlet'}
            accent={thermo ? 'warn' : 'ok'}
          />
          <Readout label="steps" value={stats.steps.toLocaleString()} />
        </ReadoutRow>

        <p style={{ margin: '14px 0 0', fontSize: '0.98rem', lineHeight: 1.6, color: 'var(--color-ink-soft)' }}>
          Colour is speed. The traces are the same run: energy relative to the start, and the
          instantaneous temperature T = K / N. Leave the thermostat off — the energy is a band.
          Turn it on, and T is pinned by rescaling velocities; the band walks. That is a different
          discrete map.
        </p>
      </Panel>

      {caption && (
        <figcaption style={{ marginTop: 10, fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--color-ink-faint)' }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  const u = Math.min(1, Math.max(0, t));
  const ch = (i: number) => Math.round(pa[i] + (pb[i] - pa[i]) * u);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

function parseHex(c: string): [number, number, number] | null {
  const hex = c.trim();
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(hex);
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3]];
  return null;
}

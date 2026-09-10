import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Panel, Readout, ReadoutRow, Slider, usePrefersReducedMotion, type ParamSpec } from './controls.tsx';
import { formatValue } from './chart-core.ts';
import { createShaderSurface, observeSize, type ShaderSurface } from './gl/webgl.ts';
import { forwardEuler, rk4, symplecticEuler, velocityVerlet, heun } from '../../lib/numerics/ode.ts';
import type { Integrator } from '../../lib/numerics/types.ts';

/* ─────────────────────────────────────────────────────────────────────────
   Phase-space transport: what an integrator does to a REGION, not a point.

   Hamiltonian flow preserves phase-space area (Liouville's theorem). A blob
   of initial conditions may be stretched and folded beyond recognition, but
   its area is invariant. That is the structure symplectic integrators
   preserve exactly and everything else violates.

   Drag the blob anywhere and press play. Forward Euler inflates it, RK4
   slowly deflates it, and Verlet and symplectic Euler hold it to machine
   precision while distorting it wildly. The area readout is the whole lesson
   in one number — and unlike an energy plot, it does not need you to already
   believe that energy is the thing to watch.

   The area is measured honestly: the blob's boundary is a closed ring of
   tracked particles, and its area comes from the shoelace formula on that
   ring. No Gaussian approximation, no fitting.
   ───────────────────────────────────────────────────────────────────────── */

const FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform vec2  u_domainX;
uniform vec2  u_domainY;
uniform float u_system;    // 0 = oscillator, 1 = pendulum
uniform float u_time;

vec3 iridescent(float t) {
  vec3 magenta = vec3(1.000, 0.302, 0.620);
  vec3 iris    = vec3(0.655, 0.545, 0.980);
  vec3 cyan    = vec3(0.361, 0.882, 0.902);
  t = clamp(t, 0.0, 1.0);
  return t < 0.5 ? mix(magenta, iris, t / 0.5) : mix(iris, cyan, (t - 0.5) / 0.5);
}

// The Hamiltonian. Trajectories are its level sets, so contours of H ARE the
// phase portrait — no streamline integration needed.
float hamiltonian(vec2 s, float system) {
  float q = s.x, p = s.y;
  return system < 0.5
    ? 0.5 * (p * p + q * q)              // harmonic oscillator
    : 0.5 * p * p + (1.0 - cos(q));      // pendulum
}

void main() {
  vec2 s = vec2(
    mix(u_domainX.x, u_domainX.y, v_uv.x),
    mix(u_domainY.x, u_domainY.y, v_uv.y)
  );

  float H = hamiltonian(s, u_system);

  // Level-set bands, drifting slowly so the field reads as flowing.
  float bands = fract(H * 1.15 - u_time * 0.04);
  float line = smoothstep(0.0, 0.06, bands) * (1.0 - smoothstep(0.10, 0.17, bands));

  vec3 col = iridescent(clamp(H * 0.22, 0.0, 1.0));
  float alpha = 0.06 + line * 0.30;

  // The pendulum separatrix at H = 2 divides libration from rotation, and is
  // the single most informative curve in the picture.
  if (u_system > 0.5) {
    float sep = 1.0 - smoothstep(0.0, 0.035, abs(H - 2.0));
    col = mix(col, vec3(1.0, 0.77, 0.42), sep);
    alpha = max(alpha, sep * 0.55);
  }

  outColor = vec4(col * alpha, alpha);
}`;

interface SystemSpec {
  key: string;
  label: string;
  code: number;
  /** Acceleration as a function of position only — required for symplectic methods. */
  accel: (q: number) => number;
  domainX: [number, number];
  domainY: [number, number];
  blob: [number, number];
  note: string;
}

const SYSTEMS: Record<string, SystemSpec> = {
  oscillator: {
    key: 'oscillator', label: 'Harmonic oscillator', code: 0,
    accel: (q) => -q,
    domainX: [-3.4, 3.4], domainY: [-3.4, 3.4],
    blob: [1.7, 0],
    note: 'Circular flow. Every trajectory closes, so any change in the blob is the integrator’s doing rather than the dynamics.',
  },
  pendulum: {
    key: 'pendulum', label: 'Pendulum', code: 1,
    accel: (q) => -Math.sin(q),
    domainX: [-Math.PI * 2, Math.PI * 2], domainY: [-3.2, 3.2],
    blob: [2.2, 0.35],
    note: 'The amber curve is the separatrix. Near it, neighbouring initial conditions diverge fast, so the blob shears violently — and its area still must not change.',
  },
};

const INTEGRATORS: Integrator[] = [forwardEuler, heun, rk4, symplecticEuler, velocityVerlet];

const RING = 160;      // boundary particles, kept in order for the shoelace area
const FILL = 900;      // interior particles, purely visual

/** Shoelace area of a closed polygon. */
function polygonArea(xs: Float32Array, ys: Float32Array, n: number): number {
  let a = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) a += (xs[j] + xs[i]) * (ys[j] - ys[i]);
  return Math.abs(a) / 2;
}

export interface PhaseFlowProps {
  system?: 'oscillator' | 'pendulum';
  methods?: string[];
  initial?: string;
  h?: number;
  radius?: number;
  height?: number;
  caption?: string;
}

export default function PhaseFlow({
  system: systemKey = 'oscillator',
  methods = INTEGRATORS.map((m) => m.key),
  initial,
  h = 0.16,
  radius = 0.42,
  height = 460,
  caption,
}: PhaseFlowProps) {
  const system = SYSTEMS[systemKey] ?? SYSTEMS.oscillator;
  const available = INTEGRATORS.filter((m) => methods.includes(m.key));

  const [methodKey, setMethodKey] = useState(initial ?? 'velocity-verlet');
  const method = available.find((m) => m.key === methodKey) ?? available[0];

  const hSpec: ParamSpec = useMemo(
    () => ({ key: 'h', label: 'step size', symbol: 'h', min: 0.02, max: 0.5, step: 0.005, value: h,
             hint: 'Larger steps distort the blob faster. Area preservation does not depend on h at all.' }),
    [h],
  );
  const [step, setStep] = useState(h);
  const [running, setRunning] = useState(false);
  const [center, setCenter] = useState<[number, number]>(system.blob);
  const [supported, setSupported] = useState(true);
  const [stats, setStats] = useState({ area: 1, area0: 1, steps: 0 });

  const reduced = usePrefersReducedMotion();

  const wrapRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<ShaderSurface | null>(null);
  const sizeRef = useRef({ w: 640, h: height });

  // Particle state, kept out of React: this mutates every frame.
  const stateRef = useRef({
    ringQ: new Float32Array(RING), ringP: new Float32Array(RING),
    fillQ: new Float32Array(FILL), fillP: new Float32Array(FILL),
    area0: 1, steps: 0,
  });

  const seed = useCallback(() => {
    const st = stateRef.current;
    const [cq, cp] = center;
    for (let i = 0; i < RING; i++) {
      const t = (i / RING) * Math.PI * 2;
      st.ringQ[i] = cq + radius * Math.cos(t);
      st.ringP[i] = cp + radius * Math.sin(t);
    }
    for (let i = 0; i < FILL; i++) {
      // sqrt keeps the fill uniform by area rather than clustered at the centre
      const r = radius * Math.sqrt((i + 0.5) / FILL);
      const t = i * 2.399963;                       // golden angle
      st.fillQ[i] = cq + r * Math.cos(t);
      st.fillP[i] = cp + r * Math.sin(t);
    }
    st.area0 = polygonArea(st.ringQ, st.ringP, RING);
    st.steps = 0;
    setStats({ area: st.area0, area0: st.area0, steps: 0 });
  }, [center, radius]);

  useEffect(() => { seed(); }, [seed]);
  useEffect(() => { seed(); setRunning(false); }, [methodKey, systemKey, seed]);

  /* ── background field ──────────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = glCanvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const surface = createShaderSurface(canvas, FRAG);
    if (!surface) { setSupported(false); return; }
    surfaceRef.current = surface;

    const stop = observeSize(wrap, (w, hh) => {
      sizeRef.current = { w, h: hh };
      surface.resize(w, hh);
      const dc = drawCanvasRef.current;
      if (dc) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        dc.width = Math.round(w * dpr);
        dc.height = Math.round(hh * dpr);
        dc.style.width = `${w}px`;
        dc.style.height = `${hh}px`;
      }
    });

    return () => { stop(); surface.destroy(); surfaceRef.current = null; };
  }, []);

  const paintField = useCallback((t: number) => {
    const s = surfaceRef.current;
    if (!s) return;
    s.set('u_domainX', system.domainX);
    s.set('u_domainY', system.domainY);
    s.set('u_system', system.code);
    s.set('u_time', t);
    s.draw();
  }, [system]);

  /* ── particle rendering ────────────────────────────────────────────────── */
  const paintParticles = useCallback(() => {
    const dc = drawCanvasRef.current;
    if (!dc) return;
    const ctx = dc.getContext('2d');
    if (!ctx) return;

    const { w, h: hh } = sizeRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);

    const [x0, x1] = system.domainX;
    const [y0, y1] = system.domainY;
    const sx = (q: number) => ((q - x0) / (x1 - x0)) * w;
    const sy = (p: number) => hh - ((p - y0) / (y1 - y0)) * hh;

    const st = stateRef.current;

    // interior
    ctx.fillStyle = 'rgba(92, 225, 230, 0.5)';
    for (let i = 0; i < FILL; i++) {
      ctx.fillRect(sx(st.fillQ[i]) - 1, sy(st.fillP[i]) - 1, 2, 2);
    }

    // boundary ring — the thing whose area is measured
    ctx.beginPath();
    for (let i = 0; i < RING; i++) {
      const x = sx(st.ringQ[i]);
      const y = sy(st.ringP[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = '#ff4d9e';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ff4d9e';
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 77, 158, 0.10)';
    ctx.fill();
  }, [system]);

  /* ── stepping ──────────────────────────────────────────────────────────── */
  const advance = useCallback(() => {
    const st = stateRef.current;
    const f = (_t: number, [q, p]: number[]) => [p, system.accel(q)];

    const stepOne = (qArr: Float32Array, pArr: Float32Array, n: number) => {
      for (let i = 0; i < n; i++) {
        const next = method.step(f, 0, [qArr[i], pArr[i]], step);
        qArr[i] = next[0];
        pArr[i] = next[1];
      }
    };
    stepOne(st.ringQ, st.ringP, RING);
    stepOne(st.fillQ, st.fillP, FILL);
    st.steps += 1;
  }, [method, step, system]);

  /* ── frame loop ──────────────────────────────────────────────────────────
     Kept on refs and mounted once. An earlier version listed `advance` and
     `running` as effect dependencies and called setStats on every frame; the
     resulting re-render tore the loop down and rebuilt it each frame, which
     reset the time accumulator and dropped the simulation to a few steps per
     second. Readouts are throttled for the same reason — a number that
     changes 60 times a second is unreadable anyway.
     ───────────────────────────────────────────────────────────────────── */
  const runningRef = useRef(running);
  const advanceRef = useRef(advance);
  const paintFieldRef = useRef(paintField);
  const paintParticlesRef = useRef(paintParticles);
  const reducedRef = useRef(reduced);

  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { advanceRef.current = advance; }, [advance]);
  useEffect(() => { paintFieldRef.current = paintField; }, [paintField]);
  useEffect(() => { paintParticlesRef.current = paintParticles; }, [paintParticles]);
  useEffect(() => { reducedRef.current = reduced; }, [reduced]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastReadout = 0;
    const t0 = last;
    const PER_STEP = 1 / 60;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (runningRef.current) {
        acc += dt;
        let budget = 12;                       // cap catch-up after a stall
        while (acc >= PER_STEP && budget-- > 0) {
          advanceRef.current();
          acc -= PER_STEP;
        }

        if (now - lastReadout > 120) {
          lastReadout = now;
          const st = stateRef.current;
          setStats({ area: polygonArea(st.ringQ, st.ringP, RING), area0: st.area0, steps: st.steps });
        }
      }

      paintFieldRef.current(reducedRef.current ? 0 : (now - t0) / 1000);
      paintParticlesRef.current();
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ── placing the blob ──────────────────────────────────────────────────── */
  const place = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width;
    const v = 1 - (e.clientY - r.top) / r.height;
    const [x0, x1] = system.domainX;
    const [y0, y1] = system.domainY;
    setRunning(false);
    setCenter([x0 + u * (x1 - x0), y0 + v * (y1 - y0)]);
  };

  const drift = stats.area0 > 0 ? (stats.area - stats.area0) / stats.area0 : 0;
  const driftPct = drift * 100;
  const preserved = Math.abs(drift) < 0.01;

  return (
    <figure className="not-prose" style={{ margin: '2.5rem 0' }}>
      <Panel
        title={`phase-space transport — ${system.label}`}
        right={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Button onClick={() => setRunning(!running)} accent={running ? 'amber' : 'acid'}>
              {running ? 'pause' : 'play'}
            </Button>
            <Button onClick={() => { setRunning(false); seed(); }}>reset</Button>
          </div>
        }
      >
        {!supported && (
          <p style={{ color: 'var(--color-amber)', margin: '0 0 12px' }}>
            The field background needs WebGL2; the particles still work.
          </p>
        )}

        <div
          ref={wrapRef}
          onPointerDown={place}
          style={{
            position: 'relative', height, cursor: 'crosshair', touchAction: 'none',
            border: '1px solid var(--color-rule)', borderRadius: 'var(--radius-hud)',
            overflow: 'hidden',
            background: 'color-mix(in oklab, var(--color-abyss) 82%, transparent)',
          }}
        >
          <canvas ref={glCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          <canvas ref={drawCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          <span className="hud-label" style={{ position: 'absolute', left: 12, bottom: 10, pointerEvents: 'none' }}>
            position q →
          </span>
          <span className="hud-label" style={{ position: 'absolute', left: 12, top: 10, pointerEvents: 'none' }}>
            ↑ momentum p
          </span>
          <span className="hud-label" style={{ position: 'absolute', right: 12, bottom: 10, pointerEvents: 'none', color: 'var(--color-ink-ghost)' }}>
            click to move the blob
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(190px,1fr) 2fr', gap: 18, alignItems: 'end', marginTop: 16 }}>
          <Slider spec={hSpec} value={step} onChange={setStep} />
          <div>
            <span className="hud-label" style={{ display: 'block', marginBottom: 7 }}>integrator</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {available.map((m) => (
                <Button
                  key={m.key}
                  active={m.key === methodKey}
                  onClick={() => setMethodKey(m.key)}
                  accent={m.symplectic ? 'acid' : 'cyan'}
                  title={m.symplectic ? 'symplectic' : 'not symplectic'}
                >
                  {m.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <ReadoutRow>
          <Readout label="blob area" value={formatValue(stats.area, 4)} accent="ink" />
          <Readout
            label="area change"
            value={`${driftPct >= 0 ? '+' : ''}${formatValue(driftPct, 3)} %`}
            accent={preserved ? 'acid' : Math.abs(drift) > 0.1 ? 'magenta' : 'amber'}
          />
          <Readout label="steps taken" value={stats.steps.toLocaleString()} />
          <Readout label="symplectic?" value={method.symplectic ? 'yes' : 'no'} accent={method.symplectic ? 'acid' : 'amber'} />
        </ReadoutRow>

        <p style={{ margin: '14px 0 0', fontSize: '0.98rem', lineHeight: 1.6, color: 'var(--color-ink-soft)' }}>
          {system.note}
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

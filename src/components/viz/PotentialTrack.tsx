import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LANDSCAPES,
  allowedRegions,
  equilibriaOf,
  speedAt,
  turningPointsOf,
  verletStep,
  type Landscape,
} from '../../lib/physics/landscape.ts';
import { Button, Panel, Readout, ReadoutRow, Slider, Toggle, useAnimationFrame } from './controls.tsx';

/* ── the potential track ───────────────────────────────────────────────────
   A marble on U(x) with a dashed total-energy line. The reusable picture for
   chapters 7, 14, 30 and 40: a spring valley, a molecular bond, an LC loop and
   a quantum well are the same object in different clothes, and a learner who
   has moved this one can read all four.

   The marble is stepped with velocity Verlet and drawn by writing attributes
   straight onto SVG refs inside the frame loop. React state updates only at
   ~8 Hz for the readouts. Driving the animation through setState would re-run
   the effect every frame, reset the accumulator, and quietly drop the
   simulation to a few steps per second — that has happened in this repo before.
   ──────────────────────────────────────────────────────────────────────── */

export interface PotentialTrackProps {
  /** Key into LANDSCAPES: spring · gravityRamp · doubleWell · lennardJones · pendulum */
  landscape?: string;
  /** Offer a picker over these landscapes. The transfer test, made a control. */
  landscapes?: string[];
  /** Total energy. Defaults to the landscape's own suggestion. */
  energy?: number;
  /** Where the marble starts. Defaults to the left turning point. */
  startX?: number;
  mass?: number;
  showEquilibria?: boolean;
  showEnergyBars?: boolean;
  /** Let the learner raise and lower the energy line. Off makes this a figure. */
  draggableEnergy?: boolean;
  autoPlay?: boolean;
  height?: number;
  caption?: string;
}

const PAD = { l: 56, r: 18, t: 18, b: 42 };
const SUBSTEPS = 12;
const DT = 0.0025;

export default function PotentialTrack({
  landscape = 'spring',
  landscapes,
  energy,
  startX,
  mass = 1,
  showEquilibria = true,
  showEnergyBars = true,
  draggableEnergy = true,
  autoPlay = true,
  height = 340,
  caption,
}: PotentialTrackProps) {
  const [landKey, setLandKey] = useState(landscape);
  const land: Landscape = LANDSCAPES[landKey] ?? LANDSCAPES.spring;

  const [E, setE] = useState(energy ?? land.suggestedE ?? 2);
  const [playing, setPlaying] = useState(autoPlay);
  const [width, setWidth] = useState(760);
  const [readout, setReadout] = useState({ x: 0, v: 0, K: 0, U: 0 });

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const marbleRef = useRef<SVGCircleElement>(null);
  const kBarRef = useRef<SVGRectElement>(null);
  const uBarRef = useRef<SVGRectElement>(null);

  // The live state of the simulation. Refs, not state — see the note above.
  const sim = useRef({ x: 0, v: 0, lastReadout: 0 });

  const [x0, x1] = land.domain;

  /* ── sampled curve and geometry ──────────────────────────────────────── */
  const curve = useMemo(() => {
    const n = 480;
    return Array.from({ length: n }, (_, i) => {
      const x = x0 + ((x1 - x0) * i) / (n - 1);
      return { x, u: land.U(x) };
    });
  }, [land, x0, x1]);

  const [uLo, uHi] = useMemo(() => {
    const us = curve.map((p) => p.u);
    let lo = Math.min(...us);
    let hi = Math.max(...us);
    // Always keep the energy line on screen, or raising it walks off the top.
    lo = Math.min(lo, E);
    hi = Math.max(hi, E);
    const pad = (hi - lo) * 0.14 || 1;
    return [lo - pad, hi + pad];
  }, [curve, E]);

  const plotW = Math.max(140, width - PAD.l - PAD.r);
  const plotH = height - PAD.t - PAD.b;
  const sx = useCallback((x: number) => PAD.l + ((x - x0) / (x1 - x0)) * plotW, [x0, x1, plotW]);
  const sy = useCallback(
    (u: number) => PAD.t + plotH - ((u - uLo) / (uHi - uLo)) * plotH,
    [uLo, uHi, plotH],
  );
  const invY = useCallback(
    (py: number) => uLo + ((PAD.t + plotH - py) / plotH) * (uHi - uLo),
    [uLo, uHi, plotH],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const turns = useMemo(() => turningPointsOf(land, E), [land, E]);
  const regions = useMemo(() => allowedRegions(land, E), [land, E]);
  const eqs = useMemo(
    () => (showEquilibria ? equilibriaOf(land, mass) : []),
    [land, mass, showEquilibria],
  );

  /* ── placing the marble ──────────────────────────────────────────────── */
  const reset = useCallback(() => {
    const fallback = regions[0] ? (regions[0][0] + regions[0][1]) / 2 : (x0 + x1) / 2;
    // Start at a turning point when there is one: released from rest is the
    // cleanest experiment, and it makes the amplitude unambiguous.
    const start = startX ?? turns[0] ?? fallback;
    const s = speedAt(land, E, start, mass);
    sim.current.x = start;
    sim.current.v = s === null ? 0 : 0;
    setReadout({ x: start, v: 0, K: 0, U: land.U(start) });
  }, [land, E, startX, turns, regions, mass, x0, x1]);

  useEffect(() => {
    reset();
  }, [reset]);

  useEffect(() => setE(energy ?? land.suggestedE ?? 2), [landKey, energy, land]);

  /* ── the frame loop ──────────────────────────────────────────────────── */
  useAnimationFrame(playing, () => {
    const s = sim.current;
    for (let i = 0; i < SUBSTEPS; i++) {
      const [nx, nv] = verletStep(land, s.x, s.v, DT, mass);
      s.x = nx;
      s.v = nv;
    }

    // A marble that has left the domain has escaped: park it at the edge
    // rather than letting it fly off and take the readouts with it.
    if (s.x < x0) {
      s.x = x0;
      s.v = Math.abs(s.v);
    } else if (s.x > x1) {
      s.x = x1;
      s.v = -Math.abs(s.v);
    }

    const px = sx(s.x);
    const py = sy(land.U(s.x));
    marbleRef.current?.setAttribute('cx', String(px));
    marbleRef.current?.setAttribute('cy', String(py - 9));

    const K = 0.5 * mass * s.v * s.v;
    const U = land.U(s.x);
    const total = Math.max(1e-9, K + Math.abs(U - uLo));
    if (kBarRef.current && uBarRef.current) {
      const h = plotH * 0.62;
      const kh = (K / total) * h;
      kBarRef.current.setAttribute('height', String(Math.max(0, kh)));
      kBarRef.current.setAttribute('y', String(PAD.t + h - kh));
      uBarRef.current.setAttribute('height', String(Math.max(0, h - kh)));
    }

    // Readouts at ~8 Hz. Every frame would be unreadable anyway.
    const now = performance.now();
    if (now - s.lastReadout > 120) {
      s.lastReadout = now;
      setReadout({ x: s.x, v: s.v, K, U });
    }
  });

  /* ── dragging the energy line ────────────────────────────────────────── */
  const [dragE, setDragE] = useState(false);
  useEffect(() => {
    if (!dragE) return;
    const move = (ev: PointerEvent) => {
      const rect = svgRef.current!.getBoundingClientRect();
      setE(invY(ev.clientY - rect.top));
    };
    const up = () => setDragE(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragE, invY]);

  const curvePath = curve
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.u).toFixed(1)}`)
    .join('');

  /** Stretches of the domain the particle is barred from, as the complement of
   *  the allowed regions. */
  const forbidden = useMemo(() => {
    const out: [number, number][] = [];
    let cursor = x0;
    for (const [a, b] of regions) {
      if (a > cursor) out.push([cursor, a]);
      cursor = b;
    }
    if (cursor < x1) out.push([cursor, x1]);
    return out;
  }, [regions, x0, x1]);

  /** The region between the energy line and the curve over [a, b] — a closed
   *  path following U(x) along the bottom and the flat E line back. */
  const kineticBand = useCallback(
    (a: number, b: number) => {
      const n = 160;
      const pts = Array.from({ length: n }, (_, i) => {
        const x = a + ((b - a) * i) / (n - 1);
        return `${sx(x).toFixed(1)},${sy(land.U(x)).toFixed(1)}`;
      });
      return `M${sx(a).toFixed(1)},${sy(E).toFixed(1)}L${pts.join('L')}L${sx(b).toFixed(1)},${sy(E).toFixed(1)}Z`;
    },
    [land, E, sx, sy],
  );

  const fmt = (v: number) => String(Math.round(v * 100) / 100);
  const barH = plotH * 0.62;

  return (
    <Panel
      title={land.label}
      right={
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {landscapes && landscapes.length > 1 && (
            <Toggle
              options={landscapes.map((k) => ({
                key: k,
                label: LANDSCAPES[k]?.label.split('—')[0].trim() ?? k,
              }))}
              value={[landKey]}
              onChange={(next) => next[0] && setLandKey(next[0])}
            />
          )}
          <Button onClick={() => setPlaying((p) => !p)} accent={playing ? 'warn' : 'ok'}>
            {playing ? 'pause' : 'play'}
          </Button>
          <Button onClick={reset} accent="iris">reset</Button>
        </span>
      }
    >
      <div ref={wrapRef} style={{ width: '100%' }}>
        <svg
          ref={svgRef}
          width={width}
          height={height}
          style={{ display: 'block', touchAction: 'none' }}
          role="img"
          aria-label={`Potential energy curve for ${land.label}, with a total-energy line at ${fmt(E)} joules and a marble rolling on it.`}
        >
          {/* forbidden regions: where the energy line is under the curve, and
              the particle simply cannot be */}
          <defs>
            <clipPath id={`pt-clip-${landKey}`}>
              <rect x={PAD.l} y={PAD.t} width={plotW} height={plotH} />
            </clipPath>
          </defs>

          <g clipPath={`url(#pt-clip-${landKey})`}>
            {/* Forbidden stretches: E is under the curve, so the particle
                simply cannot be here. Banded rather than washed, so the edges
                land exactly on the turning points. */}
            {forbidden.map(([a, b], i) => (
              <rect
                key={`f-${i}`}
                x={sx(a)}
                y={PAD.t}
                width={Math.max(0, sx(b) - sx(a))}
                height={plotH}
                fill="var(--color-magenta)"
                opacity={0.09}
              />
            ))}

            {/* The gap between the energy line and the curve IS the kinetic
                energy, at every x. Filling it makes "where is it fastest?"
                a question you answer by looking at a thickness. */}
            {regions.map(([a, b], i) => (
              <path key={`k-${i}`} d={kineticBand(a, b)} fill="var(--color-cyan)" opacity={0.16} />
            ))}
          </g>

          {/* the curve */}
          <path d={curvePath} fill="none" stroke="var(--color-orchid)" strokeWidth={2.4} />

          {/* the energy line */}
          <line
            x1={PAD.l}
            x2={PAD.l + plotW}
            y1={sy(E)}
            y2={sy(E)}
            stroke="var(--color-magenta)"
            strokeWidth={2}
            strokeDasharray="7 5"
          />
          <text
            x={PAD.l + plotW - 4}
            y={sy(E) - 7}
            textAnchor="end"
            fill="var(--color-magenta)"
            style={{ fontSize: 11.5, letterSpacing: '0.05em' }}
          >
            E = {fmt(E)} J{draggableEnergy ? ' — drag' : ''}
          </text>
          {draggableEnergy && (
            <rect
              x={PAD.l}
              y={sy(E) - 9}
              width={plotW}
              height={18}
              fill="transparent"
              style={{ cursor: 'ns-resize' }}
              tabIndex={0}
              role="slider"
              aria-label="total energy"
              aria-valuenow={Math.round(E * 100) / 100}
              onPointerDown={(ev) => {
                ev.preventDefault();
                setDragE(true);
              }}
              onKeyDown={(ev) => {
                const step = (uHi - uLo) * (ev.shiftKey ? 0.05 : 0.015);
                if (ev.key === 'ArrowUp') {
                  ev.preventDefault();
                  setE((p) => p + step);
                } else if (ev.key === 'ArrowDown') {
                  ev.preventDefault();
                  setE((p) => p - step);
                }
              }}
            />
          )}

          {/* turning points: where the line meets the curve */}
          {turns.map((t, i) => (
            <g key={`t-${i}`}>
              <circle cx={sx(t)} cy={sy(E)} r={4.5} fill="var(--color-magenta)" />
              <line
                x1={sx(t)}
                x2={sx(t)}
                y1={sy(E)}
                y2={PAD.t + plotH}
                stroke="var(--color-magenta)"
                strokeWidth={1}
                strokeDasharray="2 4"
                opacity={0.6}
              />
            </g>
          ))}

          {eqs.map((e, i) => (
            <g key={`e-${i}`}>
              <circle
                cx={sx(e.x)}
                cy={sy(e.U)}
                r={4}
                fill="none"
                stroke={e.stability === 'stable' ? 'var(--color-ok)' : 'var(--color-warn)'}
                strokeWidth={1.8}
              />
              <text
                x={sx(e.x)}
                y={sy(e.U) + (e.stability === 'stable' ? 18 : -10)}
                textAnchor="middle"
                fill={e.stability === 'stable' ? 'var(--color-ok)' : 'var(--color-warn)'}
                style={{ fontSize: 10.5, letterSpacing: '0.05em' }}
              >
                {e.stability}
              </text>
            </g>
          ))}

          {/* the marble */}
          <circle ref={marbleRef} cx={sx(0)} cy={sy(0)} r={9} fill="var(--color-cyan)" />

          {/* energy bars */}
          {showEnergyBars && (
            <g>
              <rect
                ref={uBarRef}
                x={PAD.l + plotW + 4}
                y={PAD.t}
                width={0}
                height={0}
                fill="var(--color-orchid)"
              />
              <rect
                ref={kBarRef}
                x={PAD.l + plotW + 4}
                y={PAD.t}
                width={0}
                height={0}
                fill="var(--color-cyan)"
              />
            </g>
          )}

          {/* axes */}
          <line
            x1={PAD.l}
            x2={PAD.l + plotW}
            y1={PAD.t + plotH}
            y2={PAD.t + plotH}
            stroke="var(--color-rule-bright)"
          />
          <text
            x={PAD.l + plotW}
            y={height - 12}
            textAnchor="end"
            fill="var(--color-ink-ghost)"
            style={{ fontSize: 10.5, letterSpacing: '0.06em' }}
          >
            {land.xLabel ?? 'position'}
          </text>
          <text
            x={PAD.l - 8}
            y={PAD.t + 10}
            textAnchor="end"
            fill="var(--color-ink-faint)"
            style={{ fontSize: 10.5 }}
          >
            U (J)
          </text>
        </svg>
      </div>

      {draggableEnergy && (
        <div style={{ marginTop: 6 }}>
          <Slider
            spec={{
              key: 'E',
              label: 'total energy',
              min: uLo,
              max: uHi,
              step: (uHi - uLo) / 400,
              value: E,
              symbol: 'E',
              unit: 'J',
            }}
            value={E}
            onChange={setE}
          />
        </div>
      )}

      <ReadoutRow>
        <Readout label="position" value={fmt(readout.x)} accent="cyan" />
        <Readout label="kinetic" value={`${fmt(readout.K)} J`} accent="cyan" />
        <Readout label="potential" value={`${fmt(readout.U)} J`} accent="orchid" />
        <Readout label="total" value={`${fmt(readout.K + readout.U)} J`} accent="magenta" />
        <Readout
          label="turning points"
          value={turns.length === 0 ? 'none — it escapes' : String(turns.length)}
          accent={turns.length === 0 ? 'warn' : 'iris'}
        />
      </ReadoutRow>

      {caption && (
        <p style={{ marginTop: 10, color: 'var(--color-ink-soft)', fontSize: '0.95rem', lineHeight: 1.6 }}>
          {caption}
        </p>
      )}
    </Panel>
  );
}

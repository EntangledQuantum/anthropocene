import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { turningPointsOf, type Landscape } from '../../lib/physics/landscape.ts';
import {
  ALL_LANDSCAPES,
  forceAt,
  landscapeOf,
  shiftLandscape,
  slopeProfile,
} from '../../lib/physics/landscapes-ch7.ts';
import { Panel, Readout, ReadoutRow, Slider, Toggle } from './controls.tsx';

/* ── force is the slope ────────────────────────────────────────────────────
   Two panels over one x axis. The top is U(x) with a probe you drag and the
   tangent at that probe; the bottom is F(x) = −dU/dx with the same probe. The
   link between them is the whole lesson, so neither panel is editable: you
   move one point and both panels report what is already true.

   The floor slider is the second half. It slides the entire U curve — and the
   total-energy line with it, because E = K + U moves when U's zero moves — up
   and down a FIXED ruler, so the numbers visibly change. The force panel does
   not twitch, and the turning-point verticals stay nailed to the same x. That
   is "U is defined only up to a constant" as something you watch rather than
   something you are told.

   No animation: the probe is pointer-driven, so plain state at event rate is
   correct here and the refs-and-rAF discipline of PotentialTrack is not
   needed.
   ──────────────────────────────────────────────────────────────────────── */

export interface ForceFromSlopeProps {
  /** Key into the chapter-7 landscape table (the shared five plus `staircase`). */
  landscape?: string;
  /** Offer a picker. Same reasoning in several costumes, as a control. */
  landscapes?: string[];
  /** Where the probe starts. Defaults to the middle of the domain. */
  probeX?: number;
  /** Show a dashed total-energy line, measured on the UNSHIFTED U. */
  showEnergy?: boolean;
  energy?: number;
  /** Let the learner slide the zero of U. Off makes this a force-vs-slope figure. */
  floorShift?: boolean;
  floorRange?: [number, number];
  height?: number;
  caption?: string;
}

const PAD = { l: 60, r: 20, t: 16, b: 36 };
const GAP = 30;

const fmt = (v: number, d = 2) => {
  const r = Math.round(v * 10 ** d) / 10 ** d;
  return Object.is(r, -0) ? '0' : String(r);
};

export default function ForceFromSlope({
  landscape = 'staircase',
  landscapes,
  probeX,
  showEnergy = false,
  energy,
  floorShift = false,
  floorRange = [-3, 3],
  height = 430,
  caption,
}: ForceFromSlopeProps) {
  const [landKey, setLandKey] = useState(landscape);
  const base: Landscape = landscapeOf(landKey);
  const [x0, x1] = base.domain;

  const [offset, setOffset] = useState(0);
  const [xp, setXp] = useState(probeX ?? (x0 + x1) / 2);
  const [width, setWidth] = useState(760);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Switching costume must not leave the probe outside the new domain.
  useEffect(() => {
    setXp((p) => Math.min(x1, Math.max(x0, p)));
  }, [x0, x1]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  /** The landscape the learner is looking at: same physics, chosen floor. */
  const land = useMemo(() => (offset === 0 ? base : shiftLandscape(base, offset)), [base, offset]);

  const prof = useMemo(() => slopeProfile(base, 420), [base]);

  /* ── geometry ─────────────────────────────────────────────────────────── */
  const plotW = Math.max(160, width - PAD.l - PAD.r);
  const bodyH = height - PAD.t - PAD.b - GAP;
  const hU = bodyH * 0.6;
  const hF = bodyH - hU;
  const topY = PAD.t;
  const botY = PAD.t + hU + GAP;

  const [floorLo, floorHi] = floorRange;

  /** A ruler that does not move. The curve travels across it as the floor
   *  changes, which is the point — an auto-fitting axis would hide the whole
   *  demonstration by silently following the curve. */
  const [uLo, uHi] = useMemo(() => {
    const us = prof.map((s) => s.U);
    const lo = Math.min(...us) + (floorShift ? floorLo : 0);
    const hi = Math.max(...us) + (floorShift ? floorHi : 0);
    const pad = (hi - lo) * 0.08 || 1;
    return [lo - pad, hi + pad];
  }, [prof, floorShift, floorLo, floorHi]);

  const fMax = useMemo(
    () => Math.max(...prof.map((s) => Math.abs(s.F))) * 1.15 || 1,
    [prof],
  );

  const sx = useCallback((x: number) => PAD.l + ((x - x0) / (x1 - x0)) * plotW, [x0, x1, plotW]);
  const syU = useCallback(
    (u: number) => topY + hU - ((u - uLo) / (uHi - uLo)) * hU,
    [topY, hU, uLo, uHi],
  );
  const syF = useCallback((f: number) => botY + hF / 2 - (f / fMax) * (hF / 2), [botY, hF, fMax]);
  const invX = useCallback(
    (px: number) => Math.min(x1, Math.max(x0, x0 + ((px - PAD.l) / plotW) * (x1 - x0))),
    [x0, x1, plotW],
  );

  /* ── dragging the probe ───────────────────────────────────────────────── */
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    const move = (ev: PointerEvent) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect) setXp(invX(ev.clientX - rect.left));
    };
    const up = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, invX]);

  /* ── what the probe reports ───────────────────────────────────────────── */
  const slope = base.dU(xp);
  const F = forceAt(base, xp);
  const Up = land.U(xp);

  const E0 = energy ?? base.suggestedE ?? 0;
  const Eshifted = E0 + offset;
  /** Computed on the UNSHIFTED landscape at the UNSHIFTED energy. Identical to
   *  the shifted pair by construction — which is exactly the claim, so it is
   *  drawn from the invariant side rather than recomputed and hoped for. */
  const turns = useMemo(
    () => (showEnergy ? turningPointsOf(base, E0) : []),
    [showEnergy, base, E0],
  );

  const path = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');

  const uPath = path(prof.map((s) => ({ x: sx(s.x), y: syU(s.U + offset) })));
  const fPath = path(prof.map((s) => ({ x: sx(s.x), y: syF(s.F) })));

  // Tangent: a short straight segment through the probe with the measured
  // slope, so "the slope" is a line you can compare to the curve.
  const dTan = (x1 - x0) * 0.13;
  const tanX0 = Math.max(x0, xp - dTan);
  const tanX1 = Math.min(x1, xp + dTan);

  const ticksU = useMemo(() => {
    const n = 4;
    return Array.from({ length: n + 1 }, (_, i) => uLo + ((uHi - uLo) * i) / n);
  }, [uLo, uHi]);

  const arrowLen = (F / fMax) * plotW * 0.16;

  return (
    <Panel
      title={base.label}
      right={
        landscapes && landscapes.length > 1 ? (
          <Toggle
            options={landscapes.map((k) => ({
              key: k,
              label: ALL_LANDSCAPES[k]?.label.split('—')[0].trim() ?? k,
            }))}
            value={[landKey]}
            onChange={(next) => next[0] && setLandKey(next[0])}
          />
        ) : undefined
      }
    >
      <div ref={wrapRef} style={{ width: '100%' }}>
        <svg
          ref={svgRef}
          width={width}
          height={height}
          style={{ display: 'block', touchAction: 'none', cursor: 'ew-resize' }}
          role="img"
          aria-label={`Potential energy and force for ${base.label}. At position ${fmt(xp)}, the slope of U is ${fmt(slope)} and the force is ${fmt(F)} newtons.`}
          onPointerDown={(ev) => {
            const rect = svgRef.current!.getBoundingClientRect();
            setXp(invX(ev.clientX - rect.left));
            setDragging(true);
          }}
        >
          <defs>
            <clipPath id={`ffs-top-${landKey}`}>
              <rect x={PAD.l} y={topY} width={plotW} height={hU} />
            </clipPath>
            <clipPath id={`ffs-bot-${landKey}`}>
              <rect x={PAD.l} y={botY} width={plotW} height={hF} />
            </clipPath>
          </defs>

          {/* ── the ruler the curve slides across ── */}
          {ticksU.map((u) => (
            <g key={`ty-${u}`}>
              <line
                x1={PAD.l}
                x2={PAD.l + plotW}
                y1={syU(u)}
                y2={syU(u)}
                stroke="var(--color-rule)"
                strokeWidth={1}
              />
              <text
                x={PAD.l - 8}
                y={syU(u) + 4}
                textAnchor="end"
                fill="var(--color-ink-faint)"
                style={{ fontSize: 11 }}
              >
                {fmt(u, 1)}
              </text>
            </g>
          ))}

          {/* turning points: verticals through BOTH panels. They do not move
              when the floor moves, and that is the demonstration. */}
          {turns.map((t, i) => (
            <line
              key={`turn-${i}`}
              x1={sx(t)}
              x2={sx(t)}
              y1={topY}
              y2={botY + hF}
              stroke="var(--color-magenta)"
              strokeWidth={1}
              strokeDasharray="3 5"
              opacity={0.55}
            />
          ))}

          <g clipPath={`url(#ffs-top-${landKey})`}>
            {showEnergy && (
              <>
                <line
                  x1={PAD.l}
                  x2={PAD.l + plotW}
                  y1={syU(Eshifted)}
                  y2={syU(Eshifted)}
                  stroke="var(--color-magenta)"
                  strokeWidth={2}
                  strokeDasharray="7 5"
                />
                <text
                  x={PAD.l + plotW - 4}
                  y={syU(Eshifted) - 7}
                  textAnchor="end"
                  fill="var(--color-magenta)"
                  style={{ fontSize: 11.5, letterSpacing: '0.05em' }}
                >
                  E = {fmt(Eshifted)} J
                </text>
              </>
            )}

            <path d={uPath} fill="none" stroke="var(--color-orchid)" strokeWidth={2.4} />

            {/* the tangent — the slope, drawn as a line */}
            <line
              x1={sx(tanX0)}
              x2={sx(tanX1)}
              y1={syU(Up + slope * (tanX0 - xp))}
              y2={syU(Up + slope * (tanX1 - xp))}
              stroke="var(--color-aqua)"
              strokeWidth={2}
            />
            {/* rise over run, so the number in the readout has a picture */}
            <line
              x1={sx(xp)}
              x2={sx(tanX1)}
              y1={syU(Up)}
              y2={syU(Up)}
              stroke="var(--color-aqua)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.8}
            />
            <line
              x1={sx(tanX1)}
              x2={sx(tanX1)}
              y1={syU(Up)}
              y2={syU(Up + slope * (tanX1 - xp))}
              stroke="var(--color-aqua)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.8}
            />

            {/* the force, as an arrow on the curve: downhill, always */}
            <line
              x1={sx(xp)}
              x2={sx(xp) + arrowLen}
              y1={syU(Up) - 16}
              y2={syU(Up) - 16}
              stroke="var(--color-cyan)"
              strokeWidth={3}
            />
            {Math.abs(arrowLen) > 3 && (
              <polygon
                points={`${sx(xp) + arrowLen},${syU(Up) - 16} ${sx(xp) + arrowLen - Math.sign(arrowLen) * 9},${syU(Up) - 21} ${sx(xp) + arrowLen - Math.sign(arrowLen) * 9},${syU(Up) - 11}`}
                fill="var(--color-cyan)"
              />
            )}
            <circle cx={sx(xp)} cy={syU(Up)} r={6} fill="var(--color-cyan)" />
          </g>

          <text
            x={PAD.l - 8}
            y={topY + 11}
            textAnchor="end"
            fill="var(--color-orchid)"
            style={{ fontSize: 11, letterSpacing: '0.05em' }}
          >
            U (J)
          </text>

          {/* ── the force panel ── */}
          <g clipPath={`url(#ffs-bot-${landKey})`}>
            <rect
              x={PAD.l}
              y={botY}
              width={plotW}
              height={hF}
              fill="var(--color-iris)"
              opacity={0.04}
            />
            <line
              x1={PAD.l}
              x2={PAD.l + plotW}
              y1={syF(0)}
              y2={syF(0)}
              stroke="var(--color-rule-bright)"
              strokeWidth={1}
            />
            <path d={fPath} fill="none" stroke="var(--color-iris)" strokeWidth={2.4} />
            <line
              x1={sx(xp)}
              x2={sx(xp)}
              y1={syF(0)}
              y2={syF(F)}
              stroke="var(--color-cyan)"
              strokeWidth={2}
            />
            <circle cx={sx(xp)} cy={syF(F)} r={5.5} fill="var(--color-cyan)" />
          </g>

          <text
            x={PAD.l - 8}
            y={botY + 11}
            textAnchor="end"
            fill="var(--color-iris)"
            style={{ fontSize: 11, letterSpacing: '0.05em' }}
          >
            F (N)
          </text>
          <text
            x={PAD.l - 8}
            y={syF(0) + 4}
            textAnchor="end"
            fill="var(--color-ink-faint)"
            style={{ fontSize: 11 }}
          >
            0
          </text>
          <text
            x={PAD.l - 8}
            y={syF(fMax / 1.15) + 4}
            textAnchor="end"
            fill="var(--color-ink-faint)"
            style={{ fontSize: 11 }}
          >
            {fmt(fMax / 1.15, 1)}
          </text>

          <line
            x1={PAD.l}
            x2={PAD.l + plotW}
            y1={botY + hF}
            y2={botY + hF}
            stroke="var(--color-rule-bright)"
          />
          <text
            x={PAD.l + plotW}
            y={height - 10}
            textAnchor="end"
            fill="var(--color-ink-ghost)"
            style={{ fontSize: 10.5, letterSpacing: '0.06em' }}
          >
            {base.xLabel ?? 'position'}
          </text>
        </svg>
      </div>

      <div
        style={{
          marginTop: 8,
          display: 'grid',
          gridTemplateColumns: floorShift ? '1fr 1fr' : '1fr',
          gap: 16,
        }}
      >
        <Slider
          spec={{
            key: 'xp',
            label: 'probe position',
            min: x0,
            max: x1,
            step: (x1 - x0) / 400,
            value: xp,
            symbol: 'x',
          }}
          value={xp}
          onChange={setXp}
        />
        {floorShift && (
          <Slider
            spec={{
              key: 'floor',
              label: 'where you put U = 0',
              min: floorLo,
              max: floorHi,
              step: (floorHi - floorLo) / 200,
              value: offset,
              symbol: 'c',
              unit: 'J',
            }}
            value={offset}
            onChange={setOffset}
          />
        )}
      </div>

      <ReadoutRow>
        <Readout label="position" value={fmt(xp)} accent="cyan" />
        <Readout label="U here" value={`${fmt(Up)} J`} accent="orchid" />
        <Readout label="slope dU/dx" value={`${fmt(slope)} J/m`} accent="ink" />
        <Readout label="force −dU/dx" value={`${fmt(F)} N`} accent="cyan" />
        {showEnergy && (
          <Readout label="K = E − U" value={`${fmt(Math.max(0, Eshifted - Up))} J`} accent="ok" />
        )}
      </ReadoutRow>

      {caption && (
        <p
          style={{
            marginTop: 10,
            color: 'var(--color-ink-soft)',
            fontSize: '0.95rem',
            lineHeight: 1.6,
          }}
        >
          {caption}
        </p>
      )}
    </Panel>
  );
}

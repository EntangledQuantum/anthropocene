import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { splitForWork } from '../../lib/physics/work.ts';
import { mag2, type Vec2 } from '../../lib/physics/vectors.ts';
import { Button, Panel, Readout, ReadoutRow, useAnimationFrame } from './controls.tsx';

/* ── the two arrows ────────────────────────────────────────────────────────
   Chapter 6's reusable picture: a force arrow and a displacement arrow, with
   only the shared piece counting.

   The learner drags the tip of the force. The projection onto the displacement
   is drawn as a solid bar on the ground and *simultaneously* as the height of a
   rectangle on the F-vs-x panel below, on a fixed axis, so the bar and the
   rectangle are literally the same length. Two views of one number — rotate the
   force toward the vertical and watch both collapse together while the arrow
   itself stays enormous.

   Running the block sweeps the rectangle in from the left, so the work is not a
   printed number but an area that fills. The sweep is driven by writing
   attributes onto refs inside the frame loop; React state changes at ~8 Hz for
   the readouts only. Driving it through setState would re-run the effect every
   frame and reset the sweep. That has happened in this repo before.

   Reusable wherever a lesson needs "which part of this force is paying":
   gravity on a ramp (Ch. 7), the electric force along a path (Ch. 23), the
   magnetic force that famously never pays at all (Ch. 27).
   ──────────────────────────────────────────────────────────────────────── */

export interface WorkArrowsProps {
  /** Length of the displacement, in metres. */
  distance?: number;
  /** Initial force magnitude, in newtons. */
  force?: number;
  /** Initial angle of the force above the displacement, in degrees. */
  angleDeg?: number;
  /** Largest force the learner can drag out, and the full scale of the F axis. */
  maxForce?: number;
  /** Figure mode: the arrow is fixed and the block cannot be run. */
  locked?: boolean;
  /** Show the F-vs-x panel where the work is an area. */
  showArea?: boolean;
  /** Words for the story, e.g. "rope" — used in the readout labels. */
  agent?: string;
  caption?: string;
}

const PAD = { l: 56, r: 18, t: 14 };
const STAGE_H = 250;
const AREA_H = 150;
const SWEEP_SECONDS = 2.2;

const fmt = (v: number, dp = 1) => (Math.abs(v) < 0.05 ? '0' : v.toFixed(dp));

/** An arrow as a path plus a head, in screen pixels. */
function Arrow({
  x1, y1, x2, y2, color, width = 3, dash, opacity = 1, head = 9,
}: {
  x1: number; y1: number; x2: number; y2: number;
  color: string; width?: number; dash?: string; opacity?: number; head?: number;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const ux = dx / len;
  const uy = dy / len;
  const bx = x2 - ux * head;
  const by = y2 - uy * head;
  const px = -uy * head * 0.52;
  const py = ux * head * 0.52;
  return (
    <g opacity={opacity}>
      <line x1={x1} y1={y1} x2={bx} y2={by} stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" />
      <path d={`M${x2},${y2}L${bx + px},${by + py}L${bx - px},${by - py}Z`} fill={color} />
    </g>
  );
}

export default function WorkArrows({
  distance = 4,
  force = 60,
  angleDeg = 35,
  maxForce = 120,
  locked = false,
  showArea = true,
  agent = 'the force',
  caption,
}: WorkArrowsProps) {
  const initial = useMemo<Vec2>(() => {
    const th = (angleDeg * Math.PI) / 180;
    return [force * Math.cos(th), force * Math.sin(th)];
  }, [force, angleDeg]);

  const [F, setF] = useState<Vec2>(initial);
  const [width, setWidth] = useState(760);
  const [running, setRunning] = useState(false);
  const [swept, setSwept] = useState(0); // metres covered, at ~8 Hz

  useEffect(() => setF(initial), [initial]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const blockRef = useRef<SVGGElement>(null);
  const fillRef = useRef<SVGRectElement>(null);
  const sim = useRef({ s: 0, lastReadout: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  /* ── geometry ─────────────────────────────────────────────────────────── */
  const plotW = Math.max(180, width - PAD.l - PAD.r);
  const mToPx = plotW / distance;
  const nToPx = (STAGE_H * 0.62) / maxForce;
  const groundY = PAD.t + STAGE_H - 56;
  const sx = useCallback((m: number) => PAD.l + m * mToPx, [mToPx]);

  const d: Vec2 = useMemo(() => [distance, 0], [distance]);
  const split = useMemo(() => splitForWork(F, d), [F, d]);
  const magnitude = mag2(F);
  const angle = (split.angle * 180) / Math.PI;

  /* ── the sweep ────────────────────────────────────────────────────────── */
  const reset = useCallback(() => {
    sim.current.s = 0;
    setSwept(0);
    setRunning(false);
    blockRef.current?.setAttribute('transform', `translate(${sx(0)},${groundY})`);
    fillRef.current?.setAttribute('width', '0');
  }, [sx, groundY]);

  useEffect(() => {
    reset();
  }, [reset]);

  useAnimationFrame(running, (dt) => {
    const s = sim.current;
    s.s = Math.min(distance, s.s + (dt * distance) / SWEEP_SECONDS);
    blockRef.current?.setAttribute('transform', `translate(${sx(s.s)},${groundY})`);
    fillRef.current?.setAttribute('width', String(Math.max(0, s.s * mToPx)));

    const now = performance.now();
    if (now - s.lastReadout > 120 || s.s >= distance) {
      s.lastReadout = now;
      setSwept(s.s);
      if (s.s >= distance) setRunning(false);
    }
  });

  /* ── dragging the force ───────────────────────────────────────────────── */
  const [dragging, setDragging] = useState(false);
  const tipFrom = useCallback(
    (e: { clientX: number; clientY: number }): Vec2 => {
      const rect = svgRef.current!.getBoundingClientRect();
      const ax = sx(sim.current.s);
      const fx = (e.clientX - rect.left - ax) / nToPx;
      const fy = -(e.clientY - rect.top - groundY) / nToPx;
      const m = Math.hypot(fx, fy);
      // Clamp to the axis the F panel is drawn on, so the arrow and the
      // rectangle can never disagree about scale.
      const k = m > maxForce ? maxForce / m : 1;
      return [fx * k, fy * k];
    },
    [sx, nToPx, groundY, maxForce],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => setF(tipFrom(e));
    const up = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, tipFrom]);

  const nudge = (dTheta: number, dMag: number) => {
    const th = Math.atan2(F[1], F[0]) + dTheta;
    const m = Math.max(0, Math.min(maxForce, mag2(F) + dMag));
    setF([m * Math.cos(th), m * Math.sin(th)]);
  };

  /* ── screen positions ─────────────────────────────────────────────────── */
  const anchorX = sx(0);
  const tipX = anchorX + F[0] * nToPx;
  const tipY = groundY - F[1] * nToPx;
  const parX = anchorX + split.parallel[0] * nToPx;

  const positive = split.work > 0;
  const workColor = split.sign === 'zero'
    ? 'var(--color-ink-faint)'
    : positive ? 'var(--color-cyan)' : 'var(--color-magenta)';

  const areaTop = PAD.t + STAGE_H + 8;
  const areaZero = areaTop + AREA_H / 2;
  const rectH = Math.abs(split.fParallel) * ((AREA_H / 2) / maxForce);
  const rectY = positive ? areaZero - rectH : areaZero;

  const totalH = PAD.t + STAGE_H + (showArea ? AREA_H + 30 : 0);
  const workSoFar = split.fParallel * swept;

  const story =
    split.sign === 'zero'
      ? 'no energy changes hands'
      : positive
        ? 'energy goes into the block'
        : 'energy comes back out of it';

  return (
    <Panel
      title="one force, one displacement"
      right={
        !locked && (
          <span style={{ display: 'flex', gap: 8 }}>
            <Button onClick={() => (swept >= distance ? reset() : setRunning((p) => !p))} accent={running ? 'warn' : 'ok'}>
              {running ? 'pause' : swept >= distance ? 'again' : 'run it'}
            </Button>
            <Button onClick={reset} accent="iris">reset</Button>
          </span>
        )
      }
    >
      <div ref={wrapRef} style={{ width: '100%' }}>
        <svg
          ref={svgRef}
          width={width}
          height={totalH}
          style={{ display: 'block', touchAction: 'none' }}
          role="img"
          aria-label={`A block pushed along a ${distance} metre displacement by a ${fmt(magnitude)} newton force at ${fmt(angle)} degrees. The work is ${fmt(split.work)} joules.`}
        >
          {/* ground and the displacement arrow */}
          <line x1={PAD.l - 12} x2={PAD.l + plotW + 12} y1={groundY + 16} y2={groundY + 16} stroke="var(--color-rule-bright)" strokeWidth={1.5} />
          <Arrow x1={sx(0)} y1={groundY + 34} x2={sx(distance)} y2={groundY + 34} color="var(--color-aqua)" width={3} />
          <text x={sx(distance / 2)} y={groundY + 54} textAnchor="middle" fill="var(--color-aqua)" style={{ fontSize: 12.5 }}>
            displacement — {fmt(distance, 1)} m
          </text>

          {/* where it started and where it ends */}
          {[0, distance].map((m) => (
            <line key={m} x1={sx(m)} x2={sx(m)} y1={groundY - 14} y2={groundY + 22} stroke="var(--color-rule-bright)" strokeDasharray="3 4" />
          ))}

          {/* the block, moved by the frame loop */}
          <g ref={blockRef} transform={`translate(${sx(0)},${groundY})`}>
            <rect x={-19} y={-19} width={38} height={35} rx={5} fill="var(--color-raised)" stroke="var(--color-ink-faint)" strokeWidth={1.5} />
          </g>

          {/* the parallel piece, drawn on the ground where the motion is */}
          {split.sign !== 'zero' && (
            <Arrow x1={anchorX} y1={groundY - 1} x2={parX} y2={groundY - 1} color={workColor} width={9} opacity={0.5} head={12} />
          )}
          {/* the piece the displacement never sees */}
          <Arrow
            x1={parX}
            y1={groundY}
            x2={parX}
            y2={tipY}
            color="var(--color-ink-ghost)"
            width={2}
            dash="5 5"
          />

          {/* the force itself */}
          <Arrow x1={anchorX} y1={groundY} x2={tipX} y2={tipY} color="var(--color-orchid)" width={3.5} head={12} />
          <text x={tipX + 12} y={tipY - 6} fill="var(--color-orchid)" style={{ fontSize: 13 }}>
            {fmt(magnitude)} N
          </text>

          {/* the angle between them */}
          <path
            d={`M${anchorX + 40},${groundY}A40,40 0 ${split.angle > Math.PI ? 1 : 0},${F[1] >= 0 ? 0 : 1} ${anchorX + 40 * Math.cos(split.angle * (F[1] >= 0 ? 1 : -1))},${groundY - 40 * Math.sin(split.angle * (F[1] >= 0 ? 1 : -1))}`}
            fill="none"
            stroke="var(--color-ink-faint)"
            strokeWidth={1.5}
          />
          <text x={anchorX + 52} y={groundY - 46} fill="var(--color-ink-soft)" style={{ fontSize: 13 }}>
            θ = {fmt(angle, 0)}°
          </text>

          {/* the draggable tip */}
          {!locked && (
            <g>
              <circle
                cx={tipX}
                cy={tipY}
                r={dragging ? 13 : 11}
                fill="var(--color-void)"
                stroke="var(--color-orchid)"
                strokeWidth={2.5}
                style={{ cursor: 'grab' }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setRunning(false);
                  reset();
                  setDragging(true);
                }}
              />
              <circle cx={tipX} cy={tipY} r={3} fill="var(--color-orchid)" pointerEvents="none" />
              <rect
                x={tipX - 14}
                y={tipY - 14}
                width={28}
                height={28}
                fill="transparent"
                tabIndex={0}
                role="slider"
                aria-label="force direction and size"
                aria-valuenow={Math.round(angle)}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 0.25 : 0.06;
                  if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(step, 0); }
                  else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(-step, 0); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0, 6); }
                  else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(0, -6); }
                }}
                style={{ cursor: 'grab', outlineOffset: 2 }}
              />
              <text x={tipX + 12} y={tipY + 14} fill="var(--color-ink-faint)" style={{ fontSize: 11.5 }}>
                drag me
              </text>
            </g>
          )}

          {/* ── the same number as an area ──────────────────────────────── */}
          {showArea && (
            <g>
              <line x1={PAD.l} x2={PAD.l + plotW} y1={areaZero} y2={areaZero} stroke="var(--color-rule-bright)" />
              {[maxForce / 2, -maxForce / 2].map((tk) => (
                <g key={tk}>
                  <line
                    x1={PAD.l}
                    x2={PAD.l + plotW}
                    y1={areaZero - tk * ((AREA_H / 2) / maxForce)}
                    y2={areaZero - tk * ((AREA_H / 2) / maxForce)}
                    stroke="var(--color-rule)"
                  />
                  <text
                    x={PAD.l - 8}
                    y={areaZero - tk * ((AREA_H / 2) / maxForce) + 4}
                    textAnchor="end"
                    fill="var(--color-ink-faint)"
                    style={{ fontSize: 10.5, fontFamily: 'var(--font-mono, monospace)' }}
                  >
                    {tk}
                  </text>
                </g>
              ))}
              <text x={PAD.l - 8} y={areaZero + 4} textAnchor="end" fill="var(--color-ink-faint)" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono, monospace)' }}>0</text>

              {/* what the work WILL be: the outline */}
              <rect
                x={sx(0)}
                y={rectY}
                width={plotW}
                height={rectH}
                fill="none"
                stroke={workColor}
                strokeWidth={1.5}
                strokeDasharray="5 5"
              />
              {/* what it is SO FAR: filled by the frame loop */}
              <rect ref={fillRef} x={sx(0)} y={rectY} width={0} height={rectH} fill={workColor} opacity={0.32} />

              <text x={PAD.l + 6} y={areaTop + 14} fill="var(--color-ink-soft)" style={{ fontSize: 11.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                force along the motion (N) <tspan fill="var(--color-ink-ghost)">— the shaded area is the work</tspan>
              </text>
              <text x={PAD.l + plotW} y={totalH - 6} textAnchor="end" fill="var(--color-ink-ghost)" style={{ fontSize: 10.5, letterSpacing: '0.06em' }}>
                position (m)
              </text>
            </g>
          )}
        </svg>
      </div>

      <ReadoutRow>
        <Readout label="force" value={`${fmt(magnitude)} N`} accent="orchid" />
        <Readout label="angle" value={`${fmt(angle, 0)}°`} accent="ink" />
        <Readout label="along the motion" value={`${fmt(split.fParallel)} N`} accent={positive ? 'cyan' : 'magenta'} />
        <Readout label={`work by ${agent}`} value={`${fmt(split.work)} J`} accent={split.sign === 'zero' ? 'warn' : positive ? 'cyan' : 'magenta'} />
        <Readout label="work so far" value={`${fmt(workSoFar)} J`} accent="aqua" />
        <Readout label="story" value={story} mono={false} accent={split.sign === 'zero' ? 'warn' : 'ink'} />
      </ReadoutRow>

      {caption && (
        <p style={{ marginTop: 10, color: 'var(--color-ink-soft)', fontSize: '0.95rem', lineHeight: 1.6 }}>{caption}</p>
      )}
    </Panel>
  );
}

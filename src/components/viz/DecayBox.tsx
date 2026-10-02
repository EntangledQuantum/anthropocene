import { useEffect, useMemo, useRef, useState } from 'react';
import { chancePerTick, decayTicks, expectedRemaining, remainingByTick, timeToFraction } from '../../lib/physics/nuclear.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { BoxFrame, LIVE, boxLayout, paintBox } from './decay-kit-ch43.tsx';

/**
 * A sealed box of identical radioactive nuclei. Every tenth of a second each
 * live nucleus flips the same loaded coin; heads, it decays. Nothing else is
 * going on: no nucleus knows how old it is or how many have gone. Beside the
 * box, the count writes itself as the clock runs.
 *
 * With `id` and `alarmFor`, the scene grades itself: set the alarm on the
 * stopwatch for the moment that many nuclei will be left, then start the
 * clock. It runs to your alarm and stops. Physics: decayTicks /
 * timeToFraction in src/lib/physics/nuclear.ts, seeded so a run replays.
 */
export interface DecayBoxProps {
  id?: string;
  prompt?: string;
  n?: number;
  /** Half-life, seconds. */
  halfLife?: number;
  /** Length of a full run, seconds. */
  duration?: number;
  seed?: number;
  /** Graded: how many nuclei should be left when the alarm rings. */
  alarmFor?: number;
  /** Seconds of slack on the alarm. */
  tolerance?: number;
  /** Simulated seconds per real second. */
  speed?: number;
  explanation?: string;
}

const W = 640;
const DT = 0.1; // s per tick
const BOX = { x: 12, y: 12, size: 286 };
const DOT = 5.2;
const DIAL = { x: 420, y: 262, r: 54 };

export default function DecayBox({
  id, prompt, n = 200, halfLife = 10, duration = 60, seed = 21, alarmFor, tolerance = 2, speed = 4, explanation,
}: DecayBoxProps) {
  const graded = Boolean(id && alarmFor !== undefined);
  const task = useTask(graded ? id : undefined, 'decay-box');
  const H = graded ? 336 : 326;
  const T = { x0: 372, x1: 626, y0: 22, y1: graded ? 178 : 270 };
  const maxTicks = Math.round(duration / DT);

  const [run, setRun] = useState(seed);
  const ticks = useMemo(() => decayTicks(n, chancePerTick(halfLife / DT), maxTicks, run), [n, halfLife, maxTicks, run]);
  const left = useMemo(() => remainingByTick(ticks, maxTicks), [ticks, maxTicks]);
  const decayedAt = useMemo(() => ticks.map((k) => k * DT), [ticks]);
  const pos = useMemo(() => boxLayout(n, BOX), [n]);
  const truth = alarmFor !== undefined ? timeToFraction(alarmFor / n, halfLife) : 0;

  const [alarm, setAlarm] = useState(15);
  const [shown, setShown] = useState({ t: 0, left: n, running: false });
  const simT = useRef(0);
  const running = useRef(false);
  const stopAt = useRef(duration);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const flashes = useRef<(SVGCircleElement | null)[]>([]);
  const trace = useRef<SVGPolylineElement>(null);
  const hand = useRef<SVGLineElement>(null);
  const onStop = useRef<() => void>(() => {});
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const tx = (t: number) => T.x0 + (t / duration) * (T.x1 - T.x0);
  const ty = (c: number) => T.y1 - (c / n) * (T.y1 - T.y0);
  const ang = (t: number) => (t / 60) * 2 * Math.PI;

  // Grading fires when the run reaches the alarm; keep the latest closure.
  onStop.current = () => {
    if (!graded) return;
    task.check(Math.abs(alarm - truth) <= tolerance, { alarm, left: left[Math.round(alarm / DT)] });
  };

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (running.current) {
        simT.current += dt * speed;
        if (simT.current >= stopAt.current) {
          simT.current = stopAt.current;
          running.current = false;
          onStop.current();
        }
      }
      const t = simT.current;
      const k = Math.min(maxTicks, Math.floor(t / DT + 1e-9));
      paintBox(dots.current, flashes.current, decayedAt, t, 0.4 * speed, DOT);
      if (trace.current) {
        const pts: string[] = [];
        for (let i = 0; i <= k; i++) pts.push(`${tx(i * DT).toFixed(1)},${ty(left[i]).toFixed(1)}`);
        trace.current.setAttribute('points', pts.join(' '));
      }
      if (hand.current) {
        const a = ang(t);
        hand.current.setAttribute('x2', String(DIAL.x + Math.sin(a) * (DIAL.r - 8)));
        hand.current.setAttribute('y2', String(DIAL.y - Math.cos(a) * (DIAL.r - 8)));
      }
      if (now - lastShown > 120) {
        lastShown = now;
        setShown({ t, left: left[k], running: running.current });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [decayedAt, left, maxTicks, speed]);

  const reset = () => { running.current = false; simT.current = 0; };
  const start = () => {
    if (simT.current >= stopAt.current - 1e-9) simT.current = 0;
    stopAt.current = graded ? alarm : duration;
    running.current = true;
  };
  const setAlarmFrom = (clientX: number, clientY: number) => {
    const el = svg.current;
    if (!el) return;
    const p = new DOMPoint(clientX, clientY).matrixTransform(el.getScreenCTM()!.inverse());
    let a = Math.atan2(p.x - DIAL.x, -(p.y - DIAL.y));
    if (a < 0) a += 2 * Math.PI;
    moveAlarm((a / (2 * Math.PI)) * 60);
  };
  const moveAlarm = (s: number) => {
    setAlarm(Math.min(59.5, Math.max(0.5, Math.round(s * 2) / 2)));
    reset();
    task.touch();
  };

  const kAlarm = Math.round(alarm / DT);
  const expected = Math.round(expectedRemaining(n, alarm, halfLife));
  const aA = ang(alarm);

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {!graded && <>
            <button type="button" className="anth-btn" onClick={() => { if (running.current) running.current = false; else start(); }}>
              {shown.running ? 'Pause' : shown.t > 0 && shown.t < duration ? 'Resume' : 'Start the clock'}
            </button>
            <button type="button" className="anth-btn" onClick={() => { reset(); setRun((r) => r + 1); }}>New box</button>
          </>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Clock" value={shown.t.toFixed(1)} unit="s" />
            <Meter label="Nuclei left" value={String(shown.left)} unit={`of ${n}`} color={LIVE} />
            {graded && <Meter label="Alarm" value={alarm.toFixed(1)} unit="s" color="var(--color-accent)" />}
          </span>
        </div>
        {graded && <CheckBar label="Start the clock" verdict={task.verdict} done={task.done} onCheck={start} disabled={shown.running}
          miss={`At ${alarm.toFixed(1)} s about ${expected} of ${n} are still expected (this box: ${left[kAlarm]}), not ${alarmFor}.`}
          hit={explanation} />}
      </div>}>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" style={{ width: '100%', display: 'block', touchAction: 'none', userSelect: 'none', fontFamily: 'var(--font-sans)' }}
        aria-label={`Box of ${n} nuclei with a half-life of ${halfLife} seconds. At ${shown.t.toFixed(1)} seconds, ${shown.left} are left.`}
        onPointerMove={(e) => { if (dragging.current) setAlarmFrom(e.clientX, e.clientY); }}
        onPointerUp={() => { dragging.current = false; }}>
        <BoxFrame box={BOX} label={`${n} nuclei · half-life ${halfLife} s · each one a coin flipped every ${DT} s`} />
        {pos.map(([x, y], i) => <g key={i}>
          <circle ref={(el) => { flashes.current[i] = el; }} cx={x} cy={y} r={DOT} fill="none" stroke={C.energy} strokeWidth={2} opacity={0} />
          <circle ref={(el) => { dots.current[i] = el; }} cx={x} cy={y} r={DOT} fill={LIVE} stroke={LIVE} strokeWidth={1.4} />
        </g>)}

        {/* the count, writing itself */}
        {[0, 50, 100, 150, 200].filter((c) => c <= n).map((c) => <g key={c}>
          <line x1={T.x0} x2={T.x1} y1={ty(c)} y2={ty(c)} stroke={C.grid} />
          <text x={T.x0 - 6} y={ty(c) + 4} textAnchor="end" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{c}</text>
        </g>)}
        {Array.from({ length: Math.floor(duration / 10) + 1 }, (_, i) => i * 10).map((t) => <g key={t}>
          <line x1={tx(t)} x2={tx(t)} y1={T.y0} y2={T.y1} stroke={C.grid} />
          <text x={tx(t)} y={T.y1 + 16} textAnchor="middle" fontSize={12} fill={C.faint} fontFamily="var(--font-mono)">{t}</text>
        </g>)}
        <text x={T.x0 + 4} y={T.y0 - 8} fontSize={13} fill={C.soft}>nuclei left</text>
        <text x={T.x1} y={T.y1 + 32} textAnchor="end" fontSize={13} fill={C.soft}>time (s)</text>
        {graded && alarmFor !== undefined && <g>
          <line x1={T.x0} x2={T.x1} y1={ty(alarmFor)} y2={ty(alarmFor)} stroke="var(--color-accent)" strokeDasharray="5 5" />
          <text x={T.x1 - 4} y={ty(alarmFor) - 6} textAnchor="end" fontSize={12} fill="var(--color-accent)">{alarmFor} left</text>
        </g>}
        <polyline ref={trace} fill="none" stroke={LIVE} strokeWidth={2.5} />

        {/* the stopwatch */}
        {graded && <g>
          <circle cx={DIAL.x} cy={DIAL.y} r={DIAL.r} fill="var(--color-raised)" stroke={C.soft} strokeWidth={2} />
          <rect x={DIAL.x - 7} y={DIAL.y - DIAL.r - 12} width={14} height={10} rx={2} fill={C.soft} />
          {Array.from({ length: 12 }, (_, i) => i * 5).map((s) => {
            const a = ang(s), big = s % 10 === 0;
            return <g key={s}>
              <line x1={DIAL.x + Math.sin(a) * (DIAL.r - (big ? 9 : 5))} y1={DIAL.y - Math.cos(a) * (DIAL.r - (big ? 9 : 5))}
                x2={DIAL.x + Math.sin(a) * DIAL.r} y2={DIAL.y - Math.cos(a) * DIAL.r} stroke={C.faint} strokeWidth={1.5} />
              {big && <text x={DIAL.x + Math.sin(a) * (DIAL.r - 19)} y={DIAL.y - Math.cos(a) * (DIAL.r - 19) + 4} textAnchor="middle"
                fontSize={11} fill={C.faint} fontFamily="var(--font-mono)">{s}</text>}
            </g>;
          })}
          <line ref={hand} x1={DIAL.x} y1={DIAL.y} x2={DIAL.x} y2={DIAL.y - DIAL.r + 8} stroke={C.ink} strokeWidth={2} strokeLinecap="round" />
          <line x1={DIAL.x} y1={DIAL.y} x2={DIAL.x + Math.sin(aA) * (DIAL.r + 2)} y2={DIAL.y - Math.cos(aA) * (DIAL.r + 2)}
            stroke="var(--color-accent)" strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={DIAL.x} cy={DIAL.y} r={4} fill={C.ink} />
          <g style={{ cursor: 'grab' }} tabIndex={0} role="slider" aria-label="Alarm hand: drag around the dial"
            aria-valuemin={0.5} aria-valuemax={59.5} aria-valuenow={alarm} aria-valuetext={`${alarm.toFixed(1)} seconds`}
            onPointerDown={(e) => { dragging.current = true; svg.current?.setPointerCapture(e.pointerId); }}
            onKeyDown={(e) => {
              const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
              if (!d) return;
              e.preventDefault();
              moveAlarm(alarm + d * (e.shiftKey ? 5 : 0.5));
            }}>
            <circle cx={DIAL.x + Math.sin(aA) * (DIAL.r + 10)} cy={DIAL.y - Math.cos(aA) * (DIAL.r + 10)} r={18} fill="transparent" />
            <circle cx={DIAL.x + Math.sin(aA) * (DIAL.r + 10)} cy={DIAL.y - Math.cos(aA) * (DIAL.r + 10)} r={8}
              fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth={2.5} />
          </g>
          <text x={DIAL.x + DIAL.r + 30} y={DIAL.y - 8} fontSize={13} fill="var(--color-accent)">alarm: {alarm.toFixed(1)} s</text>
        </g>}
      </svg>
    </SceneCard>
  );
}

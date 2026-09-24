import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { SHAFT_TOP, piecewiseTrip, recentVelocity, worldlineGap } from '../../lib/physics/line-motion.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { drawShaft, local, prep, readColors, shaftFrame, traceAxes, type Colors } from './line-canvas.ts';

/**
 * Hold the lift car and move it with your own hand. The clock starts when you
 * grab it, and a pen writes the car's height against time to the right. The
 * floors run straight across into the graph, so the pen is always level with
 * the car: the trace is not a picture of the trip, it is the trip, written
 * down one instant at a time.
 *
 * With `id` and `target` it grades itself: act out the dashed trip, within a
 * root-mean-square gap of `tolerance` metres (`worldlineGap`).
 */
export interface DragTheLiftProps {
  id?: string;
  prompt?: string;
  /** The trip to act out: (time s, floor) corners, joined by straight lines. */
  target?: [number, number][];
  duration?: number;
  tolerance?: number;
  explanation?: string;
}

export default function DragTheLift({ id, prompt, target, duration = 10, tolerance = 1.5, explanation }: DragTheLiftProps) {
  const graded = Boolean(id && target);
  const task = useTask(graded ? id : undefined, 'drag-the-lift');
  const want = useMemo(() => (target ? piecewiseTrip(target) : null), [target]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const startY = want ? want(0) : 0;
  const hand = useRef(startY);
  const holding = useRef(false);
  const sim = useRef({ t: 0, running: false, finished: false, run: [] as { t: number; y: number }[] });
  const [shown, setShown] = useState({ t: 0, y: startY, v: 0, running: false, finished: false });

  const reset = () => {
    hand.current = startY;
    sim.current = { t: 0, running: false, finished: false, run: [] };
    setShown({ t: 0, y: startY, v: 0, running: false, finished: false });
    task.touch();
  };

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const c = readColors();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const s = sim.current;
      if (s.running) {
        s.t = Math.min(duration, s.t + dt);
        s.run.push({ t: s.t, y: hand.current });
        if (s.t >= duration) { s.running = false; s.finished = true; }
      }
      if (canvas.current) draw(canvas.current, c);
      if (now - lastShown > 120) {
        lastShown = now;
        setShown({ t: s.t, y: hand.current, v: s.running ? recentVelocity(s.run) : 0, running: s.running, finished: s.finished });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const draw = (el: HTMLCanvasElement, c: Colors) => {
    const { g, W, H } = prep(el);
    const sh = shaftFrame(H);
    const left = 150, right = W - 14;
    drawShaft(g, sh, hand.current, c, right);
    const tx = traceAxes(g, sh, left, right, 0, duration, 1, c);
    if (want) {
      g.setLineDash([6, 6]); g.strokeStyle = c.soft; g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i <= 200; i++) { const t = (duration * i) / 200; i ? g.lineTo(tx(t), sh.yOf(want(t))) : g.moveTo(tx(t), sh.yOf(want(t))); }
      g.stroke(); g.setLineDash([]);
    }
    const s = sim.current;
    // the pen: level with the car, at the current instant
    g.strokeStyle = c.grid; g.lineWidth = 1;
    g.beginPath(); g.moveTo(sh.x1 + 4, sh.yOf(hand.current)); g.lineTo(tx(s.t), sh.yOf(hand.current)); g.stroke();
    if (s.run.length > 1) {
      g.strokeStyle = c.x; g.lineWidth = 3; g.lineJoin = 'round';
      g.beginPath(); s.run.forEach((p, i) => (i ? g.lineTo(tx(p.t), sh.yOf(p.y)) : g.moveTo(tx(p.t), sh.yOf(p.y)))); g.stroke();
    }
    g.fillStyle = c.x; g.beginPath(); g.arc(tx(s.t), sh.yOf(hand.current), 5, 0, Math.PI * 2); g.fill();
  };

  const move = (h: number) => {
    const s = sim.current;
    if (s.finished) return;
    if (!s.running) s.running = true;
    hand.current = h;
    task.touch();
  };

  const onPointer = (e: RPointerEvent<HTMLCanvasElement>, kind: 'down' | 'move' | 'up') => {
    const el = canvas.current!;
    const { px, py } = local(el, e);
    const sh = shaftFrame(el.clientHeight);
    if (kind === 'down' && px < sh.x1 + 30) { holding.current = true; el.setPointerCapture(e.pointerId); }
    if (kind === 'up') { holding.current = false; return; }
    if (holding.current) move(sh.hOf(py));
  };

  const gap = want ? worldlineGap(sim.current.run, want) : null;
  const hitNow = graded && shown.finished && gap !== null && gap.rms <= tolerance;
  const miss = !shown.finished
    ? shown.running ? `The clock is still running: ${shown.t.toFixed(1)} s of ${duration}.` : 'The clock has not started. It starts when you grab the car.'
    : `Your trace is ${gap!.rms.toFixed(1)} m off the dashed trip on average. Worst at t = ${gap!.worst.t.toFixed(1)} s: the car was at ${gap!.worst.y.toFixed(1)} m and the trip says ${gap!.worst.want.toFixed(1)} m.`;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={reset}>Start over</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Clock" value={shown.t.toFixed(1)} unit={`s of ${duration}`} />
            <Meter label="Height" value={shown.y.toFixed(1)} unit="m" color={C.position} />
            <Meter label="Velocity" value={shown.v.toFixed(1)} unit="m/s" color={C.velocity} />
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(hitNow, { rms: gap?.rms })} miss={miss} hit={explanation} />}
      </div>}>
      <canvas ref={canvas} tabIndex={0} style={{ width: '100%', height: 360, display: 'block', touchAction: 'none', cursor: 'grab' }}
        aria-label={`Lift car at ${shown.y.toFixed(1)} metres; clock ${shown.t.toFixed(1)} seconds. Arrow keys move the car.`}
        onPointerDown={(e) => onPointer(e, 'down')} onPointerMove={(e) => onPointer(e, 'move')}
        onPointerUp={(e) => onPointer(e, 'up')} onPointerCancel={(e) => onPointer(e, 'up')}
        onKeyDown={(e) => {
          const d = e.key === 'ArrowUp' ? 0.5 : e.key === 'ArrowDown' ? -0.5 : 0;
          if (!d) return;
          e.preventDefault();
          move(Math.max(0, Math.min(SHAFT_TOP, hand.current + d)));
        }} />
    </SceneCard>
  );
}

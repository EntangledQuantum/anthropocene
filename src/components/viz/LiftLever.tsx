import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { FLOOR_M, LEVER_VMAX, SHAFT_TOP, leverVelocity, stepHeight } from '../../lib/physics/line-motion.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { arrow, drawShaft, local, prep, readColors, shaftFrame, text, type Colors } from './line-canvas.ts';

/**
 * A lift with a lever. The lever is the velocity, and it stays where you leave
 * it: nothing brings the car to rest except you, bringing the lever back to
 * the middle. The trace beside it is the velocity you held, and the shaded
 * area under it is exactly the height the car gained, because the height is
 * integrated from that same lever history (`stepHeight`, the trapezoid rule
 * `accumulate` uses).
 *
 * With `id` and `park` set it grades itself: stop at that floor, at rest,
 * after (optionally) visiting `visit` first.
 */
export interface LiftLeverProps {
  id?: string;
  prompt?: string;
  startFloor?: number;
  /** Floor to stop at. */
  park?: number;
  /** A floor the car must reach before parking. */
  visit?: number;
  explanation?: string;
}

const SPAN = 30; // seconds of trace on screen
const TOL = 0.25; // metres from the floor line: doors open

export default function LiftLever({ id, prompt, startFloor = 0, park, visit, explanation }: LiftLeverProps) {
  const graded = Boolean(id && park !== undefined);
  const task = useTask(graded ? id : undefined, 'lift-lever');
  const canvas = useRef<HTMLCanvasElement>(null);
  const lever = useRef(0);
  const grab = useRef(false);
  const sim = useRef({ t: 0, y: startFloor * FLOOR_M, v: 0, cable: 0, maxY: startFloor * FLOOR_M, running: false, trace: [] as { t: number; v: number }[] });
  const [shown, setShown] = useState({ y: startFloor * FLOOR_M, v: 0, cable: 0, maxY: startFloor * FLOOR_M });

  const reset = () => {
    lever.current = 0;
    sim.current = { t: 0, y: startFloor * FLOOR_M, v: 0, cable: 0, maxY: startFloor * FLOOR_M, running: false, trace: [] };
    setShown({ y: startFloor * FLOOR_M, v: 0, cable: 0, maxY: startFloor * FLOOR_M });
    task.touch();
  };

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const c = readColors();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const s = sim.current;
      const want = leverVelocity(lever.current);
      if (!s.running && want !== 0) s.running = true;
      if (s.running) {
        const y = stepHeight(s.y, s.v, want, dt);
        // Against the roof or the pit the car is stopped, whatever the lever says.
        const v = (y === 0 && want < 0) || (y >= SHAFT_TOP && want > 0) ? 0 : want;
        s.cable += Math.abs(y - s.y);
        s.y = y; s.v = v; s.t += dt;
        s.maxY = Math.max(s.maxY, y);
        s.trace.push({ t: s.t, v });
        if (s.trace.length > 4000) s.trace.splice(0, s.trace.length - 4000);
      }
      if (canvas.current) draw(canvas.current, c);
      if (now - lastShown > 120) { lastShown = now; setShown({ y: s.y, v: s.v, cable: s.cable, maxY: s.maxY }); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const geo = (H: number) => {
    const sh = shaftFrame(H);
    const mid = (sh.top + sh.bot) / 2, half = (sh.bot - sh.top) / 2 - 16;
    return { sh, lx: 150, mid, half, left: 232 };
  };

  const draw = (el: HTMLCanvasElement, c: Colors) => {
    const { g, W, H } = prep(el);
    const { sh, lx, mid, half, left } = geo(H);
    const s = sim.current;
    drawShaft(g, sh, s.y, c);
    if (park !== undefined) text(g, 'park', sh.x1 + 6, sh.yOf(park * FLOOR_M) - 4, c.ink, 'left', 12, 600);
    if (visit !== undefined) text(g, 'visit', sh.x1 + 6, sh.yOf(visit * FLOOR_M) - 4, c.ink, 'left', 12, 600);

    // the lever: up is up
    g.strokeStyle = c.rule; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(lx, mid - half); g.lineTo(lx, mid + half); g.stroke();
    g.strokeStyle = c.grid; g.lineWidth = 1;
    g.beginPath(); g.moveTo(lx - 14, mid); g.lineTo(lx + 14, mid); g.stroke();
    text(g, 'up', lx + 18, mid - half + 4, c.faint, 'left', 12);
    text(g, 'stop', lx + 18, mid + 4, c.faint, 'left', 12);
    text(g, 'down', lx + 18, mid + half + 4, c.faint, 'left', 12);
    const ky = mid - lever.current * half;
    g.fillStyle = c.surf; g.strokeStyle = c.v; g.lineWidth = 3;
    g.beginPath(); g.arc(lx, ky, 11, 0, Math.PI * 2); g.fill(); g.stroke();
    if (s.v !== 0) arrow(g, sh.x1 + 16, sh.yOf(s.y) - 20, sh.x1 + 16, sh.yOf(s.y) - 20 - s.v * 9, c.v);

    // the trace: velocity against time, area shaded
    const right = W - 14, vmax = LEVER_VMAX * 1.2;
    const vy = (v: number) => mid - (v / vmax) * (sh.bot - sh.top) / 2;
    const t1 = Math.max(SPAN, s.t), t0 = t1 - SPAN;
    const tx = (t: number) => left + ((t - t0) / SPAN) * (right - left);
    for (let v = -3; v <= 3; v++) {
      g.strokeStyle = v === 0 ? c.rule : c.grid; g.lineWidth = v === 0 ? 1.4 : 1;
      g.beginPath(); g.moveTo(left, vy(v)); g.lineTo(right, vy(v)); g.stroke();
      text(g, v < 0 ? `−${-v}` : String(v), left - 6, vy(v) + 4, c.faint, 'right', 12, 400, true);
    }
    for (let t = Math.ceil(t0 / 5) * 5; t <= t1 + 1e-9; t += 5) text(g, String(t), tx(t), sh.bot + 18, c.faint, 'center', 12, 400, true);
    text(g, 'velocity (m/s)', left + 4, sh.top - 8, c.faint, 'left', 13);
    text(g, 'time (s)', right, sh.bot - 7, c.faint, 'right', 13);

    const pts = s.trace.filter((p) => p.t >= t0);
    if (pts.length > 1) {
      for (const [sign, alpha] of [[1, 0.34], [-1, 0.16]] as const) {
        g.globalAlpha = alpha; g.fillStyle = c.x;
        g.beginPath(); g.moveTo(tx(pts[0].t), vy(0));
        for (const p of pts) g.lineTo(tx(p.t), vy(sign * p.v > 0 ? p.v : 0));
        g.lineTo(tx(pts[pts.length - 1].t), vy(0)); g.closePath(); g.fill();
      }
      g.globalAlpha = 1; g.strokeStyle = c.v; g.lineWidth = 2.5;
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(tx(p.t), vy(p.v)) : g.moveTo(tx(p.t), vy(p.v)))); g.stroke();
    }
    text(g, 'shaded: area under the line', right, sh.top - 8, c.x, 'right', 12);
  };

  const onPointer = (e: RPointerEvent<HTMLCanvasElement>, kind: 'down' | 'move' | 'up') => {
    const el = canvas.current!;
    const { px, py } = local(el, e);
    const { lx, mid, half } = geo(el.clientHeight);
    if (kind === 'down' && Math.abs(px - lx) < 44) { grab.current = true; el.setPointerCapture(e.pointerId); }
    if (kind === 'up') grab.current = false;
    if (grab.current && kind !== 'up') {
      lever.current = Math.max(-1, Math.min(1, (mid - py) / half));
      task.touch();
    }
  };

  const off = park !== undefined ? shown.y - park * FLOOR_M : 0;
  const visited = visit === undefined || shown.maxY >= visit * FLOOR_M - TOL;
  const hitNow = graded && shown.v === 0 && Math.abs(off) <= TOL && visited;
  const floorNow = (shown.y / FLOOR_M).toFixed(1);
  const miss = shown.v !== 0
    ? `The car is still moving at ${Math.abs(shown.v).toFixed(1)} m/s ${shown.v > 0 ? 'up' : 'down'}.`
    : !visited
      ? `The car has been no higher than ${shown.maxY.toFixed(1)} m, floor ${(shown.maxY / FLOOR_M).toFixed(1)}. It has not visited floor ${visit}.`
      : `The car's floor is ${Math.abs(off).toFixed(1)} m ${off > 0 ? 'above' : 'below'} floor ${park}. The doors stay shut.`;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={reset}>Start over</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Meter label="Height" value={`${shown.y.toFixed(1)}`} unit={`m · floor ${floorNow}`} color={C.position} />
            <Meter label="Velocity" value={shown.v.toFixed(1)} unit="m/s" color={C.velocity} />
            <Meter label="Cable run" value={shown.cable.toFixed(1)} unit="m" />
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(hitNow, { y: shown.y, cable: shown.cable })} miss={miss} hit={explanation} />}
      </div>}>
      <canvas ref={canvas} tabIndex={0} style={{ width: '100%', height: 360, display: 'block', touchAction: 'none', cursor: 'ns-resize' }}
        aria-label={`Lift at ${shown.y.toFixed(1)} metres, moving at ${shown.v.toFixed(1)} metres per second. Lever: arrow keys.`}
        onPointerDown={(e) => onPointer(e, 'down')} onPointerMove={(e) => onPointer(e, 'move')}
        onPointerUp={(e) => onPointer(e, 'up')} onPointerCancel={(e) => onPointer(e, 'up')}
        onKeyDown={(e) => {
          const d = e.key === 'ArrowUp' ? 0.1 : e.key === 'ArrowDown' ? -0.1 : 0;
          if (!d) return;
          e.preventDefault();
          lever.current = Math.max(-1, Math.min(1, Math.round((lever.current + d) * 10) / 10));
          task.touch();
        }} />
    </SceneCard>
  );
}

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { brakeOutcome, brakeRun, stoppingDistance } from '../../lib/physics/line-motion.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { local, prep, readColors, text, type Colors } from './line-canvas.ts';

/**
 * A car at a fixed speed, a stop line, and one thing to choose: where the
 * driver hits the brakes. Drag the amber post, then drive. Braking is constant
 * deceleration, so the speed trace underneath comes down as a straight line
 * and the shaded triangle under it is the braking distance.
 *
 * `reference` draws the triangle of a slower car braking at the same moment:
 * twice the speed is a triangle twice as tall and twice as long.
 * Physics: `brakeRun` / `brakeOutcome` from line-motion.ts, exact.
 */
export interface BrakeToTheLineProps {
  id?: string;
  prompt?: string;
  /** m/s */
  speed: number;
  /** m/s², braking */
  decel?: number;
  /** Distance of the stop line from where the car starts, m. */
  lineAt?: number;
  /** Where the brake post starts, in metres before the line. */
  brakeBefore?: number;
  /** A slower car's stop, drawn for comparison, m/s. */
  reference?: number;
  /** Stop within this many metres short of the line. */
  tolerance?: number;
  explanation?: string;
}

const kmh = (v: number) => Math.round(v * 3.6);

export default function BrakeToTheLine({
  id, prompt, speed, decel = 7.5, lineAt = 90, brakeBefore = 15, reference, tolerance = 2, explanation,
}: BrakeToTheLineProps) {
  const task = useTask(id, 'brake-to-the-line');
  const canvas = useRef<HTMLCanvasElement>(null);
  const [before, setBefore] = useState(brakeBefore);
  const beforeRef = useRef(before);
  beforeRef.current = before;
  const drive = useRef<{ t0: number; on: boolean; t: number }>({ t0: 0, on: false, t: 0 });
  const holding = useRef(false);
  const [ran, setRan] = useState<null | { gap: number; crossSpeed: number; stopX: number; brakeAt: number }>(null);
  const [shownV, setShownV] = useState(speed);

  const run = () => brakeRun(speed, decel, lineAt - beforeRef.current);
  const Tmax = lineAt / speed + speed / decel + 0.4;

  useEffect(() => {
    let raf = 0, lastShown = 0;
    const c = readColors();
    const frame = (now: number) => {
      const d = drive.current;
      if (d.on) {
        d.t = (now - d.t0) / 1000;
        const r = run();
        if (d.t >= r.tStop + 0.3) {
          d.on = false; d.t = r.tStop;
          const brakeAt = lineAt - beforeRef.current;
          setRan({ ...brakeOutcome(speed, decel, brakeAt, lineAt), brakeAt });
        }
      }
      if (canvas.current) draw(canvas.current, c);
      if (now - lastShown > 120) { lastShown = now; setShownV(run().at(d.t).v); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const geo = (W: number) => {
    const x0 = 24, x1 = W - 20, span = lineAt + 48;
    return { road: 78, rx: (x: number) => x0 + ((x + 4) / (span + 4)) * (x1 - x0) };
  };

  const draw = (el: HTMLCanvasElement, c: Colors) => {
    const { g, W, H } = prep(el);
    const { road, rx } = geo(W);
    const r = run(), d = drive.current, st = r.at(d.t);
    const brakeAt = lineAt - beforeRef.current;
    // the road, marked in metres before the line
    g.strokeStyle = c.rule; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, road); g.lineTo(W, road); g.stroke();
    for (let m = 0; m <= lineAt; m += 5) {
      const x = rx(lineAt - m);
      g.strokeStyle = c.grid; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, road); g.lineTo(x, road + (m % 10 ? 5 : 9)); g.stroke();
      if (m % 10 === 0 && m > 0) text(g, `${m}`, x, road + 22, c.faint, 'center', 12, 400, true);
    }
    text(g, 'metres before the line', rx(lineAt) - 8, road + 38, c.faint, 'right', 12);
    // the stop line and the crossing beyond it
    g.fillStyle = c.ink; g.fillRect(rx(lineAt) - 2, road - 34, 4, 34);
    g.globalAlpha = 0.25;
    for (let k = 0; k < 4; k++) g.fillRect(rx(lineAt + 3 + k * 2.2), road - 30, rx(1.1) - rx(0), 26);
    g.globalAlpha = 1;
    // the brake post
    const bx = rx(brakeAt);
    g.strokeStyle = c.f; g.lineWidth = 3;
    g.beginPath(); g.moveTo(bx, road); g.lineTo(bx, road - 52); g.stroke();
    g.fillStyle = c.f; g.beginPath(); g.moveTo(bx, road - 52); g.lineTo(bx + 16, road - 46); g.lineTo(bx, road - 40); g.fill();
    text(g, `brake here: ${beforeRef.current.toFixed(1)} m before`, bx, road - 58, c.f, bx > W * 0.7 ? 'right' : 'left', 12, 600);
    // the car: its front bumper is at x
    // drawn a little longer than a real car so it reads; the front bumper is exact
    const cxF = rx(st.x), cl = Math.max(34, rx(6) - rx(0));
    g.fillStyle = c.surf; g.strokeStyle = c.ink; g.lineWidth = 2;
    g.beginPath(); g.rect(cxF - cl, road - 20, cl, 13); g.fill(); g.stroke();
    g.beginPath(); g.rect(cxF - cl * 0.78, road - 31, cl * 0.5, 11); g.fill(); g.stroke();
    for (const w of [0.2, 0.8]) { g.beginPath(); g.arc(cxF - cl * w, road - 6, 5.5, 0, Math.PI * 2); g.fillStyle = c.ink; g.fill(); }
    if (st.braking) { g.fillStyle = c.warn; g.fillRect(cxF - cl - 4, road - 18, 4, 6); }

    // the trace: speed against time, braking shaded
    const top = 176, bot = H - 30, left = 50, right = W - 16;
    const vTop = Math.max(speed, reference ?? 0) * 1.15;
    const tx = (t: number) => left + (t / Tmax) * (right - left);
    const vy = (v: number) => bot - (v / vTop) * (bot - top);
    const vStep = vTop > 25 ? 10 : 5;
    for (let v = 0; v <= vTop; v += vStep) {
      g.strokeStyle = v ? c.grid : c.rule; g.lineWidth = 1;
      g.beginPath(); g.moveTo(left, vy(v)); g.lineTo(right, vy(v)); g.stroke();
      text(g, String(v), left - 6, vy(v) + 4, c.faint, 'right', 12, 400, true);
    }
    for (let t = 0; t <= Tmax; t += 1) text(g, String(t), tx(t), bot + 17, c.faint, 'center', 12, 400, true);
    text(g, 'speed (m/s)', left + 4, top - 8, c.faint, 'left', 13);
    text(g, 'time (s)', right, bot - 7, c.faint, 'right', 13);
    if (reference) {
      const tr = reference / decel;
      g.setLineDash([5, 5]); g.strokeStyle = c.soft; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(tx(r.tBrake), vy(0)); g.lineTo(tx(r.tBrake), vy(reference)); g.lineTo(tx(r.tBrake + tr), vy(0)); g.closePath(); g.stroke();
      g.setLineDash([]);
      text(g, `${reference} m/s stops in ${stoppingDistance(reference, decel).toFixed(0)} m`, tx(r.tBrake) + 6, vy(reference) - 6, c.soft, 'left', 12, 400, false, c.surf);
    }
    if (d.t > 0) {
      const n = 120, pts: [number, number][] = [];
      for (let i = 0; i <= n; i++) { const t = (d.t * i) / n; pts.push([t, r.at(t).v]); }
      if (d.t > r.tBrake) {
        g.globalAlpha = 0.3; g.fillStyle = c.x; g.beginPath(); g.moveTo(tx(r.tBrake), vy(0));
        for (const [t, v] of pts) if (t >= r.tBrake) g.lineTo(tx(t), vy(v));
        g.lineTo(tx(d.t), vy(0)); g.closePath(); g.fill(); g.globalAlpha = 1;
      }
      g.strokeStyle = c.v; g.lineWidth = 2.5;
      g.beginPath(); pts.forEach(([t, v], i) => (i ? g.lineTo(tx(t), vy(v)) : g.moveTo(tx(t), vy(v)))); g.stroke();
      if (!d.on && d.t >= r.tStop - 1e-6) text(g, `braked over ${stoppingDistance(speed, decel).toFixed(1)} m`, tx(r.tBrake + 0.5 * (speed / decel)), vy(speed * 0.3), c.ink, 'center', 13, 600, false, c.surf);
    }
  };

  const onPointer = (e: RPointerEvent<HTMLCanvasElement>, kind: 'down' | 'move' | 'up') => {
    const el = canvas.current!;
    const { px, py } = local(el, e);
    const { road, rx } = geo(el.clientWidth);
    if (kind === 'down' && py < road + 44 && !drive.current.on) { holding.current = true; el.setPointerCapture(e.pointerId); }
    if (kind === 'up') { holding.current = false; return; }
    if (holding.current) {
      const x = ((px - rx(0)) / (rx(1) - rx(0)));
      setPost(lineAt - x);
    }
  };
  const setPost = (b: number) => {
    const v = Math.round(Math.max(0, Math.min(lineAt - 5, b)) * 2) / 2;
    setBefore(v); beforeRef.current = v;
    drive.current = { t0: 0, on: false, t: 0 };
    setRan(null); task.touch();
  };
  const go = () => { drive.current = { t0: performance.now(), on: true, t: 0 }; setRan(null); task.touch(); };

  const hitNow = ran !== null && ran.gap >= 0 && ran.gap <= tolerance;
  const miss = ran === null
    ? 'Drive first, then check.'
    : ran.gap < 0
      ? `The car crossed the line still doing ${ran.crossSpeed.toFixed(1)} m/s (${kmh(ran.crossSpeed)} km/h) and stopped ${(-ran.gap).toFixed(1)} m past it.`
      : `The car stopped ${ran.gap.toFixed(1)} m short of the line.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={go} disabled={drive.current.on}>Drive</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Speed" value={shownV.toFixed(1)} unit={`m/s · ${kmh(shownV)} km/h`} color={C.velocity} />
            <Meter label="Braking" value={decel.toFixed(1)} unit="m/s²" color={C.accel} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(hitNow, { before })} miss={miss} hit={explanation} />}
        {!id && ran && <p style={{ margin: 0, color: ran.gap < 0 ? C.warn : C.soft, fontSize: '0.98rem' }}>{ran.gap < 0 ? `Crossed the line at ${ran.crossSpeed.toFixed(1)} m/s (${kmh(ran.crossSpeed)} km/h), stopped ${(-ran.gap).toFixed(1)} m past it.` : `Stopped ${ran.gap.toFixed(1)} m short of the line.`}</p>}
      </div>}>
      <canvas ref={canvas} tabIndex={0} style={{ width: '100%', height: 380, display: 'block', touchAction: 'none', cursor: 'ew-resize' }}
        aria-label={`Car at ${speed} metres per second. Brake post ${before.toFixed(1)} metres before the line. Arrow keys move the post.`}
        onPointerDown={(e) => onPointer(e, 'down')} onPointerMove={(e) => onPointer(e, 'move')}
        onPointerUp={(e) => onPointer(e, 'up')} onPointerCancel={(e) => onPointer(e, 'up')}
        onKeyDown={(e) => {
          const d = e.key === 'ArrowLeft' ? 0.5 : e.key === 'ArrowRight' ? -0.5 : 0;
          if (!d || drive.current.on) return;
          e.preventDefault();
          setPost(beforeRef.current + d);
        }} />
    </SceneCard>
  );
}

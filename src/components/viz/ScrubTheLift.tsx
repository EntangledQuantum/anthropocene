import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { recordedTrip, tripExtremes } from '../../lib/physics/line-motion.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { drawShaft, local, prep, readColors, shaftFrame, text, traceAxes } from './line-canvas.ts';

/**
 * A lift trip someone else already made, written as a trace. Drag along the
 * trace and the car moves to where it was at that instant; a short cyan line
 * lies along the trace at your finger, the tangent. The question is which
 * instant is the fastest, and the tempting answer is the top of the curve,
 * where the tangent is flat.
 *
 * The trip is `recordedTrip()` (a monotone spline from interp.ts), and the
 * tangent is its exact slope, `slopeAt`, not a finite difference.
 */
export interface ScrubTheLiftProps {
  id?: string;
  prompt?: string;
  explanation?: string;
}

const LEFT = 150;

export default function ScrubTheLift({ id, prompt, explanation }: ScrubTheLiftProps) {
  const task = useTask(id, 'scrub-the-lift');
  const trip = useMemo(recordedTrip, []);
  const ext = useMemo(() => tripExtremes(trip), [trip]);
  const T = trip.knots[trip.knots.length - 1].t;
  const canvas = useRef<HTMLCanvasElement>(null);
  const holding = useRef(false);
  const [t, setT] = useState(0.4);
  const y = trip.at(t), v = trip.slopeAt(t);

  useEffect(() => {
    const paint = () => {
      const el = canvas.current;
      if (!el) return;
      const c = readColors();
      const { g, W, H } = prep(el);
      const sh = shaftFrame(H);
      const right = W - 14;
      drawShaft(g, sh, y, c, right);
      const tx = traceAxes(g, sh, LEFT, right, 0, T, 1, c);
      g.strokeStyle = c.x; g.lineWidth = 3; g.lineJoin = 'round';
      g.beginPath();
      for (let i = 0; i <= 280; i++) { const s = (T * i) / 280; i ? g.lineTo(tx(s), sh.yOf(trip.at(s))) : g.moveTo(tx(s), sh.yOf(trip.at(s))); }
      g.stroke();
      // level with the car, and down to the clock
      g.strokeStyle = c.grid; g.lineWidth = 1;
      g.beginPath(); g.moveTo(sh.x1 + 4, sh.yOf(y)); g.lineTo(tx(t), sh.yOf(y)); g.moveTo(tx(t), sh.yOf(y)); g.lineTo(tx(t), sh.bot); g.stroke();
      // the tangent
      const ta = Math.max(0, t - 1.4), tb = Math.min(T, t + 1.4);
      g.save(); g.beginPath(); g.rect(LEFT, sh.top - 4, right - LEFT, sh.bot - sh.top + 4); g.clip();
      g.strokeStyle = c.v; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(tx(ta), sh.yOf(y + v * (ta - t))); g.lineTo(tx(tb), sh.yOf(y + v * (tb - t))); g.stroke();
      g.restore();
      if (task.done) text(g, `v = ${v.toFixed(1)} m/s`, tx(tb) + 8, sh.yOf(y + v * (tb - t)) + 4, c.v, 'left', 13, 600);
      g.fillStyle = c.surf; g.strokeStyle = c.ink; g.lineWidth = 2.5;
      g.beginPath(); g.arc(tx(t), sh.yOf(y), 9, 0, Math.PI * 2); g.fill(); g.stroke();
    };
    paint();
    window.addEventListener('resize', paint);
    return () => window.removeEventListener('resize', paint);
  }, [t, task.done]);

  const onPointer = (e: RPointerEvent<HTMLCanvasElement>, kind: 'down' | 'move' | 'up') => {
    const el = canvas.current!;
    const { px } = local(el, e);
    if (kind === 'down' && px > LEFT - 10) { holding.current = true; el.setPointerCapture(e.pointerId); }
    if (kind === 'up') { holding.current = false; return; }
    if (holding.current) {
      setT(Math.max(0, Math.min(T, ((px - LEFT) / (el.clientWidth - 14 - LEFT)) * T)));
      task.touch();
    }
  };

  const hitNow = Math.abs(v) >= 0.93 * Math.abs(ext.fast.v);
  const atTop = Math.abs(t - ext.high.t) < 0.6;
  const miss = atTop
    ? `At t = ${t.toFixed(1)} s the car is at its highest, ${y.toFixed(1)} m, and the tangent is flat: ${Math.abs(v).toFixed(1)} m/s.`
    : `At t = ${t.toFixed(1)} s the tangent says ${Math.abs(v).toFixed(1)} m/s ${v < 0 ? 'down' : 'up'}. The car goes faster than that somewhere else.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Clock" value={t.toFixed(1)} unit="s" />
          <Meter label="Height" value={y.toFixed(1)} unit="m" color={C.position} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(hitNow, { t })} miss={miss} hit={explanation} />}
      </div>}>
      <canvas ref={canvas} tabIndex={0} style={{ width: '100%', height: 360, display: 'block', touchAction: 'none', cursor: 'ew-resize' }}
        aria-label={`Recorded lift trip at ${t.toFixed(1)} seconds, height ${y.toFixed(1)} metres. Arrow keys move along the trip.`}
        onPointerDown={(e) => onPointer(e, 'down')} onPointerMove={(e) => onPointer(e, 'move')}
        onPointerUp={(e) => onPointer(e, 'up')} onPointerCancel={(e) => onPointer(e, 'up')}
        onKeyDown={(e) => {
          const d = e.key === 'ArrowRight' ? 0.1 : e.key === 'ArrowLeft' ? -0.1 : 0;
          if (!d) return;
          e.preventDefault();
          setT((s) => Math.max(0, Math.min(T, Math.round((s + d) * 10) / 10)));
          task.touch();
        }} />
    </SceneCard>
  );
}

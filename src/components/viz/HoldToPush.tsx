import { useEffect, useRef, useState } from 'react';
import { createWorld, step, weight, type World } from '../../lib/physics/dynamics.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';

/**
 * A puck on frictionless ice and one button: hold to push.
 *
 * The whole of Newton's first two laws in one control. While you hold, the
 * speed climbs at a steady rate; the moment you let go it stops changing and
 * stays exactly where you left it. The trace under the puck is the same run as
 * a graph, so the learner sees a ramp while pushing and a flat line after —
 * never a decay, because nothing in the world could produce one.
 *
 * With `target` set, the scene grades itself: reach that speed, let go, check.
 * Physics: `createWorld` / `step` from src/lib/physics/dynamics.ts.
 */
export interface HoldToPushProps {
  /** Graded when set together with `target`. */
  id?: string;
  prompt?: string;
  mass?: number;
  /** Newtons, forward, while the button is held. */
  push?: number;
  v0?: number;
  /** Speed to reach and then leave alone, m/s. */
  target?: number;
  tolerance?: number;
  /** Shown once solved. */
  explanation?: string;
}

const DT = 1 / 240;
const SPAN = 12; // seconds of trace
const VMAX = 20;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ccc';
}

export default function HoldToPush({
  id, prompt, mass = 2, push = 6, v0 = 4, target, tolerance = 0.4, explanation,
}: HoldToPushProps) {
  const graded = Boolean(id && target !== undefined);
  const task = useTask(id && target !== undefined ? id : undefined, 'hold-to-push');
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<World | null>(null);
  const pushing = useRef(false);
  const trace = useRef<{ t: number; v: number; on: boolean }[]>([]);
  const scroll = useRef(0);
  const [shown, setShown] = useState({ v: v0, a: 0, t: 0, on: false });

  const reset = () => {
    world.current = createWorld({
      bodies: [{ id: 'puck', label: 'puck', mass, pos: [0, 0], vel: [v0, 0], size: 0.4 }],
      forces: [{ id: 'w', on: 'puck', by: 'Earth', kind: 'gravity', vec: [0, -weight(mass)] }],
      surface: { angleRad: 0, muS: 0, muK: 0 },
    });
    trace.current = [{ t: 0, v: v0, on: false }];
    scroll.current = 0;
    setShown({ v: v0, a: 0, t: 0, on: false });
  };

  useEffect(reset, [mass, v0]);

  const setPush = (on: boolean) => {
    pushing.current = on;
    const w = world.current;
    if (!w) return;
    w.forces = w.forces.filter((f) => f.id !== 'push');
    if (on) w.forces.push({ id: 'push', on: 'puck', by: 'you', kind: 'applied', vec: [push, 0] });
    task.touch();
  };

  // The loop lives in refs; React only hears about it at ~8 Hz.
  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const colors = {
      ink: cssVar('--color-ink'), faint: cssVar('--color-ink-faint'), rule: cssVar('--color-rule-bright'),
      grid: cssVar('--color-rule'), v: cssVar('--color-cyan'), f: cssVar('--color-amber'), surf: cssVar('--color-surface'),
    };
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const w = world.current;
      const el = canvas.current;
      if (w && el) {
        const vBefore = w.bodies[0].vel[0];
        if (w.t < SPAN) {
          for (let k = 0; k < Math.round(dt / DT); k++) step(w, DT);
          const b = w.bodies[0];
          // Keep the run readable: the ice cannot take you past VMAX.
          if (b.vel[0] > VMAX) { b.vel = [VMAX, 0]; setPush(false); }
          trace.current.push({ t: w.t, v: b.vel[0], on: pushing.current });
        }
        scroll.current += (vBefore + w.bodies[0].vel[0]) / 2 * dt;
        draw(el, w, colors);
        if (now - lastShown > 120) {
          lastShown = now;
          setShown({ v: w.bodies[0].vel[0], a: w.accel.puck?.[0] ?? 0, t: w.t, on: pushing.current });
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const draw = (el: HTMLCanvasElement, w: World, c: Record<string, string>) => {
    const dpr = window.devicePixelRatio || 1;
    const Wd = el.clientWidth, Ht = el.clientHeight;
    if (el.width !== Math.round(Wd * dpr)) { el.width = Math.round(Wd * dpr); el.height = Math.round(Ht * dpr); }
    const g = el.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, Wd, Ht);

    // ── the ice: tick marks slide past so motion reads even with the puck centred
    const iceY = 96, pxPerM = 18, cx = Wd * 0.34;
    g.strokeStyle = c.rule; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, iceY); g.lineTo(Wd, iceY); g.stroke();
    g.strokeStyle = c.grid; g.lineWidth = 1;
    const off = (scroll.current * pxPerM) % 40;
    for (let x = -off; x < Wd; x += 40) { g.beginPath(); g.moveTo(x, iceY + 4); g.lineTo(x - 10, iceY + 14); g.stroke(); }

    // ── the puck
    g.fillStyle = c.surf; g.strokeStyle = c.ink; g.lineWidth = 2;
    g.beginPath(); g.ellipse(cx, iceY - 12, 26, 12, 0, 0, Math.PI * 2); g.fill(); g.stroke();

    const v = w.bodies[0].vel[0];
    arrow(g, cx + 30, iceY - 40, cx + 30 + v * 9, iceY - 40, c.v, `v = ${v.toFixed(1)} m/s`);
    if (pushing.current) arrow(g, cx - 110, iceY - 12, cx - 32, iceY - 12, c.f, `${push} N`);

    // ── the trace: speed against time, the same run as a graph
    const top = 136, bot = Ht - 26, left = 46, right = Wd - 12;
    const tx = (t: number) => left + (t / SPAN) * (right - left);
    const ty = (vv: number) => bot - (vv / VMAX) * (bot - top);
    g.font = '12px ui-monospace, monospace'; g.fillStyle = c.faint; g.textAlign = 'right';
    for (const vv of [0, 10, 20]) {
      g.strokeStyle = c.grid; g.beginPath(); g.moveTo(left, ty(vv)); g.lineTo(right, ty(vv)); g.stroke();
      g.fillText(String(vv), left - 6, ty(vv) + 4);
    }
    g.textAlign = 'center';
    for (let t = 0; t <= SPAN; t += 2) g.fillText(String(t), tx(t), bot + 16);
    g.textAlign = 'left'; g.font = '13px Inter, sans-serif'; g.fillStyle = c.faint;
    g.fillText('speed (m/s)', left + 4, top - 6);
    g.textAlign = 'right'; g.fillText('time (s)', right, bot - 6);
    g.fillStyle = c.f; g.fillText('while pushing', right, top - 6);
    g.fillStyle = c.v; g.fillText('coasting', right - g.measureText('while pushing').width - 16, top - 6);

    const pts = trace.current;
    for (let i = 1; i < pts.length; i++) {
      g.strokeStyle = pts[i].on ? c.f : c.v;
      g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(tx(pts[i - 1].t), ty(pts[i - 1].v)); g.lineTo(tx(pts[i].t), ty(pts[i].v)); g.stroke();
    }
    if (target !== undefined) {
      g.setLineDash([5, 5]); g.strokeStyle = c.ink; g.lineWidth = 1;
      g.beginPath(); g.moveTo(left, ty(target)); g.lineTo(right, ty(target)); g.stroke(); g.setLineDash([]);
      g.fillStyle = c.ink; g.textAlign = 'left'; g.fillText(`target ${target} m/s`, left + 6, ty(target) - 6);
    }
  };

  const off = Math.abs(shown.v - (target ?? 0));
  const hitNow = graded && !shown.on && off <= tolerance;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="anth-btn"
              style={{ padding: '10px 20px', fontSize: 15, borderColor: shown.on ? C.force : undefined, color: shown.on ? C.force : undefined }}
              onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); setPush(true); }}
              onPointerUp={() => setPush(false)} onPointerCancel={() => setPush(false)}
              onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); setPush(true); } }}
              onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') setPush(false); }}>
              {shown.on ? 'Pushing…' : 'Hold to push'}
            </button>
            <button type="button" className="anth-btn" onClick={reset}>Start over</button>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
              <Meter label="Speed" value={shown.v.toFixed(2)} unit="m/s" color={C.velocity} />
              <Meter label="Acceleration" value={shown.a.toFixed(2)} unit="m/s²" color={C.accel} />
            </span>
          </div>
          {graded && (
            <CheckBar
              verdict={task.verdict} done={task.done}
              onCheck={() => task.check(hitNow, { v: shown.v })}
              miss={shown.on
                ? 'Still pushing. Let go first, then check.'
                : `${shown.v.toFixed(1)} m/s is ${off.toFixed(1)} m/s ${shown.v < target! ? 'short of' : 'past'} the target.${shown.v > target! ? ' Nothing here will slow it down, so start over.' : ''}`}
              hit={explanation}
            />
          )}
        </div>
      }>
      <canvas ref={canvas} style={{ width: '100%', height: 330, display: 'block' }}
        aria-label={`Puck on ice moving at ${shown.v.toFixed(1)} metres per second${shown.on ? ', being pushed' : ''}`} />
    </SceneCard>
  );
}

function arrow(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, label: string) {
  if (Math.abs(x2 - x1) < 2) return;
  const dir = Math.sign(x2 - x1);
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 3;
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2 - dir * 10, y2); g.stroke();
  g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - dir * 12, y2 - 6); g.lineTo(x2 - dir * 12, y2 + 6); g.closePath(); g.fill();
  g.font = '600 13px Inter, sans-serif'; g.textAlign = 'center';
  g.fillText(label, (x1 + x2) / 2, y1 - 10);
}

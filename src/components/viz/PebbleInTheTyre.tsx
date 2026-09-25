import { useEffect, useRef, useState } from 'react';
import { rigidVelocity, rollingPointVelocity, rollingWheel } from '../../lib/physics/rotation.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';

/**
 * A bicycle wheel rolling along the road, slowed down, with a pebble stuck in
 * the tread. The pebble draws its own path — a row of arches with a sharp
 * cusp every time it touches the road — and carries its velocity arrow.
 * One control: play and freeze (the arrow keys nudge a frozen wheel).
 *
 * `parts` also draws the pebble's velocity as the sum of two arrows: riding
 * forward with the axle, and circling the axle at ωR.
 *
 * With `id`, the scene grades itself: freeze the wheel when the pebble moves
 * at the bike's own speed (within `tolerance`).
 * Physics: `rollingWheel` / `rollingPointVelocity` from rotation.ts.
 */
export interface PebbleInTheTyreProps {
  id?: string;
  prompt?: string;
  /** Bike speed, m/s. */
  v?: number;
  /** Wheel radius, m. */
  R?: number;
  /** Played this many times slower than real. */
  slow?: number;
  parts?: boolean;
  tolerance?: number;
  explanation?: string;
}

const X0 = 0.4, X_END = 2.5, SPAN = 2.8, K = 0.05; // metres of arrow per m/s

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ccc';
}

export default function PebbleInTheTyre({
  id, prompt, v = 5, R = 0.33, slow = 20, parts = false, tolerance = 0.5, explanation,
}: PebbleInTheTyreProps) {
  const task = useTask(id, 'pebble-in-the-tyre');
  const canvas = useRef<HTMLCanvasElement>(null);
  const t = useRef(0);
  const playing = useRef(true);
  const trail = useRef<[number, number][]>([]);
  const [shown, setShown] = useState({ speed: 0, height: 0, playing: true });
  const solved = useRef(false);
  solved.current = task.done;

  const state = () => {
    const w = rollingWheel(X0, -Math.PI / 2, v, R, t.current);
    const vel = rollingPointVelocity(v, R, w.a);
    return { ...w, vel, speed: Math.hypot(vel[0], vel[1]) };
  };
  const publish = () => { const s = state(); setShown({ speed: s.speed, height: s.point[1], playing: playing.current }); };

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const col = {
      ink: cssVar('--color-ink'), soft: cssVar('--color-ink-soft'), faint: cssVar('--color-ink-faint'), rule: cssVar('--color-rule-bright'),
      grid: cssVar('--color-rule'), v: cssVar('--color-cyan'), pos: cssVar('--color-iris'), surf: cssVar('--color-surface'),
    };
    HALO.color = col.surf;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (playing.current) {
        t.current += dt / slow;
        if (X0 + v * t.current > X_END) { t.current = 0; trail.current = []; }
      }
      const el = canvas.current;
      if (el) draw(el, col);
      if (now - lastShown > 120) { lastShown = now; publish(); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [v, R, slow]);

  const draw = (el: HTMLCanvasElement, c: Record<string, string>) => {
    const dpr = window.devicePixelRatio || 1;
    const Wd = el.clientWidth, Ht = el.clientHeight;
    if (el.width !== Math.round(Wd * dpr)) { el.width = Math.round(Wd * dpr); el.height = Math.round(Ht * dpr); }
    const g = el.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, Wd, Ht);
    const ppm = Math.min(Wd / SPAN, (Ht - 50) / 1.0);
    const ox = (Wd - SPAN * ppm) / 2, road = Ht - 34;
    const X = (x: number) => ox + x * ppm, Y = (y: number) => road - y * ppm;

    // road, with a scale in metres
    g.strokeStyle = c.rule; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, road); g.lineTo(Wd, road); g.stroke();
    g.font = '12px ui-monospace, monospace'; g.fillStyle = c.faint; g.textAlign = 'center';
    for (let m = 0; m <= SPAN + 1e-9; m += 0.5) {
      g.strokeStyle = c.grid; g.beginPath(); g.moveTo(X(m), road); g.lineTo(X(m), road + 6); g.stroke();
      g.fillText(`${m} m`, X(m), road + 20);
    }

    const s = state();
    if (playing.current) trail.current.push([s.point[0], s.point[1]]);
    g.strokeStyle = c.pos; g.lineWidth = 2; g.beginPath();
    trail.current.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
    g.stroke();

    // the wheel
    const [ax, ay] = s.axle;
    g.fillStyle = c.surf; g.strokeStyle = c.soft; g.lineWidth = 5;
    g.beginPath(); g.arc(X(ax), Y(ay), R * ppm, 0, Math.PI * 2); g.fill(); g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = c.faint;
    for (let k = 0; k < 8; k++) {
      const a = s.a + (k * Math.PI) / 4;
      g.beginPath(); g.moveTo(X(ax), Y(ay)); g.lineTo(X(ax + R * 0.94 * Math.cos(a)), Y(ay + R * 0.94 * Math.sin(a))); g.stroke();
    }
    g.fillStyle = c.soft; g.beginPath(); g.arc(X(ax), Y(ay), 4, 0, Math.PI * 2); g.fill();

    // the axle's velocity: the bike's speed
    arrow(g, X(ax), Y(ay), X(ax + v * K), Y(ay), c.v, 2.5, `bike ${v.toFixed(1)} m/s`, [-40, 22]);

    const [px, py] = s.point;
    if (solved.current) {
      g.setLineDash([5, 5]); g.strokeStyle = c.pos; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(X(ax), road); g.lineTo(X(px), Y(py)); g.stroke(); g.setLineDash([]);
      g.fillStyle = c.pos; g.beginPath(); g.arc(X(ax), road, 4, 0, Math.PI * 2); g.fill();
    }
    if (parts) {
      const spin = rigidVelocity([px - ax, py - ay], -v / R);
      g.setLineDash([6, 5]);
      arrow(g, X(px), Y(py), X(px + v * K), Y(py), c.v, 1.8);
      arrow(g, X(px + v * K), Y(py), X(px + v * K + spin[0] * K), Y(py + spin[1] * K), c.v, 1.8);
      g.setLineDash([]);
    }
    arrow(g, X(px), Y(py), X(px + s.vel[0] * K), Y(py + s.vel[1] * K), c.v, 3.5, `${s.speed.toFixed(1)} m/s`, [10, -10]);
    g.fillStyle = c.ink; g.beginPath(); g.arc(X(px), Y(py), 5.5, 0, Math.PI * 2); g.fill();
  };

  const setPlaying = (on: boolean) => { playing.current = on; publish(); task.touch(); };
  const ratio = shown.speed / v;
  const hit = !shown.playing && Math.abs(shown.speed - v) <= tolerance;
  const miss = shown.playing
    ? 'Freeze it first: the pebble is still moving.'
    : `Frozen with the pebble at ${shown.speed.toFixed(1)} m/s, ${ratio.toFixed(2)}× the bike's speed, ${(shown.height * 100).toFixed(0)} cm off the road.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={() => setPlaying(!playing.current)}>
            {shown.playing ? (id ? 'Freeze' : 'Pause') : 'Play'}
          </button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Bike" value={v.toFixed(1)} unit="m/s" color={C.velocity} />
            <Meter label="Pebble" value={shown.speed.toFixed(1)} unit="m/s" color={C.velocity} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hit, { speed: shown.speed })} miss={miss} hit={explanation} />}
      </div>}>
      <canvas ref={canvas} tabIndex={0} style={{ width: '100%', height: 300, display: 'block' }}
        aria-label={`A wheel rolling at ${v} metres per second. The pebble in its tread is moving at ${shown.speed.toFixed(1)} metres per second. When frozen, the left and right arrow keys roll it back or forward.`}
        onKeyDown={(e) => {
          if (playing.current) return;
          const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          t.current = Math.max(0, t.current + (d * (2 * Math.PI) / 180) * (R / v)); // 2° of roll
          if (d > 0) { const p = state().point; trail.current.push([p[0], p[1]]); }
          publish();
          task.touch();
        }} />
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Slowed {slow}× · purple: the pebble’s path · cyan: velocity{parts ? ' · dashed: riding with the axle, plus circling it' : ''}
      </p>
    </SceneCard>
  );
}

const HALO = { color: '#000' };

function arrow(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, w: number, label?: string, off: [number, number] = [0, -10]) {
  const L = Math.hypot(x2 - x1, y2 - y1);
  if (L < 3) return;
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L, h = Math.min(12, L * 0.5);
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = w;
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2 - ux * h, y2 - uy * h); g.stroke();
  const saved = g.getLineDash(); g.setLineDash([]);
  g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - ux * h - uy * h * 0.5, y2 - uy * h + ux * h * 0.5); g.lineTo(x2 - ux * h + uy * h * 0.5, y2 - uy * h - ux * h * 0.5); g.closePath(); g.fill();
  g.setLineDash(saved);
  if (label) {
    g.font = '600 13px Inter, sans-serif'; g.textAlign = 'left';
    g.lineWidth = 4; g.strokeStyle = HALO.color; g.lineJoin = 'round';
    g.strokeText(label, x2 + off[0], y2 + off[1]);
    g.fillText(label, x2 + off[0], y2 + off[1]);
  }
}

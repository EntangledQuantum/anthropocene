import { useEffect, useRef, useState } from 'react';
import { G_EARTH } from '../../lib/physics/dynamics.ts';
import { ballistic, bucketForce, bucketPush, minTopSpeed, onCircle, releaseBeforeTop, tangentVelocity } from '../../lib/physics/circular.ts';
import { centripetal } from '../../lib/physics/kinematics.ts';
import { C, CheckBar, Handle, Meter, SceneCard, Stage, useTask } from './scene.tsx';

/**
 * A bucket of water carried round a vertical circle at a steady speed, and
 * one control: the speed.
 *
 * The arrows ride on the water: its weight (amber, always down), the push of
 * the bucket's bottom (amber, toward the centre) and the acceleration the
 * circle demands (magenta, drawn as m·a on the force scale, so the two amber
 * arrows must add up to it). Nothing is labelled centripetal. Too slow and
 * the bottom would have to pull; it cannot, so the water leaves and falls.
 *
 * With `id`, the scene grades itself: the slowest speed that keeps the water in.
 * Physics: `bucketPush` / `ballistic` from circular.ts.
 */
export interface SwingTheBucketProps {
  id?: string;
  prompt?: string;
  /** Centre of the hand to the water, metres. */
  radius?: number;
  start?: number;
  /** How far above the slowest speed still counts, m/s. */
  tolerance?: number;
  explanation?: string;
}

const MASS = 1; // kg of water
const SLOW = 0.5; // shown at half speed
const KF = 0.045; // metres of arrow per newton
const VMIN = 1, VMAX = 5;
const GROUND = -1.45;

type Water = { kind: 'in' } | { kind: 'free'; p0: readonly [number, number]; v0: readonly [number, number]; t: number; before: number } | { kind: 'landed'; x: number; before: number };

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ccc';
}

export default function SwingTheBucket({ id, prompt, radius = 1, start = 4.5, tolerance = 0.15, explanation }: SwingTheBucketProps) {
  const task = useTask(id, 'swing-the-bucket');
  const canvas = useRef<HTMLCanvasElement>(null);
  const vRef = useRef(start);
  const psi = useRef(-Math.PI / 2);
  const water = useRef<Water>({ kind: 'in' });
  const [v, setV] = useState(start);
  const [shown, setShown] = useState<{ kind: Water['kind']; before: number }>({ kind: 'in', before: 0 });
  const R = radius;
  const vMin = minTopSpeed(R);

  const refill = () => { water.current = { kind: 'in' }; setShown({ kind: 'in', before: 0 }); task.touch(); };

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const col = {
      ink: cssVar('--color-ink'), soft: cssVar('--color-ink-soft'), faint: cssVar('--color-ink-faint'), rule: cssVar('--color-rule-bright'),
      grid: cssVar('--color-rule'), f: cssVar('--color-amber'), a: cssVar('--color-magenta'), surf: cssVar('--color-surface'),
    };
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05) * SLOW;
      last = now;
      const speed = vRef.current;
      const n = Math.max(1, Math.round(dt / 0.002));
      for (let k = 0; k < n; k++) {
        const h = dt / n;
        psi.current += (speed / R) * h;
        const w = water.current;
        if (w.kind === 'in' && bucketPush(MASS, speed, R, psi.current - Math.PI / 2, G_EARTH) < 0) {
          // The bottom would have to pull. It cannot: the water is on its own.
          const before = (((Math.PI / 2 - psi.current) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          water.current = { kind: 'free', p0: onCircle(R, psi.current), v0: tangentVelocity(speed, psi.current), t: 0, before };
        } else if (w.kind === 'free') {
          w.t += h;
          const p = ballistic(w.p0, w.v0, w.t);
          if (p[1] < GROUND) water.current = { kind: 'landed', x: p[0], before: w.before };
        }
      }
      if (canvas.current) draw(canvas.current, col, speed);
      if (now - lastShown > 120) {
        lastShown = now;
        const w = water.current;
        setShown({ kind: w.kind, before: w.kind === 'in' ? 0 : w.before });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [R]);

  const draw = (el: HTMLCanvasElement, c: Record<string, string>, speed: number) => {
    const dpr = window.devicePixelRatio || 1;
    const Wd = el.clientWidth, Ht = el.clientHeight;
    if (el.width !== Math.round(Wd * dpr)) { el.width = Math.round(Wd * dpr); el.height = Math.round(Ht * dpr); }
    const g = el.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, Wd, Ht);
    const TOP = R + 0.4;
    const ppm = (Ht - 44) / (TOP - GROUND);
    const X = (x: number) => Wd / 2 + x * ppm, Y = (y: number) => 36 + (TOP - y) * ppm;
    const poly = (pts: number[][]) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); };

    g.font = '13px Inter, sans-serif'; g.fillStyle = c.faint; g.textAlign = 'left';
    g.fillText('on the water, amber: weight, then the bucket\'s push · magenta: m·a', 10, 18);
    g.textAlign = 'right'; g.fillText('shown at half speed', Wd - 10, 18);
    g.strokeStyle = c.rule; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, Y(GROUND)); g.lineTo(Wd, Y(GROUND)); g.stroke();
    g.setLineDash([4, 5]); g.strokeStyle = c.grid; g.lineWidth = 1.5;
    g.beginPath(); g.arc(X(0), Y(0), R * ppm, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);

    const p = psi.current, ur = [Math.cos(p), Math.sin(p)], ut = [-Math.sin(p), Math.cos(p)];
    const at = (rr: number, tt: number) => [X(ur[0] * rr + ut[0] * tt), Y(ur[1] * rr + ut[1] * tt)];
    // the arm, from the hand to the bucket's rim
    g.strokeStyle = c.soft; g.lineWidth = 2;
    g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(...(at(R - 0.24, 0) as [number, number])); g.stroke();
    g.fillStyle = c.soft; g.beginPath(); g.arc(X(0), Y(0), 5, 0, Math.PI * 2); g.fill();

    const w = water.current;
    if (w.kind === 'in') {
      // Tip to tail: weight, then the bucket's whole push (bottom and walls),
      // lands exactly on m·a. The dashed magenta arrow is that sum. Drawn
      // before the bucket so the arrows emerge from it.
      const wc = [ur[0] * (R - 0.02), ur[1] * (R - 0.02)];
      const tip1 = [wc[0], wc[1] - MASS * G_EARTH * KF];
      const b = bucketForce(MASS, speed, R, p);
      const tip2 = [tip1[0] + b[0] * KF, tip1[1] + b[1] * KF];
      arrowTo(g, X(wc[0]), Y(wc[1]), X(tip2[0]), Y(tip2[1]), c.a, true, -7);
      arrowTo(g, X(wc[0]), Y(wc[1]), X(tip1[0]), Y(tip1[1]), c.f, false, 4);
      arrowTo(g, X(tip1[0]), Y(tip1[1]), X(tip2[0]), Y(tip2[1]), c.f, false, 4);
      g.fillStyle = c.soft; g.globalAlpha = 0.3;
      poly([at(R + 0.07, -0.13), at(R + 0.07, 0.13), at(R - 0.1, 0.145), at(R - 0.1, -0.145)]); g.fill();
      g.globalAlpha = 1;
    } else {
      const q = w.kind === 'free' ? ballistic(w.p0, w.v0, w.t) : [w.x, GROUND] as const;
      g.fillStyle = c.soft; g.globalAlpha = 0.6;
      g.beginPath();
      if (w.kind === 'free') g.arc(X(q[0]), Y(q[1]), 9, 0, Math.PI * 2);
      else g.ellipse(X(q[0]), Y(GROUND) - 2, 30, 4, 0, 0, Math.PI * 2);
      g.fill(); g.globalAlpha = 1;
    }
    // the bucket: bottom outward, open toward the hand
    g.strokeStyle = c.ink; g.lineWidth = 2.5;
    poly([at(R - 0.24, -0.17), at(R + 0.07, -0.13), at(R + 0.07, 0.13), at(R - 0.24, 0.17)]); g.stroke();
  };

  const nTop = bucketPush(MASS, v, R, 0);
  const aTop = centripetal(v, R);
  const spilled = shown.kind !== 'in';
  const hitNow = !spilled && v >= vMin - 1e-9 && v <= vMin + tolerance;
  const lost = releaseBeforeTop(v, R);
  const miss = spilled
    ? `The water left ${((shown.before * 180) / Math.PI).toFixed(0)}° before the top: at that speed the turn needed less than gravity's ${G_EARTH} m/s² alone. Refill and try again.`
    : v < vMin
      ? `At ${v.toFixed(2)} m/s the turn needs only ${aTop.toFixed(2)} m/s² at the top, less than gravity's ${G_EARTH}. It will leave ${lost !== null ? ((lost * 180) / Math.PI).toFixed(0) : 0}° before the top.`
      : `At ${v.toFixed(2)} m/s the bottom still pushes on the water with ${nTop.toFixed(1)} N at the top. You can go slower.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
          <Meter label="Speed" value={v.toFixed(2)} unit="m/s" color={C.velocity} />
          <Meter label="Bucket's push at the top" value={nTop >= 0 ? nTop.toFixed(1) : '0'} unit={nTop >= 0 ? 'N' : 'N, it would have to pull'} color={C.force} />
          <button type="button" className="anth-btn" style={{ marginLeft: 'auto' }} onClick={refill} disabled={!spilled}>Refill</button>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(hitNow, { v })} miss={miss} hit={explanation} />}
      </div>}>
      <canvas ref={canvas} style={{ width: '100%', height: 390, display: 'block' }}
        aria-label={`A bucket of water swung in a vertical circle of radius ${R} metres at ${v.toFixed(2)} metres per second. ${spilled ? 'The water has fallen out.' : 'The water is in the bucket.'}`} />
      <Stage x={[VMIN, VMAX]} y={[-1, 1]} height={78} axes={{ x: 'steady speed (m/s)', xTicks: [1, 2, 3, 4, 5], yTicks: [] }} label="Speed control">
        {(s) => <Handle s={s} at={[v, 0]} step={0.05} color={C.velocity} label="Speed: drag left or right"
          clamp={(q) => [Math.min(VMAX, Math.max(VMIN, q[0])), 0]}
          onChange={(q) => { const nv = Math.round(q[0] * 100) / 100; vRef.current = nv; setV(nv); task.touch(); }} />}
      </Stage>
    </SceneCard>
  );
}

function arrowTo(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, dash = false, off = 0) {
  const L = Math.hypot(x2 - x1, y2 - y1);
  if (L < 3) return;
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L, h = Math.min(11, L * 0.5);
  x1 += uy * off; x2 += uy * off; y1 -= ux * off; y2 -= ux * off;
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = dash ? 3.5 : 3;
  g.setLineDash(dash ? [7, 5] : []);
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2 - ux * h, y2 - uy * h); g.stroke(); g.setLineDash([]);
  g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - ux * h - uy * h * 0.55, y2 - uy * h + ux * h * 0.55); g.lineTo(x2 - ux * h + uy * h * 0.55, y2 - uy * h - ux * h * 0.55); g.closePath(); g.fill();
}

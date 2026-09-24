/**
 * Chapter 8's evolving picture: two carts on a track and the ledger under
 * them. Shared by `AimTheCart` and `LoadTheCart`, which differ only in what
 * the learner is allowed to touch. Not a widget itself.
 *
 * The ledger is the reusable picture. Momentum: A's arrow, then B's arrow
 * tip to tail, with a white mark at the total — which the arrows are forced
 * to keep reaching through the whole collision. Energy: stacked bars for the
 * two carts, the squashed bumper and what has gone to heat — the kinetic part
 * dips during the flash even when the bumper is perfectly elastic.
 *
 * The run is `stepTrack` from momentum.ts, drawn to a canvas from refs; React
 * only hears about it at ~8 Hz (AGENTS.md §2, rule 5).
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  collide1D, createTrack, energyLost, overlap, settled, stepTrack, stiffnessFor,
  storedEnergy, totalMomentum, totalKE, type Track,
} from '../../lib/physics/momentum.ts';

export interface CartSetup { mA: number; vA: number; mB: number; vB: number; e: number }

export const HALF = 0.5;       // cart half-width, m
export const BUMPER = 0.55;    // bumper length, m
const REACH = 2 * HALF + BUMPER;
const DEPTH = 0.35;            // deepest squash, m
export const START = { a: -4.6, b: 1.2 }; // cart centres before the run, m
const X = 6.6;                 // track half-length, m
const PLAY = 0.5;              // playback speed
const BRICK = 0.5;             // kg per brick
export const V_SCALE = 0.2;    // m of arrow per m/s
export const H = 380;
export const RAIL = 196;

export function buildTrack(c: CartSetup): Track {
  const u = Math.max(c.vA - c.vB, 0.3);
  return createTrack(
    { m: c.mA, x: START.a, v: c.vA },
    { m: c.mB, x: START.b, v: c.vB },
    { reach: REACH, k: stiffnessFor(c.mA, c.mB, u, DEPTH), e: c.e },
  );
}

export const px = (W: number) => (x: number) => 16 + ((x + X) / (2 * X)) * (W - 32);

const bricks = (m: number) => Math.max(1, Math.round(m / BRICK));

/** Top of a cart's brick stack, px — where its velocity arrow sits. */
export const stackTop = (m: number) => RAIL - 16 - bricks(m) * 9;

function niceStep(span: number) {
  const raw = span / 5, mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => span / s <= 6) ?? 10 * mag;
}

function axis(g: CanvasRenderingContext2D, x0: number, x1: number, y: number, lo: number, hi: number, c: Record<string, string>) {
  const step = niceStep(hi - lo), sx = (v: number) => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);
  g.strokeStyle = c.rule; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
  g.font = '11px ui-monospace, monospace'; g.fillStyle = c.faint; g.textAlign = 'center';
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    g.beginPath(); g.moveTo(sx(v), y); g.lineTo(sx(v), y + 4); g.stroke();
    g.fillText(`${+v.toFixed(2)}`, sx(v), y + 16);
  }
  return sx;
}

function arrow(g: CanvasRenderingContext2D, x1: number, x2: number, y: number, color: string, w = 3) {
  if (Math.abs(x2 - x1) < 2) return;
  const d = Math.sign(x2 - x1), h = Math.min(11, Math.abs(x2 - x1) * 0.6);
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = w;
  g.beginPath(); g.moveTo(x1, y); g.lineTo(x2 - d * h, y); g.stroke();
  g.beginPath(); g.moveTo(x2, y); g.lineTo(x2 - d * h, y - 6); g.lineTo(x2 - d * h, y + 6); g.closePath(); g.fill();
}

export function colors(): Record<string, string> {
  const v = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#ccc';
  return {
    ink: v('--color-ink'), soft: v('--color-ink-soft'), faint: v('--color-ink-faint'), ghost: v('--color-ink-ghost'),
    rule: v('--color-rule-bright'), surf: v('--color-surface'), vel: v('--color-cyan'), energy: v('--color-aqua'),
    warn: v('--color-warn'),
  };
}

/** Draw the track and the ledger for state `s`, with the fixed ledger scales of `c`. */
export function drawTrack(el: HTMLCanvasElement, s: Track, c: CartSetup, col: Record<string, string>, handleOn?: 'vB' | 'mB') {
  const dpr = window.devicePixelRatio || 1, W = el.clientWidth;
  if (el.width !== Math.round(W * dpr)) { el.width = Math.round(W * dpr); el.height = Math.round(H * dpr); }
  const g = el.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const sx = px(W), m2px = sx(1) - sx(0);

  // ── the track
  g.strokeStyle = col.rule; g.lineWidth = 2; g.beginPath(); g.moveTo(0, RAIL); g.lineTo(W, RAIL); g.stroke();
  const d = Math.max(0, overlap(s));
  const carts = [{ k: s.a, name: 'A' }, { k: s.b, name: 'B' }];
  for (const { k, name } of carts) {
    const x = sx(k.x), w = HALF * 2 * m2px;
    g.fillStyle = col.surf; g.strokeStyle = col.soft; g.lineWidth = 2;
    g.beginPath(); g.roundRect(x - w / 2, RAIL - 16, w, 11, 3); g.fill(); g.stroke();
    for (const wx of [-w / 3, w / 3]) { g.beginPath(); g.arc(x + wx, RAIL - 4, 4, 0, 7); g.fill(); g.stroke(); }
    const n = bricks(k.m);
    g.lineWidth = 1.5;
    for (let i = 0; i < n; i++) { g.beginPath(); g.roundRect(x - w / 2 + 5, RAIL - 16 - (i + 1) * 9, w - 10, 8, 2); g.fill(); g.stroke(); }
    g.font = '600 13px Inter, sans-serif'; g.fillStyle = col.ink; g.textAlign = 'center';
    g.fillText(`${name} · ${+k.m.toFixed(2)} kg`, x, RAIL + 20);
    const top = stackTop(k.m) - 12;
    arrow(g, x, x + k.v * V_SCALE * m2px, top, col.vel);
    if (Math.abs(k.v) > 0.05) {
      g.font = '600 12px Inter, sans-serif'; g.fillStyle = col.vel; g.textAlign = k.v > 0 ? 'left' : 'right';
      g.fillText(`${k.v.toFixed(1)} m/s`, x + k.v * V_SCALE * m2px + Math.sign(k.v) * 6, top + 4);
    }
    if (handleOn === 'vB' && name === 'B') ring(g, x + k.v * V_SCALE * m2px, top, col.ink, col.surf);
    if (handleOn === 'mB' && name === 'B') ring(g, x, RAIL - 16 - n * 9 - 2, col.ink, col.surf);
  }
  // bumper on A's nose: a spring squashed by the overlap; velcro when e = 0
  const nose = sx(s.a.x + HALF), len = (BUMPER - Math.min(d, BUMPER * 0.95)) * m2px, by = RAIL - 11;
  g.strokeStyle = c.e > 0 ? col.soft : col.warn; g.lineWidth = 2; g.beginPath(); g.moveTo(nose, by);
  for (let i = 1; i <= 8; i++) g.lineTo(nose + (len * i) / 8, by + (i % 2 ? -5 : 5) * (i < 8 ? 1 : 0));
  g.stroke();
  g.fillStyle = c.e > 0 ? col.soft : col.warn; g.fillRect(nose + len - 2, by - 8, 3, 16);

  // ── the ledger: fixed scales from the before and after states
  const o = collide1D(c.mA, c.vA, c.mB, c.vB, c.e);
  const pts = [0, c.mA * c.vA, c.mA * c.vA + c.mB * c.vB, c.mA * o.v1];
  const span = Math.max(1, Math.max(...pts) - Math.min(...pts));
  const lo = Math.min(...pts) - span * 0.08, hi = Math.max(...pts) + span * 0.08;
  const L = 150, R = W - 20;
  g.font = '13px Inter, sans-serif'; g.fillStyle = col.soft; g.textAlign = 'left';
  g.fillText('Momentum', 16, 262); g.fillStyle = col.faint; g.fillText('kg·m/s', 16, 278);
  const ps = axis(g, L, R, 282, lo, hi, col);
  const pA = s.a.m * s.a.v, P = totalMomentum(s);
  arrow(g, ps(0), ps(pA), 258, col.vel, 5);
  g.globalAlpha = 0.55; arrow(g, ps(pA), ps(P), 258, col.vel, 5); g.globalAlpha = 1;
  g.font = '600 12px Inter, sans-serif'; g.textAlign = 'center';
  if (Math.abs(ps(pA) - ps(0)) > 16) { g.fillStyle = col.vel; g.fillText('A', (ps(0) + ps(pA)) / 2, 248); }
  if (Math.abs(ps(P) - ps(pA)) > 16) { g.fillStyle = col.vel; g.globalAlpha = 0.7; g.fillText('B', (ps(pA) + ps(P)) / 2, 248); g.globalAlpha = 1; }
  g.strokeStyle = col.ink; g.lineWidth = 2; g.beginPath(); g.moveTo(ps(s.P0), 238); g.lineTo(ps(s.P0), 272); g.stroke();
  g.fillStyle = col.ink; g.textAlign = ps(s.P0) > R - 60 ? 'right' : 'left';
  g.fillText(`total ${P.toFixed(2)}`, ps(s.P0) + (ps(s.P0) > R - 60 ? -6 : 6), 236);

  g.font = '13px Inter, sans-serif'; g.fillStyle = col.soft; g.textAlign = 'left';
  g.fillText('Energy', 16, 334); g.fillStyle = col.faint; g.fillText('J', 16, 350);
  const es = axis(g, L, R, 350, 0, Math.max(s.E0, 1e-6) * 1.04, col);
  const parts: [number, string, number, boolean][] = [
    [0.5 * s.a.m * s.a.v ** 2, col.energy, 1, true], [0.5 * s.b.m * s.b.v ** 2, col.energy, 0.5, true],
    [storedEnergy(s), col.energy, 1, false], [energyLost(s), col.ghost, 1, true],
  ];
  let at = 0;
  for (const [E, color, alpha, solid] of parts) {
    const x0 = es(at), x1 = es(Math.min(s.E0 * 1.04, at + E));
    if (x1 - x0 > 0.5) {
      g.globalAlpha = alpha;
      if (solid) { g.fillStyle = color; g.fillRect(x0, 322, x1 - x0, 20); }
      else { g.strokeStyle = color; g.lineWidth = 1.5; g.strokeRect(x0 + 1, 323, x1 - x0 - 2, 18); }
      g.globalAlpha = 1;
    }
    at += E;
  }
  const lost = energyLost(s);
  g.font = '12px Inter, sans-serif'; g.textAlign = 'left'; g.fillStyle = col.faint;
  g.fillText(`kinetic ${totalKE(s).toFixed(1)} J${storedEnergy(s) > 0.05 ? ` · in the bumper ${storedEnergy(s).toFixed(1)} J` : ''}${lost > 0.05 ? ` · heat and sound ${lost.toFixed(1)} J` : ''}`, L, 314);
}

function ring(g: CanvasRenderingContext2D, x: number, y: number, ink: string, surf: string) {
  g.fillStyle = surf; g.strokeStyle = ink; g.lineWidth = 2.5;
  g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); g.stroke();
  g.fillStyle = ink; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill();
}

/**
 * The run loop. `setup` is read through a ref so dragging never restarts the
 * loop; `run()` plays the collision, `pose()` redraws the before-state.
 */
export function useCartRun(canvas: RefObject<HTMLCanvasElement | null>, setup: CartSetup, handleOn?: 'vB' | 'mB') {
  const state = useRef<Track>(buildTrack(setup));
  const cfg = useRef(setup);
  const running = useRef(false);
  /** The setup of the last run, so a scene can insist on a run before checking. */
  const ranWith = useRef<CartSetup | null>(null);
  const [shown, setShown] = useState({ P: state.current.P0, KE: state.current.E0, running: false, ran: false });
  cfg.current = setup;

  useEffect(() => {
    if (running.current) return;
    state.current = buildTrack(setup);
    setShown({ P: state.current.P0, KE: state.current.E0, running: false, ran: false });
  }, [setup.mA, setup.vA, setup.mB, setup.vB, setup.e]);

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0, settledAt = -1;
    const col = colors();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05) * PLAY;
      last = now;
      const s = state.current, el = canvas.current;
      if (el && s) {
        if (running.current) {
          const n = Math.ceil(dt / 1e-4);
          for (let i = 0; i < n; i++) stepTrack(s, dt / n);
          if (settled(s) && settledAt < 0) settledAt = s.t;
          const off = Math.abs(s.a.x) > X + 1 || Math.abs(s.b.x) > X + 1;
          if ((settledAt >= 0 && s.t > settledAt + 1.4) || off || s.t > 5) {
            running.current = false;
            settledAt = -1;
            setShown({ P: totalMomentum(s), KE: totalKE(s), running: false, ran: true });
          }
        }
        drawTrack(el, s, cfg.current, col, running.current ? undefined : handleOn);
        if (running.current && now - lastShown > 120) {
          lastShown = now;
          setShown({ P: totalMomentum(s), KE: totalKE(s), running: true, ran: false });
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [handleOn]);

  const same = (a: CartSetup | null, b: CartSetup) => !!a && a.mA === b.mA && a.vA === b.vA && a.mB === b.mB && a.vB === b.vB && a.e === b.e;
  return {
    shown,
    /** True once the current setup has been run to the end. */
    ranThis: shown.ran && same(ranWith.current, setup),
    run: () => { state.current = buildTrack(cfg.current); ranWith.current = { ...cfg.current }; running.current = true; setShown((x) => ({ ...x, running: true, ran: false })); },
    reset: () => { running.current = false; state.current = buildTrack(cfg.current); setShown({ P: state.current.P0, KE: state.current.E0, running: false, ran: false }); },
  };
}

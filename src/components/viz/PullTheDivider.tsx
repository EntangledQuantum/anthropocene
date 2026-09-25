import { useEffect, useRef, useState } from 'react';
import { BOX_H, BOX_W, MID, countLeft, createGasBox, stepGas, type GasBox } from '../../lib/physics/entropy.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';

/**
 * A box of gas with a divider down the middle, and one button.
 *
 * The particles fly straight and bounce off the walls; nothing pulls them
 * anywhere. Pull the divider and they spread. Close it and every particle is
 * trapped on whichever side it happens to be. The strip under the box is the
 * count on the left against time: it falls from N to N/2 and jitters there.
 * With four particles it touches the top every quarter-minute or so; with
 * forty it never comes near.
 *
 * Graded with `id`: close the divider at a moment when every particle is on
 * the left. Physics: `createGasBox` / `stepGas` in src/lib/physics/entropy.ts.
 */
export interface PullTheDividerProps {
  id?: string;
  prompt?: string;
  /** Number of particles. */
  n?: number;
  seed?: number;
  /** Start with the divider already open and the gas already spread (seconds run). */
  spreadFor?: number;
  explanation?: string;
}

const DT = 1 / 120;
const SPAN = 60; // seconds of trace on screen

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ccc';
}

export default function PullTheDivider({ id, prompt, n = 40, seed = 1, spreadFor = 0, explanation }: PullTheDividerProps) {
  const task = useTask(id, 'pull-the-divider');
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<GasBox | null>(null);
  const trace = useRef<{ t: number; k: number }[]>([]);
  const spread = useRef(false);
  const most = useRef(0);
  const opened = useRef(false);
  const pulledAt = useRef<number | null>(null);
  const [shown, setShown] = useState({ k: n, closed: true, most: 0, spread: false, t: 0 });

  const reset = () => {
    const b = createGasBox(n, seed);
    if (spreadFor > 0) { b.closed = false; for (let t = 0; t < spreadFor; t += DT) stepGas(b, DT); b.t = 0; }
    box.current = b;
    spread.current = spreadFor > 0;
    opened.current = spreadFor > 0;
    pulledAt.current = spreadFor > 0 ? -spreadFor : null;
    most.current = 0;
    trace.current = [{ t: 0, k: countLeft(b) }];
    setShown({ k: countLeft(b), closed: b.closed, most: 0, spread: spread.current, t: 0 });
    task.touch();
  };
  useEffect(reset, [n, seed, spreadFor]);

  const toggle = () => {
    const b = box.current;
    if (!b) return;
    b.closed = !b.closed;
    if (!opened.current) pulledAt.current = b.t;
    opened.current = true;
    setShown((s) => ({ ...s, closed: b.closed, k: countLeft(b) }));
    task.touch();
  };

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const c = {
      ink: cssVar('--color-ink'), soft: cssVar('--color-ink-soft'), faint: cssVar('--color-ink-faint'),
      rule: cssVar('--color-rule-bright'), grid: cssVar('--color-rule'), p: cssVar('--color-iris'), surf: cssVar('--color-surface'),
    };
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const b = box.current, el = canvas.current;
      if (b && el) {
        for (let k = 0; k < Math.round(dt / DT); k++) stepGas(b, DT);
        const k = countLeft(b);
        // the first slosh out of the corner is not a return; count from 10 s after the pull
        if (!spread.current && pulledAt.current !== null && b.t - pulledAt.current > 10) spread.current = true;
        if (spread.current && !b.closed) most.current = Math.max(most.current, k);
        const tr = trace.current;
        if (b.t - tr[tr.length - 1].t >= 0.05) tr.push({ t: b.t, k });
        if (tr.length > 4000) tr.splice(0, tr.length - 3000);
        draw(el, b, c);
        if (now - lastShown > 120) {
          lastShown = now;
          setShown({ k, closed: b.closed, most: most.current, spread: spread.current, t: b.t });
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [n]);

  const draw = (el: HTMLCanvasElement, b: GasBox, c: Record<string, string>) => {
    const dpr = window.devicePixelRatio || 1;
    const Wd = el.clientWidth, Ht = el.clientHeight;
    if (el.width !== Math.round(Wd * dpr)) { el.width = Math.round(Wd * dpr); el.height = Math.round(Ht * dpr); }
    const g = el.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, Wd, Ht);

    // ── the box
    const bh = 190, bw = bh * (BOX_W / BOX_H), bx = (Wd - bw) / 2, by = 12;
    const px = (x: number) => bx + (x / BOX_W) * bw, py = (y: number) => by + bh - (y / BOX_H) * bh;
    g.strokeStyle = c.ink; g.lineWidth = 2.5; g.strokeRect(bx, by, bw, bh);
    if (b.closed) { g.strokeStyle = c.ink; g.lineWidth = 4; g.beginPath(); g.moveTo(px(MID), by); g.lineTo(px(MID), by + bh); g.stroke(); }
    else { g.setLineDash([4, 6]); g.strokeStyle = c.grid; g.lineWidth = 1.5; g.beginPath(); g.moveTo(px(MID), by); g.lineTo(px(MID), by + bh); g.stroke(); g.setLineDash([]); }
    g.font = '13px Inter, sans-serif'; g.fillStyle = c.faint; g.textAlign = 'left';
    g.fillText('left', bx + 8, by + bh + 18); g.textAlign = 'right'; g.fillText('right', bx + bw - 8, by + bh + 18);
    const r = n > 10 ? 5 : 8;
    g.fillStyle = c.p;
    for (let i = 0; i < b.n; i++) { g.beginPath(); g.arc(px(b.x[i]), py(b.y[i]), r, 0, Math.PI * 2); g.fill(); }

    // ── the strip: particles on the left against time
    const top = by + bh + 46, bot = Ht - 26, left = 46, right = Wd - 12;
    const t1 = Math.max(SPAN, b.t), t0 = t1 - SPAN;
    const tx = (t: number) => left + ((t - t0) / SPAN) * (right - left);
    const ky = (k: number) => bot - (k / n) * (bot - top);
    g.font = '12px ui-monospace, monospace'; g.textAlign = 'right';
    for (const k of [0, n / 2, n]) {
      g.strokeStyle = k === n ? c.rule : c.grid; g.lineWidth = 1;
      g.beginPath(); g.moveTo(left, ky(k)); g.lineTo(right, ky(k)); g.stroke();
      g.fillStyle = c.faint; g.fillText(String(k), left - 6, ky(k) + 4);
    }
    g.textAlign = 'center';
    for (let t = Math.ceil(t0 / 10) * 10; t <= t1; t += 10) g.fillText(String(t), tx(t), bot + 16);
    g.font = '13px Inter, sans-serif'; g.textAlign = 'left'; g.fillStyle = c.faint;
    g.fillText('particles on the left', left + 4, top - 8);
    g.textAlign = 'right'; g.fillText('time (s)', right, top - 8);
    g.textAlign = 'left'; g.fillStyle = c.soft; g.fillText(`all ${n}`, right - 150, ky(n) + 15);
    g.strokeStyle = c.p; g.lineWidth = 2; g.beginPath();
    let started = false;
    for (const p of trace.current) {
      if (p.t < t0) continue;
      if (!started) { g.moveTo(tx(p.t), ky(p.k)); started = true; } else g.lineTo(tx(p.t), ky(p.k));
    }
    g.stroke();
  };

  const allLeft = shown.k === n;
  const trapped = shown.closed && shown.spread;
  const miss = !shown.closed
    ? `The divider is open, with ${shown.k} of ${n} on the left right now. Close it at the right moment.`
    : `You trapped ${shown.k} on the left and ${n - shown.k} on the right. Open it and try again.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" style={{ padding: '10px 20px', fontSize: 15 }} onClick={toggle} disabled={task.done && Boolean(id)}>
            {shown.closed ? (opened.current ? 'Open the divider' : 'Pull the divider') : 'Close the divider'}
          </button>
          <button type="button" className="anth-btn" onClick={reset} disabled={task.done && Boolean(id)}>Start over</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="On the left now" value={`${shown.k} of ${n}`} color={C.position} />
            {!id && <Meter label="Most back on the left" value={shown.spread ? String(shown.most) : '—'} />}
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(trapped && allLeft, { k: shown.k, closed: shown.closed })}
          miss={miss} hit={explanation} />}
      </div>}>
      <canvas ref={canvas} style={{ width: '100%', height: 360, display: 'block' }}
        aria-label={`A box of ${n} gas particles, divider ${shown.closed ? 'closed' : 'open'}, ${shown.k} on the left.`} />
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Each particle flies straight and bounces off the walls{id ? '' : ' · most back on the left counts from 10 s after the pull'}
      </p>
    </SceneCard>
  );
}

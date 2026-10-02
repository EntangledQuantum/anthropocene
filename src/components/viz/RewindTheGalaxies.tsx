import { useEffect, useRef, useState } from 'react';
import { coastingScale, hubbleTimeGyr, rewindDistance, seeded } from '../../lib/physics/cosmos.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';

/**
 * Run the expansion backwards at today's speeds. One control: how far back.
 * The sheet is drawn from the Milky Way, filled edge to edge with galaxies
 * at every moment: as you go back, more of them crowd into view, because
 * every spacing shrinks at once. Two neighbours are marked, A near and B far;
 * the strip under the sheet writes both distances as you scrub. B is twice as
 * far but recedes twice as fast, so both reach zero at the same moment, 1/H₀.
 *
 * Graded with `id`: stop the clock when the galaxies first meet.
 * Physics: `coastingScale`, `rewindDistance`, `hubbleTimeGyr` from cosmos.ts.
 */
export interface RewindTheGalaxiesProps {
  id?: string;
  prompt?: string;
  /** Gyr either side of 1/H₀ that counts. */
  tolerance?: number;
  explanation?: string;
}

const W = 640, SH = 290, STRIP = 104, H = SH + STRIP, TMAX = 18;
const A: [number, number] = [120, -30], B: [number, number] = [-235, 55];
const dA0 = Math.hypot(...A), dB0 = Math.hypot(...B);
const CELL = 30;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ccc';
}
/** A fixed jitter for lattice site (i, j), so the sky is the same every time. */
const jit = (i: number, j: number) => { const r = seeded((i * 73856093) ^ (j * 19349663)); return [r() - 0.5, r() - 0.5]; };

export default function RewindTheGalaxies({ id, prompt, tolerance = 0.25, explanation }: RewindTheGalaxiesProps) {
  const task = useTask(id, 'rewind-the-galaxies');
  const [t, setT] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tH = hubbleTimeGyr();
  const a = coastingScale(t);
  const dA = rewindDistance(dA0, t), dB = rewindDistance(dB0, t);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = el.clientWidth, s = cw / W;
    el.width = Math.round(cw * dpr); el.height = Math.round(H * s * dpr);
    const g = el.getContext('2d')!;
    g.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
    g.clearRect(0, 0, W, H);
    g.lineJoin = 'round';
    const col = { ink: cssVar('--color-ink'), soft: cssVar('--color-ink-soft'), faint: cssVar('--color-ink-faint'),
      grid: cssVar('--color-rule'), rule: cssVar('--color-rule-bright'), pos: cssVar('--color-iris'), glow: cssVar('--color-warn'), surf: cssVar('--color-surface') };
    const cx = W / 2, cy = SH / 2;

    // ── the sheet, drawn from the Milky Way, filled to the edges
    g.save(); g.beginPath(); g.rect(0, 0, W, SH); g.clip();
    const glow = Math.min(1, Math.max(0, (0.3 - a) / 0.3)) ** 1.5;
    if (glow > 0) { g.fillStyle = col.glow; g.globalAlpha = 0.75 * glow; g.fillRect(0, 0, W, SH); g.globalAlpha = 1; }
    if (a * CELL >= 2.2) {
      const n = Math.ceil(cx / (a * CELL)) + 1, m = Math.ceil(cy / (a * CELL)) + 1;
      g.fillStyle = col.soft;
      g.globalAlpha = 1 - glow;
      const sz = Math.min(2.6, a * CELL * 0.4);
      for (let i = -n; i <= n; i++) for (let j = -m; j <= m; j++) {
        if (i === 0 && j === 0) continue;
        const [u, v] = jit(i, j);
        const x = cx + a * CELL * (i + 0.8 * u), y = cy + a * CELL * (j + 0.8 * v);
        g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
      g.globalAlpha = 1;
    }
    // the two marked neighbours and the lines to them
    const mark = (p: [number, number], d: number, name: string) => {
      const x = cx + a * p[0], y = cy - a * p[1];
      g.strokeStyle = col.pos; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.stroke();
      g.fillStyle = col.surf; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); g.strokeStyle = col.ink; g.stroke();
      g.font = '600 14px Inter, sans-serif'; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = col.surf;
      const label = `${name}  ${d.toFixed(0)} Mpc`;
      if (Math.hypot(x - cx, y - cy) > 44) { g.strokeText(label, x, y - 14); g.fillStyle = col.ink; g.fillText(label, x, y - 14); }
    };
    mark(A, dA, 'A'); mark(B, dB, 'B');
    g.fillStyle = col.pos; g.beginPath(); g.arc(cx, cy, 7, 0, 7); g.fill();
    g.font = '13px Inter, sans-serif'; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = col.surf;
    g.strokeText('Milky Way', cx, cy + 24); g.fillStyle = col.ink; g.fillText('Milky Way', cx, cy + 24);
    if (a === 0) {
      g.font = '600 15px Inter, sans-serif'; g.strokeText('every distance is zero', cx, 30); g.fillText('every distance is zero', cx, 30);
    }
    g.restore();
    g.strokeStyle = col.rule; g.lineWidth = 1; g.strokeRect(0.5, 0.5, W - 1, SH - 1);
    g.font = '12px Inter, sans-serif'; g.textAlign = 'left'; g.fillStyle = col.ink; g.strokeStyle = col.surf; g.lineWidth = 4;
    const cap = `sheet drawn at ${(a * 100).toFixed(0)}% of today's size`;
    g.strokeText(cap, 8, SH - 8); g.fillText(cap, 8, SH - 8);

    // ── the strip: both distances against time ago, written as you scrub
    const L = 46, R = W - 12, T0 = SH + 22, T1 = H - 26;
    const tx = (tt: number) => L + (tt / TMAX) * (R - L), ty = (d: number) => T1 - (d / 300) * (T1 - T0);
    g.font = '12px ui-monospace, monospace'; g.fillStyle = col.faint;
    for (const d of [0, 150, 300]) {
      g.strokeStyle = col.grid; g.beginPath(); g.moveTo(L, ty(d)); g.lineTo(R, ty(d)); g.stroke();
      g.textAlign = 'right'; g.fillText(String(d), L - 6, ty(d) + 4);
    }
    g.textAlign = 'center';
    for (let tt = 0; tt <= TMAX; tt += 3) g.fillText(String(tt), tx(tt), T1 + 16);
    g.font = '12px Inter, sans-serif'; g.textAlign = 'left'; g.fillText('distance, Mpc', L + 4, T0 - 6);
    g.textAlign = 'right'; g.fillText('time ago, billion years', R, T0 - 6);
    for (const [d0, name] of [[dA0, 'A'], [dB0, 'B']] as const) {
      g.strokeStyle = col.pos; g.lineWidth = 2.2; g.beginPath();
      for (let k = 0; k <= 120; k++) { const tt = (t * k) / 120; const y = ty(rewindDistance(d0, tt)); if (k) g.lineTo(tx(tt), y); else g.moveTo(tx(tt), y); }
      g.stroke();
      g.fillStyle = col.ink; g.textAlign = 'left'; g.fillText(name, tx(0) + 4, ty(d0) - 5);
    }
    g.strokeStyle = col.ink; g.setLineDash([4, 4]); g.lineWidth = 1;
    g.beginPath(); g.moveTo(tx(t), T0); g.lineTo(tx(t), T1); g.stroke(); g.setLineDash([]);
  }, [t, a, dA, dB]);

  const off = t - tH;
  const hitNow = Math.abs(off) <= tolerance;
  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <label>
          <span className="hud-label">Time ago: {t.toFixed(2)} billion years</span>
          <input type="range" className="anth-slider" min={0} max={TMAX} step={0.05} value={t}
            aria-label="How far back to run the expansion, billions of years"
            onChange={(e) => { setT(+e.target.value); task.touch(); }} />
        </label>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <Meter label="Milky Way to A" value={dA.toFixed(1)} unit="Mpc" color={C.position} />
          <Meter label="Milky Way to B" value={dB.toFixed(1)} unit="Mpc" color={C.position} />
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(hitNow, { t })}
          miss={off < 0
            ? `A is still ${dA.toFixed(1)} Mpc away and B ${dB.toFixed(1)} Mpc. At today's speeds they keep closing.`
            : `This is ${off.toFixed(1)} billion years before every distance first reached zero. Come forward to the moment they meet.`}
          hit={explanation} />}
      </div>}>
      <canvas ref={canvas} style={{ width: '100%', aspectRatio: `${W} / ${H}`, display: 'block' }}
        aria-label={`The sheet ${t.toFixed(1)} billion years ago at today's speeds: ${(a * 100).toFixed(0)} percent of today's size. A is ${dA.toFixed(0)} megaparsecs from the Milky Way, B ${dB.toFixed(0)}.`} />
    </SceneCard>
  );
}

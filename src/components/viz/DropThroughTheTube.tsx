import { useRef, useState } from 'react';
import {
  CH29_PIPE, G, fallStep, pipeDragCoefficient, ringOnFallingMagnet, terminalSpeed, type PipeKind,
} from '../../lib/physics/induction.ts';
import { SceneCard, type StageApi } from './scene.tsx';
import { Layered, begin, drawArrow, drawCurrentEnd, palette, text, useCanvasFrame, type Palette } from './induction-kit-ch29.tsx';

/**
 * Three 1 m pipes, three identical magnets, one button. Plastic, copper, and
 * copper with a slot down its length. The magnets fall in real time under
 * their weight and the eddy-current drag k v of their pipe (thin-wall,
 * point-dipole model, air ignored: src/lib/physics/induction.ts). In the
 * copper pipe the ring currents near the magnet are drawn on the walls as ⊙
 * and ⊗, sized by their current; amber arrows are the weight and the drag.
 *
 * Ungraded: it is the payoff of the chapter's pipe prediction.
 */
export interface DropThroughTheTubeProps { prompt?: string }

const H = 430;
const KINDS: { kind: PipeKind; label: string; x: number }[] = [
  { kind: 'plastic', label: 'plastic', x: 0.5 },
  { kind: 'copper', label: 'copper', x: 1.5 },
  { kind: 'slotted', label: 'copper, slotted', x: 2.5 },
];
const HALF = 17; // pipe half-width, px (drawn wide: the real pipe is 16.5 mm across)
const N_PER_PX = 0.1 / 40; // force scale: 100 mN ↔ 40 px
const K = KINDS.map((k) => pipeDragCoefficient(k.kind));
const VT = terminalSpeed(CH29_PIPE.M, K[1]);
const I_REF = Math.abs(ringOnFallingMagnet(-CH29_PIPE.a / 2, VT, 0.004).I);

export default function DropThroughTheTube({ prompt }: DropThroughTheTubeProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<StageApi | null>(null);
  const col = useRef<Palette | null>(null);
  const sim = useRef({ running: false, t: 0, y: [0, 0, 0], v: [0, 0, 0], landed: [NaN, NaN, NaN] });
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);

  const drop = () => {
    sim.current = { running: true, t: 0, y: [0, 0, 0], v: [0, 0, 0], landed: [NaN, NaN, NaN] };
    setRunning(true); setRan(true);
  };

  useCanvasFrame((dt) => {
    const el = canvas.current, s = api.current;
    if (!el || !s) return;
    const c = (col.current ??= palette());
    const st = sim.current;
    if (st.running) {
      const n = Math.max(1, Math.round(dt / 1e-3)), h = dt / n;
      for (let k = 0; k < n; k++) {
        st.t += h;
        for (let i = 0; i < 3; i++) {
          if (!Number.isNaN(st.landed[i])) continue;
          [st.y[i], st.v[i]] = fallStep(st.y[i], st.v[i], h, K[i], CH29_PIPE.M);
          if (st.y[i] >= CH29_PIPE.L) { st.y[i] = CH29_PIPE.L; st.v[i] = 0; st.landed[i] = st.t; }
        }
      }
      if (st.landed.every((t) => !Number.isNaN(t))) { st.running = false; setRunning(false); }
    }
    draw(el, s, c, st);
  });

  const draw = (el: HTMLCanvasElement, s: StageApi, c: Palette, st: typeof sim.current) => {
    const g = begin(el, H);
    const top = s.sy(CH29_PIPE.L), bot = s.sy(0);
    // metre scale
    g.strokeStyle = c.faint; g.lineWidth = 1;
    g.beginPath(); g.moveTo(26, top); g.lineTo(26, bot); g.moveTo(20, top); g.lineTo(32, top); g.moveTo(20, bot); g.lineTo(32, bot); g.stroke();
    text(g, '1 m', 34, (top + bot) / 2 + 4, c.faint, { size: 12 });
    g.strokeStyle = c.rule; g.lineWidth = 2; g.beginPath(); g.moveTo(60, bot + 2); g.lineTo(630, bot + 2); g.stroke();
    KINDS.forEach(({ kind, label }, i) => {
      const cx = s.sx(KINDS[i].x);
      // the pipe
      if (kind === 'plastic') { g.fillStyle = c.surface; g.strokeStyle = c.ghost; }
      else { g.fillStyle = c.grid; g.strokeStyle = c.soft; }
      g.lineWidth = 2.5; g.globalAlpha = 0.6;
      g.fillRect(cx - HALF, top, 2 * HALF, bot - top); g.globalAlpha = 1;
      g.beginPath(); g.moveTo(cx - HALF, top); g.lineTo(cx - HALF, bot); g.moveTo(cx + HALF, top); g.lineTo(cx + HALF, bot); g.stroke();
      if (kind === 'slotted') { g.strokeStyle = c.surface; g.lineWidth = 4; g.beginPath(); g.moveTo(cx, top); g.lineTo(cx, bot); g.stroke(); }
      text(g, label, cx, bot + 22, c.soft, { size: 13, align: 'center' });
      // the magnet, north pole down
      const my = top + 14 + (st.y[i] / CH29_PIPE.L) * (bot - top - 28);
      g.fillStyle = c.surface; g.strokeStyle = c.ink; g.lineWidth = 2;
      g.fillRect(cx - 11, my - 13, 22, 26); g.strokeRect(cx - 11, my - 13, 22, 26);
      g.fillStyle = c.grid; g.fillRect(cx - 10, my - 12, 20, 12);
      text(g, 'S', cx, my - 2, c.soft, { size: 10, align: 'center', weight: 600 });
      text(g, 'N', cx, my + 11, c.ink, { size: 10, align: 'center', weight: 600 });
      const v = st.v[i];
      // eddy rings on the copper walls
      if (K[i] > 0 && v > 1e-4) {
        for (const zr of [-2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2]) {
          const ring = ringOnFallingMagnet(zr * CH29_PIPE.a, v, 0.004, kind);
          const r = 2 + 6 * Math.min(1, Math.abs(ring.I) / I_REF);
          if (r < 2.6) continue;
          const yy = my - zr * HALF * 1.6;
          drawCurrentEnd(g, cx + HALF, yy, r, ring.I < 0, c.velocity, c.surface);
          drawCurrentEnd(g, cx - HALF, yy, r, ring.I > 0, c.velocity, c.surface);
        }
      }
      // forces: weight down, drag up
      const W = CH29_PIPE.M * G, drag = K[i] * v;
      drawArrow(g, [cx + HALF + 14, my], [cx + HALF + 14, my + W / N_PER_PX], c.force, 2.5);
      if (drag > 1e-4) drawArrow(g, [cx + HALF + 24, my], [cx + HALF + 24, my - drag / N_PER_PX], c.force, 2.5);
      const t = Number.isNaN(st.landed[i]) ? st.t : st.landed[i];
      text(g, `${t.toFixed(2)} s`, cx, bot + 42, Number.isNaN(st.landed[i]) ? c.faint : c.ink, { size: 15, align: 'center', mono: true, weight: 600 });
      text(g, `${(v * 100).toFixed(1)} cm/s`, cx, top - 10, c.velocity, { size: 12, align: 'center', mono: true });
    });
  };

  return (
    <SceneCard prompt={prompt}
      footer={<div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="anth-btn anth-btn-primary" onClick={drop} disabled={running}>
          {running ? 'Falling…' : ran ? 'Drop them again' : 'Drop all three'}
        </button>
      </div>}>
      <Layered x={[0, 3]} y={[-0.16, 1.07]} height={H} canvas={canvas} api={api}
        label="Three vertical pipes, 1 metre long: plastic, copper, and copper with a slot. A magnet waits at the top of each." />
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Real time · 12 mm magnet, 10 g · amber: weight (down) and eddy-current drag (up) · cyan ⊙ ⊗: current round the copper near the magnet · pipes drawn wider than life
      </p>
    </SceneCard>
  );
}

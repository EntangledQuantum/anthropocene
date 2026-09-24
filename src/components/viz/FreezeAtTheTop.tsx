import { useEffect, useRef, useState } from 'react';
import { G, apexHeight, throwState } from '../../lib/physics/line-motion.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { arrow, prep, readColors, text, type Colors } from './line-canvas.ts';

/**
 * A ball thrown straight up, at half speed, and one button: throw, then
 * freeze. The cyan arrow is the velocity and shrinks, vanishes and grows back
 * pointing down; the magenta arrow is the acceleration and never changes. The
 * trace on the right is v(t), one straight line that crosses zero without a
 * kink. Freeze it at the top and the frame says what the slogan hides: at
 * rest, and accelerating exactly as hard as at the throw.
 *
 * Physics: `throwState` from line-motion.ts, evaluated exactly at each frame.
 */
export interface FreezeAtTheTopProps {
  id?: string;
  prompt?: string;
  /** Launch speed, m/s. */
  speed?: number;
  /** Playback rate: 0.5 is half speed. */
  slow?: number;
  /** |v| at the freeze that counts as the top, m/s. */
  tolerance?: number;
  explanation?: string;
}

type Phase = 'ready' | 'flying' | 'frozen' | 'landed';
const PX_PER_MS = 5; // arrow pixels per m/s and per m/s²

export default function FreezeAtTheTop({ id, prompt, speed = 12, slow = 0.5, tolerance = 1, explanation }: FreezeAtTheTopProps) {
  const task = useTask(id, 'freeze-at-the-top');
  const canvas = useRef<HTMLCanvasElement>(null);
  const tLand = (2 * speed) / G;
  const sim = useRef({ phase: 'ready' as Phase, t: 0, t0: 0 });
  const [shown, setShown] = useState({ phase: 'ready' as Phase, t: 0 });

  useEffect(() => {
    let raf = 0, lastShown = 0, lastPhase: Phase = 'ready';
    const c = readColors();
    const frame = (now: number) => {
      const s = sim.current;
      if (s.phase === 'flying') {
        s.t = ((now - s.t0) / 1000) * slow;
        if (s.t >= tLand) { s.t = tLand; s.phase = 'landed'; }
      }
      if (canvas.current) draw(canvas.current, c);
      if (now - lastShown > 120 || s.phase !== lastPhase) { lastShown = now; lastPhase = s.phase; setShown({ phase: s.phase, t: s.t }); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const draw = (el: HTMLCanvasElement, c: Colors) => {
    const { g, W, H } = prep(el);
    const s = sim.current, st = throwState(speed, s.t);
    const top = 22, bot = H - 34, hMax = Math.ceil(apexHeight(speed) * 1.2);
    const yOf = (h: number) => bot - (h / hMax) * (bot - top);
    // the height column
    for (let h = 0; h <= hMax; h += 2) {
      g.strokeStyle = h ? c.grid : c.rule; g.lineWidth = h ? 1 : 2;
      g.beginPath(); g.moveTo(44, yOf(h)); g.lineTo(230, yOf(h)); g.stroke();
      text(g, String(h), 38, yOf(h) + 4, c.faint, 'right', 12, 400, true);
    }
    text(g, 'height (m)', 48, top - 8, c.faint, 'left', 13);
    const bx = 120, by = yOf(Math.max(0, st.y)) - 9;
    g.fillStyle = c.surf; g.strokeStyle = c.ink; g.lineWidth = 2.5;
    g.beginPath(); g.arc(bx, by, 9, 0, Math.PI * 2); g.fill(); g.stroke();
    if (s.phase === 'flying' || s.phase === 'frozen') {
      arrow(g, bx - 16, by, bx - 16, by - st.v * PX_PER_MS, c.v, s.phase === 'frozen' ? `v = ${Math.abs(st.v).toFixed(1)} m/s` : undefined);
      arrow(g, bx + 16, by, bx + 16, by + G * PX_PER_MS, c.a, s.phase === 'frozen' ? `a = ${G.toFixed(2)} m/s² down` : 'a');
    }
    if (s.phase === 'frozen') text(g, `frozen at ${st.y.toFixed(1)} m`, bx + 30, by - 14, c.ink, 'left', 12, 600);

    // v(t): one straight line
    const left = 290, right = W - 14, vTop = speed * 1.15;
    const tx = (t: number) => left + (t / (tLand * 1.05)) * (right - left);
    const vy = (v: number) => (top + bot) / 2 - (v / vTop) * (bot - top) / 2;
    for (const v of [-10, -5, 0, 5, 10]) {
      g.strokeStyle = v ? c.grid : c.rule; g.lineWidth = v ? 1 : 1.4;
      g.beginPath(); g.moveTo(left, vy(v)); g.lineTo(right, vy(v)); g.stroke();
      text(g, v < 0 ? `−${-v}` : String(v), left - 6, vy(v) + 4, c.faint, 'right', 12, 400, true);
    }
    for (let t = 0; t <= tLand * 1.05; t += 0.5) text(g, t.toFixed(1), tx(t), bot + 17, c.faint, 'center', 12, 400, true);
    text(g, 'velocity (m/s), up is +', left + 4, top - 8, c.faint, 'left', 13);
    text(g, 'time (s)', right, bot - 7, c.faint, 'right', 13);
    if (s.t > 0) {
      g.strokeStyle = c.v; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(tx(0), vy(speed)); g.lineTo(tx(s.t), vy(st.v)); g.stroke();
      g.fillStyle = c.v; g.beginPath(); g.arc(tx(s.t), vy(st.v), 4.5, 0, Math.PI * 2); g.fill();
    }
  };

  const press = () => {
    const s = sim.current;
    if (s.phase === 'flying') s.phase = 'frozen';
    else { s.phase = 'flying'; s.t = 0; s.t0 = performance.now(); }
    setShown({ phase: s.phase, t: s.t });
    task.touch();
  };

  const st = throwState(speed, shown.t);
  const airborne = shown.phase === 'flying' || shown.phase === 'frozen';
  const hitNow = shown.phase === 'frozen' && Math.abs(st.v) <= tolerance;
  const miss = shown.phase === 'ready' ? 'Throw first, then freeze it.'
    : shown.phase === 'flying' ? 'Still flying. Freeze it first.'
      : shown.phase === 'landed' ? 'The ball has landed. Throw again and freeze it at the top.'
        : `Frozen at ${st.y.toFixed(1)} m, still ${st.v > 0 ? 'rising' : 'falling'} at ${Math.abs(st.v).toFixed(1)} m/s.`;
  const label = shown.phase === 'flying' ? 'Freeze' : shown.phase === 'ready' ? 'Throw' : 'Throw again';

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={press} style={{ minWidth: 120 }}>{label}</button>
          <span className="hud-label">half speed</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Velocity" value={airborne ? st.v.toFixed(1) : '0.0'} unit="m/s" color={C.velocity} />
            <Meter label="Acceleration" value={airborne ? (-G).toFixed(2) : '0.00'} unit="m/s²" color={C.accel} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(hitNow, { v: st.v })} miss={miss} hit={explanation} />}
      </div>}>
      <canvas ref={canvas} style={{ width: '100%', height: 340, display: 'block' }}
        aria-label={`Ball thrown up at ${speed} metres per second; ${shown.phase}; height ${st.y.toFixed(1)} metres, velocity ${st.v.toFixed(1)} metres per second.`} />
    </SceneCard>
  );
}

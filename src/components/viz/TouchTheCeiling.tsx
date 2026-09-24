import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { G, apexHeight, ceilingOutcome, throwState } from '../../lib/physics/line-motion.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';
import { arrow, local, prep, readColors, text, type Colors } from './line-canvas.ts';

/**
 * A ball, a hall, and a ceiling. Drag the tip of the cyan launch arrow to set
 * the throw speed, then throw. A dashed line marks where a slower throw
 * peaked, which is the trap: ten metres is four times that height, and four
 * times the speed is far too much. Heights go as the square of the speed,
 * the same triangle as a braking car turned on its end.
 *
 * Physics: `throwState`, `apexHeight`, `ceilingOutcome` from line-motion.ts.
 */
export interface TouchTheCeilingProps {
  id?: string;
  prompt?: string;
  /** Ceiling height above the hand, m. */
  ceiling?: number;
  /** A slower throw whose peak is marked, m/s. */
  reference?: number;
  start?: number;
  vmax?: number;
  /** How far the peak may miss the ceiling, m. */
  tolerance?: number;
  explanation?: string;
}

const K = 8; // arrow pixels per m/s

export default function TouchTheCeiling({
  id, prompt, ceiling = 10, reference = 7, start = 5, vmax = 30, tolerance = 0.5, explanation,
}: TouchTheCeilingProps) {
  const task = useTask(id, 'touch-the-ceiling');
  const canvas = useRef<HTMLCanvasElement>(null);
  const [v0, setV0] = useState(start);
  const v0Ref = useRef(v0);
  v0Ref.current = v0;
  const holding = useRef(false);
  const fly = useRef({ on: false, t0: 0, y: 0, v: 0 });
  const [thrown, setThrown] = useState<null | { v0: number; apex: number; hitSpeed: number; reaches: boolean }>(null);

  useEffect(() => {
    let raf = 0, last = performance.now();
    const c = readColors();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const f = fly.current;
      if (f.on) {
        const t = (now - f.t0) / 1000;
        if (f.v >= 0 && f.y < ceiling) {
          // rising or free: exact constant-acceleration state from launch
          const st = throwState(v0Ref.current, t);
          f.y = st.y; f.v = st.v;
          if (f.y >= ceiling) { f.y = ceiling; f.v = -0.4 * ceilingOutcome(v0Ref.current, ceiling).hitSpeed; }
        } else {
          f.v -= G * dt; f.y += f.v * dt;
        }
        if (f.y <= 0 && f.v < 0) { f.y = 0; f.v = 0; f.on = false; }
      }
      if (canvas.current) draw(canvas.current, c);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const geo = (H: number) => {
    const top = 26, bot = H - 26, hMax = ceiling * 1.2;
    return { bot, bx: 250, yOf: (h: number) => bot - (h / hMax) * (bot - top), hMax };
  };

  const draw = (el: HTMLCanvasElement, c: Colors) => {
    const { g, W, H } = prep(el);
    const { bot, bx, yOf, hMax } = geo(H);
    for (let h = 0; h <= hMax; h += 2) {
      g.strokeStyle = h ? c.grid : c.rule; g.lineWidth = h ? 1 : 2;
      g.beginPath(); g.moveTo(52, yOf(h)); g.lineTo(W - 16, yOf(h)); g.stroke();
      text(g, String(h), 46, yOf(h) + 4, c.faint, 'right', 12, 400, true);
    }
    text(g, 'height above the hand (m)', 56, 16, c.faint, 'left', 13);
    // the ceiling
    const cy = yOf(ceiling);
    g.fillStyle = c.rule; g.fillRect(52, cy - 4, W - 68, 4);
    g.strokeStyle = c.grid; g.lineWidth = 1;
    for (let x = 60; x < W - 16; x += 14) { g.beginPath(); g.moveTo(x, cy - 4); g.lineTo(x + 8, cy - 12); g.stroke(); }
    text(g, `ceiling, ${ceiling} m`, W - 20, cy + 16, c.ink, 'right', 13, 600);
    // where a slower throw peaked
    const ry = yOf(apexHeight(reference));
    g.setLineDash([6, 6]); g.strokeStyle = c.soft; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(52, ry); g.lineTo(W - 16, ry); g.stroke(); g.setLineDash([]);
    text(g, `a ${reference} m/s throw peaks here, ${apexHeight(reference).toFixed(1)} m`, W - 20, ry - 6, c.soft, 'right', 12);
    // the ball, and its velocity arrow on a fixed scale
    const f = fly.current, y = f.on ? f.y : 0, v = f.on ? f.v : v0Ref.current;
    const by = yOf(y) - 9;
    g.fillStyle = c.surf; g.strokeStyle = c.ink; g.lineWidth = 2.5;
    g.beginPath(); g.arc(bx, by, 9, 0, Math.PI * 2); g.fill(); g.stroke();
    arrow(g, bx + 22, by, bx + 22, by - v * K, c.v);
    if (!f.on) {
      g.fillStyle = c.surf; g.strokeStyle = c.v; g.lineWidth = 2.5;
      g.beginPath(); g.arc(bx + 22, by - v * K, 8, 0, Math.PI * 2); g.fill(); g.stroke();
      g.font = '600 13px Inter, sans-serif'; g.textAlign = 'left';
      g.strokeStyle = c.surf; g.lineWidth = 5; g.lineJoin = 'round';
      g.strokeText(`launch ${v.toFixed(1)} m/s`, bx + 38, by - v * K + 5);
      g.fillStyle = c.v; g.fillText(`launch ${v.toFixed(1)} m/s`, bx + 38, by - v * K + 5);
    }
    if (thrown && !f.on) {
      const ay = yOf(Math.min(thrown.apex, ceiling));
      g.strokeStyle = c.x; g.lineWidth = 2;
      g.beginPath(); g.moveTo(bx - 40, ay); g.lineTo(bx + 4, ay); g.stroke();
      text(g, thrown.reaches ? `hit at ${thrown.hitSpeed.toFixed(1)} m/s` : `peaked at ${thrown.apex.toFixed(1)} m`, bx - 46, ay + 4, c.x, 'right', 12, 600);
    }
    g.strokeStyle = c.rule; g.lineWidth = 2; g.beginPath(); g.moveTo(bx - 30, bot); g.lineTo(bx + 30, bot); g.stroke();
  };

  const onPointer = (e: RPointerEvent<HTMLCanvasElement>, kind: 'down' | 'move' | 'up') => {
    const el = canvas.current!;
    const { px, py } = local(el, e);
    const { bot, bx } = geo(el.clientHeight);
    if (kind === 'down' && Math.abs(px - (bx + 22)) < 40 && !fly.current.on) { holding.current = true; el.setPointerCapture(e.pointerId); }
    if (kind === 'up') { holding.current = false; return; }
    if (holding.current) set((bot - 9 - py) / K);
  };
  const set = (v: number) => { setV0(Math.round(Math.max(1, Math.min(vmax, v)) * 10) / 10); setThrown(null); task.touch(); };
  const throwIt = () => {
    fly.current = { on: true, t0: performance.now(), y: 0, v: v0 };
    setThrown({ v0, ...ceilingOutcome(v0, ceiling) });
    task.touch();
  };

  const hitNow = thrown !== null && Math.abs(thrown.apex - ceiling) <= tolerance;
  const miss = thrown === null ? 'Throw first, then check.'
    : thrown.reaches
      ? `Launched at ${thrown.v0.toFixed(1)} m/s, the ball hit the ceiling still rising at ${thrown.hitSpeed.toFixed(1)} m/s.`
      : `Launched at ${thrown.v0.toFixed(1)} m/s, the ball peaked at ${thrown.apex.toFixed(1)} m, ${(ceiling - thrown.apex).toFixed(1)} m below the ceiling.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={throwIt}>Throw</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Launch speed" value={v0.toFixed(1)} unit="m/s" color={C.velocity} />
            <Meter label="Highest point" value={thrown ? Math.min(thrown.apex, ceiling).toFixed(1) : '–'} unit="m" color={C.position} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(hitNow, { v0: thrown?.v0 })} miss={miss} hit={explanation} />}
      </div>}>
      <canvas ref={canvas} tabIndex={0} style={{ width: '100%', height: 380, display: 'block', touchAction: 'none', cursor: 'ns-resize' }}
        aria-label={`Launch speed ${v0.toFixed(1)} metres per second, ceiling ${ceiling} metres. Arrow keys change the speed.`}
        onPointerDown={(e) => onPointer(e, 'down')} onPointerMove={(e) => onPointer(e, 'move')}
        onPointerUp={(e) => onPointer(e, 'up')} onPointerCancel={(e) => onPointer(e, 'up')}
        onKeyDown={(e) => {
          const d = e.key === 'ArrowUp' ? 0.1 : e.key === 'ArrowDown' ? -0.1 : 0;
          if (!d || fly.current.on) return;
          e.preventDefault();
          set(v0Ref.current + d);
        }} />
    </SceneCard>
  );
}

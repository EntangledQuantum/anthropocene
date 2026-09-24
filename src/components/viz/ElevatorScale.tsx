import { useEffect, useRef, useState } from 'react';
import { liftState } from '../../lib/physics/pairs-ch04.ts';
import { C, CheckBar, Meter, SceneCard, useTask } from './scene.tsx';

/**
 * A rider on a bathroom scale in a lift, and one control: the winch's pull on
 * the cable. The lift speeds up, slows down or falls; the shaft scrolls past.
 *
 * On the rider, two amber arrows: the Earth's pull, which never changes, and
 * the scale's push, which is the number the scale shows. The lift's velocity
 * (cyan) and acceleration (magenta) sit beside the cage, so the learner can see
 * that the reading follows the second and ignores the first.
 *
 * Physics: `liftState` from src/lib/physics/pairs-ch04.ts. The loop lives in
 * refs; React hears about it at ~8 Hz.
 * Graded with `id` + `target`: make the scale read `target` newtons.
 */
export interface ElevatorScaleProps {
  id?: string;
  prompt?: string;
  mLift?: number;
  mRider?: number;
  /** Starting winch pull, N. Defaults to exactly holding the lift's weight. */
  tension0?: number;
  /** Winch range, N. */
  range?: [number, number];
  /** Starting velocity, m/s, up positive. */
  v0?: number;
  target?: number;
  tolerance?: number;
  explanation?: string;
}

const V_STOP = 18; // m/s: the ride pauses here so the shaft stays readable
const PX_M = 26; // px per metre of shaft
const N_PX = 0.12; // px per newton on the rider

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ccc';
}

export default function ElevatorScale({
  id, prompt, mLift = 500, mRider = 70, tension0, range = [3000, 8000], v0 = 2, target, tolerance = 8, explanation,
}: ElevatorScaleProps) {
  const graded = Boolean(id && target !== undefined);
  const task = useTask(graded ? id : undefined, 'elevator-scale');
  const T0 = tension0 ?? Math.round((mLift + mRider) * 9.81);
  const [T, setT] = useState(T0);
  const tRef = useRef(T0);
  const ride = useRef({ y: 0, v: v0, paused: false });
  const canvas = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState({ v: v0, paused: false });

  const st = liftState(T, mLift, mRider);

  const reset = () => { ride.current = { y: 0, v: v0, paused: false }; };
  const onWinch = (v: number) => {
    setT(v); tRef.current = v; task.touch();
    if (ride.current.paused) ride.current = { ...ride.current, v: 0, paused: false };
  };

  useEffect(() => {
    let raf = 0, last = performance.now(), lastShown = 0;
    const col = {
      ink: cssVar('--color-ink'), soft: cssVar('--color-ink-soft'), faint: cssVar('--color-ink-faint'),
      rule: cssVar('--color-rule-bright'), grid: cssVar('--color-rule'), surf: cssVar('--color-surface'),
      f: cssVar('--color-amber'), a: cssVar('--color-magenta'), v: cssVar('--color-cyan'),
    };
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const r = ride.current;
      const s = liftState(tRef.current, mLift, mRider);
      if (!r.paused) {
        r.y += r.v * dt + 0.5 * s.a * dt * dt;
        r.v += s.a * dt;
        if (Math.abs(r.v) > V_STOP) r.paused = true;
      }
      if (canvas.current) draw(canvas.current, r, s, col);
      if (now - lastShown > 120) { lastShown = now; setShown({ v: r.v, paused: r.paused }); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [mLift, mRider]);

  const draw = (el: HTMLCanvasElement, r: { y: number; v: number; paused: boolean }, s: ReturnType<typeof liftState>, c: Record<string, string>) => {
    const dpr = window.devicePixelRatio || 1;
    const Wd = el.clientWidth, Ht = el.clientHeight;
    if (el.width !== Math.round(Wd * dpr)) { el.width = Math.round(Wd * dpr); el.height = Math.round(Ht * dpr); }
    const g = el.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, Wd, Ht);

    const cx = Wd * 0.36, cw = 260, ch = 210, top = (Ht - ch) / 2 + 10, floor = top + ch;
    // ── the shaft: walls with floor marks every 3 m scrolling past the cage
    g.strokeStyle = c.rule; g.lineWidth = 2;
    for (const x of [cx - cw / 2 - 16, cx + cw / 2 + 16]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, Ht); g.stroke(); }
    g.font = '12px ui-monospace, monospace'; g.fillStyle = c.faint; g.textAlign = 'right';
    const base = Math.floor((r.y - 10) / 3) * 3;
    for (let fy = base; fy < r.y + 10; fy += 3) {
      const py = floor - (fy - r.y) * PX_M;
      if (py < -10 || py > Ht + 10) continue;
      g.strokeStyle = c.grid; g.lineWidth = 1;
      g.beginPath(); g.moveTo(cx - cw / 2 - 40, py); g.lineTo(cx - cw / 2 - 16, py); g.stroke();
      g.fillText(`${fy} m`, cx - cw / 2 - 44, py + 4);
    }
    // ── cable and cage
    g.strokeStyle = c.soft; g.lineWidth = 2;
    if (tRef.current > 0) { g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx, top); g.stroke(); }
    else { g.setLineDash([3, 5]); g.beginPath(); g.moveTo(cx, top - 40); g.lineTo(cx, top); g.stroke(); g.setLineDash([]); }
    g.fillStyle = c.surf; g.strokeStyle = c.soft;
    g.beginPath(); g.roundRect(cx - cw / 2, top, cw, ch, 6); g.fill(); g.stroke();
    // ── the scale, with its own display
    g.fillStyle = c.surf; g.strokeStyle = c.ink; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(cx - 44, floor - 16, 88, 14, 3); g.fill(); g.stroke();
    // ── the rider
    const feet = floor - 16, hip = feet - 58, neck = hip - 52;
    g.strokeStyle = c.ink; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - 10, feet); g.lineTo(cx, hip); g.lineTo(cx + 10, feet);
    g.moveTo(cx, hip); g.lineTo(cx, neck); g.moveTo(cx - 20, neck + 28); g.lineTo(cx, neck + 8); g.lineTo(cx + 20, neck + 28); g.stroke();
    g.beginPath(); g.arc(cx, neck - 12, 11, 0, Math.PI * 2); g.stroke();
    // ── forces on the rider, both from the chest: the pull that never changes and the push that is read
    const chest = hip - 20;
    arrowV(g, cx - 30, chest, chest + s.riderWeight * N_PX, c.f, `Earth on you\n${s.riderWeight.toFixed(0)} N`, 'left');
    arrowV(g, cx + 30, chest, chest - s.scale * N_PX, c.f, `scale on you\n${s.scale.toFixed(0)} N`, 'right');
    // ── the lift's motion, beside the cage
    const mx = cx + cw / 2 + 60, my = top + ch / 2;
    arrowV(g, mx, my, my - r.v * 8, c.v, 'v', 'right');
    arrowV(g, mx + 50, my, my - s.a * 12, c.a, 'a', 'right', true);
    g.fillStyle = c.faint; g.font = '13px Inter, sans-serif'; g.textAlign = 'left';
    g.fillText('the lift', mx - 8, top - 8);
    if (r.paused) {
      g.fillStyle = c.ink; g.font = '600 14px Inter, sans-serif'; g.textAlign = 'center';
      g.fillText(`Paused at ${V_STOP} m/s: start over`, cx, top - 14);
    }
  };

  const r = st.scale, d = r - (target ?? 0);
  const way = (x: number) => (Math.abs(x) < 0.005 ? '' : x > 0 ? ' ↑' : ' ↓');
  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'end' }}>
          <Meter label="Scale reads" value={r.toFixed(0)} unit="N" color={C.force} />
          <Meter label="Lift’s velocity" value={`${Math.abs(shown.v).toFixed(1)}${way(shown.v)}`} unit="m/s" color={C.velocity} />
          <Meter label="Lift’s acceleration" value={`${Math.abs(st.a).toFixed(2)}${way(st.a)}`} unit="m/s²" color={C.accel} />
          <button type="button" className="anth-btn" style={{ marginLeft: 'auto' }} onClick={reset}>Start over</button>
        </div>
        <label style={{ display: 'block' }}>
          <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span className="hud-label">Winch pull on the cable</span>
            <span className="readout" style={{ fontSize: 13, color: C.ink }}>{T.toFixed(0)}<span style={{ color: C.faint }}> N</span></span>
          </span>
          <input type="range" className="anth-slider" min={range[0]} max={range[1]} step={5} value={T}
            aria-label="Winch pull on the cable, newtons" onChange={(e) => onWinch(+e.target.value)} />
        </label>
        {graded && <CheckBar verdict={task.verdict} done={task.done}
          onCheck={() => task.check(Math.abs(d) <= tolerance, { tension: T })}
          miss={Math.abs(st.a) < 0.005
            ? `The lift is not accelerating, so the scale reads the full ${st.riderWeight.toFixed(0)} N, at any speed.`
            : `The scale reads ${r.toFixed(0)} N, ${Math.abs(d).toFixed(0)} N ${d > 0 ? 'over' : 'under'} ${target}. The lift accelerates at ${Math.abs(st.a).toFixed(2)} m/s² ${st.a > 0 ? 'upward' : 'downward'}.`}
          hit={explanation} />}
      </div>}>
      <canvas ref={canvas} style={{ width: '100%', height: 340, display: 'block' }}
        aria-label={`Lift with a ${mRider} kilogram rider on a scale. The scale reads ${r.toFixed(0)} newtons; the rider's weight is ${st.riderWeight.toFixed(0)} newtons.`} />
    </SceneCard>
  );
}

function arrowV(g: CanvasRenderingContext2D, x: number, y1: number, y2: number, color: string, label: string, side: 'left' | 'right', dashed = false) {
  if (Math.abs(y2 - y1) < 3) {
    g.fillStyle = color; g.beginPath(); g.arc(x, y1, 3, 0, Math.PI * 2); g.fill();
  } else {
    const dir = Math.sign(y2 - y1);
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 3;
    if (dashed) g.setLineDash([7, 5]);
    g.beginPath(); g.moveTo(x, y1); g.lineTo(x, y2 - dir * 10); g.stroke(); g.setLineDash([]);
    g.beginPath(); g.moveTo(x, y2); g.lineTo(x - 6, y2 - dir * 12); g.lineTo(x + 6, y2 - dir * 12); g.closePath(); g.fill();
  }
  g.fillStyle = color; g.font = '600 13px Inter, sans-serif'; g.textAlign = side === 'right' ? 'left' : 'right';
  const lines = label.split('\n');
  const ly = Math.abs(y2 - y1) < 3 ? y1 + 4 : y2 > y1 ? y2 - 4 - 15 * (lines.length - 1) : y2 + 12;
  lines.forEach((t, i) => g.fillText(t, x + (side === 'right' ? 8 : -8), ly + 15 * i));
}

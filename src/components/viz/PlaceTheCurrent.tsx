import { useEffect, useRef, useState } from 'react';
import { SINGLE, abs, cx, deg, lead, rad, singleCurrent, wrap, type Element } from '../../lib/physics/ac.ts';
import { C, CheckBar, SceneCard, useTask } from './scene.tsx';

/**
 * One element on a 10 V, 50 Hz supply, slowed 200× so a cycle takes 4 s.
 * Left, the circuit: a capacitor whose plates fill and empty (or a coil), and
 * a cyan arrow on the wire for the current. Middle, the two phasors turning
 * together: voltage (iris) and current (cyan). Right, one cycle of both
 * shadows with a cursor at "now".
 *
 * Ungraded (no `id`): the current arrow sits where the physics puts it.
 * Graded: the current arrow is yours. Drag it (time pauses while you hold it)
 * to where this element's current must be. The circuit keeps obeying your
 * arrow, so a wrong one shows current flowing out of plates that are filling.
 * Physics: singleCurrent / lead in src/lib/physics/ac.ts.
 */
export interface PlaceTheCurrentProps {
  id?: string;
  prompt?: string;
  element: 'capacitor' | 'inductor';
  /** Where your current arrow starts, degrees ahead of the voltage. */
  start?: number;
  tolerance?: number;
  explanation?: string;
}

const PERIOD = 4; // seconds on screen per cycle
const PC = { x: 330, y: 150, r: 82 }; // phasor circle
const ST = { x0: 452, x1: 624, y: 150, a: 82 }; // strip

function cssVar(name: string) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ccc'; }

export default function PlaceTheCurrent({ id, prompt, element, start = 0, tolerance = 8, explanation }: PlaceTheCurrentProps) {
  const graded = Boolean(id);
  const task = useTask(id, 'place-the-current');
  const Iph = singleCurrent(element as Element);
  const I0 = abs(Iph) * 1000; // mA
  const truth = lead(Iph, cx(SINGLE.V0));
  const [offset, setOffset] = useState(graded ? rad(start) : truth);
  const [playing, setPlaying] = useState(true);
  const off = useRef(offset); off.current = offset;
  const play = useRef(playing); play.current = playing;
  const theta = useRef(0);
  const dragging = useRef(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = {
      ink: cssVar('--color-ink'), soft: cssVar('--color-ink-soft'), faint: cssVar('--color-ink-faint'), grid: cssVar('--color-rule'),
      rule: cssVar('--color-rule-bright'), v: cssVar('--color-iris'), i: cssVar('--color-cyan'), q: cssVar('--color-orchid'), surf: cssVar('--color-surface'),
    };
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      if (play.current && !dragging.current) theta.current = (theta.current + (2 * Math.PI * dt) / PERIOD) % (2 * Math.PI);
      if (canvas.current) draw(canvas.current, theta.current, off.current, c);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const draw = (el: HTMLCanvasElement, th: number, of: number, c: Record<string, string>) => {
    const dpr = window.devicePixelRatio || 1, W = el.clientWidth, H = el.clientHeight;
    if (el.width !== Math.round(W * dpr)) { el.width = Math.round(W * dpr); el.height = Math.round(H * dpr); }
    const g = el.getContext('2d')!;
    g.setTransform((dpr * W) / 640, 0, 0, (dpr * W) / 640, 0, 0);
    g.clearRect(0, 0, 640, 330);
    const v = SINGLE.V0 * Math.sin(th), i = I0 * Math.sin(th + of);
    const dv = Math.cos(th), di = Math.cos(th + of);
    const txt = (s: string, x: number, y: number, col: string, align: CanvasTextAlign = 'left', size = 13, w = 400) => {
      g.font = `${w} ${size}px Inter, sans-serif`; g.fillStyle = col; g.textAlign = align; g.fillText(s, x, y);
    };
    const arrow = (x1: number, y1: number, x2: number, y2: number, col: string, wd = 3) => {
      const L = Math.hypot(x2 - x1, y2 - y1); if (L < 3) return;
      const ux = (x2 - x1) / L, uy = (y2 - y1) / L, h = Math.min(12, L / 2);
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = wd; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2 - ux * h, y2 - uy * h); g.stroke();
      g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - ux * h - uy * 6, y2 - uy * h + ux * 6); g.lineTo(x2 - ux * h + uy * 6, y2 - uy * h - ux * 6); g.closePath(); g.fill();
    };

    // ── the circuit
    const XS = 44, XE = 196, YT = 60, YB = 250, YM = 155;
    g.strokeStyle = c.soft; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(XS, YM - 20); g.lineTo(XS, YT); g.lineTo(XE, YT); g.lineTo(XE, element === 'capacitor' ? YM - 9 : YM - 45); g.stroke();
    g.beginPath(); g.moveTo(XE, element === 'capacitor' ? YM + 9 : YM + 45); g.lineTo(XE, YB); g.lineTo(XS, YB); g.lineTo(XS, YM + 20); g.stroke();
    g.strokeStyle = c.ink; g.lineWidth = 2; g.beginPath(); g.arc(XS, YM, 20, 0, 2 * Math.PI); g.stroke();
    g.beginPath(); for (let k = 0; k <= 20; k++) { const x = XS - 11 + (22 * k) / 20; const y = YM - 6 * Math.sin((2 * Math.PI * k) / 20); if (k) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
    txt('10 V, 50 Hz', XS, YB + 26, c.faint, 'center', 12);
    txt(`${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} V`, XE + 14, YT + 30, c.v, 'left', 14, 600);
    if (element === 'capacitor') {
      g.strokeStyle = c.ink; g.lineWidth = 3;
      for (const y of [YM - 9, YM + 9]) { g.beginPath(); g.moveTo(XE - 30, y); g.lineTo(XE + 30, y); g.stroke(); }
      const n = Math.round(Math.abs(v) / SINGLE.V0 * 8), top = v >= 0 ? '+' : '−', bot = v >= 0 ? '−' : '+';
      for (let k = 0; k < n; k++) { txt(top, XE - 26 + k * 7, YM - 15, c.q, 'left', 12); txt(bot, XE - 26 + k * 7, YM + 26, c.q, 'left', 12); }
      txt('10 µF', XE - 36, YM + 4, c.faint, 'right', 12);
      txt(dv > 0.05 ? (v >= 0 ? 'plates filling' : 'plates emptying') : dv < -0.05 ? (v >= 0 ? 'plates emptying' : 'plates filling') : 'plates full', XE + 36, YM + 4, c.q, 'left', 12);
    } else {
      g.strokeStyle = c.ink; g.lineWidth = 2.2; g.beginPath(); g.moveTo(XE, YM - 45);
      for (let k = 0; k < 5; k++) g.arc(XE, YM - 36 + k * 18, 9, -Math.PI / 2, Math.PI / 2, false);
      g.lineTo(XE, YM + 45); g.stroke();
      txt('1 H', XE - 18, YM + 4, c.faint, 'right', 12);
      txt(v > 0.3 ? 'pushes current up' : v < -0.3 ? 'pushes current down' : 'no push', XE + 18, YM + 4, c.v, 'left', 12);
    }
    const len = (i / I0) * 64;
    arrow(120 - len / 2, YT - 16, 120 + len / 2, YT - 16, c.i, 3.5);
    txt(`${i >= 0 ? '+' : '−'}${Math.abs(i).toFixed(1)} mA`, 120, YT - 30, c.i, 'center', 14, 600);
    txt(Math.abs(di) < 0.05 ? 'current steady' : di > 0 ? 'current rising' : 'current falling', 120, YT + 20, c.i, 'center', 12);

    // ── the phasors
    g.strokeStyle = c.rule; g.setLineDash([3, 5]); g.lineWidth = 1;
    g.beginPath(); g.arc(PC.x, PC.y, PC.r, 0, 2 * Math.PI); g.stroke(); g.setLineDash([]);
    g.strokeStyle = c.grid; g.beginPath(); g.moveTo(PC.x - PC.r - 8, PC.y); g.lineTo(ST.x1, PC.y); g.stroke();
    const tipV = [PC.x + PC.r * Math.cos(th), PC.y - PC.r * Math.sin(th)], rI = PC.r * 0.78;
    const tipI = [PC.x + rI * Math.cos(th + of), PC.y - rI * Math.sin(th + of)];
    const X = (a: number) => ST.x0 + (((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * (ST.x1 - ST.x0);
    g.setLineDash([4, 4]); g.lineWidth = 1;
    g.strokeStyle = c.v; g.beginPath(); g.moveTo(tipV[0], tipV[1]); g.lineTo(X(th), tipV[1]); g.stroke();
    g.strokeStyle = c.i; g.beginPath(); g.moveTo(tipI[0], tipI[1]); g.lineTo(X(th), tipI[1]); g.stroke(); g.setLineDash([]);
    arrow(PC.x, PC.y, tipV[0], tipV[1], c.v, 3.5);
    arrow(PC.x, PC.y, tipI[0], tipI[1], c.i, 3.5);
    txt('voltage', tipV[0] + 10 * Math.cos(th), tipV[1] - 10 * Math.sin(th) + 4, c.v, Math.cos(th) > 0.3 ? 'left' : Math.cos(th) < -0.3 ? 'right' : 'center', 13, 600);
    txt('current', tipI[0] + 10 * Math.cos(th + of), tipI[1] - 10 * Math.sin(th + of) + 4, c.i, Math.cos(th + of) > 0.3 ? 'left' : Math.cos(th + of) < -0.3 ? 'right' : 'center', 13, 600);
    if (graded) { g.strokeStyle = c.i; g.lineWidth = 2.5; g.fillStyle = c.surf; g.beginPath(); g.arc(tipI[0], tipI[1], 8, 0, 2 * Math.PI); g.fill(); g.stroke(); }
    txt('both turn anticlockwise', PC.x, PC.y + PC.r + 26, c.faint, 'center', 12);

    // ── the strip: one cycle of each shadow
    for (const k of [0, 1, 2, 3, 4]) { const x = ST.x0 + (k / 4) * (ST.x1 - ST.x0); g.strokeStyle = c.grid; g.beginPath(); g.moveTo(x, ST.y - ST.a); g.lineTo(x, ST.y + ST.a); g.stroke(); txt(`${k * 5}`, x, ST.y + ST.a + 16, c.faint, 'center', 11); }
    txt('ms into the cycle', ST.x1, ST.y + ST.a + 32, c.faint, 'right', 11);
    txt(`${SINGLE.V0} V`, ST.x0 - 4, ST.y - PC.r + 4, c.v, 'right', 11); txt(`−${SINGLE.V0} V`, ST.x0 - 4, ST.y + PC.r + 4, c.v, 'right', 11);
    txt(`${I0.toFixed(0)} mA`, ST.x0 - 4, ST.y - rI + 16, c.i, 'right', 11);
    for (const [amp, ph, col] of [[PC.r, 0, c.v], [rI, of, c.i]] as const) {
      g.strokeStyle = col; g.lineWidth = 2.2; g.beginPath();
      for (let k = 0; k <= 120; k++) { const a = (k / 120) * 2 * Math.PI; const x = ST.x0 + (k / 120) * (ST.x1 - ST.x0), y = ST.y - amp * Math.sin(a + ph); if (k) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }
    g.strokeStyle = c.ink; g.lineWidth = 1; g.beginPath(); g.moveTo(X(th), ST.y - ST.a - 6); g.lineTo(X(th), ST.y + ST.a + 4); g.stroke();
    txt('now', X(th), ST.y - ST.a - 10, c.ink, 'center', 11);
  };

  const setFromPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), k = 640 / r.width;
    const x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k;
    setOffset(wrap(Math.atan2(PC.y - y, x - PC.x) - theta.current)); task.touch();
  };

  const offDeg = deg(wrap(offset));
  const hit = Math.abs(deg(wrap(offset - truth))) <= tolerance;
  const f = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`;
  const miss = element === 'capacitor'
    ? `As the voltage rises through zero the plates fill their fastest, which takes ${f(I0)} mA flowing in. Your current there is ${f(I0 * Math.sin(offset))} mA.`
    : `At the voltage peak the coil drives its current upward its fastest, through zero. Your current there is ${f(I0 * Math.cos(offset))} mA and ${Math.abs(Math.sin(offset)) < 0.09 ? 'not changing' : -Math.sin(offset) > 0 ? 'rising' : 'falling'}.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
          {graded && <span className="readout" style={{ color: C.velocity }}>
            current {Math.abs(offDeg) < 0.5 ? 'in step with' : `${Math.abs(offDeg).toFixed(0)}° ${offDeg > 0 ? 'ahead of' : 'behind'}`} the voltage</span>}
        </div>
        {graded && <CheckBar verdict={task.verdict} done={task.done} onCheck={() => task.check(hit, { offDeg })} miss={miss} hit={explanation} />}
      </div>}>
      <canvas ref={canvas} tabIndex={graded ? 0 : -1} role={graded ? 'slider' : 'img'}
        aria-label={graded ? 'Current arrow: drag it, or use the arrow keys, to set how far it is ahead of the voltage' : `A ${element} on a 10 volt supply, current ${deg(truth) > 0 ? 'ahead of' : 'behind'} the voltage by a quarter cycle`}
        aria-valuetext={graded ? `${offDeg.toFixed(0)} degrees ahead of the voltage` : undefined}
        style={{ width: '100%', aspectRatio: '640 / 330', display: 'block', touchAction: 'none', cursor: graded ? 'grab' : 'default' }}
        onPointerDown={(e) => {
          if (!graded) return;
          const r = e.currentTarget.getBoundingClientRect(), k = 640 / r.width;
          if (Math.hypot((e.clientX - r.left) * k - PC.x, (e.clientY - r.top) * k - PC.y) > PC.r + 30) return;
          dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); setFromPointer(e); }}
        onPointerMove={(e) => { if (dragging.current) setFromPointer(e); }}
        onPointerUp={() => { dragging.current = false; }}
        onKeyDown={(e) => {
          if (!graded) return;
          const d = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 }[e.key];
          if (d === undefined) return;
          e.preventDefault(); setOffset((o) => wrap(o + rad(d))); task.touch();
        }} />
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        slowed 200×: one cycle takes 4 s · iris: voltage · cyan: current
      </p>
    </SceneCard>
  );
}

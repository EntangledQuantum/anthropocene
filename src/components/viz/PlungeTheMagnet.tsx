import { useEffect, useRef, useState } from 'react';
import {
  CH29_COIL, coilCurrent, coilLinkage, dipoleFlux, fieldLineRadius, followStep,
} from '../../lib/physics/induction.ts';
import { C, CheckBar, Handle, Meter, SceneCard, useTask, type StageApi } from './scene.tsx';
import { Layered, begin, dotsAlong, drawGalvanometer, palette, text, useCanvasFrame, type Palette, type Px } from './induction-kit-ch29.tsx';

/**
 * A bar magnet, a 500-turn coil and a centre-zero meter. Drag the magnet
 * along the coil's axis. The magnet's field lines are drawn so that each one
 * carries the same flux, so the lines threading the coil — and the shading
 * inside it — are the flux. The needle reads I = −N (dΦ/dt) / R, computed
 * from the magnet's actual motion (it follows your hand with a short lag).
 *
 * Held still, anywhere, the needle sits at zero: that is the lesson.
 * With `id` and `target` (mA, signed), the scene grades itself on the largest
 * swing toward the target since the last start-over.
 * Physics: src/lib/physics/induction.ts (point dipole, self-inductance ignored).
 */
export interface PlungeTheMagnetProps {
  id?: string;
  prompt?: string;
  /** Where the magnet starts, m from the coil's centre (negative: left). */
  start?: number;
  /** Signed current the needle must swing past, mA. */
  target?: number;
  explanation?: string;
}

const H = 440;
const X: [number, number] = [-0.24, 0.24];
const Y: [number, number] = [-0.2, 0.12];
const FULL = 10; // mA full scale
const PHI_MAX = dipoleFlux(CH29_COIL.m, CH29_COIL.a, 0); // per turn
const LINES = 10;
const DPHI = PHI_MAX / 8; // eight lines thread the coil with the magnet at its centre
const GALV: Px = [320, 402];

export default function PlungeTheMagnet({ id, prompt, start = -0.18, target, explanation }: PlungeTheMagnetProps) {
  const graded = Boolean(id && target !== undefined);
  const task = useTask(graded ? id : undefined, 'plunge-the-magnet');
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<StageApi | null>(null);
  const [hand, setHand] = useState(start);
  const handRef = useRef(start);
  const sim = useRef({ x: start, v: 0, needle: 0, best: 0, phase: 0 });
  const col = useRef<Palette | null>(null);
  const [shown, setShown] = useState({ I: 0, link: coilLinkage(start), best: 0 });
  const lastShown = useRef(0);

  const reset = () => {
    handRef.current = start; setHand(start);
    sim.current = { x: start, v: 0, needle: 0, best: 0, phase: 0 };
    task.touch();
  };

  useCanvasFrame((dt, now) => {
    const el = canvas.current, s = api.current;
    if (!el || !s) return;
    const c = (col.current ??= palette());
    const st = sim.current;
    // advance the magnet in 1 ms steps; average the current over the frame
    const n = Math.max(1, Math.round(dt / 1e-3)), h = dt / n;
    let Iavg = 0;
    for (let k = 0; k < n; k++) {
      [st.x, st.v] = followStep(st.x, st.v, handRef.current, h);
      Iavg += coilCurrent(st.x, st.v) / n;
    }
    const mA = Iavg * 1000;
    st.needle += (mA - st.needle) * Math.min(1, dt / 0.04); // the needle's own inertia
    if (Math.abs(st.needle) < 1e-4) st.needle = 0;
    if (target !== undefined && st.needle * Math.sign(target) > st.best * Math.sign(target)) st.best = st.needle;
    st.phase += Iavg * 1000 * 9 * dt;
    draw(el, s, c, st);
    if (now - lastShown.current > 120) {
      lastShown.current = now;
      setShown({ I: st.needle, link: coilLinkage(st.x), best: st.best });
    }
  });

  const draw = (el: HTMLCanvasElement, s: StageApi, c: Palette, st: typeof sim.current) => {
    const g = begin(el, H);
    const a = CH29_COIL.a, xm = st.x;
    // field lines: r = R sin²θ, each carrying DPHI more than the last
    g.save();
    g.beginPath(); g.rect(0, 0, 640, s.sy(-0.11)); g.clip();
    g.strokeStyle = c.field; g.globalAlpha = 0.5; g.lineWidth = 1.3;
    for (let k = 1; k <= LINES; k++) {
      const R = fieldLineRadius(CH29_COIL.m, k * DPHI);
      for (const side of [1, -1]) {
        g.beginPath();
        for (let i = 0; i <= 90; i++) {
          const th = 0.03 + (i / 90) * (Math.PI - 0.06);
          const r = R * Math.sin(th) ** 2;
          const px = s.sx(xm + r * Math.cos(th)), py = s.sy(side * r * Math.sin(th));
          if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.stroke();
      }
    }
    g.restore();
    // coil: five drawn turns stand for 500; shading = flux through it
    const frac = dipoleFlux(CH29_COIL.m, a, -xm) / PHI_MAX;
    const cx = s.sx(0), ry = s.sy(0) - s.sy(a), rx = ry * 0.28;
    g.fillStyle = c.field; g.globalAlpha = 0.08 + 0.4 * frac;
    g.beginPath(); g.ellipse(cx, s.sy(0), rx + 16, ry, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    const turns = [-16, -8, 0, 8, 16];
    for (const dx of turns) {
      g.strokeStyle = c.ghost; g.lineWidth = 2;
      g.beginPath(); g.ellipse(cx + dx, s.sy(0), rx, ry, 0, Math.PI / 2, (3 * Math.PI) / 2); g.stroke();
    }
    // magnet body (drawn between the back and front halves of the turns)
    const mw = s.len(0.07), mh = s.len(0.024), mx = s.sx(xm), my = s.sy(0);
    g.fillStyle = c.surface; g.strokeStyle = c.soft; g.lineWidth = 2;
    g.fillRect(mx - mw / 2, my - mh / 2, mw, mh); g.strokeRect(mx - mw / 2, my - mh / 2, mw, mh);
    g.fillStyle = c.grid; g.fillRect(mx, my - mh / 2 + 1, mw / 2 - 1, mh - 2);
    text(g, 'S', mx - mw / 4, my + 5, c.soft, { size: 13, align: 'center', weight: 600 });
    text(g, 'N', mx + mw / 4, my + 5, c.ink, { size: 13, align: 'center', weight: 600 });
    for (const dx of turns) {
      g.strokeStyle = c.ink; g.lineWidth = 2.4;
      g.beginPath(); g.ellipse(cx + dx, s.sy(0), rx, ry, 0, -Math.PI / 2, Math.PI / 2); g.stroke();
      // current on the near half: positive current runs down the near side
      const pts: Px[] = [];
      for (let i = 0; i <= 16; i++) { const t = -Math.PI / 2 + (i / 16) * Math.PI; pts.push([cx + dx + rx * Math.cos(t), s.sy(0) + ry * Math.sin(t)]); }
      dotsAlong(g, pts, st.phase, 14, c.velocity, 2.6);
    }
    text(g, '500 turns', cx, s.sy(a) - 10, c.faint, { size: 12, align: 'center' });
    // leads to the meter
    g.strokeStyle = c.faint; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(cx - 16, s.sy(-a)); g.lineTo(cx - 16, GALV[1] - 90); g.lineTo(GALV[0] - 30, GALV[1] - 90); g.lineTo(GALV[0] - 30, GALV[1] - 84);
    g.moveTo(cx + 16, s.sy(-a)); g.lineTo(cx + 16, GALV[1] - 96); g.lineTo(GALV[0] + 30, GALV[1] - 96); g.lineTo(GALV[0] + 30, GALV[1] - 84); g.stroke();
    drawGalvanometer(g, GALV[0], GALV[1], 62, st.needle, FULL, c, { peak: target !== undefined ? st.best : undefined, target });
    text(g, 'shading: flux through the coil', 12, 20, c.field, { size: 12 });
  };

  const bestTowards = target !== undefined ? shown.best * Math.sign(target) : 0;
  const hit = graded && bestTowards >= Math.abs(target!);
  const side = (v: number) => (v >= 0 ? 'right' : 'left');
  const miss = bestTowards <= 0.05
    ? `The needle has not swung ${side(target ?? 1)} yet.`
    : `The needle swung ${Math.abs(shown.best).toFixed(1)} mA ${side(shown.best)}, short of the ${Math.abs(target ?? 0)} mA mark.`;

  return (
    <SceneCard id={graded ? id : undefined} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={reset}>Start over</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Flux, all 500 turns" value={(shown.link * 1000).toFixed(2)} unit="mWb" color={C.field} />
            <Meter label="Current" value={shown.I.toFixed(1)} unit="mA" color={C.velocity} />
          </span>
        </div>
        {graded && <CheckBar verdict={task.verdict} done={live && task.done} miss={miss} hit={explanation}
          onCheck={() => task.check(hit, { best: shown.best })} />}
      </div>}>
      <Layered x={X} y={Y} height={H} equal canvas={canvas} api={api}
        label={`A bar magnet ${Math.abs(hand * 100).toFixed(0)} cm ${hand < 0 ? 'left of' : 'right of'} the centre of a coil wired to a current meter.`}>
        {(s) => <Handle s={s} at={[hand, 0]} step={0.01} color={C.ink} r={8}
          label="The magnet: drag it along the coil's axis"
          clamp={(p) => [Math.max(-0.2, Math.min(0.2, p[0])), 0]}
          onChange={(p) => { handRef.current = p[0]; setHand(p[0]); task.touch(); }} />}
      </Layered>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Orchid lines: the magnet's field, each carrying the same flux · cyan dots: current in the coil · needle right: current one way, left: the other
      </p>
    </SceneCard>
  );
}

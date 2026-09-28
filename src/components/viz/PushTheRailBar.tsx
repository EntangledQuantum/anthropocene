import { useEffect, useRef, useState } from 'react';
import { CH29_RAILS, railState, railStep } from '../../lib/physics/induction.ts';
import { C, CheckBar, Handle, Meter, SceneCard, useTask, type StageApi } from './scene.tsx';
import { Layered, begin, dotsAlong, drawArrow, drawFieldMarks, palette, text, useCanvasFrame, type Palette, type Px } from './induction-kit-ch29.tsx';

/**
 * A metal bar across two rails in a field into the page, a bulb closing the
 * circuit. Drag the tip of your push arrow to choose a steady force, then let
 * go. The bar speeds up, the swept area (shaded: the flux) grows faster, the
 * current and the magnetic drag I L B on the bar grow, until the drag matches
 * your push and the bar cruises. Your power F v and the bulb's I²R are printed
 * side by side: they differ while the bar speeds up and agree once it cruises.
 *
 * Graded with `id` and `target` (W): the bulb must settle within 10 %.
 * Physics: railStep / railState in src/lib/physics/induction.ts.
 */
export interface PushTheRailBarProps {
  id?: string;
  prompt?: string;
  /** Bulb power to settle at, W. */
  target?: number;
  explanation?: string;
}

const H = 300;
const R = CH29_RAILS;
const X0 = 0.6, X_END = 8.0, F_MAX = 3, M_PER_N = 1;
const BULB: [number, number] = [-0.75, 0.5];
const P_GLOW = 10;

type Phase = 'idle' | 'running' | 'arrived';

export default function PushTheRailBar({ id, prompt, target = 4, explanation }: PushTheRailBarProps) {
  const task = useTask(id, 'push-the-rail-bar');
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<StageApi | null>(null);
  const col = useRef<Palette | null>(null);
  const [F, setF] = useState(0.8);
  const FRef = useRef(0.8);
  const sim = useRef({ phase: 'idle' as Phase, x: X0, v: 0, t: 0, phaseDots: 0, arrivedP: 0, arrivedV: 0 });
  const [phase, setPhase] = useState<Phase>('idle');
  const [shown, setShown] = useState({ v: 0, Pin: 0, Pout: 0, drag: 0, t: 0 });
  const lastShown = useRef(0);

  const go = () => { sim.current = { ...sim.current, phase: 'running', x: X0, v: 0, t: 0 }; setPhase('running'); task.touch(); };
  const reset = () => { sim.current = { phase: 'idle', x: X0, v: 0, t: 0, phaseDots: 0, arrivedP: 0, arrivedV: 0 }; setPhase('idle'); task.touch(); };

  useCanvasFrame((dt, now) => {
    const el = canvas.current, s = api.current;
    if (!el || !s) return;
    const c = (col.current ??= palette());
    const st = sim.current;
    if (st.phase === 'running') {
      const v1 = railStep(st.v, FRef.current, dt);
      st.x += ((st.v + v1) / 2) * dt; st.v = v1; st.t += dt;
      if (st.x >= X_END) {
        st.x = X_END; st.arrivedP = railState(st.v, FRef.current).Pelec; st.arrivedV = st.v; st.v = 0;
        st.phase = 'arrived'; setPhase('arrived');
      }
    }
    const rs = railState(st.v, FRef.current);
    st.phaseDots += rs.I * 30 * dt;
    draw(el, s, c, st, rs);
    if (now - lastShown.current > 120) {
      lastShown.current = now;
      const arrived = st.phase === 'arrived';
      setShown({
        v: arrived ? st.arrivedV : st.v,
        Pin: arrived ? FRef.current * st.arrivedV : rs.Pmech,
        Pout: arrived ? st.arrivedP : rs.Pelec,
        drag: rs.drag, t: st.t,
      });
    }
  });

  const draw = (el: HTMLCanvasElement, s: StageApi, c: Palette, st: typeof sim.current, rs: ReturnType<typeof railState>) => {
    const g = begin(el, H);
    drawFieldMarks(g, s.sx(0), s.sy(1.45), s.sx(8.5), s.sy(-0.45), 36, true, c.field, 0.4);
    text(g, `B = ${R.B} T into the page`, s.sx(8.5), s.sy(1.45) - 6, c.field, { size: 13, align: 'right', weight: 600 });
    // flux: the area the circuit encloses
    g.fillStyle = c.field; g.globalAlpha = 0.2;
    g.fillRect(s.sx(0), s.sy(1), s.sx(st.x) - s.sx(0), s.sy(0) - s.sy(1)); g.globalAlpha = 1;
    // rails, wires, end stop
    g.strokeStyle = c.soft; g.lineWidth = 3;
    g.beginPath(); g.moveTo(s.sx(0), s.sy(0)); g.lineTo(s.sx(8.4), s.sy(0)); g.moveTo(s.sx(0), s.sy(1)); g.lineTo(s.sx(8.4), s.sy(1)); g.stroke();
    g.strokeStyle = c.faint; g.lineWidth = 2;
    g.beginPath(); g.moveTo(s.sx(0), s.sy(1)); g.lineTo(s.sx(BULB[0]), s.sy(1)); g.lineTo(s.sx(BULB[0]), s.sy(0)); g.lineTo(s.sx(0), s.sy(0)); g.stroke();
    g.fillStyle = c.rule; g.fillRect(s.sx(X_END) + 4, s.sy(1.15), 6, s.sy(-0.15) - s.sy(1.15));
    // bulb
    const bx = s.sx(BULB[0]), by = s.sy(BULB[1]), glow = Math.sqrt(Math.min(1, rs.Pelec / P_GLOW));
    if (glow > 0.01) {
      const gr = g.createRadialGradient(bx, by, 0, bx, by, 16 + 40 * glow);
      gr.addColorStop(0, c.energy); gr.addColorStop(1, 'transparent');
      g.globalAlpha = 0.85 * glow; g.fillStyle = gr; g.beginPath(); g.arc(bx, by, 16 + 40 * glow, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    }
    g.fillStyle = c.surface; g.strokeStyle = glow > 0.01 ? c.energy : c.faint; g.lineWidth = 2;
    g.beginPath(); g.arc(bx, by, 15, 0, Math.PI * 2); g.fill(); g.stroke();
    text(g, `${R.R} Ω`, bx, by + 32, c.faint, { size: 12, align: 'center' });
    // current dots, counterclockwise: up the bar, left along the top, down the bulb, right along the bottom
    const loop: Px[] = ([[st.x, 0], [st.x, 1], [0, 1], [BULB[0], 1], [BULB[0], 0], [0, 0], [st.x, 0]] as Px[]).map(([x, y]) => [s.sx(x), s.sy(y)] as Px);
    dotsAlong(g, loop, st.phaseDots, 22, c.velocity, 3);
    // the bar
    g.strokeStyle = c.ink; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(s.sx(st.x), s.sy(-0.15)); g.lineTo(s.sx(st.x), s.sy(1.15)); g.stroke();
    // forces at mid-bar: your push right, the drag left
    const ym = s.sy(0.5), F = FRef.current;
    drawArrow(g, [s.sx(st.x) + 5, ym], [s.sx(st.x + F * M_PER_N), ym], c.force, 3.5);
    text(g, `your push ${F.toFixed(2)} N`, s.sx(st.x) + 10, ym - 10, c.force, { size: 13, weight: 600, halo: c.surface });
    if (rs.drag > 0.02) {
      drawArrow(g, [s.sx(st.x) - 5, ym], [s.sx(st.x - rs.drag * M_PER_N), ym], c.force, 3, [6, 4]);
      text(g, `drag I L B ${rs.drag.toFixed(2)} N`, s.sx(st.x) - 10, ym + 22, c.force, { size: 13, align: 'right', weight: 600, halo: c.surface });
    }
    g.strokeStyle = c.faint; g.lineWidth = 1;
    for (let m = 0; m <= 8; m += 2) text(g, `${m} m`, s.sx(m), s.sy(-0.45) + 16, c.faint, { size: 11, align: 'center', mono: true });
  };

  const settledP = phase === 'arrived' ? shown.Pout : phase === 'running' && shown.t > 1.6 ? shown.Pout : null;
  const hit = settledP !== null && Math.abs(settledP - target) / target <= 0.1;
  const miss = settledP === null
    ? (phase === 'idle' ? 'The bar is still at rest, so the bulb is dark. Let go first.' : 'The bar is still speeding up. Check again once it cruises.')
    : `The bulb settled at ${settledP.toFixed(2)} W under your ${F.toFixed(2)} N push. The mark is ${target} W.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={go} disabled={phase === 'running'}>Let go</button>
          <button type="button" className="anth-btn" onClick={reset}>Start over</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Speed" value={shown.v.toFixed(2)} unit="m/s" color={C.velocity} />
            <Meter label="Your power F v" value={shown.Pin.toFixed(2)} unit="W" color={C.force} />
            <Meter label={`Bulb I²R, mark ${target} W`} value={shown.Pout.toFixed(2)} unit="W" color={C.energy} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={live && task.done} miss={miss} hit={explanation}
          onCheck={() => task.check(hit, { F, P: settledP })} />}
      </div>}>
      <Layered x={[-1.5, 8.7]} y={[-0.75, 1.75]} height={H} canvas={canvas} api={api}
        label={`A bar on rails 1 metre apart in a field into the page, pushed with ${F.toFixed(2)} newtons; a 1 ohm bulb closes the circuit.`}>
        {(s) => phase === 'idle' ? <Handle s={s} at={[X0 + F * M_PER_N, 0.5]} step={0.05} color={C.force} r={8}
          label="Your push: drag the tip of the arrow"
          clamp={(p) => [Math.max(X0, Math.min(X0 + F_MAX * M_PER_N, p[0])), 0.5]}
          onChange={(p) => { const f = Math.round(((p[0] - X0) / M_PER_N) * 100) / 100; FRef.current = f; setF(f); task.touch(); }} /> : null}
      </Layered>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        {R.m * 1000} g bar, rails {R.L} m apart · orchid shading: the flux the circuit encloses · cyan dots: current · amber: forces on the bar
      </p>
    </SceneCard>
  );
}

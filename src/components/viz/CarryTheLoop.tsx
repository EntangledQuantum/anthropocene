import { useEffect, useRef, useState } from 'react';
import { CH29_EDGE, edgeCurrent, edgeFill, edgeFlux, followStep, loopRect, overlapArea } from '../../lib/physics/induction.ts';
import { C, CheckBar, Handle, Meter, SceneCard, useTask, type StageApi } from './scene.tsx';
import { Layered, begin, dotsAlong, drawFieldMarks, drawGalvanometer, palette, text, useCanvasFrame, type Palette, type Px } from './induction-kit-ch29.tsx';

/**
 * A square wire loop on leads to a meter, and a patch of uniform field into
 * the page. Drag the loop anywhere. The orchid shading is the part of the
 * loop the field threads: the flux. The needle reads −(dΦ/dt)/R from the
 * loop's actual motion, so it kicks only while an edge of the loop crosses an
 * edge of the field — never while the loop is carried about deep inside it.
 *
 * Graded with `id`: carry the loop `distance` metres inside the field with the
 * needle still. "Quiet travel" counts motion while at least a quarter of the
 * loop is in the field and the needle stays under 0.3 mA; a kick resets it.
 * Physics: edgeFlux / edgeCurrent in src/lib/physics/induction.ts.
 */
export interface CarryTheLoopProps {
  id?: string;
  prompt?: string;
  /** Quiet travel needed, m. */
  distance?: number;
  explanation?: string;
}

const H = 340;
const X: [number, number] = [-0.47, 0.7];
const Y: [number, number] = [-0.34, 0.26];
const START: [number, number] = [-0.28, 0.08];
const QUIET = 0.3; // mA
const FULL = 10;
const GALV: Px = [96, 318];

export default function CarryTheLoop({ id, prompt, distance = 0.3, explanation }: CarryTheLoopProps) {
  const task = useTask(id, 'carry-the-loop');
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<StageApi | null>(null);
  const col = useRef<Palette | null>(null);
  const [hand, setHand] = useState<[number, number]>(START);
  const handRef = useRef<[number, number]>(START);
  const sim = useRef({ x: START[0], y: START[1], vx: 0, vy: 0, needle: 0, phase: 0, quiet: 0, kick: 0, kicking: false });
  const [shown, setShown] = useState({ I: 0, flux: 0, quiet: 0, kick: 0 });
  const lastShown = useRef(0);

  const reset = () => {
    handRef.current = START; setHand(START);
    sim.current = { x: START[0], y: START[1], vx: 0, vy: 0, needle: 0, phase: 0, quiet: 0, kick: 0, kicking: false };
    task.touch();
  };

  useCanvasFrame((dt, now) => {
    const el = canvas.current, s = api.current;
    if (!el || !s) return;
    const c = (col.current ??= palette());
    const st = sim.current;
    const n = Math.max(1, Math.round(dt / 1e-3)), h = dt / n;
    let Iavg = 0, moved = 0;
    for (let k = 0; k < n; k++) {
      const p0: [number, number] = [st.x, st.y];
      [st.x, st.vx] = followStep(st.x, st.vx, handRef.current[0], h);
      [st.y, st.vy] = followStep(st.y, st.vy, handRef.current[1], h);
      Iavg += edgeCurrent(p0, [st.x, st.y], h) / n;
      moved += Math.hypot(st.x - p0[0], st.y - p0[1]);
    }
    const mA = Iavg * 1000;
    st.needle += (mA - st.needle) * Math.min(1, dt / 0.04);
    if (Math.abs(st.needle) < 1e-4) st.needle = 0;
    if (Math.abs(st.needle) >= QUIET) {
      if (!st.kicking) st.kick = 0;
      st.kicking = true; st.quiet = 0; st.kick = Math.max(st.kick, Math.abs(st.needle));
    } else {
      st.kicking = false;
      if (edgeFill(st.x, st.y) >= 0.25) st.quiet += moved;
    }
    st.phase += Iavg * 1000 * 9 * dt;
    draw(el, s, c, st);
    if (now - lastShown.current > 120) {
      lastShown.current = now;
      setShown({ I: st.needle, flux: edgeFlux(st.x, st.y), quiet: st.quiet, kick: st.kick });
    }
  });

  const draw = (el: HTMLCanvasElement, s: StageApi, c: Palette, st: typeof sim.current) => {
    const g = begin(el, H);
    const f = CH29_EDGE.region;
    g.strokeStyle = c.field; g.globalAlpha = 0.5; g.lineWidth = 1.2; g.setLineDash([4, 4]);
    g.strokeRect(s.sx(f.x0), s.sy(f.y1), s.len(f.x1 - f.x0), s.sy(f.y0) - s.sy(f.y1));
    g.setLineDash([]); g.globalAlpha = 1;
    drawFieldMarks(g, s.sx(f.x0), s.sy(f.y1), s.sx(f.x1), s.sy(f.y0), s.len(0.05), true, c.field, 0.5);
    text(g, `B = ${CH29_EDGE.B} T into the page`, s.sx(f.x1), s.sy(f.y1) - 8, c.field, { size: 13, align: 'right', weight: 600 });
    // flux: the threaded part of the loop
    const L = loopRect(st.x, st.y, CH29_EDGE.side);
    if (overlapArea(L, f) > 0) {
      const x0 = Math.max(L.x0, f.x0), x1 = Math.min(L.x1, f.x1), y0 = Math.max(L.y0, f.y0), y1 = Math.min(L.y1, f.y1);
      g.fillStyle = c.field; g.globalAlpha = 0.32;
      g.fillRect(s.sx(x0), s.sy(y1), s.len(x1 - x0), s.sy(y0) - s.sy(y1));
      g.globalAlpha = 1;
    }
    // leads from the loop's lower-left corner to the meter
    g.strokeStyle = c.faint; g.lineWidth = 1.4;
    const corner: Px = [s.sx(L.x0), s.sy(L.y0)];
    g.beginPath(); g.moveTo(corner[0], corner[1]); g.lineTo(GALV[0] - 18, GALV[1] - 66);
    g.moveTo(corner[0] + 4, corner[1]); g.lineTo(GALV[0] + 18, GALV[1] - 66); g.stroke();
    // the loop, counterclockwise in the world
    const ring: Px[] = [[L.x0, L.y0], [L.x1, L.y0], [L.x1, L.y1], [L.x0, L.y1], [L.x0, L.y0]].map(([x, y]) => [s.sx(x), s.sy(y)] as Px);
    g.strokeStyle = c.ink; g.lineWidth = 3; g.lineJoin = 'round';
    g.beginPath(); ring.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    dotsAlong(g, ring, st.phase, 16, c.velocity, 3);
    drawGalvanometer(g, GALV[0], GALV[1], 50, st.needle, FULL, c);
  };

  const hit = shown.quiet >= distance;
  const cm = (m: number) => (m * 100).toFixed(0);
  const miss = shown.kick > 0
    ? `The needle last kicked to ${shown.kick.toFixed(1)} mA. Since then the loop has moved ${cm(shown.quiet)} cm in the field with the needle still, of ${cm(distance)} cm.`
    : `The loop has moved ${cm(shown.quiet)} cm in the field, of ${cm(distance)} cm.`;

  return (
    <SceneCard id={id} prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={reset}>Start over</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 22 }}>
            <Meter label="Flux through the loop" value={(Math.abs(shown.flux) * 1000).toFixed(2)} unit="mWb" color={C.field} />
            <Meter label="Quiet travel in the field" value={cm(shown.quiet)} unit="cm" />
            <Meter label="Current" value={shown.I.toFixed(1)} unit="mA" color={C.velocity} />
          </span>
        </div>
        {id && <CheckBar verdict={task.verdict} done={live && task.done} miss={miss} hit={explanation}
          onCheck={() => task.check(hit, { quiet: shown.quiet })} />}
      </div>}>
      <Layered x={X} y={Y} height={H} equal canvas={canvas} api={api}
        label={`A square wire loop at ${cm(hand[0])}, ${cm(hand[1])} cm beside a field into the page that fills a patch 60 cm wide.`}>
        {(s) => <Handle s={s} at={hand} step={0.02} color={C.ink} r={8}
          label="The loop: drag it anywhere"
          clamp={(p) => [Math.max(-0.38, Math.min(0.62, p[0])), Math.max(-0.24, Math.min(0.18, p[1]))]}
          onChange={(p) => { const q: [number, number] = [p[0], p[1]]; handRef.current = q; setHand(q); task.touch(); }} />}
      </Layered>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        16 cm loop, 8 Ω with its meter · orchid shading: the flux through the loop · cyan dots: current
      </p>
    </SceneCard>
  );
}

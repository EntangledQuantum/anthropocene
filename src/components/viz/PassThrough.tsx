import { useEffect, useMemo, useRef, useState } from 'react';
import { createRope, layPulses, ropeDt, ropeEnergy, ropeHeight, stepRope, type Pulse } from '../../lib/physics/waves.ts';
import { C, Meter, SceneCard, Stage, type StageApi } from './scene.tsx';

/**
 * Two humps on one rope, running at each other. Play it, or drag the clock
 * and stop anywhere. The solid line is the rope; the dashed lines are each
 * hump on its own, and the rope is always exactly their sum.
 *
 * With an up-hump and a down-hump of the same shape, there is one instant
 * when the rope is dead flat. The energy bar says what the picture cannot:
 * nothing was lost. All of it is in the rope's motion at that instant.
 *
 * Ungraded: the payoff of the lesson's opening bet. The rope is the leapfrog
 * rope from waves.ts, recorded once and played back; the energies are
 * `ropeEnergy` on the same run.
 */
export interface PassThroughProps {
  prompt?: string;
  pulses: Pulse[];
  /** Tension, N, and mass per length, kg/m. Their ratio must give the pulses' speed. */
  tension?: number;
  mu?: number;
  /** Seconds of motion recorded. */
  span?: number;
}

const X0 = -4, X1 = 4, CELLS = 400, PLAY = 0.5, SHOW: [number, number] = [-3, 3];

export default function PassThrough({ prompt, pulses, tension = 4, mu = 1, span = 2 }: PassThroughProps) {
  const run = useMemo(() => {
    const r = createRope({ length: X1 - X0, cells: CELLS, tension, mu });
    layPulses(r, pulses, X0);
    const steps = Math.round(span / ropeDt(r));
    const frames: Float64Array[] = [Float64Array.from(r.y)];
    const energy = [ropeEnergy(r)];
    for (let k = 0; k < steps; k++) { stepRope(r); frames.push(Float64Array.from(r.y)); energy.push(ropeEnergy(r)); }
    return { frames, energy, dt: ropeDt(r), dx: r.dx, E0: energy[0].total };
  }, [pulses, tension, mu, span]);
  const last = run.frames.length - 1;

  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const kRef = useRef(0);
  const api = useRef<StageApi | null>(null);
  const els = useRef<{ rope?: SVGPolylineElement | null; motion?: SVGRectElement | null; stretch?: SVGRectElement | null; slider?: HTMLInputElement | null; comps: (SVGPolylineElement | null)[] }>({ comps: [] });

  const ropePts = (s: StageApi, f: number) => {
    const y = run.frames[f], out: string[] = [];
    for (let i = 0; i < y.length; i++) {
      const x = X0 + i * run.dx;
      if (x >= SHOW[0] - 1e-9 && x <= SHOW[1] + 1e-9) out.push(`${s.sx(x).toFixed(1)},${s.sy(y[i]).toFixed(1)}`);
    }
    return out.join(' ');
  };
  const compPts = (s: StageApi, p: Pulse, t: number) => {
    const out: string[] = [];
    for (let i = 0; i <= 200; i++) { const x = SHOW[0] + ((SHOW[1] - SHOW[0]) * i) / 200; out.push(`${s.sx(x).toFixed(1)},${s.sy(ropeHeight([p], x, t)).toFixed(1)}`); }
    return out.join(' ');
  };
  const BAR = 360;
  const draw = (f: number) => {
    const s = api.current, e = els.current;
    if (!s) return;
    e.rope?.setAttribute('points', ropePts(s, f));
    pulses.forEach((p, i) => e.comps[i]?.setAttribute('points', compPts(s, p, f * run.dt)));
    const en = run.energy[f];
    const wm = (Math.max(0, en.motion) / run.E0) * BAR, ws = (Math.max(0, en.stretch) / run.E0) * BAR;
    e.motion?.setAttribute('width', wm.toFixed(1));
    e.stretch?.setAttribute('x', (140 + wm).toFixed(1));
    e.stretch?.setAttribute('width', ws.toFixed(1));
    if (e.slider) e.slider.value = String(f);
  };

  useEffect(() => { kRef.current = k; draw(k); });

  useEffect(() => {
    if (!playing) return;
    let raf = 0, prev = performance.now(), lastShown = 0, acc = 0;
    if (kRef.current >= last) kRef.current = 0;
    const frame = (now: number) => {
      acc += ((now - prev) / 1000) * PLAY;
      prev = now;
      const n = Math.floor(acc / run.dt);
      acc -= n * run.dt;
      kRef.current = Math.min(last, kRef.current + n);
      draw(kRef.current);
      if (now - lastShown > 120) { lastShown = now; setK(kRef.current); }
      if (kRef.current < last) raf = requestAnimationFrame(frame);
      else { setK(last); setPlaying(false); }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const en = run.energy[k];
  const tallest = Math.max(...Array.from(run.frames[k], Math.abs));

  return (
    <SceneCard prompt={prompt}
      footer={<div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="anth-btn" onClick={() => setPlaying(true)} disabled={playing}>{playing ? 'Playing…' : 'Play'}</button>
          <label style={{ flex: '1 1 240px' }}>
            <span className="hud-label">Clock: drag to any instant</span>
            <input ref={(el) => { els.current.slider = el; }} type="range" className="anth-slider" min={0} max={last} step={1} defaultValue={0}
              aria-label="Time" onChange={(e) => { setPlaying(false); setK(+e.target.value); }} />
          </label>
          <span style={{ display: 'flex', gap: 20 }}>
            <Meter label="Time" value={(k * run.dt).toFixed(2)} unit="s" />
            <Meter label="Tallest point" value={(tallest * 100).toFixed(1)} unit="cm" color={C.position} />
          </span>
        </div>
      </div>}>
      <Stage x={SHOW} y={[-0.75, 0.75]} height={250} equal
        label={`Two pulses on a rope at ${(k * run.dt).toFixed(2)} seconds. Motion energy ${en.motion.toFixed(3)} joules, stretch energy ${en.stretch.toFixed(3)} joules.`}>
        {(s) => {
          api.current = s;
          return <>
            {pulses.map((p, i) => (
              <polyline key={i} ref={(el) => { els.current.comps[i] = el; }} points={compPts(s, p, 0)} fill="none" stroke={C.faint} strokeWidth={1.5} strokeDasharray="5 5" />
            ))}
            <polyline ref={(el) => { els.current.rope = el; }} points={ropePts(s, 0)} fill="none" stroke={C.ink} strokeWidth={3} strokeLinejoin="round" />
            <line x1={s.sx(-2.8)} x2={s.sx(-1.8)} y1={s.sy(-0.62)} y2={s.sy(-0.62)} stroke={C.faint} strokeWidth={1.2} />
            <text x={s.sx(-2.3)} y={s.sy(-0.62) - 6} textAnchor="middle" fontSize={12} fill={C.faint}>1 m</text>
          </>;
        }}
      </Stage>
      <svg viewBox="0 0 640 58" style={{ width: '100%', display: 'block' }} role="img"
        aria-label={`Energy: ${(100 * Math.max(0, en.motion) / run.E0).toFixed(0)} percent in motion, ${(100 * Math.max(0, en.stretch) / run.E0).toFixed(0)} percent in stretch.`}>
        <text x={130} y={24} textAnchor="end" fontSize={13} fill={C.soft}>Energy</text>
        <rect x={140} y={10} width={BAR} height={20} fill="none" stroke={C.grid} />
        <rect ref={(el) => { els.current.motion = el; }} x={140} y={10} width={0} height={20} fill={C.energy} />
        <rect ref={(el) => { els.current.stretch = el; }} x={140} y={10} width={0} height={20} fill={C.energy} opacity={0.4} />
        <text x={508} y={24} fontSize={13} fill={C.soft} fontFamily="var(--font-mono)">{run.E0.toFixed(3)} J</text>
        <rect x={140} y={40} width={12} height={10} fill={C.energy} />
        <text x={158} y={49} fontSize={12} fill={C.faint}>in motion</text>
        <rect x={240} y={40} width={12} height={10} fill={C.energy} opacity={0.4} />
        <text x={258} y={49} fontSize={12} fill={C.faint}>in stretch</text>
      </svg>
      <p className="hud-label" style={{ margin: '6px 0 0' }}>
        Solid: the rope · dashed: each hump on its own · played at half speed
      </p>
    </SceneCard>
  );
}
